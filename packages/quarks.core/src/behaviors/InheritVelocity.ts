import {IParticleSystem} from '../IParticleSystem';
import {Particle} from '../Particle';
import {ConstantValue, FunctionValueGenerator, ValueGenerator, ValueGeneratorFromJSON} from '../functions';
import {Quaternion, Vector3} from '../math';
import {Behavior} from './Behavior';

export type InheritVelocityMode = 'initial' | 'current';

/**
 * Make particles inherit the emitter's movement velocity (Unity's "Inherit Velocity").
 * 'initial' adds the emitter velocity to the particle velocity once at spawn;
 * 'current' displaces particles by the current emitter velocity every frame.
 */
export class InheritVelocity implements Behavior {
    type = 'InheritVelocity';
    /** Learned in {@link initialize}, so undefined until this behavior sees a particle. */
    ps?: IParticleSystem;

    constructor(
        public multiplier: FunctionValueGenerator | ValueGenerator = new ConstantValue(1),
        public mode: InheritVelocityMode = 'initial'
    ) {}

    _temp = new Vector3();
    _tempPos = new Vector3();
    _tempQInv = new Quaternion();
    _tempScaleInv = new Vector3(1, 1, 1);

    initialize(particle: Particle, particleSystem: IParticleSystem): void {
        this.ps = particleSystem;
        this.multiplier.startGen(particle.memory);
        if (this.mode === 'initial' && particleSystem.emitterVelocity) {
            this._temp.copy(particleSystem.emitterVelocity);
            if (!particleSystem.worldSpace) {
                // initialize runs during emit(), before this frame's frameUpdate cache
                // exists, so decompose the emitter matrix on demand.
                this.decomposeInverse(particleSystem);
                this._temp.multiply(this._tempScaleInv).applyQuaternion(this._tempQInv);
            }
            particle.velocity.addScaledVector(this._temp, this.multiplier.genValue(particle.memory, 0));
        }
    }

    frameUpdate(delta: number): void {
        if (this.ps && !this.ps.worldSpace) {
            this.decomposeInverse(this.ps);
        }
    }

    update(particle: Particle, delta: number): void {
        // ps is undefined until initialize() has run for this behavior.
        if (this.mode !== 'current' || this.ps === undefined || !this.ps.emitterVelocity) {
            return;
        }
        this._temp.copy(this.ps.emitterVelocity);
        if (!this.ps.worldSpace) {
            this._temp.multiply(this._tempScaleInv).applyQuaternion(this._tempQInv);
        }
        particle.position.addScaledVector(
            this._temp,
            this.multiplier.genValue(particle.memory, particle.age / particle.life) * delta
        );
    }

    private decomposeInverse(particleSystem: IParticleSystem): void {
        particleSystem.emitter.matrixWorld.decompose(this._tempPos, this._tempQInv, this._tempScaleInv);
        this._tempQInv.invert();
        this._tempScaleInv.set(1 / this._tempScaleInv.x, 1 / this._tempScaleInv.y, 1 / this._tempScaleInv.z);
    }

    toJSON(): any {
        return {
            type: this.type,
            multiplier: this.multiplier.toJSON(),
            mode: this.mode,
        };
    }

    static fromJSON(json: any): Behavior {
        return new InheritVelocity(
            json.multiplier
                ? (ValueGeneratorFromJSON(json.multiplier) as FunctionValueGenerator)
                : new ConstantValue(1),
            json.mode === 'current' ? 'current' : 'initial'
        );
    }

    clone(): Behavior {
        return new InheritVelocity(this.multiplier.clone(), this.mode);
    }
    reset(): void {}
}
