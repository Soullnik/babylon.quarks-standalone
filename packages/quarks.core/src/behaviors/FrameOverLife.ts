import {Particle} from '../Particle';
import {FunctionValueGenerator, ValueGeneratorFromJSON} from '../functions';
import {Behavior} from './Behavior';

/**
 * Apply tile number of particle texture by particles' life.
 */
export class FrameOverLife implements Behavior {
    type = 'FrameOverLife';

    constructor(public frame: FunctionValueGenerator) {}

    initialize(particle: Particle): void {
        this.frame.startGen(particle.memory);
    }

    update(particle: Particle, delta: number): void {
        particle.uvTile = this.frame.genValue(particle.memory, particle.age / particle.life);
    }

    updateAll(particles: Array<Particle>, count: number, delta: number): void {
        const generator = this.frame;
        for (let i = 0; i < count; i++) {
            const particle = particles[i];
            if (particle.age >= particle.life) {
                continue;
            }
            particle.uvTile = generator.genValue(particle.memory, particle.age / particle.life);
        }
    }

    frameUpdate(delta: number): void {
        this.frame.refreshTable?.();
    }

    toJSON(): any {
        return {
            type: this.type,
            frame: this.frame.toJSON(),
        };
    }

    static fromJSON(json: any): Behavior {
        return new FrameOverLife(ValueGeneratorFromJSON(json.frame) as FunctionValueGenerator);
    }

    clone(): Behavior {
        return new FrameOverLife(this.frame.clone());
    }
    reset(): void {}
}
