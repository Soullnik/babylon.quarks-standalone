import type {ValueGeneratorJSON} from '../functions/FunctionJSON';
import {FunctionValueGenerator, ValueGeneratorFromJSON} from '../functions/ValueGenerator';
import {Particle} from '../Particle';
import {Behavior, BehaviorJSON} from './Behavior';
import {stepEndLife} from './stepAge';

/** The JSON of a speed over life: a {@link SpeedOverLife}. */
export interface SpeedOverLifeJSON extends BehaviorJSON {
    /** The speed multiplier over life. */
    speed: ValueGeneratorJSON;
}

/**
 * Apply speed to particles based on their life.
 */
export class SpeedOverLife implements Behavior {
    type = 'SpeedOverLife';

    initialize(particle: Particle): void {
        this.speed.startGen(particle.memory);
    }

    /** @param speed - The speed multiplier over the particle's life. */
    constructor(public speed: FunctionValueGenerator) {}

    update(particle: Particle, delta: number): void {
        particle.speedModifier = this.speed.genValue(particle.memory, stepEndLife(particle, delta));
    }

    updateAll(particles: Array<Particle>, count: number, delta: number): void {
        const generator = this.speed;
        for (let i = 0; i < count; i++) {
            const particle = particles[i];
            if (particle.age >= particle.life) {
                continue;
            }
            particle.speedModifier = generator.genValue(particle.memory, stepEndLife(particle, delta));
        }
    }
    toJSON(): SpeedOverLifeJSON {
        return {
            type: this.type,
            speed: this.speed.toJSON(),
        };
    }

    /** Reads {@link SpeedOverLife.toJSON} output; a field the JSON leaves out takes its default. */
    static fromJSON(json: SpeedOverLifeJSON): Behavior {
        return new SpeedOverLife(ValueGeneratorFromJSON(json.speed) as FunctionValueGenerator);
    }

    frameUpdate(delta: number): void {
        this.speed.refreshTable?.();
    }

    clone(): Behavior {
        return new SpeedOverLife(this.speed.clone());
    }
    reset(): void {}
}
