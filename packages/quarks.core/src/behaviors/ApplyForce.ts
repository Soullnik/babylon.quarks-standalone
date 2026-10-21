import {Particle} from '../Particle';
import {ConstantValue, ValueGenerator, ValueGeneratorFromJSON} from '../functions';
import {Vector3} from '../math';
import {Behavior} from './Behavior';

/**
 * Apply a constant force along one direction to every particle, like gravity or wind.
 *
 * `magnitude` is rolled per particle when it is emitted: a {@link ConstantValue} pushes every
 * particle equally, an {@link IntervalValue} gives each particle its own strength for its whole
 * life, as Unity's Force over Lifetime does with Random Between Two Constants.
 */
export class ApplyForce implements Behavior {
    type = 'ApplyForce';

    constructor(
        /** The direction of the force; its length scales it. */
        public direction: Vector3,
        /** The force's strength, in units per second squared, rolled per particle. */
        public magnitude: ValueGenerator
    ) {}

    initialize(particle: Particle): void {
        this.magnitude.startGen(particle.memory);
    }

    update(particle: Particle, delta: number): void {
        const scale = this.magnitude.genValue(particle.memory) * delta;
        const direction = this.direction;
        const velocity = particle.velocity;
        velocity.x += direction.x * scale;
        velocity.y += direction.y * scale;
        velocity.z += direction.z * scale;
    }

    updateAll(particles: Array<Particle>, count: number, delta: number): void {
        const generator = this.magnitude;
        const direction = this.direction;
        // A constant force is the same for every particle, so it collapses to
        // three numbers computed once per frame.
        const constant = generator instanceof ConstantValue;
        const fixed = constant ? generator.value * delta : 0;
        for (let i = 0; i < count; i++) {
            const particle = particles[i];
            if (particle.age >= particle.life) {
                continue;
            }
            const scale = constant ? fixed : generator.genValue(particle.memory) * delta;
            const velocity = particle.velocity;
            velocity.x += direction.x * scale;
            velocity.y += direction.y * scale;
            velocity.z += direction.z * scale;
        }
    }

    frameUpdate(delta: number): void {}

    toJSON(): any {
        return {
            type: this.type,
            direction: [this.direction.x, this.direction.y, this.direction.z],
            magnitude: this.magnitude.toJSON(),
        };
    }

    static fromJSON(json: any): Behavior {
        return new ApplyForce(
            new Vector3(json.direction[0], json.direction[1], json.direction[2]),
            ValueGeneratorFromJSON(json.magnitude ?? json.force) as ValueGenerator
        );
    }

    clone(): Behavior {
        return new ApplyForce(this.direction.clone(), this.magnitude.clone());
    }

    reset(): void {}
}
