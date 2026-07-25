import {Behavior} from './Behavior';
import {Particle} from '../Particle';
import {ConstantValue, FunctionValueGenerator, ValueGenerator, ValueGeneratorFromJSON} from '../functions';
import {Quaternion, Vector3} from '../math';
import {IParticleSystem} from '../IParticleSystem';

export type VelocityOverLifeSpace = 'local' | 'world';

const UNIT_X = new Vector3(1, 0, 0);
const UNIT_Y = new Vector3(0, 1, 0);
const UNIT_Z = new Vector3(0, 0, 1);

/**
 * Move particles with a direct velocity over their life (Unity's "Velocity over Lifetime").
 * Applied as a positional displacement, so it is not affected by speed modifiers,
 * forces, or speed limits. Orbital speeds rotate particles around the emitter axes.
 */
export class VelocityOverLife implements Behavior {
    type = 'VelocityOverLife';
    /** Learned in {@link initialize}, so undefined until this behavior sees a particle. */
    ps?: IParticleSystem;

    constructor(
        public linearX: FunctionValueGenerator | ValueGenerator = new ConstantValue(0),
        public linearY: FunctionValueGenerator | ValueGenerator = new ConstantValue(0),
        public linearZ: FunctionValueGenerator | ValueGenerator = new ConstantValue(0),
        public orbitalX: FunctionValueGenerator | ValueGenerator = new ConstantValue(0),
        public orbitalY: FunctionValueGenerator | ValueGenerator = new ConstantValue(0),
        public orbitalZ: FunctionValueGenerator | ValueGenerator = new ConstantValue(0),
        public space: VelocityOverLifeSpace = 'local'
    ) {}

    _temp = new Vector3();
    _tempEmitterPos = new Vector3();
    _tempQ = new Quaternion();
    _tempQInv = new Quaternion();
    _tempScale = new Vector3(1, 1, 1);
    _tempScaleInv = new Vector3(1, 1, 1);
    _tempRot = new Quaternion();
    _tempAxis = new Vector3();

    initialize(particle: Particle, particleSystem: IParticleSystem): void {
        this.ps = particleSystem;
        this.linearX.startGen(particle.memory);
        this.linearY.startGen(particle.memory);
        this.linearZ.startGen(particle.memory);
        this.orbitalX.startGen(particle.memory);
        this.orbitalY.startGen(particle.memory);
        this.orbitalZ.startGen(particle.memory);
    }

    frameUpdate(delta: number): void {
        if (this.ps) {
            this.ps.emitter.matrixWorld.decompose(this._tempEmitterPos, this._tempQ, this._tempScale);
            this._tempQInv.copy(this._tempQ).invert();
            this._tempScaleInv.set(1 / this._tempScale.x, 1 / this._tempScale.y, 1 / this._tempScale.z);
        }
    }

    update(particle: Particle, delta: number): void {
        const t = particle.age / particle.life;
        this._temp.set(
            this.linearX.genValue(particle.memory, t),
            this.linearY.genValue(particle.memory, t),
            this.linearZ.genValue(particle.memory, t)
        );
        // The system is undefined until initialize() has run for this behavior;
        // an unknown one is treated as world space rather than throwing, which
        // is also what frameUpdate's guard assumes.
        const worldSpace = this.ps !== undefined && this.ps.worldSpace;
        // Convert the authored space into the particle simulation space.
        if (worldSpace && this.space === 'local') {
            this._temp.multiply(this._tempScale).applyQuaternion(this._tempQ);
        } else if (!worldSpace && this.space === 'world') {
            this._temp.multiply(this._tempScaleInv).applyQuaternion(this._tempQInv);
        }
        particle.position.addScaledVector(this._temp, delta);

        const angleX = this.orbitalX.genValue(particle.memory, t) * delta;
        const angleY = this.orbitalY.genValue(particle.memory, t) * delta;
        const angleZ = this.orbitalZ.genValue(particle.memory, t) * delta;
        if (angleX !== 0 || angleY !== 0 || angleZ !== 0) {
            const worldPivot = worldSpace;
            if (worldPivot) {
                particle.position.sub(this._tempEmitterPos);
            }
            this.orbit(particle.position, UNIT_X, angleX, worldPivot);
            this.orbit(particle.position, UNIT_Y, angleY, worldPivot);
            this.orbit(particle.position, UNIT_Z, angleZ, worldPivot);
            if (worldPivot) {
                particle.position.add(this._tempEmitterPos);
            }
        }
    }

    private orbit(position: Vector3, axis: Vector3, angle: number, worldAxes: boolean): void {
        if (angle === 0) {
            return;
        }
        this._tempAxis.copy(axis);
        if (worldAxes) {
            this._tempAxis.applyQuaternion(this._tempQ);
        }
        this._tempRot.setFromAxisAngle(this._tempAxis, angle);
        position.applyQuaternion(this._tempRot);
    }

    toJSON(): any {
        return {
            type: this.type,
            linearX: this.linearX.toJSON(),
            linearY: this.linearY.toJSON(),
            linearZ: this.linearZ.toJSON(),
            orbitalX: this.orbitalX.toJSON(),
            orbitalY: this.orbitalY.toJSON(),
            orbitalZ: this.orbitalZ.toJSON(),
            space: this.space,
        };
    }

    static fromJSON(json: any): Behavior {
        const readValue = (field: any) =>
            field ? (ValueGeneratorFromJSON(field) as FunctionValueGenerator) : new ConstantValue(0);
        return new VelocityOverLife(
            readValue(json.linearX),
            readValue(json.linearY),
            readValue(json.linearZ),
            readValue(json.orbitalX),
            readValue(json.orbitalY),
            readValue(json.orbitalZ),
            json.space === 'world' ? 'world' : 'local'
        );
    }

    clone(): Behavior {
        return new VelocityOverLife(
            this.linearX.clone(),
            this.linearY.clone(),
            this.linearZ.clone(),
            this.orbitalX.clone(),
            this.orbitalY.clone(),
            this.orbitalZ.clone(),
            this.space
        );
    }
    reset(): void {}
}
