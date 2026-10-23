import type {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture.js';
import type {Texture} from '@babylonjs/core/Materials/Textures/texture.js';
import type {ParticleSystem} from 'babylon.quarks';

/** Material settings the Renderer module changes; fields left out keep their value. */
export interface RendererMaterialPatch {
    /** The blend mode, see `ParticleSystem.blending`. */
    blendMode?: number;
    /** Draws with alpha blending. */
    transparent?: boolean;
    /** Tests against the depth buffer. */
    depthTest?: boolean;
    /** Writes to the depth buffer. */
    depthWrite?: boolean;
    /** Discards pixels whose alpha is below this. */
    alphaTest?: number;
    /** The main texture, or null for none. */
    texture?: Texture | null;
    /** A 3×2 cube-face atlas mesh particles reflect, or null for none. */
    reflectionAtlas?: BaseTexture | null;
    /** How strongly mesh particles reflect the atlas, 0..1. */
    reflectionLevel?: number;
}

function isEditableMaterialRecord(material: unknown): material is Record<string, unknown> {
    return !!material && typeof material === 'object' && !('getClassName' in material);
}

/** Applies renderer material settings and keeps imported QuarksMaterial JSON in sync for export. */
export function applyRendererMaterial(system: ParticleSystem, patch: RendererMaterialPatch): void {
    const settings = system.getRendererSettings();

    if (patch.blendMode !== undefined) {
        system.blending = patch.blendMode;
    }
    if (patch.transparent !== undefined) {
        settings.materialTransparent = patch.transparent;
    }
    if (patch.depthTest !== undefined) {
        settings.materialDepthTest = patch.depthTest;
    }
    if (patch.depthWrite !== undefined) {
        settings.materialDepthWrite = patch.depthWrite;
    }
    if (patch.alphaTest !== undefined) {
        settings.materialAlphaTest = patch.alphaTest;
    }
    if (patch.texture !== undefined) {
        system.texture = patch.texture;
    }
    if (patch.reflectionAtlas !== undefined) {
        settings.reflectionAtlas = patch.reflectionAtlas;
    }
    if (patch.reflectionLevel !== undefined) {
        settings.reflectionLevel = patch.reflectionLevel;
    }

    const material = system.material;
    if (isEditableMaterialRecord(material)) {
        if (patch.blendMode !== undefined) {
            material.alphaMode = patch.blendMode;
            material.blending = patch.blendMode;
        }
        if (patch.transparent !== undefined) {
            material.transparent = patch.transparent;
        }
        if (patch.depthTest !== undefined) {
            material.depthTest = patch.depthTest;
        }
        if (patch.depthWrite !== undefined) {
            material.depthWrite = patch.depthWrite;
        }
        if (patch.alphaTest !== undefined) {
            material.alphaTest = patch.alphaTest;
        }
        if (patch.texture !== undefined) {
            material.texture = patch.texture;
            material.map = patch.texture;
        }
        if (patch.reflectionAtlas !== undefined) {
            material.reflectionAtlas = patch.reflectionAtlas;
        }
        if (patch.reflectionLevel !== undefined) {
            material.reflectionLevel = patch.reflectionLevel;
        }
    }

    system.neededToUpdateRender = true;
}

/** Human-readable label for an imported or live material reference. */
export function getMaterialLabel(material: unknown): string | null {
    if (!material) {
        return null;
    }
    if (isEditableMaterialRecord(material)) {
        const name = typeof material.name === 'string' ? material.name : null;
        const type = typeof material.type === 'string' ? material.type : 'QuarksMaterial';
        return name ? `${name} (${type})` : type;
    }
    const named = material as {name?: string; getClassName?: () => string};
    if (named.name) {
        return named.name;
    }
    if (typeof named.getClassName === 'function') {
        return named.getClassName();
    }
    return 'Material';
}
