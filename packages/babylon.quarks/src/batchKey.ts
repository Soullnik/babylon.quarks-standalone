import {Constants} from '@babylonjs/core/Engines/constants';
import type {Vector3} from 'quarks.core';
import type {VFXBatchSettings} from './BatchedRenderer';
import {
    normalizeErosion,
    normalizeGradientMap,
    normalizeMapUV,
    normalizeMeshRim,
    normalizeUVDistortion,
    readsUV1,
    RenderMode,
    StoredBatchSettings,
    TextureUV,
} from './batchSettings';
import {DEFAULT_SOFT_FAR_FADE, validRenderFace, validSoftFade, validTileCount} from './system/normalize';

// What decides whether two systems draw from one batch.
//
// A batch is one draw call with one material, so its systems share everything the material
// holds. That falls into two groups, as a Unity material's shader keywords and texture slots
// against its MaterialPropertyBlock values, or an Unreal material against its dynamic
// instance's parameters:
//
// - the shader key: the render mode, the geometry, the textures, the blend and depth state,
//   and which effects are compiled in. A change here needs a new material;
// - the live parameters: the numbers the effects run on, such as a soft fade distance, an
//   erosion edge width or a rim colour. They are uniforms, so a change here is written to the
//   material in place.
//
// Each render mode reads only part of the settings, so before two settings are compared they
// are reduced to a canonical form in which every field the mode ignores is at its default. Two
// billboards that differ only in a mesh rim then share a batch.

/** Geometry a trail batch's settings hold, since a trail draws its own strip. */
const NO_GEOMETRY = new Float32Array(0);
const NO_INDICES = new Uint16Array(0);

/** Whether `renderMode` draws camera-facing quads that take a pivot and screen-size limits. */
export function takesPivotAndSizeLimits(renderMode: RenderMode): boolean {
    return (
        renderMode === RenderMode.BillBoard ||
        renderMode === RenderMode.StretchedBillBoard ||
        renderMode === RenderMode.VerticalBillBoard ||
        renderMode === RenderMode.HorizontalBillBoard
    );
}

/** Whether the settings draw a flipbook: more than one cell in either direction. */
export function tilesSheet(settings: {uTileCount: number; vTileCount: number}): boolean {
    return settings.uTileCount > 1 || settings.vTileCount > 1;
}

/** Whether the settings put a screen-size limit on the particles. */
export function hasSizeLimits(settings: {minParticleSize: number; maxParticleSize: number}): boolean {
    return settings.minParticleSize > 0 || settings.maxParticleSize !== Infinity;
}

/**
 * A batch's copy of a system's settings: every optional field defaulted, and every field the
 * render mode ignores at its default, so that systems that draw the same share a batch whatever
 * their unused settings say. See {@link batchSettingsEqual}.
 */
export function storedBatchSettings(settings: VFXBatchSettings): StoredBatchSettings {
    const renderMode = settings.renderMode;
    const isMesh = renderMode === RenderMode.Mesh;
    const isTrail = renderMode === RenderMode.Trail;
    const quad = takesPivotAndSizeLimits(renderMode);
    const softParticles = settings.softParticles;
    const transparent = settings.materialTransparent;
    const pivot = settings.pivot;
    const mapUV = normalizeMapUV(settings.mapUV);
    const uvDistortion = normalizeUVDistortion(settings.uvDistortion);
    const gradientMap = normalizeGradientMap(settings.gradientMap);
    const erosion = normalizeErosion(settings.erosion);
    const uTileCount = validTileCount(settings.uTileCount);
    const vTileCount = validTileCount(settings.vTileCount);
    const stored: StoredBatchSettings = {
        renderMode,
        // A trail draws its own strip and reads none of the instanced geometry.
        instancingGeometry: isTrail ? NO_GEOMETRY : settings.instancingGeometry,
        instancingIndices: isTrail ? NO_INDICES : settings.instancingIndices,
        instancingUVs: isTrail ? undefined : settings.instancingUVs,
        // Normals, and the second UV set when a texture reads it, only reach mesh particles.
        instancingUVs2: isMesh && readsUV1({mapUV, uvDistortion, erosion}) ? settings.instancingUVs2 : undefined,
        instancingNormals: isMesh ? settings.instancingNormals : undefined,
        renderOrder: settings.renderOrder,
        uTileCount,
        vTileCount,
        // A trail cuts its cell on the CPU; a 1×1 sheet has no second cell to blend into.
        blendTiles: !isTrail && settings.blendTiles && tilesSheet({uTileCount, vTileCount}),
        softParticles,
        softNearFade: softParticles ? validSoftFade(settings.softNearFade, 0) : 0,
        softFarFade: softParticles ? validSoftFade(settings.softFarFade, DEFAULT_SOFT_FAR_FADE) : 0,
        // An opaque batch draws with blending off, whatever mode it would blend with.
        materialBlendMode: transparent ? settings.materialBlendMode : Constants.ALPHA_DISABLE,
        materialTransparent: transparent,
        materialDepthTest: settings.materialDepthTest,
        materialDepthWrite: settings.materialDepthWrite,
        materialAlphaTest: settings.materialAlphaTest > 0 ? settings.materialAlphaTest : 0,
        texture: settings.texture,
        reflectionTexture: isMesh ? (settings.reflectionTexture ?? null) : null,
        reflectionLevel: isMesh ? (settings.reflectionLevel ?? 1) : 1,
        reflectionAtlas: isMesh ? (settings.reflectionAtlas ?? null) : null,
        layerMask: settings.layerMask,
        renderingGroupId: settings.renderingGroupId ?? 0,
        applyFog: settings.applyFog ?? true,
        pivot: quad && pivot && (pivot.x !== 0 || pivot.y !== 0 || pivot.z !== 0) ? pivot.clone() : undefined,
        sortMode: settings.sortMode ?? 'none',
        renderFace: isMesh ? validRenderFace(settings.renderFace) : 'both',
        minParticleSize: quad ? Math.max(0, settings.minParticleSize ?? 0) : 0,
        maxParticleSize: quad ? positiveOrUnlimited(settings.maxParticleSize) : Infinity,
        lighting: isMesh ? (settings.lighting ?? 'fixed') : 'fixed',
        rim: isMesh ? normalizeMeshRim(settings.rim) : undefined,
        mapUV,
        uvDistortion,
        gradientMap,
        erosion,
    };
    return stored;
}

/** `size` when it limits something, else no limit. */
function positiveOrUnlimited(size: number | undefined): number {
    return size !== undefined && size > 0 ? size : Infinity;
}

/**
 * Whether two canonical settings compile to the same material: the same render mode, geometry,
 * textures, blend and depth state, and the same effects. Batches with equal shader keys differ
 * only in {@link liveParamsEqual | live parameters}.
 */
export function shaderKeyEqual(a: StoredBatchSettings, b: StoredBatchSettings): boolean {
    return (
        a.renderMode === b.renderMode &&
        a.instancingGeometry === b.instancingGeometry &&
        a.instancingIndices === b.instancingIndices &&
        a.instancingUVs === b.instancingUVs &&
        a.instancingUVs2 === b.instancingUVs2 &&
        a.instancingNormals === b.instancingNormals &&
        a.texture === b.texture &&
        a.reflectionTexture === b.reflectionTexture &&
        a.reflectionAtlas === b.reflectionAtlas &&
        a.lighting === b.lighting &&
        a.rim?.mode === b.rim?.mode &&
        a.uTileCount === b.uTileCount &&
        a.vTileCount === b.vTileCount &&
        a.blendTiles === b.blendTiles &&
        a.softParticles === b.softParticles &&
        a.materialBlendMode === b.materialBlendMode &&
        a.materialTransparent === b.materialTransparent &&
        a.materialDepthTest === b.materialDepthTest &&
        a.materialDepthWrite === b.materialDepthWrite &&
        a.materialAlphaTest > 0 === b.materialAlphaTest > 0 &&
        a.layerMask === b.layerMask &&
        a.renderingGroupId === b.renderingGroupId &&
        a.renderOrder === b.renderOrder &&
        a.applyFog === b.applyFog &&
        a.sortMode === b.sortMode &&
        a.renderFace === b.renderFace &&
        !a.pivot === !b.pivot &&
        hasSizeLimits(a) === hasSizeLimits(b) &&
        a.mapUV?.channel === b.mapUV?.channel &&
        a.uvDistortion?.map === b.uvDistortion?.map &&
        a.uvDistortion?.mapUV.channel === b.uvDistortion?.mapUV.channel &&
        !a.gradientMap === !b.gradientMap &&
        a.gradientMap?.ramp === b.gradientMap?.ramp &&
        !a.erosion === !b.erosion &&
        a.erosion?.mask === b.erosion?.mask &&
        a.erosion?.maskUV.channel === b.erosion?.maskUV.channel
    );
}

/**
 * Whether two canonical settings with the same shader key set the material's uniforms to the
 * same values: the fade distances, alpha cutoff, pivot, size limits, reflection level, rim
 * colour, each effect's parameters and each texture's layout.
 */
export function liveParamsEqual(a: StoredBatchSettings, b: StoredBatchSettings): boolean {
    return (
        a.softNearFade === b.softNearFade &&
        a.softFarFade === b.softFarFade &&
        a.materialAlphaTest === b.materialAlphaTest &&
        a.reflectionLevel === b.reflectionLevel &&
        pivotEqual(a.pivot, b.pivot) &&
        a.minParticleSize === b.minParticleSize &&
        a.maxParticleSize === b.maxParticleSize &&
        rimParamsEqual(a.rim, b.rim) &&
        uvLayoutEqual(a.mapUV, b.mapUV) &&
        a.uvDistortion?.strength === b.uvDistortion?.strength &&
        uvLayoutEqual(a.uvDistortion?.mapUV, b.uvDistortion?.mapUV) &&
        a.gradientMap?.channel === b.gradientMap?.channel &&
        a.erosion?.softness === b.erosion?.softness &&
        a.erosion?.edgeWidth === b.erosion?.edgeWidth &&
        colorEqual(a.erosion?.edgeColor, b.erosion?.edgeColor) &&
        uvLayoutEqual(a.erosion?.maskUV, b.erosion?.maskUV)
    );
}

/** Whether two canonical settings draw from one batch: the same shader key and the same live parameters. */
export function batchSettingsEqual(a: StoredBatchSettings, b: StoredBatchSettings): boolean {
    return shaderKeyEqual(a, b) && liveParamsEqual(a, b);
}

/** True when both pivots put the quad in the same place; a missing pivot is zero. */
function pivotEqual(a: Vector3 | undefined, b: Vector3 | undefined): boolean {
    return (a?.x ?? 0) === (b?.x ?? 0) && (a?.y ?? 0) === (b?.y ?? 0) && (a?.z ?? 0) === (b?.z ?? 0);
}

function rimParamsEqual(
    a: {color: readonly number[]; power: number; strength: number} | undefined,
    b: {color: readonly number[]; power: number; strength: number} | undefined
): boolean {
    if (!a || !b) {
        return !a === !b;
    }
    return a.power === b.power && a.strength === b.strength && colorEqual(a.color, b.color);
}

function colorEqual(a: readonly number[] | undefined, b: readonly number[] | undefined): boolean {
    if (!a || !b) {
        return !a === !b;
    }
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/** Whether two layouts tile, offset and scroll the texture the same; the channel is part of the shader key. */
function uvLayoutEqual(a: TextureUV | undefined, b: TextureUV | undefined): boolean {
    if (!a || !b) {
        return !a === !b;
    }
    return (
        a.tiling[0] === b.tiling[0] &&
        a.tiling[1] === b.tiling[1] &&
        a.offset[0] === b.offset[0] &&
        a.offset[1] === b.offset[1] &&
        a.scroll[0] === b.scroll[0] &&
        a.scroll[1] === b.scroll[1]
    );
}
