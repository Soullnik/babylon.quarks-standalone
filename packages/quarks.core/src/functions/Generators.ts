import {describeType, warnFormat} from '../util/JSONUtil';
import {ConstantValue} from './ConstantValue';
import {FunctionJSON} from './FunctionJSON';
import {RotationGenerator, RotationGeneratorFromJSON} from './RotationGenerator';
import {FunctionValueGenerator, ValueGenerator, ValueGeneratorFromJSON} from './ValueGenerator';
import {Vector3Generator, Vector3GeneratorFromJSON} from './Vector3Generator';

/** Reads a value, rotation or vector generator; an unknown or missing type warns and gives 0. */
export function GeneratorFromJSON(
    json: FunctionJSON
): FunctionValueGenerator | ValueGenerator | RotationGenerator | Vector3Generator {
    switch (json?.type) {
        case 'ConstantValue':
        case 'IntervalValue':
        case 'PiecewiseBezier':
            return ValueGeneratorFromJSON(json);
        case 'AxisAngle':
        case 'RandomQuat':
        case 'Euler':
            return RotationGeneratorFromJSON(json);
        case 'Vector3Function':
            return Vector3GeneratorFromJSON(json);
        default:
            warnFormat(`Unknown generator ${describeType(json)}; using 0.`);
            return new ConstantValue(0);
    }
}
