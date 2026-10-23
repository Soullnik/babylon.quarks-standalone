import {IntervalValue} from '../functions';
import type {IntervalValueJSON, ValueGeneratorJSON} from '../functions/FunctionJSON';
import {FunctionValueGenerator, ValueGenerator, ValueGeneratorFromJSON} from '../functions/ValueGenerator';
import {Quaternion} from '../math';
import {Particle} from '../Particle';
import {Behavior, BehaviorJSON} from './Behavior';
import {speedFraction} from './speedFraction';

/** The JSON of a rotation by speed: a {@link RotationBySpeed}. */
export interface RotationBySpeedJSON extends BehaviorJSON {
    /** The angular velocity over the speed range. */
    angularVelocity: ValueGeneratorJSON;
    /** The speeds it spans; 0 to 1 when absent. */
    speedRange?: IntervalValueJSON;
}

/**
 * Turns particles at a rate read off their current speed, like Unity's Rotation by Speed: the
 * speed (velocity length times the speed modifier) is placed in `speedRange`, clamped to 0..1.
 * Billboards only; particles rotating by quaternion are left alone.
 */
export class RotationBySpeed implements Behavior {
    type = 'RotationBySpeed';
    private tempQuat = new Quaternion();

    /**
     * @param angularVelocity - Turn rate in radians per second over the speed range.
     * @param speedRange - The speeds that map to 0 and 1 on the curve (`a` and `b`).
     */
    constructor(
        public angularVelocity: ValueGenerator | FunctionValueGenerator,
        public speedRange: IntervalValue
    ) {}

    initialize(particle: Particle): void {
        if (typeof particle.rotation === 'number') {
            (this.angularVelocity as ValueGenerator).startGen(particle.memory);
        }
    }

    update(particle: Particle, delta: number): void {
        if (typeof particle.rotation === 'number') {
            const t = speedFraction(particle, this.speedRange);
            const rate = (this.angularVelocity as FunctionValueGenerator).genValue(particle.memory, t);
            (particle.rotation as number) += delta * rate;
            // Kept for the renderer, which draws between steps.
            particle.angularVelocity = rate;
        }
    }

    toJSON(): RotationBySpeedJSON {
        return {
            type: this.type,
            angularVelocity: this.angularVelocity.toJSON(),
            speedRange: this.speedRange.toJSON(),
        };
    }

    /**
     * Reads {@link RotationBySpeed.toJSON} output; a field the JSON leaves out takes its default.
     */
    static fromJSON(json: RotationBySpeedJSON): Behavior {
        return new RotationBySpeed(
            ValueGeneratorFromJSON(json.angularVelocity) as FunctionValueGenerator,
            json.speedRange ? IntervalValue.fromJSON(json.speedRange) : new IntervalValue(0, 1)
        );
    }

    frameUpdate(delta: number): void {}

    clone(): Behavior {
        return new RotationBySpeed(this.angularVelocity.clone(), this.speedRange.clone() as IntervalValue);
    }

    reset(): void {}
}
