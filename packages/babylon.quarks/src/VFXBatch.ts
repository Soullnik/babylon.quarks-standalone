import {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {Scene} from '@babylonjs/core/scene';
import {IParticleSystem, Vector3} from 'quarks.core';
import {VFXBatchSettings} from './BatchedRenderer';

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
    /** Billboard pivot in particle-size units, see {@link VFXBatchSettings.pivot}. */
    pivot?: Vector3;
    /** Mesh particle lighting, see {@link VFXBatchSettings.lighting}. */
    lighting?: MeshLighting;
    /** Mesh particle rim, see {@link VFXBatchSettings.rim}. */
    rim?: MeshRim;
}

export abstract class VFXBatch {
    mesh: Mesh;
    systems: Set<IParticleSystem>;
    settings: StoredBatchSettings;
    protected maxParticles: number;
    protected scene: Scene;
    private readonly visibleSystems: IParticleSystem[] = [];

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
            layerMask: settings.layerMask,
            lighting: settings.lighting,
            rim: normalizeMeshRim(settings.rim),
        };
        this.mesh = new Mesh('vfxBatch', scene);
        this.mesh.alwaysSelectAsActiveMesh = true;
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
            if (system.emitter.visible) {
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
