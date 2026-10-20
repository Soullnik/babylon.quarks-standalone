import '@babylonjs/core/Culling/ray';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import type {Scene} from '@babylonjs/core/scene';
import type {BatchedRenderer} from 'babylon.quarks';
import {DEFAULT_GALLERY_SPACING, galleryGridPosition} from './galleryLayout';
import type {SceneEntry} from './sceneEntries';

/** Clears live particles and freezes simulation for one scene entry. */
export function clearSceneEntrySimulation(entry: SceneEntry, renderer: BatchedRenderer): void {
    for (const system of entry.systems) {
        system.restart();
        system.pause();
    }
    renderer.refreshBatches();
}

/**
 * Shows or hides a scene entry. A hidden entry keeps its place in the scene and stays editable,
 * but has no particles, is not simulated and can't be picked in the viewport.
 */
export function setSceneEntryVisible(entry: SceneEntry, renderer: BatchedRenderer, visible: boolean): void {
    if (!visible) {
        clearSceneEntrySimulation(entry, renderer);
    }
    entry.root.setEnabled(visible);
}

/** Lays out a batch of new entries in a square grid centered on `center`. */
export function placeSceneEntriesAt(entries: SceneEntry[], center: Vector3, spacing = DEFAULT_GALLERY_SPACING): void {
    entries.forEach((entry, index) => {
        const offset = entries.length === 1 ? {x: 0, z: 0} : galleryGridPosition(index, entries.length, spacing);
        entry.root.position.copyFrom(center.add(new Vector3(offset.x, 0, offset.z)));
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
