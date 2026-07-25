import {FunctionColorGenerator} from './ColorGenerator';
import {Vector3, Vector4} from '../math';
import {ColorRange} from './ColorRange';
import {FunctionJSON} from './FunctionJSON';
import {ContinuousLinearFunction} from './ContinuousLinearFunction';
import {GeneratorMemory} from './GeneratorMemory';

/** Scratch colour used while sampling the gradient into its table. */
const tempColor = new Vector4();

export class Gradient implements FunctionColorGenerator {
    type: 'function';
    color: ContinuousLinearFunction<Vector3>;
    alpha: ContinuousLinearFunction<number>;
    // default linear bezier
    constructor(
        color: Array<[Vector3, number]> = [
            [new Vector3(0, 0, 0), 0],
            [new Vector3(1, 1, 1), 0],
        ],
        alpha: Array<[number, number]> = [
            [1, 0],
            [1, 1],
        ]
    ) {
        this.type = 'function';
        this.color = new ContinuousLinearFunction<Vector3>(color, 'Color');
        this.alpha = new ContinuousLinearFunction<number>(alpha, 'Number');
    }

    /** Sample count of the tables built by {@link refreshTable}. */
    static readonly TABLE_SIZE = 257;

    /** Sampled RGBA copy of the gradient, or null while none has been built. */
    private table: Float32Array | null = null;
    /** Keys the tables were built from, used to detect edits. */
    private tableSignature: Float32Array | null = null;

    /**
     * Rebuilds the sampled table when the gradient changed, otherwise does
     * nothing. See PiecewiseBezier.refreshTable — same reasoning, and the same
     * signature check so a gradient edited in an editor is picked up.
     */
    refreshTable(): void {
        const colorKeys = this.color.keys;
        const alphaKeys = this.alpha.keys;
        const signatureLength = colorKeys.length * 4 + alphaKeys.length * 2;
        let signature = this.tableSignature;
        let changed = signature === null || signature.length !== signatureLength;
        if (changed) {
            signature = new Float32Array(signatureLength);
        }
        let s = 0;
        for (let i = 0; i < colorKeys.length; i++, s += 4) {
            const value = colorKeys[i][0];
            const position = colorKeys[i][1];
            if (!changed) {
                changed =
                    signature![s] !== value.x ||
                    signature![s + 1] !== value.y ||
                    signature![s + 2] !== value.z ||
                    signature![s + 3] !== position;
            }
            if (changed) {
                signature![s] = value.x;
                signature![s + 1] = value.y;
                signature![s + 2] = value.z;
                signature![s + 3] = position;
            }
        }
        for (let i = 0; i < alphaKeys.length; i++, s += 2) {
            const value = alphaKeys[i][0];
            const position = alphaKeys[i][1];
            if (!changed) {
                changed = signature![s] !== value || signature![s + 1] !== position;
            }
            if (changed) {
                signature![s] = value;
                signature![s + 1] = position;
            }
        }
        if (!changed && this.table !== null) {
            return;
        }

        this.tableSignature = signature;
        const size = Gradient.TABLE_SIZE;
        const table = this.table !== null && this.table.length === size * 4 ? this.table : new Float32Array(size * 4);
        const step = 1 / (size - 1);
        const sample = tempColor;
        for (let i = 0; i < size; i++) {
            this.genColorExact(sample, i * step);
            const offset = i * 4;
            table[offset] = sample.x;
            table[offset + 1] = sample.y;
            table[offset + 2] = sample.z;
            table[offset + 3] = sample.w;
        }
        this.table = table;
    }

    /** Drops the sampled table, so later reads go back to evaluating the keys. */
    clearTable(): void {
        this.table = null;
        this.tableSignature = null;
    }

    genColor(memory: GeneratorMemory, color: Vector4, t: number): Vector4 {
        const table = this.table;
        if (table !== null) {
            const last = Gradient.TABLE_SIZE - 1;
            if (t <= 0) {
                color.x = table[0];
                color.y = table[1];
                color.z = table[2];
                color.w = table[3];
                return color;
            }
            if (t >= 1) {
                const offset = last * 4;
                color.x = table[offset];
                color.y = table[offset + 1];
                color.z = table[offset + 2];
                color.w = table[offset + 3];
                return color;
            }
            const x = t * last;
            const index = x | 0;
            const fraction = x - index;
            const offset = index * 4;
            const next = offset + 4;
            color.x = table[offset] + (table[next] - table[offset]) * fraction;
            color.y = table[offset + 1] + (table[next + 1] - table[offset + 1]) * fraction;
            color.z = table[offset + 2] + (table[next + 2] - table[offset + 2]) * fraction;
            color.w = table[offset + 3] + (table[next + 3] - table[offset + 3]) * fraction;
            return color;
        }
        return this.genColorExact(color, t);
    }

    /** Evaluates the gradient keys themselves, ignoring any sampled table. */
    genColorExact(color: Vector4, t: number): Vector4 {
        // Specialised inline of ContinuousLinearFunction.genValue for both
        // channels: this runs once per particle per frame, and going through the
        // generic (number | Vector3) path costs a temp vector plus polymorphic
        // key reads.
        const colorKeys = this.color.keys;
        const lastColor = colorKeys.length - 1;
        const colorIndex = this.color.findKey(t);
        let r: number;
        let g: number;
        let b: number;
        if (colorIndex === -1 || colorIndex >= lastColor) {
            const key = colorKeys[colorIndex === -1 ? 0 : lastColor][0];
            r = key.x;
            g = key.y;
            b = key.z;
        } else {
            const from = colorKeys[colorIndex][0];
            const to = colorKeys[colorIndex + 1][0];
            const startX = colorKeys[colorIndex][1];
            const span = colorKeys[colorIndex + 1][1] - startX;
            // Two keys can share a position — the default gradient does. Dividing
            // by that empty span yields NaN, which reaches the vertex buffer and
            // drops the particle for a frame; stay on the first key instead.
            const ratio = span > 0 ? (t - startX) / span : 0;
            r = from.x + (to.x - from.x) * ratio;
            g = from.y + (to.y - from.y) * ratio;
            b = from.z + (to.z - from.z) * ratio;
        }

        const alphaKeys = this.alpha.keys;
        const lastAlpha = alphaKeys.length - 1;
        const alphaIndex = this.alpha.findKey(t);
        let a: number;
        if (alphaIndex === -1 || alphaIndex >= lastAlpha) {
            a = alphaKeys[alphaIndex === -1 ? 0 : lastAlpha][0];
        } else {
            const startX = alphaKeys[alphaIndex][1];
            const from = alphaKeys[alphaIndex][0];
            const span = alphaKeys[alphaIndex + 1][1] - startX;
            a = from + (alphaKeys[alphaIndex + 1][0] - from) * (span > 0 ? (t - startX) / span : 0);
        }

        color.x = r;
        color.y = g;
        color.z = b;
        color.w = a;
        return color;
    }

    toJSON(): FunctionJSON {
        return {
            type: 'Gradient',
            color: this.color.toJSON(),
            alpha: this.alpha.toJSON(),
        };
    }

    static fromJSON(json: FunctionJSON): Gradient {
        // compatibility
        if (json.functions) {
            const keys = json.functions.map((func: any) => [ColorRange.fromJSON(func.function).a, func.start]);
            if (json.functions.length > 0) {
                keys.push([ColorRange.fromJSON(json.functions[json.functions.length - 1].function).b, 1]);
            }
            return new Gradient(
                keys.map((key: any) => [new Vector3(key[0].x, key[0].y, key[0].z), key[1]]),
                keys.map((key: any) => [key[0].w, key[1]])
            );
        } else {
            const gradient = new Gradient();
            gradient.alpha = ContinuousLinearFunction.fromJSON(json.alpha);
            gradient.color = ContinuousLinearFunction.fromJSON(json.color);
            return gradient;
        }
    }

    clone(): FunctionColorGenerator {
        const gradient = new Gradient();
        gradient.alpha = this.alpha.clone();
        gradient.color = this.color.clone();
        return gradient;
    }

    startGen(memory: GeneratorMemory): void {}
}
