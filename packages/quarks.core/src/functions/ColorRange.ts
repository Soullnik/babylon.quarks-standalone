import type {Color4Like} from '../Like';
import {Vector4} from '../math';
import {vector4FromColor} from '../math/fromLike';
import {ColorToJSON, JSONToColor} from '../util/JSONUtil';
import {random} from '../util/random';
import {ColorGenerator} from './ColorGenerator';
import type {ColorRangeJSON} from './FunctionJSON';
import {GeneratorMemory} from './GeneratorMemory';

export class ColorRange implements ColorGenerator {
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

    /**
     * The slot of {@link GeneratorMemory} the roll lives in; -1 before the first roll.
     * @internal
     */
    indexCount = -1;

    startGen(memory: GeneratorMemory): void {
        this.indexCount = memory.length;
        memory.push(random());
    }
    genColor(memory: GeneratorMemory, color: Vector4): Vector4 {
        if (this.indexCount === -1) {
            this.startGen(memory);
        }
        return color.copy(this.a).lerp(this.b, memory[this.indexCount]);
    }

    type: 'value';

    toJSON(): ColorRangeJSON {
        return {
            type: 'ColorRange',
            a: ColorToJSON(this.a),
            b: ColorToJSON(this.b),
        };
    }

    /** Reads {@link ColorRange.toJSON} output. */
    static fromJSON(json: ColorRangeJSON): ColorRange {
        return new ColorRange(JSONToColor(json.a), JSONToColor(json.b));
    }

    clone(): ColorGenerator {
        return new ColorRange(this.a.clone(), this.b.clone());
    }
}
