import {QuarksUtil} from 'babylon.quarks';
import type {SceneEntry} from './sceneEntries';

function isPreviewEntry(entry: SceneEntry, previewRootIds: ReadonlySet<number>): boolean {
    return previewRootIds.has(entry.root.uniqueId);
}

/** Freezes every scene entry; unpauses the visible ones (the preview set) when transport is playing. */
export function applyGalleryPlayback(
    entries: SceneEntry[],
    previewRootIds: ReadonlySet<number>,
    transportPlaying: boolean,
    focusFinishedRootIds: ReadonlySet<number> = new Set()
): void {
    for (const entry of entries) {
        for (const system of entry.systems) {
            system.pause();
        }
    }

    if (!transportPlaying) {
        return;
    }

    for (const entry of entries) {
        if (!isPreviewEntry(entry, previewRootIds)) {
            continue;
        }
        if (focusFinishedRootIds.has(entry.root.uniqueId)) {
            continue;
        }
        for (const system of entry.systems) {
            system.play();
        }
    }
}

/** Whether any preview effect on stage should keep simulating. */
export function hasActivePreview(entries: SceneEntry[], previewRootIds: ReadonlySet<number>): boolean {
    return entries.some((entry) => isPreviewEntry(entry, previewRootIds));
}

/** In-scene preview effects currently in the preview set. */
export function countActivePreviews(entries: SceneEntry[], previewRootIds: ReadonlySet<number>): number {
    return entries.filter((entry) => isPreviewEntry(entry, previewRootIds)).length;
}

/** Particle count across all active preview effects. */
export function countGalleryParticles(entries: SceneEntry[], previewRootIds: ReadonlySet<number>): number {
    let count = 0;
    for (const entry of entries) {
        if (!isPreviewEntry(entry, previewRootIds)) {
            continue;
        }
        for (const system of entry.systems) {
            count += system.particleNum;
        }
    }
    return count;
}

/**
 * Pauses one-shot preview effects whose particle systems report `isFinished()`.
 * Returns true when any entry was paused (caller should refresh renderer batches).
 */
export function pauseFinishedPreviews(
    entries: SceneEntry[],
    previewRootIds: ReadonlySet<number>,
    focusFinishedRootIds: ReadonlySet<number> = new Set()
): boolean {
    let pausedAny = false;
    for (const entry of entries) {
        if (!isPreviewEntry(entry, previewRootIds)) {
            continue;
        }
        if (focusFinishedRootIds.has(entry.root.uniqueId)) {
            continue;
        }
        if (!QuarksUtil.isEffectFinished(entry.root)) {
            continue;
        }
        for (const system of entry.systems) {
            if (!system.paused) {
                system.pause();
                pausedAny = true;
            }
        }
    }
    return pausedAny;
}
