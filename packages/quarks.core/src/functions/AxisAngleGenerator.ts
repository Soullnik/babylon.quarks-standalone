import type {Vector3Like} from '../Like';
import {Quaternion, Vector3} from '../math';
import {vector3From} from '../math/fromLike';
import type {AxisAngleJSON} from './FunctionJSON';
import {GeneratorMemory} from './GeneratorMemory';
import {RotationGenerator} from './RotationGenerator';
import {FunctionValueGenerator, ValueGenerator, ValueGeneratorFromJSON} from './ValueGenerator';

const unitAxis = new Vector3();

/**
 * A rotation about a fixed axis by an angle from a number generator (radians, or radians per second
 * over a particle's life).
 */
export class AxisAngleGenerator implements RotationGenerator {
    /** Always `'rotation'`. */
    type: 'rotation';
    private _axisValue: Vector3;

    /**
     * The axis. Any length: it is normalised when used, and a zero axis is read as +z.
     * Set it from any `Vector3Like`, such as a Babylon `Vector3`; the value is copied.
     */
    get axis(): Vector3 {
        return this._axisValue;
    }

    set axis(value: Vector3Like) {
        this._axisValue = vector3From(value);
    }

    /**
     * @param axis - The axis. Any length: it is normalised when used, and a zero axis is read as +z.
     * @param angle - The angle in radians, scaled by `delta` in {@link
     *   AxisAngleGenerator.genValue}.
     */
    constructor(
        axis: Vector3Like,
        public angle: FunctionValueGenerator | ValueGenerator
    ) {
        this._axisValue = vector3From(axis);
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
        const axis = this.axis;
        const lengthSq = axis.lengthSq();
        if (lengthSq === 0) unitAxis.set(0, 0, 1);
        else unitAxis.copy(axis).multiplyScalar(1 / Math.sqrt(lengthSq));
        return quat.setFromAxisAngle(unitAxis, this.angle.genValue(memory, t!) * delta);
    }

    /** The JSON form, `{type: 'AxisAngle', axis, angle}`. */
    toJSON(): AxisAngleJSON {
        return {
            type: 'AxisAngle',
            axis: {x: this.axis.x, y: this.axis.y, z: this.axis.z},
            angle: this.angle.toJSON(),
        };
    }

    /** Reads {@link AxisAngleGenerator.toJSON} output. */
    static fromJSON(json: AxisAngleJSON): AxisAngleGenerator {
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
