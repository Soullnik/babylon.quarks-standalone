import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Scene} from '@babylonjs/core/scene';
import {DEFAULT_GALLERY_SPACING, gallerySpan} from './galleryLayout';

/** Ground decal shown while dragging gallery items over the viewport. */
export class GalleryDropMarker {
    private readonly root: TransformNode;
    private readonly disc: Mesh;
    private readonly material: StandardMaterial;

    constructor(scene: Scene) {
        this.root = new TransformNode('gallery-drop-root', scene);
        this.disc = MeshBuilder.CreateDisc(
            'gallery-drop-fill',
            {radius: 1, tessellation: 48, sideOrientation: Mesh.DOUBLESIDE},
            scene
        );
        this.disc.parent = this.root;
        this.disc.rotation.x = Math.PI / 2;

        this.material = new StandardMaterial('gallery-drop-fill-mat', scene);
        this.material.emissiveColor = new Color3(0.35, 0.55, 1);
        this.material.alpha = 0.24;
        this.material.disableLighting = true;
        this.material.backFaceCulling = false;

        this.disc.material = this.material;
        this.disc.isPickable = false;
        this.disc.renderingGroupId = 1;
        this.hide();
    }

    /** Positions the marker for a single effect or a folder grid footprint. */
    show(position: Vector3, effectCount: number, spacing = DEFAULT_GALLERY_SPACING): void {
        const span = Math.max(gallerySpan(effectCount, spacing), spacing);
        const radius = Math.max(0.375, span * 0.25 + spacing * 0.175);

        this.root.position.set(position.x, 0.03, position.z);
        this.root.scaling.set(radius, radius, radius);

        this.material.alpha = effectCount > 1 ? 0.16 : 0.24;
        this.material.emissiveColor = effectCount > 1 ? new Color3(0.45, 0.9, 0.75) : new Color3(0.55, 0.78, 1);

        this.root.setEnabled(true);
    }

    hide(): void {
        this.root.setEnabled(false);
    }

    dispose(): void {
        this.material.dispose();
        this.disc.dispose();
        this.root.dispose();
    }
}
