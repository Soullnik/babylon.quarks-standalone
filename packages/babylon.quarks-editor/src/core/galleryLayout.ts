import type {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import type {Mesh} from '@babylonjs/core/Meshes/mesh';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';

/** Default gap between neighbouring effects in a folder gallery import. */
export const DEFAULT_GALLERY_SPACING = 4;

/** Square-grid column count for `count` items. */
export function galleryColumnCount(count: number): number {
    return Math.max(1, Math.ceil(Math.sqrt(count)));
}

/** World X/Z offset for the `index`th effect in a square grid. */
export function galleryGridPosition(
    index: number,
    count: number,
    spacing = DEFAULT_GALLERY_SPACING
): {x: number; z: number} {
    const cols = galleryColumnCount(count);
    const rows = Math.ceil(count / cols);
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
        x: (col - (cols - 1) / 2) * spacing,
        z: (row - (rows - 1) / 2) * spacing,
    };
}

/** Longest side of the grid footprint in world units. */
export function gallerySpan(count: number, spacing = DEFAULT_GALLERY_SPACING): number {
    const cols = galleryColumnCount(count);
    const rows = Math.ceil(count / cols);
    return Math.max((cols - 1) * spacing, (rows - 1) * spacing, spacing);
}

/** Pulls the camera back and scales the ground plane to frame a gallery grid. */
export function fitGalleryView(
    camera: ArcRotateCamera,
    ground: Mesh,
    count: number,
    spacing = DEFAULT_GALLERY_SPACING
): void {
    const span = gallerySpan(count, spacing);
    camera.setTarget(new Vector3(0, 1.4, 0));
    camera.radius = Math.max(span * 0.85, 12);
    camera.beta = Math.min(camera.beta, 1.1);
    const groundSize = Math.max(span + spacing * 4, 100);
    ground.scaling.x = groundSize / 100;
    ground.scaling.z = groundSize / 100;
}

let cameraFocusFrame = 0;

function easeOutCubic(t: number): number {
    return 1 - (1 - t) ** 3;
}

/** Stops an in-flight gallery camera focus animation. */
export function cancelGalleryCameraFocus(): void {
    if (cameraFocusFrame) {
        cancelAnimationFrame(cameraFocusFrame);
        cameraFocusFrame = 0;
    }
}

/** Smoothly frames the camera on an in-scene gallery effect. */
export function focusGalleryEntry(camera: ArcRotateCamera, entryRoot: TransformNode, durationMs = 450): void {
    cancelGalleryCameraFocus();

    const pos = entryRoot.getAbsolutePosition();
    const target = new Vector3(pos.x, pos.y + 1.4, pos.z);
    const startTarget = camera.target.clone();
    const startRadius = camera.radius;
    const jumpDist = Vector3.Distance(startTarget, target);
    const desiredRadius = jumpDist > 3 ? 12 : Math.min(startRadius, 16);
    const start = performance.now();

    const tick = () => {
        const t = easeOutCubic(Math.min(1, (performance.now() - start) / durationMs));
        camera.setTarget(Vector3.Lerp(startTarget, target, t));
        camera.radius = startRadius + (desiredRadius - startRadius) * t;
        if (t < 1) {
            cameraFocusFrame = requestAnimationFrame(tick);
        } else {
            cameraFocusFrame = 0;
        }
    };
    cameraFocusFrame = requestAnimationFrame(tick);
}
