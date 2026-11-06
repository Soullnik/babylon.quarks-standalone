import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3} from '@babylonjs/core/Maths/math.color';
import type {Mesh} from '@babylonjs/core/Meshes/mesh';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import type {Scene} from '@babylonjs/core/scene';

/**
 * The floor the feature demos stand on: a wide disc, mid-dark so additive light and alpha-blended
 * smoke or dust both read on it, unlit by speculars.
 */
export function addGround(scene: Scene, y = 0, color = new Color3(0.16, 0.17, 0.21), radius = 40): Mesh {
    const ground = MeshBuilder.CreateDisc('ground', {radius, tessellation: 64}, scene);
    ground.rotation.x = Math.PI / 2;
    ground.position.y = y;
    ground.isPickable = false;
    const material = new StandardMaterial('ground', scene);
    material.diffuseColor = color;
    material.specularColor = Color3.Black();
    ground.material = material;
    return ground;
}
