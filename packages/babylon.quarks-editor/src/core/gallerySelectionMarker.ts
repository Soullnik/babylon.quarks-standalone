import {Color3} from '@babylonjs/core/Maths/math.color';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {LinesMesh} from '@babylonjs/core/Meshes/linesMesh';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Scene} from '@babylonjs/core/scene';

export const GROUND_RING_RADIUS = 1.2;
const RING_SEGMENTS = 64;
const RING_Y = 0.03;
const SELECTION_RING_COLOR = new Color3(0.55, 0.78, 1);
const HOVER_RING_COLOR = new Color3(1, 0.86, 0.35);

function buildGroundRingPoints(radius: number): Vector3[] {
    const points: Vector3[] = [];
    for (let i = 0; i <= RING_SEGMENTS; i++) {
        const t = (i / RING_SEGMENTS) * Math.PI * 2;
        points.push(new Vector3(Math.cos(t) * radius, 0, Math.sin(t) * radius));
    }
    return points;
}

/** Flat ground ring that tracks a transform on the XZ plane. */
class GroundRingMarker {
    private readonly anchor: TransformNode;
    private readonly ring: LinesMesh;
    private trackedRoot: TransformNode | null = null;

    constructor(scene: Scene, name: string, color: Color3) {
        this.anchor = new TransformNode(`${name}-root`, scene);
        this.ring = MeshBuilder.CreateLines(
            `${name}-ring`,
            {points: buildGroundRingPoints(GROUND_RING_RADIUS)},
            scene
        ) as LinesMesh;
        this.ring.color = color;
        this.ring.parent = this.anchor;
        this.ring.isPickable = false;
        this.ring.renderingGroupId = 1;
        this.hide();
    }

    show(entryRoot: TransformNode): void {
        this.trackedRoot = entryRoot;
        this.syncPosition();
        this.anchor.setEnabled(true);
    }

    hide(): void {
        this.trackedRoot = null;
        this.anchor.setEnabled(false);
    }

    follow(): void {
        if (!this.trackedRoot || this.trackedRoot.isDisposed()) {
            return;
        }
        this.syncPosition();
    }

    dispose(): void {
        this.hide();
        this.ring.dispose();
        this.anchor.dispose();
    }

    private syncPosition(): void {
        if (!this.trackedRoot) {
            return;
        }
        const pos = this.trackedRoot.getAbsolutePosition();
        this.anchor.position.set(pos.x, RING_Y, pos.z);
    }
}

/** Flat blue selection ring on the ground under the focused in-scene effect. */
export class GallerySelectionMarker extends GroundRingMarker {
    constructor(scene: Scene) {
        super(scene, 'gallery-selection', SELECTION_RING_COLOR);
    }
}

/** Same ring as selection, yellow — shown while hovering an effect root in the viewport. */
export class GalleryHoverMarker extends GroundRingMarker {
    constructor(scene: Scene) {
        super(scene, 'gallery-hover', HOVER_RING_COLOR);
    }
}
