import type {TrailSettings} from 'quarks.core';

/** Most segments one recorded segment of a trail is drawn as, see `TrailSettings.tessellation`. */
export const MAX_TRAIL_TESSELLATION = 16;

/** A trail's tessellation, a whole number from 0 (the default: none) to {@link MAX_TRAIL_TESSELLATION}. */
export function trailTessellation(settings: TrailSettings | undefined): number {
    const value = Math.round(Number(settings?.tessellation) || 0);
    return Math.min(MAX_TRAIL_TESSELLATION, Math.max(0, value));
}

/** A trail's curve tension, from 0 (the default: Catmull-Rom) to 1 (straight segments). */
export function trailCurveTension(settings: TrailSettings | undefined): number {
    const value = Number(settings?.curveTension) || 0;
    return Math.min(1, Math.max(0, value));
}
