import {Behavior} from './Behavior';
import {Particle, TrailParticle} from '../Particle';
import {FunctionValueGenerator, ValueGeneratorFromJSON} from '../functions/ValueGenerator';

/**
 * Apply width to particles based on their length.
 */
export class WidthOverLength implements Behavior {
    type = 'WidthOverLength';

    initialize(particle: Particle): void {
        this.width.startGen(particle.memory);
    }

    constructor(public width: FunctionValueGenerator) {}

    update(particle: Particle): void {
        if (!(particle instanceof TrailParticle)) {
            return;
        }
        const count = particle.historyCount;
        if (count === 0) {
            return;
        }
        const capacity = particle.historyCapacity;
        const sizes = particle.historySizes;
        const memory = particle.memory;
        const invLength = 1 / particle.length;
        // Walk the ring buffer oldest-first, wrapping by hand so the loop stays
        // free of divisions.
        let slot = particle.getHistoryIndex(0);
        for (let i = 0; i < count; i++) {
            sizes[slot] = this.width.genValue(memory, (count - i) * invLength);
            slot++;
            if (slot === capacity) {
                slot = 0;
            }
        }
    }

    frameUpdate(delta: number): void {}

    toJSON(): any {
        return {
            type: this.type,
            width: this.width.toJSON(),
        };
    }

    static fromJSON(json: any): Behavior {
        return new WidthOverLength(ValueGeneratorFromJSON(json.width) as FunctionValueGenerator);
    }

    clone(): Behavior {
        return new WidthOverLength(this.width.clone());
    }
    reset(): void {}
}
