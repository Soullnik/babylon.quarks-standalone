import {
    ColorGenerator,
    ColorRange,
    ConstantColor,
    ConstantValue,
    FunctionColorGenerator,
    FunctionValueGenerator,
    Gradient,
    IntervalValue,
    PiecewiseBezier,
    RandomColor,
    ValueGenerator,
    Vector4,
} from 'quarks.core';

export type AnyValueGenerator = ValueGenerator | FunctionValueGenerator;
export type AnyColorGenerator = ColorGenerator | FunctionColorGenerator;

export type ParamWgslType = 'f32' | 'vec2f' | 'vec4f';

/**
 * One field of the generated SimParams struct. `write` is called every frame so
 * live edits to generator values (editor tweaks) take effect without a shader
 * rebuild.
 */
export interface ParamField {
    name: string;
    wgslType: ParamWgslType;
    write: (floats: Float32Array, offset: number) => void;
}

/** Number of texels per baked curve row. */
export const CURVE_RESOLUTION = 128;

/**
 * Collects uniform fields, baked curve rows and per-particle random ids while
 * generators and behaviors are translated to WGSL expressions. Pure TS — no
 * engine objects — so codegen is unit-testable without a GPU.
 */
export class GpuSystemEncoder {
    readonly fields: ParamField[] = [];
    /** Each entry bakes into one RGBA row of the curve atlas. */
    readonly curves: Array<() => Float32Array> = [];
    /** Human-readable feature tags, concatenated into the pipeline signature. */
    readonly signatureParts: string[] = [];
    private randCounter = 0;
    private fieldCounter = 0;

    /** Claims a compile-time id for a per-particle spawn random. */
    allocRand(): number {
        return this.randCounter++;
    }

    addField(label: string, wgslType: ParamWgslType, write: ParamField['write']): string {
        const name = `g${this.fieldCounter++}_${sanitize(label)}`;
        this.fields.push({name, wgslType, write});
        return `params.${name}`;
    }

    addCurve(bake: () => Float32Array): number {
        this.curves.push(bake);
        return this.curves.length - 1;
    }

    static canEncodeValue(gen: AnyValueGenerator): boolean {
        return gen instanceof ConstantValue || gen instanceof IntervalValue || gen instanceof PiecewiseBezier;
    }

    static canEncodeColor(gen: AnyColorGenerator): boolean {
        return (
            gen instanceof ConstantColor ||
            gen instanceof Gradient ||
            gen instanceof ColorRange ||
            gen instanceof RandomColor
        );
    }

    /**
     * Returns a WGSL scalar expression for the generator. `t` is the WGSL
     * expression for the sample position (life ratio or emission time ratio);
     * it is only used by curve generators.
     */
    encodeValue(gen: AnyValueGenerator, label: string, t: string): string {
        if (gen instanceof ConstantValue) {
            this.signatureParts.push(`${label}:const`);
            const ref = this.addField(label, 'f32', (floats, o) => {
                floats[o] = gen.value;
            });
            return ref;
        }
        if (gen instanceof IntervalValue) {
            this.signatureParts.push(`${label}:interval`);
            const randId = this.allocRand();
            const ref = this.addField(label, 'vec2f', (floats, o) => {
                floats[o] = gen.a;
                floats[o + 1] = gen.b;
            });
            return `mix(${ref}.x, ${ref}.y, prand(seed, ${randId}u))`;
        }
        if (gen instanceof PiecewiseBezier) {
            this.signatureParts.push(`${label}:curve`);
            const row = this.addCurve(() => bakeValueCurve(gen));
            return `sampleCurve(${row}u, ${t}).x`;
        }
        throw new Error(`GPU encoder: unsupported value generator "${(gen as any)?.constructor?.name}" for ${label}`);
    }

    /** Returns a WGSL vec4<f32> expression for the color generator. */
    encodeColor(gen: AnyColorGenerator, label: string, t: string): string {
        if (gen instanceof ConstantColor) {
            this.signatureParts.push(`${label}:constColor`);
            const ref = this.addField(label, 'vec4f', (floats, o) => {
                floats[o] = gen.color.x;
                floats[o + 1] = gen.color.y;
                floats[o + 2] = gen.color.z;
                floats[o + 3] = gen.color.w;
            });
            return ref;
        }
        if (gen instanceof Gradient) {
            this.signatureParts.push(`${label}:gradient`);
            const row = this.addCurve(() => bakeGradient(gen));
            return `sampleCurve(${row}u, ${t})`;
        }
        if (gen instanceof ColorRange || gen instanceof RandomColor) {
            // Both lerp between two colors by a per-particle random. (CPU
            // RandomColor re-rolls every call; sampled once at spawn it is
            // equivalent, and per-frame flicker is not reproduced.)
            this.signatureParts.push(`${label}:colorRange`);
            const randId = this.allocRand();
            const refA = this.addField(`${label}A`, 'vec4f', (floats, o) => {
                floats[o] = gen.a.x;
                floats[o + 1] = gen.a.y;
                floats[o + 2] = gen.a.z;
                floats[o + 3] = gen.a.w;
            });
            const refB = this.addField(`${label}B`, 'vec4f', (floats, o) => {
                floats[o] = gen.b.x;
                floats[o + 1] = gen.b.y;
                floats[o + 2] = gen.b.z;
                floats[o + 3] = gen.b.w;
            });
            return `mix(${refA}, ${refB}, prand(seed, ${randId}u))`;
        }
        throw new Error(`GPU encoder: unsupported color generator "${(gen as any)?.constructor?.name}" for ${label}`);
    }
}

function sanitize(label: string): string {
    return label.replace(/[^a-zA-Z0-9]/g, '_');
}

// Degenerate key layouts (e.g. quarks.core's default Gradient has both color
// keys at position 0) make genValue/genColor return NaN at some t; carry the
// nearest finite neighbour instead of baking NaN into the atlas.
function writeFinite(data: Float32Array, index: number, value: number): void {
    data[index] = Number.isFinite(value) ? value : index >= 4 ? data[index - 4] : 0;
}

/** Bakes a scalar curve into CURVE_RESOLUTION RGBA texels (value in .x). */
export function bakeValueCurve(gen: FunctionValueGenerator): Float32Array {
    const data = new Float32Array(CURVE_RESOLUTION * 4);
    for (let i = 0; i < CURVE_RESOLUTION; i++) {
        const t = i / (CURVE_RESOLUTION - 1);
        writeFinite(data, i * 4, gen.genValue([], t));
    }
    return data;
}

const bakeColor = new Vector4();

/** Bakes a color gradient into CURVE_RESOLUTION RGBA texels. */
export function bakeGradient(gen: FunctionColorGenerator): Float32Array {
    const data = new Float32Array(CURVE_RESOLUTION * 4);
    for (let i = 0; i < CURVE_RESOLUTION; i++) {
        const t = i / (CURVE_RESOLUTION - 1);
        gen.genColor([], bakeColor, t);
        writeFinite(data, i * 4, bakeColor.x);
        writeFinite(data, i * 4 + 1, bakeColor.y);
        writeFinite(data, i * 4 + 2, bakeColor.z);
        writeFinite(data, i * 4 + 3, bakeColor.w);
    }
    return data;
}

/** Size in floats and required alignment in floats for each field type. */
const FIELD_SIZE: Record<ParamWgslType, {size: number; align: number}> = {
    f32: {size: 1, align: 1},
    vec2f: {size: 2, align: 2},
    vec4f: {size: 4, align: 4},
};

export interface ParamsLayout {
    /** float offset of each generated field, in field order (after the fixed head) */
    offsets: number[];
    /** total struct size in floats, 16-byte aligned */
    totalFloats: number;
}

/** Fixed head of SimParams: emitterMatrix + normalMatrix + timing + counts + scaleV. */
export const PARAMS_HEAD_FLOATS = 16 + 16 + 4 + 4 + 4;

/** Storage-buffer (std430-like) layout for the generated tail of SimParams. */
export function computeParamsLayout(fields: ParamField[]): ParamsLayout {
    let cursor = PARAMS_HEAD_FLOATS;
    const offsets: number[] = [];
    for (const field of fields) {
        const {size, align} = FIELD_SIZE[field.wgslType];
        cursor = Math.ceil(cursor / align) * align;
        offsets.push(cursor);
        cursor += size;
    }
    // struct size rounds up to its largest member alignment; head has mat4 -> 4 floats
    const totalFloats = Math.ceil(cursor / 4) * 4;
    return {offsets, totalFloats};
}

const WGSL_TYPE: Record<ParamWgslType, string> = {
    f32: 'f32',
    vec2f: 'vec2<f32>',
    vec4f: 'vec4<f32>',
};

/** Emits the full SimParams WGSL struct (fixed head + generated fields). */
export function buildParamsStructWgsl(fields: ParamField[]): string {
    const lines = [
        'struct SimParams {',
        '    emitterMatrix : mat4x4<f32>,',
        '    normalMatrix : mat4x4<f32>,',
        '    timing : vec4<f32>,', // x delta, y timeRatio, z simTime, w unused
        '    counts : vec4<u32>,', // x spawnCount, y spawnSeed, z instanceOffset, w flags
        '    scaleV : vec4<f32>,', // xyz |emitter scale|, w average scale
    ];
    for (const field of fields) {
        lines.push(`    ${field.name} : ${WGSL_TYPE[field.wgslType]},`);
    }
    lines.push('};');
    return lines.join('\n');
}

/** Writes all generated fields into the params CPU mirror. Called every frame. */
export function writeParamFields(fields: ParamField[], layout: ParamsLayout, floats: Float32Array): void {
    for (let i = 0; i < fields.length; i++) {
        fields[i].write(floats, layout.offsets[i]);
    }
}
