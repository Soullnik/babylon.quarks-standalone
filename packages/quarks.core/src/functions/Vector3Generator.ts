import {Vector3} from '../math';
import {describePart, warnFormat} from '../util/JSONUtil';
import {ConstantValue} from './ConstantValue';
import type {Vector3GeneratorJSON} from './FunctionJSON';
import {GeneratorMemory} from './GeneratorMemory';
import {Vector3Function} from './Vector3Function';

/** A vector for a particle, from a number generator per axis. */
export interface Vector3Generator {
    /** Always `'vec3function'`. */
    type: 'vec3function';
    /** Rolls whatever the generator picks at random into `memory`. */
    startGen(memory: GeneratorMemory): void;
    /**
     * Writes the vector at time `t` into `vec`.
     * @returns `vec`.
     */
    genValue(memory: GeneratorMemory, vec: Vector3, t?: number): Vector3;
    /** See FunctionValueGenerator.refreshTable. */
    refreshTable?(): void;
    /** The generator's JSON. */
    toJSON(): Vector3GeneratorJSON;
    /** A copy with the same settings. */
    clone(): Vector3Generator;
}

/** Reads a vector generator; an unknown or missing type warns and gives a zero vector. */
export function Vector3GeneratorFromJSON(json: Vector3GeneratorJSON | undefined): Vector3Generator {
    switch (json?.type) {
        case 'Vector3Function':
            return Vector3Function.fromJSON(json);
        default:
            warnFormat(`${describePart('vector generator', json)}; using a zero vector.`);
            return new Vector3Function(new ConstantValue(0), new ConstantValue(0), new ConstantValue(0));
    }
}
