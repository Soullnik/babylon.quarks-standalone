import type {Color4Like} from '../Like';
import {Vector4} from '../math';
import {vector4FromColor} from '../math/fromLike';
import {ColorToJSON, JSONToColor} from '../util/JSONUtil';
import {random} from '../util/random';
import {ColorGenerator} from './ColorGenerator';
import type {RandomColorJSON} from './FunctionJSON';
import {GeneratorMemory} from './GeneratorMemory';

export class RandomColor implements ColorGenerator {
    private _aValue: Vector4;

    /**
     * One end of the range, linear RGBA.
     * Set it from any `Color4Like`, such as a Babylon `Color4`; the value is copied.
     */
    get a(): Vector4 {
        return this._aValue;
    }

    set a(value: Color4Like) {
        this._aValue = vector4FromColor(value);
    }
    private _bValue: Vector4;

    /**
     * The other end.
     * Set it from any `Color4Like`, such as a Babylon `Color4`; the value is copied.
     */
    get b(): Vector4 {
        return this._bValue;
    }

    set b(value: Color4Like) {
        this._bValue = vector4FromColor(value);
    }

    /**
     * @param a - One end of the range, linear RGBA.
     * @param b - The other end.
     */
    constructor(a: Color4Like, b: Color4Like) {
        this._aValue = vector4FromColor(a);
        this._bValue = vector4FromColor(b);
        this.type = 'value';
    }

    startGen(memory: GeneratorMemory): void {}

    genColor(memory: GeneratorMemory, color: Vector4): Vector4 {
        const rand = random();
        return color.copy(this.a).lerp(this.b, rand);
    }

    type: 'value';

    toJSON(): RandomColorJSON {
        return {
            type: 'RandomColor',
            a: ColorToJSON(this.a),
            b: ColorToJSON(this.b),
        };
    }

    /** Reads {@link RandomColor.toJSON} output. */
    static fromJSON(json: RandomColorJSON): RandomColor {
        return new RandomColor(JSONToColor(json.a), JSONToColor(json.b));
    }

    clone(): ColorGenerator {
        return new RandomColor(this.a.clone(), this.b.clone());
    }
}
