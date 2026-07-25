import {Behavior} from './Behavior';
import {Particle} from '../Particle';
import {FunctionValueGenerator, ValueGenerator, ValueGeneratorFromJSON} from '../functions';
import {Quaternion, Vector3} from '../math';
import {IParticleSystem} from '../IParticleSystem';

/**
 * Apply a force to particles over their life.
 */
export class ForceOverLife implements Behavior {
    type = 'ForceOverLife';
    _temp = new Vector3();
    /** Learned in {@link initialize}, so undefined until this behavior sees a particle. */
    ps?: IParticleSystem;

    initialize(particle: Particle, particleSystem: IParticleSystem): void {
        this.ps = particleSystem;
        this.x.startGen(particle.memory);
        this.y.startGen(particle.memory);
        this.z.startGen(particle.memory);
    }

    constructor(
        public x: FunctionValueGenerator | ValueGenerator,
        public y: FunctionValueGenerator | ValueGenerator,
        public z: FunctionValueGenerator | ValueGenerator
    ) {}

    update(particle: Particle, delta: number): void {
        this._temp.set(
            this.x.genValue(particle.memory, particle.age / particle.life),
            this.y.genValue(particle.memory, particle.age / particle.life),
            this.z.genValue(particle.memory, particle.age / particle.life)
        );
        // Undefined until initialize() has run for this behavior; treat an
        // unknown system as world space rather than throwing.
        if (this.ps === undefined || this.ps.worldSpace) {
            particle.velocity.addScaledVector(this._temp, delta);
        } else {
            this._temp.multiply(this._tempScale).applyQuaternion(this._tempQ);
            particle.velocity.addScaledVector(this._temp, delta);
        }
    }

    updateAll(particles: Array<Particle>, count: number, delta: number): void {
        const system = this.ps;
        // The system is only learned in initialize(), which has not run while the
        // system is empty — a sub emitter waiting to be triggered, or a behavior
        // added after the particles were spawned. There is nothing to apply yet.
        if (system === undefined) {
            return;
        }
        const temp = this._temp;
        const generatorX = this.x;
        const generatorY = this.y;
        const generatorZ = this.z;
        // The space test is per system, not per particle.
        const worldSpace = system.worldSpace;
        for (let i = 0; i < count; i++) {
            const particle = particles[i];
            if (particle.age >= particle.life) {
                continue;
            }
            const memory = particle.memory;
            const t = particle.age / particle.life;
            temp.set(generatorX.genValue(memory, t), generatorY.genValue(memory, t), generatorZ.genValue(memory, t));
            if (!worldSpace) {
                temp.multiply(this._tempScale).applyQuaternion(this._tempQ);
            }
            particle.velocity.addScaledVector(temp, delta);
        }
    }

    toJSON(): any {
        return {
            type: this.type,
            x: this.x.toJSON(),
            y: this.y.toJSON(),
            z: this.z.toJSON(),
        };
    }

    static fromJSON(json: any): Behavior {
        return new ForceOverLife(
            ValueGeneratorFromJSON(json.x) as FunctionValueGenerator,
            ValueGeneratorFromJSON(json.y) as FunctionValueGenerator,
            ValueGeneratorFromJSON(json.z) as FunctionValueGenerator
        );
    }

    _tempScale = new Vector3();
    _tempQ = new Quaternion();

    frameUpdate(delta: number): void {
        if (this.ps && !this.ps.worldSpace) {
            const translation = this._temp;
            const quaternion = this._tempQ;
            const scale = this._tempScale;
            this.ps.emitter.matrixWorld.decompose(translation, quaternion, scale);
            quaternion.invert();
            scale.set(1 / scale.x, 1 / scale.y, 1 / scale.z);
        }
    }

    clone(): Behavior {
        return new ForceOverLife(this.x.clone(), this.y.clone(), this.z.clone());
    }
    reset(): void {}
}
