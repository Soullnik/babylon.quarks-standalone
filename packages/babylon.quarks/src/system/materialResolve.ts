import type {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import type {Texture} from '@babylonjs/core/Materials/Textures/texture';
import type {VFXBatchSettings} from '../BatchedRenderer';

/** Settings given next to a material, which win over what is read from it. */
export interface MaterialOverrides {
    blendMode?: number;
    transparent?: boolean;
    depthTest?: boolean;
    depthWrite?: boolean;
    alphaTest?: number;
    texture?: Texture | null;
    reflectionAtlas?: BaseTexture | null;
    layerMask?: number;
}

/** The draw settings a {@link ParticleSystem} takes from a material, before the env atlas is built. */
export interface ResolvedMaterialSettings {
    texture: Texture | null;
    reflectionTexture: BaseTexture | null;
    reflectionLevel: number;
    /** A live atlas the material, the overrides or the current settings already have; null if none. */
    reflectionAtlas: BaseTexture | null;
    reflectionFaces: VFXBatchSettings['reflectionFaces'];
    blendMode: number;
    transparent: boolean;
    depthTest: boolean;
    depthWrite: boolean;
    alphaTest: number;
}

/** `atlas` unless it has been disposed (it no longer has a scene). */
export function liveAtlas<T extends BaseTexture>(atlas: T | null | undefined): T | null {
    return atlas?.getScene() ? atlas : null;
}

/**
 * Reads the draw settings from a Babylon material, or from the material record of a loaded file:
 * its texture, reflection, alpha mode, depth flags and alpha test. `overrides` win; a setting the
 * material does not have keeps its `current` value.
 */
export function resolveMaterialSettings(
    material: any,
    overrides: MaterialOverrides,
    current: VFXBatchSettings
): ResolvedMaterialSettings {
    const texture =
        overrides.texture !== undefined
            ? overrides.texture
            : (material?.albedoTexture ??
              material?.diffuseTexture ??
              material?.emissiveTexture ??
              material?.opacityTexture ??
              material?.baseTexture ??
              current.texture ??
              null);
    const reflectionTexture =
        material?.reflectionTexture ?? material?.environmentTexture ?? current.reflectionTexture ?? null;
    const reflectionTextureLevel = typeof reflectionTexture?.level === 'number' ? reflectionTexture.level : 1;
    const blendMode =
        overrides.blendMode ??
        (typeof material?.alphaMode === 'number' ? material.alphaMode : current.materialBlendMode);
    const transparent =
        overrides.transparent ??
        (typeof material?.needAlphaBlending === 'function'
            ? material.needAlphaBlending()
            : typeof material?.alpha === 'number'
              ? material.alpha < 1
              : current.materialTransparent);
    const depthTest =
        overrides.depthTest ??
        (typeof material?.disableDepthTest === 'boolean' ? !material.disableDepthTest : current.materialDepthTest);
    const depthWrite =
        overrides.depthWrite ??
        (typeof material?.disableDepthWrite === 'boolean'
            ? !material.disableDepthWrite
            : typeof material?.forceDepthWrite === 'boolean'
              ? material.forceDepthWrite
              : current.materialDepthWrite);
    const alphaTest =
        overrides.alphaTest ??
        (() => {
            // StandardMaterial always has alphaCutOff (default 0.4). Only treat it as
            // particle alpha-test when the material is actually in an alpha-test mode —
            // otherwise Mesh Material demos wrongly enable USE_ALPHATEST.
            const mode = material?.transparencyMode;
            const alphaTestMode = mode === 1 || mode === 3;
            if (alphaTestMode && typeof material?.alphaCutOff === 'number') {
                return material.alphaCutOff;
            }
            if (alphaTestMode && typeof material?.alphaCutOffValue === 'number') {
                return material.alphaCutOffValue;
            }
            if (material) {
                return 0;
            }
            return current.materialAlphaTest;
        })();
    return {
        texture,
        reflectionTexture,
        reflectionLevel:
            typeof material?.reflectionLevel === 'number' ? material.reflectionLevel : reflectionTextureLevel,
        // A disposed atlas (its cube was disposed, or disposeEnvAtlas ran) is skipped, so a new one is built.
        reflectionAtlas:
            liveAtlas(material?.reflectionAtlas) ??
            liveAtlas(overrides.reflectionAtlas) ??
            liveAtlas(current.reflectionAtlas),
        // Do not expand cube files into six face textures anymore — that path
        // still trips GL_INVALID_OPERATION on iOS. Prefer a single atlas.
        reflectionFaces: material?.reflectionFaces?.length === 6 ? material.reflectionFaces : null,
        blendMode,
        transparent,
        depthTest,
        depthWrite,
        alphaTest,
    };
}
