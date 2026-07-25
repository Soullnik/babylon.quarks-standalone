import {Behavior} from './Behavior';
import {Particle} from '../Particle';
import {ColorGeneratorFromJSON, FunctionColorGenerator} from '../functions';

/**
 * Color particles by their life.
 */
export class ColorOverLife implements Behavior {
    type = 'ColorOverLife';

    constructor(public color: FunctionColorGenerator) {}

    initialize(particle: Particle): void {
        this.color.startGen(particle.memory);
    }

    update(particle: Particle, delta: number): void {
        const color = particle.color;
        const startColor = particle.startColor;
        this.color.genColor(particle.memory, color, particle.age / particle.life);
        color.x *= startColor.x;
        color.y *= startColor.y;
        color.z *= startColor.z;
        color.w *= startColor.w;
    }

    updateAll(particles: Array<Particle>, count: number, delta: number): void {
        // Hoisting the generator makes genColor a monomorphic call site here,
        // unlike the shared per-particle dispatch in the system.
        const generator = this.color;
        for (let i = 0; i < count; i++) {
            const particle = particles[i];
            if (particle.age >= particle.life) {
                continue;
            }
            const color = particle.color;
            const startColor = particle.startColor;
            generator.genColor(particle.memory, color, particle.age / particle.life);
            color.x *= startColor.x;
            color.y *= startColor.y;
            color.z *= startColor.z;
            color.w *= startColor.w;
        }
    }

    frameUpdate(delta: number): void {
        // Refresh once per frame, before either update path reads the generator,
        // so both see the same values and an edited gradient is picked up.
        this.color.refreshTable?.();
    }

    toJSON(): any {
        return {
            type: this.type,
            color: this.color.toJSON(),
        };
    }

    static fromJSON(json: any): Behavior {
        return new ColorOverLife(ColorGeneratorFromJSON(json.color) as FunctionColorGenerator);
    }

    clone(): Behavior {
        return new ColorOverLife(this.color.clone());
    }
    reset(): void {}
}
