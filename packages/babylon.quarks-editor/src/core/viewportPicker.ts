import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Scene} from '@babylonjs/core/scene';
import {EDITOR_SCENE_NODE_METADATA} from './editorScene';
import type {GalleryEntry} from './loadEffectGallery';
import {GROUND_RING_RADIUS, GalleryHoverMarker} from './gallerySelectionMarker';

interface PickMetadata {
    quarksEditorPick: true;
    effectRoot: TransformNode;
}

/** Invisible pick proxy size — matches the ground ring footprint. */
const PICK_DIAMETER = GROUND_RING_RADIUS * 2;

/**
 * Viewport pick/hover for in-scene gallery effect roots only (not child emitters).
 * Hover uses the same ground ring as focus selection, in yellow.
 */
export class GalleryViewportPicker {
    private readonly scene: Scene;
    private readonly hoverMarker: GalleryHoverMarker;
    private readonly handles = new Map<number, Mesh>();
    private hoveredRoot: TransformNode | null = null;
    private syncKey = '';

    constructor(scene: Scene) {
        this.scene = scene;
        this.hoverMarker = new GalleryHoverMarker(scene);
    }

    /** Rebuilds root pick colliders when the gallery changes. */
    sync(entries: GalleryEntry[], soloRoot: TransformNode | null, syncKey: string): void {
        if (syncKey === this.syncKey) {
            return;
        }
        this.syncKey = syncKey;
        this.clearHandles();
        if (entries.length > 0) {
            for (const entry of entries) {
                if (!entry.inScene || entry.root.isDisposed()) {
                    continue;
                }
                this.createHandle(entry.root);
            }
        } else if (soloRoot && !soloRoot.isDisposed()) {
            this.createHandle(soloRoot);
        }
        const hovered = this.hoveredRoot;
        this.hoveredRoot = null;
        this.setHover(hovered && !hovered.isDisposed() ? hovered : null);
    }

    /** Yellow focus-style ring under the hovered effect root. */
    setHover(effectRoot: TransformNode | null): void {
        if (effectRoot === this.hoveredRoot) {
            return;
        }
        this.hoveredRoot = effectRoot && !effectRoot.isDisposed() ? effectRoot : null;
        if (!this.hoveredRoot) {
            this.hoverMarker.hide();
            return;
        }
        this.hoverMarker.show(this.hoveredRoot);
    }

    follow(): void {
        this.hoverMarker.follow();
    }

    /** Ray-picks an in-scene effect root from canvas coordinates. */
    pick(clientX: number, clientY: number): TransformNode | null {
        const canvas = this.scene.getEngine().getRenderingCanvas();
        if (!canvas) {
            return null;
        }
        const rect = canvas.getBoundingClientRect();
        const pickInfo = this.scene.pick(
            clientX - rect.left,
            clientY - rect.top,
            (mesh) => !!(mesh.metadata as PickMetadata | undefined)?.quarksEditorPick
        );
        const meta = pickInfo?.pickedMesh?.metadata as PickMetadata | undefined;
        return meta?.quarksEditorPick ? meta.effectRoot : null;
    }

    dispose(): void {
        this.clearHandles();
        this.hoverMarker.dispose();
    }

    private createHandle(effectRoot: TransformNode): void {
        const mesh = MeshBuilder.CreateSphere(
            `viewport-pick-root-${effectRoot.uniqueId}`,
            {diameter: PICK_DIAMETER, segments: 10},
            this.scene
        );
        mesh.parent = effectRoot;
        mesh.position.set(0, 0, 0);
        mesh.isPickable = true;
        mesh.visibility = 0;
        const metadata: PickMetadata = {quarksEditorPick: true, effectRoot};
        mesh.metadata = {...EDITOR_SCENE_NODE_METADATA, ...metadata};
        this.handles.set(effectRoot.uniqueId, mesh);
    }

    private clearHandles(): void {
        for (const mesh of this.handles.values()) {
            mesh.dispose();
        }
        this.handles.clear();
    }
}
