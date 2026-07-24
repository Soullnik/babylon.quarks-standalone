// Shared caster/target/preview body placeholder — an unlit, alpha-cut-out
// billboard of the real character art, replacing the old flat-colored capsule.
import type {Scene} from "@babylonjs/core/scene";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import {CreatePlane} from "@babylonjs/core/Meshes/Builders/planeBuilder";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {Texture} from "@babylonjs/core/Materials/Textures/texture";
import type {Color3} from "@babylonjs/core/Maths/math.color";
import characterUrl from "../assets/character.png";

// Source art is 710x1044 (confirmed RGBA/alpha) — width derived from that aspect
// ratio so a HEIGHT-unit-tall plane never stretches the sprite.
const CHARACTER_ASPECT = 710 / 1044;
const HEIGHT = 1.8;
const WIDTH = HEIGHT * CHARACTER_ASPECT;

/**
 * Drop-in replacement for the old makeCapsule(name, scene, color): a vertical
 * billboard sized/grounded the same way (base at y=0, matching the capsule's
 * position.y = height/2 convention) so existing attach-point offsets still land
 * roughly where they used to. BILLBOARDMODE_Y keeps it upright while always
 * facing the camera horizontally — required since these scenes' ArcRotateCamera
 * orbits freely.
 */
export function makeCharacterBillboard(name: string, scene: Scene, tint: Color3): Mesh {
    const mesh = CreatePlane(name, {width: WIDTH, height: HEIGHT}, scene);
    mesh.position.y = HEIGHT / 2;
    mesh.billboardMode = Mesh.BILLBOARDMODE_Y;

    const texture = new Texture(characterUrl, scene);
    texture.hasAlpha = true;
    const material = new StandardMaterial(`${name}-mat`, scene);
    material.diffuseTexture = texture;
    material.useAlphaFromDiffuseTexture = true;
    material.disableLighting = true;
    material.emissiveColor = tint;
    material.backFaceCulling = false;
    mesh.material = material;

    return mesh;
}
