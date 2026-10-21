import {Vector3} from '../math';
import {describePart, warnFormat} from '../util/JSONUtil';
import {ConstantValue} from './ConstantValue';
import {FunctionJSON} from './FunctionJSON';
import {GeneratorMemory} from './GeneratorMemory';
import {Vector3Function} from './Vector3Function';

export interface Vector3Generator {
    type: 'vec3function';
    startGen(memory: GeneratorMemory): void;
    genValue(memory: GeneratorMemory, vec: Vector3, t?: number): Vector3;
    /** See FunctionValueGenerator.refreshTable. */
    refreshTable?(): void;
    toJSON(): FunctionJSON;
    clone(): Vector3Generator;
}

/** Reads a vector generator; an unknown or missing type warns and gives a zero vector. */
export function Vector3GeneratorFromJSON(json: FunctionJSON): Vector3Generator {
    switch (json?.type) {
        case 'Vector3Function':
            return Vector3Function.fromJSON(json);
        default:
            warnFormat(`${describePart('vector generator', json)}; using a zero vector.`);
            return new Vector3Function(new ConstantValue(0), new ConstantValue(0), new ConstantValue(0));
    }
}
