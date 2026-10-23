import type {Material} from '@babylonjs/core/Materials/material';
import type {IShaderMaterialOptions} from '@babylonjs/core/Materials/shaderMaterial';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import type {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import type {MaterialTextureRef} from '../src/effectDocumentJSON';
import type {BabylonMetaData} from '../src/ParticleSystem';

// Typed ways for tests to reach what the library keeps internal, instead of casting to `any`.

/** The options of a batch's shader material; fails the test when it is not one. */
export function shaderOptions(material: Material | null | undefined): IShaderMaterialOptions {
    if (!(material instanceof ShaderMaterial)) {
        throw new Error(`expected a ShaderMaterial, got ${material?.getClassName() ?? material}`);
    }
    return material.options;
}

/**
 * Writes `value` to `key` of `target`, past its declared type: a test that feeds a value the
 * types rule out, as a hand-edited file or a caller without types could.
 */
export function forceSet(target: object, key: string, value: unknown): void {
    Reflect.set(target, key, value);
}

/** Empty resources for a system's `toJSON` to write into and `fromJSON` to read from. */
export function emptyMeta(): BabylonMetaData {
    return {textures: {}, materials: {}, geometries: {}};
}

/**
 * The texture a written material entry's slot names by uuid in `meta`; fails the test when the
 * slot holds anything but a uuid, as a written entry must.
 */
export function textureOf(meta: BabylonMetaData, ref: MaterialTextureRef | undefined): BaseTexture | null | undefined {
    if (typeof ref !== 'string') {
        throw new Error(`expected a texture uuid, got ${String(ref)}`);
    }
    return meta.textures[ref];
}

/** Runs what a material does when it binds for a draw, as a render would. */
export function notifyBind(material: Material): void {
    const mesh = new Mesh('bind', material.getScene());
    material.onBindObservable.notifyObservers(mesh);
    mesh.dispose();
}

/** A fetch response with `body` as its JSON; `status` 200 unless given. */
export function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body ?? null), {status, headers: {'content-type': 'application/json'}});
}
