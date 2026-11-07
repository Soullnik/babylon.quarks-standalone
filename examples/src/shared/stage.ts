import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {RawTexture} from '@babylonjs/core/Materials/Textures/rawTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import type {Scene} from '@babylonjs/core/scene';

/** The colour where the floor meets the sky, so the two run into each other without an edge. */
const HORIZON = new Color3(0.075, 0.08, 0.115);
/** The sky overhead. */
const ZENITH = new Color3(0.018, 0.022, 0.04);

/** An unlit material showing `texture` as it is, both sides drawn. */
function unlit(scene: Scene, name: string, texture: Texture): StandardMaterial {
    const material = new StandardMaterial(name, scene);
    material.emissiveTexture = texture;
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    material.disableLighting = true;
    material.backFaceCulling = false;
    return material;
}

/** An RGBA texture `width` by `height` whose texels `colorAt(u, v)` gives, u and v 0…1, bilinear. */
function painted(scene: Scene, name: string, width: number, height: number, colorAt: (u: number, v: number) => Color3) {
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const c = colorAt(width > 1 ? x / (width - 1) : 0, height > 1 ? y / (height - 1) : 0);
            data.set([Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 255], (y * width + x) * 4);
        }
    }
    const texture = RawTexture.CreateRGBATexture(
        data,
        width,
        height,
        scene,
        false,
        false,
        Texture.BILINEAR_SAMPLINGMODE
    );
    texture.name = name;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    return texture;
}

/**
 * A sky round the whole scene: a dome from the horizon's colour up to a darker zenith, the lower half
 * the horizon's colour, drawn behind everything at any distance.
 */
export function addSky(scene: Scene): Mesh {
    const sky = MeshBuilder.CreateSphere('sky', {diameter: 900, segments: 24, sideOrientation: Mesh.BACKSIDE}, scene);
    sky.infiniteDistance = true;
    sky.isPickable = false;
    // The sphere's V runs from its bottom (0) to its top (1); the horizon is halfway.
    const texture = painted(scene, 'sky', 1, 128, (_u, v) => {
        const up = Math.max(0, (v - 0.5) * 2);
        return Color3.Lerp(HORIZON, ZENITH, Math.pow(up, 0.6));
    });
    const material = unlit(scene, 'sky', texture);
    material.disableDepthWrite = true;
    sky.material = material;
    return sky;
}

/**
 * The floor the demos stand on, under a sky (`addSky`): a wide disc, unlit, `color` under the
 * action and darkening out to the horizon's colour at its rim, so it meets the sky without an edge.
 * Mid-dark, so additive light and alpha-blended smoke or dust both read on it.
 */
export function addGround(scene: Scene, y = 0, color = new Color3(0.2, 0.21, 0.26), radius = 40): Mesh {
    addSky(scene);
    const ground = MeshBuilder.CreateDisc('ground', {radius, tessellation: 96}, scene);
    ground.rotation.x = Math.PI / 2;
    ground.position.y = y;
    ground.isPickable = false;
    // The disc's UVs span its square: the distance from (0.5, 0.5) is the radius.
    const texture = painted(scene, 'ground', 128, 128, (u, v) => {
        const r = Math.min(1, Math.hypot(u - 0.5, v - 0.5) * 2);
        return Color3.Lerp(color, HORIZON, Math.pow(r, 0.7));
    });
    ground.material = unlit(scene, 'ground', texture);
    return ground;
}
