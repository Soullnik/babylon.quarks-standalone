import type {TrailSettings, TrailTextureMode} from 'quarks.core';

/** A trail's settings other than its start length and side axis, alike in code and in JSON. */
export type TrailOptions = Omit<TrailSettings, 'startLength' | 'sideAxis'>;

/**
 * The normalised values of a trail's optional settings (`TrailSettings`), each read with its
 * default for a value that is unset or out of range, so the batch, the simulation, JSON and
 * clones agree on what a setting means.
 */

/** Most segments one recorded segment of a trail is drawn as, see `TrailSettings.tessellation`. */
export const MAX_TRAIL_TESSELLATION = 16;

/** A trail's tessellation, a whole number from 0 (the default: none) to {@link MAX_TRAIL_TESSELLATION}. */
export function trailTessellation(settings: TrailOptions | undefined): number {
    const value = Math.round(Number(settings?.tessellation) || 0);
    return Math.min(MAX_TRAIL_TESSELLATION, Math.max(0, value));
}

/** A trail's curve tension, from 0 (the default: Catmull-Rom) to 1 (straight segments). */
export function trailCurveTension(settings: TrailOptions | undefined): number {
    const value = Number(settings?.curveTension) || 0;
    return Math.min(1, Math.max(0, value));
}

const TEXTURE_MODES: readonly TrailTextureMode[] = ['stretch', 'tile', 'distributePerSegment', 'repeatPerSegment'];

/** A trail's texture mode, `'stretch'` (the default) unless set to one of the others. */
export function trailTextureMode(settings: TrailOptions | undefined): TrailTextureMode {
    const mode = settings?.textureMode;
    return mode !== undefined && TEXTURE_MODES.includes(mode) ? mode : 'stretch';
}

/** A trail's texture scale: a finite number above 0, else the default 1. */
export function trailTextureScale(settings: TrailOptions | undefined): number {
    const value = Number(settings?.textureScale);
    return Number.isFinite(value) && value > 0 ? value : 1;
}

/** A trail's minimum distance between samples: a finite number of at least 0, else the default 0. */
export function trailMinVertexDistance(settings: TrailOptions | undefined): number {
    const value = Number(settings?.minVertexDistance);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * How long a trail keeps a sample, in seconds: a finite number above 0, else `Infinity` (the
 * default, as 0 is: until the history is full).
 */
export function trailLifetime(settings: TrailOptions | undefined): number {
    const value = Number(settings?.lifetime);
    return Number.isFinite(value) && value > 0 ? value : Infinity;
}
