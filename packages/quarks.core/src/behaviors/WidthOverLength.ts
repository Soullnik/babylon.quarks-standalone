import {Particle, TrailParticle} from '../Particle';
import {FunctionValueGenerator, ValueGeneratorFromJSON} from '../functions/ValueGenerator';
import {Behavior} from './Behavior';

/**
 * Shapes a trail's width along its length — Unity's Width over Trail.
 *
 * The curve runs from the head (0) to the tail (1) and, by default, is a
 * multiplier on the width each sample was recorded with (the particle's
 * `size.x` at that moment): a curve from 1 to 0 tapers the trail from the
 * particle's size at the head down to nothing at the tail, whatever that size
 * is. The head itself gets the curve's value at 0.
 *
 * With `absolute` set the curve is the width itself, in world units, ignoring
 * the particle's size; the head keeps the particle's size. That is how this
 * behavior read every curve up to 0.21, and an effect JSON written by those
 * versions (it has no `absolute` field) still loads that way.
 */
export class WidthOverLength implements Behavior {
    type = 'WidthOverLength';

    initialize(particle: Particle): void {
        this.width.startGen(particle.memory);
    }

    /**
     * @param width - Width along the trail, head (0) to tail (1).
     * @param absolute - Read `width` as world units instead of a multiplier on the particle's size.
     */
    constructor(
        public width: FunctionValueGenerator,
        public absolute = false
    ) {}

    update(particle: Particle): void {
        if (!(particle instanceof TrailParticle)) {
            return;
        }
        const memory = particle.memory;
        // The head is recorded after the behaviors run; give it its factor now
        // so the strip has no step at the tip.
        particle.headWidthScale = this.absolute ? 1 : this.width.genValue(memory, 0);
        const count = particle.historyCount;
        if (count === 0) {
            return;
        }
        const capacity = particle.historyCapacity;
        const sizes = particle.historySizes;
        const baseSizes = particle.historyBaseSizes;
        // The oldest sample sits at 1. A fractional or zero length falls short of the capacity the
        // history keeps, so measure by whichever is longer and never sample the curve past its end.
        const invLength = 1 / Math.max(particle.length, capacity);
        const absolute = this.absolute;
        // Walk the ring buffer oldest-first, wrapping by hand so the loop stays
        // free of divisions.
        let slot = particle.getHistoryIndex(0);
        for (let i = 0; i < count; i++) {
            const factor = this.width.genValue(memory, (count - i) * invLength);
            sizes[slot] = absolute ? factor : baseSizes[slot] * factor;
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
            absolute: this.absolute,
        };
    }

    static fromJSON(json: any): Behavior {
        // JSON from before `absolute` existed was authored against absolute widths.
        return new WidthOverLength(ValueGeneratorFromJSON(json.width) as FunctionValueGenerator, json.absolute ?? true);
    }

    clone(): Behavior {
        return new WidthOverLength(this.width.clone(), this.absolute);
    }
    reset(): void {}
}
