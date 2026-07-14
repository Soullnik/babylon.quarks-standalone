import {Vector3} from '@babylonjs/core/Maths/math.vector';
import type {Scene} from '@babylonjs/core/scene';
import type {BatchedRenderer} from 'babylon.quarks';
import type {GalleryEntry} from './loadEffectGallery';
import {DEFAULT_GALLERY_SPACING, galleryGridPosition} from './galleryLayout';

/** Parents a catalog entry into the live scene and registers its systems with the renderer. */
export function placeGalleryEntryInScene(
    entry: GalleryEntry,
    renderer: BatchedRenderer,
    worldPosition: Vector3
): void {
    entry.root.setEnabled(true);
    entry.root.parent = null;
    entry.root.position.copyFrom(worldPosition);

    if (!entry.inScene) {
        for (const system of entry.systems) {
            renderer.addSystem(system);
            system.pause();
        }
        entry.inScene = true;
    }
}

/** Spawns a batch of catalog effects in a square grid centered on `center`. */
export function placeGalleryEntriesAt(
    entries: GalleryEntry[],
    renderer: BatchedRenderer,
    center: Vector3,
    spacing = DEFAULT_GALLERY_SPACING
): void {
    entries.forEach((entry, index) => {
        const offset = galleryGridPosition(index, entries.length, spacing);
        const position = center.add(new Vector3(offset.x, 0, offset.z));
        placeGalleryEntryInScene(entry, renderer, position);
    });
}

/** Raycasts the editor ground plane from canvas/client coordinates. */
export function pickGroundPosition(scene: Scene, clientX: number, clientY: number): Vector3 {
    const canvas = scene.getEngine().getRenderingCanvas();
    if (!canvas) {
        return Vector3.Zero();
    }
    const rect = canvas.getBoundingClientRect();
    const pick = scene.pick(clientX - rect.left, clientY - rect.top, (mesh) => mesh.name === 'ground');
    return pick?.pickedPoint?.clone() ?? Vector3.Zero();
}

/** Finds a gallery entry by Babylon node id from a drag payload. */
export function findGalleryEntryById(entries: GalleryEntry[], id: string): GalleryEntry | undefined {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) {
        return undefined;
    }
    return entries.find((entry) => entry.root.uniqueId === numericId);
}
