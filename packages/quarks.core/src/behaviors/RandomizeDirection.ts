import {Vector3} from '../math';
import {Particle} from '../Particle';
import {random} from '../util/random';
import {Behavior, BehaviorJSON} from './Behavior';

/** The JSON of a blend of the start direction toward a random one: a {@link RandomizeDirection}. */
export interface RandomizeDirectionJSON extends BehaviorJSON {
    /** How far each direction blends toward a random one, 0 to 1. */
    amount: number;
}

/**
 * Blends each new particle's direction toward a uniformly random one, keeping its speed: Unity's
 * Shape module Randomize Direction. At `amount` 0 the emitter's direction is kept, at 1 every
 * particle leaves in a random direction; between, the direction is the normalized mix of the two.
 */
export class RandomizeDirection implements Behavior {
    type = 'RandomizeDirection';
    /**
     * Scratch value.
     * @internal
     */
    _temp: Vector3 = new Vector3();

    /**
     * @param amount - How far each direction blends toward a random one, 0 to 1; clamped.
     */
    constructor(public amount: number) {}

    initialize(particle: Particle): void {
        const len = particle.velocity.length();
        if (len == 0) return;
        const amount = this.amount < 0 ? 0 : this.amount > 1 ? 1 : this.amount;
        if (amount === 0) return;
        // A uniform point on the unit sphere.
        const z = random() * 2 - 1;
        const phi = random() * Math.PI * 2;
        const r = Math.sqrt(1 - z * z);
        this._temp.set(r * Math.cos(phi), r * Math.sin(phi), z);
        particle.velocity.multiplyScalar((1 - amount) / len).addScaledVector(this._temp, amount);
        // The two can cancel out; the random direction stands in then.
        if (particle.velocity.lengthSq() < 1e-12) particle.velocity.copy(this._temp);
        particle.velocity.setLength(len);
    }

    update(particle: Particle, delta: number): void {}

    frameUpdate(delta: number): void {}

    toJSON(): RandomizeDirectionJSON {
        return {
            type: this.type,
            amount: this.amount,
        };
    }

    /**
     * Reads {@link RandomizeDirection.toJSON} output; a field the JSON leaves out takes its
     * default.
     */
    static fromJSON(json: RandomizeDirectionJSON): Behavior {
        return new RandomizeDirection(json.amount ?? 1);
    }

    clone(): Behavior {
        return new RandomizeDirection(this.amount);
    }

    reset(): void {}
}
