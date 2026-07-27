import {ConstantValue} from './ConstantValue';
import {FunctionJSON} from './FunctionJSON';
import {GeneratorMemory} from './GeneratorMemory';
import {IntervalValue} from './IntervalValue';
import {PiecewiseBezier} from './PiecewiseBezier';

/**
 * `startGen`/`genValue` follow the per-particle slot pattern documented in
 * `GeneratorMemory.ts`: spawn calls `startGen(memory)` once (claim a slot or
 * no-op), then `genValue(memory)` per frame.
 */
export interface ValueGenerator {
    type: 'value';
    startGen(memory: any): void;
    genValue(memory: any): number;
    /** See FunctionValueGenerator.refreshTable. */
    refreshTable?(): void;
    toJSON(): FunctionJSON;
    clone(): ValueGenerator;
}

export interface FunctionValueGenerator {
    type: 'function';
    startGen(memory: GeneratorMemory): void;
    genValue(memory: GeneratorMemory, t: number): number;
    /**
     * Optional hook for generators that can precompute a sampled table of
     * themselves. Called once per frame by behaviors that evaluate the
     * generator per particle, before any genValue of that frame, so a curve
     * edited between frames is picked up.
     */
    refreshTable?(): void;
    toJSON(): FunctionJSON;
    clone(): FunctionValueGenerator;
}

export function ValueGeneratorFromJSON(json: FunctionJSON): FunctionValueGenerator | ValueGenerator {
    switch (json.type) {
        case 'ConstantValue':
            return ConstantValue.fromJSON(json);
        case 'IntervalValue':
            return IntervalValue.fromJSON(json);
        case 'PiecewiseBezier':
            return PiecewiseBezier.fromJSON(json);
        default:
            return new ConstantValue(0);
    }
}
