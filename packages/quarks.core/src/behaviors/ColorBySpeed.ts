import {Particle} from '../Particle';
import {ColorGeneratorFromJSON, FunctionColorGenerator, IntervalValue} from '../functions';
import {Behavior} from './Behavior';
import {speedFraction} from './speedFraction';

/**
 * Colors particles by their current speed, like Unity's Color by Speed: the speed (velocity
 * length times the speed modifier) is placed in `speedRange`, clamped to 0..1, and the gradient is
 * read there and multiplied by the start colour.
 */
export class ColorBySpeed implements Behavior {
    type = 'ColorBySpeed';
    constructor(
        public color: FunctionColorGenerator,
        public speedRange: IntervalValue
    ) {}

    initialize(particle: Particle): void {
        this.color.startGen(particle.memory);
    }

    update(particle: Particle, delta: number): void {
        const t = speedFraction(particle, this.speedRange);
        (this.color as FunctionColorGenerator).genColor(particle.memory, particle.color, t);
        particle.color.x *= particle.startColor.x;
        particle.color.y *= particle.startColor.y;
        particle.color.z *= particle.startColor.z;
        particle.color.w *= particle.startColor.w;
    }

    frameUpdate(delta: number): void {}

    toJSON(): any {
        return {
            type: this.type,
            color: this.color.toJSON(),
            speedRange: this.speedRange.toJSON(),
        };
    }

    static fromJSON(json: any): Behavior {
        return new ColorBySpeed(
            ColorGeneratorFromJSON(json.color) as FunctionColorGenerator,
            IntervalValue.fromJSON(json.speedRange)
        );
    }

    clone(): Behavior {
        return new ColorBySpeed(this.color.clone(), this.speedRange.clone() as IntervalValue);
    }
    reset(): void {}
}
