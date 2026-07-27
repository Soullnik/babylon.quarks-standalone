import {Particle} from '../Particle';
import {IntervalValue} from '../functions';
import {FunctionValueGenerator, ValueGenerator, ValueGeneratorFromJSON} from '../functions/ValueGenerator';
import {Quaternion} from '../math';
import {Behavior} from './Behavior';

/**
 * Apply rotation to particles based on their speed.
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
            const t = (particle.startSpeed - this.speedRange.a) / (this.speedRange.b - this.speedRange.a);
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
            IntervalValue.fromJSON(json.speedRange)
        );
    }

    frameUpdate(delta: number): void {}

    clone(): Behavior {
        return new RotationBySpeed(this.angularVelocity.clone(), this.speedRange.clone() as IntervalValue);
    }

    reset(): void {}
}
