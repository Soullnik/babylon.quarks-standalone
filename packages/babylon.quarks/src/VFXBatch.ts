import {BoundingInfo} from '@babylonjs/core/Culling/boundingInfo';
import {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import type {Effect} from '@babylonjs/core/Materials/effect';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {Vector2 as BVector2, Vector3 as BVector3, Vector4 as BVector4, Matrix} from '@babylonjs/core/Maths/math.vector';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import type {Node} from '@babylonjs/core/node';
import {Scene} from '@babylonjs/core/scene';
import {IParticleSystem, Vector3} from 'quarks.core';
import {VFXBatchSettings} from './BatchedRenderer';
import type {ParticleSystem} from './ParticleSystem';
import {storedBatchSettings} from './batchKey';
import {DepthBinding, softDepthParams} from './softDepth';

/**
 * The order the particles of a batch are drawn in (Unity's Sort Mode). Alpha
 * blended particles cover what was drawn before them, so the order shows.
 *
 * - `'none'`: as they are, system by system. Right for additive blending.
 * - `'distance'`: farthest from the camera first, so nearer particles cover
 *   farther ones. The order is computed once a frame, from the first of the
 *   scene's active cameras (`scene.activeCameras[0]`, else `activeCamera`);
 *   other cameras, a second viewport or a render target, draw the same order.
 * - `'oldestInFront'` / `'youngestInFront'`: by age.
 *
 * Sorting runs over the whole batch after each fill. Trails are not sorted.
 */
export type SortMode = 'none' | 'distance' | 'oldestInFront' | 'youngestInFront';

/**
 * Which faces of a mesh particle are drawn (Unity's Render Face, Unreal's Two Sided): `'both'`
 * (the default), `'front'` (back faces culled, the usual choice for a closed mesh) or `'back'`
 * (front faces culled, to see the inside of a dome or a shell). Front faces are the ones a Babylon
 * mesh shows with back-face culling on, the outside of a box or sphere. It applies to the Mesh
 * render mode only: billboards, stretched billboards, beams and trails are flat sheets whose
 * winding follows the camera or the particle's path, so they always draw both faces.
 *
 * The culling is set once for the whole batch. A mesh particle mirrored by a negative size on an
 * odd number of axes turns its winding inside out, so `'front'` then shows its inside and
 * `'back'` its outside.
 */
export type RenderFace = 'both' | 'front' | 'back';

/** How a system draws its particles (Unity's Render Mode), see {@link ParticleSystem.renderMode}. */
export enum RenderMode {
    /** A quad facing the camera (Unity's Billboard). The default. */
    BillBoard = 0,
    /**
     * A quad facing the camera and stretched along the particle's velocity (Unity's Stretched
     * Billboard), by `speedFactor` and `lengthFactor` in the system's `rendererEmitterSettings`.
     */
    StretchedBillBoard = 1,
    /** The system's mesh, one instance per particle (Unity's Mesh), see {@link ParticleSystem.instancingGeometry}. */
    Mesh = 2,
    /**
     * A ribbon drawn through the particle's past positions (Unity's Trails module, Niagara's
     * ribbon), facing the camera; its settings are `TrailSettings` in `rendererEmitterSettings`.
     */
    Trail = 3,
    /** A quad lying flat in the world's XZ plane, facing up (Unity's Horizontal Billboard). */
    HorizontalBillBoard = 4,
    /** A quad standing upright and turning only about the world's Y axis to face the camera (Unity's Vertical Billboard). */
    VerticalBillBoard = 5,
    /**
     * A quad laid from each particle to the system's {@link ParticleSystem.beamEnd}
     * and turned about its length to face the camera (a line renderer): U runs
     * from the particle (0) to the end (1), V across, the particle's size is
     * the width. Lightning, tethers, lasers.
     */
    Beam = 6,
}

/**
 * How mesh particles are lit.
 *
 * - `'fixed'` (default): one directional light plus ambient, the same for every
 *   mesh batch of a renderer, set with {@link BatchedRenderer.setMeshLighting}.
 * - `'unlit'`: no lighting term — the texture times the particle colour, for
 *   emissive meshes (fire, energy, glowing blades).
 * - `'scene'`: follows the scene's first enabled `DirectionalLight` or
 *   `HemisphericLight` every frame, falling back to the fixed light when there
 *   is none.
 *
 * Only mesh particles are lit; other render modes ignore it.
 */
export type MeshLighting = 'unlit' | 'fixed' | 'scene';

/** The light {@link MeshLighting} `'fixed'` mesh particles are lit by. */
export interface MeshLightingSettings {
    /** Direction the light travels in, world space. Default `(0.4, -1, 0.6)`. */
    direction: BVector3;
    /** Light colour, intensity folded in. Default white. */
    color: Color3;
    /** Light every face gets regardless of its direction. Default `(0.35, 0.35, 0.35)`. */
    ambient: Color3;
}

/** The light mesh particles have always been lit by. */
export function defaultMeshLighting(): MeshLightingSettings {
    return {
        direction: new BVector3(0.4, -1, 0.6),
        color: new Color3(1, 1, 1),
        ambient: new Color3(0.35, 0.35, 0.35),
    };
}

/**
 * A rim (Fresnel) term on mesh particles: a colour that grows where the surface
 * turns away from the camera, `pow(1 - |N·V|, power) * strength`. Unset: no rim.
 * Only mesh particles draw it.
 */
export interface MeshRim {
    /** Edge colour, linear RGB. Default `[1, 1, 1]`. */
    color: [number, number, number];
    /** Falloff exponent; higher keeps the rim to a thinner edge. Default 2. */
    power: number;
    /** How much of the rim is applied, usually 0…1. Default 1. */
    strength: number;
    /**
     * `'add'` (default) adds the colour, for a glowing edge; `'mix'` blends the
     * surface toward it, for an outline (a dark ink line with a dark colour);
     * `'fade'` leaves the colour and fades the faces turned to the camera by
     * `strength` instead, alpha times `1 - strength * (1 - edge)`: a wall of
     * light that reads thick along its silhouette and thin across its face.
     */
    mode: 'add' | 'mix' | 'fade';
}

/**
 * A complete rim from a partial one, every field defaulted and kept in range,
 * or undefined when `rim` is unset.
 */
export function normalizeMeshRim(rim: Partial<MeshRim> | null | undefined): MeshRim | undefined {
    if (!rim || typeof rim !== 'object') {
        return undefined;
    }
    const color = Array.isArray(rim.color) ? rim.color : [1, 1, 1];
    const channel = (value: unknown, fallback: number) =>
        typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    return {
        color: [channel(color[0], 1), channel(color[1], 1), channel(color[2], 1)],
        power: Math.max(0.01, channel(rim.power, 2)),
        strength: Math.max(0, channel(rim.strength, 1)),
        mode: rim.mode === 'mix' || rim.mode === 'fade' ? rim.mode : 'add',
    };
}

/** True when both describe the same rim (or both none). */
export function meshRimEqual(a: MeshRim | undefined, b: MeshRim | undefined): boolean {
    if (a === b) {
        return true;
    }
    if (!a || !b) {
        return false;
    }
    return (
        a.mode === b.mode &&
        a.power === b.power &&
        a.strength === b.strength &&
        a.color[0] === b.color[0] &&
        a.color[1] === b.color[1] &&
        a.color[2] === b.color[2]
    );
}

/**
 * Which texture coordinates a texture is sampled with, as Unity's UV channels
 * and Niagara's ribbon UV0 / UV1:
 *
 * - `0`: the particle's first UV, with the sprite sheet's cell applied: on a
 *   sheet the current frame's cell, on a trail the cell's stretch along it, on
 *   a mesh its first UV set. Read before the map's own layout and distortion,
 *   so a texture on it does not move with them.
 * - `1`: the particle's own UV, never moved by the sheet. The whole quad on a
 *   billboard, a stretched billboard or a beam (mirrored with the quad when it
 *   flips); on a trail U along it the way the map's runs (from the tail, or
 *   from the head with `uvFromHead`) and V across it; on a mesh its second UV
 *   set (`instancingUVs2`), or its first when it has none.
 *
 * A mesh can then repeat its picture along UV0 while a mask on UV1 runs once
 * across its whole length, as a lightmap UV does in a game engine.
 */
export type UVChannel = 0 | 1;

/**
 * How a texture is laid over the particle: its UV channel, then tiling and
 * offset as in Unity's material Tiling / Offset, then a scroll on the
 * renderer's clock as Unreal's Panner. Sampled at
 * `uv(channel) * tiling + offset + scroll * time`; the offset is used as
 * given, so a clamped texture can be moved off its edge, and only the
 * scroll's share is wrapped (over two repeats, so a mirrored texture stays
 * seamless). A texture that scrolls or tiles should repeat.
 */
export interface TextureUV {
    /** See {@link UVChannel}. Default 0. */
    channel: UVChannel;
    /** Repeats across the channel's 0…1, `[u, v]`. Default `[1, 1]`. */
    tiling: [number, number];
    /** Added after tiling, in texture UV units. Default `[0, 0]`. */
    offset: [number, number];
    /** UV units per second on the renderer's clock. Default `[0, 0]`. */
    scroll: [number, number];
}

/** A complete {@link TextureUV} from a partial one, with `defaults` under the fields left out. */
export function normalizeTextureUV(
    uv: Partial<TextureUV> | null | undefined,
    defaults: Partial<TextureUV> = {}
): TextureUV {
    const source = uv && typeof uv === 'object' ? uv : {};
    const num = (value: unknown, fallback: number) =>
        typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    const pair = (value: unknown, fallback: [number, number]): [number, number] =>
        Array.isArray(value) ? [num(value[0], fallback[0]), num(value[1], fallback[1])] : [fallback[0], fallback[1]];
    const channel = source.channel ?? defaults.channel;
    return {
        channel: channel === 1 ? 1 : 0,
        tiling: pair(source.tiling, defaults.tiling ?? [1, 1]),
        offset: pair(source.offset, defaults.offset ?? [0, 0]),
        scroll: pair(source.scroll, defaults.scroll ?? [0, 0]),
    };
}

/** True when both lay a texture the same way. */
export function textureUVEqual(a: TextureUV, b: TextureUV): boolean {
    return (
        a === b ||
        (a.channel === b.channel &&
            a.tiling[0] === b.tiling[0] &&
            a.tiling[1] === b.tiling[1] &&
            a.offset[0] === b.offset[0] &&
            a.offset[1] === b.offset[1] &&
            a.scroll[0] === b.scroll[0] &&
            a.scroll[1] === b.scroll[1])
    );
}

/** The fields of `uv` that differ from `defaults`, for JSON written only when set. */
export function textureUVToJSON(uv: TextureUV, defaults: Partial<TextureUV> = {}): Partial<TextureUV> | undefined {
    const base = normalizeTextureUV(undefined, defaults);
    const json: Partial<TextureUV> = {};
    if (uv.channel !== base.channel) json.channel = uv.channel;
    if (uv.tiling[0] !== base.tiling[0] || uv.tiling[1] !== base.tiling[1]) json.tiling = [...uv.tiling];
    if (uv.offset[0] !== base.offset[0] || uv.offset[1] !== base.offset[1]) json.offset = [...uv.offset];
    if (uv.scroll[0] !== base.scroll[0] || uv.scroll[1] !== base.scroll[1]) json.scroll = [...uv.scroll];
    return Object.keys(json).length > 0 ? json : undefined;
}

/**
 * Which value of the map's texel picks the colour along a gradient map's
 * ramp: one channel, so a texture can pack several masks (Unreal's and
 * Unity's channel-packed textures), or the Rec. 709 luminance of its colour.
 */
export type GradientMapChannel = 'r' | 'g' | 'b' | 'a' | 'luminance';

/**
 * A gradient map (colour ramp): the map is recoloured by looking its
 * {@link channel} up along U of {@link ramp}. Without a map the lookup reads
 * white, so the ramp's right-hand end tints every particle, in every render
 * mode alike. See {@link VFXBatchSettings.gradientMap}.
 */
export interface ParticleGradientMap {
    /**
     * The ramp, read along U at mid V: low values on the left. Make it without
     * mipmaps and clamped. Required: without one there is no gradient map.
     */
    ramp: BaseTexture | null;
    /**
     * The texel value the ramp is looked up by. Default `'r'`. With `'a'` the
     * ramp's alpha becomes the texel's alpha, so a soft shape can glow at its
     * fringe and stay solid at its heart; with any other channel the ramp's
     * alpha multiplies the map's.
     */
    channel: GradientMapChannel;
}

/** The weights a texel is dotted with to look up the ramp, per {@link GradientMapChannel}. */
export const GRADIENT_MAP_WEIGHTS: Readonly<Record<GradientMapChannel, readonly [number, number, number, number]>> = {
    r: [1, 0, 0, 0],
    g: [0, 1, 0, 0],
    b: [0, 0, 1, 0],
    a: [0, 0, 0, 1],
    luminance: [0.2126, 0.7152, 0.0722, 0],
};

/** A complete gradient map, or undefined when unset or without a ramp. */
export function normalizeGradientMap(
    gradientMap: Partial<ParticleGradientMap> | null | undefined
): ParticleGradientMap | undefined {
    if (!gradientMap || typeof gradientMap !== 'object' || !gradientMap.ramp) {
        return undefined;
    }
    const channel = gradientMap.channel;
    return {
        ramp: gradientMap.ramp,
        channel: channel !== undefined && channel in GRADIENT_MAP_WEIGHTS ? channel : 'r',
    };
}

/** True when both recolour the same way (or both not at all). */
export function gradientMapEqual(a: ParticleGradientMap | undefined, b: ParticleGradientMap | undefined): boolean {
    return a === b || (!!a && !!b && a.ramp === b.ramp && a.channel === b.channel);
}

/**
 * Alpha erosion: the particle's alpha decides how much of its shape is left
 * instead of how transparent it is, so `ColorOverLife` fading alpha out
 * dissolves (noise mask) or wipes (gradient mask) the shape away. See
 * {@link VFXBatchSettings.erosion}.
 */
export interface ParticleErosion {
    /**
     * Mask whose red channel orders what goes first, laid by {@link maskUV}.
     * Null: the map's own alpha, so a soft shape shrinks from its edges.
     */
    mask: BaseTexture | null;
    /**
     * How the mask is laid over the particle, see {@link TextureUV}. On UV
     * channel 1 a gradient mask wipes a whole trail or mesh however its map
     * repeats. Default channel 0, untiled, still.
     */
    maskUV: TextureUV;
    /** Width of the soft transition at the cut, in mask units. Default 0.05. */
    softness: number;
    /** Width of the glowing band above the cut, in mask units; 0 (default) draws none. */
    edgeWidth: number;
    /** Colour added in the edge band, linear RGB, may exceed 1. Default `[1, 1, 1]`. */
    edgeColor: [number, number, number];
}
// Limits worth knowing: with neither a mask nor a map there is
// nothing to order the cut by, so the shape goes all at once near alpha 0.
// Scrolling runs on the renderer's clock, not a system's playback speed.

/** {@link ParticleErosion} as given: any field may be left out, the mask's layout too. */
export type ParticleErosionOptions = Partial<Omit<ParticleErosion, 'maskUV'>> & {
    /** See {@link ParticleErosion.maskUV}; fields left out take their defaults. */
    maskUV?: Partial<TextureUV>;
};

/** The width of the soft band an erosion cut fades over when `softness` is left out, in mask units. */
export const EROSION_DEFAULT_SOFTNESS = 0.05;

/** A complete erosion from a partial one, every field defaulted, or undefined when `erosion` is unset. */
export function normalizeErosion(erosion: ParticleErosionOptions | null | undefined): ParticleErosion | undefined {
    if (!erosion || typeof erosion !== 'object') {
        return undefined;
    }
    const num = (value: unknown, fallback: number) =>
        typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    const color = Array.isArray(erosion.edgeColor) ? erosion.edgeColor : [1, 1, 1];
    return {
        mask: erosion.mask ?? null,
        maskUV: normalizeTextureUV(erosion.maskUV),
        softness: Math.max(0.0001, num(erosion.softness, EROSION_DEFAULT_SOFTNESS)),
        edgeWidth: Math.max(0, num(erosion.edgeWidth, 0)),
        edgeColor: [num(color[0], 1), num(color[1], 1), num(color[2], 1)],
    };
}

/** True when both describe the same erosion (or both none). */
export function erosionEqual(a: ParticleErosion | undefined, b: ParticleErosion | undefined): boolean {
    if (a === b) {
        return true;
    }
    if (!a || !b) {
        return false;
    }
    return (
        a.mask === b.mask &&
        textureUVEqual(a.maskUV, b.maskUV) &&
        a.softness === b.softness &&
        a.edgeWidth === b.edgeWidth &&
        a.edgeColor[0] === b.edgeColor[0] &&
        a.edgeColor[1] === b.edgeColor[1] &&
        a.edgeColor[2] === b.edgeColor[2]
    );
}

/** The distortion noise's default layout: drifting up half a repeat a second. */
export const UV_DISTORTION_DEFAULT_UV: Partial<TextureUV> = {scroll: [0, 0.5]};

/**
 * UV distortion: the map's UV pushed about by a noise texture, for heat
 * shimmer, licking flames and breathing auras. See
 * {@link VFXBatchSettings.uvDistortion}.
 */
export interface ParticleUVDistortion {
    /**
     * Noise whose red and green channels, around 0.5, push U and V. It should
     * wrap (repeat). Required: without one there is no distortion.
     */
    map: BaseTexture | null;
    /**
     * How the noise is laid over the particle, see {@link TextureUV}. Default
     * channel 0, untiled, scrolling `[0, 0.5]`.
     */
    mapUV: TextureUV;
    /** How far the map's UV is pushed at most, in UV units. Default 0.05. */
    strength: number;
}

/** {@link ParticleUVDistortion} as given: any field may be left out, the noise's layout too. */
export type ParticleUVDistortionOptions = Partial<Omit<ParticleUVDistortion, 'mapUV'>> & {
    /** See {@link ParticleUVDistortion.mapUV}; fields left out take their defaults. */
    mapUV?: Partial<TextureUV>;
};

/** How far a distortion pushes the map's UV at most when `strength` is left out, in UV units. */
export const UV_DISTORTION_DEFAULT_STRENGTH = 0.05;

/** A complete distortion from a partial one, or undefined when unset or without a map. */
export function normalizeUVDistortion(
    distortion: ParticleUVDistortionOptions | null | undefined
): ParticleUVDistortion | undefined {
    if (!distortion || typeof distortion !== 'object' || !distortion.map) {
        return undefined;
    }
    const strength = distortion.strength;
    return {
        map: distortion.map,
        mapUV: normalizeTextureUV(distortion.mapUV, UV_DISTORTION_DEFAULT_UV),
        strength: Math.max(
            0,
            typeof strength === 'number' && Number.isFinite(strength) ? strength : UV_DISTORTION_DEFAULT_STRENGTH
        ),
    };
}

/** True when both describe the same distortion (or both none). */
export function uvDistortionEqual(a: ParticleUVDistortion | undefined, b: ParticleUVDistortion | undefined): boolean {
    if (a === b) {
        return true;
    }
    if (!a || !b) {
        return false;
    }
    return a.map === b.map && a.strength === b.strength && textureUVEqual(a.mapUV, b.mapUV);
}

/**
 * The main map's layout, or undefined when it is the identity (channel 0,
 * untiled, unmoved, still), which costs nothing in the shader.
 */
export function normalizeMapUV(uv: Partial<TextureUV> | null | undefined): TextureUV | undefined {
    if (!uv || typeof uv !== 'object') {
        return undefined;
    }
    const normalized = normalizeTextureUV(uv);
    return textureUVToJSON(normalized) === undefined ? undefined : normalized;
}

/** True when both lay the map the same way (or both as drawn). */
export function mapUVEqual(a: TextureUV | undefined, b: TextureUV | undefined): boolean {
    return a === b || (!!a && !!b && textureUVEqual(a, b));
}

/**
 * True when a texture effect of `settings` samples UV channel 1, see
 * {@link UVChannel}: the map, the distortion noise or an erosion mask laid
 * on it.
 */
export function readsUV1(settings: {
    mapUV?: TextureUV;
    uvDistortion?: ParticleUVDistortion;
    erosion?: ParticleErosion;
}): boolean {
    const {mapUV, uvDistortion, erosion} = settings;
    return (
        mapUV?.channel === 1 || uvDistortion?.mapUV.channel === 1 || (!!erosion?.mask && erosion.maskUV.channel === 1)
    );
}

/**
 * A batch's copy of the {@link VFXBatchSettings} its systems share: every optional field
 * defaulted, and every field the batch's render mode ignores at its default (an opaque batch's
 * `materialBlendMode` reads `ALPHA_DISABLE`, a billboard batch's `rim` is unset). The renderer
 * adds a system to the batch whose settings match its own.
 */
export interface StoredBatchSettings {
    /** See {@link VFXBatchSettings.instancingGeometry}. */
    instancingGeometry: Float32Array;
    /** See {@link VFXBatchSettings.instancingIndices}. */
    instancingIndices: Uint32Array | Uint16Array;
    /** See {@link VFXBatchSettings.instancingUVs}. */
    instancingUVs?: Float32Array;
    /** The mesh's second UV set, see {@link UVChannel}. */
    instancingUVs2?: Float32Array;
    /** See {@link VFXBatchSettings.instancingNormals}. */
    instancingNormals?: Float32Array;
    /** See {@link VFXBatchSettings.renderMode}. */
    renderMode: RenderMode;
    /** See {@link VFXBatchSettings.renderOrder}. */
    renderOrder: number;
    /** See {@link VFXBatchSettings.uTileCount}. */
    uTileCount: number;
    /** See {@link VFXBatchSettings.vTileCount}. */
    vTileCount: number;
    /** See {@link VFXBatchSettings.blendTiles}. */
    blendTiles: boolean;
    /** See {@link VFXBatchSettings.softParticles}. */
    softParticles: boolean;
    /** See {@link VFXBatchSettings.softNearFade}. */
    softNearFade: number;
    /** See {@link VFXBatchSettings.softFarFade}. */
    softFarFade: number;
    /** See {@link VFXBatchSettings.materialBlendMode}. */
    materialBlendMode: number;
    /** See {@link VFXBatchSettings.materialTransparent}. */
    materialTransparent: boolean;
    /** See {@link VFXBatchSettings.materialDepthTest}. */
    materialDepthTest: boolean;
    /** See {@link VFXBatchSettings.materialDepthWrite}. */
    materialDepthWrite: boolean;
    /** See {@link VFXBatchSettings.materialAlphaTest}. */
    materialAlphaTest: number;
    /** See {@link VFXBatchSettings.texture}. */
    texture: BaseTexture | null;
    /** See {@link VFXBatchSettings.reflectionTexture}. */
    reflectionTexture: BaseTexture | null;
    /** See {@link VFXBatchSettings.reflectionLevel}. */
    reflectionLevel: number;
    /** See {@link VFXBatchSettings.reflectionAtlas}. */
    reflectionAtlas: BaseTexture | null;
    /** See {@link VFXBatchSettings.layerMask}. */
    layerMask: number;
    /** Babylon rendering group the batch mesh draws in, see {@link VFXBatchSettings.renderingGroupId}. */
    renderingGroupId: number;
    /** Whether the scene's fog is applied, see {@link VFXBatchSettings.applyFog}. */
    applyFog: boolean;
    /** Billboard pivot in particle-size units, see {@link VFXBatchSettings.pivot}. */
    pivot?: Vector3;
    /** Draw order within the batch, see {@link SortMode}. */
    sortMode: SortMode;
    /** Which faces a mesh particle draws, see {@link RenderFace}; `'both'` outside the Mesh render mode. */
    renderFace: RenderFace;
    /** Smallest size a particle may have on screen, see {@link VFXBatchSettings.minParticleSize}. */
    minParticleSize: number;
    /** Largest size a particle may have on screen, see {@link VFXBatchSettings.maxParticleSize}. */
    maxParticleSize: number;
    /** Mesh particle lighting, see {@link VFXBatchSettings.lighting}. */
    lighting?: MeshLighting;
    /** Mesh particle rim, see {@link VFXBatchSettings.rim}. */
    rim?: MeshRim;
    /** The main map's layout, see {@link VFXBatchSettings.mapUV}. */
    mapUV?: TextureUV;
    /** Map UV distortion, see {@link VFXBatchSettings.uvDistortion}. */
    uvDistortion?: ParticleUVDistortion;
    /** Colour ramp for the map, see {@link VFXBatchSettings.gradientMap}. */
    gradientMap?: ParticleGradientMap;
    /** Alpha erosion, see {@link VFXBatchSettings.erosion}. */
    erosion?: ParticleErosion;
}

/**
 * One draw call of a {@link BatchedRenderer}: the systems that share a material, texture and
 * geometry, drawn together from one instanced mesh. The renderer makes and frees batches as
 * systems are added and their settings change; read them through `renderer.batches` to inspect
 * what is drawn, not to change it.
 */
export abstract class VFXBatch {
    /**
     * The Babylon mesh the batch draws with. Its world matrix is frozen at identity: the instance
     * data is already in world space, so no parent's transform moves the particles again.
     */
    mesh!: Mesh;
    /** The node the batch mesh lives under, kept across the meshes the batch rebuilds. */
    private parentNode: Node | null = null;
    /** The systems drawn by this batch. */
    systems: Set<IParticleSystem>;
    /** The settings every system in the batch shares, with what the render mode ignores at its default. */
    settings: StoredBatchSettings;
    /** @internal */
    protected maxParticles: number;
    /** @internal */
    protected scene: Scene;
    /** @internal */
    protected readonly visibleSystems: IParticleSystem[] = [];
    /**
     * The depth texture soft particles read, from {@link BatchedRenderer.setDepthTexture}.
     * @internal
     */
    protected depth: DepthBinding | null;

    /** @internal */
    protected constructor(settings: VFXBatchSettings, scene: Scene, depth: DepthBinding | null = null) {
        this.scene = scene;
        this.depth = depth;
        this.maxParticles = 0;
        this.systems = new Set<IParticleSystem>();
        this.settings = storedBatchSettings(settings);
        // The subclass builds the mesh, in setupBuffers.
    }

    /**
     * Puts the batch mesh under `node` (the renderer), for the scene graph and the node's enabled
     * state; the node's transform does not reach the particles.
     * @internal
     */
    attachTo(node: Node | null): void {
        this.parentNode = node;
        this.mesh.parent = node;
    }

    /**
     * Applies the batch-level scene settings to {@link mesh}. Called on every
     * mesh the batch creates, since the buffers rebuild it.
     *
     * The bounds of a batch mesh are not kept, so Babylon cannot sort it among
     * the scene's transparent meshes by distance; `alphaIndex` from the
     * system's render order puts it where the author said, and the rendering
     * group and layer mask reach the mesh at all (they used to stop at the
     * settings).
     */
    protected configureMesh(): void {
        const mesh = this.mesh;
        // Until the first fill measures the particles, the batch has no bounds
        // to cull by and is drawn regardless. The instance data is already in
        // world space, so the bounds never need the mesh's own matrix.
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.doNotSyncBoundingInfo = true;
        mesh.parent = this.parentNode;
        // World-space instance data: the parent's transform must not apply, nor the bounds move
        // with it. Frozen at identity, and kept there: a parent's markAsDirty would otherwise make
        // the frozen mesh recompute from its parents once.
        mesh.freezeWorldMatrix(Matrix.Identity());
        const world = mesh.getWorldMatrix();
        mesh.computeWorldMatrix = () => world;
        mesh.setBoundingInfo(new BoundingInfo(BVector3.Zero(), BVector3.Zero()));
        mesh.layerMask = this.settings.layerMask;
        mesh.renderingGroupId = this.settings.renderingGroupId;
        mesh.alphaIndex = this.settings.renderOrder;
        // The shaders fog themselves; Babylon's own fog pass does not apply to a ShaderMaterial.
        mesh.applyFog = false;
        // Its geometry is one quad or mesh at the origin, not the particles, so a pick or a
        // collision against it would hit nothing that is drawn. The renderer rebuilds batches
        // from its systems, so a scene serializer has nothing to write either.
        mesh.isPickable = false;
        mesh.checkCollisions = false;
        mesh.doNotSerialize = true;
    }

    private readonly boundsMin_ = new Vector3();
    private readonly boundsMax_ = new Vector3();

    /**
     * Sets the batch mesh's bounds to the union of its filled systems' world
     * bounds, so Babylon skips the draw when none of them is in view. Called
     * after each fill, over the systems {@link getVisibleSystems} last returned.
     * A batch whose systems have no measured bounds stays always drawn.
     */
    protected refreshBoundingInfo(): void {
        const min = this.boundsMin_;
        const max = this.boundsMax_;
        let minX = Infinity;
        let minY = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let maxZ = -Infinity;
        let any = false;
        const systems = this.visibleSystems;
        for (let i = 0; i < systems.length; i++) {
            const system = systems[i] as ParticleSystem;
            if (system.particleNum === 0 || typeof system.getWorldBounds !== 'function') {
                continue;
            }
            if (!system.getWorldBounds(min, max)) {
                // Drawn but not measured: the batch cannot be culled this frame.
                this.mesh.alwaysSelectAsActiveMesh = true;
                return;
            }
            any = true;
            if (min.x < minX) minX = min.x;
            if (min.y < minY) minY = min.y;
            if (min.z < minZ) minZ = min.z;
            if (max.x > maxX) maxX = max.x;
            if (max.y > maxY) maxY = max.y;
            if (max.z > maxZ) maxZ = max.z;
        }
        if (!any) {
            return;
        }
        const info = this.mesh.getBoundingInfo();
        const bmin = info.minimum;
        const bmax = info.maximum;
        if (
            bmin.x !== minX ||
            bmin.y !== minY ||
            bmin.z !== minZ ||
            bmax.x !== maxX ||
            bmax.y !== maxY ||
            bmax.z !== maxZ
        ) {
            bmin.set(minX, minY, minZ);
            bmax.set(maxX, maxY, maxZ);
            info.reConstruct(bmin, bmax);
        }
        this.mesh.alwaysSelectAsActiveMesh = false;
    }

    /**
     * Writes a uniform that changes per bind, such as one read off the active camera, to the
     * material for the next bind and to its bound effect for this one: ShaderMaterial uploads its
     * stored values before the bind observers run, so a value written only to the material would
     * reach the GPU one draw late, and with two cameras it would always be the other camera's.
     */
    protected static writeBound(material: ShaderMaterial, write: (target: ShaderMaterial | Effect) => void): void {
        write(material);
        // An effect still compiling has no pipeline context to write to; it gets the stored value
        // when it is first bound. A sub mesh's effect override is not reached here.
        const effect = material.getEffect();
        if (effect?.isReady()) {
            write(effect);
        }
    }

    /**
     * The per-bind upload of the scene's current fog. Mode 0 (none) when the scene has fog
     * disabled, so toggling fog at runtime needs no recompile.
     * @internal
     */
    protected bindFog(material: ShaderMaterial): void {
        if (!this.settings.applyFog) {
            return;
        }
        const scene = this.scene;
        material.onBindObservable.add(() => {
            const effect = material.getEffect();
            if (!effect) {
                return;
            }
            const mode = scene.fogEnabled ? scene.fogMode : Scene.FOGMODE_NONE;
            effect.setFloat4('vFogInfos', mode, scene.fogStart, scene.fogEnd, scene.fogDensity);
            effect.setColor3('vFogColor', scene.fogColor);
        });
    }

    /**
     * Seconds of renderer time, set by the renderer before each fill; what UV
     * and erosion mask scrolling advance by.
     */
    time = 0;

    /** True when a texture effect of this batch samples UV channel 1, see {@link UVChannel}. */
    protected usesUV1(): boolean {
        return readsUV1(this.settings);
    }

    /** Sets the texture effects' textures and constants, and advances their scrolling on every bind. */
    protected bindSurface(material: ShaderMaterial): void {
        const {mapUV, uvDistortion, gradientMap, erosion} = this.settings;
        if (uvDistortion?.map) {
            material.setTexture('distortionMap', uvDistortion.map);
        }
        if (gradientMap?.ramp) {
            material.setTexture('gradientMap', gradientMap.ramp);
        }
        if (erosion?.mask) {
            material.setTexture('erosionMask', erosion.mask);
        }
        this.writeSurfaceParams(material);
        if (!mapUV && !uvDistortion && !erosion?.mask && !gradientMap) {
            return;
        }
        // Wrapped on the CPU: a raw speed × time grows until float32 UVs lose their fraction.
        // Over two repeats, not one: a mirrored texture repeats every two, and
        // wrapped over one it jumped to its mirror image at every wrap.
        const wrap = (value: number) => value - 2 * Math.floor(value / 2);
        const mapTransform = new BVector4();
        const distortionTransform = new BVector4();
        const maskTransform = new BVector4();
        const gradientRange = new BVector2(0, 1);
        // Only the scroll is wrapped: an offset is kept as given, so a clamped
        // texture moved off its edge stays moved.
        const transform = (uv: TextureUV, time: number, out: BVector4) =>
            out.set(
                uv.tiling[0],
                uv.tiling[1],
                uv.offset[0] + wrap(uv.scroll[0] * time),
                uv.offset[1] + wrap(uv.scroll[1] * time)
            );
        // Written to the material for the next bind and to the bound effect for
        // this one: ShaderMaterial uploads its values before the bind observers run.
        // The layouts are read off the settings on every bind, so a live change
        // to a tiling or scroll reaches the next draw.
        const write = () => {
            const time = this.time;
            const effect = material.getEffect();
            const {mapUV, uvDistortion, gradientMap, erosion} = this.settings;
            if (mapUV) {
                transform(mapUV, time, mapTransform);
                material.setVector4('mapTransform', mapTransform);
                effect?.setVector4('mapTransform', mapTransform);
            }
            if (uvDistortion) {
                transform(uvDistortion.mapUV, time, distortionTransform);
                material.setVector4('distortionTransform', distortionTransform);
                effect?.setVector4('distortionTransform', distortionTransform);
            }
            if (erosion?.mask) {
                transform(erosion.maskUV, time, maskTransform);
                material.setVector4('erosionMaskTransform', maskTransform);
                effect?.setVector4('erosionMaskTransform', maskTransform);
            }
            if (gradientMap?.ramp) {
                // Texel centres of the first and last texel, so a repeating
                // ramp does not blend its two ends at black and white.
                const width = gradientMap.ramp.getSize().width;
                const half = width > 0 ? 0.5 / width : 0;
                gradientRange.set(half, 1 - half);
                material.setVector2('gradientMapRange', gradientRange);
                effect?.setVector2('gradientMapRange', gradientRange);
            }
        };
        write();
        material.onBindObservable.add(write);
    }

    /** Writes the texture effects' constants (the uniforms their live parameters set). */
    private writeSurfaceParams(material: ShaderMaterial): void {
        const {uvDistortion, gradientMap, erosion} = this.settings;
        if (uvDistortion?.map) {
            material.setFloat('distortionStrength', uvDistortion.strength);
        }
        if (gradientMap?.ramp) {
            const [r, g, b, a] = GRADIENT_MAP_WEIGHTS[gradientMap.channel];
            material.setVector4('gradientMapChannel', new BVector4(r, g, b, a));
        }
        if (erosion) {
            material.setVector2('erosionParams', new BVector2(erosion.softness, erosion.edgeWidth));
            material.setVector3(
                'erosionEdgeColor',
                new BVector3(erosion.edgeColor[0], erosion.edgeColor[1], erosion.edgeColor[2])
            );
        }
    }

    /**
     * Takes new live parameters (see {@link BatchedRenderer.updateSystem}): settings with the same
     * shader key as the batch's, whose uniform values differ. They are copied into the batch's
     * settings and written to its material, which is kept.
     * @internal
     */
    applyLiveSettings(settings: StoredBatchSettings): void {
        Object.assign(this.settings, settings);
        const material = this.mesh.material;
        if (material instanceof ShaderMaterial) {
            this.writeLiveUniforms(material);
        }
    }

    /**
     * Writes every uniform a live parameter sets, from the batch's settings. The base writes the
     * ones every render mode has; a mode adds its own.
     * @internal
     */
    protected writeLiveUniforms(material: ShaderMaterial): void {
        this.writeSoftParams(material);
        this.writeSurfaceParams(material);
    }

    /** @internal */
    addSystem(system: IParticleSystem): void {
        this.systems.add(system);
    }

    /** @internal */
    removeSystem(system: IParticleSystem): void {
        this.systems.delete(system);
    }

    /**
     * Visible systems of this batch, written into a buffer owned by the batch.
     * Called once per frame per batch, so the result is reused rather than
     * reallocated; treat it as valid only until the next call.
     */
    getVisibleSystems(): IParticleSystem[] {
        const visibleSystems = this.visibleSystems;
        let count = 0;
        for (const system of this.systems) {
            // A culled system's particles are off every camera's screen; filling
            // them in would only cost the copy and widen the batch's bounds.
            if (system.emitter.visible && (system as ParticleSystem).culled !== true) {
                visibleSystems[count++] = system;
            }
        }
        visibleSystems.length = count;
        return visibleSystems;
    }

    /**
     * Sets the depth texture soft particles read. Soft particles are compiled in only while there
     * is one, as Unity turns them off for a camera without a depth texture, so attaching or
     * removing it, or changing how it is packed, rebuilds a soft batch's material.
     *
     * @param depth - The binding, or a bare texture, read as `'linear'` and unpacked.
     * @internal Use {@link BatchedRenderer.setDepthTexture}.
     */
    applyDepthTexture(depth: DepthBinding | BaseTexture | null): void {
        if (depth instanceof BaseTexture) {
            depth = {texture: depth, encoding: 'linear', packed: false};
        }
        const previous = this.depth;
        this.depth = depth;
        if (!this.settings.softParticles) {
            return;
        }
        if (!previous !== !depth || previous?.packed !== depth?.packed) {
            this.rebuildMaterial();
            return;
        }
        const material = this.mesh.material;
        if (depth && material instanceof ShaderMaterial) {
            material.setTexture('depthTexture', depth.texture);
        }
    }

    /**
     * Sets the soft-particle and alpha-test values on a material, and decodes the depth for the
     * camera of each draw.
     */
    protected bindSoft(material: ShaderMaterial): void {
        this.writeSoftParams(material);
        if (this.drawsSoft()) {
            material.setTexture('depthTexture', this.depth!.texture);
            // Reused across binds: this runs on every draw call.
            const projParams = new BVector4(1, 0, 0, 1);
            material.onBindObservable.add(() => {
                const camera = this.scene.activeCamera;
                if (camera && this.depth) {
                    softDepthParams(camera, this.depth.encoding, projParams);
                    VFXBatch.writeBound(material, (target) => target.setVector4('projParams', projParams));
                }
            });
        }
    }

    /** Writes the soft-particle fade and the alpha cutoff, the live parameters every mode shares. */
    private writeSoftParams(material: ShaderMaterial): void {
        if (this.drawsSoft()) {
            material.setVector2(
                'softParams',
                new BVector2(
                    this.settings.softNearFade,
                    1.0 / Math.max(this.settings.softFarFade - this.settings.softNearFade, 0.0001)
                )
            );
        }
        if (this.settings.materialAlphaTest > 0) {
            material.setFloat('alphaTest', this.settings.materialAlphaTest);
        }
    }

    /** True when this batch draws soft particles: they are on and a depth texture is attached. */
    protected drawsSoft(): boolean {
        return this.settings.softParticles && this.depth !== null;
    }

    /**
     * Sets the light `'fixed'` mesh particles are lit by. Batches that draw no meshes ignore it.
     * @internal Use {@link BatchedRenderer.setMeshLighting}.
     */
    applyMeshLighting(_lighting: MeshLightingSettings): void {}

    /** @internal */
    abstract setupBuffers(): void;
    /** @internal */
    abstract expandBuffers(target: number): void;

    /** Rebuilds the instance buffers at the current {@link maxParticles}, after a shrink. @internal */
    protected abstract resizeBuffers(): void;

    /** The capacity a batch starts with and never shrinks below. @internal */
    protected abstract readonly initialCapacity: number;

    /** Fills in a row that used under a quarter of the buffers. */
    private underusedFills = 0;

    /**
     * How many fills in a row a batch may use under a quarter of its buffers before it halves
     * them: about five seconds at 60 frames per second. A burst that grew the buffers does not
     * hold that memory for the rest of the session, and a batch whose count swings does not
     * reallocate every few frames.
     */
    static readonly SHRINK_AFTER_FILLS = 300;

    /**
     * Grows the buffers to hold `count`, or halves them once the batch has used under a quarter of
     * them for {@link SHRINK_AFTER_FILLS} fills, never below {@link initialCapacity}. Called by each
     * fill with what it is about to write. @internal
     */
    protected fitBuffers(count: number): void {
        if (count > this.maxParticles) {
            this.underusedFills = 0;
            this.expandBuffers(count);
            return;
        }
        if (this.maxParticles > this.initialCapacity && count < this.maxParticles / 4) {
            if (++this.underusedFills >= VFXBatch.SHRINK_AFTER_FILLS) {
                this.underusedFills = 0;
                this.maxParticles = Math.max(this.initialCapacity, this.maxParticles / 2);
                this.resizeBuffers();
            }
            return;
        }
        this.underusedFills = 0;
    }

    /** @internal */
    abstract rebuildMaterial(): void;
    /** @internal */
    abstract update(): void;

    /** @internal */
    dispose(): void {
        this.mesh.dispose();
    }
}
