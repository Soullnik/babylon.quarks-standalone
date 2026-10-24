import {random} from '../util/random';
import type {RandomBetweenCurvesJSON} from './FunctionJSON';
import {GeneratorMemory} from './GeneratorMemory';
import {PiecewiseBezier} from './PiecewiseBezier';
import type {FunctionValueGenerator} from './ValueGenerator';

/**
 * A number over time between two curves, at a mix rolled once per particle and kept for its life
 * (Unity's Random Between Two Curves): each particle follows its own curve, the same fraction of the
 * way from {@link RandomBetweenCurves.curve1} to {@link RandomBetweenCurves.curve2} at every `t`.
 * Where it drives a start value, `t` is the system's cycle, as for any curve there.
 */
export class RandomBetweenCurves implements FunctionValueGenerator {
    /** Always `'function'`: the number depends on `t`. */
    readonly type = 'function' as const;

    /**
     * The slot of {@link GeneratorMemory} the mix lives in; -1 before the first roll.
     * @internal
     */
    indexCount = -1;

    /**
     * @param curve1 - One bound (Unity's lower curve).
     * @param curve2 - The other bound (Unity's upper curve).
     */
    constructor(
        public curve1: PiecewiseBezier,
        public curve2: PiecewiseBezier
    ) {}

    /** Rolls the particle's mix between the curves into a new slot of `memory`. */
    startGen(memory: GeneratorMemory): void {
        this.indexCount = memory.length;
        memory.push(random());
    }

    /** Has both curves sample their tables, as a single curve does; see {@link PiecewiseBezier.refreshTable}. */
    refreshTable(): void {
        this.curve1.refreshTable();
        this.curve2.refreshTable();
    }

    /** The particle's number at `t`; rolls its mix first if {@link RandomBetweenCurves.startGen} has not. */
    genValue(memory: GeneratorMemory, t = 0): number {
        if (this.indexCount === -1) {
            this.startGen(memory);
        }
        const a = this.curve1.genValue(memory, t);
        return a + (this.curve2.genValue(memory, t) - a) * memory[this.indexCount];
    }

    /** The JSON form, `{type: 'RandomBetweenCurves', curve1, curve2}`. */
    toJSON(): RandomBetweenCurvesJSON {
        return {
            type: 'RandomBetweenCurves',
            curve1: this.curve1.toJSON(),
            curve2: this.curve2.toJSON(),
        };
    }

    /** Reads {@link RandomBetweenCurves.toJSON} output. */
    static fromJSON(json: RandomBetweenCurvesJSON): RandomBetweenCurves {
        return new RandomBetweenCurves(PiecewiseBezier.fromJSON(json.curve1), PiecewiseBezier.fromJSON(json.curve2));
    }

    /** A copy with copies of both curves. */
    clone(): RandomBetweenCurves {
        return new RandomBetweenCurves(this.curve1.clone() as PiecewiseBezier, this.curve2.clone() as PiecewiseBezier);
    }
}
