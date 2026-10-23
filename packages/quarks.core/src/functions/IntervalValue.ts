import {MathUtils} from '../math';
import {random} from '../util/random';
import type {IntervalValueJSON} from './FunctionJSON';
import {GeneratorMemory} from './GeneratorMemory';
import {ValueGenerator} from './ValueGenerator';

/**
 * A random number between `a` and `b`, rolled once per particle and kept for its life (Unity's
 * Random Between Two Constants).
 */
export class IntervalValue implements ValueGenerator {
    /**
     * @param a - One end of the range.
     * @param b - The other end.
     */
    constructor(
        public a: number,
        public b: number
    ) {
        this.type = 'value';
    }

    /**
     * The slot of {@link GeneratorMemory} the roll lives in; -1 before the first roll.
     * @internal
     */
    indexCount = -1;

    // Roll a random sample once at spawn and remember the slot, so the
    // particle keeps the same lerp factor for its whole life. See
    // GeneratorMemory.ts for the slot-allocation pattern.
    /** Rolls the particle's number into a new slot of `memory`. */
    startGen(memory: GeneratorMemory) {
        this.indexCount = memory.length;
        memory.push(random());
    }

    /** The particle's number; rolls it first if {@link IntervalValue.startGen} has not. */
    genValue(memory: GeneratorMemory): number {
        if (this.indexCount === -1) {
            this.startGen(memory);
        }
        return MathUtils.lerp(this.a, this.b, memory[this.indexCount]);
    }

    /** Always `'value'`. */
    type: 'value';

    /** The JSON form, `{type: 'IntervalValue', a, b}`. */
    toJSON(): IntervalValueJSON {
        return {
            type: 'IntervalValue',
            a: this.a,
            b: this.b,
        };
    }

    /** Reads {@link IntervalValue.toJSON} output. */
    static fromJSON(json: IntervalValueJSON): IntervalValue {
        return new IntervalValue(json.a, json.b);
    }

    /** A copy with the same range. */
    clone(): ValueGenerator {
        return new IntervalValue(this.a, this.b);
    }
}
