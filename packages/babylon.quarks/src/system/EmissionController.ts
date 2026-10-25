import {
    EmissionState,
    FunctionValueGenerator,
    GeneratorMemory,
    Matrix4,
    PiecewiseBezier,
    random,
    ValueGenerator,
    Vector3,
} from 'quarks.core';
import type {ParticleSystem} from '../ParticleSystem';
import type {ParticleSpawner} from './ParticleSpawner';
import type {BurstParameters} from './types';

/** Points sampled over the rest of the cycle when a non-Bezier rate curve is 0 now, to see if it rises later. */
const RATE_LOOKAHEAD_SAMPLES = 64;

/** Waves a burst fires per loop: its `cycle`, and never fewer than one. */
export function burstWaveCount(burst: BurstParameters): number {
    return burst.cycle >= 1 ? Math.floor(burst.cycle) : 1;
}

/** Seconds between a burst's waves; a missing or negative interval fires them all at once. */
export function burstInterval(burst: BurstParameters): number {
    return burst.interval > 0 ? burst.interval : 0;
}

/**
 * Decides how many particles a system owes each step and where: the rate over time, the rate
 * over the distance the emitter moved, and the bursts with their repeated waves. It keeps the
 * memory the system-level generators roll into, and hands the spawning to the `ParticleSpawner`.
 * One per system; a sub emission runs through the same controller with the parent particle's
 * `EmissionState`.
 */
export class EmissionController {
    /**
     * The memory the system-level generators (rates, burst counts, start delay) roll into. Emptied
     * on every restart, and rolled again by {@link rollGenerators}.
     */
    readonly memory: GeneratorMemory = [];

    /** Emitter matrix moved along the step's path, see {@link spawnAlongPath}. */
    private readonly pathMatrix = new Matrix4();
    private readonly temp = new Vector3();

    constructor(
        private readonly system: ParticleSystem,
        private readonly spawner: ParticleSpawner
    ) {}

    /**
     * Rolls the system-level generators into the memory and returns the start delay they gave.
     * A generator that keeps a slot index into the memory, such as `IntervalValue`, would
     * otherwise read past the end of an emptied one and return NaN. The caller sets the random
     * source first, so a seeded system replays the same rates, counts and delay.
     */
    rollGenerators(): number {
        const system = this.system;
        const memory = this.memory;
        system.emissionBursts.forEach((burst) => burst.count.startGen(memory));
        system.emissionOverDistance.startGen(memory);
        system.startDelay.startGen(memory);
        const delay = system.startDelay.genValue(memory, 0);
        system.emissionOverTime.startGen(memory);
        return delay;
    }

    /** Whether continuous or queued emission can still spawn particles before the system is done. */
    hasPendingEmission(): boolean {
        const system = this.system;
        if (system.isEmitEnded) {
            return false;
        }
        if (system.looping) {
            return true;
        }
        if (system.onlyUsedByOther) {
            return false;
        }
        const state = system.emissionState;
        if (state.waitEmiting > 0) {
            return true;
        }
        if (state.burstIndex < system.emissionBursts.length) {
            return true;
        }
        if (this.hasPendingBurstWaves(state)) {
            return true;
        }
        if (state.time >= system.duration) {
            return false;
        }
        const timeRatio = state.time / system.duration;
        return (
            this.emitsFrom(system.emissionOverTime, timeRatio) || this.emitsFrom(system.emissionOverDistance, timeRatio)
        );
    }

    /**
     * Whether a rate is above 0 now or anywhere later in the cycle, so a curve that fades in from 0
     * still counts as pending. A Bezier curve is checked exactly from its control points; another
     * kind of curve is sampled, which only runs while the rate is 0.
     */
    private emitsFrom(rate: ValueGenerator | FunctionValueGenerator, timeRatio: number): boolean {
        if (rate.genValue(this.memory, timeRatio) > 0) {
            return true;
        }
        if (rate.type !== 'function') {
            return false;
        }
        if (rate instanceof PiecewiseBezier) {
            // A Bezier stays within its control points, so this is exact however short a pulse.
            for (let i = 0; i < rate.functions.length; i++) {
                if (rate.getEndX(i) > timeRatio && rate.functions[i][0].p.some((value) => value > 0)) {
                    return true;
                }
            }
            return false;
        }
        const samples = RATE_LOOKAHEAD_SAMPLES;
        for (let i = 1; i <= samples; i++) {
            if (rate.genValue(this.memory, timeRatio + ((1 - timeRatio) * i) / samples) > 0) {
                return true;
            }
        }
        return false;
    }

    /** True while a burst that has started still has a wave due within the duration. */
    private hasPendingBurstWaves(state: EmissionState): boolean {
        const waves = state.burstWaves;
        if (waves === undefined) {
            return false;
        }
        const bursts = this.system.emissionBursts;
        const duration = this.system.duration;
        for (let b = 0; b < state.burstIndex && b < bursts.length; b++) {
            const burst = bursts[b];
            const wave = waves[b] ?? 0;
            if (wave < burstWaveCount(burst) && (wave === 0 || burst.time + wave * burstInterval(burst) <= duration)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Spawns what this step's emission calls for. Called by the simulation step, and by
     * `EmitSubParticleSystem` on a sub emitter target with the parent particle's state and matrix.
     */
    emit(delta: number, emissionState: EmissionState, emitterMatrix: Matrix4): void {
        const system = this.system;
        if (system.isDisposed) {
            return;
        }
        const duration = system.duration;
        // Ended before this step (endEmit, or a past step's end of duration):
        // no more bursts either. A looping system would otherwise keep firing
        // them every loop after endEmit and never finish. Only the system's
        // own emission: a sub emitter's bursts belong to its parent particles,
        // which still go off as they die after the effect was told to end.
        const endedBefore = system.isEmitEnded && emissionState === system.emissionState;
        if (emissionState.time > duration) {
            if (system.looping) {
                emissionState.time -= duration;
                emissionState.burstIndex = 0;
                if (emissionState.burstWaves !== undefined) {
                    emissionState.burstWaves.length = 0;
                }
                // Behaviors carry on across the loop (a noise field keeps scrolling, sub emissions
                // of live particles keep going); they reset only when the system restarts.
            } else {
                if (!system.isEmitEnded && !system.onlyUsedByOther) {
                    system.endEmit();
                }
            }
        }

        const qualityFactor = system.emissionFactor();

        if (system.emissionBursts.length > 0 && !endedBefore) {
            this.emitBursts(emissionState, emitterMatrix);
        }

        // Particles owed to the distance travelled this step, spawned along it.
        let pathSpawn = 0;
        let pathSpacing = 0;
        let pathCarried = 0;
        let pathLength = 0;
        const previousWorldPos = emissionState.previousWorldPos;
        if (!system.isEmitEnded) {
            const timeRatio = emissionState.time / duration;
            emissionState.waitEmiting +=
                delta * system.emissionOverTime.genValue(this.memory, timeRatio) * qualityFactor;

            if (previousWorldPos !== undefined) {
                this.temp.set(emitterMatrix.elements[12], emitterMatrix.elements[13], emitterMatrix.elements[14]);
                pathLength = previousWorldPos.distanceTo(this.temp);
                const emitPerMeter = system.emissionOverDistance.genValue(this.memory, timeRatio) * qualityFactor;
                if (emitPerMeter > 0) {
                    pathCarried = emissionState.travelDistance;
                    emissionState.travelDistance += pathLength;
                    const count = Math.floor(emissionState.travelDistance * emitPerMeter);
                    if (count > 0) {
                        emissionState.travelDistance -= count / emitPerMeter;
                        // A world-space particle stays where it is born, so it is born
                        // where the emitter passed its mark. A local-space one moves
                        // with the emitter and has no path to be spread along.
                        if (system.worldSpace && pathLength > 0) {
                            pathSpawn = count;
                            pathSpacing = 1 / emitPerMeter;
                        } else {
                            emissionState.waitEmiting += count;
                        }
                    }
                } else {
                    // Distance covered while the rate is 0 is not owed later: a rate curve
                    // that rises, or a rate switched on, must not spawn a line at once.
                    emissionState.travelDistance = 0;
                }
            }
        }

        // Accrue before spawning so replacement particles can appear on the same
        // frame an old one dies (rate * lifetime ≈ 1 would otherwise flicker).
        const totalSpawn = Math.floor(emissionState.waitEmiting);
        if (totalSpawn > 0) {
            this.spawner.spawn(totalSpawn, emissionState, emitterMatrix);
            emissionState.waitEmiting -= totalSpawn;
        }
        if (pathSpawn > 0) {
            this.spawnAlongPath(
                pathSpawn,
                emissionState,
                emitterMatrix,
                previousWorldPos!,
                pathCarried,
                pathSpacing,
                pathLength
            );
        }

        if (emissionState.previousWorldPos === undefined) emissionState.previousWorldPos = new Vector3();
        emissionState.previousWorldPos.set(
            emitterMatrix.elements[12],
            emitterMatrix.elements[13],
            emitterMatrix.elements[14]
        );
        emissionState.time += delta;
    }

    /**
     * Fires the burst waves that are due by `emissionState.time`.
     *
     * Wave `w` of a burst is due at `burst.time + w * burst.interval`, and the
     * burst fires `cycle` of them, each rolling `probability` on its own — the
     * way Unity repeats a burst. Bursts start in time order, as they always
     * have; their repeats are tracked per burst so a burst that is still
     * repeating never holds back a later one. Repeats falling past the
     * system's duration are dropped (a looping system starts them over on its
     * next loop), matching Unity, which never emits a burst cycle beyond the
     * end of the duration.
     */
    private emitBursts(emissionState: EmissionState, emitterMatrix: Matrix4): void {
        const bursts = this.system.emissionBursts;
        const duration = this.system.duration;
        const burstCount = bursts.length;
        const time = emissionState.time;
        const waves = (emissionState.burstWaves ??= []);
        while (emissionState.burstIndex < burstCount && bursts[emissionState.burstIndex].time <= time) {
            waves[emissionState.burstIndex] = 0;
            emissionState.burstIndex++;
        }
        const started = emissionState.burstIndex;
        for (let b = 0; b < started; b++) {
            const burst = bursts[b];
            const cycles = burstWaveCount(burst);
            let wave = waves[b] ?? 0;
            if (wave >= cycles) {
                continue;
            }
            const interval = burstInterval(burst);
            while (wave < cycles) {
                const waveTime = burst.time + wave * interval;
                if (wave > 0 && waveTime > duration) {
                    wave = cycles;
                    break;
                }
                if (waveTime > time) {
                    break;
                }
                emissionState.burstWaveIndex = wave;
                this.fireBurstWave(burst, emissionState, emitterMatrix);
                wave++;
            }
            waves[b] = wave;
        }
    }

    /** Spawns one wave of `burst`, if its probability roll passes. */
    private fireBurstWave(burst: BurstParameters, emissionState: EmissionState, emitterMatrix: Matrix4): void {
        if (random() >= burst.probability) {
            return;
        }
        // The count curve runs over the cycle like every other start curve, on the state that is
        // emitting (a sub emission samples the parent particle's time, not the system's).
        const rawCount = burst.count.genValue(this.memory, emissionState.time / this.system.duration);
        const factor = this.system.emissionFactor();
        // Rounded at random, so a fraction is not always lost: three at 1.5 is four or five, on average 4.5.
        const count = Math.abs(factor - 1) < 0.001 ? rawCount : Math.floor(rawCount * factor + random());
        emissionState.isBursting = true;
        emissionState.burstParticleCount = count;
        this.spawner.spawn(count, emissionState, emitterMatrix);
        emissionState.isBursting = false;
    }

    /**
     * Spawns `count` particles owed to emission over distance, each where the
     * emitter crossed its metre mark on the way from `from` to where
     * `emitterMatrix` has it now, rather than all of them at the end of the
     * path: a fast emitter then leaves a continuous trail instead of one clump
     * per step.
     *
     * `carried` is how far the emitter had already gone past its last mark
     * before this step, so the marks keep their spacing across steps. Only the
     * position is interpolated; the emitter's current rotation and scale are
     * used for every particle.
     */
    private spawnAlongPath(
        count: number,
        emissionState: EmissionState,
        emitterMatrix: Matrix4,
        from: Vector3,
        carried: number,
        spacing: number,
        length: number
    ): void {
        const matrix = this.pathMatrix.copy(emitterMatrix);
        const target = emitterMatrix.elements;
        const elements = matrix.elements;
        const tx = target[12];
        const ty = target[13];
        const tz = target[14];
        for (let k = 1; k <= count; k++) {
            const travelled = k * spacing - carried;
            const f = travelled <= 0 ? 0 : travelled >= length ? 1 : travelled / length;
            elements[12] = from.x + (tx - from.x) * f;
            elements[13] = from.y + (ty - from.y) * f;
            elements[14] = from.z + (tz - from.z) * f;
            this.spawner.spawn(1, emissionState, matrix);
        }
    }
}
