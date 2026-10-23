import {Camera} from '@babylonjs/core/Cameras/camera';
import {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Frustum} from '@babylonjs/core/Maths/math.frustum';
import {Plane} from '@babylonjs/core/Maths/math.plane';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {DepthRenderer} from '@babylonjs/core/Rendering/depthRenderer';
import {Scene} from '@babylonjs/core/scene';
import {EmitSubParticleSystem, IParticleSystem, Vector3} from 'quarks.core';
import {batchSettingsEqual, shaderKeyEqual, storedBatchSettings} from './batchKey';
import {ParticleSystem} from './ParticleSystem';
import {depthBinding, DepthBinding, DepthTextureOptions, SoftDepthEncoding} from './softDepth';
import {SpriteBatch} from './SpriteBatch';
import {TrailBatch} from './TrailBatch';
import {
    defaultMeshLighting,
    MeshLighting,
    MeshLightingSettings,
    MeshRim,
    ParticleErosion,
    ParticleGradientMap,
    ParticleUVDistortion,
    RenderFace,
    RenderMode,
    SortMode,
    TextureUV,
    VFXBatch,
} from './VFXBatch';

/**
 * Everything about a system that decides how it is drawn: {@link ParticleSystem.getRendererSettings}
 * returns it, and the renderer draws systems whose settings match from one batch. Only the
 * settings a render mode reads count: two billboards that differ in a mesh-only setting, such as
 * `rim`, share a batch.
 *
 * A batch is one draw with one material, so its settings fall into two groups, as a Unity
 * material's keywords and texture slots against its MaterialPropertyBlock values, or an Unreal
 * material against a dynamic material instance's parameters. The shader key (render mode,
 * geometry, textures, blend and depth state, and which effects are on) decides the material.
 * The live parameters (the fade distances, alpha cutoff, pivot, size limits, reflection level,
 * rim colour, each effect's numbers, and each texture's tiling, offset and scroll) are uniforms:
 * changing one on a system that is alone in its batch writes the material in place, with no new
 * batch or material. A texture's UV channel is part of the shader key, so changing it rebuilds.
 *
 * Prefer the system's own setters, which also move it to a matching batch; after changing a
 * field directly, set {@link ParticleSystem.neededToUpdateRender}.
 */
export interface VFXBatchSettings {
    /** Mesh particles' vertex positions, see {@link ParticleSystem.instancingGeometry}. A quad for other modes. */
    instancingGeometry: Float32Array;
    /** Triangle indices into {@link instancingGeometry}. */
    instancingIndices: Uint32Array | Uint16Array;
    /** The mesh's first UV set, two values per vertex. */
    instancingUVs?: Float32Array;
    /** The mesh's second UV set, see {@link UVChannel}. */
    instancingUVs2?: Float32Array;
    /** The mesh's vertex normals; mesh particles fall back to +Z. */
    instancingNormals?: Float32Array;
    /** See {@link ParticleSystem.renderMode}. */
    renderMode: RenderMode;
    /** See {@link ParticleSystem.renderOrder}. */
    renderOrder: number;
    /** See {@link ParticleSystem.uTileCount}. */
    uTileCount: number;
    /** See {@link ParticleSystem.vTileCount}. */
    vTileCount: number;
    /** See {@link ParticleSystem.blendTiles}; read with a sheet, and not by trails. */
    blendTiles: boolean;
    /** See {@link ParticleSystem.softParticles}. */
    softParticles: boolean;
    /** See {@link ParticleSystem.softNearFade}. */
    softNearFade: number;
    /** See {@link ParticleSystem.softFarFade}. */
    softFarFade: number;
    /** Babylon alpha mode, see {@link ParticleSystem.blending}. */
    materialBlendMode: number;
    /** Whether the batch draws in the transparent pass. */
    materialTransparent: boolean;
    /** Whether particles are hidden behind nearer geometry. */
    materialDepthTest: boolean;
    /** Whether particles write depth. */
    materialDepthWrite: boolean;
    /** Alpha below which a fragment is discarded; 0 discards nothing. */
    materialAlphaTest: number;
    /** See {@link ParticleSystem.texture}. */
    texture: Texture | null;
    /**
     * The reflection a mesh particle's material carries (a Babylon material's `reflectionTexture`
     * or `environmentTexture`). It is not sampled itself: a cube texture is unfolded into
     * {@link reflectionAtlas} once it has loaded and sampled from there; anything else is kept
     * only to tell materials apart. Other render modes ignore it.
     */
    reflectionTexture: BaseTexture | null;
    /** Multiplier for the reflection sample — mirrors `texture.level`. */
    reflectionLevel: number;
    /**
     * A 3×2 atlas of cube faces (+X +Y +Z over -X -Y -Z) that mesh particles reflect, through one
     * `sampler2D`: the path that stays valid on iOS WebKit ShaderMaterial draws, where a
     * `samplerCube` or six face samplers raise GL_INVALID_OPERATION. Built from
     * {@link reflectionTexture} when that is a cube texture. Other render modes ignore it.
     */
    reflectionAtlas: BaseTexture | null;
    /** Camera layer mask of the batch mesh, see {@link ParticleSystem.layers}. */
    layerMask: number;
    /**
     * Babylon rendering group (`mesh.renderingGroupId`) the batch draws in,
     * 0 by default. Systems with different groups are batched apart.
     */
    renderingGroupId: number;
    /**
     * Whether the scene's fog applies to the particles, as it does to any other
     * mesh; true by default. Particles that lay over the frame (`ALPHA_COMBINE`,
     * `ALPHA_PREMULTIPLIED`, opaque ones) mix toward the fog colour; particles
     * that add to it or subtract from it (`ALPHA_ADD`, `ALPHA_ONEONE`,
     * `ALPHA_SCREENMODE`, `ALPHA_SUBTRACT`, …) fade toward black, since the fog
     * colour would fog the whole screen; particles that multiply it
     * (`ALPHA_MULTIPLY`) fade toward white. See {@link blendCategory}. Systems
     * that differ are batched apart.
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
     * Which faces a mesh particle draws, see {@link RenderFace}. Unset is `'both'`. Mesh systems
     * that differ are batched apart; other render modes ignore it.
     */
    renderFace?: RenderFace;
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

/**
 * How {@link BatchedRenderer.configureAdaptivePerformance} trades particles for frame time: each
 * update that runs over `targetFrameMs` lowers every system's quality factor (see
 * {@link ParticleSystem.setQualityFactor}) by `decreaseStep`, each one under it raises the factor
 * by `increaseStep`, within `minQuality` and `maxQuality`.
 */
export interface AdaptivePerformanceOptions {
    /** CPU time in milliseconds the renderer's update may take before quality drops. Default 16.7. */
    targetFrameMs: number;
    /** Lowest quality factor, 0.1 to 1 ({@link ParticleSystem.setQualityFactor} clamps lower values). Default 0.35. */
    minQuality: number;
    /** Highest quality factor, `minQuality` to 1. Default 1. */
    maxQuality: number;
    /** Quality lost per update over budget. Default 0.08. */
    decreaseStep: number;
    /** Quality regained per update within budget. Default 0.02. */
    increaseStep: number;
}

/** A snapshot of the renderer's adaptive performance, from {@link BatchedRenderer.getAdaptivePerformanceState}. */
export interface AdaptivePerformanceState extends AdaptivePerformanceOptions {
    /** Whether adaptive performance is on. */
    enabled: boolean;
    /** The quality factor the systems run at now. */
    currentQuality: number;
    /** CPU time the last measured update took, in milliseconds; kept from the last update while off. */
    lastFrameCpuMs: number;
}

/**
 * Draws particle systems, batching the ones that draw alike into one instanced mesh each, and
 * advances them every frame. It is a node in the scene; make one per scene, add each system with
 * {@link addSystem}, and call {@link update} once per frame:
 *
 * ```ts
 * const renderer = new BatchedRenderer('particles', scene);
 * renderer.addSystem(system);
 * scene.onBeforeRenderObservable.add(() => renderer.update(scene.getEngine().getDeltaTime() / 1000));
 * ```
 *
 * Systems step on a fixed 60 Hz clock, so an effect plays out the same at any frame rate.
 *
 * The renderer is a node so the batches have a parent to live under: disabling it hides them,
 * disposing it disposes them. Its transform moves nothing: particles are placed in the world by
 * their emitters, and the batch meshes draw them there whatever the renderer's position, rotation
 * or scale. A system belongs to one renderer at a time: adding it to another takes it out of the
 * first.
 */
export class BatchedRenderer extends TransformNode {
    private readonly batchList: Array<VFXBatch> = [];
    private readonly batchIndexOf = new Map<IParticleSystem, number>();

    /** The batches, one draw each, to inspect what is drawn; the renderer makes and frees them. */
    get batches(): ReadonlyArray<VFXBatch> {
        return this.batchList;
    }

    /** Index into {@link batches} of each system's batch, to inspect; the renderer keeps it. */
    get systemToBatchIndex(): ReadonlyMap<IParticleSystem, number> {
        return this.batchIndexOf;
    }
    /** Seconds this renderer has been updated for; the clock UV and erosion scrolling run on. */
    private elapsed = 0;
    private depth: DepthBinding | null = null;
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

    /** Frustum planes of each active camera, six per camera, reused across updates. */
    private readonly cameraPlanes: Plane[][] = [];
    /** Each active camera's `layerMask`, parallel to {@link cameraPlanes}. */
    private readonly cameraMasks: number[] = [];
    /** How many cameras {@link cameraPlanes} holds this update. */
    private cameraCount = 0;
    private readonly boundsMin = new Vector3();
    private readonly boundsMax = new Vector3();

    constructor(name: string, scene: Scene) {
        super(name, scene);
    }

    /**
     * Gathers the frustum planes and layer masks of the cameras the scene renders with, and returns
     * how many. 0 when there is no camera yet; systems are then never culled. Allocates only when a
     * camera is added.
     */
    private collectCameras(): number {
        const scene = this.getScene();
        const activeCameras = scene.activeCameras;
        const activeCamera = scene.activeCamera;
        const cameras: readonly Camera[] =
            activeCameras && activeCameras.length > 0 ? activeCameras : activeCamera ? [activeCamera] : [];
        for (let c = 0; c < cameras.length; c++) {
            const camera = cameras[c];
            // Both matrices are recomputed only on demand: a camera moved since
            // the last render would otherwise be tested where it was, and one
            // that has not rendered yet has no projection at all.
            camera.getViewMatrix();
            camera.getProjectionMatrix();
            const planes = (this.cameraPlanes[c] ??= [0, 1, 2, 3, 4, 5].map(() => new Plane(0, 0, 0, 0)));
            Frustum.GetPlanesToRef(camera.getTransformationMatrix(), planes);
            this.cameraMasks[c] = camera.layerMask;
        }
        this.cameraCount = cameras.length;
        return cameras.length;
    }

    /**
     * True when `system`'s world bounds reach into the frustum of at least one camera whose
     * `layerMask` shares a bit with the system's (a camera that does not render the system's layer
     * does not see it), or when it has no bounds to test (empty, or not yet measured).
     */
    private isSystemInView(system: ParticleSystem): boolean {
        const min = this.boundsMin;
        const max = this.boundsMax;
        if (!system.getWorldBounds(min, max)) {
            return true;
        }
        const layerMask = system.layers.mask;
        for (let c = 0; c < this.cameraCount; c++) {
            if ((this.cameraMasks[c] & layerMask) === 0) {
                continue;
            }
            const planes = this.cameraPlanes[c];
            let inside = true;
            for (let p = 0; p < 6; p++) {
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

    /**
     * Starts drawing and updating `system`, in the batch whose settings match its own (a new one if
     * none does). Add each system of an effect, or use `QuarksUtil.addToBatchRenderer` on its root.
     */
    addSystem(system: IParticleSystem): void {
        if (this.isDisposed()) {
            throw new Error('BatchedRenderer.addSystem: the renderer has been disposed');
        }
        const particleSystem = system as ParticleSystem;
        if (particleSystem.emitter.getScene() !== this.getScene()) {
            // Its batch would hold meshes and materials of two scenes.
            throw new Error('BatchedRenderer.addSystem: the system belongs to another scene');
        }
        const previous = particleSystem._renderer;
        if (previous !== undefined && previous !== this) {
            // One renderer at a time, or two would step and draw it.
            previous.deleteSystem(system);
        }
        particleSystem._renderer = this;
        // Added again after its settings changed: out of the old batch first, so it lands in the
        // one that matches now rather than in both.
        this.removeFromBatch(system);
        if (this.systems.indexOf(system) === -1) {
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
        const stored = storedBatchSettings(settings);
        for (let i = 0; i < this.batchList.length; i++) {
            if (batchSettingsEqual(this.batchList[i].settings, stored)) {
                this.batchList[i].addSystem(system);
                this.batchIndexOf.set(system, i);
                return;
            }
        }
        let batch: VFXBatch;
        const scene = this.getScene();
        switch (settings.renderMode) {
            case RenderMode.Trail:
                batch = new TrailBatch(settings, scene, this.depth);
                break;
            case RenderMode.Mesh:
            case RenderMode.BillBoard:
            case RenderMode.VerticalBillBoard:
            case RenderMode.HorizontalBillBoard:
            case RenderMode.StretchedBillBoard:
            case RenderMode.Beam:
                batch = new SpriteBatch(settings, scene, this.depth);
                break;
            default:
                throw new Error(`Unsupported render mode: ${settings.renderMode}`);
        }
        batch.attachTo(this);
        batch.applyMeshLighting(this.meshLighting);
        batch.addSystem(system);
        this.batchList.push(batch);
        this.batchEmptyFrames.push(0);
        this.batchIndexOf.set(system, this.batchList.length - 1);
    }

    /**
     * Stops drawing and updating `system`; disposing the system calls it. Its particles are left as they are.
     * @returns Whether the system was in one of this renderer's batches.
     */
    deleteSystem(system: IParticleSystem): boolean {
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
        const batchIndex = this.batchIndexOf.get(system);
        if (batchIndex === undefined) {
            return false;
        }
        this.batchList[batchIndex].removeSystem(system);
        this.batchIndexOf.delete(system);
        return true;
    }

    /**
     * Takes a system's changed render settings. When only live parameters changed (see
     * {@link VFXBatchSettings}) and the system is alone in its batch, the batch's material is
     * written in place. Otherwise the system moves to the batch its settings now match. The
     * system keeps its place in the update order, so this is safe to call mid-frame.
     */
    updateSystem(system: IParticleSystem) {
        const batchIndex = this.batchIndexOf.get(system);
        if (batchIndex !== undefined) {
            const batch = this.batchList[batchIndex];
            const settings = storedBatchSettings((system as ParticleSystem).getRendererSettings());
            if (
                batch.systems.size === 1 &&
                shaderKeyEqual(batch.settings, settings) &&
                // A batch that already draws with these values takes the system instead, so two
                // batches never hold the same settings.
                !this.batchList.some((other) => other !== batch && batchSettingsEqual(other.settings, settings))
            ) {
                batch.applyLiveSettings(settings);
                return;
            }
        }
        this.removeFromBatch(system);
        this.addSystem(system);
    }

    /**
     * Sets the scene depth that soft particles fade against. Without one, soft particles are not
     * compiled in and draw hard, as Unity does for a camera with no depth texture.
     *
     * Pass the `DepthRenderer` itself to have its encoding read off it, for example
     * `renderer.setDepthTexture(scene.enableDepthRenderer(camera))`. A bare texture is read as
     * Babylon's default `'linear'` metric unless `options.encoding` says otherwise; see
     * {@link SoftDepthEncoding}. The depth should be drawn by the camera that draws the particles.
     * The texture is held, not the renderer: set it again if the `DepthRenderer` is disposed or
     * replaced.
     *
     * @param depth - A depth texture, a Babylon `DepthRenderer`, or null to turn soft particles off.
     * @param options - What the texture stores, when it cannot be read off a `DepthRenderer`.
     */
    setDepthTexture(depth: BaseTexture | DepthRenderer | null, options: DepthTextureOptions = {}) {
        this.depth = depth ? depthBinding(depth, options) : null;
        for (const batch of this.batchList) {
            batch.applyDepthTexture(this.depth);
        }
    }

    /** The depth texture soft particles fade against, see {@link setDepthTexture}. */
    get depthTexture(): BaseTexture | null {
        return this.depth?.texture ?? null;
    }

    set depthTexture(texture: BaseTexture | null) {
        this.setDepthTexture(texture);
    }

    /** What the depth texture stores, see {@link setDepthTexture}. */
    get depthEncoding(): SoftDepthEncoding | null {
        return this.depth?.encoding ?? null;
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
        for (const batch of this.batchList) {
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

    /**
     * Turns on adaptive performance: the renderer measures its own update and thins every system's
     * emission while it runs over budget, see {@link AdaptivePerformanceOptions}. Options left out
     * keep their current values.
     */
    configureAdaptivePerformance(options: Partial<AdaptivePerformanceOptions> = {}): void {
        const state = this.adaptivePerformanceState;
        const minQuality = BatchedRenderer.clamp(options.minQuality ?? state.minQuality, 0.1, 1);
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

    /** Turns adaptive performance off, and by default puts every system back at `maxQuality`. */
    disableAdaptivePerformance(resetQuality = true): void {
        this.adaptivePerformanceState.enabled = false;
        if (resetQuality) {
            this.adaptivePerformanceState.currentQuality = this.adaptivePerformanceState.maxQuality;
            this.applyAdaptiveQuality();
        }
    }

    /** A copy of the adaptive performance settings and the current quality. */
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
                // A uuid string is a link the loader could not resolve: no target.
                const sub = (behavior as EmitSubParticleSystem).subParticleSystem;
                const target = typeof sub === 'object' ? sub.system : undefined;
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

    /**
     * Advances every visible system by `delta` seconds and refills the batches. Call it once per
     * frame. A system whose emitter is disabled is frozen; one no camera sees pauses if its
     * {@link ParticleSystem.cullingMode} says so.
     */
    update(delta: number): void {
        this.elapsed += delta;
        const adaptiveState = this.adaptivePerformanceState;
        const frameStart = adaptiveState.enabled ? performance.now() : 0;
        if (adaptiveState.enabled) {
            this.applyAdaptiveQuality();
        }
        const systems = this.orderSystems();
        const cameraCount = this.cullingEnabled ? this.collectCameras() : 0;
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
                    cameraCount > 0 &&
                    system.cullingMode !== 'always' &&
                    system.onlyUsedByOther !== true &&
                    !this.isSystemInView(system);
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
        for (let i = 0; i < this.batchList.length; i++) {
            const batch = this.batchList[i];
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
        this.batchList[index].dispose();
        this.batchList.splice(index, 1);
        this.batchEmptyFrames.splice(index, 1);
        for (const [system, batchIndex] of this.batchIndexOf) {
            if (batchIndex > index) {
                this.batchIndexOf.set(system, batchIndex - 1);
            }
        }
    }

    /** Per-batch particle vs GPU instance counts — for diagnosing stale render state. */
    getBatchRenderStats(): Array<{
        /** Index into {@link batches}. */
        batchIndex: number;
        /** The batch's render mode. */
        renderMode: RenderMode;
        /** Instances the batch mesh draws. */
        instanceCount: number;
        /** Live particles of the batch's systems. */
        particleCount: number;
        /** The emitter names of the batch's systems. */
        systemNames: string[];
    }> {
        return this.batchList.map((batch, batchIndex) => {
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

    /**
     * Disposes the batches and their meshes and materials, and lets the systems go: they keep
     * their particles and can be added to another renderer. The renderer cannot be used again.
     */
    dispose(): void {
        for (const batch of this.batchList) {
            batch.dispose();
        }
        this.batchList.length = 0;
        this.batchEmptyFrames.length = 0;
        for (const system of this.systems) {
            if ((system as ParticleSystem)._renderer === this) {
                (system as ParticleSystem)._renderer = undefined;
            }
        }
        this.systems.length = 0;
        this.orderedSystems = [];
        this.orderedSystemsStale = true;
        this.batchIndexOf.clear();
        super.dispose();
    }
}
