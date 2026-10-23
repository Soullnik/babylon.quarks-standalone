import {Quaternion} from '../math';
import {describePart, warnFormat} from '../util/JSONUtil';
import {AxisAngleGenerator} from './AxisAngleGenerator';
import {EulerGenerator} from './EulerGenerator';
import type {RotationGeneratorJSON} from './FunctionJSON';
import {GeneratorMemory} from './GeneratorMemory';
import {RandomQuatGenerator} from './RandomQuatGenerator';

/** A rotation for a particle: a start rotation, or a rotation per second over its life. */
export interface RotationGenerator {
    /** Always `'rotation'`. */
    type: 'rotation';
    /** Rolls whatever the generator picks at random into `memory`. */
    startGen(memory: GeneratorMemory): void;
    /**
     * Writes into `q` the rotation over `delta` seconds at time `t` (for a start rotation, `delta`
     * is 1).
     * @returns `q`.
     */
    genValue(memory: GeneratorMemory, q: Quaternion, delta: number, t: number): Quaternion;
    /** The generator's JSON. */
    toJSON(): RotationGeneratorJSON;
    /** A copy with the same settings. */
    clone(): RotationGenerator;
}

/** Reads a rotation generator; an unknown or missing type warns and gives a random rotation. */
export function RotationGeneratorFromJSON(json: RotationGeneratorJSON | undefined): RotationGenerator {
    switch (json?.type) {
        case 'AxisAngle':
            return AxisAngleGenerator.fromJSON(json);
        case 'Euler':
            return EulerGenerator.fromJSON(json);
        case 'RandomQuat':
            return RandomQuatGenerator.fromJSON(json);
        default:
            warnFormat(`${describePart('rotation generator', json)}; using a random rotation.`);
            return new RandomQuatGenerator();
    }
}
