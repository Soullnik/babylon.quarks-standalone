import {Quaternion, Vector3} from '../math';
import {FunctionJSON} from './FunctionJSON';
import {GeneratorMemory} from './GeneratorMemory';
import {RotationGenerator} from './RotationGenerator';
import {FunctionValueGenerator, ValueGenerator, ValueGeneratorFromJSON} from './ValueGenerator';

/**
 * A rotation about a fixed axis by an angle from a number generator (radians, or radians per second
 * over a particle's life).
 */
export class AxisAngleGenerator implements RotationGenerator {
    /** Always `'rotation'`. */
    type: 'rotation';
    /**
     * @param axis - The axis; must be a unit vector.
     * @param angle - The angle in radians, scaled by `delta` in {@link
     *   AxisAngleGenerator.genValue}.
     */
    constructor(
        public axis: Vector3,
        public angle: FunctionValueGenerator | ValueGenerator
    ) {
        this.type = 'rotation';
    }

    /** Rolls the angle generator into `memory`. */
    startGen(memory: GeneratorMemory): void {
        this.angle.startGen(memory);
    }

    /**
     * Writes into `quat` the rotation about the axis by the angle at `t` times `delta`.
     * @returns `quat`.
     */
    genValue(memory: GeneratorMemory, quat: Quaternion, delta: number, t?: number): Quaternion {
        return quat.setFromAxisAngle(this.axis, this.angle.genValue(memory, t!) * delta);
    }

    /** The JSON form, `{type: 'AxisAngle', axis, angle}`. */
    toJSON(): FunctionJSON {
        return {
            type: 'AxisAngle',
            axis: {x: this.axis.x, y: this.axis.y, z: this.axis.z},
            angle: this.angle.toJSON(),
        };
    }

    /** Reads {@link AxisAngleGenerator.toJSON} output. */
    static fromJSON(json: FunctionJSON): AxisAngleGenerator {
        return new AxisAngleGenerator(
            new Vector3(json.axis.x, json.axis.y, json.axis.z),
            ValueGeneratorFromJSON(json.angle) as FunctionValueGenerator
        );
    }

    /** A copy with its own axis and angle generator. */
    clone(): RotationGenerator {
        return new AxisAngleGenerator(this.axis.clone(), this.angle.clone());
    }
}
