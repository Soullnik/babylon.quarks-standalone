import {ColorGeneratorFromJSON, FunctionColorGenerator, IntervalValue} from '../functions';
import type {ColorGeneratorJSON, IntervalValueJSON} from '../functions/FunctionJSON';
import {Particle} from '../Particle';
import {Behavior, BehaviorJSON} from './Behavior';
import {speedFraction} from './speedFraction';

/** The JSON of a colour by speed: a {@link ColorBySpeed}. */
export interface ColorBySpeedJSON extends BehaviorJSON {
    /** The colour over the speed range. */
    color: ColorGeneratorJSON;
    /** The speeds the colour spans; 0 to 1 when absent. */
    speedRange?: IntervalValueJSON;
}

/**
 * Colors particles by their current speed, like Unity's Color by Speed: the speed (velocity
 * length times the speed modifier) is placed in `speedRange`, clamped to 0..1, and the gradient is
 * read there and multiplied by the start colour.
 */
export class ColorBySpeed implements Behavior {
    type = 'ColorBySpeed';
    /**
     * @param color - The gradient over the speed range, multiplying the start colour.
     * @param speedRange - The speeds that map to 0 and 1 on the gradient (`a` and `b`).
     */
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

    toJSON(): ColorBySpeedJSON {
        return {
            type: this.type,
            color: this.color.toJSON(),
            speedRange: this.speedRange.toJSON(),
        };
    }

    /** Reads {@link ColorBySpeed.toJSON} output; a field the JSON leaves out takes its default. */
    static fromJSON(json: ColorBySpeedJSON): Behavior {
        return new ColorBySpeed(
            ColorGeneratorFromJSON(json.color) as FunctionColorGenerator,
            json.speedRange ? IntervalValue.fromJSON(json.speedRange) : new IntervalValue(0, 1)
        );
    }

    clone(): Behavior {
        return new ColorBySpeed(this.color.clone(), this.speedRange.clone() as IntervalValue);
    }
    reset(): void {}
}
