import {BoundingInfo} from '@babylonjs/core/Culling/boundingInfo';
import {Constants} from '@babylonjs/core/Engines/constants';
import {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {Vector2 as BVector2, Vector3 as BVector3, Vector4 as BVector4} from '@babylonjs/core/Maths/math.vector';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {Scene} from '@babylonjs/core/scene';
import {IParticleSystem, Vector3} from 'quarks.core';
import {VFXBatchSettings} from './BatchedRenderer';
import type {ParticleSystem} from './ParticleSystem';

/**
 * The order the particles of a batch are drawn in (Unity's Sort Mode). Alpha
 * blended particles cover what was drawn before them, so the order shows.
 *
 * - `'none'`: as they are, system by system. Right for additive blending.
 * - `'distance'`: farthest from the active camera first, so nearer particles
 *   cover farther ones.
 * - `'oldestInFront'` / `'youngestInFront'`: by age.
 *
 * Sorting runs over the whole batch after each fill. Trails are not sorted.
 */
export type SortMode = 'none' | 'distance' | 'oldestInFront' | 'youngestInFront';

export enum RenderMode {
    BillBoard = 0,
    StretchedBillBoard = 1,
    Mesh = 2,
    Trail = 3,
    HorizontalBillBoard = 4,
    VerticalBillBoard = 5,
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
     * surface toward it, for an outline (a dark ink line with a dark colour).
     */
    mode: 'add' | 'mix';
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
        mode: rim.mode === 'mix' ? 'mix' : 'add',
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
 * Alpha erosion: the particle's alpha decides how much of its shape is left
 * instead of how transparent it is, so `ColorOverLife` fading alpha out
 * dissolves (noise mask) or wipes (gradient mask) the shape away. See
 * {@link VFXBatchSettings.erosion}.
 */
export interface ParticleErosion {
    /**
     * Mask whose red channel orders what goes first, sampled with the
     * particle's UV (the quad, mesh or trail UV, unscrolled). Null: the map's
     * own alpha, so a soft shape shrinks from its edges.
     */
    mask: BaseTexture | null;
    /** Width of the soft transition at the cut, in mask units. Default 0.05. */
    softness: number;
    /** Width of the glowing band above the cut, in mask units; 0 (default) draws none. */
    edgeWidth: number;
    /** Colour added in the edge band, linear RGB, may exceed 1. Default `[1, 1, 1]`. */
    edgeColor: [number, number, number];
    /** Mask UV scroll, UV units per second. Default `[0, 0]`. */
    maskScroll: [number, number];
}

/** A complete erosion from a partial one, every field defaulted, or undefined when `erosion` is unset. */
export function normalizeErosion(erosion: Partial<ParticleErosion> | null | undefined): ParticleErosion | undefined {
    if (!erosion || typeof erosion !== 'object') {
        return undefined;
    }
    const num = (value: unknown, fallback: number) =>
        typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    const color = Array.isArray(erosion.edgeColor) ? erosion.edgeColor : [1, 1, 1];
    const scroll = Array.isArray(erosion.maskScroll) ? erosion.maskScroll : [0, 0];
    return {
        mask: erosion.mask ?? null,
        softness: Math.max(0.0001, num(erosion.softness, 0.05)),
        edgeWidth: Math.max(0, num(erosion.edgeWidth, 0)),
        edgeColor: [num(color[0], 1), num(color[1], 1), num(color[2], 1)],
        maskScroll: [num(scroll[0], 0), num(scroll[1], 0)],
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
        a.softness === b.softness &&
        a.edgeWidth === b.edgeWidth &&
        a.edgeColor[0] === b.edgeColor[0] &&
        a.edgeColor[1] === b.edgeColor[1] &&
        a.edgeColor[2] === b.edgeColor[2] &&
        a.maskScroll[0] === b.maskScroll[0] &&
        a.maskScroll[1] === b.maskScroll[1]
    );
}

/** A UV scroll speed, or undefined when unset or zero. */
export function normalizeUVScroll(scroll: ArrayLike<number> | null | undefined): [number, number] | undefined {
    if (!scroll || typeof scroll !== 'object') {
        return undefined;
    }
    const u = Number.isFinite(scroll[0]) ? scroll[0] : 0;
    const v = Number.isFinite(scroll[1]) ? scroll[1] : 0;
    return u === 0 && v === 0 ? undefined : [u, v];
}

/** True when both scroll the same way (or both not at all). */
export function uvScrollEqual(a: [number, number] | undefined, b: [number, number] | undefined): boolean {
    return a === b || (!!a && !!b && a[0] === b[0] && a[1] === b[1]);
}

export interface StoredBatchSettings {
    instancingGeometry: Float32Array;
    instancingIndices: Uint32Array | Uint16Array;
    instancingUVs?: Float32Array;
    instancingNormals?: Float32Array;
    renderMode: RenderMode;
    renderOrder: number;
    uTileCount: number;
    vTileCount: number;
    blendTiles: boolean;
    softParticles: boolean;
    softNearFade: number;
    softFarFade: number;
    materialBlendMode: number;
    materialTransparent: boolean;
    materialDepthTest: boolean;
    materialDepthWrite: boolean;
    materialAlphaTest: number;
    texture: any;
    reflectionTexture: BaseTexture | null;
    reflectionLevel: number;
    reflectionFaces: BaseTexture[] | null;
    reflectionAtlas: BaseTexture | null;
    layerMask: number;
    /** Babylon rendering group the batch mesh draws in, see {@link VFXBatchSettings.renderingGroupId}. */
    renderingGroupId: number;
    /** Whether the scene's fog is applied, see {@link VFXBatchSettings.applyFog}. */
    applyFog: boolean;
    /** Billboard pivot in particle-size units, see {@link VFXBatchSettings.pivot}. */
    pivot?: Vector3;
    /** Draw order within the batch, see {@link SortMode}. */
    sortMode: SortMode;
    /** Smallest size a particle may have on screen, see {@link VFXBatchSettings.minParticleSize}. */
    minParticleSize: number;
    /** Largest size a particle may have on screen, see {@link VFXBatchSettings.maxParticleSize}. */
    maxParticleSize: number;
    /** Mesh particle lighting, see {@link VFXBatchSettings.lighting}. */
    lighting?: MeshLighting;
    /** Mesh particle rim, see {@link VFXBatchSettings.rim}. */
    rim?: MeshRim;
    /** Map UV scroll, see {@link VFXBatchSettings.uvScroll}. */
    uvScroll?: [number, number];
    /** Colour ramp for the map, see {@link VFXBatchSettings.gradientMap}. */
    gradientMap: BaseTexture | null;
    /** Alpha erosion, see {@link VFXBatchSettings.erosion}. */
    erosion?: ParticleErosion;
}

export abstract class VFXBatch {
    mesh: Mesh;
    systems: Set<IParticleSystem>;
    settings: StoredBatchSettings;
    protected maxParticles: number;
    protected scene: Scene;
    protected readonly visibleSystems: IParticleSystem[] = [];

    protected constructor(settings: VFXBatchSettings, scene: Scene) {
        this.scene = scene;
        this.maxParticles = 1000;
        this.systems = new Set<IParticleSystem>();
        this.settings = {
            instancingGeometry: settings.instancingGeometry,
            instancingIndices: settings.instancingIndices,
            instancingUVs: settings.instancingUVs,
            instancingNormals: settings.instancingNormals,
            renderMode: settings.renderMode,
            renderOrder: settings.renderOrder,
            uTileCount: settings.uTileCount,
            vTileCount: settings.vTileCount,
            blendTiles: settings.blendTiles,
            softParticles: settings.softParticles,
            softNearFade: settings.softNearFade,
            softFarFade: settings.softFarFade,
            materialBlendMode: settings.materialBlendMode,
            materialTransparent: settings.materialTransparent,
            materialDepthTest: settings.materialDepthTest,
            materialDepthWrite: settings.materialDepthWrite,
            materialAlphaTest: settings.materialAlphaTest,
            texture: settings.texture,
            reflectionTexture: settings.reflectionTexture ?? null,
            reflectionLevel: settings.reflectionLevel ?? 1,
            reflectionFaces: settings.reflectionFaces ?? null,
            reflectionAtlas: settings.reflectionAtlas ?? null,
            pivot: settings.pivot?.clone(),
            sortMode: settings.sortMode ?? 'none',
            minParticleSize: settings.minParticleSize ?? 0,
            maxParticleSize: settings.maxParticleSize ?? Infinity,
            layerMask: settings.layerMask,
            renderingGroupId: settings.renderingGroupId ?? 0,
            applyFog: settings.applyFog ?? true,
            lighting: settings.lighting,
            rim: normalizeMeshRim(settings.rim),
            uvScroll: normalizeUVScroll(settings.uvScroll),
            gradientMap: settings.gradientMap ?? null,
            erosion: normalizeErosion(settings.erosion),
        };
        this.mesh = new Mesh('vfxBatch', scene);
        this.configureMesh();
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
        mesh.setBoundingInfo(new BoundingInfo(BVector3.Zero(), BVector3.Zero()));
        mesh.layerMask = this.settings.layerMask;
        mesh.renderingGroupId = this.settings.renderingGroupId;
        mesh.alphaIndex = this.settings.renderOrder;
        // The shaders fog themselves; Babylon's own fog pass does not apply to a ShaderMaterial.
        mesh.applyFog = false;
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
     * Fog defines and uniforms for a material of this batch, and the per-bind
     * upload of the scene's current fog. Mode 0 (none) when the scene has fog
     * disabled, so toggling fog at runtime needs no recompile.
     */
    protected static readonly FOG_UNIFORMS = ['vFogInfos', 'vFogColor'];

    protected fogDefines(): string[] {
        if (!this.settings.applyFog) {
            return [];
        }
        const additive =
            this.settings.materialTransparent &&
            (this.settings.materialBlendMode === Constants.ALPHA_ADD ||
                this.settings.materialBlendMode === Constants.ALPHA_ONEONE);
        return additive ? ['FOG', 'FOG_ADDITIVE'] : ['FOG'];
    }

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

    /** Defines of the texture effects (see `shaders/chunks/surface.ts`) this batch uses. */
    protected surfaceDefines(): string[] {
        const defines: string[] = [];
        if (this.settings.uvScroll) {
            defines.push('UV_SCROLL');
        }
        if (this.settings.gradientMap) {
            defines.push('GRADIENT_MAP');
        }
        const erosion = this.settings.erosion;
        if (erosion) {
            defines.push('EROSION');
            if (erosion.mask) {
                defines.push('EROSION_MASK');
            }
        }
        return defines;
    }

    /** Adds the uniforms and samplers of the texture effects this batch uses. */
    protected surfaceUniforms(uniforms: string[], samplers: string[]): void {
        if (this.settings.uvScroll) {
            uniforms.push('uvScrollOffset');
        }
        if (this.settings.gradientMap) {
            samplers.push('gradientMap');
        }
        const erosion = this.settings.erosion;
        if (erosion) {
            uniforms.push('erosionParams', 'erosionEdgeColor');
            if (erosion.mask) {
                samplers.push('erosionMask');
            }
        }
    }

    /** Sets the texture effects' textures and constants, and advances their scrolling on every bind. */
    protected bindSurface(material: ShaderMaterial): void {
        const {uvScroll, gradientMap, erosion} = this.settings;
        if (gradientMap) {
            material.setTexture('gradientMap', gradientMap);
        }
        if (erosion) {
            if (erosion.mask) {
                material.setTexture('erosionMask', erosion.mask);
            }
            material.setVector3(
                'erosionEdgeColor',
                new BVector3(erosion.edgeColor[0], erosion.edgeColor[1], erosion.edgeColor[2])
            );
        }
        if (!uvScroll && !erosion) {
            return;
        }
        // Wrapped on the CPU: a raw speed × time grows until float32 UVs lose their fraction.
        const wrap = (value: number) => value - Math.floor(value);
        const scrollOffset = new BVector2();
        const erosionParams = new BVector4();
        const write = () => {
            const time = this.time;
            if (uvScroll) {
                scrollOffset.set(wrap(uvScroll[0] * time), wrap(uvScroll[1] * time));
                material.setVector2('uvScrollOffset', scrollOffset);
            }
            if (erosion) {
                erosionParams.set(
                    erosion.softness,
                    erosion.edgeWidth,
                    wrap(erosion.maskScroll[0] * time),
                    wrap(erosion.maskScroll[1] * time)
                );
                material.setVector4('erosionParams', erosionParams);
            }
        };
        write();
        material.onBindObservable.add(write);
    }

    addSystem(system: IParticleSystem) {
        this.systems.add(system);
    }

    removeSystem(system: IParticleSystem) {
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

    applyDepthTexture(depthTexture: BaseTexture | null): void {
        const material = this.mesh.material;
        if (material && material instanceof ShaderMaterial) {
            material.setTexture('depthTexture', depthTexture);
        }
    }

    /** Sets the light `'fixed'` mesh particles are lit by. Batches that draw no meshes ignore it. */
    applyMeshLighting(_lighting: MeshLightingSettings): void {}

    abstract setupBuffers(): void;
    abstract expandBuffers(target: number): void;
    abstract rebuildMaterial(): void;
    abstract update(): void;

    dispose(): void {
        this.mesh.dispose();
    }
}
