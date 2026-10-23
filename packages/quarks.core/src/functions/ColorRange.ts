import {Vector4} from '../math';
import {ColorToJSON, JSONToColor} from '../util/JSONUtil';
import {random} from '../util/random';
import {ColorGenerator} from './ColorGenerator';
import {FunctionJSON} from './FunctionJSON';
import {GeneratorMemory} from './GeneratorMemory';

export class ColorRange implements ColorGenerator {
    /**
     * @param a - One end of the range, linear RGBA.
     * @param b - The other end.
     */
    constructor(
        public a: Vector4,
        public b: Vector4
    ) {
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

    toJSON(): FunctionJSON {
        return {
            type: 'ColorRange',
            a: ColorToJSON(this.a),
            b: ColorToJSON(this.b),
        };
    }

    /** Reads {@link ColorRange.toJSON} output. */
    static fromJSON(json: FunctionJSON): ColorRange {
        return new ColorRange(JSONToColor(json.a), JSONToColor(json.b));
    }

    clone(): ColorGenerator {
        return new ColorRange(this.a.clone(), this.b.clone());
    }
}
