import {Color3} from '@babylonjs/core/Maths/math.color';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {LinesMesh} from '@babylonjs/core/Meshes/linesMesh';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Scene} from '@babylonjs/core/scene';

const RING_RADIUS = 1.2;
const RING_SEGMENTS = 64;
const RING_Y = 0.03;
const RING_COLOR = new Color3(0.55, 0.78, 1);

/** Flat blue selection ring on the ground under the selected in-scene effect. */
export class GallerySelectionMarker {
    private readonly root: TransformNode;
    private readonly ring: LinesMesh;
    private trackedRoot: TransformNode | null = null;

    constructor(scene: Scene) {
        this.root = new TransformNode('gallery-selection-root', scene);
        this.ring = MeshBuilder.CreateLines(
            'gallery-selection-ring',
            {points: buildGroundRingPoints(RING_RADIUS)},
            scene
        ) as LinesMesh;
        this.ring.color = RING_COLOR;
        this.ring.parent = this.root;
        this.ring.isPickable = false;
        this.ring.renderingGroupId = 1;
        this.hide();
    }

    /** Shows the marker and tracks `entryRoot` on the ground plane. */
    show(entryRoot: TransformNode): void {
        this.trackedRoot = entryRoot;
        this.syncPosition();
        this.root.setEnabled(true);
    }

    hide(): void {
        this.trackedRoot = null;
        this.root.setEnabled(false);
    }

    /** Keeps the ring under the effect while it moves. */
    follow(): void {
        if (!this.trackedRoot || this.trackedRoot.isDisposed()) {
            return;
        }
        this.syncPosition();
    }

    dispose(): void {
        this.hide();
        this.ring.dispose();
        this.root.dispose();
    }

    private syncPosition(): void {
        if (!this.trackedRoot) {
            return;
        }
        const pos = this.trackedRoot.getAbsolutePosition();
        this.root.position.set(pos.x, RING_Y, pos.z);
    }
}

function buildGroundRingPoints(radius: number): Vector3[] {
    const points: Vector3[] = [];
    for (let i = 0; i <= RING_SEGMENTS; i++) {
        const t = (i / RING_SEGMENTS) * Math.PI * 2;
        points.push(new Vector3(Math.cos(t) * radius, 0, Math.sin(t) * radius));
    }
    return points;
}
