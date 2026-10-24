import {Constants} from '@babylonjs/core/Engines/constants';
import {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Scene} from '@babylonjs/core/scene';
import type {Color4Like, Vector2Like, Vector3Like} from 'quarks.core';
import {
    AxisAngleGenerator,
    Behavior,
    BehaviorFromJSON,
    ColorGenerator,
    ConstantColor,
    ConstantValue,
    createSeededRandom,
    EmissionState,
    EmitSubParticleSystem,
    EmitterShape,
    FunctionColorGenerator,
    FunctionValueGenerator,
    IParticleSystem,
    Matrix4,
    Particle,
    ParticleStore,
    ParticleSystemEvent,
    ParticleSystemEventType,
    Quaternion,
    RandomSource,
    readFormatPart,
    RendererEmitterSettings,
    RotationGenerator,
    setRandomSource,
    SphereEmitter,
    StretchedBillBoardSettings,
    TrailParticle,
    TrailSettings,
    ValueGenerator,
    Vector3,
    Vector3Generator,
    Vector4,
} from 'quarks.core';
import {BatchedRenderer, VFXBatchSettings} from './BatchedRenderer';
import {ensureEnvAtlasFromCube, getCachedEnvAtlas} from './envAtlas';
import {ensureTriangleIndices} from './geometryUtil';
import {disposeEmitterForSystem, ParticleEmitter} from './ParticleEmitter';
import {BehaviorPlan} from './system/BehaviorPlan';
import {BoundsTracker} from './system/BoundsTracker';
import {burstInterval, burstWaveCount, EmissionController} from './system/EmissionController';
import {EventDispatcher} from './system/EventDispatcher';
import {
    DEFAULT_INDICES,
    DEFAULT_POSITIONS,
    DEFAULT_UVS,
    fallbackNormalsForPositions,
    fallbackUVsForPositions,
    isFallbackNormals,
    isFallbackUVs,
} from './system/geometry';
import {
    collapseTrailNewborns,
    integrateSprites,
    moveTrails,
    recordTrailHistory,
    removeDeadTrails,
    RingBufferStep,
    runBehaviorSteps,
    snapshotPreviousState,
} from './system/integrate';
import {liveAtlas, MaterialOverrides, ParticleMaterialSource, resolveMaterialSettings} from './system/materialResolve';
import {
    DEFAULT_SOFT_FAR_FADE,
    nonZeroFlip,
    nonZeroPivot,
    normalizeBurst,
    normalizeBursts,
    validAlphaTest,
    validCullingMode,
    validLighting,
    validLoopRange,
    validMaxParticles,
    validRenderFace,
    validRingBufferMode,
    validScalingMode,
    validSoftFade,
    validSortMode,
    validStopAction,
    validTileCount,
} from './system/normalize';
import {ParticleSpawner} from './system/ParticleSpawner';
import {
    particleSystemParametersFromJSON,
    particleSystemToJSON,
    trailCurve,
    trailFlags,
    trailSampling,
} from './system/serialization';
import {settingsForClone} from './system/settingsSchema';
import {SIMULATION_STEP, SimulationClock} from './system/SimulationClock';
import {
    MeshLighting,
    MeshRim,
    normalizeErosion,
    normalizeGradientMap,
    normalizeMapUV,
    normalizeMeshRim,
    normalizeUVDistortion,
    ParticleErosion,
    ParticleErosionOptions,
    ParticleGradientMap,
    ParticleUVDistortion,
    ParticleUVDistortionOptions,
    RenderFace,
    RenderMode,
    SortMode,
    TextureUV,
} from './VFXBatch';

import type {
    BabylonMetaData,
    BeamEnd,
    BurstParameters,
    CullingMode,
    ParticleSystemJSONParameters,
    ParticleSystemParameters,
    RingBufferMode,
    ScalingMode,
    StopAction,
} from './system/types';

export type {
    BabylonMetaData,
    BeamEnd,
    BurstParameters,
    BurstParametersJSON,
    CullingMode,
    ParticleSystemJSONParameters,
    ParticleSystemParameters,
    RingBufferMode,
    ScalingMode,
    StopAction,
} from './system/types';

// Scratch for the per-step emitter matrix of a frame that interpolates, see `update`.
const fromPosition = new Vector3();
const fromRotation = new Quaternion();
const fromScale = new Vector3();
const toPosition = new Vector3();
const toRotation = new Quaternion();
const toScale = new Vector3();
const stepPosition = new Vector3();
const stepRotation = new Quaternion();
const stepScale = new Vector3();

/**
 * A particle system, the counterpart of a Unity Shuriken system or a Niagara emitter: it spawns
 * particles from an {@link emitterShape}, gives them start values, runs its {@link behaviors} on
 * them every step and hands them to a {@link BatchedRenderer} to draw.
 *
 * The system lives at its {@link emitter}, a Babylon node: move, parent or disable that to place
 * the effect. Add the system to a renderer with `renderer.addSystem(system)`; the renderer
 * advances it every frame on a fixed 60 Hz step and batches it with systems that draw alike.
 *
 * Curves and random values are quarks.core generators (`ConstantValue`, `IntervalValue`,
 * `PiecewiseBezier`, `Gradient`, ...); a curve's x is the system's time over its duration for
 * start values and emission, and the particle's age over its life inside behaviors.
 */
export class ParticleSystem implements IParticleSystem {
    /**
     * What the system does once it has finished (Unity's Stop Action): nothing, disable its
     * emitter, or dispose it; see {@link StopAction}. `'none'` by default.
     *
     * As in Unity, the action waits for the system's sub emitters: it runs once the system has
     * finished and none of the systems it emits into, nor theirs, has a particle left (see
     * {@link isAlive}), so disabling or disposing a parent does not cut its sub emitters'
     * particles short. A sub emitter target ({@link onlyUsedByOther}) takes no stop action of its
     * own: it is empty between its parent's bursts, and its parent decides when the effect is done.
     */
    stopAction: StopAction;

    /**
     * Skips the {@link stopAction} while true, so a tool can play an effect over and over (an
     * editor's preview, a gallery, a pool of reused copies) and still save the stop action it
     * was authored with, as Unity applies stop actions only in Play mode. The `finished` event
     * fires either way. False by default; never saved, cloned or loaded.
     */
    ignoreStopAction = false;

    /**
     * Start a looping system as if it had already run one full cycle (Unity's Prewarm), so a fire
     * or a mist is full from its first frame. Default false.
     */
    prewarm: boolean;

    /**
     * How much of the cycle {@link prewarm} simulates before the first frame, in seconds
     * (Niagara's Warmup Time), on a looping system like `prewarm` itself. 0, the default, warms up a whole cycle, as Unity's Prewarm does; a
     * shorter time warms up the cycle's last part only, with the bursts before it counted as
     * fired, which is enough for an effect whose particles live shorter than its cycle and keeps
     * a long cycle's first frame cheap. Longer than the cycle or than
     * {@link maxPrewarmSeconds}, it is cut to them. Kept at 0 or above.
     */
    get prewarmTime(): number {
        return this.prewarmTimeValue;
    }

    set prewarmTime(seconds: number) {
        this.prewarmTimeValue = seconds > 0 ? seconds : 0;
    }

    private prewarmTimeValue = 0;
    /** Start the cycle again when {@link duration} ends instead of stopping emission. Default true. */
    looping: boolean;
    /**
     * Length of one emission cycle in seconds; curves over the system's time run over it. Default
     * 1, and never shorter than one simulation step: a zero, negative or NaN duration is read as
     * one step, so bursts at time 0 fire and the cycle ends.
     */
    get duration(): number {
        return this.durationValue;
    }

    set duration(seconds: number) {
        this.durationValue = seconds > SIMULATION_STEP ? seconds : SIMULATION_STEP;
    }

    private durationValue = 1;
    /** Seconds before the system first emits, rolled on each restart. Default 0. */
    startDelay: ValueGenerator | FunctionValueGenerator;
    /** Seconds each particle lives, rolled at birth. Default 5. */
    startLife: ValueGenerator | FunctionValueGenerator;
    /** Speed each particle starts with along the direction its shape gives it, in units per second. Default 0. */
    startSpeed: ValueGenerator | FunctionValueGenerator;
    /**
     * Rotation each particle starts with: an angle in radians around the view axis for billboards,
     * or a rotation generator (`AxisAngleGenerator`, `EulerGenerator`, `RandomQuatGenerator`) for
     * mesh particles. Default 0.
     */
    startRotation: ValueGenerator | FunctionValueGenerator | RotationGenerator;
    /** Size each particle starts with in world units; a `Vector3Generator` sizes each axis (Unity's 3D Start Size). Default 1. */
    startSize: ValueGenerator | FunctionValueGenerator | Vector3Generator;
    /** Colour and alpha each particle starts with, multiplied with the texture. Default opaque white. */
    startColor: ColorGenerator | FunctionColorGenerator;
    /** Flipbook cell each particle starts on, counted across rows, see {@link uTileCount}. Default 0. */
    startTileIndex: ValueGenerator;
    /**
     * The render mode's own settings: `TrailSettings` for a trail (`startLength` and the trail
     * flags), `StretchedBillBoardSettings` for a stretched billboard (`speedFactor`,
     * `lengthFactor`), `MeshSettings` or nothing otherwise. Setting {@link renderMode} replaces it
     * with that mode's defaults.
     */
    rendererEmitterSettings: RendererEmitterSettings;
    /**
     * Fraction of billboard particles mirrored along U (x) and V (y), each
     * picked at random when the particle is born — Unity's renderer Flip.
     * Undefined: nothing is mirrored. Meshes ignore it. Any `{x, y}`, such as a Babylon `Vector2`.
     */
    flip?: Vector2Like;
    /** Particles emitted per second, read over the system's time. Default 10. */
    emissionOverTime: ValueGenerator | FunctionValueGenerator;
    /** Particles emitted per world unit the emitter moves (Unity's Rate over Distance). Default 0. */
    emissionOverDistance: ValueGenerator | FunctionValueGenerator;
    /** Bursts of particles at set times in each cycle. Default none. */
    emissionBursts: Array<BurstParameters>;
    /**
     * Most particles alive at once (Unity's Max Particles); emission past it is dropped. Undefined
     * means no limit, as does a negative or NaN count given to the constructor; a fraction is
     * rounded down. With a {@link ringBufferMode}, new particles replace the oldest instead.
     */
    maxParticles?: number;
    /**
     * What a full system does with new particles (Unity's Ring Buffer Mode): drop them, or
     * replace the oldest, which wait frozen or looping until then; see {@link RingBufferMode}.
     * `'disabled'` by default. Takes effect only with {@link maxParticles}.
     */
    ringBufferMode: RingBufferMode;
    /**
     * The part of its life a particle plays again in `'loopUntilReplaced'` (Unity's Loop Range):
     * at the end of its life it goes back to `x` and plays to `y`, as fractions of its life, 0 to
     * 1. (0, 1), the default, replays its whole life. Both ends are read clamped into 0..1 and in
     * order, however the vector was set. A range of no length, such as (0.5, 0.5), holds the
     * particle still at that point of its life; behaviors that act by age stop with it, those
     * that act per second (rotation speed, forces) still run.
     */
    ringBufferLoopRange: Vector2Like;
    /**
     * The system emits nothing of its own and only spawns what an `EmitSubParticleSystem` on
     * another system sends it (a Unity sub emitter). Default false.
     */
    onlyUsedByOther: boolean;
    /**
     * Simulate in world space (Unity's Simulation Space: World): particles stay where they were
     * born when the emitter moves. False keeps them in the emitter's space, so they move with it.
     * Default false.
     */
    worldSpace: boolean;
    /** How many of {@link particles} are alive. */
    get particleNum(): number {
        return this.liveCount;
    }
    /** The live particle count behind {@link particleNum}, which the spawner and the step keep. @internal */
    liveCount = 0;
    /** Set by {@link pause}: the renderer skips the system's simulation while true. */
    paused: boolean;
    /** The particle pool; the first {@link particleNum} are alive. */
    readonly particles: Array<Particle>;
    /** Column storage shared by this system's particles; behaviors read and write it. */
    readonly store: ParticleStore = new ParticleStore(64);
    /** Where particles are born and which way they start (Unity's Shape module). Default a `SphereEmitter`. */
    emitterShape: EmitterShape;
    /** The node the system lives at; move, parent or disable it to place or hide the effect. */
    emitter: ParticleEmitter;
    /** What the renderer batches on; read it with {@link getRendererSettings}. @internal */
    rendererSettings: VFXBatchSettings;
    /**
     * Set when a render setting changed, so the renderer moves the system to a matching batch.
     * The system's setters set it; set it yourself after changing {@link getRendererSettings} directly.
     */
    neededToUpdateRender: boolean;
    /** Modules run on every particle each step, in order (`ColorOverLife`, `SizeOverLife`, forces, ...). */
    behaviors: Array<Behavior>;
    /** Emission progress: time in the cycle, burst and distance counters. */
    readonly emissionState: EmissionState;
    /** The emitter's velocity over the last step, which `InheritVelocity` reads. */
    emitterVelocity: Vector3 = new Vector3();

    private prewarmed: boolean;
    private emitEnded: boolean;
    /**
     * Whether `finished` fired for this play; the spawner clears it when a sub emission refills an
     * empty target.
     * @internal
     */
    finishedEventFired = false;
    /** The fixed-step clock: whole steps per frame, start delay and catch-up time. */
    private readonly clock = new SimulationClock();
    private previousEmitterPos?: Vector3;
    private tempEmitterPos: Vector3 = new Vector3();
    /** The emitter matrix the last simulated step used, to interpolate from; see {@link update}. */
    private previousEmitterMatrix?: Matrix4;
    /** The emitter matrix handed to each step of a frame, moved along the emitter's path. */
    private readonly stepMatrix = new Matrix4();
    /** Makes the newborn particles, see {@link ParticleSpawner}. */
    private readonly spawner = new ParticleSpawner(this);
    /** Decides how many particles each step owes, see {@link EmissionController}. */
    private readonly emission = new EmissionController(this, this.spawner);
    private readonly events = new EventDispatcher();
    private readonly layerMaskProxy: {mask: number};
    private materialRef: ParticleMaterialSource | null = null;
    private sceneRef: Scene | undefined;
    private qualityFactor = 1;
    private destroyed = false;
    /** How the behaviors run each step, rebuilt when the list changes. */
    private readonly behaviorPlan = new BehaviorPlan();
    /** @internal **/
    _renderer?: BatchedRenderer;

    /**
     * Seconds into the current emission cycle. Setting it jumps emission to that point, as Unity's
     * `Simulate(t)` does for the emission clock: the bursts before it count as fired, the ones
     * after are due again; particles alive stay, and behaviors are not reset. A value that is not
     * a finite, non-negative number is 0; one past the duration wraps on a looping system and is
     * the duration otherwise. A system whose emission has ended stays ended: {@link restart} plays
     * it again.
     */
    set time(time: number) {
        const duration = this.duration;
        let seconds = Number.isFinite(time) && time > 0 ? time : 0;
        if (seconds >= duration) {
            seconds = this.looping ? seconds % duration : duration;
        }
        const state = this.emissionState;
        state.time = seconds;
        state.isBursting = false;
        state.burstIndex = 0;
        state.burstWaveIndex = 0;
        state.burstWaves = undefined;
        this.markBurstsBefore(seconds);
    }

    get time(): number {
        return this.emissionState.time;
    }

    /** Whether {@link endEmit} ran, or a non-looping system reached the end of its duration. */
    get isEmitEnded(): boolean {
        return this.emitEnded;
    }

    /**
     * Whether continuous or queued emission can still spawn particles before the system is done:
     * its own, or with `state` one a sub emitter runs into this system for a parent particle.
     */
    hasPendingEmission(state?: EmissionState): boolean {
        return this.emission.hasPendingEmission(state);
    }

    /**
     * No particles left and nothing left to emit: a non-looping system that
     * ran its course, or a looping one whose emission was ended with
     * {@link endEmit} and whose last particle has died.
     */
    isFinished(): boolean {
        if (this.particleNum > 0 || this.hasPendingSubEmission()) {
            return false;
        }
        // A sub emitter target emits nothing of its own: empty is finished,
        // looping or not. Its parent decides when the effect is done.
        if (this.onlyUsedByOther) {
            return true;
        }
        if (this.looping) {
            return this.emitEnded;
        }
        return !this.hasPendingEmission();
    }

    /**
     * The camera layer mask the particles draw for (Babylon's `mesh.layerMask`), as
     * `system.layers.mask`. Default `0x0fffffff`, every camera's default mask. Systems that differ
     * are batched apart.
     */
    get layers(): {
        /** The mask; setting it moves the system to a matching batch. */
        mask: number;
    } {
        return this.layerMaskProxy;
    }

    /**
     * The particles' main texture, multiplied with their colour; a flipbook when
     * {@link uTileCount} or {@link vTileCount} is above 1. Null draws the colour alone. Systems
     * with different textures are batched apart.
     */
    get texture(): Texture | null {
        return this.rendererSettings.texture;
    }

    set texture(texture: Texture | null) {
        this.rendererSettings.texture = texture;
        this.neededToUpdateRender = true;
    }

    /**
     * A Babylon material the system takes its draw settings from (on a loaded system, the material
     * record of its file): its texture (`albedoTexture`,
     * `diffuseTexture`, `emissiveTexture` or `opacityTexture`), alpha mode, depth flags, alpha test
     * and reflection texture. The material itself
     * is not drawn with; particles always use quarks' own shaders. Null leaves the settings as they
     * are.
     */
    get material(): ParticleMaterialSource | null {
        return this.materialRef;
    }

    set material(material: ParticleMaterialSource | null) {
        this.materialRef = material;
        this.applyMaterialSettings(material);
    }

    /**
     * Columns of the flipbook in {@link texture} (Unity's Texture Sheet Animation tiles). With
     * {@link vTileCount}, a particle draws one cell, picked by {@link startTileIndex} and
     * `FrameOverLife`. A whole number of at least 1; anything else is 1. Default 1. Trails take
     * their cell on the CPU, so a trail's texture is cut the same way.
     */
    get uTileCount(): number {
        return this.rendererSettings.uTileCount;
    }

    set uTileCount(u: number) {
        this.rendererSettings.uTileCount = validTileCount(u);
        this.neededToUpdateRender = true;
    }

    /** Rows of the flipbook in {@link texture}, see {@link uTileCount}. Default 1. */
    get vTileCount(): number {
        return this.rendererSettings.vTileCount;
    }

    set vTileCount(v: number) {
        this.rendererSettings.vTileCount = validTileCount(v);
        this.neededToUpdateRender = true;
    }

    /**
     * Cross-fade between a flipbook's cells instead of cutting from one to the next (Unity's
     * Flip-Book Blending); the last cell fades into the first. Default false. Needs a sheet
     * (`uTileCount` or `vTileCount` above 1); trails cut their cell on the CPU and do not blend.
     */
    get blendTiles(): boolean {
        return this.rendererSettings.blendTiles;
    }

    set blendTiles(v: boolean) {
        this.rendererSettings.blendTiles = v;
        this.neededToUpdateRender = true;
    }

    /**
     * Fade particles out as they near the scene behind them (Unity's Soft Particles, Unreal's
     * Depth Fade), between {@link softNearFade} and {@link softFarFade}. Needs a depth texture on
     * the renderer, see `BatchedRenderer.setDepthTexture`; without one particles draw hard.
     * Default false.
     */
    get softParticles(): boolean {
        return this.rendererSettings.softParticles;
    }

    set softParticles(v: boolean) {
        this.rendererSettings.softParticles = v;
        this.neededToUpdateRender = true;
    }

    /**
     * The order this system's batch draws its particles in (Unity's Sort
     * Mode), `'none'` by default. Alpha blended smoke wants `'distance'`;
     * additive effects need nothing. Sorting covers the whole batch, so systems
     * with different modes are batched apart. See {@link SortMode}.
     */
    get sortMode(): SortMode {
        return this.rendererSettings.sortMode ?? 'none';
    }

    set sortMode(mode: SortMode) {
        this.rendererSettings.sortMode = validSortMode(mode);
        this.neededToUpdateRender = true;
    }

    /**
     * Which faces of a mesh particle are drawn (Unity's Render Face): `'both'` by default,
     * `'front'` to cull the back faces of a closed mesh, `'back'` to see only its inside. Applies
     * to the Mesh render mode; the other modes draw both faces. See {@link RenderFace}. Saved in
     * the effect JSON only when not `'both'`.
     */
    get renderFace(): RenderFace {
        return this.rendererSettings.renderFace ?? 'both';
    }

    set renderFace(face: RenderFace) {
        this.rendererSettings.renderFace = validRenderFace(face);
        this.neededToUpdateRender = true;
    }

    /**
     * Smallest size a billboard or stretched particle is drawn at, as a
     * fraction of the viewport height (Unity's Min Particle Size); 0 by
     * default. Keeps distant sparks from vanishing. Meshes and trails ignore it.
     */
    get minParticleSize(): number {
        return this.rendererSettings.minParticleSize ?? 0;
    }

    set minParticleSize(size: number) {
        this.rendererSettings.minParticleSize = Math.max(0, size);
        this.neededToUpdateRender = true;
    }

    /**
     * Largest size a billboard or stretched particle is drawn at, as a fraction
     * of the viewport height (Unity's Max Particle Size, 0.5 there); unlimited
     * by default. Keeps a close particle from filling the screen. Meshes and
     * trails ignore it.
     */
    get maxParticleSize(): number {
        return this.rendererSettings.maxParticleSize ?? Infinity;
    }

    set maxParticleSize(size: number) {
        this.rendererSettings.maxParticleSize = size > 0 ? size : Infinity;
        this.neededToUpdateRender = true;
    }

    /**
     * Billboard pivot in particle-size units (Unity's renderer Pivot), see
     * {@link VFXBatchSettings.pivot}. Assign a new vector to change it: editing
     * the returned one in place does not reach the renderer.
     */
    get pivot(): Vector3Like | undefined {
        return this.rendererSettings.pivot;
    }

    set pivot(v: Vector3Like | undefined) {
        this.rendererSettings.pivot = nonZeroPivot(v);
        this.neededToUpdateRender = true;
    }

    /**
     * How mesh particles are lit: `'fixed'` (the default — the renderer's
     * light, see {@link BatchedRenderer.setMeshLighting}), `'unlit'` (texture
     * times colour, for emissive meshes) or `'scene'` (the scene's first
     * directional or hemispheric light). Saved with the material in the effect
     * JSON. Other render modes ignore it.
     */
    get lighting(): MeshLighting {
        return this.rendererSettings.lighting ?? 'fixed';
    }

    set lighting(lighting: MeshLighting) {
        this.rendererSettings.lighting = validLighting(lighting);
        this.neededToUpdateRender = true;
    }

    /**
     * Rim (Fresnel) term on mesh particles — a glowing edge (`mode: 'add'`) or
     * an outline (`'mix'`), see {@link MeshRim}. Undefined (the default) draws
     * none. Fields left out of an assigned rim take their defaults; assign a
     * new object to change it, editing the returned one does not reach the
     * renderer. Saved with the material in the effect JSON. Other render modes
     * ignore it.
     */
    get rim(): MeshRim | undefined {
        return this.rendererSettings.rim;
    }

    set rim(rim: Partial<MeshRim> | undefined) {
        this.rendererSettings.rim = normalizeMeshRim(rim);
        this.neededToUpdateRender = true;
    }

    /**
     * How the main map is laid over the particle, see {@link TextureUV}: its
     * UV channel, tiling and offset (Unity's Tiling / Offset) and a scroll on
     * the renderer's clock (Unreal's Panner), for flowing energy, lava or a
     * smear running along a mesh. A scrolled or tiled map should repeat. On a
     * sprite sheet (UV channel 0) the layout applies to the sheet's UV, so a
     * scroll or tiling there runs into the neighbouring cells. Undefined (the
     * default), or the identity: the map as drawn. Fields left out take their
     * defaults; assign a new object to change it. Saved with the material in
     * the effect JSON.
     */
    get mapUV(): TextureUV | undefined {
        return this.rendererSettings.mapUV;
    }

    set mapUV(uv: Partial<TextureUV> | undefined) {
        this.rendererSettings.mapUV = normalizeMapUV(uv);
        this.neededToUpdateRender = true;
    }

    /**
     * Colour ramp the map is recoloured through (a gradient map), see
     * {@link ParticleGradientMap}: a channel of the map, or its luminance,
     * picks a colour along U of the ramp; the particle colour still tints the
     * result. One greyscale or channel-packed texture then serves every
     * palette. Undefined (the default), or without a ramp: none. Assign a new
     * object to change it. Saved with the material in the effect JSON.
     */
    get gradientMap(): ParticleGradientMap | undefined {
        return this.rendererSettings.gradientMap;
    }

    set gradientMap(gradientMap: Partial<ParticleGradientMap> | undefined) {
        this.rendererSettings.gradientMap = normalizeGradientMap(gradientMap);
        this.neededToUpdateRender = true;
    }

    /**
     * Alpha erosion, see {@link ParticleErosion}: the particle's alpha decides
     * how much of the shape is left rather than how transparent it is, so a
     * `ColorOverLife` alpha curve dissolves the shape through a noise mask or
     * wipes it through a gradient one — and an effect told to stop can fade
     * out that way. Undefined (the default): alpha is plain transparency.
     * Fields left out take their defaults; assign a new object to change it.
     * Saved with the material in the effect JSON.
     */
    get erosion(): ParticleErosion | undefined {
        return this.rendererSettings.erosion;
    }

    set erosion(erosion: ParticleErosionOptions | undefined) {
        this.rendererSettings.erosion = normalizeErosion(erosion);
        this.neededToUpdateRender = true;
    }

    /**
     * Map UV distortion, see {@link ParticleUVDistortion}: a scrolling noise
     * texture pushes the map's UV about, for heat shimmer and licking,
     * breathing shapes. Undefined (the default), or without a map: none.
     * Fields left out take their defaults; assign a new object to change it.
     * Saved with the material in the effect JSON.
     */
    get uvDistortion(): ParticleUVDistortion | undefined {
        return this.rendererSettings.uvDistortion;
    }

    set uvDistortion(distortion: ParticleUVDistortionOptions | undefined) {
        this.rendererSettings.uvDistortion = normalizeUVDistortion(distortion);
        this.neededToUpdateRender = true;
    }

    /** The mean scale of the emitter's matrix for a world-space system, else 1. */
    private measureMotionScale(emitterMatrix: Matrix4): number {
        if (!this.worldSpace) {
            return 1;
        }
        const e = emitterMatrix.elements;
        const sx = Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]);
        const sy = Math.sqrt(e[4] * e[4] + e[5] * e[5] + e[6] * e[6]);
        const sz = Math.sqrt(e[8] * e[8] + e[9] * e[9] + e[10] * e[10]);
        return (sx + sy + sz) / 3;
    }

    /**
     * Distance in world units in front of the scene at which a soft particle is fully faded out,
     * at least 0. Default 0. A live parameter: changing it on a system alone in its batch keeps
     * the batch and its material (see {@link VFXBatchSettings}).
     */
    get softNearFade(): number {
        return this.rendererSettings.softNearFade;
    }

    set softNearFade(v: number) {
        this.rendererSettings.softNearFade = validSoftFade(v, 0);
        this.neededToUpdateRender = true;
    }

    /**
     * Distance in world units in front of the scene at which a soft particle is fully opaque, at
     * least 0. Default 1 (Unreal's Depth Fade distance): the particle fades over the last unit
     * before the scene. A value at or below {@link softNearFade} cuts the particle off at that
     * distance instead of fading it. A live parameter, like `softNearFade`.
     */
    get softFarFade(): number {
        return this.rendererSettings.softFarFade;
    }

    set softFarFade(v: number) {
        this.rendererSettings.softFarFade = validSoftFade(v, DEFAULT_SOFT_FAR_FADE);
        this.neededToUpdateRender = true;
    }

    /**
     * The mesh particles' positions, three values per vertex.
     * Setting it restarts the system. A new geometry with a different vertex
     * count drops UV sets, normals and indices that no longer fit it: the first UV set
     * falls back to zeros, the second to none, the normals to +Z, the indices to the vertex
     * sequence. Assign {@link instancingUVs}, {@link instancingUVs2} and {@link instancingIndices}
     * after it.
     */
    get instancingGeometry(): Float32Array {
        return this.rendererSettings.instancingGeometry;
    }

    set instancingGeometry(geometry: Float32Array) {
        this.restartKeepingPause();
        const settings = this.rendererSettings;
        const uvLength = (geometry.length / 3) * 2;
        const previous = settings.instancingGeometry;
        settings.instancingGeometry = geometry;
        // The indices belong to the geometry they were set with: a geometry with another vertex
        // count, or one the indices point past, takes its own sequence. Assign
        // {@link instancingIndices} after it for an indexed mesh.
        if (geometry.length !== previous.length || !indicesFit(settings.instancingIndices, geometry.length / 3)) {
            settings.instancingIndices = ensureTriangleIndices(geometry);
        }
        // Sets that no longer fit, or that were the old geometry's fallbacks, move to the new one's.
        if (settings.instancingUVs?.length !== uvLength || isFallbackUVs(settings.instancingUVs, previous)) {
            settings.instancingUVs = fallbackUVsForPositions(geometry);
        }
        if (
            settings.instancingNormals &&
            (settings.instancingNormals.length !== geometry.length ||
                isFallbackNormals(settings.instancingNormals, previous))
        ) {
            settings.instancingNormals = fallbackNormalsForPositions(geometry);
        }
        if (settings.instancingUVs2 && settings.instancingUVs2.length !== uvLength) {
            settings.instancingUVs2 = undefined;
        }
        this.ensureMeshNormals();
        this.neededToUpdateRender = true;
    }

    /**
     * Gives a mesh system normals when it has none, +Z per vertex, so the mesh shader always has
     * the attribute it reads. Called on construction and when the render mode or geometry changes.
     */
    private ensureMeshNormals(): void {
        const settings = this.rendererSettings;
        if (settings.renderMode === RenderMode.Mesh && !settings.instancingNormals) {
            settings.instancingNormals = fallbackNormalsForPositions(settings.instancingGeometry);
        }
    }

    /**
     * {@link restart} for a setting that rebuilds the particles: the system is cleared and rewound,
     * but a paused system stays paused, and a stopped one stays stopped.
     */
    private restartKeepingPause(): void {
        const paused = this.paused;
        this.restart();
        this.particles.length = 0;
        this.paused = paused;
    }

    /**
     * The mesh particles' triangle indices into {@link instancingGeometry}. Mesh systems that share
     * positions but not indices (sub-meshes of one vertex buffer) are batched apart.
     */
    get instancingIndices(): Uint32Array | Uint16Array {
        return this.rendererSettings.instancingIndices;
    }

    set instancingIndices(indices: Uint32Array | Uint16Array) {
        this.rendererSettings.instancingIndices = indices;
        this.neededToUpdateRender = true;
    }

    /** The mesh particles' first UV set, two values per vertex. */
    get instancingUVs(): Float32Array {
        return this.rendererSettings.instancingUVs ?? fallbackUVsForPositions(this.rendererSettings.instancingGeometry);
    }

    set instancingUVs(uvs: Float32Array) {
        this.rendererSettings.instancingUVs = uvs;
        this.neededToUpdateRender = true;
    }

    /** The mesh particles' second UV set, read by textures on UV channel 1; see `UVChannel`. */
    get instancingUVs2(): Float32Array | undefined {
        return this.rendererSettings.instancingUVs2;
    }

    set instancingUVs2(uvs: Float32Array | undefined) {
        this.rendererSettings.instancingUVs2 = uvs;
        this.neededToUpdateRender = true;
    }

    /**
     * Babylon alpha mode the particles blend with: `Constants.ALPHA_ADD` (the default) for glows,
     * `Constants.ALPHA_COMBINE` for smoke and anything alpha blended. Systems that differ are
     * batched apart.
     */
    get blending(): number {
        return this.rendererSettings.materialBlendMode;
    }

    set blending(blending: number) {
        this.rendererSettings.materialBlendMode = blending;
        this.neededToUpdateRender = true;
    }

    /**
     * Whether the particles draw in the transparent pass, blended by {@link blending}; false
     * draws them opaque, with blending off. Default true, or the material's `needAlphaBlending`.
     * Systems that differ are batched apart.
     */
    get transparent(): boolean {
        return this.rendererSettings.materialTransparent;
    }

    set transparent(transparent: boolean) {
        this.rendererSettings.materialTransparent = transparent;
        this.neededToUpdateRender = true;
    }

    /**
     * Whether particles are hidden behind nearer geometry; false draws them over everything
     * (Unity's `ZTest Always`), for overlays and effects seen through walls. Default true, or the
     * material's `disableDepthTest` inverted. Systems that differ are batched apart.
     */
    get depthTest(): boolean {
        return this.rendererSettings.materialDepthTest;
    }

    set depthTest(depthTest: boolean) {
        this.rendererSettings.materialDepthTest = depthTest;
        this.neededToUpdateRender = true;
    }

    /**
     * Whether particles write depth, so later draws are hidden behind them. Default false, or the
     * material's `disableDepthWrite` inverted. Systems that differ are batched apart.
     */
    get depthWrite(): boolean {
        return this.rendererSettings.materialDepthWrite;
    }

    set depthWrite(depthWrite: boolean) {
        this.rendererSettings.materialDepthWrite = depthWrite;
        this.neededToUpdateRender = true;
    }

    /**
     * Alpha below which a fragment is discarded (Unity's Alpha Clip Threshold), 0…1; 0 (the
     * default, or the material's `alphaCutOff`) discards nothing but fragments under 0.01, which no
     * blend mode can show except additive ones with a bright colour. Switching it on or off
     * rebuilds the batch's material; a change between non-zero cutoffs on a system alone in its
     * batch is written to the material in place.
     */
    get alphaTest(): number {
        return this.rendererSettings.materialAlphaTest;
    }

    set alphaTest(cutoff: number) {
        this.rendererSettings.materialAlphaTest = validAlphaTest(cutoff);
        this.neededToUpdateRender = true;
    }

    /**
     * How each particle is drawn (Unity's Render Mode): a camera-facing billboard, a stretched
     * billboard, a horizontal or vertical billboard, a mesh, a trail or a beam, see
     * {@link RenderMode}. Changing it gives {@link rendererEmitterSettings} the new mode's
     * defaults, and switching to or from a trail restarts the system. Switching to a mesh makes
     * {@link startRotation} an `AxisAngleGenerator` about Y, and switching away from one sets it to 0.
     */
    get renderMode(): RenderMode {
        return this.rendererSettings.renderMode;
    }

    set renderMode(renderMode: RenderMode) {
        if (this.rendererSettings.renderMode !== renderMode) {
            let needRestart = false;
            if (this.rendererSettings.renderMode === RenderMode.Trail) {
                needRestart = true;
            }
            if (this.rendererSettings.renderMode === RenderMode.Mesh) {
                this.startRotation = new ConstantValue(0);
            }
            switch (renderMode) {
                case RenderMode.Trail:
                    this.rendererEmitterSettings = {startLength: new ConstantValue(30), followLocalOrigin: false};
                    needRestart = true;
                    break;
                case RenderMode.Mesh:
                    this.rendererEmitterSettings = {};
                    this.startRotation = new AxisAngleGenerator(new Vector3(0, 1, 0), new ConstantValue(0));
                    break;
                case RenderMode.StretchedBillBoard:
                    this.rendererEmitterSettings = {speedFactor: 0, lengthFactor: 2};
                    break;
                case RenderMode.BillBoard:
                case RenderMode.VerticalBillBoard:
                case RenderMode.HorizontalBillBoard:
                case RenderMode.Beam:
                    this.rendererEmitterSettings = {};
                    break;
            }
            this.rendererSettings.renderMode = renderMode;
            if (needRestart) {
                this.restartKeepingPause();
            }
            this.ensureMeshNormals();
            this.neededToUpdateRender = true;
        }
    }

    /**
     * The batch mesh's `alphaIndex`: among the transparent meshes of one rendering group, lower
     * draws first, whatever the distance (Unity's Order in Layer). Default 0. Systems that differ
     * are batched apart.
     */
    get renderOrder(): number {
        return this.rendererSettings.renderOrder;
    }

    set renderOrder(renderOrder: number) {
        this.rendererSettings.renderOrder = renderOrder;
        this.neededToUpdateRender = true;
    }

    /**
     * Babylon rendering group the particles draw in (`mesh.renderingGroupId`),
     * 0 by default. Use it to draw an effect after the scene's other transparent
     * meshes, or before an overlay group.
     */
    get renderingGroupId(): number {
        return this.rendererSettings.renderingGroupId;
    }

    set renderingGroupId(group: number) {
        this.rendererSettings.renderingGroupId = group;
        this.neededToUpdateRender = true;
    }

    /**
     * Whether the scene's fog applies to the particles, as it does to any other
     * mesh; true by default. Additive particles fade toward black rather than
     * the fog colour. Saved in the effect JSON only when switched off.
     */
    get applyFog(): boolean {
        return this.rendererSettings.applyFog;
    }

    set applyFog(apply: boolean) {
        this.rendererSettings.applyFog = apply;
        this.neededToUpdateRender = true;
    }

    /**
     * Whether the particles' material applies the scene's image processing (exposure, contrast,
     * tone mapping, vignette, colour curves, colour grading, dithering of
     * `scene.imageProcessingConfiguration`), as Babylon's own particle systems and materials do;
     * true by default. A scene whose configuration does nothing leaves the colour as it is, and
     * one applied by a post process gets the colour in linear space. Particles that multiply the
     * frame (`ALPHA_MULTIPLY`) are a factor rather than light and are not tone mapped.
     *
     * As in Babylon, the processing runs on each particle before it is blended: tone mapping
     * clamps an HDR colour to the displayable range, and an additive particle picks up what the
     * configuration does to black (a contrast below 1, colour curves or an
     * opaque vignette lift it). The configuration is the scene's;
     * there is no per-system one.
     *
     * Switched off, the material writes its colour as authored, and leaves it in gamma space under
     * a post process, which still processes the frame the particles are in. To keep particles out
     * of a post process, draw them with a camera the pipeline is not attached to. Saved in the
     * effect JSON only when switched off.
     */
    get applyImageProcessing(): boolean {
        return this.rendererSettings.applyImageProcessing !== false;
    }

    set applyImageProcessing(apply: boolean) {
        this.rendererSettings.applyImageProcessing = apply;
        this.neededToUpdateRender = true;
    }

    /**
     * Multiplier on the time this system is advanced by (Unity's Simulation
     * Speed): 2 runs the effect twice as fast, 0 freezes it without pausing the
     * renderer. 1 by default; saved in the effect JSON only when it differs. A
     * negative or NaN speed is read as 0, and the clock does not run backwards.
     */
    get playbackSpeed(): number {
        return this.playbackSpeedValue;
    }

    set playbackSpeed(speed: number) {
        this.playbackSpeedValue = speed > 0 && speed < Infinity ? speed : 0;
    }

    private playbackSpeedValue = 1;

    /**
     * A runtime multiplier on {@link playbackSpeed} that is not part of the effect: what a
     * timeline, a slow-motion moment or a game's pause menu sets on a system it plays, like
     * Unreal's Custom Time Dilation or Unity's `VisualEffect.playRate`. The system runs at
     * `playbackSpeed * timeDilation`. 1 by default; never saved, cloned or loaded. A negative,
     * NaN or infinite value is read as 0. A `QuarksPrefab` sets it to its `timeScale` on the systems of
     * its tracks.
     */
    get timeDilation(): number {
        return this.timeDilationValue;
    }

    set timeDilation(dilation: number) {
        this.timeDilationValue = dilation > 0 && dilation < Infinity ? dilation : 0;
    }

    private timeDilationValue = 1;

    /**
     * Runtime multiplier on how many particles the system emits: bursts,
     * emission over time and over distance alike. Unlike
     * {@link setQualityFactor}, which only ever thins an effect, it may go
     * above 1 to make a stronger version of the same effect. The two multiply.
     * 1 by default; a negative or NaN value counts as 0. Not saved in the effect JSON; copied by
     * {@link clone}.
     */
    get emissionMultiplier(): number {
        return this.emissionMultiplierValue;
    }

    set emissionMultiplier(multiplier: number) {
        this.emissionMultiplierValue = Number.isFinite(multiplier) && multiplier >= 0 ? multiplier : 0;
    }

    private emissionMultiplierValue = 1;

    /** What this system does while off screen, see {@link CullingMode}. `'always'` by default. */
    cullingMode: CullingMode = 'always';

    /** What the emitter's scale does to the system, see {@link ScalingMode}. `'local'` by default. */
    scalingMode: ScalingMode = 'local';

    /**
     * What world-space forces and speed limits are multiplied by this step: the mean of the axes
     * of the scale the {@link scalingMode} applies (the emitter's own in `'local'`, its world scale
     * in `'hierarchy'`, 1 in `'shape'`) in a world-space system, 1 in a local-space one, whose
     * emitter matrix scales them already. Updated before every simulation step.
     */
    motionScale = 1;

    /**
     * Whether each particle starts turned along the direction its shape sends
     * it (Unity's Align To Direction): a mesh particle's +Z is pointed along
     * the velocity, a billboard's top is turned toward it in the emitter's XY
     * plane. The start rotation is applied on top. A particle with no speed is
     * left as it is. False by default.
     */
    alignToDirection = false;

    private seedValue?: number;
    /** The system's own generator while it steps, when seeded; see {@link seed}. */
    private rng?: RandomSource;

    /**
     * Seed for this system's own random generator. Set, every roll the system
     * makes while it steps (spawn positions, interval values, random colours
     * and rotations, burst probability) comes from a generator started from
     * this seed, and restarted with it on {@link restart}: the effect plays out
     * identically every time, on every machine — for replays, lock-step
     * multiplayer and reproducible tests. Systems this one emits into roll on
     * its generator too. Unset (the default), rolls come from the global source
     * (`setRandomSource` in quarks.core). Saved in the effect JSON when set.
     * The behaviors roll on the same generator, and the ones with their own
     * randomness (a `TurbulenceField`'s noise) are built from their own seed,
     * so the whole effect is covered.
     */
    get seed(): number | undefined {
        return this.seedValue;
    }

    set seed(seed: number | undefined) {
        this.seedValue = seed;
        this.rng = seed === undefined ? undefined : createSeededRandom(seed);
        // Seeded before it has played: roll the system-level values on the new generator, so the
        // first play matches every restart. (The constructor sets the seed before they exist.)
        if (this.emissionState !== undefined && this.emissionState.time === 0 && this.particleNum === 0) {
            this.emission.memory.length = 0;
            this.initSystemGenerators();
        }
    }

    /**
     * Set by the renderer each frame: true while no active camera sees the
     * system's bounds and its {@link cullingMode} is not `'always'`.
     * @internal
     */
    culled = false;

    /**
     * Time per frame a system coming back into view may spend on the steps it
     * missed, in milliseconds, when it is advanced without a renderer. The
     * {@link BatchedRenderer} shares its own budget among all its systems
     * instead. Steps that do not fit are dropped, not deferred.
     */
    static catchUpBudgetMs = 2;

    /**
     * A performance guard on {@link prewarm}, for every system: the most of a cycle it simulates
     * before the first frame, in seconds. A longer cycle is warmed up over its last
     * `maxPrewarmSeconds` only, with the burst waves before that counted as fired, so a long
     * looping effect does not stall its first frame. 10 by default; raise it in an app whose
     * effects have longer cycles and particles that live longer than that. It is not an effect's
     * own warm-up time, which is {@link prewarmTime}, and is not saved with one.
     */
    static maxPrewarmSeconds = 10;

    /** What the system draws covers, for culling. See {@link getWorldBounds}. */
    private readonly bounds = new BoundsTracker();

    constructor(parameters: ParticleSystemParameters) {
        this.sceneRef = parameters.scene;
        this.layerMaskProxy = {mask: parameters.layerMask ?? 0x0fffffff};
        Object.defineProperty(this.layerMaskProxy, 'mask', {
            enumerable: true,
            get: () => this.rendererSettings.layerMask,
            set: (mask: number) => {
                this.rendererSettings.layerMask = mask;
                this.neededToUpdateRender = true;
            },
        });

        this.stopAction = validStopAction(parameters.stopAction);
        this.duration = parameters.duration ?? 1;
        this.startDelay = parameters.startDelay ?? new ConstantValue(0);
        this.looping = parameters.looping ?? true;
        this.prewarm = parameters.prewarm ?? false;
        this.prewarmTime = parameters.prewarmTime ?? 0;
        this.startLife = parameters.startLife ?? new ConstantValue(5);
        this.startSpeed = parameters.startSpeed ?? new ConstantValue(0);
        this.startRotation = parameters.startRotation ?? new ConstantValue(0);
        this.startSize = parameters.startSize ?? new ConstantValue(1);
        this.startColor = parameters.startColor ?? new ConstantColor(new Vector4(1, 1, 1, 1));
        this.emissionOverTime = parameters.emissionOverTime ?? new ConstantValue(10);
        this.emissionOverDistance = parameters.emissionOverDistance ?? new ConstantValue(0);
        this.emissionBursts = normalizeBursts(parameters.emissionBursts);
        this.maxParticles = validMaxParticles(parameters.maxParticles);
        this.ringBufferMode = validRingBufferMode(parameters.ringBufferMode);
        this.ringBufferLoopRange = validLoopRange(parameters.ringBufferLoopRange);
        this.onlyUsedByOther = parameters.onlyUsedByOther ?? false;
        this.emitterShape = parameters.shape ?? new SphereEmitter();
        this.behaviors = parameters.behaviors ?? [];
        this.worldSpace = parameters.worldSpace ?? false;
        this.rendererEmitterSettings = parameters.rendererEmitterSettings ?? {};

        if (parameters.renderMode === RenderMode.Trail) {
            // The defaults the renderMode setter gives a trail, for settings left out, on a copy so
            // the caller's object is left as it was.
            const settings = {...this.rendererEmitterSettings} as TrailSettings;
            this.rendererEmitterSettings = settings;
            settings.startLength = settings.startLength ?? new ConstantValue(30);
            settings.followLocalOrigin = settings.followLocalOrigin ?? false;
        }
        if (parameters.renderMode === RenderMode.StretchedBillBoard) {
            const settings = {...this.rendererEmitterSettings} as StretchedBillBoardSettings;
            this.rendererEmitterSettings = settings;
            settings.speedFactor = settings.speedFactor ?? 0;
            settings.lengthFactor = settings.lengthFactor ?? 0;
        }

        this.rendererSettings = {
            instancingGeometry: parameters.instancingGeometry ?? DEFAULT_POSITIONS,
            instancingIndices: parameters.instancingIndices ?? DEFAULT_INDICES,
            instancingUVs:
                parameters.instancingUVs ??
                (parameters.instancingGeometry ? fallbackUVsForPositions(parameters.instancingGeometry) : DEFAULT_UVS),
            instancingUVs2: parameters.instancingUVs2,
            instancingNormals: parameters.instancingNormals,
            renderMode: parameters.renderMode ?? RenderMode.BillBoard,
            renderOrder: parameters.renderOrder ?? 0,
            uTileCount: validTileCount(parameters.uTileCount),
            vTileCount: validTileCount(parameters.vTileCount),
            blendTiles: parameters.blendTiles ?? false,
            softParticles: parameters.softParticles ?? false,
            softNearFade: validSoftFade(parameters.softNearFade, 0),
            softFarFade: validSoftFade(parameters.softFarFade, DEFAULT_SOFT_FAR_FADE),
            materialBlendMode: parameters.blendMode ?? Constants.ALPHA_ADD,
            materialTransparent: parameters.transparent ?? true,
            materialDepthTest: parameters.depthTest ?? true,
            materialDepthWrite: parameters.depthWrite ?? false,
            materialAlphaTest: validAlphaTest(parameters.alphaTest),
            texture: parameters.texture ?? null,
            reflectionTexture: null,
            reflectionLevel: 1,
            reflectionAtlas: null,
            layerMask: parameters.layerMask ?? 0x0fffffff,
            pivot: nonZeroPivot(parameters.pivot),
            sortMode: validSortMode(parameters.sortMode),
            renderFace: validRenderFace(parameters.renderFace),
            minParticleSize: Math.max(0, parameters.minParticleSize ?? 0),
            maxParticleSize: parameters.maxParticleSize ?? Infinity,
            renderingGroupId: parameters.renderingGroupId ?? 0,
            applyFog: parameters.applyFog ?? true,
            applyImageProcessing: parameters.applyImageProcessing ?? true,
            lighting: validLighting(parameters.lighting),
            rim: normalizeMeshRim(parameters.rim),
            mapUV: normalizeMapUV(parameters.mapUV),
            gradientMap: normalizeGradientMap(parameters.gradientMap),
            erosion: normalizeErosion(parameters.erosion),
            uvDistortion: normalizeUVDistortion(parameters.uvDistortion),
        };
        this.flip = nonZeroFlip(parameters.flip);
        this.playbackSpeed = parameters.playbackSpeed ?? 1;
        this.cullingMode = validCullingMode(parameters.cullingMode);
        this.scalingMode = validScalingMode(parameters.scalingMode);
        this.alignToDirection = parameters.alignToDirection === true;
        this.seed = parameters.seed;
        this.ensureMeshNormals();

        this.materialRef = parameters.material ?? null;
        this.applyMaterialSettings(this.materialRef, {
            blendMode: parameters.blendMode,
            transparent: parameters.transparent,
            depthTest: parameters.depthTest,
            depthWrite: parameters.depthWrite,
            alphaTest: parameters.alphaTest,
            texture: parameters.texture,
            layerMask: parameters.layerMask,
        });
        this.neededToUpdateRender = true;

        this.particles = [];
        this.startTileIndex = parameters.startTileIndex || new ConstantValue(0);
        this.emitter = new ParticleEmitter(this, parameters.scene);

        this.paused = false;
        this.liveCount = 0;
        this.emissionState = {
            isBursting: false,
            burstParticleIndex: 0,
            burstParticleCount: 0,
            burstIndex: 0,
            burstWaveIndex: 0,
            time: 0,
            waitEmiting: 0,
            travelDistance: 0,
        };

        this.initSystemGenerators();

        this.emitEnded = false;
        this.prewarmed = false;
    }

    /**
     * When the env atlas this system draws with is disposed (its cube was, or `disposeEnvAtlas`
     * ran) while the system still uses it, drops it and builds a new one if the cube is still alive,
     * so the batch never samples a disposed texture.
     */
    private watchEnvAtlas(atlas: BaseTexture | null, material: ParticleMaterialSource | null): void {
        atlas?.onDisposeObservable.addOnce(() => {
            if (this.destroyed || this.rendererSettings.reflectionAtlas !== atlas) {
                return;
            }
            this.rendererSettings.reflectionAtlas = null;
            if (material?.reflectionAtlas === atlas) {
                material.reflectionAtlas = null;
            }
            this.neededToUpdateRender = true;
            const cube = this.rendererSettings.reflectionTexture;
            if (cube?.isCube && cube.getScene() && this.sceneRef) {
                ensureEnvAtlasFromCube(cube, this.sceneRef, (rebuilt) => {
                    if (this.destroyed || this.rendererSettings.reflectionTexture !== cube) {
                        return;
                    }
                    this.rendererSettings.reflectionAtlas = rebuilt;
                    if (material && material.reflectionAtlas == null) {
                        material.reflectionAtlas = rebuilt;
                    }
                    this.watchEnvAtlas(rebuilt, material);
                    this.neededToUpdateRender = true;
                });
            }
        });
    }

    private applyMaterialSettings(material: ParticleMaterialSource | null, overrides: MaterialOverrides = {}) {
        /* istanbul ignore if -- rendererSettings is always assigned in the constructor before any code path can call this private method */
        if (!this.rendererSettings) {
            return;
        }
        const resolved = resolveMaterialSettings(material, overrides, this.rendererSettings);

        this.rendererSettings.texture = resolved.texture;
        this.rendererSettings.reflectionTexture = resolved.reflectionTexture;
        this.rendererSettings.reflectionLevel = resolved.reflectionLevel;
        // Prefer an explicit atlas; otherwise build a 3×2 atlas from CubeTexture
        // face URLs (iOS-safe single sampler2D — not samplerCube / six faces).
        let resolvedAtlas = resolved.reflectionAtlas;
        const resolvedReflection = resolved.reflectionTexture;
        if (!resolvedAtlas && resolvedReflection?.isCube) {
            resolvedAtlas = getCachedEnvAtlas(resolvedReflection, this.sceneRef);
            if (!resolvedAtlas && this.sceneRef) {
                ensureEnvAtlasFromCube(resolvedReflection, this.sceneRef, (atlas) => {
                    if (this.rendererSettings.reflectionAtlas === atlas) {
                        return;
                    }
                    this.rendererSettings.reflectionAtlas = atlas;
                    if (material && !liveAtlas(material.reflectionAtlas)) {
                        material.reflectionAtlas = atlas;
                    }
                    this.watchEnvAtlas(atlas, material);
                    this.neededToUpdateRender = true;
                });
                resolvedAtlas = getCachedEnvAtlas(resolvedReflection, this.sceneRef);
            }
        }
        this.rendererSettings.reflectionAtlas = resolvedAtlas;
        this.watchEnvAtlas(resolvedAtlas, material);
        this.rendererSettings.materialBlendMode = resolved.blendMode;
        this.rendererSettings.materialTransparent = resolved.transparent;
        this.rendererSettings.materialDepthTest = resolved.depthTest;
        this.rendererSettings.materialDepthWrite = resolved.depthWrite;
        this.rendererSettings.materialAlphaTest = validAlphaTest(resolved.alphaTest);
        if (overrides.layerMask !== undefined) {
            this.rendererSettings.layerMask = overrides.layerMask;
        }
        this.neededToUpdateRender = true;
    }

    /** Freezes the system where it is: particles stay and nothing is simulated until {@link play}. */
    pause(): void {
        this.paused = true;
    }

    /**
     * Plays the system, like Unity's `Play`: a paused or stopped system resumes from where it is,
     * and one that has finished ({@link isFinished}) starts over from the beginning, as
     * {@link restart} does. A playing system that has not finished is left as it is. To undo a
     * {@link pause} without replaying a system that had finished, use {@link resume}.
     */
    play(): void {
        if (this.destroyed) {
            return;
        }
        if (this.isFinished()) {
            this.restart();
        }
        this.resume();
    }

    /**
     * Undoes {@link pause}: the system goes on from where it is, and one that has finished stays
     * finished. For a pause button over a whole scene, where {@link play} would replay the
     * effects that had already ended.
     */
    resume(): void {
        if (this.destroyed) {
            return;
        }
        this.paused = false;
        // A move made while paused is a placement, not motion to spread the next frame over.
        this.previousEmitterMatrix = undefined;
    }

    /** Clears every particle, rewinds to the start ({@link restart}) and pauses until {@link play}. */
    stop(): void {
        this.restart();
        this.pause();
    }

    /**
     * Removes every particle alive and nothing else (Unity's `Clear`): emission goes on from where
     * it is, paused stays paused, and the bursts and the random generator are not rewound. The
     * sub emissions the removed particles were driving end with them; the child systems' own
     * particles stay, and `particleDied` is not fired.
     */
    clear(): void {
        this.liveCount = 0;
        this.bounds.valid = false;
        for (const behavior of this.behaviors) {
            if (behavior instanceof EmitSubParticleSystem) {
                behavior.clearEmissions();
            }
        }
    }

    /**
     * Drops every trail's recorded samples and keeps the particles (Unity's `TrailRenderer.Clear`):
     * each ribbon starts over from where its particle is now. For a teleport: {@link pause}, move
     * the emitter, {@link play} (so the move is not spread over the next frame's steps as motion)
     * and call this, and no ribbon is drawn across the jump. Does nothing on the other render modes.
     */
    clearTrails(): void {
        if (this.rendererSettings.renderMode !== RenderMode.Trail) {
            return;
        }
        for (let i = 0; i < this.particleNum; i++) {
            (this.particles[i] as TrailParticle).resetHistory();
        }
    }

    /**
     * Scales how many particles the system emits, from 0.1 to 1 (values outside are clamped), for
     * lower quality settings or a crowded frame; the renderer's adaptive performance sets it. It
     * multiplies with {@link emissionMultiplier}. Default 1.
     */
    setQualityFactor(qualityFactor: number): void {
        this.qualityFactor = Math.max(0.1, Math.min(1, qualityFactor));
    }

    /**
     * Quality factor times {@link emissionMultiplier}: what emission counts are scaled by.
     * @internal
     */
    emissionFactor(): number {
        return this.qualityFactor * this.emissionMultiplierValue;
    }

    /**
     * Stops emission and lets the particles alive die out (Unity's `Stop` with
     * `StopEmitting`). The system fires `emitEnd`, then `finished` when the last particle has
     * died, and then does what its {@link stopAction} says. {@link restart} starts it again.
     */
    endEmit(): void {
        this.emitEnded = true;
        this.events.fire({type: 'emitEnd', particleSystem: this});
    }

    /** Whether {@link dispose} has run. A disposed system emits nothing and cannot be restarted. */
    get isDisposed(): boolean {
        return this.destroyed;
    }

    /**
     * Removes the system from its renderer, disposes its emitter node (and the nodes under it) and
     * fires `destroy`. A disposed system cannot be played again. Calling it twice is harmless.
     */
    dispose(): void {
        if (this.destroyed) {
            return;
        }
        this.destroyed = true;
        // Nothing updates a disposed system again, so its particles would never die.
        this.liveCount = 0;
        if (this._renderer) this._renderer.deleteSystem(this);
        disposeEmitterForSystem(this.emitter);
        this.events.fire({type: 'destroy', particleSystem: this});
    }

    /**
     * Rolls the system-level generators into the system's memory. Called on construction and on
     * every restart, which empties the memory: a generator that keeps a slot index into it, such
     * as `IntervalValue`, would otherwise read past the end and return NaN. A seeded system rolls
     * them on its own generator, so a restart replays the same rates, counts and delay.
     */
    private initSystemGenerators(): void {
        const rng = this.rng;
        const previous = rng === undefined ? undefined : setRandomSource(rng);
        try {
            this.clock.setStartDelay(this.emission.rollGenerators());
        } finally {
            if (rng !== undefined) {
                setRandomSource(previous ?? null);
            }
        }
    }

    /**
     * Clears every particle and starts the system from the beginning: emission time 0, bursts and
     * the start delay rolled again, behaviors reset, and a seeded system's generator restarted, so
     * it replays the same effect. Also unpauses it.
     */
    restart(): void {
        if (this.destroyed) {
            return;
        }
        this.emission.memory.length = 0;
        this.paused = false;
        this.liveCount = 0;
        this.bounds.valid = false;
        this.clock.reset();
        if (this.seedValue !== undefined) {
            // The same seed again, so a restart replays the same effect.
            this.rng = createSeededRandom(this.seedValue);
        }
        this.emissionState.isBursting = false;
        this.emissionState.burstIndex = 0;
        this.emissionState.burstWaveIndex = 0;
        this.emissionState.burstWaves = undefined;
        this.emissionState.time = 0;
        this.emissionState.waitEmiting = 0;
        // Forget where the emitter was: a restarted (or pooled and moved) system must not spawn
        // emission-over-distance particles along the jump from its previous position.
        this.emissionState.travelDistance = 0;
        this.emissionState.previousWorldPos = undefined;
        this.emissionState.burstParticleIndex = 0;
        this.emissionState.burstParticleCount = 0;
        // Bursts edited in place since the last play are put back in time order and in range.
        this.emissionBursts.forEach((burst) => Object.assign(burst, normalizeBurst(burst)));
        this.emissionBursts.sort((a, b) => a.time - b.time);
        this.behaviors.forEach((behavior) => behavior.reset());
        // A sweeping shape (Loop, PingPong) starts its arc over, so the replay is the same.
        this.emitterShape.reset?.();
        this.emitEnded = false;
        this.finishedEventFired = false;
        this.stopActionPending = false;
        this.prewarmed = false;
        this.initSystemGenerators();
        this.previousEmitterPos = undefined;
        this.previousEmitterMatrix = undefined;
        this.emitterVelocity.set(0, 0, 0);
    }

    private firstTimeUpdate = true;

    /**
     * Advances the system by `delta` seconds of host time.
     *
     * `stepDeadline` is a `performance.now()` time after which no further
     * catch-up step of this frame is run: a frame long enough to need several
     * steps gets at least one, and the time the rest would have covered is
     * dropped rather than carried, so one slow frame does not grow the next.
     * `catchUpDeadline` bounds the steps a `'pauseAndCatchUp'` system runs on
     * coming back into view; unset, the system allows itself
     * {@link catchUpBudgetMs}. The renderer supplies both from its budgets.
     * @internal
     */
    update(delta: number, stepDeadline = Infinity, catchUpDeadline?: number) {
        if (this.paused || this.destroyed) return;
        const speed = this.playbackSpeed * this.timeDilationValue;
        delta = SimulationClock.frameSeconds(delta, speed);

        if (this.culled) {
            // Out of every camera's view. A paused system holds its particles
            // where they are; a catching-up one also remembers the time it missed.
            if (this.cullingMode === 'pauseAndCatchUp') {
                this.clock.deferCatchUp(delta);
            }
            // Where the emitter goes while out of view is not motion to spread the frame of its
            // return over: that frame starts from wherever it is then.
            this.previousEmitterMatrix = undefined;
            return;
        }
        if (this.clock.owesCatchUp) {
            this.catchUp(catchUpDeadline ?? performance.now() + ParticleSystem.catchUpBudgetMs);
            if (this.paused || this.destroyed) return;
            // The caught-up steps ran where the emitter is now; so does this frame.
            (this.previousEmitterMatrix ??= new Matrix4()).copy(this.emitter.matrixWorld);
        }

        if (this.firstTimeUpdate) {
            this.firstTimeUpdate = false;
            this.emitter.computeWorldMatrix(true);
        }

        if (!this.looping && this.finishedEventFired && this.particleNum === 0) {
            // Finished; the stop action may still be waiting for the sub emitters' particles.
            this.applyStopAction();
            if (this.destroyed) return;
            // Still tick the fixed-step clock. A sub-emitter target
            // (onlyUsedByOther) goes empty between parent bursts; skipping the
            // accumulator here desyncs it from the parent, so the next particles
            // the parent emits into it sit at age 0 / startColor until the phase
            // catches up — white flashes scattered wherever the parent was.
            this.clock.accrue(delta, speed);
            return;
        }

        if (this.looping && this.prewarm && !this.prewarmed) {
            this.runPrewarm();
            if (this.paused || this.destroyed) return;
        }

        if (this.neededToUpdateRender) {
            if (this._renderer) this._renderer.updateSystem(this);
            this.neededToUpdateRender = false;
        }

        const emitterElements = this.emitter.matrixWorld.elements;
        this.tempEmitterPos.set(emitterElements[12], emitterElements[13], emitterElements[14]);
        if (this.previousEmitterPos !== undefined && delta > 0) {
            this.emitterVelocity.copy(this.tempEmitterPos).sub(this.previousEmitterPos).divideScalar(delta);
        }
        (this.previousEmitterPos ??= new Vector3()).copy(this.tempEmitterPos);

        // Start delay holds back emission once per play/restart (ignored with
        // prewarm, matching Unity). The clock carries the remainder of the
        // frame that ends it, so a large frame does not lose time.
        if (this.clock.delaying && !(this.prewarm && this.looping)) {
            delta = this.clock.consumeStartDelay(delta);
            if (delta === 0) return;
        }

        const stepsToRun = this.clock.accrue(delta, speed);
        if (stepsToRun === 0) return;
        // A frame that runs several steps hands each of them the emitter where it was that far
        // along the frame, between the matrix of the last simulated step and the current one
        // (position, rotation and scale apart, as Niagara's interpolated spawning does): spawns
        // land along the emitter's path and world-space trail samples follow it, instead of all
        // sitting at the frame's end. A single step, the first frame after play, restart, a
        // catch-up or a spell out of view, and a still emitter use the current matrix as it is.
        // A node disabled and moved while disabled is not seen here; place it with `restart()`.
        const current = this.emitter.matrixWorld;
        const previous = this.previousEmitterMatrix;
        const interpolate = stepsToRun > 1 && previous !== undefined && !previous.equals(current);
        if (interpolate) {
            previous.decompose(fromPosition, fromRotation, fromScale);
            current.decompose(toPosition, toRotation, toScale);
        }
        let stepped = current;
        for (let i = 0; i < stepsToRun; i++) {
            // The last step takes the current matrix itself, shear and all: decompose/compose
            // only approximates a sheared matrix, and the step a still emitter's frame ends on
            // must match a single-step frame exactly.
            if (interpolate && i + 1 < stepsToRun) {
                const t = (i + 1) / stepsToRun;
                stepPosition.copy(fromPosition).lerp(toPosition, t);
                stepRotation.copy(fromRotation).slerp(toRotation, t);
                stepScale.copy(fromScale).lerp(toScale, t);
                stepped = this.stepMatrix.compose(stepPosition, stepRotation, stepScale);
            } else {
                stepped = current;
            }
            this.simulateStep(SIMULATION_STEP, stepped);
            // A listener (finished, particleDied) may have stopped, paused or disposed the system
            // mid-frame; the remaining steps would emit into a stopped system.
            if (this.paused || this.destroyed) break;
            if (stepDeadline !== Infinity && i + 1 < stepsToRun && performance.now() >= stepDeadline) {
                // Over the frame's simulation budget: the remaining steps' time
                // was taken off the clock without being simulated.
                break;
            }
        }
        if (!this.destroyed) {
            (this.previousEmitterMatrix ??= new Matrix4()).copy(stepped);
        }
    }

    /** Runs the steps a system missed while culled, as many as fit before `deadline`. */
    private catchUp(deadline: number): void {
        let steps = this.clock.takeCatchUpSteps();
        while (steps-- > 0) {
            this.simulateStep(SIMULATION_STEP);
            if (this.paused || this.destroyed) break;
            if (steps > 0 && performance.now() >= deadline) {
                break;
            }
        }
    }

    /**
     * Counts the bursts, and the waves of the one in progress, due before `time` seconds into the
     * cycle as fired, so a jump of the emission clock does not fire them late. The waves are
     * counted with the arithmetic the emission uses, so none is lost to rounding.
     */
    private markBurstsBefore(time: number): void {
        const state = this.emissionState;
        const bursts = this.emissionBursts;
        const waves = (state.burstWaves ??= []);
        while (state.burstIndex < bursts.length && bursts[state.burstIndex].time < time) {
            const burst = bursts[state.burstIndex];
            const cycles = burstWaveCount(burst);
            const interval = burstInterval(burst);
            let wave = 0;
            if (interval > 0) {
                while (wave < cycles && burst.time + wave * interval < time) {
                    wave++;
                }
            } else {
                wave = cycles;
            }
            waves[state.burstIndex] = wave;
            state.burstIndex++;
        }
    }

    /**
     * Simulates the end of a cycle before the first frame, on the fixed step directly: no frame
     * clamp, culling or emitter velocity in the way. The cycle's last {@link prewarmTime} seconds
     * (the whole cycle when that is 0), and at most {@link maxPrewarmSeconds}, with the bursts
     * before that counted as fired.
     */
    private runPrewarm(): void {
        this.prewarmed = true;
        const wanted = this.prewarmTime > 0 ? this.prewarmTime : this.duration;
        const warm = Math.min(this.duration, wanted, Math.max(0, ParticleSystem.maxPrewarmSeconds));
        const steps = Math.round(warm / SIMULATION_STEP);
        if (warm < this.duration) {
            const state = this.emissionState;
            state.time = this.duration - steps * SIMULATION_STEP;
            // The waves due before the warm-up count as fired, so the first step does not fire
            // them late; the waves inside it still fire as the time comes.
            this.markBurstsBefore(state.time);
        }
        for (let i = 0; i < steps; i++) {
            this.simulateStep(SIMULATION_STEP);
            if (this.paused || this.destroyed) return;
        }
    }

    /**
     * World-space axis-aligned bounds of everything this system draws, padded
     * for particle size, into `min` and `max`. False when the system has no
     * particles, or none have been measured yet; the caller should then treat
     * it as visible. Measured in full every few simulated steps and carried,
     * padded for the motion since, in between: conservative, and at most a
     * frame behind the display.
     */
    getWorldBounds(min: Vector3Like, max: Vector3Like): boolean {
        if (!this.bounds.toWorld(min, max, this.emitter)) {
            return false;
        }
        if (this.rendererSettings.renderMode === RenderMode.Beam) {
            // The quads reach the beam's end, which moves on its own. Without
            // one a beam draws nothing beyond its particles.
            const end = this.beamEndScratch;
            if (!this.getBeamEnd(end)) {
                return true;
            }
            const pad = this.bounds.worldPadding(this.emitter);
            min.x = Math.min(min.x, end.x - pad);
            min.y = Math.min(min.y, end.y - pad);
            min.z = Math.min(min.z, end.z - pad);
            max.x = Math.max(max.x, end.x + pad);
            max.y = Math.max(max.y, end.y + pad);
            max.z = Math.max(max.z, end.z + pad);
        }
        return true;
    }

    /**
     * Where a {@link RenderMode.Beam} system's quads end, see {@link BeamEnd}.
     * Unset (the default), a beam has no length and draws nothing. Not saved
     * in the effect JSON: it is where this instance is aimed at runtime. Copied by
     * {@link clone}: a point as a copy, a node as the same node.
     */
    beamEnd?: BeamEnd;

    /**
     * Multiplies every particle's colour, alpha included, as it is drawn:
     * a colour or a fade driven from code for this instance (Unity's custom
     * per-instance data, Unreal's user parameters). With {@link erosion},
     * alpha is the erosion level, so this wipes the shape in and out. The
     * particles' own colours are untouched, so clearing it restores them, and
     * systems with different tints still batch together. Its alpha fades the
     * particles in every blend mode that blends by coverage (see
     * {@link blendCategory}). Unset (the default): none.
     * Not saved in the effect JSON; copied by {@link clone}.
     * Set it from any `Color4Like`, such as a Babylon `Color4`; the value is copied, so later
     * edits to the object passed in do not reach the system until it is set again.
     */
    get tint(): Color4Like | undefined {
        return this._tint;
    }

    set tint(value: Color4Like | undefined) {
        this._tint = value === undefined ? undefined : {r: value.r, g: value.g, b: value.b, a: value.a};
    }

    private _tint?: Color4Like;

    private readonly beamEndScratch = new Vector3();

    /** The world position of {@link beamEnd} into `out`; false when it is unset. */
    getBeamEnd(out: Vector3Like): boolean {
        const end = this.beamEnd;
        if (end === undefined) {
            return false;
        }
        const node = end as {getAbsolutePosition?: () => {x: number; y: number; z: number}};
        if (typeof node.getAbsolutePosition === 'function') {
            const position = node.getAbsolutePosition();
            out.x = position.x;
            out.y = position.y;
            out.z = position.z;
        } else {
            // Any point: quarks' Vector3, or a Babylon one passed from plain JavaScript.
            const point = end as {x: number; y: number; z: number};
            out.x = point.x;
            out.y = point.y;
            out.z = point.z;
        }
        return true;
    }

    /**
     * Records bounds a renderer measured in world space, for systems whose
     * drawn extent the store does not hold (trail ribbons).
     * @internal
     */
    setWorldBounds(
        minX: number,
        minY: number,
        minZ: number,
        maxX: number,
        maxY: number,
        maxZ: number,
        padding: number
    ) {
        this.bounds.setWorld(minX, minY, minZ, maxX, maxY, maxZ, padding);
    }

    /** Length of one simulation step, in seconds. See {@link simulationResidual}. */
    get simulationStep(): number {
        return SIMULATION_STEP;
    }

    /**
     * Time the display is ahead of (positive) or still ahead of the simulation
     * (negative: the simulation ran a hair early), in seconds; 0 while paused.
     * Its magnitude never exceeds one step.
     *
     * The simulation runs on a fixed 1/60 step so that emission and lifetimes
     * stay in phase; without it a slow emitter flickers when the frame rate
     * wobbles. But frames do not arrive on that grid: a display running at
     * anything other than exactly 60 Hz leaves some frames with no step at all
     * (half of them at 120 Hz, three in five at 144 Hz) and others with two, so
     * the particles would be drawn stuttering even while the frame rate is
     * perfect. Renderers close the gap by advancing what they draw along each
     * particle's velocity by this much. That reproduces the straight-line part
     * of the motion exactly, the same term the next step would integrate, so
     * the simulation stays fixed-step while the picture moves continuously.
     */
    get simulationResidual(): number {
        return this.paused ? 0 : this.clock.residual;
    }

    /**
     * Advances emission, behaviors, motion and culling by one fixed timestep, on the system's own
     * random generator when it has a {@link seed}, with the emitter at `emitterMatrix`: the
     * current one, unless a frame interpolates (see {@link update}).
     */
    private simulateStep(delta: number, emitterMatrix: Matrix4 = this.emitter.matrixWorld): void {
        const rng = this.rng;
        if (rng === undefined) {
            this.stepOnce(delta, emitterMatrix);
            return;
        }
        const previous = setRandomSource(rng);
        try {
            this.stepOnce(delta, emitterMatrix);
        } finally {
            setRandomSource(previous);
        }
    }

    private stepOnce(delta: number, emitterMatrix: Matrix4): void {
        if (this.destroyed) return;
        this.spawner.fitRing();
        this.motionScale = this.measureMotionScale(emitterMatrix);
        if (!this.onlyUsedByOther) {
            this.emission.emit(delta, this.emissionState, emitterMatrix);
        }

        const particles = this.particles;
        const behaviors = this.behaviors;
        const particleCount = this.particleNum;
        const store = this.store;
        const renderMode = this.rendererSettings.renderMode;
        const isTrailMode = renderMode === RenderMode.Trail;

        // Taken after emission on purpose: a particle born this step then starts from where it
        // was born rather than from whatever the row held before, and so is drawn at the emitter
        // instead of jumping.
        const steps = this.behaviorPlan.steps(behaviors);
        const snapshotSize = this.behaviorPlan.changesSize;
        const snapshotColor = this.behaviorPlan.changesColor;
        snapshotPreviousState(
            store,
            particleCount,
            snapshotSize,
            snapshotColor,
            renderMode === RenderMode.StretchedBillBoard,
            this.rebindParticles
        );

        this.emitterShape.update(this, delta);
        runBehaviorSteps(steps, behaviors, particles, particleCount, delta, store);

        const onDied = this.events.has('particleDied') ? this.fireParticleDied : undefined;
        // Read again: a behavior (a sub emitter aimed at this system) may have spawned more.
        let liveParticleCount = this.particleNum;
        if (!isTrailMode) {
            liveParticleCount = integrateSprites(
                delta,
                particles,
                store,
                liveParticleCount,
                snapshotSize,
                snapshotColor,
                this.bounds,
                this,
                onDied,
                this.ringBufferStep()
            );
        } else {
            // Trails: the newborn collapse, then motion, then the trail history,
            // then removal, each over the particle objects the history lives on.
            const trailSettings = this.rendererEmitterSettings as TrailSettings;
            collapseTrailNewborns(store, particleCount, snapshotSize, snapshotColor);
            moveTrails(delta, particles, store, particleCount, Boolean(trailSettings.followLocalOrigin), emitterMatrix);
            recordTrailHistory(particles, particleCount, trailSettings, this.worldSpace, emitterMatrix);
            liveParticleCount = removeDeadTrails(particles, store, liveParticleCount, onDied);
        }
        // A particleDied listener may have disposed the system, which drops every particle.
        this.liveCount = this.destroyed ? 0 : liveParticleCount;
        this.notifyFinished();
    }

    /** Whether a sub emitter of this system still has an emission running into its target. */
    private hasPendingSubEmission(): boolean {
        for (const behavior of this.behaviors) {
            if (behavior instanceof EmitSubParticleSystem && behavior.hasPendingEmission()) {
                return true;
            }
        }
        return false;
    }

    /**
     * Whether the system still has particles or emission to come (Unity's `IsAlive`): not
     * {@link isFinished}, or, with `withSubEmitters` (the default), any system it emits into
     * through an `EmitSubParticleSystem`, and theirs, still has particles.
     */
    isAlive(withSubEmitters = true): boolean {
        if (!this.isFinished()) {
            return true;
        }
        return withSubEmitters && this.subEmittersAlive(new Set<ParticleSystem>([this]));
    }

    /** Whether a system this one emits into has particles, or one of theirs; `seen` stops a cycle. */
    private subEmittersAlive(seen: Set<ParticleSystem>): boolean {
        for (const behavior of this.behaviors) {
            if (!(behavior instanceof EmitSubParticleSystem)) {
                continue;
            }
            const target = behavior.targetSystem;
            if (!(target instanceof ParticleSystem) || seen.has(target)) {
                continue;
            }
            seen.add(target);
            if (target.particleNum > 0 || target.hasPendingSubEmission() || target.subEmittersAlive(seen)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Whether particles outlive their lifetime, held or looped until replaced: a {@link ringBufferMode}
     * on a system with {@link maxParticles}, outside the Trail render mode.
     */
    get ringBufferActive(): boolean {
        return (
            this.ringBufferMode !== 'disabled' &&
            this.maxParticles !== undefined &&
            this.rendererSettings.renderMode !== RenderMode.Trail
        );
    }

    /** Re-points every particle at the store, for {@link snapshotPreviousState}. */
    private readonly rebindParticles = (): void => this.spawner.rebind();

    /** The one `particleDied` event, filled in for each death so a death allocates nothing. */
    private readonly particleDiedEvent: ParticleSystemEvent = {type: 'particleDied', particleSystem: this};

    /** Fires `particleDied` for a particle the step retired. */
    private readonly fireParticleDied = (particle: Particle): void => {
        const event = this.particleDiedEvent;
        event.particle = particle;
        this.events.fire(event);
        event.particle = undefined;
    };

    /** The ring buffer step for {@link integrateSprites}, or undefined when particles die by age. */
    private ringBufferStep(): RingBufferStep | undefined {
        if (!this.ringBufferActive) {
            return undefined;
        }
        const step = this.ringStep;
        step.pause = this.ringBufferMode === 'pauseUntilReplaced';
        // Read through the same clamp as the constructor: the field can be assigned anything.
        const {x, y} = this.ringBufferLoopRange;
        const start = Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;
        const end = Number.isFinite(y) ? Math.min(1, Math.max(0, y)) : 1;
        step.loopStart = Math.min(start, end);
        step.loopEnd = Math.max(start, end);
        return step;
    }

    private readonly ringStep: RingBufferStep = {pause: true, loopStart: 0, loopEnd: 1};

    /** Set on each finish until the {@link stopAction} has run, which waits for the sub emitters. */
    private stopActionPending = false;

    private notifyFinished(): void {
        if (!this.isFinished()) {
            return;
        }
        if (!this.finishedEventFired) {
            this.finishedEventFired = true;
            // Once per finish, so an emitter enabled again from a listener or later stays enabled.
            this.stopActionPending = true;
            this.events.fire({type: 'finished', particleSystem: this});
        }
        this.applyStopAction();
    }

    /** Runs a pending {@link stopAction} once no system this one emits into has particles left. */
    private applyStopAction(): void {
        if (!this.stopActionPending) {
            return;
        }
        if (this.stopAction === 'none' || this.ignoreStopAction || this.onlyUsedByOther || this.destroyed) {
            this.stopActionPending = false;
            return;
        }
        if (this.subEmittersAlive(new Set<ParticleSystem>([this]))) {
            return;
        }
        this.stopActionPending = false;
        if (this.stopAction === 'disable') {
            this.emitter.setEnabled(false);
        } else {
            this.dispose();
        }
    }

    /**
     * Spawns what this step's emission calls for. Called by the simulation step, and by
     * `EmitSubParticleSystem` on a sub emitter target with the parent particle's state and matrix.
     */
    emit(delta: number, emissionState: EmissionState, emitterMatrix: Matrix4): void {
        this.emission.emit(delta, emissionState, emitterMatrix);
    }

    /**
     * Writes this system's settings. Its geometry, material and textures go into `metaData` as
     * entries the result names by uuid; give the same `metaData` to every system of a document so
     * shared ones are written once. The material entry holds live Babylon objects, so to write a
     * file use `serializeEffect`, which turns them into plain data. Runtime-only state
     * (`tint`, `beamEnd`, the playing time) is not written.
     */
    toJSON(metaData?: BabylonMetaData | string): ParticleSystemJSONParameters {
        return particleSystemToJSON(this, metaData);
    }

    /**
     * Builds a system from {@link toJSON} output, resolving its geometry, material and texture
     * uuids through `meta`. A setting the file leaves out takes the constructor's default; an
     * unknown shape, behavior or curve type warns and takes its default. Sub emitter targets stay
     * uuids until `QuarksLoader` links them.
     */
    static fromJSON(json: ParticleSystemJSONParameters, meta: BabylonMetaData, scene?: Scene): ParticleSystem {
        const ps = new ParticleSystem(particleSystemParametersFromJSON(json, meta, scene));
        ps.behaviors = (json.behaviors ?? [])
            .map((behaviorJson, index) => {
                return readFormatPart(`behaviors[${index}]`, () => BehaviorFromJSON(behaviorJson, ps));
            })
            .filter((behavior) => behavior !== null) as Behavior[];
        return ps;
    }

    /** Appends a behavior to {@link behaviors}; it runs on existing particles from the next step. */
    addBehavior(behavior: Behavior): void {
        this.behaviors.push(behavior);
        // A sub emitter added here changes which system has to update first.
        this._renderer?._invalidateUpdateOrder();
    }

    /**
     * The settings the renderer batches this system on. Prefer the system's setters, which move it
     * to a matching batch; after changing a field here directly, set {@link neededToUpdateRender}.
     */
    getRendererSettings(): VFXBatchSettings {
        return this.rendererSettings;
    }

    /**
     * Calls `callback` on each `event`: `'emitEnd'` when emission ends, `'finished'` when the last
     * particle of an ended system dies, `'particleDied'` per particle (with `event.particle`), and
     * `'destroy'` on dispose.
     *
     * A `'particleDied'` event and the particle on it are reused: read what you need inside the
     * callback and keep neither, since the particle's slot goes to the next one spawned. In trail
     * mode a particle dies when its trail is gone, so with a trail lifetime the event comes after
     * the head stopped, once the last sample has faded.
     *
     * A callback added or removed while an event is firing takes effect from the next event; the
     * callbacks of the one firing are all called.
     */
    addEventListener(event: ParticleSystemEventType, callback: (event: ParticleSystemEvent) => void): void {
        this.events.add(event, callback);
    }

    /** Removes every callback registered for `event`, or every callback of every event when it is left out. */
    removeAllEventListeners(event?: ParticleSystemEventType): void {
        this.events.removeAll(event);
    }

    /** Removes one callback added with {@link addEventListener}. */
    removeEventListener(event: ParticleSystemEventType, callback: (event: ParticleSystemEvent) => void): void {
        this.events.remove(event, callback);
    }

    /**
     * A new system with the same settings, behaviors and generators (copied, so the two roll
     * independently), on a new emitter node with no parent. It shares the texture, material and
     * geometry. It is not added to a renderer: call `renderer.addSystem` on it, or use
     * `QuarksUtil.instantiate` to copy a whole effect tree.
     */
    clone(): ParticleSystem {
        const newBehaviors: Array<Behavior> = this.behaviors.map((b) => b.clone());
        let rendererEmitterSettings: RendererEmitterSettings;

        if (this.renderMode === RenderMode.Trail) {
            const settings = this.rendererEmitterSettings as TrailSettings;
            rendererEmitterSettings = {
                startLength: settings.startLength.clone(),
                followLocalOrigin: Boolean(settings.followLocalOrigin),
                ...trailFlags(settings),
                ...trailCurve(settings),
                ...trailSampling(settings),
                ...(settings.sideAxis
                    ? {sideAxis: {x: settings.sideAxis.x, y: settings.sideAxis.y, z: settings.sideAxis.z}}
                    : {}),
            };
        } else if (this.renderMode === RenderMode.StretchedBillBoard) {
            rendererEmitterSettings = {
                lengthFactor: (this.rendererEmitterSettings as StretchedBillBoardSettings).lengthFactor,
                speedFactor: (this.rendererEmitterSettings as StretchedBillBoardSettings).speedFactor,
            };
        } else {
            rendererEmitterSettings = {};
        }

        const copy = new ParticleSystem({
            ...settingsForClone(this),
            shape: this.emitterShape.clone(),
            instancingGeometry: this.rendererSettings.instancingGeometry,
            instancingIndices: this.rendererSettings.instancingIndices,
            instancingUVs: this.rendererSettings.instancingUVs,
            instancingUVs2: this.rendererSettings.instancingUVs2,
            instancingNormals: this.rendererSettings.instancingNormals,
            rendererEmitterSettings,
            material: this.materialRef,
            texture: this.rendererSettings.texture,
            behaviors: newBehaviors,
            lighting: this.lighting,
            rim: this.rim,
            mapUV: this.mapUV,
            gradientMap: this.gradientMap,
            erosion: this.erosion,
            uvDistortion: this.uvDistortion,
            scene: this.emitter.getScene(),
        });
        // A sub emitter behavior transforms by its parent system's emitter;
        // the cloned behaviors still pointed at this one.
        for (const behavior of newBehaviors) {
            if (behavior instanceof EmitSubParticleSystem) {
                behavior.particleSystem = copy;
            }
        }
        if (this.tint) {
            copy.tint = this.tint;
        }
        copy.emissionMultiplier = this.emissionMultiplier;
        const beamEnd = this.beamEnd;
        if (beamEnd) {
            // A node the beam follows stays the same node. A point is copied by value: a Babylon
            // Vector3 keeps x/y/z behind getters, which a spread would drop.
            copy.beamEnd =
                typeof (beamEnd as {getAbsolutePosition?: unknown}).getAbsolutePosition === 'function'
                    ? beamEnd
                    : {x: (beamEnd as Vector3).x, y: (beamEnd as Vector3).y, z: (beamEnd as Vector3).z};
        }
        return copy;
    }
}

/** Whether every index points at one of `vertexCount` vertices. */
function indicesFit(indices: Uint32Array | Uint16Array, vertexCount: number): boolean {
    for (let i = 0; i < indices.length; i++) {
        if (indices[i] >= vertexCount) {
            return false;
        }
    }
    return true;
}
