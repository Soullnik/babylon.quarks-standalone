import {FunctionJSON} from './FunctionJSON';
import {GeneratorMemory} from './GeneratorMemory';
import {ValueGenerator} from './ValueGenerator';

/** One number, always the same (Unity's Constant). */
export class ConstantValue implements ValueGenerator {
    /** Always `'value'`. */
    type: 'value';
    /** @param value - The value. */
    constructor(public value: number) {
        this.type = 'value';
    }

    /** Does nothing: there is nothing to roll. */
    startGen(memory: GeneratorMemory): void {}

    /** The value. */
    genValue(memory: GeneratorMemory): number {
        return this.value;
    }

    /** The JSON form, `{type: 'ConstantValue', value}`. */
    toJSON(): FunctionJSON {
        return {
            type: 'ConstantValue',
            value: this.value,
        };
    }

    /** Reads {@link ConstantValue.toJSON} output. */
    static fromJSON(json: FunctionJSON): ConstantValue {
        return new ConstantValue(json.value);
    }

    /** A copy. */
    clone(): ValueGenerator {
        return new ConstantValue(this.value);
    }
}
