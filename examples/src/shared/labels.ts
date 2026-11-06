import {DynamicTexture} from '@babylonjs/core/Materials/Textures/dynamicTexture';
import {Material} from '@babylonjs/core/Materials/material';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3} from '@babylonjs/core/Maths/math.color';
import type {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import type {Scene} from '@babylonjs/core/scene';

export interface LabelOptions {
    /** Height of a line of text in world units. */
    height?: number;
    color?: string;
    /** Turns to face the camera (the default), or stays in the plane it was placed in. */
    billboard?: boolean;
}

const FONT_PX = 64;
const PAD_PX = 12;

/**
 * A line of text in the scene, which names what a feature demo compares: drawn at the text's own
 * aspect, unlit and in front of the particles it names, never picked.
 */
export function addLabel(scene: Scene, text: string, position: BVector3, options: LabelOptions = {}): Mesh {
    const height = options.height ?? 0.6;
    const font = `600 ${FONT_PX}px Inter, Segoe UI, Roboto, sans-serif`;
    const measure = new DynamicTexture('labelMeasure', {width: 8, height: 8}, scene);
    const context = measure.getContext();
    context.font = font;
    const width = Math.ceil(context.measureText(text).width) + PAD_PX * 2;
    measure.dispose();

    const lineHeight = FONT_PX + PAD_PX * 2;
    const texture = new DynamicTexture(`label:${text}`, {width, height: lineHeight}, scene, true);
    texture.hasAlpha = true;
    texture.drawText(text, PAD_PX, FONT_PX + PAD_PX / 2, font, options.color ?? '#dfe7ff', 'transparent', true);

    const material = new StandardMaterial(`label:${text}`, scene);
    material.diffuseTexture = texture;
    material.opacityTexture = texture;
    material.emissiveColor = Color3.White();
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.transparencyMode = Material.MATERIAL_ALPHABLEND;

    const plane = MeshBuilder.CreatePlane(`label:${text}`, {width: (height * width) / lineHeight, height}, scene);
    plane.material = material;
    plane.position.copyFrom(position);
    plane.isPickable = false;
    if (options.billboard ?? true) {
        plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    }
    return plane;
}
