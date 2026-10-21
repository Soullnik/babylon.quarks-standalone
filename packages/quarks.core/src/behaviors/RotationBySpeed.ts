import {Particle} from '../Particle';
import {IntervalValue} from '../functions';
import {FunctionValueGenerator, ValueGenerator, ValueGeneratorFromJSON} from '../functions/ValueGenerator';
import {Quaternion} from '../math';
import {Behavior} from './Behavior';
import {speedFraction} from './speedFraction';

/**
 * Turns particles at a rate read off their current speed, like Unity's Rotation by Speed: the
 * speed (velocity length times the speed modifier) is placed in `speedRange`, clamped to 0..1.
 * Billboards only; particles rotating by quaternion are left alone.
 */
export class RotationBySpeed implements Behavior {
    type = 'RotationBySpeed';
    private tempQuat = new Quaternion();

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

    toJSON(): any {
        return {
            type: this.type,
            angularVelocity: this.angularVelocity.toJSON(),
            speedRange: this.speedRange.toJSON(),
        };
    }

    static fromJSON(json: any): Behavior {
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
