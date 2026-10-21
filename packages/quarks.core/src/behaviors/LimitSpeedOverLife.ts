import {IParticleSystem} from '../IParticleSystem';
import {Particle} from '../Particle';
import {FunctionValueGenerator, ValueGeneratorFromJSON} from '../functions';
import {Behavior} from './Behavior';

/** The step rate `dampen` was defined at: 1/3 of the excess per step at 60 Hz. */
const REFERENCE_RATE = 60;

/**
 * Limits the speed of particles over their life, like Unity's Limit Velocity over Lifetime: a
 * particle faster than `speed` loses part of the excess each step.
 */
export class LimitSpeedOverLife implements Behavior {
    type = 'LimitSpeedOverLife';
    /** Learned in {@link initialize}; its motion scale multiplies the limit of a world-space system. */
    ps?: IParticleSystem;

    initialize(particle: Particle, particleSystem?: IParticleSystem): void {
        if (particleSystem !== undefined) {
            this.ps = particleSystem;
        }
        this.speed.startGen(particle.memory);
    }

    /** What the limit is multiplied by: the system's motion scale in world space, else 1. */
    motionScale(): number {
        const system = this.ps;
        return system !== undefined && system.worldSpace ? (system.motionScale ?? 1) : 1;
    }

    constructor(
        /** The speed limit over the particle's life. */
        public speed: FunctionValueGenerator,
        /**
         * How much of the excess speed goes, from 0 (none) to 1, clamped. At 60 steps a second each
         * step removes `dampen / 3` of it; other step lengths remove the share that compounds to the
         * same loss per second, so the result does not depend on the frame rate. Even at 1 the
         * limit is approached over a few steps rather than held exactly.
         */
        public dampen: number
    ) {}

    /** The share of the excess speed one step of `delta` seconds removes; see {@link dampen}. */
    dampenStep(delta: number): number {
        const dampen = this.dampen > 1 ? 1 : this.dampen > 0 ? this.dampen : 0;
        return 1 - Math.pow(1 - dampen / 3, delta * REFERENCE_RATE);
    }

    update(particle: Particle, delta: number): void {
        let speed = particle.velocity.length();
        let limit = this.speed.genValue(particle.memory, particle.age / particle.life) * this.motionScale();
        if (speed > limit) {
            const percent = (speed - limit) / speed;
            particle.velocity.multiplyScalar(1 - percent * this.dampenStep(delta));
        }
    }

    updateAll(particles: Array<Particle>, count: number, delta: number): void {
        const generator = this.speed;
        const dampenStep = this.dampenStep(delta);
        const motionScale = this.motionScale();
        for (let i = 0; i < count; i++) {
            const particle = particles[i];
            if (particle.age >= particle.life) {
                continue;
            }
            const velocity = particle.velocity;
            const speed = velocity.length();
            const limit = generator.genValue(particle.memory, particle.age / particle.life) * motionScale;
            if (speed > limit) {
                velocity.multiplyScalar(1 - ((speed - limit) / speed) * dampenStep);
            }
        }
    }
    toJSON(): any {
        return {
            type: this.type,
            speed: this.speed.toJSON(),
            dampen: this.dampen,
        };
    }

    static fromJSON(json: any): Behavior {
        return new LimitSpeedOverLife(ValueGeneratorFromJSON(json.speed) as FunctionValueGenerator, json.dampen);
    }

    frameUpdate(delta: number): void {
        this.speed.refreshTable?.();
    }

    clone(): Behavior {
        return new LimitSpeedOverLife(this.speed.clone(), this.dampen);
    }
    reset(): void {}
}
