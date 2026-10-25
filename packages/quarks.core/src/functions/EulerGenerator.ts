import {Euler, EulerOrder, Quaternion} from '../math';
import type {EulerJSON} from './FunctionJSON';
import {GeneratorMemory} from './GeneratorMemory';
import {RotationGenerator} from './RotationGenerator';
import {FunctionValueGenerator, ValueGenerator, ValueGeneratorFromJSON} from './ValueGenerator';

/** A rotation from three angle generators, one per axis, applied in an Euler order. */
export class EulerGenerator implements RotationGenerator {
    /** Always `'rotation'`. */
    type: 'rotation';
    /** The Euler the angles are written into; its `order` is the generator's order. */
    euler: Euler;

    /**
     * @param angleX - The angle about x, in radians.
     * @param angleY - The angle about y, in radians.
     * @param angleZ - The angle about z, in radians.
     * @param eulerOrder - The order the three rotations apply in; `'XYZ'` by default.
     */
    constructor(
        public angleX: FunctionValueGenerator | ValueGenerator,
        public angleY: FunctionValueGenerator | ValueGenerator,
        public angleZ: FunctionValueGenerator | ValueGenerator,
        eulerOrder?: EulerOrder
    ) {
        this.type = 'rotation';
        this.euler = new Euler(0, 0, 0, eulerOrder);
    }

    /** Rolls the three angle generators into `memory`. */
    startGen(memory: GeneratorMemory): void {
        this.angleX.startGen(memory);
        this.angleY.startGen(memory);
        this.angleZ.startGen(memory);
    }

    /**
     * Writes into `quat` the rotation by the three angles at `t`, each times `delta`.
     * @returns `quat`.
     */
    genValue(memory: GeneratorMemory, quat: Quaternion, delta: number, t?: number): Quaternion {
        this.euler.set(
            this.angleX.genValue(memory, t!) * delta,
            this.angleY.genValue(memory, t!) * delta,
            this.angleZ.genValue(memory, t!) * delta
        );
        return quat.setFromEuler(this.euler);
    }

    /** The JSON form, `{type: 'Euler', angleX, angleY, angleZ, eulerOrder}`. */
    toJSON(): EulerJSON {
        return {
            type: 'Euler',
            angleX: this.angleX.toJSON(),
            angleY: this.angleY.toJSON(),
            angleZ: this.angleZ.toJSON(),
            eulerOrder: this.euler.order,
        };
    }

    /** Reads {@link EulerGenerator.toJSON} output. */
    static fromJSON(json: EulerJSON): EulerGenerator {
        return new EulerGenerator(
            ValueGeneratorFromJSON(json.angleX) as FunctionValueGenerator,
            ValueGeneratorFromJSON(json.angleY) as FunctionValueGenerator,
            ValueGeneratorFromJSON(json.angleZ) as FunctionValueGenerator,
            json.eulerOrder
        );
    }

    /** A copy with its own angle generators and the same order. */
    clone(): RotationGenerator {
        return new EulerGenerator(this.angleX.clone(), this.angleY.clone(), this.angleZ.clone(), this.euler.order);
    }
}
