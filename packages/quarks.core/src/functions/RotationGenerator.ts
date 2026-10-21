import {Quaternion} from '../math';
import {describePart, warnFormat} from '../util/JSONUtil';
import {AxisAngleGenerator} from './AxisAngleGenerator';
import {EulerGenerator} from './EulerGenerator';
import {FunctionJSON} from './FunctionJSON';
import {GeneratorMemory} from './GeneratorMemory';
import {RandomQuatGenerator} from './RandomQuatGenerator';

export interface RotationGenerator {
    type: 'rotation';
    startGen(memory: GeneratorMemory): void;
    genValue(memory: GeneratorMemory, q: Quaternion, delta: number, t: number): Quaternion;
    toJSON(): FunctionJSON;
    clone(): RotationGenerator;
}

/** Reads a rotation generator; an unknown or missing type warns and gives a random rotation. */
export function RotationGeneratorFromJSON(json: FunctionJSON): RotationGenerator {
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
