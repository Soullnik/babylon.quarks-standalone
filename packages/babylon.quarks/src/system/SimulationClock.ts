/** Length of one simulation step, in seconds: the simulation runs at a fixed 60 Hz. */
export const SIMULATION_STEP = 1 / 60;

/** Most steps one host frame runs at playback speed 1; a faster speed raises the cap in proportion. */
export const MAX_STEPS_PER_FRAME = 8;

/** Most host time one frame simulates, in seconds, so a stall or a tab in the background is not replayed. */
export const MAX_FRAME_SECONDS = 0.1;

/** Most off-screen time a `'pauseAndCatchUp'` system replays on coming back into view, in seconds. */
export const MAX_CATCH_UP_SECONDS = 2;

/**
 * Math.round() breaks an exact tie (the accumulator sitting at precisely half a step) by rounding
 * up. At exactly 120 Hz that tie is not a corner case, it is every frame, and rounding it up would
 * run a step on every one of them instead of every other one. Nudging the tie down costs nothing on
 * a real display (real frame times essentially never land on the tie exactly) and keeps the
 * well-tested "half a step is no step yet" behaviour.
 */
const ROUND_TIE_BIAS = 1e-9;

/**
 * The fixed-step clock of a particle system: turns the host's uneven frames into whole 60 Hz
 * steps, and keeps the start delay and the time a culled system still owes. Pure numbers, so the
 * frame-rate rules can be tested without a scene.
 *
 * The steps a frame runs are chosen by *rounding* the accumulated time to the nearest step, not
 * flooring it. Flooring always leaves the accumulator positive, and when the real frame rate sits
 * very close to 60 Hz (as most displays do) that leftover creeps toward a full step for many frames
 * before tipping over into a frame that runs two steps at once and resets it to near zero: a
 * visible lurch, every particle at once, with a perfectly steady frame rate. Rounding lets the
 * leftover go negative instead, which keeps it centred near zero. The renderer closes the gap by
 * drawing each particle advanced along its velocity by {@link residual}.
 */
export class SimulationClock {
    /** Simulated time not yet covered by a whole step, in seconds; negative when a step ran early. */
    private accumulator = 0;
    /** Off-screen time a `'pauseAndCatchUp'` system has not simulated yet, in seconds. */
    private pendingCatchUp = 0;
    /** Start delay still to wait out, in seconds. */
    private delayLeft = 0;

    /** Back to the start of a play: nothing accumulated, nothing owed. The start delay is set apart. */
    reset(): void {
        this.accumulator = 0;
        this.pendingCatchUp = 0;
    }

    /** Sets the start delay to wait out before the first step; a negative or NaN delay is none. */
    setStartDelay(seconds: number): void {
        this.delayLeft = seconds > 0 ? seconds : 0;
    }

    /** Whether a start delay is still being waited out. */
    get delaying(): boolean {
        return this.delayLeft > 0;
    }

    /**
     * The simulated seconds a host frame of `hostDelta` seconds stands for at `playbackSpeed`. The
     * host time is clamped to {@link MAX_FRAME_SECONDS} first, so a fast playback speed advances
     * its full share of a normal frame (speed 10 at 60 fps simulates 10 seconds per second) while a
     * stalled frame is still not replayed. A negative or NaN frame is no time at all.
     */
    static frameSeconds(hostDelta: number, playbackSpeed: number): number {
        if (!(hostDelta > 0)) return 0;
        const clamped = hostDelta > MAX_FRAME_SECONDS ? MAX_FRAME_SECONDS : hostDelta;
        return clamped * playbackSpeed;
    }

    /**
     * Takes `delta` seconds off the start delay and returns what is left over for the simulation:
     * 0 while the delay runs, the remainder of the frame that ends it (at most one frame's worth, so
     * a long frame does not burst the first steps), and `delta` itself once there is no delay.
     */
    consumeStartDelay(delta: number): number {
        if (this.delayLeft <= 0) {
            return delta;
        }
        this.delayLeft -= delta;
        if (this.delayLeft >= 0) {
            return 0;
        }
        const left = Math.min(-this.delayLeft, MAX_FRAME_SECONDS);
        this.delayLeft = 0;
        return left;
    }

    /**
     * Adds `delta` simulated seconds and returns how many whole steps to run for them, at most
     * {@link MAX_STEPS_PER_FRAME} scaled by `playbackSpeed` above 1. The steps' time is taken off
     * the accumulator whether or not the caller runs them all, so a frame that cannot afford its
     * steps drops their time rather than carrying it into the next frame.
     */
    accrue(delta: number, playbackSpeed = 1): number {
        this.accumulator += delta;
        const cap = playbackSpeed > 1 ? Math.ceil(MAX_STEPS_PER_FRAME * playbackSpeed) : MAX_STEPS_PER_FRAME;
        const steps = Math.min(cap, Math.max(0, Math.round(this.accumulator / SIMULATION_STEP - ROUND_TIE_BIAS)));
        this.accumulator -= steps * SIMULATION_STEP;
        return steps;
    }

    /**
     * Time the display is ahead of the simulation (positive) or behind it (negative, the simulation
     * ran a hair early), in seconds. Its magnitude never exceeds one step, even when the per-frame
     * step cap left more than that accumulated.
     */
    get residual(): number {
        if (this.accumulator > SIMULATION_STEP) return SIMULATION_STEP;
        if (this.accumulator < -SIMULATION_STEP) return -SIMULATION_STEP;
        return this.accumulator;
    }

    /** Remembers `delta` simulated seconds a culled system missed, up to {@link MAX_CATCH_UP_SECONDS}. */
    deferCatchUp(delta: number): void {
        this.pendingCatchUp = Math.min(MAX_CATCH_UP_SECONDS, this.pendingCatchUp + delta);
    }

    /** Whether a culled system still owes steps. */
    get owesCatchUp(): boolean {
        return this.pendingCatchUp > 0;
    }

    /** The whole steps a system owes from its time off screen, and forgets them. */
    takeCatchUpSteps(): number {
        const steps = Math.floor(this.pendingCatchUp / SIMULATION_STEP);
        this.pendingCatchUp = 0;
        return steps;
    }
}
