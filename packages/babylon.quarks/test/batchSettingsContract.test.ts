import {Constants} from '@babylonjs/core/Engines/constants';
import type {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {Vector3} from 'quarks.core';
import type {VFXBatchSettings} from '../src/BatchedRenderer';
import {batchSettingsEqual, storedBatchSettings} from '../src/batchKey';
import {RenderMode, StoredBatchSettings, TextureUV} from '../src/VFXBatch';

/**
 * The renderer settings live in two interfaces: what a system hands the renderer
 * (`VFXBatchSettings`) and the batch's canonical copy (`StoredBatchSettings`). These tests keep
 * them in step and make sure every field reaches the batch key, so a new setting cannot be added
 * to one and forgotten in the other, or silently share a batch with systems that draw differently.
 */

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
// Compile-time: the two interfaces name the same fields.
const sameFields: Same<keyof VFXBatchSettings, keyof StoredBatchSettings> = true;

/** A stand-in texture: the key compares textures by identity. */
const texture = (name: string): never => ({name}) as unknown as BaseTexture as never;
const uv = (): TextureUV => ({channel: 0, tiling: [1, 1], offset: [0, 0], scroll: [0, 0]});

/** Settings with every effect on, so that each field is one the render mode reads. */
function full(renderMode: RenderMode = RenderMode.Mesh): VFXBatchSettings {
    return {
        renderMode,
        instancingGeometry: new Float32Array(9),
        instancingIndices: new Uint32Array([0, 1, 2]),
        instancingUVs: new Float32Array(6),
        instancingUVs2: new Float32Array(6),
        instancingNormals: new Float32Array(9),
        renderOrder: 0,
        uTileCount: 2,
        vTileCount: 2,
        blendTiles: true,
        softParticles: true,
        softNearFade: 0.1,
        softFarFade: 1,
        materialBlendMode: Constants.ALPHA_COMBINE,
        materialTransparent: true,
        materialDepthTest: true,
        materialDepthWrite: false,
        materialAlphaTest: 0.5,
        texture: texture('main'),
        reflectionTexture: texture('cube'),
        reflectionLevel: 1,
        reflectionAtlas: texture('atlas'),
        layerMask: 0x0fffffff,
        renderingGroupId: 0,
        applyFog: true,
        applyImageProcessing: true,
        pivot: new Vector3(0.5, 0, 0),
        sortMode: 'none',
        renderFace: 'both',
        minParticleSize: 0.01,
        maxParticleSize: 0.5,
        lighting: 'fixed',
        rim: {color: [1, 1, 1], power: 2, strength: 1, mode: 'add'},
        mapUV: {channel: 1, tiling: [1, 1], offset: [0, 0], scroll: [0, 0]},
        uvDistortion: {map: texture('noise'), mapUV: uv(), strength: 0.1},
        gradientMap: {ramp: texture('ramp'), channel: 'r'},
        erosion: {mask: texture('mask'), maskUV: uv(), softness: 0.1, edgeWidth: 0.1, edgeColor: [1, 0.5, 0]},
    };
}

/** For each field, the render mode that reads it and a change to it that must split the batch. */
const changes: Record<keyof StoredBatchSettings, {mode?: RenderMode; change: (s: VFXBatchSettings) => void}> = {
    renderMode: {change: (s) => (s.renderMode = RenderMode.BillBoard)},
    instancingGeometry: {change: (s) => (s.instancingGeometry = new Float32Array(9))},
    instancingIndices: {change: (s) => (s.instancingIndices = new Uint32Array([0, 2, 1]))},
    instancingUVs: {change: (s) => (s.instancingUVs = new Float32Array(6))},
    instancingUVs2: {change: (s) => (s.instancingUVs2 = new Float32Array(6))},
    instancingNormals: {change: (s) => (s.instancingNormals = new Float32Array(9))},
    renderOrder: {change: (s) => (s.renderOrder = 1)},
    uTileCount: {change: (s) => (s.uTileCount = 4)},
    vTileCount: {change: (s) => (s.vTileCount = 4)},
    blendTiles: {change: (s) => (s.blendTiles = false)},
    softParticles: {change: (s) => (s.softParticles = false)},
    softNearFade: {change: (s) => (s.softNearFade = 0.2)},
    softFarFade: {change: (s) => (s.softFarFade = 2)},
    materialBlendMode: {change: (s) => (s.materialBlendMode = Constants.ALPHA_ADD)},
    materialTransparent: {change: (s) => (s.materialTransparent = false)},
    materialDepthTest: {change: (s) => (s.materialDepthTest = false)},
    materialDepthWrite: {change: (s) => (s.materialDepthWrite = true)},
    materialAlphaTest: {change: (s) => (s.materialAlphaTest = 0.25)},
    texture: {change: (s) => (s.texture = texture('other'))},
    reflectionTexture: {change: (s) => (s.reflectionTexture = texture('other cube'))},
    reflectionLevel: {change: (s) => (s.reflectionLevel = 0.5)},
    reflectionAtlas: {change: (s) => (s.reflectionAtlas = texture('other atlas'))},
    layerMask: {change: (s) => (s.layerMask = 1)},
    renderingGroupId: {change: (s) => (s.renderingGroupId = 1)},
    applyFog: {change: (s) => (s.applyFog = false)},
    applyImageProcessing: {change: (s) => (s.applyImageProcessing = false)},
    pivot: {mode: RenderMode.BillBoard, change: (s) => (s.pivot = new Vector3(0, 0.5, 0))},
    sortMode: {change: (s) => (s.sortMode = 'distance')},
    renderFace: {change: (s) => (s.renderFace = 'front')},
    minParticleSize: {mode: RenderMode.BillBoard, change: (s) => (s.minParticleSize = 0.02)},
    maxParticleSize: {mode: RenderMode.BillBoard, change: (s) => (s.maxParticleSize = 0.25)},
    lighting: {change: (s) => (s.lighting = 'unlit')},
    rim: {change: (s) => (s.rim = {color: [1, 1, 1], power: 3, strength: 1, mode: 'add'})},
    mapUV: {change: (s) => (s.mapUV = {channel: 1, tiling: [2, 1], offset: [0, 0], scroll: [0, 0]})},
    uvDistortion: {change: (s) => (s.uvDistortion = {map: texture('noise'), mapUV: uv(), strength: 0.3})},
    gradientMap: {change: (s) => (s.gradientMap = {ramp: texture('ramp'), channel: 'g'})},
    erosion: {
        change: (s) =>
            (s.erosion = {mask: texture('mask'), maskUV: uv(), softness: 0.3, edgeWidth: 0.1, edgeColor: [1, 0.5, 0]}),
    },
};

describe('renderer settings contract', () => {
    it('keeps the two settings interfaces naming the same fields', () => {
        expect(sameFields).toBe(true);
    });

    it('stores every field a batch is given', () => {
        expect(Object.keys(storedBatchSettings(full())).sort()).toEqual(Object.keys(changes).sort());
    });

    it.each(Object.entries(changes))('a change to %s reaches the batch key', (_field, {mode, change}) => {
        const base = full(mode);
        const changed = {...full(mode), ...shared(base)};
        change(changed);
        const a = storedBatchSettings(base);
        expect(batchSettingsEqual(a, storedBatchSettings({...base}))).toBe(true);
        expect(batchSettingsEqual(a, storedBatchSettings(changed))).toBe(false);
    });
});

/** The object-valued fields of `base`, so that a copy differs only by the change under test. */
function shared(base: VFXBatchSettings): Partial<VFXBatchSettings> {
    return {
        instancingGeometry: base.instancingGeometry,
        instancingIndices: base.instancingIndices,
        instancingUVs: base.instancingUVs,
        instancingUVs2: base.instancingUVs2,
        instancingNormals: base.instancingNormals,
        texture: base.texture,
        reflectionTexture: base.reflectionTexture,
        reflectionAtlas: base.reflectionAtlas,
        uvDistortion: base.uvDistortion,
        gradientMap: base.gradientMap,
        erosion: base.erosion,
    };
}
