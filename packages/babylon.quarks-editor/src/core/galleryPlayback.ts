import type {GalleryEntry} from './loadEffectGallery';

/** Freezes every gallery entry; optionally plays the selected one when it is in the scene. */
export function applyGalleryPlayback(
    entries: GalleryEntry[],
    selectedRoot: GalleryEntry['root'] | null,
    transportPlaying: boolean
): void {
    for (const entry of entries) {
        for (const system of entry.systems) {
            system.pause();
        }
    }

    if (!transportPlaying || !selectedRoot) {
        return;
    }

    const selected = entries.find((entry) => entry.root === selectedRoot);
    if (!selected?.inScene) {
        return;
    }

    // Sub-emitter targets skip self-emission in update(), but still need play() so
    // spawned particles simulate (matches QuarksUtil.play).
    for (const system of selected.systems) {
        system.play();
    }
}

/** Particle count for the selected in-scene gallery effect (timeline counter). */
export function countGalleryParticles(entries: GalleryEntry[], selectedRoot: GalleryEntry['root'] | null): number {
    const selected = entries.find((entry) => entry.root === selectedRoot);
    if (!selected?.inScene) {
        return 0;
    }
    let count = 0;
    for (const system of selected.systems) {
        count += system.particleNum;
    }
    return count;
}
