import type {Vector2, Vector3} from 'quarks.core';
import type {MeshLighting, SortMode} from '../VFXBatch';
import type {CullingMode} from './types';

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

/** `mode` if it is one of the culling modes, else `'always'`. */
export function validCullingMode(mode: unknown): CullingMode {
    return mode === 'pause' || mode === 'pauseAndCatchUp' ? mode : 'always';
}

/** `count` as a whole number of particles, or undefined (no limit) when it is unset, NaN or negative. */
export function validMaxParticles(count: unknown): number | undefined {
    return typeof count === 'number' && count >= 0 && count < Infinity ? Math.floor(count) : undefined;
}

/** A copy of `v`, or undefined when it is unset or zero, which is the same as no pivot. */
export function nonZeroPivot(v: Vector3 | undefined): Vector3 | undefined {
    return v && (v.x !== 0 || v.y !== 0 || v.z !== 0) ? v.clone() : undefined;
}

/** A copy of `v`, or undefined when neither axis flips. */
export function nonZeroFlip(v: Vector2 | undefined): Vector2 | undefined {
    return v && (v.x > 0 || v.y > 0) ? v.clone() : undefined;
}

/** `cutoff` kept to 0…1, or 0 (no alpha test) when it is unset, NaN or negative. */
export function validAlphaTest(cutoff: unknown): number {
    return typeof cutoff === 'number' && cutoff > 0 ? Math.min(cutoff, 1) : 0;
}
