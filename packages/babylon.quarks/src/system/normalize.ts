import type {Vector2Like, Vector3Like} from 'quarks.core';
import {ConstantValue, FunctionValueGenerator, ValueGenerator} from 'quarks.core';
import type {MeshLighting, RenderFace, SortMode} from '../batchSettings';
import type {BurstParameters, CullingMode, RingBufferMode, ScalingMode, StopAction} from './types';

// Normalisers shared by the ParticleSystem constructor, its setters and its JSON reader, so a
// value read from a file and one set in code end up the same.

/** `lighting` if it is one of the modes, else the default. */
export function validLighting(lighting: unknown): MeshLighting {
    return lighting === 'unlit' || lighting === 'scene' ? lighting : 'fixed';
}

/** `mode` if it is one of the sort modes, else `'none'`. */
export function validSortMode(mode: unknown): SortMode {
    return mode === 'distance' || mode === 'oldestInFront' || mode === 'youngestInFront' ? mode : 'none';
}

/** `face` if it is one of the render faces, else `'both'`. */
export function validRenderFace(face: unknown): RenderFace {
    return face === 'front' || face === 'back' ? face : 'both';
}

/** `mode` if it is one of the culling modes, else `'always'`. */
export function validCullingMode(mode: unknown): CullingMode {
    return mode === 'pause' || mode === 'pauseAndCatchUp' ? mode : 'always';
}

/** `action` if it is one of the stop actions, else `'none'`. */
export function validStopAction(action: unknown): StopAction {
    return action === 'disable' || action === 'destroy' ? action : 'none';
}

/** `mode` if it is one of the ring buffer modes, else `'disabled'`. */
export function validRingBufferMode(mode: unknown): RingBufferMode {
    return mode === 'pauseUntilReplaced' || mode === 'loopUntilReplaced' ? mode : 'disabled';
}

/**
 * A ring buffer loop range within 0..1, start no later than end; a missing or non-finite bound
 * takes its default (0 or 1).
 */
export function validLoopRange(range: Vector2Like | undefined): Vector2Like {
    const clamp = (value: number | undefined, fallback: number) =>
        typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
    const start = clamp(range?.x, 0);
    const end = clamp(range?.y, 1);
    return {x: Math.min(start, end), y: Math.max(start, end)};
}

/** `mode` if it is one of the scaling modes, else `'local'`. */
export function validScalingMode(mode: unknown): ScalingMode {
    return mode === 'hierarchy' || mode === 'shape' ? mode : 'local';
}

/** `count` as a whole number of particles, or undefined (no limit) when it is unset, NaN or negative. */
export function validMaxParticles(count: unknown): number | undefined {
    return typeof count === 'number' && count >= 0 && count < Infinity ? Math.floor(count) : undefined;
}

/** A copy of `v`, or undefined when it is unset or zero, which is the same as no pivot. */
export function nonZeroPivot(v: Vector3Like | undefined): Vector3Like | undefined {
    return v && (v.x !== 0 || v.y !== 0 || v.z !== 0) ? {x: v.x, y: v.y, z: v.z} : undefined;
}

/** A copy of `v`, or undefined when neither axis flips. */
export function nonZeroFlip(v: Vector2Like | undefined): Vector2Like | undefined {
    return v && (v.x > 0 || v.y > 0) ? {x: v.x, y: v.y} : undefined;
}

/** `cutoff` kept to 0…1, or 0 (no alpha test) when it is unset, NaN or negative. */
export function validAlphaTest(cutoff: unknown): number {
    return typeof cutoff === 'number' && cutoff > 0 ? Math.min(cutoff, 1) : 0;
}

/** A flipbook's columns or rows: a whole number of cells, at least 1; anything else is 1. */
export function validTileCount(count: unknown): number {
    return typeof count === 'number' && Number.isFinite(count) && count >= 1 ? Math.floor(count) : 1;
}

/** World units in front of the scene over which a soft particle is fully faded by default. */
export const DEFAULT_SOFT_FAR_FADE = 1;

/** A soft-particle fade distance: finite and at least 0, else `fallback`. */
export function validSoftFade(distance: unknown, fallback: number): number {
    return typeof distance === 'number' && Number.isFinite(distance) && distance >= 0 ? distance : fallback;
}

/** Seconds between a burst's waves when a burst leaves `interval` out, in code and in a file. */
export const DEFAULT_BURST_INTERVAL = 0.1;

/**
 * A burst with every field present and in range: a `time` that is a finite number of seconds
 * (else 0), a `count` generator (a number becomes a constant, nothing becomes 0), `cycle` at least
 * 1, `interval` {@link DEFAULT_BURST_INTERVAL} when left out and never negative, `probability`
 * within 0..1 (1 when left out). The same rules apply to a burst given to the constructor and one
 * read from a file, so both fire alike.
 */
export function normalizeBurst(burst: Partial<BurstParameters> & {count?: unknown}): BurstParameters {
    const count = burst.count;
    const time = typeof burst.time === 'number' && Number.isFinite(burst.time) && burst.time > 0 ? burst.time : 0;
    const cycle = typeof burst.cycle === 'number' && Number.isFinite(burst.cycle) && burst.cycle >= 1 ? burst.cycle : 1;
    const interval =
        typeof burst.interval === 'number' && Number.isFinite(burst.interval)
            ? Math.max(0, burst.interval)
            : DEFAULT_BURST_INTERVAL;
    const probability =
        typeof burst.probability === 'number' && Number.isFinite(burst.probability)
            ? Math.min(1, Math.max(0, burst.probability))
            : 1;
    return {
        time,
        count:
            typeof count === 'number'
                ? new ConstantValue(count)
                : count !== undefined && count !== null
                  ? (count as ValueGenerator | FunctionValueGenerator)
                  : new ConstantValue(0),
        cycle,
        interval,
        probability,
    };
}

/** The bursts normalised (see {@link normalizeBurst}) and in time order, which emission relies on. */
export function normalizeBursts(bursts: ReadonlyArray<Partial<BurstParameters>> | undefined): BurstParameters[] {
    return (bursts ?? []).map(normalizeBurst).sort((a, b) => a.time - b.time);
}
