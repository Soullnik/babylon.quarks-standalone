import {Particle} from '../Particle';
import {FunctionValueGenerator, IntervalValue, ValueGenerator, ValueGeneratorFromJSON} from '../functions';
import {Behavior} from './Behavior';

/**
 * How {@link FrameOverLife} plays the sheet, beyond sampling `frame` over the
 * particle's life. Every field is optional, and leaving them all out keeps the
 * plain life-fraction behaviour.
 */
export interface FrameOverLifeOptions {
    /**
     * Frames per second. Above zero the sheet plays by the particle's age in
     * seconds instead of its life fraction, Unity's "FPS" time mode: `frame`
     * then gives the first frame of the segment, and the frame advances by one
     * every `1 / fps` seconds. Needs {@link frameCount}.
     */
    fps?: number;
    /**
     * Life mode only: how many times `frame` plays over the particle's life
     * (Unity's "Cycles"). Default 1.
     */
    cycles?: number;
    /**
     * Frames in the segment that plays, from the first frame. In FPS mode the
     * frame wraps (or holds, see {@link loop}) at it, counted from `frame`;
     * in life mode the curve plus a {@link startFrame} offset wraps into
     * `[0, frameCount)`, so the curve should start at frame 0. 0, the default,
     * means no segment.
     */
    frameCount?: number;
    /** FPS mode: wrap back to the first frame of the segment (default) or hold its last. */
    loop?: boolean;
    /**
     * FPS mode: every `1 / fps` seconds show a random frame of the segment
     * instead of the next one, each particle its own sequence: the flicker of
     * lightning, sparks or a neon sign. Needs {@link frameCount}; `loop` does
     * not apply. Default false.
     */
    random?: boolean;
    /**
     * Per-particle frame offset, sampled once at birth: an `IntervalValue(0, n)`
     * starts each particle on a random frame (Unity's "Start Frame"). Default none.
     */
    startFrame?: ValueGenerator;
}

/**
 * Sets the particle's texture tile (`uvTile`) over its life.
 *
 * By default `frame` is sampled at the particle's life fraction. The
 * {@link FrameOverLifeOptions} add the rest of Unity's texture sheet
 * animation: playing at a fixed frame rate, several cycles per life, a frame
 * segment that loops or holds, a random start frame, and a random frame on
 * every tick.
 */
export class FrameOverLife implements Behavior {
    type = 'FrameOverLife';

    private _frame!: FunctionValueGenerator | ValueGenerator;

    fps: number;
    cycles: number;
    frameCount: number;
    loop: boolean;
    random: boolean;
    startFrame?: ValueGenerator;

    /** A per-particle sample that sets each particle's random sequence apart. */
    private readonly salt = new IntervalValue(0, 1);

    constructor(frame: FunctionValueGenerator | ValueGenerator, options: FrameOverLifeOptions = {}) {
        this.frame = frame;
        this.fps = options.fps ?? 0;
        this.cycles = options.cycles ?? 1;
        this.frameCount = options.frameCount ?? 0;
        this.loop = options.loop ?? true;
        this.random = options.random ?? false;
        this.startFrame = options.startFrame;
    }

    get frame(): FunctionValueGenerator | ValueGenerator {
        return this._frame;
    }

    set frame(frame: FunctionValueGenerator | ValueGenerator) {
        this._frame = frame;
    }

    /** True when no option is in play and the frame is just `frame` at the life fraction. */
    isPlain(): boolean {
        return !(this.fps > 0) && this.cycles === 1 && this.startFrame === undefined;
    }

    initialize(particle: Particle): void {
        this._frame.startGen(particle.memory);
        this.startFrame?.startGen(particle.memory);
        // Claimed whether or not `random` is on, so turning it on mid-play
        // reads each particle's own salt, not another generator's slot.
        this.salt.startGen(particle.memory);
    }

    update(particle: Particle, delta: number): void {
        particle.uvTile = this.frameAt(particle, particle.age, particle.age / particle.life);
    }

    updateAll(particles: Array<Particle>, count: number, delta: number): void {
        for (let i = 0; i < count; i++) {
            const particle = particles[i];
            if (particle.age >= particle.life) {
                continue;
            }
            particle.uvTile = this.frameAt(particle, particle.age, particle.age / particle.life);
        }
    }

    /** The tile for `particle` at `age` seconds, `t` being that age over its life. */
    frameAt(particle: Particle, age: number, t: number): number {
        if (this.fps > 0) {
            const first = this.sampleFrame(particle, t);
            const n = this.frameCount;
            let step = Math.floor(age * this.fps) + this.offset(particle);
            if (this.random && n > 0) {
                return first + Math.floor(FrameOverLife.hash(step, this.saltOf(particle)) * n);
            }
            if (n > 0) {
                step = this.loop ? FrameOverLife.wrap(step, n) : Math.min(step, n - 1);
            }
            return first + step;
        }
        let frame: number;
        if (this.cycles !== 1 && this.cycles > 0) {
            // The last instant of the life shows the last frame, not the first of a new cycle.
            const ct = t * this.cycles;
            frame = this.sampleFrame(particle, t >= 1 ? 1 : ct - Math.floor(ct));
        } else {
            frame = this.sampleFrame(particle, t);
        }
        if (this.startFrame !== undefined) {
            frame += this.offset(particle);
            if (this.frameCount > 0) {
                frame = FrameOverLife.wrap(frame, this.frameCount);
            }
        }
        return frame;
    }

    private offset(particle: Particle): number {
        return this.startFrame !== undefined ? Math.floor(this.startFrame.genValue(particle.memory)) : 0;
    }

    /** The particle's salt; 0 for a particle born before this behaviour was added. */
    private saltOf(particle: Particle): number {
        const value = particle.memory[this.salt.indexCount];
        return typeof value === 'number' ? value : 0;
    }

    /** A stable pseudo-random number in [0, 1) for a tick of a particle's sequence. */
    private static hash(step: number, salt: number): number {
        const x = Math.sin(step * 12.9898 + salt * 7833.233) * 43758.5453;
        return Math.min(x - Math.floor(x), 0.999999);
    }

    private static wrap(value: number, n: number): number {
        return ((value % n) + n) % n;
    }

    private sampleFrame(particle: Particle, t: number): number {
        return this._frame.type === 'function'
            ? this._frame.genValue(particle.memory, t)
            : this._frame.genValue(particle.memory);
    }

    frameUpdate(delta: number): void {
        this._frame.refreshTable?.();
    }

    toJSON(): any {
        return {
            type: this.type,
            frame: this.frame.toJSON(),
            ...(this.fps > 0 ? {fps: this.fps} : {}),
            ...(this.cycles !== 1 ? {cycles: this.cycles} : {}),
            ...(this.frameCount > 0 ? {frameCount: this.frameCount} : {}),
            ...(this.loop ? {} : {loop: false}),
            ...(this.random ? {random: true} : {}),
            ...(this.startFrame !== undefined ? {startFrame: this.startFrame.toJSON()} : {}),
        };
    }

    static fromJSON(json: any): Behavior {
        return new FrameOverLife(ValueGeneratorFromJSON(json.frame) as FunctionValueGenerator | ValueGenerator, {
            fps: typeof json.fps === 'number' ? json.fps : undefined,
            cycles: typeof json.cycles === 'number' ? json.cycles : undefined,
            frameCount: typeof json.frameCount === 'number' ? json.frameCount : undefined,
            loop: typeof json.loop === 'boolean' ? json.loop : undefined,
            random: json.random === true,
            startFrame:
                json.startFrame !== undefined ? (ValueGeneratorFromJSON(json.startFrame) as ValueGenerator) : undefined,
        });
    }

    clone(): Behavior {
        return new FrameOverLife(this.frame.clone(), {
            fps: this.fps,
            cycles: this.cycles,
            frameCount: this.frameCount,
            loop: this.loop,
            random: this.random,
            startFrame: this.startFrame?.clone() as ValueGenerator | undefined,
        });
    }
    reset(): void {}
}
