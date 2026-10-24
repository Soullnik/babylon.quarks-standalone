import {describePart, warnFormat} from '../util/JSONUtil';
import {random} from '../util/random';
import {Bezier} from './Bezier';
import type {PiecewiseBezierJSON, RandomBetweenCurvesJSON} from './FunctionJSON';
import {GeneratorMemory} from './GeneratorMemory';
import {PiecewiseBezier} from './PiecewiseBezier';
import type {FunctionValueGenerator} from './ValueGenerator';

/**
 * A number over time between two curves, at a mix rolled once per particle and kept for its life
 * (Unity's Random Between Two Curves): each particle follows its own curve, the same fraction of the
 * way from {@link RandomBetweenCurves.curve1} to {@link RandomBetweenCurves.curve2} at every `t`.
 * Where it drives a start value, `t` is the system's cycle, as for any curve there.
 *
 * Where a system-level setting takes it (emission over time or distance, a burst's count, a shape's
 * speed, Noise's scroll speed), the mix is rolled once per play rather than at every emission step,
 * as a random range is there.
 *
 * Like every random generator, an instance holds the memory slot of its mix: give each setting its
 * own instance, and {@link RandomBetweenCurves.clone} one to reuse it.
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

    /**
     * The particle's number at `t`; rolls its mix first if {@link RandomBetweenCurves.startGen}
     * never has. A particle that was not rolled for this instance (one alive when the setting was
     * replaced) takes the midway curve rather than a missing mix.
     */
    genValue(memory: GeneratorMemory, t = 0): number {
        if (this.indexCount === -1) {
            this.startGen(memory);
        }
        const rolled = memory[this.indexCount];
        const mix = rolled === undefined ? 0.5 : rolled;
        const a = this.curve1.genValue(memory, t);
        return a + (this.curve2.genValue(memory, t) - a) * mix;
    }

    /** The JSON form, `{type: 'RandomBetweenCurves', curve1, curve2}`. */
    toJSON(): RandomBetweenCurvesJSON {
        return {
            type: 'RandomBetweenCurves',
            curve1: this.curve1.toJSON(),
            curve2: this.curve2.toJSON(),
        };
    }

    /**
     * Reads {@link RandomBetweenCurves.toJSON} output. A bound that is missing or not a curve warns
     * (throws when strict) and reads as a flat 0 curve, so one bad value does not cost the effect.
     */
    static fromJSON(json: RandomBetweenCurvesJSON): RandomBetweenCurves {
        return new RandomBetweenCurves(readBound(json.curve1, 'curve1'), readBound(json.curve2, 'curve2'));
    }

    /** A copy with copies of both curves. */
    clone(): RandomBetweenCurves {
        return new RandomBetweenCurves(this.curve1.clone() as PiecewiseBezier, this.curve2.clone() as PiecewiseBezier);
    }
}

/** One bound of a {@link RandomBetweenCurves} from JSON; see its `fromJSON`. */
function readBound(json: PiecewiseBezierJSON | undefined, name: string): PiecewiseBezier {
    if (json?.type === 'PiecewiseBezier' && Array.isArray(json.functions)) {
        return PiecewiseBezier.fromJSON(json);
    }
    warnFormat(`RandomBetweenCurves ${name}: ${describePart('curve', json)}; using a flat 0 curve.`);
    return new PiecewiseBezier([[new Bezier(0, 0, 0, 0), 0]]);
}
