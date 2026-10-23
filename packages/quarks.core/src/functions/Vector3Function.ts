import {Vector3} from '../math';
import {FunctionJSON} from './FunctionJSON';
import {GeneratorMemory} from './GeneratorMemory';
import {FunctionValueGenerator, ValueGenerator, ValueGeneratorFromJSON} from './ValueGenerator';
import {Vector3Generator} from './Vector3Generator';

/** A vector whose x, y and z each come from a number generator. */
export class Vector3Function implements Vector3Generator {
    /** Always `'vec3function'`. */
    type: 'vec3function';

    /**
     * @param x - The x generator.
     * @param y - The y generator.
     * @param z - The z generator.
     */
    constructor(
        public x: FunctionValueGenerator | ValueGenerator,
        public y: FunctionValueGenerator | ValueGenerator,
        public z: FunctionValueGenerator | ValueGenerator
    ) {
        this.type = 'vec3function';
    }

    /** Rolls the three generators into `memory`. */
    startGen(memory: GeneratorMemory): void {
        this.x.startGen(memory);
        this.y.startGen(memory);
        this.z.startGen(memory);
    }

    /**
     * Writes the three generators' values at `t` into `vec`.
     * @returns `vec`.
     */
    genValue(memory: GeneratorMemory, vec: Vector3, t?: number): Vector3 {
        return vec.set(this.x.genValue(memory, t!), this.y.genValue(memory, t!), this.z.genValue(memory, t!));
    }

    /** The JSON form, `{type: 'Vector3Function', x, y, z}`. */
    toJSON(): FunctionJSON {
        return {
            type: 'Vector3Function',
            x: this.x.toJSON(),
            y: this.y.toJSON(),
            z: this.z.toJSON(),
        };
    }

    /** Reads {@link Vector3Function.toJSON} output. */
    static fromJSON(json: FunctionJSON): Vector3Generator {
        return new Vector3Function(
            ValueGeneratorFromJSON(json.x) as FunctionValueGenerator,
            ValueGeneratorFromJSON(json.y) as FunctionValueGenerator,
            ValueGeneratorFromJSON(json.z) as FunctionValueGenerator
        );
    }

    /** A copy with its own generators. */
    clone(): Vector3Generator {
        return new Vector3Function(this.x.clone(), this.y.clone(), this.z.clone());
    }
}
