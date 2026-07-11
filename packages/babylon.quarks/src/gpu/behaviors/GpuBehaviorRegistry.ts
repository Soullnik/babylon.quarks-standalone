import {ApplyForce, Behavior, ColorOverLife, GravityForce, SizeOverLife, Vector3Function} from 'quarks.core';
import {GpuSystemEncoder} from '../generators/GeneratorEncoder';

/**
 * Translates one behavior into WGSL update-kernel statements. Snippets run per
 * live particle, in `system.behaviors` order, with these locals in scope:
 *   - `position`, `velocity`: var vec3<f32> (simulation space)
 *   - `size: var f32`, `color: var vec4<f32>`, `rotation: var f32`, `uvTile: var f32`
 *   - `speedModifier: var f32`
 *   - `startSize`, `startSpeed`: f32; `startColor`: vec4<f32>
 *   - `age`, `life`, `tLife` (= clamp(age/life, 0, 1)), `delta`: f32
 *   - `seed: u32` for `prand(seed, id)`
 *
 * Behavior parameters are written into the params buffer every frame by the
 * codec's field writers, which also reproduces `frameUpdate()` semantics
 * (e.g. ApplyForce re-evaluates its magnitude generator each frame).
 */
export interface GpuBehaviorCodec {
    type: string;
    /** Returns a human-readable reason when this behavior config can't run on GPU. */
    isSupported(behavior: Behavior): string | null;
    encode(behavior: Behavior, enc: GpuSystemEncoder): string;
}

const applyForceCodec: GpuBehaviorCodec = {
    type: 'ApplyForce',
    isSupported: () => null,
    encode(behavior, enc) {
        const b = behavior as ApplyForce;
        enc.signatureParts.push('b:ApplyForce');
        const p = enc.addField('applyForce', 'vec4f', (floats, o) => {
            floats[o] = b.direction.x;
            floats[o + 1] = b.direction.y;
            floats[o + 2] = b.direction.z;
            // frameUpdate() semantics: the magnitude generator is re-evaluated
            // once per frame at the system level.
            floats[o + 3] = b.magnitude.genValue(b.memory as any);
        });
        return `    velocity += ${p}.xyz * (${p}.w * delta);`;
    },
};

const gravityForceCodec: GpuBehaviorCodec = {
    type: 'GravityForce',
    isSupported: () => null,
    encode(behavior, enc) {
        const b = behavior as GravityForce;
        enc.signatureParts.push('b:GravityForce');
        const p = enc.addField('gravity', 'vec4f', (floats, o) => {
            floats[o] = b.center.x;
            floats[o + 1] = b.center.y;
            floats[o + 2] = b.center.z;
            floats[o + 3] = b.magnitude;
        });
        return `
    {
        let toCenter = ${p}.xyz - position;
        let distSq = max(dot(toCenter, toCenter), 1e-12);
        velocity += toCenter * inverseSqrt(distSq) * ((${p}.w / distSq) * delta);
    }`;
    },
};

const sizeOverLifeCodec: GpuBehaviorCodec = {
    type: 'SizeOverLife',
    isSupported(behavior) {
        const b = behavior as SizeOverLife;
        if (b.size instanceof Vector3Function) {
            return 'SizeOverLife with per-axis Vector3Function is not GPU-supported yet';
        }
        if (!GpuSystemEncoder.canEncodeValue(b.size as any)) {
            return `SizeOverLife size generator "${(b.size as any)?.type}" is not GPU-encodable`;
        }
        return null;
    },
    encode(behavior, enc) {
        const b = behavior as SizeOverLife;
        enc.signatureParts.push('b:SizeOverLife');
        const expr = enc.encodeValue(b.size as any, 'sizeOverLife', 'tLife');
        return `    size = startSize * ${expr};`;
    },
};

const colorOverLifeCodec: GpuBehaviorCodec = {
    type: 'ColorOverLife',
    isSupported(behavior) {
        const b = behavior as ColorOverLife;
        if (!GpuSystemEncoder.canEncodeColor(b.color)) {
            return `ColorOverLife color generator "${(b.color as any)?.type}" is not GPU-encodable`;
        }
        return null;
    },
    encode(behavior, enc) {
        const b = behavior as ColorOverLife;
        enc.signatureParts.push('b:ColorOverLife');
        const expr = enc.encodeColor(b.color, 'colorOverLife', 'tLife');
        return `    color = ${expr} * startColor;`;
    },
};

const codecs = new Map<string, GpuBehaviorCodec>([
    [applyForceCodec.type, applyForceCodec],
    [gravityForceCodec.type, gravityForceCodec],
    [sizeOverLifeCodec.type, sizeOverLifeCodec],
    [colorOverLifeCodec.type, colorOverLifeCodec],
]);

export const GpuBehaviorRegistry = {
    get(type: string): GpuBehaviorCodec | undefined {
        return codecs.get(type);
    },
    register(codec: GpuBehaviorCodec): void {
        codecs.set(codec.type, codec);
    },
};
