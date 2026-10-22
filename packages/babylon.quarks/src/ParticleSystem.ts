import {Constants} from '@babylonjs/core/Engines/constants';
import {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Scene} from '@babylonjs/core/scene';
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
    GeneratorMemory,
    IParticleSystem,
    Matrix3,
    Matrix4,
    Particle,
    ParticleStore,
    ParticleSystemEvent,
    ParticleSystemEventType,
    PiecewiseBezier,
    Quaternion,
    random,
    RandomSource,
    RendererEmitterSettings,
    RotationGenerator,
    SerializationOptions,
    setRandomSource,
    SphereEmitter,
    SpriteParticle,
    StretchedBillBoardSettings,
    SubEmitterInheritMask,
    TrailParticle,
    TrailSettings,
    ValueGenerator,
    Vector2,
    Vector3,
    Vector3Generator,
    Vector4,
} from 'quarks.core';
import {BatchedRenderer, VFXBatchSettings} from './BatchedRenderer';
import {ensureEnvAtlasFromCube, getCachedEnvAtlas} from './envAtlas';
import {disposeEmitterForSystem, ParticleEmitter} from './ParticleEmitter';
import {BehaviorPlan} from './system/BehaviorPlan';
import {BoundsTracker} from './system/BoundsTracker';
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
import {liveAtlas, MaterialOverrides, resolveMaterialSettings} from './system/materialResolve';
import {
    nonZeroFlip,
    nonZeroPivot,
    validCullingMode,
    validLighting,
    validMaxParticles,
    validSortMode,
} from './system/normalize';
import {particleSystemParametersFromJSON, particleSystemToJSON, trailCurve, trailFlags} from './system/serialization';
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
    ScalingMode,
} from './system/types';

export type {
    BabylonMetaData,
    BeamEnd,
    BurstParameters,
    BurstParametersJSON,
    CullingMode,
    ParticleSystemJSONParameters,
    ParticleSystemParameters,
    ScalingMode,
} from './system/types';

/** Particle backed by a {@link ParticleStore} row, as this system always creates. */
type StoreBackedParticle = Particle & {storeIndex: number; setStoreIndex(index: number): void};

const UP = new Vector3(0, 0, 1);
const tempQ = new Quaternion();
const IDENTITY_QUATERNION = new Quaternion();
const tempV = new Vector3();
const tempV2 = new Vector3();
/** Points sampled over the rest of the cycle when a non-Bezier rate curve is 0 now, to see if it rises later. */
const RATE_LOOKAHEAD_SAMPLES = 64;

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
    /** Dispose the system, its emitter and its batch slot when it finishes. Default false. */
    autoDestroy: boolean;
    /**
     * Start a looping system as if it had already run one full cycle (Unity's Prewarm), so a fire
     * or a mist is full from its first frame. Default false.
     */
    prewarm: boolean;
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
     * Undefined: nothing is mirrored. Meshes ignore it.
     */
    flip?: Vector2;
    /** Particles emitted per second, read over the system's time. Default 10. */
    emissionOverTime: ValueGenerator | FunctionValueGenerator;
    /** Particles emitted per world unit the emitter moves (Unity's Rate over Distance). Default 0. */
    emissionOverDistance: ValueGenerator | FunctionValueGenerator;
    /** Bursts of particles at set times in each cycle. Default none. */
    emissionBursts: Array<BurstParameters>;
    /**
     * Most particles alive at once (Unity's Max Particles); emission past it is dropped. Undefined
     * means no limit, as does a negative or NaN count given to the constructor; a fraction is
     * rounded down.
     */
    maxParticles?: number;
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
    /** How many of {@link particles} are alive. Read only. */
    particleNum: number;
    /** Set by {@link pause}: the renderer skips the system's simulation while true. */
    paused: boolean;
    /** The particle pool; the first {@link particleNum} are alive. Read only. */
    particles: Array<Particle>;
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
    emissionState: EmissionState;
    /** The emitter's velocity over the last step, which `InheritVelocity` reads. */
    emitterVelocity: Vector3 = new Vector3();

    private prewarmed: boolean;
    private emitEnded: boolean;
    private finishedEventFired = false;
    /** The fixed-step clock: whole steps per frame, start delay and catch-up time. */
    private readonly clock = new SimulationClock();
    private previousEmitterPos?: Vector3;
    private tempEmitterPos: Vector3 = new Vector3();
    private temp: Vector3 = new Vector3();
    /** Emitter matrix moved along the step's path, see spawnAlongPath. */
    private pathMatrix: Matrix4 = new Matrix4();
    private normalMatrix: Matrix3 = new Matrix3();
    private memory: GeneratorMemory = [];
    private readonly events = new EventDispatcher();
    private readonly layerMaskProxy: {mask: number};
    private materialRef: any = null;
    private sceneRef: Scene | undefined;
    private qualityFactor = 1;
    private destroyed = false;
    /** How the behaviors run each step, rebuilt when the list changes. */
    private readonly behaviorPlan = new BehaviorPlan();
    /** @internal **/
    _renderer?: BatchedRenderer;

    /** Seconds into the current emission cycle. Setting it jumps emission; particles alive stay. */
    set time(time: number) {
        this.emissionState.time = time;
    }

    get time(): number {
        return this.emissionState.time;
    }

    /** Whether {@link endEmit} ran, or a non-looping system reached the end of its duration. */
    get isEmitEnded(): boolean {
        return this.emitEnded;
    }

    /** Whether continuous or queued emission can still spawn particles before the system is done. */
    hasPendingEmission(): boolean {
        if (this.emitEnded) {
            return false;
        }
        if (this.looping) {
            return true;
        }
        if (this.onlyUsedByOther) {
            return false;
        }
        const state = this.emissionState;
        if (state.waitEmiting > 0) {
            return true;
        }
        if (state.burstIndex < this.emissionBursts.length) {
            return true;
        }
        if (this.hasPendingBurstWaves(state)) {
            return true;
        }
        if (state.time >= this.duration) {
            return false;
        }
        const timeRatio = state.time / this.duration;
        return this.emitsFrom(this.emissionOverTime, timeRatio) || this.emitsFrom(this.emissionOverDistance, timeRatio);
    }

    /**
     * Whether a rate is above 0 now or anywhere later in the cycle, so a curve that fades in from 0
     * still counts as pending. A Bezier curve is checked exactly from its control points; another
     * kind of curve is sampled, which only runs while the rate is 0.
     */
    private emitsFrom(rate: ValueGenerator | FunctionValueGenerator, timeRatio: number): boolean {
        if (rate.genValue(this.memory, timeRatio) > 0) {
            return true;
        }
        if (rate.type !== 'function') {
            return false;
        }
        if (rate instanceof PiecewiseBezier) {
            // A Bezier stays within its control points, so this is exact however short a pulse.
            for (let i = 0; i < rate.functions.length; i++) {
                if (rate.getEndX(i) > timeRatio && rate.functions[i][0].p.some((value) => value > 0)) {
                    return true;
                }
            }
            return false;
        }
        const samples = RATE_LOOKAHEAD_SAMPLES;
        for (let i = 1; i <= samples; i++) {
            if (rate.genValue(this.memory, timeRatio + ((1 - timeRatio) * i) / samples) > 0) {
                return true;
            }
        }
        return false;
    }

    /**
     * No particles left and nothing left to emit: a non-looping system that
     * ran its course, or a looping one whose emission was ended with
     * {@link endEmit} and whose last particle has died.
     */
    isFinished(): boolean {
        if (this.particleNum > 0) {
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
    get material(): any {
        return this.materialRef;
    }

    set material(material: any) {
        this.materialRef = material;
        this.applyMaterialSettings(material);
    }

    /**
     * Columns of the flipbook in {@link texture} (Unity's Texture Sheet Animation tiles). With
     * {@link vTileCount}, a particle draws one cell, picked by {@link startTileIndex} and
     * `FrameOverLife`. Default 1.
     */
    get uTileCount(): number {
        return this.rendererSettings.uTileCount;
    }

    set uTileCount(u: number) {
        this.rendererSettings.uTileCount = u;
        this.neededToUpdateRender = true;
    }

    /** Rows of the flipbook in {@link texture}, see {@link uTileCount}. Default 1. */
    get vTileCount(): number {
        return this.rendererSettings.vTileCount;
    }

    set vTileCount(v: number) {
        this.rendererSettings.vTileCount = v;
        this.neededToUpdateRender = true;
    }

    /**
     * Cross-fade between a flipbook's cells instead of cutting from one to the next (Unity's
     * Flip-Book Blending). Default false.
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
    get pivot(): Vector3 | undefined {
        return this.rendererSettings.pivot;
    }

    set pivot(v: Vector3 | undefined) {
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

    /**
     * The emitter's world scale per axis, measured with {@link motionScale}
     * before every step; what `'hierarchy'` multiplies start speeds by. Taken
     * from the system's own emitter rather than the emission matrix, whose
     * columns carry a parent particle's velocity for a sub emitter.
     */
    private readonly hierarchyScale = new Vector3(1, 1, 1);

    /** The mean world scale of the emitter for a world-space `'hierarchy'` system, else 1. */
    private measureMotionScale(): number {
        if (this.scalingMode !== 'hierarchy' || !this.worldSpace) {
            this.hierarchyScale.set(1, 1, 1);
            return 1;
        }
        const e = this.emitter.matrixWorld.elements;
        const sx = Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]);
        const sy = Math.sqrt(e[4] * e[4] + e[5] * e[5] + e[6] * e[6]);
        const sz = Math.sqrt(e[8] * e[8] + e[9] * e[9] + e[10] * e[10]);
        this.hierarchyScale.set(sx, sy, sz);
        return (sx + sy + sz) / 3;
    }

    /** Distance in world units in front of the scene at which a soft particle is fully faded out. Default 0. */
    get softNearFade(): number {
        return this.rendererSettings.softNearFade;
    }

    set softNearFade(v: number) {
        this.rendererSettings.softNearFade = v;
        this.neededToUpdateRender = true;
    }

    /** Distance in world units in front of the scene at which a soft particle is fully opaque. Default 0. */
    get softFarFade(): number {
        return this.rendererSettings.softFarFade;
    }

    set softFarFade(v: number) {
        this.rendererSettings.softFarFade = v;
        this.neededToUpdateRender = true;
    }

    /**
     * The mesh particles' positions, three values per vertex.
     * Setting it restarts the system. A new geometry with a different vertex
     * count drops UV sets and normals that no longer fit it: the first UV set
     * falls back to zeros, the second to none, the normals to +Z. Assign {@link instancingUVs} and
     * {@link instancingUVs2} after it.
     */
    get instancingGeometry(): Float32Array {
        return this.rendererSettings.instancingGeometry;
    }

    set instancingGeometry(geometry: Float32Array) {
        this.restart();
        this.particles.length = 0;
        const settings = this.rendererSettings;
        const uvLength = (geometry.length / 3) * 2;
        const previous = settings.instancingGeometry;
        settings.instancingGeometry = geometry;
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
                this.restart();
                this.particles.length = 0;
            }
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
     * Runtime multiplier on how many particles the system emits: bursts,
     * emission over time and over distance alike. Unlike
     * {@link setQualityFactor}, which only ever thins an effect, it may go
     * above 1 to make a stronger version of the same effect. The two multiply.
     * 1 by default; not saved in the effect JSON; copied by {@link clone}.
     */
    emissionMultiplier = 1;

    /** What this system does while off screen, see {@link CullingMode}. `'always'` by default. */
    cullingMode: CullingMode = 'always';

    /** What the emitter's world scale does to a world-space system, see {@link ScalingMode}. `'shape'` by default. */
    scalingMode: ScalingMode = 'shape';

    /**
     * What world-space forces and speed limits are multiplied by this step:
     * the mean of the emitter's world scale axes in `'hierarchy'` mode, 1
     * otherwise. Updated before every simulation step.
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
     *
     * Not covered: randomness outside the step, such as a `TurbulenceField`'s
     * offsets, which are rolled when the behavior is created.
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
            this.memory.length = 0;
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
     * own warm-up time and is not saved with one.
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

        this.autoDestroy = parameters.autoDestroy ?? false;
        this.duration = parameters.duration ?? 1;
        this.startDelay = parameters.startDelay ?? new ConstantValue(0);
        this.looping = parameters.looping ?? true;
        this.prewarm = parameters.prewarm ?? false;
        this.startLife = parameters.startLife ?? new ConstantValue(5);
        this.startSpeed = parameters.startSpeed ?? new ConstantValue(0);
        this.startRotation = parameters.startRotation ?? new ConstantValue(0);
        this.startSize = parameters.startSize ?? new ConstantValue(1);
        this.startColor = parameters.startColor ?? new ConstantColor(new Vector4(1, 1, 1, 1));
        this.emissionOverTime = parameters.emissionOverTime ?? new ConstantValue(10);
        this.emissionOverDistance = parameters.emissionOverDistance ?? new ConstantValue(0);
        this.emissionBursts = parameters.emissionBursts ?? [];
        this.maxParticles = validMaxParticles(parameters.maxParticles);
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
            if (parameters.speedFactor !== undefined) {
                settings.speedFactor = parameters.speedFactor;
            }
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
            uTileCount: parameters.uTileCount ?? 1,
            vTileCount: parameters.vTileCount ?? 1,
            blendTiles: parameters.blendTiles ?? false,
            softParticles: parameters.softParticles ?? false,
            softNearFade: parameters.softNearFade ?? 0,
            softFarFade: parameters.softFarFade ?? 0,
            materialBlendMode: parameters.blendMode ?? Constants.ALPHA_ADD,
            materialTransparent: parameters.transparent ?? true,
            materialDepthTest: parameters.depthTest ?? true,
            materialDepthWrite: parameters.depthWrite ?? false,
            materialAlphaTest: parameters.alphaTest ?? 0,
            texture: parameters.texture ?? null,
            reflectionTexture: null,
            reflectionLevel: 1,
            reflectionFaces: null,
            reflectionAtlas: null,
            layerMask: parameters.layerMask ?? 0x0fffffff,
            pivot: nonZeroPivot(parameters.pivot),
            sortMode: validSortMode(parameters.sortMode),
            minParticleSize: Math.max(0, parameters.minParticleSize ?? 0),
            maxParticleSize: parameters.maxParticleSize ?? Infinity,
            renderingGroupId: parameters.renderingGroupId ?? 0,
            applyFog: parameters.applyFog ?? true,
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
        this.scalingMode = parameters.scalingMode === 'hierarchy' ? 'hierarchy' : 'shape';
        this.alignToDirection = parameters.alignToDirection === true;
        this.seed = parameters.seed;
        if (this.rendererSettings.renderMode === RenderMode.Mesh && !this.rendererSettings.instancingNormals) {
            this.rendererSettings.instancingNormals = fallbackNormalsForPositions(
                this.rendererSettings.instancingGeometry
            );
        }

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
        this.particleNum = 0;
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
    private watchEnvAtlas(atlas: BaseTexture | null, material: any): void {
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

    private applyMaterialSettings(material: any, overrides: MaterialOverrides = {}) {
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
        this.rendererSettings.reflectionFaces = resolved.reflectionFaces;
        this.rendererSettings.materialBlendMode = resolved.blendMode;
        this.rendererSettings.materialTransparent = resolved.transparent;
        this.rendererSettings.materialDepthTest = resolved.depthTest;
        this.rendererSettings.materialDepthWrite = resolved.depthWrite;
        this.rendererSettings.materialAlphaTest = resolved.alphaTest;
        if (overrides.layerMask !== undefined) {
            this.rendererSettings.layerMask = overrides.layerMask;
        }
        this.neededToUpdateRender = true;
    }

    /** Freezes the system where it is: particles stay and nothing is simulated until {@link play}. */
    pause(): void {
        this.paused = true;
    }

    /** Resumes a paused system. */
    play(): void {
        this.paused = false;
    }

    /** Clears every particle, rewinds to the start ({@link restart}) and pauses until {@link play}. */
    stop(): void {
        this.restart();
        this.pause();
    }

    /**
     * Scales how many particles the system emits, from 0.1 to 1 (values outside are clamped), for
     * lower quality settings or a crowded frame; the renderer's adaptive performance sets it. It
     * multiplies with {@link emissionMultiplier}. Default 1.
     */
    setQualityFactor(qualityFactor: number): void {
        this.qualityFactor = Math.max(0.1, Math.min(1, qualityFactor));
    }

    /** Quality factor times {@link emissionMultiplier}: what emission counts are scaled by. */
    private emissionFactor(): number {
        const multiplier = this.emissionMultiplier;
        return multiplier >= 0 ? this.qualityFactor * multiplier : this.qualityFactor;
    }

    /**
     * Appends one particle to the pool, giving it the next row of the store.
     *
     * Growing the store replaces its arrays, so every particle already bound to
     * it has to be re-pointed at the new ones.
     */
    /** Points every particle at the store's columns again, after any were replaced. */
    private rebindParticles(): void {
        const particles = this.particles;
        for (let i = 0; i < particles.length; i++) {
            (particles[i] as SpriteParticle | TrailParticle).rebind();
        }
    }

    private growParticlePool(isTrailMode: boolean): void {
        const index = this.particles.length;
        if (this.store.ensureCapacity(index + 1)) {
            this.rebindParticles();
        }
        this.particles.push(isTrailMode ? new TrailParticle(this.store, index) : new SpriteParticle(this.store, index));
    }

    private spawn(count: number, emissionState: EmissionState, matrix: Matrix4) {
        const translation = tempV;
        const scale = tempV2;
        // decompose writes tempQ, so no separate setFromRotationMatrix is needed.
        matrix.decompose(translation, tempQ, scale);
        const behaviors = this.behaviors;
        const behaviorCount = behaviors.length;
        const renderMode = this.rendererSettings.renderMode;
        const isTrailMode = renderMode === RenderMode.Trail;
        const isSpriteMode = !isTrailMode;
        const isMeshMode = renderMode === RenderMode.Mesh;
        const startRotationIsRotation = this.startRotation.type === 'rotation';
        const startSizeIsVector3 = this.startSize.type === 'vec3function';
        const timeRatio = emissionState.time / this.duration;
        const trailSettings = isTrailMode ? (this.rendererEmitterSettings as TrailSettings) : undefined;
        const followLocalOrigin = Boolean(trailSettings?.followLocalOrigin);
        if (this.maxParticles !== undefined) {
            // Like Unity, a full system skips the particles it has no room for rather than queueing them.
            count = Math.min(count, Math.max(0, this.maxParticles - this.particleNum));
        }

        for (let i = 0; i < count; i++) {
            emissionState.burstParticleIndex = i;
            this.particleNum++;
            if (this.particles.length < this.particleNum) {
                this.growParticlePool(isTrailMode);
            }
            const particle = this.particles[this.particleNum - 1];
            particle.reset();
            particle.serial = (particle.serial ?? 0) + 1;
            particle.speedModifier = 1;
            // Parent EmitSub can refill an onlyUsedByOther system after it had
            // already finished empty; clear the flag so update does not treat it
            // as done while it has live particles again.
            this.finishedEventFired = false;
            this.startColor.startGen(particle.memory);
            this.startColor.genColor(particle.memory, particle.startColor, this.emissionState.time);
            particle.color.copy(particle.startColor);
            this.startSpeed.startGen(particle.memory);
            particle.startSpeed = this.startSpeed.genValue(particle.memory, timeRatio);
            this.startLife.startGen(particle.memory);
            particle.life = this.startLife.genValue(particle.memory, timeRatio);
            particle.age = 0;
            this.startSize.startGen(particle.memory);
            if (startSizeIsVector3) {
                (this.startSize as Vector3Generator).genValue(particle.memory, particle.startSize, timeRatio);
            } else {
                const size = (this.startSize as FunctionValueGenerator).genValue(particle.memory, timeRatio);
                particle.startSize.set(size, size, size);
            }
            this.startTileIndex.startGen(particle.memory);
            particle.uvTile = this.startTileIndex.genValue(particle.memory);
            particle.size.copy(particle.startSize);

            if (isSpriteMode) {
                const sprite = particle as SpriteParticle;
                this.startRotation.startGen(particle.memory);
                if (isMeshMode) {
                    if (!(sprite.rotation instanceof Quaternion)) {
                        // Assigning a quaternion gives the particle a row in the
                        // store's quaternion column; the value is overwritten below.
                        sprite.rotation = IDENTITY_QUATERNION;
                    }
                    // A recycled particle can still carry the turn of whatever
                    // it was last time; the renderer would draw a fraction of it
                    // before any behavior has had a chance to say otherwise.
                    if (sprite.angularVelocity instanceof Quaternion) {
                        sprite.angularVelocity.set(0, 0, 0, 1);
                    }
                    if (startRotationIsRotation) {
                        (this.startRotation as RotationGenerator).genValue(
                            particle.memory,
                            sprite.rotation as Quaternion,
                            1,
                            timeRatio
                        );
                    } else {
                        (sprite.rotation as Quaternion).setFromAxisAngle(
                            UP,
                            (this.startRotation as FunctionValueGenerator).genValue(sprite.memory, timeRatio)
                        );
                    }
                } else {
                    if (startRotationIsRotation) {
                        sprite.rotation = 0;
                    } else {
                        sprite.rotation = (this.startRotation as FunctionValueGenerator).genValue(
                            sprite.memory,
                            timeRatio
                        );
                    }
                    // Set until a turning behavior says otherwise, so the
                    // renderer never carries a recycled particle's old spin.
                    sprite.angularVelocity = 0;
                    const flip = this.flip;
                    sprite.flip = flip === undefined ? 0 : (random() < flip.x ? 1 : 0) | (random() < flip.y ? 2 : 0);
                }
            } else if (trailSettings) {
                const trail = particle as TrailParticle;
                trailSettings.startLength.startGen(trail.memory);
                trail.length = trailSettings.startLength.genValue(trail.memory, timeRatio);
                trail.ensureHistoryCapacity(Math.max(1, Math.ceil(trail.length)));
                trail.resetHistory();
            }

            this.emitterShape.initialize(particle, emissionState);

            if (this.alignToDirection && isSpriteMode) {
                this.alignParticleToDirection(particle as SpriteParticle, isMeshMode);
            }

            const parent = emissionState.particle;
            const inherit = emissionState.inherit;
            if (parent !== undefined && inherit !== undefined && inherit !== 0) {
                this.inheritFromParent(particle, parent, inherit, isSpriteMode);
            }

            if (isTrailMode && followLocalOrigin) {
                const trail = particle as TrailParticle;
                if (!trail.localPosition) {
                    trail.localPosition = new Vector3();
                }
                trail.localPosition.copy(trail.position);
            }

            if (this.worldSpace) {
                particle.position.applyMatrix4(matrix);
                particle.startSize.multiply(scale).abs();
                particle.size.copy(particle.startSize);
                if (this.scalingMode === 'hierarchy') {
                    // Scaled per axis by the emitter's world scale, then turned: the speed scales with it.
                    particle.velocity.multiply(this.hierarchyScale).applyQuaternion(tempQ);
                } else {
                    particle.velocity.multiply(scale).applyMatrix3(this.normalMatrix);
                }
                if (particle.rotation && particle.rotation instanceof Quaternion) {
                    particle.rotation.multiplyQuaternions(tempQ, particle.rotation);
                }
            } else {
                if (this.onlyUsedByOther) {
                    particle.parentMatrix = matrix;
                }
            }

            for (let j = 0; j < behaviorCount; j++) {
                behaviors[j].initialize(particle, this);
            }
            // Every generator has claimed its slot by now; give the compiled
            // behavior passes a column copy of the samples.
            this.store.recordMemory((particle as StoreBackedParticle).storeIndex, particle.memory);
        }
    }

    /** Turns a newborn so that it faces the way its shape sent it; see {@link alignToDirection}. */
    private alignParticleToDirection(sprite: SpriteParticle, isMeshMode: boolean): void {
        const velocity = sprite.velocity;
        const speedSq = velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z;
        if (speedSq === 0) {
            return;
        }
        if (isMeshMode) {
            // +Z along the velocity, with the start rotation applied first.
            const rotation = sprite.rotation as Quaternion;
            tempV.copy(velocity).divideScalar(Math.sqrt(speedSq));
            tempQ.setFromUnitVectors(UP, tempV);
            rotation.multiplyQuaternions(tempQ, rotation);
        } else {
            // The quad's top (its +Y) toward the velocity in the emitter's XY plane.
            if (velocity.x !== 0 || velocity.y !== 0) {
                sprite.rotation = (sprite.rotation as number) + Math.atan2(-velocity.x, velocity.y);
            }
        }
    }

    /** Applies the parent particle's inherited properties to a sub emitted newborn; see `EmitSubParticleSystem.inherit`. */
    private inheritFromParent(particle: Particle, parent: Particle, inherit: number, isSpriteMode: boolean): void {
        if (inherit & SubEmitterInheritMask.color) {
            particle.startColor.multiply(parent.color);
            particle.color.copy(particle.startColor);
        }
        if (inherit & SubEmitterInheritMask.size) {
            particle.startSize.multiply(parent.size);
            particle.size.copy(particle.startSize);
        }
        if (inherit & SubEmitterInheritMask.rotation && isSpriteMode) {
            const sprite = particle as SpriteParticle;
            const parentRotation = parent.rotation;
            if (typeof sprite.rotation === 'number') {
                if (typeof parentRotation === 'number') {
                    sprite.rotation += parentRotation;
                }
            } else if (parentRotation instanceof Quaternion) {
                (sprite.rotation as Quaternion).multiplyQuaternions(parentRotation, sprite.rotation as Quaternion);
            }
        }
        if (inherit & SubEmitterInheritMask.lifetime && parent.life > 0) {
            particle.life *= Math.max(0, 1 - parent.age / parent.life);
        }
    }

    /**
     * Stops emission and lets the particles alive die out (Unity's `Stop` with
     * `StopEmitting`). The system fires `emitEnd`, then `finished` when the last particle has
     * died, and is disposed then if {@link autoDestroy} is set. {@link restart} starts it again.
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
        this.particleNum = 0;
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
            this.emissionBursts.forEach((burst) => burst.count.startGen(this.memory));
            this.emissionOverDistance.startGen(this.memory);
            this.startDelay.startGen(this.memory);
            this.clock.setStartDelay(this.startDelay.genValue(this.memory, 0));
            this.emissionOverTime.startGen(this.memory);
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
        this.memory.length = 0;
        this.paused = false;
        this.particleNum = 0;
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
        this.behaviors.forEach((behavior) => {
            behavior.reset();
            if (behavior instanceof EmitSubParticleSystem) {
                behavior.clearEmissions();
            }
        });
        this.emitEnded = false;
        this.finishedEventFired = false;
        this.prewarmed = false;
        this.initSystemGenerators();
        this.previousEmitterPos = undefined;
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
        const speed = this.playbackSpeed;
        delta = SimulationClock.frameSeconds(delta, speed);

        if (this.culled) {
            // Out of every camera's view. A paused system holds its particles
            // where they are; a catching-up one also remembers the time it missed.
            if (this.cullingMode === 'pauseAndCatchUp') {
                this.clock.deferCatchUp(delta);
            }
            return;
        }
        if (this.clock.owesCatchUp) {
            this.catchUp(catchUpDeadline ?? performance.now() + ParticleSystem.catchUpBudgetMs);
            if (this.paused || this.destroyed) return;
        }

        if (this.firstTimeUpdate) {
            this.firstTimeUpdate = false;
            this.emitter.computeWorldMatrix(true);
        }

        if (!this.looping && this.finishedEventFired && this.particleNum === 0) {
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
        for (let i = 0; i < stepsToRun; i++) {
            this.simulateStep(SIMULATION_STEP);
            // A listener (finished, particleDied) may have stopped, paused or disposed the system
            // mid-frame; the remaining steps would emit into a stopped system.
            if (this.paused || this.destroyed) break;
            if (stepDeadline !== Infinity && i + 1 < stepsToRun && performance.now() >= stepDeadline) {
                // Over the frame's simulation budget: the remaining steps' time
                // was taken off the clock without being simulated.
                break;
            }
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
     * Simulates the end of a cycle before the first frame, on the fixed step directly: no frame
     * clamp, culling or emitter velocity in the way. A cycle longer than {@link maxPrewarmSeconds}
     * is warmed up over its last part only, with the bursts before that skipped.
     */
    private runPrewarm(): void {
        this.prewarmed = true;
        const warm = Math.min(this.duration, Math.max(0, ParticleSystem.maxPrewarmSeconds));
        const steps = Math.round(warm / SIMULATION_STEP);
        if (warm < this.duration) {
            const state = this.emissionState;
            state.time = this.duration - steps * SIMULATION_STEP;
            const bursts = this.emissionBursts;
            const waves = (state.burstWaves ??= []);
            while (state.burstIndex < bursts.length && bursts[state.burstIndex].time < state.time) {
                // The waves due before the warm-up count as fired, so the first step does not fire
                // them late; the waves inside it still fire as the time comes.
                const burst = bursts[state.burstIndex];
                const cycles = ParticleSystem.burstWaveCount(burst);
                const interval = ParticleSystem.burstInterval(burst);
                waves[state.burstIndex] =
                    interval > 0 ? Math.min(cycles, Math.ceil((state.time - burst.time) / interval)) : cycles;
                state.burstIndex++;
            }
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
    getWorldBounds(min: Vector3, max: Vector3): boolean {
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
            min.set(Math.min(min.x, end.x - pad), Math.min(min.y, end.y - pad), Math.min(min.z, end.z - pad));
            max.set(Math.max(max.x, end.x + pad), Math.max(max.y, end.y + pad), Math.max(max.z, end.z + pad));
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
     * systems with different tints still batch together. Under additive
     * (`ALPHA_ONEONE`) or premultiplied blending, which ignore alpha, fade
     * with the colour instead, or with erosion on. Unset (the default): none.
     * Not saved in the effect JSON; copied by {@link clone}.
     */
    tint?: Vector4;

    private readonly beamEndScratch = new Vector3();

    /** The world position of {@link beamEnd} into `out`; false when it is unset. */
    getBeamEnd(out: Vector3): boolean {
        const end = this.beamEnd;
        if (end === undefined) {
            return false;
        }
        const node = end as {getAbsolutePosition?: () => {x: number; y: number; z: number}};
        if (typeof node.getAbsolutePosition === 'function') {
            const position = node.getAbsolutePosition();
            out.set(position.x, position.y, position.z);
        } else {
            // Any point: quarks' Vector3, or a Babylon one passed from plain JavaScript.
            const point = end as {x: number; y: number; z: number};
            out.set(point.x, point.y, point.z);
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
     * Advances emission, behaviors, motion and culling by one fixed timestep,
     * on the system's own random generator when it has a {@link seed}.
     */
    private simulateStep(delta: number): void {
        const rng = this.rng;
        if (rng === undefined) {
            this.stepOnce(delta);
            return;
        }
        const previous = setRandomSource(rng);
        try {
            this.stepOnce(delta);
        } finally {
            setRandomSource(previous);
        }
    }

    private stepOnce(delta: number): void {
        if (this.destroyed) return;
        this.motionScale = this.measureMotionScale();
        if (!this.onlyUsedByOther) {
            this.emit(delta, this.emissionState, this.emitter.matrixWorld);
        }

        const particles = this.particles;
        const behaviors = this.behaviors;
        const particleCount = this.particleNum;
        const isTrailMode = this.rendererSettings.renderMode === RenderMode.Trail;
        // Only stretched billboards draw from velocity, and only they pay for
        // keeping the previous one.
        const stretched = this.rendererSettings.renderMode === RenderMode.StretchedBillBoard;

        // Remember where everything starts this step, so the renderer can carry
        // the motion the step produces on into the part of the frame that comes
        // after it. Taken after emission on purpose: a particle born this step
        // then starts from where it was born rather than from whatever the row
        // held before, and so is drawn at the emitter instead of jumping.
        const columns = this.store;
        const vector3Rows = particleCount * 3;
        const steps = this.behaviorPlan.steps(behaviors);
        // Size and colour are only snapshotted when some behavior can change
        // them; otherwise the columns stay what spawn wrote and the renderer
        // reads them as they are.
        const snapshotSize = this.behaviorPlan.changesSize;
        const snapshotColor = this.behaviorPlan.changesColor;
        columns.useSizeSnapshot(snapshotSize);
        columns.useColorSnapshot(snapshotColor);
        columns.previousPosition.set(columns.position.subarray(0, vector3Rows));
        if (snapshotSize) {
            columns.previousSize.set(columns.size.subarray(0, vector3Rows));
        }
        if (stretched) {
            if (columns.keepPreviousVelocity()) {
                this.rebindParticles();
            }
            columns.previousVelocity.set(columns.velocity.subarray(0, vector3Rows));
        }
        if (snapshotColor) {
            columns.previousColor.set(columns.color.subarray(0, particleCount * 4));
        }

        this.emitterShape.update(this, delta);
        for (let s = 0; s < steps.length; s++) {
            const step = steps[s];
            const stepBehaviors = step.behaviors;
            for (let j = 0; j < stepBehaviors.length; j++) {
                stepBehaviors[j].frameUpdate(delta);
            }
            // Nothing to update: skip, matching what the per-particle loop did.
            // A behavior may set up state before its loop that is only valid
            // once it has seen a particle.
            if (particleCount === 0) {
                continue;
            }
            if (step.run !== undefined) {
                step.run(behaviors, particles, particleCount, delta, this.store);
                continue;
            }
            const behavior = stepBehaviors[0];
            if (behavior.updateAll !== undefined) {
                behavior.updateAll(particles, particleCount, delta);
                continue;
            }
            for (let i = 0; i < particleCount; i++) {
                const particle = particles[i];
                // Inlined `died` — this runs once per behavior per particle.
                if (particle.age < particle.life) {
                    behavior.update(particle, delta);
                }
            }
        }

        const notifyDeaths = this.events.has('particleDied');
        const store = this.store;
        const scalars = store.scalars;
        const stride = ParticleStore.SCALAR_STRIDE;
        let liveParticleCount = this.particleNum;

        if (!isTrailMode) {
            // One pass over the columns does three things the sprite path needs,
            // none of which touches a particle object until a death:
            //
            // Newborns were snapshotted above with their spawn size and colour,
            // before SizeOverLife / ColorOverLife ran. That false jump would be
            // extrapolated by the renderer when the residual is negative (common
            // with the rounded fixed step) and flash the start appearance at the
            // emitter, so the snapshot is collapsed onto the curves' t=0 value.
            // Age is still 0 at that point; the same iteration then ages it.
            //
            // Position is integrated along the velocity.
            //
            // A particle whose age reached its life is swapped with the last live
            // one, rows included, so slot k always owns row k and the live
            // particles stay one contiguous range the renderer copies as is. The
            // survivor moved into the slot has not been visited yet, so the slot
            // is processed again.
            const positions = store.position;
            const velocities = store.velocity;
            const prevSize = store.previousSize;
            const curSize = store.size;
            const prevColor = store.previousColor;
            const curColor = store.color;
            const collapseSize = snapshotSize;
            const collapseColor = snapshotColor;
            // The bounds fall out of the same pass. Measuring every particle on
            // every step costs about as much as the integration itself, so the
            // full measurement runs every few steps; in between, newborns extend
            // the last bounds and the fastest particle seen since pads them for
            // the motion, which keeps them conservative.
            const measure = this.bounds.due;
            const carriedMin = this.bounds.min;
            const carriedMax = this.bounds.max;
            let minX = measure ? Infinity : carriedMin.x;
            let minY = measure ? Infinity : carriedMin.y;
            let minZ = measure ? Infinity : carriedMin.z;
            let maxX = measure ? -Infinity : carriedMax.x;
            let maxY = measure ? -Infinity : carriedMax.y;
            let maxZ = measure ? -Infinity : carriedMax.z;
            let maxSize = measure ? 0 : this.bounds.maxSize;
            let maxSpeedSq = measure ? 0 : this.bounds.maxSpeedSq;
            for (let i = 0; i < liveParticleCount; i++) {
                const scalar = i * stride;
                let age = scalars[scalar + ParticleStore.AGE];
                const offset = i * 3;
                const track = measure || age === 0;
                if (age === 0) {
                    if (collapseSize) {
                        prevSize[offset] = curSize[offset];
                        prevSize[offset + 1] = curSize[offset + 1];
                        prevSize[offset + 2] = curSize[offset + 2];
                    }
                    if (collapseColor) {
                        const o4 = i * 4;
                        prevColor[o4] = curColor[o4];
                        prevColor[o4 + 1] = curColor[o4 + 1];
                        prevColor[o4 + 2] = curColor[o4 + 2];
                        prevColor[o4 + 3] = curColor[o4 + 3];
                    }
                }
                const step = delta * scalars[scalar + ParticleStore.SPEED_MODIFIER];
                const vx = velocities[offset];
                const vy = velocities[offset + 1];
                const vz = velocities[offset + 2];
                const x = positions[offset] + vx * step;
                const y = positions[offset + 1] + vy * step;
                const z = positions[offset + 2] + vz * step;
                positions[offset] = x;
                positions[offset + 1] = y;
                positions[offset + 2] = z;
                if (track) {
                    minX = Math.min(minX, x);
                    maxX = Math.max(maxX, x);
                    minY = Math.min(minY, y);
                    maxY = Math.max(maxY, y);
                    minZ = Math.min(minZ, z);
                    maxZ = Math.max(maxZ, z);
                    maxSize = Math.max(
                        maxSize,
                        Math.max(curSize[offset], Math.max(curSize[offset + 1], curSize[offset + 2]))
                    );
                }
                // Speed is tracked every step: it bounds how far the particles
                // can have moved since the last measurement.
                maxSpeedSq = Math.max(maxSpeedSq, vx * vx + vy * vy + vz * vz);
                age += delta;
                scalars[scalar + ParticleStore.AGE] = age;
                if (age >= scalars[scalar + ParticleStore.LIFE]) {
                    const last = liveParticleCount - 1;
                    const particle = particles[i];
                    const survivor = particles[last] as StoreBackedParticle;
                    particles[i] = survivor;
                    particles[last] = particle;
                    if (i !== last) {
                        store.swapRows(i, last);
                        survivor.setStoreIndex(i);
                        (particle as StoreBackedParticle).setStoreIndex(last);
                    }
                    liveParticleCount--;
                    i--;
                    if (notifyDeaths) {
                        this.events.fire({type: 'particleDied', particleSystem: this, particle: particle});
                    }
                }
            }
            // A particleDied listener may have disposed the system, which drops every particle.
            this.particleNum = this.destroyed ? 0 : liveParticleCount;
            this.bounds.store(
                liveParticleCount,
                measure,
                minX,
                minY,
                minZ,
                maxX,
                maxY,
                maxZ,
                maxSize,
                maxSpeedSq,
                this.rendererSettings,
                this.rendererEmitterSettings,
                this.worldSpace,
                SIMULATION_STEP
            );
            this.notifyFinished();
            return;
        }

        // Trails: the newborn collapse, then motion, then the trail history,
        // then removal, each over the particle objects the history lives on.
        if (particleCount > 0) {
            const prevSize = columns.previousSize;
            const curSize = columns.size;
            const prevColor = columns.previousColor;
            const curColor = columns.color;
            for (let i = 0, o3 = 0, o4 = 0, s = 0; i < particleCount; i++, o3 += 3, o4 += 4, s += stride) {
                if (scalars[s + ParticleStore.AGE] !== 0) {
                    continue;
                }
                if (snapshotSize) {
                    prevSize[o3] = curSize[o3];
                    prevSize[o3 + 1] = curSize[o3 + 1];
                    prevSize[o3 + 2] = curSize[o3 + 2];
                }
                if (snapshotColor) {
                    prevColor[o4] = curColor[o4];
                    prevColor[o4 + 1] = curColor[o4 + 1];
                    prevColor[o4 + 2] = curColor[o4 + 2];
                    prevColor[o4 + 3] = curColor[o4 + 3];
                }
            }
        }

        const followLocalOrigin = (this.rendererEmitterSettings as TrailSettings).followLocalOrigin;
        if (followLocalOrigin) {
            const emitterMatrix = this.emitter.matrixWorld;
            for (let i = 0; i < particleCount; i++) {
                const particle = particles[i];
                if ((particle as TrailParticle).localPosition) {
                    particle.position.copy((particle as TrailParticle).localPosition!);
                    particle.position.applyMatrix4(particle.parentMatrix ?? emitterMatrix);
                } else {
                    particle.position.addScaledVector(particle.velocity, delta * particle.speedModifier);
                }
                particle.age += delta;
            }
        } else {
            const positions = store.position;
            const velocities = store.velocity;
            for (let i = 0, offset = 0, scalar = 0; i < particleCount; i++, offset += 3, scalar += stride) {
                const step = delta * scalars[scalar + ParticleStore.SPEED_MODIFIER];
                positions[offset] += velocities[offset] * step;
                positions[offset + 1] += velocities[offset + 1] * step;
                positions[offset + 2] += velocities[offset + 2] * step;
                scalars[scalar + ParticleStore.AGE] += delta;
            }
        }

        {
            const trailSettings = this.rendererEmitterSettings as TrailSettings;
            const dieWithParticle = trailSettings.dieWithParticle;
            // A world-space system records world positions already.
            const recordWorldSpace = trailSettings.recordWorldSpace && !this.worldSpace;
            const emitterMatrix = this.emitter.matrixWorld;
            // A swept trail records its side as the emitter holds it, in the
            // space its positions are recorded in.
            const sideAxis = trailSettings.sideAxis;
            const sidesInWorld = this.worldSpace || Boolean(trailSettings.recordWorldSpace);
            for (let i = 0; i < particleCount; i++) {
                const trail = particles[i] as TrailParticle;
                // Emptying the history lets the removal pass below take the
                // particle this same step.
                if (dieWithParticle && trail.age >= trail.life) {
                    trail.resetHistory();
                    continue;
                }
                trail.update();
                // update() wrote a sample only while the particle is alive.
                if (recordWorldSpace && trail.age <= trail.life) {
                    const offset = ((trail.historyHead + trail.historyCapacity - 1) % trail.historyCapacity) * 3;
                    const positions = trail.historyPositions;
                    tempV.set(positions[offset], positions[offset + 1], positions[offset + 2]);
                    tempV.applyMatrix4(trail.parentMatrix ?? emitterMatrix);
                    positions[offset] = tempV.x;
                    positions[offset + 1] = tempV.y;
                    positions[offset + 2] = tempV.z;
                }
                if (sideAxis && trail.age <= trail.life) {
                    trail.ensureSideHistory();
                    const offset = ((trail.historyHead + trail.historyCapacity - 1) % trail.historyCapacity) * 3;
                    const sides = trail.historySides;
                    let x = sideAxis.x;
                    let y = sideAxis.y;
                    let z = sideAxis.z;
                    if (sidesInWorld) {
                        const m = (trail.parentMatrix ?? emitterMatrix).elements;
                        const tx = m[0] * x + m[4] * y + m[8] * z;
                        const ty = m[1] * x + m[5] * y + m[9] * z;
                        z = m[2] * x + m[6] * y + m[10] * z;
                        x = tx;
                        y = ty;
                    }
                    sides[offset] = x;
                    sides[offset + 1] = y;
                    sides[offset + 2] = z;
                }
            }
        }

        for (let i = 0; i < liveParticleCount; i++) {
            const particle = particles[i] as TrailParticle;
            const scalar = i * stride;
            const dead = scalars[scalar + ParticleStore.AGE] >= scalars[scalar + ParticleStore.LIFE];
            if (dead && particle.historyCount === 0) {
                const last = liveParticleCount - 1;
                const survivor = particles[last] as StoreBackedParticle;
                particles[i] = survivor;
                particles[last] = particle;
                if (i !== last) {
                    store.swapRows(i, last);
                    survivor.setStoreIndex(i);
                    (particle as StoreBackedParticle).setStoreIndex(last);
                }
                liveParticleCount--;
                i--;
                if (notifyDeaths) {
                    this.events.fire({type: 'particleDied', particleSystem: this, particle: particle});
                }
            }
        }
        // A particleDied listener may have disposed the system, which drops every particle.
        this.particleNum = this.destroyed ? 0 : liveParticleCount;
        this.notifyFinished();
    }

    private notifyFinished(): void {
        if (!this.isFinished()) {
            return;
        }
        if (!this.finishedEventFired) {
            this.finishedEventFired = true;
            this.events.fire({type: 'finished', particleSystem: this});
        }
        if (this.autoDestroy) {
            this.dispose();
        }
    }

    /** Waves a burst fires per loop: its `cycle`, and never fewer than one. */
    private static burstWaveCount(burst: BurstParameters): number {
        return burst.cycle >= 1 ? Math.floor(burst.cycle) : 1;
    }

    /** Seconds between a burst's waves; a missing or negative interval fires them all at once. */
    private static burstInterval(burst: BurstParameters): number {
        return burst.interval > 0 ? burst.interval : 0;
    }

    /**
     * Fires the burst waves that are due by `emissionState.time`.
     *
     * Wave `w` of a burst is due at `burst.time + w * burst.interval`, and the
     * burst fires `cycle` of them, each rolling `probability` on its own — the
     * way Unity repeats a burst. Bursts start in time order, as they always
     * have; their repeats are tracked per burst so a burst that is still
     * repeating never holds back a later one. Repeats falling past the
     * system's duration are dropped (a looping system starts them over on its
     * next loop), matching Unity, which never emits a burst cycle beyond the
     * end of the duration.
     */
    private emitBursts(emissionState: EmissionState, emitterMatrix: Matrix4): void {
        const bursts = this.emissionBursts;
        const burstCount = bursts.length;
        const time = emissionState.time;
        const waves = (emissionState.burstWaves ??= []);
        while (emissionState.burstIndex < burstCount && bursts[emissionState.burstIndex].time <= time) {
            waves[emissionState.burstIndex] = 0;
            emissionState.burstIndex++;
        }
        const started = emissionState.burstIndex;
        for (let b = 0; b < started; b++) {
            const burst = bursts[b];
            const cycles = ParticleSystem.burstWaveCount(burst);
            let wave = waves[b] ?? 0;
            if (wave >= cycles) {
                continue;
            }
            const interval = ParticleSystem.burstInterval(burst);
            while (wave < cycles) {
                const waveTime = burst.time + wave * interval;
                if (wave > 0 && waveTime > this.duration) {
                    wave = cycles;
                    break;
                }
                if (waveTime > time) {
                    break;
                }
                emissionState.burstWaveIndex = wave;
                this.fireBurstWave(burst, emissionState, emitterMatrix);
                wave++;
            }
            waves[b] = wave;
        }
    }

    /** Spawns one wave of `burst`, if its probability roll passes. */
    private fireBurstWave(burst: BurstParameters, emissionState: EmissionState, emitterMatrix: Matrix4): void {
        if (random() >= burst.probability) {
            return;
        }
        const rawCount = burst.count.genValue(this.memory, this.time);
        const factor = this.emissionFactor();
        // Rounded at random, so a fraction is not always lost: three at 1.5 is four or five, on average 4.5.
        const count = Math.abs(factor - 1) < 0.001 ? rawCount : Math.floor(rawCount * factor + random());
        emissionState.isBursting = true;
        emissionState.burstParticleCount = count;
        this.spawn(count, emissionState, emitterMatrix);
        emissionState.isBursting = false;
    }

    /** True while a burst that has started still has a wave due within the duration. */
    private hasPendingBurstWaves(state: EmissionState): boolean {
        const waves = state.burstWaves;
        if (waves === undefined) {
            return false;
        }
        const bursts = this.emissionBursts;
        for (let b = 0; b < state.burstIndex && b < bursts.length; b++) {
            const burst = bursts[b];
            const wave = waves[b] ?? 0;
            if (
                wave < ParticleSystem.burstWaveCount(burst) &&
                (wave === 0 || burst.time + wave * ParticleSystem.burstInterval(burst) <= this.duration)
            ) {
                return true;
            }
        }
        return false;
    }

    /**
     * Spawns `count` particles owed to emission over distance, each where the
     * emitter crossed its metre mark on the way from `from` to where
     * `emitterMatrix` has it now, rather than all of them at the end of the
     * path: a fast emitter then leaves a continuous trail instead of one clump
     * per step.
     *
     * `carried` is how far the emitter had already gone past its last mark
     * before this step, so the marks keep their spacing across steps. Only the
     * position is interpolated; the emitter's current rotation and scale are
     * used for every particle.
     */
    private spawnAlongPath(
        count: number,
        emissionState: EmissionState,
        emitterMatrix: Matrix4,
        from: Vector3,
        carried: number,
        spacing: number,
        length: number
    ): void {
        const matrix = this.pathMatrix.copy(emitterMatrix);
        const target = emitterMatrix.elements;
        const elements = matrix.elements;
        const tx = target[12];
        const ty = target[13];
        const tz = target[14];
        for (let k = 1; k <= count; k++) {
            const travelled = k * spacing - carried;
            const f = travelled <= 0 ? 0 : travelled >= length ? 1 : travelled / length;
            elements[12] = from.x + (tx - from.x) * f;
            elements[13] = from.y + (ty - from.y) * f;
            elements[14] = from.z + (tz - from.z) * f;
            this.spawn(1, emissionState, matrix);
        }
    }

    /**
     * Spawns what this step's emission calls for. Called by the simulation step, and by
     * `EmitSubParticleSystem` on a sub emitter target with the parent particle's state and matrix.
     */
    emit(delta: number, emissionState: EmissionState, emitterMatrix: Matrix4): void {
        if (this.destroyed) {
            return;
        }
        // Ended before this step (endEmit, or a past step's end of duration):
        // no more bursts either. A looping system would otherwise keep firing
        // them every loop after endEmit and never finish. Only the system's
        // own emission: a sub emitter's bursts belong to its parent particles,
        // which still go off as they die after the effect was told to end.
        const endedBefore = this.emitEnded && emissionState === this.emissionState;
        if (emissionState.time > this.duration) {
            if (this.looping) {
                emissionState.time -= this.duration;
                emissionState.burstIndex = 0;
                if (emissionState.burstWaves !== undefined) {
                    emissionState.burstWaves.length = 0;
                }
                for (let i = 0; i < this.behaviors.length; i++) {
                    this.behaviors[i].reset();
                }
            } else {
                if (!this.emitEnded && !this.onlyUsedByOther) {
                    this.endEmit();
                }
            }
        }

        // Only spawns in world space consume the normal matrix, and computing it
        // inverts a 4x4 — skip it for local-space systems.
        if (this.worldSpace) {
            this.normalMatrix.getNormalMatrix(emitterMatrix);
        }
        const emissionBurstCount = this.emissionBursts.length;
        const qualityFactor = this.emissionFactor();

        if (emissionBurstCount > 0 && !endedBefore) {
            this.emitBursts(emissionState, emitterMatrix);
        }

        // Particles owed to the distance travelled this step, spawned along it.
        let pathSpawn = 0;
        let pathSpacing = 0;
        let pathCarried = 0;
        let pathLength = 0;
        const previousWorldPos = emissionState.previousWorldPos;
        if (!this.emitEnded) {
            const timeRatio = emissionState.time / this.duration;
            emissionState.waitEmiting += delta * this.emissionOverTime.genValue(this.memory, timeRatio) * qualityFactor;

            if (previousWorldPos !== undefined) {
                this.temp.set(emitterMatrix.elements[12], emitterMatrix.elements[13], emitterMatrix.elements[14]);
                pathLength = previousWorldPos.distanceTo(this.temp);
                pathCarried = emissionState.travelDistance;
                emissionState.travelDistance += pathLength;
                const emitPerMeter = this.emissionOverDistance.genValue(this.memory, timeRatio) * qualityFactor;
                if (emissionState.travelDistance * emitPerMeter > 0) {
                    const count = Math.floor(emissionState.travelDistance * emitPerMeter);
                    emissionState.travelDistance -= count / emitPerMeter;
                    // A world-space particle stays where it is born, so it is born
                    // where the emitter passed its mark. A local-space one moves
                    // with the emitter and has no path to be spread along.
                    if (this.worldSpace && pathLength > 0) {
                        pathSpawn = count;
                        pathSpacing = 1 / emitPerMeter;
                    } else {
                        emissionState.waitEmiting += count;
                    }
                }
            }
        }

        // Accrue before spawning so replacement particles can appear on the same
        // frame an old one dies (rate * lifetime ≈ 1 would otherwise flicker).
        const totalSpawn = Math.floor(emissionState.waitEmiting);
        if (totalSpawn > 0) {
            this.spawn(totalSpawn, emissionState, emitterMatrix);
            emissionState.waitEmiting -= totalSpawn;
        }
        if (pathSpawn > 0) {
            this.spawnAlongPath(
                pathSpawn,
                emissionState,
                emitterMatrix,
                previousWorldPos!,
                pathCarried,
                pathSpacing,
                pathLength
            );
        }

        if (emissionState.previousWorldPos === undefined) emissionState.previousWorldPos = new Vector3();
        emissionState.previousWorldPos.set(
            emitterMatrix.elements[12],
            emitterMatrix.elements[13],
            emitterMatrix.elements[14]
        );
        emissionState.time += delta;
    }

    /**
     * Writes this system's settings. Its geometry, material and textures go into `metaData` as
     * entries the result names by uuid; give the same `metaData` to every system of a document so
     * shared ones are written once. The material entry holds live Babylon objects, so to write a
     * file use `serializeEffect`, which turns them into plain data. Runtime-only state
     * (`tint`, `beamEnd`, the playing time) is not written.
     */
    toJSON(metaData?: BabylonMetaData | string, _options: SerializationOptions = {}): ParticleSystemJSONParameters {
        return particleSystemToJSON(this, metaData);
    }

    /**
     * Builds a system from {@link toJSON} output, resolving its geometry, material and texture
     * uuids through `meta`. A setting the file leaves out takes the constructor's default; an
     * unknown shape, behavior or curve type warns and takes its default. Sub emitter targets stay
     * uuids until `QuarksLoader` links them.
     */
    static fromJSON(
        json: ParticleSystemJSONParameters,
        meta: BabylonMetaData,
        dependencies: {[uuid: string]: Behavior} = {},
        scene?: Scene
    ): ParticleSystem {
        const ps = new ParticleSystem(particleSystemParametersFromJSON(json, meta, scene));
        ps.behaviors = (json.behaviors ?? [])
            .map((behaviorJson) => {
                const behavior = BehaviorFromJSON(behaviorJson, ps);
                if (behavior && behavior.type === 'EmitSubParticleSystem') {
                    dependencies[(behaviorJson as {subParticleSystem: string}).subParticleSystem] = behavior;
                }
                return behavior;
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
     */
    addEventListener(event: ParticleSystemEventType, callback: (event: ParticleSystemEvent) => void): void {
        this.events.add(event, callback);
    }

    /** Removes every callback registered for `event`. */
    removeAllEventListeners(event: ParticleSystemEventType): void {
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
            rendererEmitterSettings = {
                startLength: (this.rendererEmitterSettings as TrailSettings).startLength.clone(),
                followLocalOrigin: (this.rendererEmitterSettings as TrailSettings).followLocalOrigin,
                ...trailFlags(this.rendererEmitterSettings as TrailSettings),
                ...trailCurve(this.rendererEmitterSettings as TrailSettings),
                ...((this.rendererEmitterSettings as TrailSettings).sideAxis
                    ? {sideAxis: (this.rendererEmitterSettings as TrailSettings).sideAxis!.clone()}
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
            copy.tint = this.tint.clone();
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
