import {FunctionValueGenerator, IntervalValue, ValueGenerator, ValueGeneratorFromJSON} from '../functions';
import type {ValueGeneratorJSON} from '../functions/FunctionJSON';
import {Particle} from '../Particle';
import {Behavior, BehaviorJSON} from './Behavior';
import {stepEndAge, stepEndLife} from './stepAge';

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
     * every `1 / fps` seconds. Needs {@link frameCount}. As in Unity, the frame
     * runs on between whole frames (2.5 halfway from frame 2 to frame 3), so a
     * system with `blendTiles` fades each frame into the next at any frame rate;
     * without it the tile shown is the whole frame.
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
     * not apply. The frames are whole, so `blendTiles` does not fade between
     * them: the next random frame is not the tile after this one. Default false.
     */
    random?: boolean;
    /**
     * Per-particle frame offset, sampled once at birth: an `IntervalValue(0, n)`
     * starts each particle on a random frame (Unity's "Start Frame", which is a
     * fraction of the frames: this is that fraction times {@link frameCount}).
     * As in Unity it is added whole and fraction alike: 4.8 shows the frame 4
     * frames on, blended 0.8 into the next with `blendTiles`. Default none.
     */
    startFrame?: ValueGenerator;
    /**
     * Play one row of a grid sheet instead of the whole sheet (Unity's Texture Sheet Animation
     * with Animation "Single Row"): the frames in a row, the sheet's columns. `frame`, the
     * cycles, {@link frameCount} and {@link startFrame} then count frames within the row, and the
     * first frame of the row ({@link row}, or a random one with {@link randomRow}) is added.
     * 0, the default, plays the whole sheet.
     */
    rowLength?: number;
    /** Rows on the sheet, the rows {@link randomRow} picks from. Default 1. */
    rowCount?: number;
    /** With {@link rowLength}: the row played, from 0 at the top (Unity's Row Index). Default 0. */
    row?: number;
    /**
     * With {@link rowLength}: each particle plays a row picked at birth from the
     * {@link rowCount} rows instead of {@link row} (Unity's Row Mode "Random"): a sheet of
     * several takes of one animation, one per row. Default false.
     */
    randomRow?: boolean;
}

/** The JSON of a flipbook frame over life: a {@link FrameOverLife}. */
export interface FrameOverLifeJSON extends BehaviorJSON {
    /** The frame over life. */
    frame: ValueGeneratorJSON;
    /** Frames per second instead of over life. */
    fps?: number;
    /** Times the animation plays over a life. */
    cycles?: number;
    /** Frames the animation spans. */
    frameCount?: number;
    /** Whether the animation repeats. */
    loop?: boolean;
    /** Whether each particle starts on a random frame. */
    random?: boolean;
    /** The frame each particle starts on. */
    startFrame?: ValueGeneratorJSON;
    /** Frames in the one row played; absent, the whole sheet plays. */
    rowLength?: number;
    /** Rows on the sheet. */
    rowCount?: number;
    /** The row played. */
    row?: number;
    /** Whether each particle plays a random row. */
    randomRow?: boolean;
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

    /** See {@link FrameOverLifeOptions.fps}. */
    fps: number;
    /** See {@link FrameOverLifeOptions.cycles}. */
    cycles: number;
    /** See {@link FrameOverLifeOptions.frameCount}. */
    frameCount: number;
    /** See {@link FrameOverLifeOptions.loop}. */
    loop: boolean;
    /** See {@link FrameOverLifeOptions.random}. */
    random: boolean;
    /** See {@link FrameOverLifeOptions.startFrame}. */
    startFrame?: ValueGenerator;
    /** See {@link FrameOverLifeOptions.rowLength}. */
    rowLength: number;
    /** See {@link FrameOverLifeOptions.rowCount}. */
    rowCount: number;
    /** See {@link FrameOverLifeOptions.row}. */
    row: number;
    /** See {@link FrameOverLifeOptions.randomRow}. */
    randomRow: boolean;

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
        this.rowLength = wholeAtLeast(options.rowLength, 0);
        this.rowCount = wholeAtLeast(options.rowCount, 1);
        this.row = wholeAtLeast(options.row, 0);
        this.randomRow = options.randomRow === true;
    }

    /**
     * The frame (texture tile index) over the particle's life fraction, or the first frame of the
     * segment in FPS mode.
     */
    get frame(): FunctionValueGenerator | ValueGenerator {
        return this._frame;
    }

    /**
     * The frame (texture tile index) over the particle's life fraction, or the first frame of the
     * segment in FPS mode.
     */
    set frame(frame: FunctionValueGenerator | ValueGenerator) {
        this._frame = frame;
    }

    /** True when no option is in play and the frame is just `frame` at the life fraction. */
    isPlain(): boolean {
        return !(this.fps > 0) && this.cycles === 1 && this.startFrame === undefined && !(this.rowLength > 0);
    }

    initialize(particle: Particle): void {
        this._frame.startGen(particle.memory);
        this.startFrame?.startGen(particle.memory);
        // Claimed whether or not `random` is on, so turning it on mid-play
        // reads each particle's own salt, not another generator's slot.
        this.salt.startGen(particle.memory);
    }

    update(particle: Particle, delta: number): void {
        particle.uvTile = this.frameAt(particle, stepEndAge(particle, delta), stepEndLife(particle, delta));
    }

    updateAll(particles: Array<Particle>, count: number, delta: number): void {
        for (let i = 0; i < count; i++) {
            const particle = particles[i];
            if (particle.age >= particle.life) {
                continue;
            }
            particle.uvTile = this.frameAt(particle, stepEndAge(particle, delta), stepEndLife(particle, delta));
        }
    }

    /** The tile for `particle` at `age` seconds, `t` being that age over its life. */
    frameAt(particle: Particle, age: number, t: number): number {
        const length = this.rowLength;
        if (!(length > 0)) {
            return this.frameInSegment(particle, age, t);
        }
        // Within the row, the frame never runs into the next one.
        const within = Math.min(Math.max(this.frameInSegment(particle, age, t), 0), length - 0.001);
        return this.rowOf(particle) * length + within;
    }

    /** The row a particle plays: the set one, or its own pick from its salt. */
    private rowOf(particle: Particle): number {
        if (!this.randomRow) {
            return this.row;
        }
        return Math.min(Math.floor(this.saltOf(particle) * this.rowCount), this.rowCount - 1);
    }

    /** The frame, counted from the first of the sheet or of the row. */
    private frameInSegment(particle: Particle, age: number, t: number): number {
        if (this.fps > 0) {
            const first = this.sampleFrame(particle, t);
            const n = this.frameCount;
            // Unity's frame in FPS mode is not floored: the part past the whole frame is how far
            // it has blended into the next (AnimBlend), as in life mode.
            let played = age * this.fps + this.offset(particle);
            if (this.random && n > 0) {
                const tick = Math.floor(played);
                return first + Math.floor(FrameOverLife.hash(tick, this.saltOf(particle)) * n);
            }
            if (n > 0) {
                played = this.loop ? FrameOverLife.wrap(played, n) : Math.min(played, n - 1);
            }
            return first + played;
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

    /** The start frame offset, fraction kept, as Unity adds its Start Frame. */
    private offset(particle: Particle): number {
        return this.startFrame !== undefined ? this.startFrame.genValue(particle.memory) : 0;
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

    toJSON(): FrameOverLifeJSON {
        return {
            type: this.type,
            frame: this.frame.toJSON(),
            ...(this.fps > 0 ? {fps: this.fps} : {}),
            ...(this.cycles !== 1 ? {cycles: this.cycles} : {}),
            ...(this.frameCount > 0 ? {frameCount: this.frameCount} : {}),
            ...(this.loop ? {} : {loop: false}),
            ...(this.random ? {random: true} : {}),
            ...(this.startFrame !== undefined ? {startFrame: this.startFrame.toJSON()} : {}),
            ...(this.rowLength > 0 ? {rowLength: this.rowLength} : {}),
            ...(this.rowCount !== 1 ? {rowCount: this.rowCount} : {}),
            ...(this.row !== 0 ? {row: this.row} : {}),
            ...(this.randomRow ? {randomRow: true} : {}),
        };
    }

    /** Reads {@link FrameOverLife.toJSON} output; a field the JSON leaves out takes its default. */
    static fromJSON(json: FrameOverLifeJSON): Behavior {
        return new FrameOverLife(ValueGeneratorFromJSON(json.frame) as FunctionValueGenerator | ValueGenerator, {
            fps: typeof json.fps === 'number' ? json.fps : undefined,
            cycles: typeof json.cycles === 'number' ? json.cycles : undefined,
            frameCount: typeof json.frameCount === 'number' ? json.frameCount : undefined,
            loop: typeof json.loop === 'boolean' ? json.loop : undefined,
            random: json.random === true,
            startFrame:
                json.startFrame !== undefined ? (ValueGeneratorFromJSON(json.startFrame) as ValueGenerator) : undefined,
            rowLength: typeof json.rowLength === 'number' ? json.rowLength : undefined,
            rowCount: typeof json.rowCount === 'number' ? json.rowCount : undefined,
            row: typeof json.row === 'number' ? json.row : undefined,
            randomRow: json.randomRow === true,
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
            rowLength: this.rowLength,
            rowCount: this.rowCount,
            row: this.row,
            randomRow: this.randomRow,
        });
    }
    reset(): void {}
}

/** `value` floored, when it is a finite number of at least `min`; else `min`. */
function wholeAtLeast(value: number | undefined, min: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.floor(value)) : min;
}
