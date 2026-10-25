import {describePart, warnFormat} from '../util/JSONUtil';
import {ConstantValue} from './ConstantValue';
import type {ValueGeneratorJSON} from './FunctionJSON';
import {GeneratorMemory} from './GeneratorMemory';
import {IntervalValue} from './IntervalValue';
import {PiecewiseBezier} from './PiecewiseBezier';
import {RandomBetweenCurves} from './RandomBetweenCurves';

/**
 * `startGen`/`genValue` follow the per-particle slot pattern documented in
 * `GeneratorMemory.ts`: spawn calls `startGen(memory)` once (claim a slot or
 * no-op), then `genValue(memory)` per frame.
 */
export interface ValueGenerator {
    /** `'value'`: the number does not change with time. */
    type: 'value';
    /**
     * Rolls whatever the generator picks at random into `memory`, before the first {@link
     * ValueGenerator.genValue}.
     */
    startGen(memory: GeneratorMemory): void;
    /** The number, from what `memory` holds. */
    genValue(memory: GeneratorMemory): number;
    /** See FunctionValueGenerator.refreshTable. */
    refreshTable?(): void;
    /** The generator's JSON. */
    toJSON(): ValueGeneratorJSON;
    /** A copy with the same settings. */
    clone(): ValueGenerator;
}

/**
 * A number that changes over time `t` in [0, 1] (a particle's life fraction, or the system's
 * cycle): a curve (Unity's Curve).
 */
export interface FunctionValueGenerator {
    /** `'function'`: the number depends on `t`. */
    type: 'function';
    /**
     * Rolls whatever the generator picks at random into `memory`, before the first {@link
     * FunctionValueGenerator.genValue}.
     */
    startGen(memory: GeneratorMemory): void;
    /** The number at `t`. */
    genValue(memory: GeneratorMemory, t: number): number;
    /**
     * Optional hook for generators that can precompute a sampled table of
     * themselves. Called once per frame by behaviors that evaluate the
     * generator per particle, before any genValue of that frame, so a curve
     * edited between frames is picked up.
     */
    refreshTable?(): void;
    /** The generator's JSON. */
    toJSON(): ValueGeneratorJSON;
    /** A copy with the same settings. */
    clone(): FunctionValueGenerator;
}

/** Reads a value generator; an unknown or missing type warns and gives 0. */
export function ValueGeneratorFromJSON(json: ValueGeneratorJSON | undefined): FunctionValueGenerator | ValueGenerator {
    switch (json?.type) {
        case 'ConstantValue':
            return ConstantValue.fromJSON(json);
        case 'IntervalValue':
            return IntervalValue.fromJSON(json);
        case 'PiecewiseBezier':
            return PiecewiseBezier.fromJSON(json);
        case 'RandomBetweenCurves':
            return RandomBetweenCurves.fromJSON(json);
        default:
            warnFormat(`${describePart('value generator', json)}; using 0.`);
            return new ConstantValue(0);
    }
}
