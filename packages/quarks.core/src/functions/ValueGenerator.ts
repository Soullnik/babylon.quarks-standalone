import {FunctionJSON} from './FunctionJSON';
import {ConstantValue} from './ConstantValue';
import {IntervalValue} from './IntervalValue';
import {PiecewiseBezier} from './PiecewiseBezier';
import {GeneratorMemory} from './GeneratorMemory';

/**
 * `startGen`/`genValue` follow the per-particle slot pattern documented in
 * `GeneratorMemory.ts`: spawn calls `startGen(memory)` once (claim a slot or
 * no-op), then `genValue(memory)` per frame.
 */
export interface ValueGenerator {
    type: 'value';
    startGen(memory: any): void;
    genValue(memory: any): number;
    toJSON(): FunctionJSON;
    clone(): ValueGenerator;
}

export interface FunctionValueGenerator {
    type: 'function';
    startGen(memory: GeneratorMemory): void;
    genValue(memory: GeneratorMemory, t: number): number;
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
