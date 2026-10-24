import {FunctionValueGenerator, ValueGenerator, ValueGeneratorFromJSON, Vector3Function} from '../functions';
import type {ValueGeneratorJSON, Vector3FunctionJSON} from '../functions/FunctionJSON';
import {IParticleSystem} from '../IParticleSystem';
import {Vector3} from '../math';
import {Particle} from '../Particle';
import {Behavior, BehaviorJSON} from './Behavior';
import {BehaviorSpace, EmitterFrame, readBehaviorSpace} from './EmitterFrame';

/** The step rate `dampen` was defined at: 1/3 of the excess per step at 60 Hz. */
const REFERENCE_RATE = 60;

/** The JSON of a speed limit over life: a {@link LimitSpeedOverLife}. */
export interface LimitSpeedOverLifeJSON extends BehaviorJSON {
    /** The limit: one curve for the speed, or a `Vector3Function` for each axis. */
    speed: ValueGeneratorJSON | Vector3FunctionJSON;
    /** How much excess speed goes per step; 1 when absent. */
    dampen?: number;
    /** The space of per-axis limits; `'local'` when absent. Written only when not the default. */
    space?: BehaviorSpace;
}

/**
 * Limits the speed of particles over their life, like Unity's Limit Velocity over Lifetime: a
 * particle faster than `speed` loses part of the excess each step.
 *
 * With a {@link Vector3Function} as `speed` it is Unity's Separate Axes: each component of the
 * velocity, measured along the axes of {@link space}, is limited by its own curve and keeps its
 * sign. Applies in every render mode.
 */
export class LimitSpeedOverLife implements Behavior {
    type = 'LimitSpeedOverLife';
    /** Learned in {@link initialize}; its motion scale multiplies the limit of a world-space system. */
    ps?: IParticleSystem;
    /** The emitter's transform this frame, refreshed by {@link frameUpdate} for per-axis limits. */
    readonly _frame = new EmitterFrame();
    /**
     * Scratch values.
     * @internal
     */
    _limit = new Vector3();
    /** @internal */
    _velocity = new Vector3();

    initialize(particle: Particle, particleSystem?: IParticleSystem): void {
        if (particleSystem !== undefined) {
            this.ps = particleSystem;
        }
        this.speed.startGen(particle.memory);
    }

    /** What the limit is multiplied by: the system's motion scale in world space, else 1. */
    motionScale(): number {
        const system = this.ps;
        return system !== undefined && system.worldSpace ? (system.motionScale ?? 1) : 1;
    }

    constructor(
        /**
         * The speed limit over the particle's life: one curve for the speed, or a
         * {@link Vector3Function} with a limit for each axis (Unity's Separate Axes).
         */
        public speed: FunctionValueGenerator | ValueGenerator | Vector3Function,
        /**
         * How much of the excess speed goes, from 0 (none) to 1, clamped. At 60 steps a second each
         * step removes `dampen / 3` of it; other step lengths remove the share that compounds to the
         * same loss per second, so the result does not depend on the frame rate. Even at 1 the
         * limit is approached over a few steps rather than held exactly.
         */
        public dampen: number,
        /**
         * The axes per-axis limits are measured along, as Unity's Space setting: the emitter's own
         * (`'local'`, the default), which turn and scale with it, or the world's. A single speed
         * limit has no axes and ignores it.
         */
        public space: BehaviorSpace = 'local'
    ) {}

    /**
     * Whether the frame is read: per-axis limits authored in another space than the simulation's.
     * @internal
     */
    _convertsSpace(): boolean {
        const worldSpace = this.ps === undefined || this.ps.worldSpace;
        return this.speed instanceof Vector3Function && worldSpace !== (this.space === 'world');
    }

    /**
     * Limits each axis of `velocity` (in the simulation space) by the per-axis limits at `t`.
     * The excess is worked out in {@link space} and taken off in the simulation space, so an axis
     * the emitter's scale flattens keeps its velocity rather than losing it.
     * @internal
     */
    _limitAxes(particle: Particle, t: number, step: number, motionScale: number, convert: boolean) {
        const limit = (this.speed as Vector3Function).genValue(particle.memory, this._limit, t);
        const velocity = this._velocity.copy(particle.velocity);
        const worldSpace = this.ps === undefined || this.ps.worldSpace;
        if (convert) {
            this._frame.fromSimulation(velocity, this.space, worldSpace);
        }
        const scale = this.space === 'world' ? motionScale : 1;
        const ex = excess(velocity.x, limit.x * scale);
        const ey = excess(velocity.y, limit.y * scale);
        const ez = excess(velocity.z, limit.z * scale);
        if (ex === 0 && ey === 0 && ez === 0) {
            return;
        }
        velocity.set(-ex * step, -ey * step, -ez * step);
        if (convert) {
            this._frame.toSimulation(velocity, this.space, worldSpace);
        }
        particle.velocity.add(velocity);
    }

    /** The share of the excess speed one step of `delta` seconds removes; see {@link dampen}. */
    dampenStep(delta: number): number {
        const dampen = this.dampen > 1 ? 1 : this.dampen > 0 ? this.dampen : 0;
        return 1 - Math.pow(1 - dampen / 3, delta * REFERENCE_RATE);
    }

    update(particle: Particle, delta: number): void {
        if (this.speed instanceof Vector3Function) {
            const t = particle.age / particle.life;
            this._limitAxes(particle, t, this.dampenStep(delta), this.motionScale(), this._convertsSpace());
            return;
        }
        const speed = particle.velocity.length();
        const limit = this.speed.genValue(particle.memory, particle.age / particle.life) * this.motionScale();
        if (speed > limit) {
            const percent = (speed - limit) / speed;
            particle.velocity.multiplyScalar(1 - percent * this.dampenStep(delta));
        }
    }

    updateAll(particles: Array<Particle>, count: number, delta: number): void {
        const generator = this.speed;
        const dampenStep = this.dampenStep(delta);
        const motionScale = this.motionScale();
        if (generator instanceof Vector3Function) {
            const convert = this._convertsSpace();
            for (let i = 0; i < count; i++) {
                const particle = particles[i];
                if (particle.age < particle.life) {
                    this._limitAxes(particle, particle.age / particle.life, dampenStep, motionScale, convert);
                }
            }
            return;
        }
        for (let i = 0; i < count; i++) {
            const particle = particles[i];
            if (particle.age >= particle.life) {
                continue;
            }
            const velocity = particle.velocity;
            const speed = velocity.length();
            const limit = generator.genValue(particle.memory, particle.age / particle.life) * motionScale;
            if (speed > limit) {
                velocity.multiplyScalar(1 - ((speed - limit) / speed) * dampenStep);
            }
        }
    }
    toJSON(): LimitSpeedOverLifeJSON {
        return {
            type: this.type,
            speed: this.speed.toJSON(),
            dampen: this.dampen,
            ...(this.space !== 'local' ? {space: this.space} : {}),
        };
    }

    /**
     * Reads {@link LimitSpeedOverLife.toJSON} output; a field the JSON leaves out takes its
     * default, and a speed that is neither a number generator nor a `Vector3Function` warns and
     * reads as 0.
     */
    static fromJSON(json: LimitSpeedOverLifeJSON): Behavior {
        return new LimitSpeedOverLife(
            // A per-axis limit, or one for the speed; anything else warns and reads as 0.
            json.speed?.type === 'Vector3Function'
                ? (Vector3Function.fromJSON(json.speed as Vector3FunctionJSON) as Vector3Function)
                : ValueGeneratorFromJSON(json.speed as ValueGeneratorJSON),
            typeof json.dampen === 'number' ? json.dampen : 1,
            readBehaviorSpace(json.space, 'local')
        );
    }

    frameUpdate(delta: number): void {
        const speed = this.speed;
        if (speed instanceof Vector3Function) {
            speed.x.refreshTable?.();
            speed.y.refreshTable?.();
            speed.z.refreshTable?.();
            if (this.ps !== undefined && this._convertsSpace()) {
                this._frame.refresh(this.ps);
            }
        } else {
            speed.refreshTable?.();
        }
    }

    clone(): Behavior {
        return new LimitSpeedOverLife(
            this.speed.clone() as FunctionValueGenerator | ValueGenerator | Vector3Function,
            this.dampen,
            this.space
        );
    }
    reset(): void {}
}

/** How far `value` is past `limit` (a limit below 0 counts as 0), with its sign; 0 within it. */
function excess(value: number, limit: number): number {
    const bound = limit > 0 ? limit : 0;
    return value > bound ? value - bound : value < -bound ? value + bound : 0;
}
