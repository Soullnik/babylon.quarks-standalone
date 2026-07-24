import {FunctionColorGenerator} from './ColorGenerator';
import {Vector3, Vector4} from '../math';
import {ColorRange} from './ColorRange';
import {FunctionJSON} from './FunctionJSON';
import {ContinuousLinearFunction} from './ContinuousLinearFunction';
import {GeneratorMemory} from './GeneratorMemory';

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

    genColor(memory: GeneratorMemory, color: Vector4, t: number): Vector4 {
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
            const ratio = (t - startX) / (colorKeys[colorIndex + 1][1] - startX);
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
            a = from + (alphaKeys[alphaIndex + 1][0] - from) * ((t - startX) / (alphaKeys[alphaIndex + 1][1] - startX));
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
