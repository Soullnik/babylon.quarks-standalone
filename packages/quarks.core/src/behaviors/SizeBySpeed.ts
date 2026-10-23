import {
    FunctionValueGenerator,
    GeneratorFromJSON,
    IntervalValue,
    Vector3Function,
    Vector3Generator,
} from '../functions';
import type {IntervalValueJSON, ValueGeneratorJSON, Vector3GeneratorJSON} from '../functions/FunctionJSON';
import {Particle} from '../Particle';
import {Behavior, BehaviorJSON} from './Behavior';
import {speedFraction} from './speedFraction';

/** The JSON of a size by speed: a {@link SizeBySpeed}. */
export interface SizeBySpeedJSON extends BehaviorJSON {
    /** The size over the speed range, uniform or per axis. */
    size: ValueGeneratorJSON | Vector3GeneratorJSON;
    /** The speeds it spans; 0 to 1 when absent. */
    speedRange?: IntervalValueJSON;
}

/**
 * Sizes particles by their current speed, like Unity's Size by Speed: the speed (velocity length
 * times the speed modifier) is placed in `speedRange`, clamped to 0..1, and the curve read there
 * scales the start size.
 */
export class SizeBySpeed implements Behavior {
    type = 'SizeBySpeed';

    initialize(particle: Particle): void {
        this.size.startGen(particle.memory);
    }

    /**
     * @param size - The size multiplier over the speed range: one curve, or a {@link
     *   Vector3Function} for each axis.
     * @param speedRange - The speeds that map to 0 and 1 on the curve (`a` and `b`).
     */
    constructor(
        public size: FunctionValueGenerator | Vector3Generator,
        public speedRange: IntervalValue
    ) {}

    update(particle: Particle): void {
        const t = speedFraction(particle, this.speedRange);
        if (this.size instanceof Vector3Function) {
            this.size.genValue(particle.memory, particle.size, t).multiply(particle.startSize);
        } else {
            particle.size
                .copy(particle.startSize)
                .multiplyScalar((this.size as FunctionValueGenerator).genValue(particle.memory, t));
        }
    }

    toJSON(): SizeBySpeedJSON {
        return {
            type: this.type,
            size: this.size.toJSON(),
            speedRange: this.speedRange.toJSON(),
        };
    }

    /** Reads {@link SizeBySpeed.toJSON} output; a field the JSON leaves out takes its default. */
    static fromJSON(json: SizeBySpeedJSON): Behavior {
        return new SizeBySpeed(
            GeneratorFromJSON(json.size) as FunctionValueGenerator,
            json.speedRange ? IntervalValue.fromJSON(json.speedRange) : new IntervalValue(0, 1)
        );
    }

    frameUpdate(delta: number): void {}

    clone(): Behavior {
        return new SizeBySpeed(this.size.clone(), this.speedRange.clone() as IntervalValue);
    }

    reset(): void {}
}
