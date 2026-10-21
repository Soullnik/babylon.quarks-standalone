import {Camera} from '@babylonjs/core/Cameras/camera';
import {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Frustum} from '@babylonjs/core/Maths/math.frustum';
import {Plane} from '@babylonjs/core/Maths/math.plane';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {EmitSubParticleSystem, IParticleSystem, Vector3} from 'quarks.core';
import {ParticleSystem} from './ParticleSystem';
import {SpriteBatch} from './SpriteBatch';
import {TrailBatch} from './TrailBatch';
import {
    defaultMeshLighting,
    erosionEqual,
    gradientMapEqual,
    mapUVEqual,
    MeshLighting,
    MeshLightingSettings,
    MeshRim,
    meshRimEqual,
    ParticleErosion,
    ParticleGradientMap,
    ParticleUVDistortion,
    readsUV1,
    RenderMode,
    SortMode,
    StoredBatchSettings,
    TextureUV,
    uvDistortionEqual,
    VFXBatch,
} from './VFXBatch';

export interface VFXBatchSettings {
    instancingGeometry: Float32Array;
    instancingIndices: Uint32Array | Uint16Array;
    instancingUVs?: Float32Array;
    /** The mesh's second UV set, see {@link UVChannel}. */
    instancingUVs2?: Float32Array;
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
    texture: Texture | null;
    /**
     * Cubemap (or other reflection texture) harvested from a Babylon material's
     * `reflectionTexture`. Mesh batches sample it like StandardMaterial cubic
     * reflection; other render modes ignore it.
     */
    reflectionTexture: BaseTexture | null;
    /** Multiplier for the reflection sample — mirrors `texture.level`. */
    reflectionLevel: number;
    /**
     * Optional six cube-face 2D textures (px,py,pz,nx,ny,nz). Prefer
     * `reflectionAtlas` on iOS — many simultaneous face samplers still trip
     * GL_INVALID_OPERATION on WebKit.
     */
    reflectionFaces: BaseTexture[] | null;
    /**
     * Single 3×2 atlas of cube faces (px py pz / nx ny nz). One sampler2D —
     * the path that stays valid on iOS WebKit ShaderMaterial draws.
     */
    reflectionAtlas: BaseTexture | null;
    layerMask: number;
    /**
     * Babylon rendering group (`mesh.renderingGroupId`) the batch draws in,
     * 0 by default. Systems with different groups are batched apart.
     */
    renderingGroupId: number;
    /**
     * Whether the scene's fog applies to the particles, as it does to any other
     * mesh; true by default. Additive particles fade toward black rather than
     * the fog colour. Systems that differ are batched apart.
     */
    applyFog: boolean;
    /**
     * Offset of billboard quads from their particle, in particle-size units
     * (Unity's renderer Pivot). On billboards x/y move the quad in its own plane
     * before it is rotated and z moves it toward the camera (up for horizontal
     * billboards). On stretched billboards x runs from the head to the tail and
     * y across, and z is unused. Absent or zero: no offset. Meshes ignore it.
     */
    pivot?: Vector3;
    /** Draw order within the batch, see {@link SortMode}. Unset is `'none'`. Systems that differ are batched apart. */
    sortMode?: SortMode;
    /**
     * Smallest size a billboard or stretched particle may have on screen, as a
     * fraction of the viewport height (Unity's Min Particle Size); 0 by default.
     * Meshes and trails ignore it. Systems that differ are batched apart.
     */
    minParticleSize?: number;
    /**
     * Largest size a billboard or stretched particle may have on screen, as a
     * fraction of the viewport height (Unity's Max Particle Size); unlimited by
     * default. Meshes and trails ignore it. Systems that differ are batched apart.
     */
    maxParticleSize?: number;
    /**
     * How mesh particles are lit (`'unlit'`, `'fixed'` or `'scene'`); unset is
     * `'fixed'`. See {@link MeshLighting}. Other render modes ignore it.
     */
    lighting?: MeshLighting;
    /** Rim (Fresnel) term on mesh particles; unset draws none. See {@link MeshRim}. */
    rim?: MeshRim;
    /** How the main map is laid over the particle, see {@link TextureUV}. Unset: as drawn. Systems that differ are batched apart. */
    mapUV?: TextureUV;
    /** Colour ramp the map is recoloured through, see {@link ParticleGradientMap}. Unset: none. Systems that differ are batched apart. */
    gradientMap?: ParticleGradientMap;
    /** Map UV distortion by a noise texture, see {@link ParticleUVDistortion}. Unset: none. Systems that differ are batched apart. */
    uvDistortion?: ParticleUVDistortion;
    /** Alpha erosion (dissolve / wipe), see {@link ParticleErosion}. Unset: none. Systems that differ are batched apart. */
    erosion?: ParticleErosion;
}

export interface AdaptivePerformanceOptions {
    targetFrameMs: number;
    minQuality: number;
    maxQuality: number;
    decreaseStep: number;
    increaseStep: number;
}

/** True when both pivots put the quad in the same place; a missing pivot is zero. */
function pivotEqual(a: Vector3 | undefined, b: Vector3 | undefined): boolean {
    return (a?.x ?? 0) === (b?.x ?? 0) && (a?.y ?? 0) === (b?.y ?? 0) && (a?.z ?? 0) === (b?.z ?? 0);
}

/** True when both face lists are the same six texture references (or both empty). */
function reflectionFacesEqual(a: BaseTexture[] | null | undefined, b: BaseTexture[] | null | undefined): boolean {
    if (a === b) {
        return true;
    }
    if (!a || !b || a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

export interface AdaptivePerformanceState extends AdaptivePerformanceOptions {
    enabled: boolean;
    currentQuality: number;
    lastFrameCpuMs: number;
}

export class BatchedRenderer extends TransformNode {
    batches: Array<VFXBatch> = [];
    /** Seconds this renderer has been updated for; the clock UV and erosion scrolling run on. */
    private elapsed = 0;
    systemToBatchIndex: Map<IParticleSystem, number> = new Map<IParticleSystem, number>();
    depthTexture: BaseTexture | null = null;
    /** Systems in insertion order — iterated every frame, unlike the map. */
    private systems: Array<IParticleSystem> = [];
    /**
     * The same systems, ordered so that one emitting into another comes first.
     *
     * A sub emitter's particles are created by its parent's behaviors, part way
     * through the parent's step. A sub system updated before its parent has
     * already fixed the list of particles it will run behaviors over, so those
     * new particles are drawn that frame with nothing but their start values —
     * white where a colour curve would have coloured them, at their start size,
     * sitting at the point they were born. Rebuilt only when the set of systems
     * or their behaviors changes, not per frame.
     */
    private orderedSystems: Array<IParticleSystem> = [];
    private orderedSystemsStale = true;
    /** Consecutive frames each batch has held no system, parallel to `batches`. */
    private batchEmptyFrames: Array<number> = [];
    /**
     * How long an empty batch is kept before it is disposed. Systems that toggle
     * a setting back and forth reuse the batch within this window instead of
     * rebuilding a mesh and material every time.
     */
    private static readonly EMPTY_BATCH_GRACE_FRAMES = 120;
    private adaptivePerformanceState: AdaptivePerformanceState = {
        enabled: false,
        targetFrameMs: 16.7,
        minQuality: 0.35,
        maxQuality: 1,
        decreaseStep: 0.08,
        increaseStep: 0.02,
        currentQuality: 1,
        lastFrameCpuMs: 0,
    };
    private lastAppliedQuality = Number.NaN;
    private meshLighting: MeshLightingSettings = defaultMeshLighting();

    /**
     * Whether systems whose {@link ParticleSystem.cullingMode} is not
     * `'always'` are tested against the active cameras each frame and paused
     * while unseen. Off, every system simulates every frame; the batches' own
     * frustum culling of the draw stays on either way.
     */
    cullingEnabled = true;

    /**
     * Time per frame, in milliseconds, that systems coming back into view may
     * spend together on the steps they missed while culled (`'pauseAndCatchUp'`).
     * Steps that do not fit are dropped, not deferred, so a crowd of effects
     * reappearing at once costs at most this. 2 by default.
     */
    catchUpBudgetMs = 2;

    /**
     * Time per frame, in milliseconds, after which the systems still to be
     * advanced run one step instead of catching up on a long frame. The time
     * the skipped steps would have covered is dropped, so a frame that already
     * ran long cannot make the next one longer still. Unlimited by default;
     * {@link configureAdaptivePerformance} does not set it.
     */
    simulationBudgetMs = Infinity;

    /** Frustum planes of the active cameras, six per camera, rebuilt each update. */
    private frustumPlanes: Plane[] = [];
    private readonly boundsMin = new Vector3();
    private readonly boundsMax = new Vector3();

    constructor(name: string, scene: Scene) {
        super(name, scene);
    }

    /**
     * Gathers the frustum planes of the cameras the scene renders with, six per
     * camera. Empty when there is no camera yet; systems are then never culled.
     */
    private collectFrustumPlanes(): Plane[] {
        const scene = this.getScene();
        const planes = this.frustumPlanes;
        const activeCameras = scene.activeCameras;
        const activeCamera = scene.activeCamera;
        const cameras: Camera[] =
            activeCameras && activeCameras.length > 0 ? activeCameras : activeCamera ? [activeCamera] : [];
        const needed = cameras.length * 6;
        while (planes.length < needed) {
            planes.push(new Plane(0, 0, 0, 0));
        }
        planes.length = needed;
        for (let c = 0; c < cameras.length; c++) {
            const camera = cameras[c];
            // Both matrices are recomputed only on demand: a camera moved since
            // the last render would otherwise be tested where it was, and one
            // that has not rendered yet has no projection at all.
            camera.getViewMatrix();
            camera.getProjectionMatrix();
            const transform = camera.getTransformationMatrix();
            const slice = c === 0 ? planes : planes.slice(c * 6, c * 6 + 6);
            Frustum.GetPlanesToRef(transform, slice);
            if (c !== 0) {
                for (let p = 0; p < 6; p++) {
                    planes[c * 6 + p] = slice[p];
                }
            }
        }
        return planes;
    }

    /**
     * True when `system`'s world bounds reach into at least one camera's
     * frustum, or when it has no bounds to test (empty, or not yet measured).
     */
    private isSystemInView(system: ParticleSystem, planes: Plane[]): boolean {
        const min = this.boundsMin;
        const max = this.boundsMax;
        if (!system.getWorldBounds(min, max)) {
            return true;
        }
        for (let c = 0; c < planes.length; c += 6) {
            let inside = true;
            for (let p = c; p < c + 6; p++) {
                const plane = planes[p];
                const n = plane.normal;
                // The box corner farthest along the plane's normal: if even it
                // is behind the plane, the whole box is.
                const x = n.x >= 0 ? max.x : min.x;
                const y = n.y >= 0 ? max.y : min.y;
                const z = n.z >= 0 ? max.z : min.z;
                if (n.x * x + n.y * y + n.z * z + plane.d < 0) {
                    inside = false;
                    break;
                }
            }
            if (inside) {
                return true;
            }
        }
        return false;
    }

    private static clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }

    private static equals(a: StoredBatchSettings, b: VFXBatchSettings): boolean {
        return (
            a.materialBlendMode === b.materialBlendMode &&
            a.materialTransparent === b.materialTransparent &&
            a.materialDepthTest === b.materialDepthTest &&
            a.materialDepthWrite === b.materialDepthWrite &&
            a.materialAlphaTest === b.materialAlphaTest &&
            a.texture === b.texture &&
            a.reflectionTexture === b.reflectionTexture &&
            a.reflectionLevel === b.reflectionLevel &&
            reflectionFacesEqual(a.reflectionFaces, b.reflectionFaces) &&
            a.reflectionAtlas === b.reflectionAtlas &&
            a.renderMode === b.renderMode &&
            a.blendTiles === b.blendTiles &&
            a.softParticles === b.softParticles &&
            a.softFarFade === b.softFarFade &&
            a.softNearFade === b.softNearFade &&
            a.uTileCount === b.uTileCount &&
            a.vTileCount === b.vTileCount &&
            a.instancingGeometry === b.instancingGeometry &&
            a.instancingUVs === b.instancingUVs &&
            // The second UV set only matters to a mesh that reads it.
            (a.renderMode !== RenderMode.Mesh || !readsUV1(a) || a.instancingUVs2 === b.instancingUVs2) &&
            a.renderOrder === b.renderOrder &&
            a.layerMask === b.layerMask &&
            a.renderingGroupId === b.renderingGroupId &&
            a.applyFog === b.applyFog &&
            pivotEqual(a.pivot, b.pivot) &&
            a.sortMode === (b.sortMode ?? 'none') &&
            a.minParticleSize === (b.minParticleSize ?? 0) &&
            a.maxParticleSize === (b.maxParticleSize ?? Infinity) &&
            (a.lighting ?? 'fixed') === (b.lighting ?? 'fixed') &&
            meshRimEqual(a.rim, b.rim) &&
            mapUVEqual(a.mapUV, b.mapUV) &&
            uvDistortionEqual(a.uvDistortion, b.uvDistortion) &&
            gradientMapEqual(a.gradientMap, b.gradientMap) &&
            erosionEqual(a.erosion, b.erosion)
        );
    }

    addSystem(system: IParticleSystem) {
        const particleSystem = system as ParticleSystem;
        particleSystem._renderer = this;
        if (!this.systemToBatchIndex.has(system) && this.systems.indexOf(system) === -1) {
            this.systems.push(system);
            this.orderedSystemsStale = true;
        }
        if (this.adaptivePerformanceState.enabled) {
            particleSystem.setQualityFactor(this.adaptivePerformanceState.currentQuality);
        }
        this.assignToBatch(particleSystem);
    }

    /** Places a system into a compatible batch, creating one when none matches. */
    private assignToBatch(particleSystem: ParticleSystem) {
        const system = particleSystem as IParticleSystem;
        const settings = particleSystem.getRendererSettings();
        for (let i = 0; i < this.batches.length; i++) {
            if (BatchedRenderer.equals(this.batches[i].settings, settings)) {
                this.batches[i].addSystem(system);
                this.systemToBatchIndex.set(system, i);
                return;
            }
        }
        let batch: VFXBatch;
        const scene = this.getScene();
        switch (settings.renderMode) {
            case RenderMode.Trail:
                batch = new TrailBatch(settings, scene);
                break;
            case RenderMode.Mesh:
            case RenderMode.BillBoard:
            case RenderMode.VerticalBillBoard:
            case RenderMode.HorizontalBillBoard:
            case RenderMode.StretchedBillBoard:
            case RenderMode.Beam:
                batch = new SpriteBatch(settings, scene);
                break;
            default:
                throw new Error(`Unsupported render mode: ${settings.renderMode}`);
        }
        batch.mesh.parent = this;
        if (this.depthTexture) {
            batch.applyDepthTexture(this.depthTexture);
        }
        batch.applyMeshLighting(this.meshLighting);
        batch.addSystem(system);
        this.batches.push(batch);
        this.batchEmptyFrames.push(0);
        this.systemToBatchIndex.set(system, this.batches.length - 1);
    }

    deleteSystem(system: IParticleSystem) {
        const removed = this.removeFromBatch(system);
        const index = this.systems.indexOf(system);
        if (index !== -1) {
            this.systems.splice(index, 1);
            this.orderedSystemsStale = true;
        }
        // Also out of the ordered copy, which update() may be iterating right
        // now: a system that disposes itself from inside its own update leaves
        // the loop expecting the slot it vacated to hold the next one.
        const ordered = this.orderedSystems.indexOf(system);
        if (ordered !== -1) {
            this.orderedSystems.splice(ordered, 1);
        }
        return removed;
    }

    /** Detaches a system from its batch, leaving the renderer's system list alone. */
    private removeFromBatch(system: IParticleSystem): boolean {
        const batchIndex = this.systemToBatchIndex.get(system);
        if (batchIndex === undefined) {
            return false;
        }
        this.batches[batchIndex].removeSystem(system);
        this.systemToBatchIndex.delete(system);
        return true;
    }

    /**
     * Re-buckets a system whose render settings changed. The system keeps its
     * place in the update order, so this is safe to call mid-frame.
     */
    updateSystem(system: IParticleSystem) {
        this.removeFromBatch(system);
        this.addSystem(system);
    }

    setDepthTexture(depthTexture: BaseTexture | null) {
        this.depthTexture = depthTexture;
        for (const batch of this.batches) {
            batch.applyDepthTexture(depthTexture);
        }
    }

    /**
     * Sets the light mesh particles with `lighting: 'fixed'` (the default) are
     * lit by, for every mesh batch of this renderer, including ones created
     * later. Fields left out keep their current value. Also the fallback for
     * `'scene'` lighting when the scene has no directional or hemispheric light.
     *
     * @example
     * ```ts
     * renderer.setMeshLighting({direction: new Vector3(-0.3, -1, 0.2), color: new Color3(1, 0.9, 0.75)});
     * ```
     */
    setMeshLighting(lighting: Partial<MeshLightingSettings>): void {
        const current = this.meshLighting;
        if (lighting.direction) {
            current.direction = lighting.direction.clone();
        }
        if (lighting.color) {
            current.color = lighting.color.clone();
        }
        if (lighting.ambient) {
            current.ambient = lighting.ambient.clone();
        }
        for (const batch of this.batches) {
            batch.applyMeshLighting(current);
        }
    }

    /** A copy of the light set with {@link setMeshLighting}. */
    getMeshLighting(): MeshLightingSettings {
        const current = this.meshLighting;
        return {
            direction: current.direction.clone(),
            color: current.color.clone(),
            ambient: current.ambient.clone(),
        };
    }

    configureAdaptivePerformance(options: Partial<AdaptivePerformanceOptions> = {}) {
        const state = this.adaptivePerformanceState;
        const minQuality = BatchedRenderer.clamp(options.minQuality ?? state.minQuality, 0.05, 1);
        const maxQuality = BatchedRenderer.clamp(options.maxQuality ?? state.maxQuality, minQuality, 1);
        state.targetFrameMs = Math.max(options.targetFrameMs ?? state.targetFrameMs, 0.1);
        state.minQuality = minQuality;
        state.maxQuality = maxQuality;
        state.decreaseStep = Math.max(options.decreaseStep ?? state.decreaseStep, 0.001);
        state.increaseStep = Math.max(options.increaseStep ?? state.increaseStep, 0.001);
        state.currentQuality = BatchedRenderer.clamp(state.currentQuality, state.minQuality, state.maxQuality);
        state.enabled = true;
        this.lastAppliedQuality = Number.NaN;
    }

    disableAdaptivePerformance(resetQuality = true) {
        this.adaptivePerformanceState.enabled = false;
        if (resetQuality) {
            this.adaptivePerformanceState.currentQuality = this.adaptivePerformanceState.maxQuality;
            this.applyAdaptiveQuality();
        }
    }

    getAdaptivePerformanceState(): AdaptivePerformanceState {
        return {...this.adaptivePerformanceState};
    }

    private applyAdaptiveQuality() {
        const quality = this.adaptivePerformanceState.currentQuality;
        if (quality === this.lastAppliedQuality) {
            return;
        }
        for (let i = 0; i < this.systems.length; i++) {
            (this.systems[i] as ParticleSystem).setQualityFactor(quality);
        }
        this.lastAppliedQuality = quality;
    }

    /** @internal Called when a system's behaviors change, which can add a sub emitter. */
    _invalidateUpdateOrder(): void {
        this.orderedSystemsStale = true;
    }

    /**
     * Orders the systems so a system emitting into another runs first.
     *
     * Depth first over "emits into" edges, recording each system once all the
     * systems it feeds have been recorded, then reversed — a system therefore
     * lands ahead of everything it emits into, however deep the chain. A cycle
     * cannot be satisfied by any order; it is left as found rather than dropped.
     */
    private orderSystems(): Array<IParticleSystem> {
        if (!this.orderedSystemsStale) {
            return this.orderedSystems;
        }
        const ordered: Array<IParticleSystem> = [];
        const visiting = new Set<IParticleSystem>();
        const done = new Set<IParticleSystem>();
        const known = new Set<IParticleSystem>(this.systems);

        const subTargetsOf = (system: IParticleSystem): Array<IParticleSystem> => {
            const targets: Array<IParticleSystem> = [];
            for (const behavior of (system as ParticleSystem).behaviors ?? []) {
                if (behavior.type !== 'EmitSubParticleSystem') {
                    continue;
                }
                const target = (behavior as EmitSubParticleSystem).subParticleSystem?.system;
                if (target !== undefined && known.has(target)) {
                    targets.push(target);
                }
            }
            return targets;
        };

        const visit = (system: IParticleSystem): void => {
            if (done.has(system) || visiting.has(system)) {
                return;
            }
            visiting.add(system);
            for (const target of subTargetsOf(system)) {
                visit(target);
            }
            visiting.delete(system);
            done.add(system);
            ordered.push(system);
        };

        for (const system of this.systems) {
            visit(system);
        }
        ordered.reverse();
        this.orderedSystems = ordered;
        this.orderedSystemsStale = false;
        return ordered;
    }

    update(delta: number) {
        this.elapsed += delta;
        const adaptiveState = this.adaptivePerformanceState;
        const frameStart = adaptiveState.enabled ? performance.now() : 0;
        if (adaptiveState.enabled) {
            this.applyAdaptiveQuality();
        }
        const systems = this.orderSystems();
        const planes = this.cullingEnabled ? this.collectFrustumPlanes() : null;
        const budgetStart =
            this.simulationBudgetMs !== Infinity || this.catchUpBudgetMs !== Infinity ? performance.now() : 0;
        const stepDeadline = this.simulationBudgetMs === Infinity ? Infinity : budgetStart + this.simulationBudgetMs;
        const catchUpDeadline = this.catchUpBudgetMs === Infinity ? Infinity : budgetStart + this.catchUpBudgetMs;
        for (let i = 0; i < systems.length; i++) {
            const system = systems[i] as ParticleSystem;
            // A disabled emitter holds its particles frozen instead of simulating
            // them unseen, matching how Unity treats a disabled ParticleSystem.
            // Pooled effects parked with setEnabled(false) then cost nothing.
            if (system.emitter.visible) {
                // A system no camera sees pauses, by its own choice. One that
                // only serves as a sub emitter target follows its parent.
                system.culled =
                    planes !== null &&
                    planes.length > 0 &&
                    system.cullingMode !== 'always' &&
                    system.onlyUsedByOther !== true &&
                    !this.isSystemInView(system, planes);
                system.update(delta, stepDeadline, catchUpDeadline);
            }
            // An autoDestroy system disposes itself from inside update and drops
            // out of the list; stay on the slot it vacated.
            if (systems[i] !== system) {
                i--;
            }
        }
        this.refreshBatches();
        if (!adaptiveState.enabled) {
            return;
        }

        adaptiveState.lastFrameCpuMs = performance.now() - frameStart;
        if (adaptiveState.lastFrameCpuMs > adaptiveState.targetFrameMs) {
            adaptiveState.currentQuality = BatchedRenderer.clamp(
                adaptiveState.currentQuality - adaptiveState.decreaseStep,
                adaptiveState.minQuality,
                adaptiveState.maxQuality
            );
        } else {
            adaptiveState.currentQuality = BatchedRenderer.clamp(
                adaptiveState.currentQuality + adaptiveState.increaseStep,
                adaptiveState.minQuality,
                adaptiveState.maxQuality
            );
        }
    }

    /** Rebuild instance buffers from current particle state without advancing simulation. */
    refreshBatches(): void {
        const emptyFrames = this.batchEmptyFrames;
        for (let i = 0; i < this.batches.length; i++) {
            const batch = this.batches[i];
            batch.time = this.elapsed;
            if (batch.systems.size > 0) {
                emptyFrames[i] = 0;
                batch.update();
                continue;
            }
            const framesEmpty = (emptyFrames[i] ?? 0) + 1;
            emptyFrames[i] = framesEmpty;
            if (framesEmpty === 1) {
                // One last update clears the instance data left on screen.
                batch.update();
            } else if (framesEmpty > BatchedRenderer.EMPTY_BATCH_GRACE_FRAMES) {
                // Nothing has used these settings for a while: give the mesh,
                // material and GPU buffers back instead of re-uploading empty
                // instance data forever.
                this.removeBatch(i);
                i--;
            }
        }
    }

    /** Disposes the batch at `index` and repairs the system→batch mapping. */
    private removeBatch(index: number): void {
        this.batches[index].dispose();
        this.batches.splice(index, 1);
        this.batchEmptyFrames.splice(index, 1);
        for (const [system, batchIndex] of this.systemToBatchIndex) {
            if (batchIndex > index) {
                this.systemToBatchIndex.set(system, batchIndex - 1);
            }
        }
    }

    /** Per-batch particle vs GPU instance counts — for diagnosing stale render state. */
    getBatchRenderStats(): Array<{
        batchIndex: number;
        renderMode: RenderMode;
        instanceCount: number;
        particleCount: number;
        systemNames: string[];
    }> {
        return this.batches.map((batch, batchIndex) => {
            let particleCount = 0;
            const systemNames: string[] = [];
            for (const system of batch.systems) {
                const ps = system as ParticleSystem;
                particleCount += ps.particleNum;
                systemNames.push(ps.emitter.name);
            }
            return {
                batchIndex,
                renderMode: batch.settings.renderMode,
                instanceCount: batch.mesh.forcedInstanceCount ?? 0,
                particleCount,
                systemNames,
            };
        });
    }

    dispose(): void {
        for (const batch of this.batches) {
            batch.dispose();
        }
        this.batches = [];
        this.batchEmptyFrames.length = 0;
        this.systems.length = 0;
        this.systemToBatchIndex.clear();
        super.dispose();
    }
}
