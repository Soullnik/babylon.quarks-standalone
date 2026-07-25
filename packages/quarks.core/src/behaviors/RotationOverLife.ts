import {Behavior} from './Behavior';
import {Particle} from '../Particle';
import {FunctionValueGenerator, ValueGenerator, ValueGeneratorFromJSON} from '../functions/ValueGenerator';

/**
 * Apply rotation to particles over their life.
 */
export class RotationOverLife implements Behavior {
    type = 'RotationOverLife';

    constructor(public angularVelocity: ValueGenerator | FunctionValueGenerator) {}

    initialize(particle: Particle): void {
        if (typeof particle.rotation === 'number') {
            (this.angularVelocity as ValueGenerator).startGen(particle.memory);
        }
    }

    update(particle: Particle, delta: number): void {
        if (typeof particle.rotation === 'number') {
            const rate = (this.angularVelocity as FunctionValueGenerator).genValue(
                particle.memory,
                particle.age / particle.life
            );
            (particle.rotation as number) += delta * rate;
            // Kept for the renderer, which draws between steps and has no other
            // way to know how fast this particle is turning.
            particle.angularVelocity = rate;
        }
    }

    updateAll(particles: Array<Particle>, count: number, delta: number): void {
        const generator = this.angularVelocity as FunctionValueGenerator;
        for (let i = 0; i < count; i++) {
            const particle = particles[i];
            if (particle.age >= particle.life || typeof particle.rotation !== 'number') {
                continue;
            }
            const rate = generator.genValue(particle.memory, particle.age / particle.life);
            particle.rotation += delta * rate;
            particle.angularVelocity = rate;
        }
    }

    toJSON(): any {
        return {
            type: this.type,
            angularVelocity: this.angularVelocity.toJSON(),
        };
    }

    static fromJSON(json: any): Behavior {
        return new RotationOverLife(ValueGeneratorFromJSON(json.angularVelocity) as FunctionValueGenerator);
    }

    frameUpdate(delta: number): void {
        this.angularVelocity.refreshTable?.();
    }

    clone(): Behavior {
        return new RotationOverLife(this.angularVelocity.clone());
    }
    reset(): void {}
}
