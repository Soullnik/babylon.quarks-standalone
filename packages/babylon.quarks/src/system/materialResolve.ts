import type {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
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

/**
 * What a {@link ParticleSystem} reads its draw settings from: a Babylon material (`StandardMaterial`,
 * `PBRMaterial`, a node material, …) or the material record of a loaded effect file. Each field is
 * read only when it is there, so any material fits; the particles are still drawn with quarks' own
 * shaders.
 */
export interface ParticleMaterialSource {
    /** A PBR material's base colour texture. */
    albedoTexture?: BaseTexture | null;
    /** A standard material's diffuse texture. */
    diffuseTexture?: BaseTexture | null;
    /** An emissive texture, read when there is no albedo or diffuse texture. */
    emissiveTexture?: BaseTexture | null;
    /** An opacity texture, read when there is none of the above. */
    opacityTexture?: BaseTexture | null;
    /** A base texture, read last. */
    baseTexture?: BaseTexture | null;
    /** The reflection texture; a cube is drawn through a 3×2 atlas built from it. */
    reflectionTexture?: BaseTexture | null;
    /** A PBR material's environment texture, read when there is no reflection texture. */
    environmentTexture?: BaseTexture | null;
    /** How strong the reflection is; the reflection texture's `level` when unset. */
    reflectionLevel?: number;
    /** A 3×2 env atlas for the reflection; the system stores the atlas it builds from a cube here. */
    reflectionAtlas?: BaseTexture | null;
    /** A Babylon alpha mode constant. */
    alphaMode?: number;
    /** Whether the material blends; decides `transparent`. */
    needAlphaBlending?(): boolean;
    /** Opacity, read for `transparent` when there is no `needAlphaBlending`. */
    alpha?: number;
    /** Inverted into `depthTest`. */
    disableDepthTest?: boolean;
    /** Inverted into `depthWrite`. */
    disableDepthWrite?: boolean;
    /** Read for `depthWrite` when there is no `disableDepthWrite`. */
    forceDepthWrite?: boolean;
    /** The alpha test cutoff is read only in an alpha-test mode (1 or 3). */
    transparencyMode?: number | null;
    /** The alpha test cutoff. */
    alphaCutOff?: number;
    /** The alpha test cutoff, as some materials name it. */
    alphaCutOffValue?: number;
}

/** The draw settings a {@link ParticleSystem} takes from a material, before the env atlas is built. */
export interface ResolvedMaterialSettings {
    texture: Texture | null;
    reflectionTexture: BaseTexture | null;
    reflectionLevel: number;
    /** A live atlas the material, the overrides or the current settings already have; null if none. */
    reflectionAtlas: BaseTexture | null;
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
    material: ParticleMaterialSource | null | undefined,
    overrides: MaterialOverrides,
    current: VFXBatchSettings
): ResolvedMaterialSettings {
    // Particles sample a 2D texture: the first slot that holds one, so a cube in a slot is passed over.
    const texture =
        overrides.texture !== undefined
            ? overrides.texture
            : ([
                  material?.albedoTexture,
                  material?.diffuseTexture,
                  material?.emissiveTexture,
                  material?.opacityTexture,
                  material?.baseTexture,
              ].find((slot): slot is Texture => slot instanceof Texture) ??
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
        blendMode,
        transparent,
        depthTest,
        depthWrite,
        alphaTest,
    };
}
