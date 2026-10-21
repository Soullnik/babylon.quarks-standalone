import {Constants} from '@babylonjs/core/Engines/constants';
import {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Scene} from '@babylonjs/core/scene';
import {
    AxisAngleGenerator,
    Behavior,
    BehaviorFromJSON,
    ColorGenerator,
    ColorGeneratorFromJSON,
    ConstantColor,
    ConstantValue,
    createSeededRandom,
    EmissionState,
    EmitSubParticleSystem,
    EmitterFromJSON,
    EmitterShape,
    FunctionColorGenerator,
    FunctionJSON,
    FunctionValueGenerator,
    FusionStep,
    GeneratorFromJSON,
    GeneratorMemory,
    IParticleSystem,
    Matrix3,
    Matrix4,
    Particle,
    ParticleStore,
    ParticleSystemEvent,
    ParticleSystemEventType,
    planBehaviorFusion,
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
    ValueGeneratorFromJSON,
    Vector2,
    Vector3,
    Vector3Generator,
    Vector4,
} from 'quarks.core';
import {BatchedRenderer, VFXBatchSettings} from './BatchedRenderer';
import {ensureEnvAtlasFromCube, getCachedEnvAtlas} from './envAtlas';
import {ensureTriangleIndices} from './geometryUtil';
import {disposeEmitterForSystem, ParticleEmitter} from './ParticleEmitter';
import {trailCurveTension, trailTessellation} from './trailCurve';
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
    textureUVToJSON,
    UV_DISTORTION_DEFAULT_UV,
} from './VFXBatch';

export interface BurstParameters {
    time: number;
    count: ValueGenerator | FunctionValueGenerator;
    cycle: number;
    interval: number;
    probability: number;
}

/**
 * What a system does while no camera can see its particles (Unity's Culling
 * Mode). The {@link BatchedRenderer} tests each system's bounds against the
 * active cameras' frusta every frame.
 *
 * - `'always'` keeps simulating off screen, so an effect is exactly where it
 *   would have been when it comes back into view. The default, and the only
 *   safe choice for an emitter whose particles reach the screen from off it.
 * - `'pause'` freezes the system off screen and resumes it where it left off.
 * - `'pauseAndCatchUp'` freezes it too, then runs the missed time (up to a few
 *   seconds) within the renderer's catch-up budget when it is seen again.
 *
 * An empty system is never culled, so it can start emitting and grow the
 * bounds that decide its visibility. A system another one emits into is never
 * culled either; its parent decides.
 */
export type CullingMode = 'always' | 'pause' | 'pauseAndCatchUp';

/**
 * What the emitter's world scale does to a world-space system (Unity's
 * Scaling Mode, as far as it differs here). A local-space system lives in its
 * emitter's space, so its scale reaches everything either way.
 *
 * - `'shape'` (default): the scale sizes the emission shape and the
 *   particles; speeds, forces and speed limits stay in world units, so a
 *   scaled-down effect moves as far as the full-size one.
 * - `'hierarchy'`: the scale also multiplies start speeds (per axis),
 *   `ForceOverLife` and `LimitSpeedOverLife` (by the mean of the axes), so the
 *   whole effect, motion included, scales like a model would.
 */
export type ScalingMode = 'shape' | 'hierarchy';

/**
 * Where a {@link RenderMode.Beam} system's quads end: a point in world space,
 * or anything with a world position, such as a Babylon `TransformNode`, read
 * every frame.
 */
export type BeamEnd = {x: number; y: number; z: number} | {getAbsolutePosition(): {x: number; y: number; z: number}};

/** Particle backed by a {@link ParticleStore} row, as this system always creates. */
type StoreBackedParticle = Particle & {storeIndex: number; setStoreIndex(index: number): void};

const UP = new Vector3(0, 0, 1);
const tempQ = new Quaternion();
const IDENTITY_QUATERNION = new Quaternion();
const tempV = new Vector3();
const tempV2 = new Vector3();
const PREWARM_FPS = 60;
const SIMULATION_STEP = 1 / PREWARM_FPS;
const MAX_SIMULATION_STEPS_PER_FRAME = 8;
/** Points sampled over the rest of the cycle when a rate curve is 0 now, to see if it rises later. */
const RATE_LOOKAHEAD_SAMPLES = 64;
/** Most off-screen time a `'pauseAndCatchUp'` system replays on coming back into view. */
const MAX_CATCH_UP_SECONDS = 2;
/** Steps between full measurements of a system's bounds; see simulateStep. */
const BOUNDS_REFRESH_STEPS = 4;
// Math.round() breaks an exact tie (accumulator sitting at precisely half a
// step) by rounding up. At exactly 120Hz that tie is not a corner case — it is
// every single frame — and rounding it up would run a step on every one of
// them instead of every other one. Nudging the tie down costs nothing on a
// real display (real frame times essentially never land on the tie exactly)
// and keeps the well-tested "half a step is no step yet" behavior.
const ROUND_TIE_BIAS = 1e-9;

/** Built-in behaviors that write a particle's size / colour, and those that touch neither. */
const SIZE_BEHAVIORS = new Set(['SizeOverLife', 'SizeBySpeed']);
const COLOR_BEHAVIORS = new Set(['ColorOverLife', 'ColorBySpeed']);
const INERT_FOR_SIZE_AND_COLOR = new Set([
    'ApplyForce',
    'Noise',
    'TurbulenceField',
    'GravityForce',
    'RotationOverLife',
    'Rotation3DOverLife',
    'RotationBySpeed',
    'SpeedOverLife',
    'FrameOverLife',
    'ForceOverLife',
    'VelocityOverLife',
    'InheritVelocity',
    'OrbitOverLife',
    'WidthOverLength',
    'ChangeEmitDirection',
    'EmitSubParticleSystem',
    'LimitSpeedOverLife',
    'ApplyCollision',
]);

const DEFAULT_POSITIONS = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
const DEFAULT_UVS = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);

/** Zero UVs sized to a position buffer — missing/mismatched uv attrs → GL_INVALID_OPERATION on iOS. */
const fallbackUVs = new WeakMap<Float32Array, Float32Array>();
const fallbackNormals = new WeakMap<Float32Array, Float32Array>();
/**
 * Zero UVs for a geometry given without any, one array per geometry: batches
 * are keyed by the UV array too, so systems sharing a geometry share it.
 */
function fallbackUVsForPositions(positions: Float32Array): Float32Array {
    let uvs = fallbackUVs.get(positions);
    if (uvs === undefined || uvs.length !== (positions.length / 3) * 2) {
        uvs = new Float32Array((positions.length / 3) * 2);
        fallbackUVs.set(positions, uvs);
    }
    return uvs;
}
const DEFAULT_INDICES = new Uint32Array([0, 1, 2, 0, 2, 3]);

/** The optional trail flags that are switched on, so JSON and clones only carry the ones in use. */
function trailFlags(settings: TrailSettings | undefined): Partial<TrailSettings> {
    const flags: Partial<TrailSettings> = {};
    if (settings?.uvFromHead) flags.uvFromHead = true;
    if (settings?.colorFromParticle) flags.colorFromParticle = true;
    if (settings?.dieWithParticle) flags.dieWithParticle = true;
    if (settings?.recordWorldSpace) flags.recordWorldSpace = true;
    return flags;
}

/** A trail's tessellation and curve tension, normalised, each only when it differs from the default. */
function trailCurve(settings: TrailSettings | undefined): Partial<TrailSettings> {
    const curve: Partial<TrailSettings> = {};
    const tessellation = trailTessellation(settings);
    const curveTension = trailCurveTension(settings);
    if (tessellation > 0) curve.tessellation = tessellation;
    if (curveTension > 0) curve.curveTension = curveTension;
    return curve;
}

/** A trail's side axis as JSON `[x, y, z]`, or nothing when unset. */
function trailSideAxisJSON(settings: TrailSettings | undefined): {sideAxis?: number[]} {
    const axis = settings?.sideAxis;
    return axis ? {sideAxis: [axis.x, axis.y, axis.z]} : {};
}

/** A trail's side axis from JSON `[x, y, z]` (or an object with x, y, z), or nothing. */
function trailSideAxisFromJSON(value: unknown): {sideAxis?: Vector3} {
    if (Array.isArray(value)) {
        return {sideAxis: new Vector3(Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0)};
    }
    if (value && typeof value === 'object') {
        const v = value as {x?: number; y?: number; z?: number};
        return {sideAxis: new Vector3(v.x ?? 0, v.y ?? 0, v.z ?? 0)};
    }
    return {};
}

export interface ParticleSystemParameters {
    autoDestroy?: boolean;
    looping?: boolean;
    prewarm?: boolean;
    duration?: number;
    startDelay?: ValueGenerator | FunctionValueGenerator;
    shape?: EmitterShape;
    startLife?: ValueGenerator | FunctionValueGenerator;
    startSpeed?: ValueGenerator | FunctionValueGenerator;
    startRotation?: ValueGenerator | FunctionValueGenerator | RotationGenerator;
    startSize?: ValueGenerator | FunctionValueGenerator | Vector3Generator;
    startLength?: ValueGenerator | FunctionValueGenerator;
    startColor?: ColorGenerator | FunctionColorGenerator;
    emissionOverTime?: ValueGenerator | FunctionValueGenerator;
    emissionOverDistance?: ValueGenerator | FunctionValueGenerator;
    emissionBursts?: Array<BurstParameters>;
    /** Most particles alive at once; emission past it is dropped. Leave unset for no limit. */
    maxParticles?: number;
    onlyUsedByOther?: boolean;
    behaviors?: Array<Behavior>;
    instancingGeometry?: Float32Array;
    instancingIndices?: Uint32Array | Uint16Array;
    instancingUVs?: Float32Array;
    /**
     * A second UV set for the mesh (glTF `TEXCOORD_1`, Unity's `uv2`), what
     * textures on UV channel 1 read on a mesh particle; see `UVChannel`.
     * Default none: channel 1 reads the first set.
     */
    instancingUVs2?: Float32Array;
    instancingNormals?: Float32Array;
    renderMode?: RenderMode;
    rendererEmitterSettings?: RendererEmitterSettings;
    speedFactor?: number;
    material?: any;
    texture?: Texture | null;
    startTileIndex?: ValueGenerator;
    uTileCount?: number;
    vTileCount?: number;
    blendTiles?: boolean;
    softParticles?: boolean;
    softFarFade?: number;
    softNearFade?: number;
    renderOrder?: number;
    worldSpace?: boolean;
    blendMode?: number;
    transparent?: boolean;
    /**
     * Whether particles are hidden behind nearer geometry. `false` draws them over everything
     * (Unity's `ZTest Always`), in every render mode. Default `true`.
     */
    depthTest?: boolean;
    depthWrite?: boolean;
    alphaTest?: number;
    layerMask?: number;
    /** Billboard pivot in particle-size units, see {@link VFXBatchSettings.pivot}. */
    pivot?: Vector3;
    /** Fraction of billboard particles mirrored along U (x) and V (y), see {@link ParticleSystem.flip}. */
    flip?: Vector2;
    /** How mesh particles are lit, see {@link ParticleSystem.lighting}. Default `'fixed'`. */
    lighting?: MeshLighting;
    /** Rim (Fresnel) term on mesh particles, see {@link ParticleSystem.rim}. Default none. */
    rim?: Partial<MeshRim>;
    /** The main map's layout, see {@link ParticleSystem.mapUV}. Default as drawn. */
    mapUV?: Partial<TextureUV>;
    /** Colour ramp for the map, see {@link ParticleSystem.gradientMap}. Default none. */
    gradientMap?: Partial<ParticleGradientMap>;
    /** Alpha erosion, see {@link ParticleSystem.erosion}. Default none. */
    erosion?: ParticleErosionOptions;
    /** Map UV distortion, see {@link ParticleSystem.uvDistortion}. Default none. */
    uvDistortion?: ParticleUVDistortionOptions;
    /** Multiplier on the time the system is advanced by, see {@link ParticleSystem.playbackSpeed}. Default 1. */
    playbackSpeed?: number;
    /** What the system does while off screen, see {@link CullingMode}. Default `'always'`. */
    cullingMode?: CullingMode;
    /** What the emitter's scale does to a world-space system, see {@link ScalingMode}. Default `'shape'`. */
    scalingMode?: ScalingMode;
    /** Seed for this system's own random generator, see {@link ParticleSystem.seed}. Default none. */
    seed?: number;
    /** Draw order within the batch, see {@link ParticleSystem.sortMode}. Default `'none'`. */
    sortMode?: SortMode;
    /** Whether particles start turned along their direction of travel, see {@link ParticleSystem.alignToDirection}. Default false. */
    alignToDirection?: boolean;
    /** Smallest on-screen size, as a fraction of the viewport height, see {@link ParticleSystem.minParticleSize}. Default 0. */
    minParticleSize?: number;
    /** Largest on-screen size, as a fraction of the viewport height, see {@link ParticleSystem.maxParticleSize}. Default unlimited. */
    maxParticleSize?: number;
    /** Babylon rendering group of the batch, see {@link ParticleSystem.renderingGroupId}. Default 0. */
    renderingGroupId?: number;
    /** Whether the scene's fog applies, see {@link ParticleSystem.applyFog}. Default true. */
    applyFog?: boolean;
    scene?: Scene;
}

export interface BurstParametersJSON {
    time: number;
    count: FunctionJSON | number;
    cycle: number;
    interval: number;
    probability: number;
}

export interface ParticleSystemJSONParameters {
    version: string;
    autoDestroy: boolean;
    looping: boolean;
    prewarm: boolean;
    duration: number;
    startDelay?: FunctionJSON;
    shape: any;
    startLife: FunctionJSON;
    startSpeed: FunctionJSON;
    startRotation: FunctionJSON;
    startSize: FunctionJSON;
    startColor: FunctionJSON;
    emissionOverTime: FunctionJSON;
    emissionOverDistance: FunctionJSON;
    emissionBursts?: Array<BurstParametersJSON>;
    maxParticles?: number;
    onlyUsedByOther: boolean;
    rendererEmitterSettings: RendererEmitterSettings;
    instancingGeometry?: any;
    renderMode: number;
    renderOrder?: number;
    /** Written only when not 0. */
    renderingGroupId?: number;
    /** Written only when false. */
    applyFog?: boolean;
    /** Written only when not 1. */
    playbackSpeed?: number;
    /** Written only when not `'always'`. */
    cullingMode?: CullingMode;
    /** Written only when not `'shape'`. */
    scalingMode?: ScalingMode;
    /** Written only when set. */
    seed?: number;
    /** Written only when not `'none'`. */
    sortMode?: SortMode;
    /** Written only when true. */
    alignToDirection?: boolean;
    /** Written only when not 0. */
    minParticleSize?: number;
    /** Written only when limited. */
    maxParticleSize?: number;
    speedFactor?: number;
    texture?: string;
    material?: string;
    layers?: number;
    startTileIndex: FunctionJSON | number;
    uTileCount: number;
    vTileCount: number;
    blendTiles?: boolean;
    softParticles?: boolean;
    softFarFade?: number;
    softNearFade?: number;
    blending?: number;
    transparent?: boolean;
    depthTest?: boolean;
    depthWrite?: boolean;
    alphaTest?: number;
    behaviors: Array<any>;
    worldSpace: boolean;
    /** `[x, y, z]`; written only when non-zero. */
    pivot?: number[];
    /** `[u, v]`; written only when non-zero. */
    flip?: number[];
}

export interface BabylonMetaData {
    textures: {[uuid: string]: Texture | null};
    materials: {[uuid: string]: any};
    geometries: {[uuid: string]: any};
    images?: {[uuid: string]: any};
    shapes?: {[uuid: string]: any};
    skeletons?: {[uuid: string]: any};
    animations?: {[uuid: string]: any};
    nodes?: {[uuid: string]: any};
}

export class ParticleSystem implements IParticleSystem {
    private static serializationCounter = 0;

    autoDestroy: boolean;
    prewarm: boolean;
    looping: boolean;
    duration: number;
    startDelay: ValueGenerator | FunctionValueGenerator;
    startLife: ValueGenerator | FunctionValueGenerator;
    startSpeed: ValueGenerator | FunctionValueGenerator;
    startRotation: ValueGenerator | FunctionValueGenerator | RotationGenerator;
    startSize: ValueGenerator | FunctionValueGenerator | Vector3Generator;
    startColor: ColorGenerator | FunctionColorGenerator;
    startTileIndex: ValueGenerator;
    rendererEmitterSettings: RendererEmitterSettings;
    /**
     * Fraction of billboard particles mirrored along U (x) and V (y), each
     * picked at random when the particle is born — Unity's renderer Flip.
     * Undefined: nothing is mirrored. Meshes ignore it.
     */
    flip?: Vector2;
    emissionOverTime: ValueGenerator | FunctionValueGenerator;
    emissionOverDistance: ValueGenerator | FunctionValueGenerator;
    emissionBursts: Array<BurstParameters>;
    /** Most particles alive at once (Unity's Max Particles); emission past it is dropped. Undefined means no limit. */
    maxParticles?: number;
    onlyUsedByOther: boolean;
    worldSpace: boolean;
    particleNum: number;
    paused: boolean;
    particles: Array<Particle>;
    /** Column storage shared by this system's particles. */
    readonly store: ParticleStore = new ParticleStore(64);
    emitterShape: EmitterShape;
    emitter: ParticleEmitter;
    rendererSettings: VFXBatchSettings;
    neededToUpdateRender: boolean;
    behaviors: Array<Behavior>;
    emissionState: EmissionState;
    emitterVelocity: Vector3 = new Vector3();

    private prewarmed: boolean;
    private emitEnded: boolean;
    private markForDestroy: boolean;
    private finishedEventFired = false;
    private startDelayTimeLeft = 0;
    private previousEmitterPos?: Vector3;
    private tempEmitterPos: Vector3 = new Vector3();
    private temp: Vector3 = new Vector3();
    /** Emitter matrix moved along the step's path, see spawnAlongPath. */
    private pathMatrix: Matrix4 = new Matrix4();
    private normalMatrix: Matrix3 = new Matrix3();
    private memory: GeneratorMemory = [];
    private listeners: {[event: string]: Array<(event: ParticleSystemEvent) => void>} = {};
    private readonly layerMaskProxy: {mask: number};
    private materialRef: any = null;
    private sceneRef: Scene | undefined;
    private qualityFactor = 1;
    private simulationAccumulator = 0;
    private destroyed = false;
    /** Behaviors the cached plan was built from, compared by identity. */
    private fusionPlan?: Array<Behavior>;
    private fusionSteps: Array<FusionStep> = [];
    /**
     * Whether any behavior in the plan can change a particle's size or colour
     * after birth. Only then does a step have to snapshot them for the renderer.
     */
    private planChangesSize = true;
    private planChangesColor = true;
    /** @internal **/
    _renderer?: BatchedRenderer;

    set time(time: number) {
        this.emissionState.time = time;
    }

    get time(): number {
        return this.emissionState.time;
    }

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
     * still counts as pending. Curves are sampled, which only runs while the rate is 0.
     */
    private emitsFrom(rate: ValueGenerator | FunctionValueGenerator, timeRatio: number): boolean {
        if (rate.genValue(this.memory, timeRatio) > 0) {
            return true;
        }
        if (rate.type !== 'function') {
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

    get layers() {
        return this.layerMaskProxy;
    }

    get texture() {
        return this.rendererSettings.texture;
    }

    set texture(texture: Texture | null) {
        this.rendererSettings.texture = texture;
        this.neededToUpdateRender = true;
    }

    get material() {
        return this.materialRef;
    }

    set material(material: any) {
        this.materialRef = material;
        this.applyMaterialSettings(material);
    }

    get uTileCount() {
        return this.rendererSettings.uTileCount;
    }

    set uTileCount(u: number) {
        this.rendererSettings.uTileCount = u;
        this.neededToUpdateRender = true;
    }

    get vTileCount() {
        return this.rendererSettings.vTileCount;
    }

    set vTileCount(v: number) {
        this.rendererSettings.vTileCount = v;
        this.neededToUpdateRender = true;
    }

    get blendTiles() {
        return this.rendererSettings.blendTiles;
    }

    set blendTiles(v: boolean) {
        this.rendererSettings.blendTiles = v;
        this.neededToUpdateRender = true;
    }

    get softParticles() {
        return this.rendererSettings.softParticles;
    }

    set softParticles(v: boolean) {
        this.rendererSettings.softParticles = v;
        this.neededToUpdateRender = true;
    }

    /**
     * Billboard pivot in particle-size units (Unity's renderer Pivot), see
     * {@link VFXBatchSettings.pivot}. Assign a new vector to change it: editing
     * the returned one in place does not reach the renderer.
     */
    /**
     * The order this system's batch draws its particles in (Unity's Sort
     * Mode), `'none'` by default. Alpha blended smoke wants `'distance'`;
     * additive effects need nothing. Sorting covers the whole batch, so systems
     * with different modes are batched apart. See {@link SortMode}.
     */
    get sortMode(): SortMode {
        return this.rendererSettings.sortMode;
    }

    set sortMode(mode: SortMode) {
        this.rendererSettings.sortMode = ParticleSystem.validSortMode(mode);
        this.neededToUpdateRender = true;
    }

    /**
     * Smallest size a billboard or stretched particle is drawn at, as a
     * fraction of the viewport height (Unity's Min Particle Size); 0 by
     * default. Keeps distant sparks from vanishing. Meshes and trails ignore it.
     */
    get minParticleSize(): number {
        return this.rendererSettings.minParticleSize;
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
        return this.rendererSettings.maxParticleSize;
    }

    set maxParticleSize(size: number) {
        this.rendererSettings.maxParticleSize = size > 0 ? size : Infinity;
        this.neededToUpdateRender = true;
    }

    get pivot(): Vector3 | undefined {
        return this.rendererSettings.pivot;
    }

    set pivot(v: Vector3 | undefined) {
        this.rendererSettings.pivot = ParticleSystem.nonZeroPivot(v);
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
        this.rendererSettings.lighting = ParticleSystem.validLighting(lighting);
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

    /** `lighting` if it is one of the modes, else the default. */
    private static validLighting(lighting: unknown): MeshLighting {
        return lighting === 'unlit' || lighting === 'scene' ? lighting : 'fixed';
    }

    private static validSortMode(mode: unknown): SortMode {
        return mode === 'distance' || mode === 'oldestInFront' || mode === 'youngestInFront' ? mode : 'none';
    }

    private static validCullingMode(mode: unknown): CullingMode {
        return mode === 'pause' || mode === 'pauseAndCatchUp' ? mode : 'always';
    }

    private static nonZeroPivot(v: Vector3 | undefined): Vector3 | undefined {
        return v && (v.x !== 0 || v.y !== 0 || v.z !== 0) ? v.clone() : undefined;
    }

    private static nonZeroFlip(v: Vector2 | undefined): Vector2 | undefined {
        return v && (v.x > 0 || v.y > 0) ? v.clone() : undefined;
    }

    get softNearFade() {
        return this.rendererSettings.softNearFade;
    }

    set softNearFade(v: number) {
        this.rendererSettings.softNearFade = v;
        this.neededToUpdateRender = true;
    }

    get softFarFade() {
        return this.rendererSettings.softFarFade;
    }

    set softFarFade(v: number) {
        this.rendererSettings.softFarFade = v;
        this.neededToUpdateRender = true;
    }

    get instancingGeometry(): Float32Array {
        return this.rendererSettings.instancingGeometry;
    }

    /**
     * The mesh particles' positions. A new geometry with a different vertex
     * count drops UV sets and normals that no longer fit it: the first UV set
     * falls back to zeros, the second to none, the normals to +Z. Assign {@link instancingUVs} and
     * {@link instancingUVs2} after it.
     */
    set instancingGeometry(geometry: Float32Array) {
        this.restart();
        this.particles.length = 0;
        const settings = this.rendererSettings;
        const uvLength = (geometry.length / 3) * 2;
        const previous = settings.instancingGeometry;
        settings.instancingGeometry = geometry;
        // Sets that no longer fit, or that were the old geometry's fallbacks, move to the new one's.
        if (settings.instancingUVs?.length !== uvLength || settings.instancingUVs === fallbackUVs.get(previous)) {
            settings.instancingUVs = fallbackUVsForPositions(geometry);
        }
        if (
            settings.instancingNormals &&
            (settings.instancingNormals.length !== geometry.length ||
                settings.instancingNormals === fallbackNormals.get(previous))
        ) {
            settings.instancingNormals = ParticleSystem.createFallbackNormals(geometry);
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

    get blending() {
        return this.rendererSettings.materialBlendMode;
    }

    set blending(blending: number) {
        this.rendererSettings.materialBlendMode = blending;
        this.neededToUpdateRender = true;
    }

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
     * renderer. 1 by default; saved in the effect JSON only when it differs.
     */
    playbackSpeed = 1;

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
     * Time a `'pauseAndCatchUp'` system has spent off screen and not yet
     * simulated, in seconds. Capped, so an effect hidden for a minute does not
     * replay the minute.
     */
    private pendingCatchUp = 0;

    /**
     * Time per frame a system coming back into view may spend on the steps it
     * missed, in milliseconds, when it is advanced without a renderer. The
     * {@link BatchedRenderer} shares its own budget among all its systems
     * instead. Steps that do not fit are dropped, not deferred.
     */
    static catchUpBudgetMs = 2;

    /** Axis-aligned bounds of the live particles, in simulation space. See {@link getWorldBounds}. */
    private readonly boundsMin = new Vector3();
    private readonly boundsMax = new Vector3();
    /** How far a particle's quad, mesh or stretch can reach past its position, in simulation units. */
    private boundsPadding = 0;
    private boundsValid = false;
    /** Steps since the last full measurement; between them the bounds are carried and padded. */
    private stepsSinceBounds = 0;
    private boundsMaxSize = 0;
    private boundsMaxSpeedSq = 0;
    /** True when the bounds are already in world space (a world-space system, or bounds the renderer measured). */
    private boundsInWorld = false;
    private geometryRadiusFor?: Float32Array;
    private geometryRadius = 1;

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
        this.maxParticles = parameters.maxParticles;
        this.onlyUsedByOther = parameters.onlyUsedByOther ?? false;
        this.emitterShape = parameters.shape ?? new SphereEmitter();
        this.behaviors = parameters.behaviors ?? [];
        this.worldSpace = parameters.worldSpace ?? false;
        this.rendererEmitterSettings = parameters.rendererEmitterSettings ?? {};

        if (parameters.renderMode === RenderMode.StretchedBillBoard) {
            const settings = this.rendererEmitterSettings as StretchedBillBoardSettings;
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
            pivot: ParticleSystem.nonZeroPivot(parameters.pivot),
            sortMode: ParticleSystem.validSortMode(parameters.sortMode),
            minParticleSize: Math.max(0, parameters.minParticleSize ?? 0),
            maxParticleSize: parameters.maxParticleSize ?? Infinity,
            renderingGroupId: parameters.renderingGroupId ?? 0,
            applyFog: parameters.applyFog ?? true,
            lighting: ParticleSystem.validLighting(parameters.lighting),
            rim: normalizeMeshRim(parameters.rim),
            mapUV: normalizeMapUV(parameters.mapUV),
            gradientMap: normalizeGradientMap(parameters.gradientMap),
            erosion: normalizeErosion(parameters.erosion),
            uvDistortion: normalizeUVDistortion(parameters.uvDistortion),
        };
        this.flip = ParticleSystem.nonZeroFlip(parameters.flip);
        this.playbackSpeed = parameters.playbackSpeed ?? 1;
        this.cullingMode = parameters.cullingMode ?? 'always';
        this.scalingMode = parameters.scalingMode === 'hierarchy' ? 'hierarchy' : 'shape';
        this.alignToDirection = parameters.alignToDirection === true;
        this.seed = parameters.seed;
        if (this.rendererSettings.renderMode === RenderMode.Mesh && !this.rendererSettings.instancingNormals) {
            this.rendererSettings.instancingNormals = ParticleSystem.createFallbackNormals(
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
        this.markForDestroy = false;
        this.prewarmed = false;
    }

    private applyMaterialSettings(
        material: any,
        overrides: {
            blendMode?: number;
            transparent?: boolean;
            depthTest?: boolean;
            depthWrite?: boolean;
            alphaTest?: number;
            texture?: Texture | null;
            reflectionAtlas?: BaseTexture | null;
            layerMask?: number;
        } = {}
    ) {
        /* istanbul ignore if -- rendererSettings is always assigned in the constructor before any code path can call this private method */
        if (!this.rendererSettings) {
            return;
        }

        const resolvedTexture =
            overrides.texture !== undefined
                ? overrides.texture
                : (material?.albedoTexture ??
                  material?.diffuseTexture ??
                  material?.emissiveTexture ??
                  material?.opacityTexture ??
                  material?.baseTexture ??
                  this.rendererSettings.texture ??
                  null);
        const resolvedReflection =
            material?.reflectionTexture ??
            material?.environmentTexture ??
            this.rendererSettings.reflectionTexture ??
            null;
        const resolvedReflectionLevel = typeof resolvedReflection?.level === 'number' ? resolvedReflection.level : 1;
        const resolvedBlendMode =
            overrides.blendMode ??
            (typeof material?.alphaMode === 'number' ? material.alphaMode : this.rendererSettings.materialBlendMode);
        const resolvedTransparent =
            overrides.transparent ??
            (typeof material?.needAlphaBlending === 'function'
                ? material.needAlphaBlending()
                : typeof material?.alpha === 'number'
                  ? material.alpha < 1
                  : this.rendererSettings.materialTransparent);
        const resolvedDepthTest =
            overrides.depthTest ??
            (typeof material?.disableDepthTest === 'boolean'
                ? !material.disableDepthTest
                : this.rendererSettings.materialDepthTest);
        const resolvedDepthWrite =
            overrides.depthWrite ??
            (typeof material?.disableDepthWrite === 'boolean'
                ? !material.disableDepthWrite
                : typeof material?.forceDepthWrite === 'boolean'
                  ? material.forceDepthWrite
                  : this.rendererSettings.materialDepthWrite);
        const resolvedAlphaTest =
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
                return this.rendererSettings.materialAlphaTest;
            })();

        this.rendererSettings.texture = resolvedTexture;
        this.rendererSettings.reflectionTexture = resolvedReflection;
        this.rendererSettings.reflectionLevel =
            typeof material?.reflectionLevel === 'number' ? material.reflectionLevel : resolvedReflectionLevel;
        // Prefer an explicit atlas; otherwise build a 3×2 atlas from CubeTexture
        // face URLs (iOS-safe single sampler2D — not samplerCube / six faces).
        let resolvedAtlas =
            material?.reflectionAtlas ?? overrides.reflectionAtlas ?? this.rendererSettings.reflectionAtlas ?? null;
        if (!resolvedAtlas && resolvedReflection?.isCube) {
            resolvedAtlas = getCachedEnvAtlas(resolvedReflection);
            if (!resolvedAtlas && this.sceneRef) {
                ensureEnvAtlasFromCube(resolvedReflection, this.sceneRef, (atlas) => {
                    if (this.rendererSettings.reflectionAtlas === atlas) {
                        return;
                    }
                    this.rendererSettings.reflectionAtlas = atlas;
                    if (material && material.reflectionAtlas == null) {
                        material.reflectionAtlas = atlas;
                    }
                    this.neededToUpdateRender = true;
                });
                resolvedAtlas = getCachedEnvAtlas(resolvedReflection);
            }
        }
        this.rendererSettings.reflectionAtlas = resolvedAtlas;
        // Do not expand cube files into six face textures anymore — that path
        // still trips GL_INVALID_OPERATION on iOS. Prefer a single atlas.
        this.rendererSettings.reflectionFaces =
            material?.reflectionFaces?.length === 6 ? material.reflectionFaces : null;
        this.rendererSettings.materialBlendMode = resolvedBlendMode;
        this.rendererSettings.materialTransparent = resolvedTransparent;
        this.rendererSettings.materialDepthTest = resolvedDepthTest;
        this.rendererSettings.materialDepthWrite = resolvedDepthWrite;
        this.rendererSettings.materialAlphaTest = resolvedAlphaTest;
        if (overrides.layerMask !== undefined) {
            this.rendererSettings.layerMask = overrides.layerMask;
        }
        this.neededToUpdateRender = true;
    }

    pause() {
        this.paused = true;
    }
    play() {
        this.paused = false;
    }
    stop() {
        this.restart();
        this.pause();
    }

    setQualityFactor(qualityFactor: number) {
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

    endEmit() {
        this.emitEnded = true;
        if (this.autoDestroy) {
            this.markForDestroy = true;
        }
        this.fire({type: 'emitEnd', particleSystem: this});
    }

    /** Whether {@link dispose} has run. A disposed system emits nothing and cannot be restarted. */
    get isDisposed(): boolean {
        return this.destroyed;
    }

    dispose() {
        if (this.destroyed) {
            return;
        }
        this.destroyed = true;
        // Nothing updates a disposed system again, so its particles would never die.
        this.particleNum = 0;
        if (this._renderer) this._renderer.deleteSystem(this);
        disposeEmitterForSystem(this.emitter);
        this.fire({type: 'destroy', particleSystem: this});
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
            this.startDelayTimeLeft = this.startDelay.genValue(this.memory, 0);
            this.emissionOverTime.startGen(this.memory);
        } finally {
            if (rng !== undefined) {
                setRandomSource(previous ?? null);
            }
        }
    }

    restart() {
        if (this.destroyed) {
            return;
        }
        this.memory.length = 0;
        this.paused = false;
        this.particleNum = 0;
        this.boundsValid = false;
        this.pendingCatchUp = 0;
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
        this.behaviors.forEach((behavior) => behavior.reset());
        this.emitEnded = false;
        this.markForDestroy = false;
        this.finishedEventFired = false;
        this.prewarmed = false;
        this.initSystemGenerators();
        this.previousEmitterPos = undefined;
        this.emitterVelocity.set(0, 0, 0);
        this.simulationAccumulator = 0;
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
        if (this.paused) return;
        delta *= this.playbackSpeed;

        if (this.culled) {
            // Out of every camera's view. A paused system holds its particles
            // where they are; a catching-up one also remembers the time it missed.
            if (this.cullingMode === 'pauseAndCatchUp') {
                this.pendingCatchUp = Math.min(MAX_CATCH_UP_SECONDS, this.pendingCatchUp + delta);
            }
            return;
        }
        if (this.pendingCatchUp > 0) {
            this.catchUp(catchUpDeadline ?? performance.now() + ParticleSystem.catchUpBudgetMs);
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
            if (delta > 0.1) {
                delta = 0.1;
            }
            this.simulationAccumulator += delta;
            const stepsToRun = Math.min(
                MAX_SIMULATION_STEPS_PER_FRAME,
                Math.max(0, Math.round(this.simulationAccumulator / SIMULATION_STEP - ROUND_TIE_BIAS))
            );
            this.simulationAccumulator -= stepsToRun * SIMULATION_STEP;
            return;
        }

        if (this.looping && this.prewarm && !this.prewarmed) {
            this.prewarmed = true;
            for (let i = 0; i < this.duration * PREWARM_FPS; i++) {
                this.update(1.0 / PREWARM_FPS);
            }
        }

        if (delta > 0.1) {
            delta = 0.1;
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
        // prewarm, matching Unity). Carry the remainder so a large frame does
        // not lose time.
        if (this.startDelayTimeLeft > 0 && !(this.prewarm && this.looping)) {
            this.startDelayTimeLeft -= delta;
            if (this.startDelayTimeLeft >= 0) return;
            delta = Math.min(-this.startDelayTimeLeft, 0.1);
            this.startDelayTimeLeft = 0;
        }

        this.simulationAccumulator += delta;
        const stepsToRun = Math.min(
            MAX_SIMULATION_STEPS_PER_FRAME,
            Math.max(0, Math.round(this.simulationAccumulator / SIMULATION_STEP - ROUND_TIE_BIAS))
        );
        for (let i = 0; i < stepsToRun; i++) {
            this.simulateStep(SIMULATION_STEP);
            if (stepDeadline !== Infinity && i + 1 < stepsToRun && performance.now() >= stepDeadline) {
                // Over the frame's simulation budget: the remaining steps' time
                // is consumed below without being simulated.
                break;
            }
        }
        this.simulationAccumulator -= stepsToRun * SIMULATION_STEP;
    }

    /** Runs the steps a system missed while culled, as many as fit before `deadline`. */
    private catchUp(deadline: number): void {
        let steps = Math.floor(this.pendingCatchUp / SIMULATION_STEP);
        this.pendingCatchUp = 0;
        while (steps-- > 0) {
            this.simulateStep(SIMULATION_STEP);
            if (steps > 0 && performance.now() >= deadline) {
                break;
            }
        }
    }

    /**
     * Records the bounds the sprite step measured over the live particles.
     * Trails are measured by their renderer instead, since their ribbons live
     * outside the store.
     */
    private storeBounds(
        count: number,
        measured: boolean,
        minX: number,
        minY: number,
        minZ: number,
        maxX: number,
        maxY: number,
        maxZ: number,
        maxSize: number,
        maxSpeedSq: number
    ): void {
        if (count === 0) {
            this.boundsValid = false;
            return;
        }
        this.stepsSinceBounds = measured ? 0 : this.stepsSinceBounds + 1;
        this.boundsMaxSize = maxSize;
        this.boundsMaxSpeedSq = maxSpeedSq;
        const maxSpeed = Math.sqrt(maxSpeedSq);
        const renderMode = this.rendererSettings.renderMode;
        // How far past its position a particle can be drawn: half a quad's
        // diagonal plus its pivot, a mesh's radius, or a stretched quad's tail.
        // Plus the motion since the last measurement, and the step the renderer
        // moves particles on along their velocity.
        let padding = maxSpeed * SIMULATION_STEP * (this.stepsSinceBounds + 1);
        if (renderMode === RenderMode.Mesh) {
            padding += maxSize * this.meshGeometryRadius();
        } else if (renderMode === RenderMode.StretchedBillBoard) {
            const settings = this.rendererEmitterSettings as StretchedBillBoardSettings;
            padding += maxSize * (1 + (settings.lengthFactor ?? 0) + maxSpeed * (settings.speedFactor ?? 0));
        } else {
            const pivot = this.rendererSettings.pivot;
            const pivotReach = pivot === undefined ? 0 : Math.abs(pivot.x) + Math.abs(pivot.y) + Math.abs(pivot.z);
            padding += maxSize * (0.75 + pivotReach);
        }
        this.boundsMin.set(minX, minY, minZ);
        this.boundsMax.set(maxX, maxY, maxZ);
        this.boundsPadding = padding;
        this.boundsInWorld = this.worldSpace;
        this.boundsValid = true;
    }

    /** Distance of the farthest vertex of the mesh particles' geometry from its origin. */
    private meshGeometryRadius(): number {
        const geometry = this.rendererSettings.instancingGeometry;
        if (geometry !== this.geometryRadiusFor) {
            let radiusSq = 0;
            for (let o = 0; o + 2 < geometry.length; o += 3) {
                const d =
                    geometry[o] * geometry[o] + geometry[o + 1] * geometry[o + 1] + geometry[o + 2] * geometry[o + 2];
                if (d > radiusSq) radiusSq = d;
            }
            this.geometryRadius = Math.sqrt(radiusSq);
            this.geometryRadiusFor = geometry;
        }
        return this.geometryRadius;
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
        if (!this.measureWorldBounds(min, max)) {
            return false;
        }
        if (this.rendererSettings.renderMode === RenderMode.Beam) {
            // The quads reach the beam's end, which moves on its own. Without
            // one a beam draws nothing beyond its particles.
            const end = this.beamEndScratch;
            if (!this.getBeamEnd(end)) {
                return true;
            }
            const pad = this.boundsInWorld ? this.boundsPadding : this.boundsPadding * this.emitterMaxScale();
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

    /** The largest axis of the emitter's world scale. */
    private emitterMaxScale(): number {
        const e = this.emitter.matrixWorld.elements;
        return Math.sqrt(
            Math.max(
                e[0] * e[0] + e[1] * e[1] + e[2] * e[2],
                e[4] * e[4] + e[5] * e[5] + e[6] * e[6],
                e[8] * e[8] + e[9] * e[9] + e[10] * e[10]
            )
        );
    }

    private measureWorldBounds(min: Vector3, max: Vector3): boolean {
        if (!this.boundsValid) {
            return false;
        }
        const bmin = this.boundsMin;
        const bmax = this.boundsMax;
        if (this.boundsInWorld) {
            const pad = this.boundsPadding;
            min.set(bmin.x - pad, bmin.y - pad, bmin.z - pad);
            max.set(bmax.x + pad, bmax.y + pad, bmax.z + pad);
            return true;
        }
        // Local bounds: the box of the eight transformed corners, padded by the
        // reach scaled by the emitter's largest axis.
        const e = this.emitter.matrixWorld.elements;
        const scale = Math.sqrt(
            Math.max(
                e[0] * e[0] + e[1] * e[1] + e[2] * e[2],
                e[4] * e[4] + e[5] * e[5] + e[6] * e[6],
                e[8] * e[8] + e[9] * e[9] + e[10] * e[10]
            )
        );
        const pad = this.boundsPadding * scale;
        let minX = Infinity;
        let minY = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let maxZ = -Infinity;
        for (let corner = 0; corner < 8; corner++) {
            const x = corner & 1 ? bmax.x : bmin.x;
            const y = corner & 2 ? bmax.y : bmin.y;
            const z = corner & 4 ? bmax.z : bmin.z;
            const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
            const wx = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
            const wy = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
            const wz = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
            if (wx < minX) minX = wx;
            if (wx > maxX) maxX = wx;
            if (wy < minY) minY = wy;
            if (wy > maxY) maxY = wy;
            if (wz < minZ) minZ = wz;
            if (wz > maxZ) maxZ = wz;
        }
        min.set(minX - pad, minY - pad, minZ - pad);
        max.set(maxX + pad, maxY + pad, maxZ + pad);
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
        this.boundsMin.set(minX, minY, minZ);
        this.boundsMax.set(maxX, maxY, maxZ);
        this.boundsPadding = padding;
        this.boundsInWorld = true;
        this.boundsValid = true;
    }

    /**
     * Time the display is ahead of (positive) or still ahead of the simulation
     * (negative — the simulation ran a hair early), in seconds. Magnitude never
     * exceeds one step.
     *
     * The simulation runs on a fixed 1/60 step so that emission and lifetimes
     * stay in phase — without it a slow emitter flickers when the frame rate
     * wobbles. But frames do not arrive on that grid: a display running at
     * anything other than exactly 60Hz leaves some frames with no step at all
     * (half of them at 120Hz, three in five at 144Hz) and others with two, so
     * the particles are drawn stuttering even while the frame rate is perfect.
     *
     * The steps-per-frame count below is chosen by *rounding* the accumulated
     * time to the nearest step, not flooring it. Flooring always leaves the
     * accumulator positive, and when the real frame rate sits very close to
     * 60Hz (as most displays do) that leftover creeps toward a full step for
     * many consecutive frames before tipping over into a frame that runs two
     * steps at once and resets it to near zero — a visible lurch, every particle
     * in the system at once, with a perfectly steady frame rate the whole time.
     * Rounding lets the leftover go negative instead, which keeps it centered
     * near zero and stops it from ever building up toward that reset.
     *
     * Renderers close the gap by advancing what they draw along each particle's
     * velocity by this much. That reproduces the straight-line part of the
     * motion exactly — it is the same term the next step would integrate — so
     * the simulation stays fixed-step while the picture moves continuously.
     */
    /** Length of one simulation step, in seconds. See {@link simulationResidual}. */
    get simulationStep(): number {
        return SIMULATION_STEP;
    }

    get simulationResidual(): number {
        if (this.paused) {
            return 0;
        }
        // Magnitude never more than a step, even if a frame long enough to hit
        // the per-frame step cap left the accumulator with more than that.
        if (this.simulationAccumulator > SIMULATION_STEP) return SIMULATION_STEP;
        if (this.simulationAccumulator < -SIMULATION_STEP) return -SIMULATION_STEP;
        return this.simulationAccumulator;
    }

    /**
     * Execution plan for this system's behaviors, rebuilt when the list changes.
     *
     * Consecutive behaviors that can be compiled into one loop are merged, so
     * the particles are walked once instead of once per behavior. The plan is
     * keyed on the behavior instances, not their types: swapping one out has to
     * change the generated code's indices.
     */
    private behaviorSteps(): Array<FusionStep> {
        const behaviors = this.behaviors;
        const cached = this.fusionPlan;
        if (cached !== undefined && cached.length === behaviors.length) {
            let same = true;
            for (let i = 0; i < behaviors.length; i++) {
                if (cached[i] !== behaviors[i]) {
                    same = false;
                    break;
                }
            }
            if (same) {
                return this.fusionSteps;
            }
        }
        this.fusionPlan = behaviors.slice();
        this.fusionSteps = planBehaviorFusion(behaviors);
        let changesSize = false;
        let changesColor = false;
        for (let i = 0; i < behaviors.length; i++) {
            const type = behaviors[i].type;
            if (SIZE_BEHAVIORS.has(type)) {
                changesSize = true;
            } else if (COLOR_BEHAVIORS.has(type)) {
                changesColor = true;
            } else if (!INERT_FOR_SIZE_AND_COLOR.has(type)) {
                // Unknown to this list, so it may write anything.
                changesSize = true;
                changesColor = true;
            }
        }
        this.planChangesSize = changesSize;
        this.planChangesColor = changesColor;
        return this.fusionSteps;
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
        this.motionScale = this.measureMotionScale();
        if (!this.onlyUsedByOther) {
            this.emit(delta, this.emissionState, this.emitter.matrixWorld);
        }

        const particles = this.particles;
        const behaviors = this.behaviors;
        const behaviorCount = behaviors.length;
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
        const steps = this.behaviorSteps();
        // Size and colour are only snapshotted when some behavior can change
        // them; otherwise the columns stay what spawn wrote and the renderer
        // reads them as they are.
        const snapshotSize = this.planChangesSize;
        const snapshotColor = this.planChangesColor;
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

        const notifyDeaths = this.hasListeners('particleDied');
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
            const measure = this.stepsSinceBounds >= BOUNDS_REFRESH_STEPS || !this.boundsValid;
            const carriedMin = this.boundsMin;
            const carriedMax = this.boundsMax;
            let minX = measure ? Infinity : carriedMin.x;
            let minY = measure ? Infinity : carriedMin.y;
            let minZ = measure ? Infinity : carriedMin.z;
            let maxX = measure ? -Infinity : carriedMax.x;
            let maxY = measure ? -Infinity : carriedMax.y;
            let maxZ = measure ? -Infinity : carriedMax.z;
            let maxSize = measure ? 0 : this.boundsMaxSize;
            let maxSpeedSq = measure ? 0 : this.boundsMaxSpeedSq;
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
                        this.fire({type: 'particleDied', particleSystem: this, particle: particle});
                    }
                }
            }
            this.particleNum = liveParticleCount;
            this.storeBounds(liveParticleCount, measure, minX, minY, minZ, maxX, maxY, maxZ, maxSize, maxSpeedSq);
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
                    this.fire({type: 'particleDied', particleSystem: this, particle: particle});
                }
            }
        }
        this.particleNum = liveParticleCount;
        this.notifyFinished();
    }

    private notifyFinished(): void {
        if (!this.isFinished()) {
            return;
        }
        if (!this.finishedEventFired) {
            this.finishedEventFired = true;
            this.fire({type: 'finished', particleSystem: this});
        }
        if (this.autoDestroy) {
            this.markForDestroy = true;
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

    emit(delta: number, emissionState: EmissionState, emitterMatrix: Matrix4) {
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

    toJSON(metaData?: BabylonMetaData | string, _options: SerializationOptions = {}): ParticleSystemJSONParameters {
        const isRootObject = metaData === undefined || typeof metaData === 'string';
        const meta: BabylonMetaData = isRootObject
            ? {
                  geometries: {},
                  materials: {},
                  textures: {},
                  images: {},
                  shapes: {},
                  skeletons: {},
                  animations: {},
                  nodes: {},
              }
            : metaData;

        const geometryUUID = this.ensureGeometryMeta(meta);
        const materialUUID = this.ensureMaterialMeta(meta);
        const rendererEmitterSettingsJSON = this.toRendererSettingsJSON();

        return {
            version: '3.0',
            autoDestroy: this.autoDestroy,
            looping: this.looping,
            prewarm: this.prewarm,
            duration: this.duration,
            startDelay: this.startDelay.toJSON(),
            shape: this.emitterShape.toJSON(),
            startLife: this.startLife.toJSON(),
            startSpeed: this.startSpeed.toJSON(),
            startRotation: this.startRotation.toJSON(),
            startSize: this.startSize.toJSON(),
            startColor: this.startColor.toJSON(),
            emissionOverTime: this.emissionOverTime.toJSON(),
            emissionOverDistance: this.emissionOverDistance.toJSON(),
            emissionBursts: this.emissionBursts.map((burst) => ({
                time: burst.time,
                count: burst.count.toJSON(),
                probability: burst.probability,
                interval: burst.interval,
                cycle: burst.cycle,
            })),
            ...(this.maxParticles !== undefined ? {maxParticles: this.maxParticles} : {}),
            onlyUsedByOther: this.onlyUsedByOther,
            instancingGeometry: geometryUUID,
            renderMode: this.renderMode,
            renderOrder: this.renderOrder,
            ...(this.renderingGroupId !== 0 ? {renderingGroupId: this.renderingGroupId} : {}),
            ...(this.applyFog ? {} : {applyFog: false}),
            ...(this.playbackSpeed !== 1 ? {playbackSpeed: this.playbackSpeed} : {}),
            ...(this.cullingMode !== 'always' ? {cullingMode: this.cullingMode} : {}),
            ...(this.scalingMode !== 'shape' ? {scalingMode: this.scalingMode} : {}),
            ...(this.seedValue !== undefined ? {seed: this.seedValue} : {}),
            ...(this.sortMode !== 'none' ? {sortMode: this.sortMode} : {}),
            ...(this.alignToDirection ? {alignToDirection: true} : {}),
            ...(this.minParticleSize > 0 ? {minParticleSize: this.minParticleSize} : {}),
            ...(this.maxParticleSize !== Infinity ? {maxParticleSize: this.maxParticleSize} : {}),
            rendererEmitterSettings: rendererEmitterSettingsJSON,
            material: materialUUID,
            layers: this.rendererSettings.layerMask,
            startTileIndex: this.startTileIndex.toJSON(),
            uTileCount: this.rendererSettings.uTileCount,
            vTileCount: this.rendererSettings.vTileCount,
            blendTiles: this.rendererSettings.blendTiles,
            softParticles: this.rendererSettings.softParticles,
            softFarFade: this.rendererSettings.softFarFade,
            softNearFade: this.rendererSettings.softNearFade,
            blending: this.rendererSettings.materialBlendMode,
            transparent: this.rendererSettings.materialTransparent,
            depthTest: this.rendererSettings.materialDepthTest,
            depthWrite: this.rendererSettings.materialDepthWrite,
            alphaTest: this.rendererSettings.materialAlphaTest,
            behaviors: this.behaviors.map((b) => b.toJSON()),
            worldSpace: this.worldSpace,
            ...(this.pivot ? {pivot: [this.pivot.x, this.pivot.y, this.pivot.z]} : {}),
            ...(this.flip ? {flip: [this.flip.x, this.flip.y]} : {}),
        };
    }

    static fromJSON(
        json: ParticleSystemJSONParameters,
        meta: BabylonMetaData,
        dependencies: {[uuid: string]: Behavior} = {},
        scene?: Scene
    ): ParticleSystem {
        const shape = EmitterFromJSON(json.shape, meta as any);
        let rendererEmitterSettings: RendererEmitterSettings;
        if (json.renderMode === RenderMode.Trail) {
            const trailSettings = json.rendererEmitterSettings as TrailSettings;
            rendererEmitterSettings = {
                startLength:
                    trailSettings?.startLength !== undefined
                        ? ValueGeneratorFromJSON(trailSettings.startLength)
                        : new ConstantValue(30),
                followLocalOrigin: trailSettings?.followLocalOrigin ?? false,
                ...trailFlags(trailSettings),
                ...trailCurve(trailSettings),
                ...trailSideAxisFromJSON((trailSettings as {sideAxis?: unknown} | undefined)?.sideAxis),
            };
        } else if (json.renderMode === RenderMode.StretchedBillBoard) {
            rendererEmitterSettings = {...(json.rendererEmitterSettings ?? {})};
            if (json.speedFactor !== undefined) {
                (rendererEmitterSettings as StretchedBillBoardSettings).speedFactor = json.speedFactor;
            }
        } else {
            rendererEmitterSettings = {};
        }

        const materialMeta = json.material ? meta.materials?.[json.material] : undefined;
        const materialTextureRef = materialMeta?.texture ?? json.texture;
        const texture =
            typeof materialTextureRef === 'string'
                ? (meta.textures?.[materialTextureRef] ?? null)
                : (materialTextureRef ?? null);
        // Texture effects reference textures by uuid in a serialised meta, or hold them once a loader resolved them.
        const resolveTexture = (ref: unknown): BaseTexture | null =>
            typeof ref === 'string' ? (meta.textures?.[ref] ?? null) : ((ref as BaseTexture | null) ?? null);
        const erosionMeta = materialMeta?.erosion;
        const gradientMeta = materialMeta?.gradientMap;
        const distortionMeta = materialMeta?.uvDistortion;
        const resolvedGeometryEntry =
            typeof json.instancingGeometry === 'string'
                ? meta.geometries?.[json.instancingGeometry]
                : json.instancingGeometry;
        const resolvedGeometry = ParticleSystem.resolveGeometryData(resolvedGeometryEntry);

        const ps = new ParticleSystem({
            scene,
            autoDestroy: json.autoDestroy,
            looping: json.looping,
            prewarm: json.prewarm,
            duration: json.duration,
            startDelay: json.startDelay ? ValueGeneratorFromJSON(json.startDelay) : undefined,
            shape,
            startLife: ValueGeneratorFromJSON(json.startLife),
            startSpeed: ValueGeneratorFromJSON(json.startSpeed),
            startRotation: GeneratorFromJSON(json.startRotation) as
                | RotationGenerator
                | ValueGenerator
                | FunctionValueGenerator,
            startSize: GeneratorFromJSON(json.startSize) as Vector3Generator | ValueGenerator | FunctionValueGenerator,
            startColor: ColorGeneratorFromJSON(json.startColor) as ColorGenerator,
            emissionOverTime: ValueGeneratorFromJSON(json.emissionOverTime),
            emissionOverDistance: ValueGeneratorFromJSON(json.emissionOverDistance),
            emissionBursts: json.emissionBursts?.map((burst: any) => ({
                time: burst.time,
                count:
                    typeof burst.count === 'number'
                        ? new ConstantValue(burst.count)
                        : ValueGeneratorFromJSON(burst.count),
                probability: burst.probability ?? 1,
                interval: burst.interval ?? 0.1,
                cycle: burst.cycle ?? burst.cycleCount ?? 1,
            })),
            maxParticles: typeof json.maxParticles === 'number' ? json.maxParticles : undefined,
            onlyUsedByOther: json.onlyUsedByOther,
            instancingGeometry: resolvedGeometry.positions,
            instancingIndices: resolvedGeometry.indices,
            instancingUVs: resolvedGeometry.uvs,
            instancingUVs2: resolvedGeometry.uvs2,
            instancingNormals: resolvedGeometry.normals,
            renderMode: json.renderMode,
            rendererEmitterSettings,
            renderOrder: json.renderOrder,
            renderingGroupId: typeof json.renderingGroupId === 'number' ? json.renderingGroupId : undefined,
            applyFog: json.applyFog !== false,
            playbackSpeed: typeof json.playbackSpeed === 'number' ? json.playbackSpeed : undefined,
            cullingMode: ParticleSystem.validCullingMode(json.cullingMode),
            scalingMode: json.scalingMode === 'hierarchy' ? 'hierarchy' : 'shape',
            seed: typeof json.seed === 'number' ? json.seed : undefined,
            sortMode: ParticleSystem.validSortMode(json.sortMode),
            alignToDirection: json.alignToDirection === true,
            minParticleSize: typeof json.minParticleSize === 'number' ? json.minParticleSize : undefined,
            maxParticleSize: typeof json.maxParticleSize === 'number' ? json.maxParticleSize : undefined,
            texture,
            material: materialMeta?.sourceMaterial ?? materialMeta,
            blendMode: materialMeta?.alphaMode ?? json.blending ?? Constants.ALPHA_ADD,
            transparent: materialMeta?.transparent ?? json.transparent ?? true,
            depthTest: materialMeta?.depthTest ?? json.depthTest ?? true,
            depthWrite: materialMeta?.depthWrite ?? json.depthWrite ?? false,
            alphaTest: materialMeta?.alphaTest ?? json.alphaTest ?? 0,
            startTileIndex:
                typeof json.startTileIndex === 'number'
                    ? new ConstantValue(json.startTileIndex)
                    : (ValueGeneratorFromJSON(json.startTileIndex) as ValueGenerator),
            uTileCount: json.uTileCount,
            vTileCount: json.vTileCount,
            blendTiles: json.blendTiles,
            softParticles: json.softParticles,
            softFarFade: json.softFarFade,
            softNearFade: json.softNearFade,
            behaviors: [],
            worldSpace: json.worldSpace,
            layerMask: json.layers,
            pivot: json.pivot ? new Vector3(json.pivot[0] ?? 0, json.pivot[1] ?? 0, json.pivot[2] ?? 0) : undefined,
            flip: json.flip ? new Vector2(json.flip[0] ?? 0, json.flip[1] ?? 0) : undefined,
            lighting: materialMeta?.lighting,
            rim: materialMeta?.rim,
            mapUV: materialMeta?.mapUV,
            gradientMap:
                gradientMeta && typeof gradientMeta === 'object'
                    ? {...gradientMeta, ramp: resolveTexture(gradientMeta.ramp)}
                    : undefined,
            erosion:
                erosionMeta && typeof erosionMeta === 'object'
                    ? {...erosionMeta, mask: resolveTexture(erosionMeta.mask)}
                    : undefined,
            uvDistortion:
                distortionMeta && typeof distortionMeta === 'object'
                    ? {...distortionMeta, map: resolveTexture(distortionMeta.map)}
                    : undefined,
        });
        ps.behaviors = (json.behaviors ?? [])
            .map((behaviorJson) => {
                const behavior = BehaviorFromJSON(behaviorJson, ps);
                if (behavior && behavior.type === 'EmitSubParticleSystem') {
                    dependencies[(behaviorJson as any).subParticleSystem] = behavior;
                }
                return behavior;
            })
            .filter((behavior) => behavior !== null) as Behavior[];
        return ps;
    }

    private static nextSerializationId(prefix: string): string {
        ParticleSystem.serializationCounter += 1;
        return `${prefix}_${ParticleSystem.serializationCounter}`;
    }

    /** Normals facing +Z, one array per geometry so systems sharing it still batch together. */
    private static createFallbackNormals(positions: Float32Array): Float32Array {
        let normals = fallbackNormals.get(positions);
        if (!normals) {
            normals = new Float32Array(positions.length);
            for (let i = 2; i < normals.length; i += 3) {
                normals[i] = 1;
            }
            fallbackNormals.set(positions, normals);
        }
        return normals;
    }

    private toRendererSettingsJSON(): RendererEmitterSettings {
        if (this.renderMode === RenderMode.Trail) {
            return {
                startLength: (this.rendererEmitterSettings as TrailSettings).startLength.toJSON(),
                followLocalOrigin: (this.rendererEmitterSettings as TrailSettings).followLocalOrigin,
                ...trailFlags(this.rendererEmitterSettings as TrailSettings),
                ...trailCurve(this.rendererEmitterSettings as TrailSettings),
                ...(trailSideAxisJSON(this.rendererEmitterSettings as TrailSettings) as {sideAxis?: any}),
            };
        }
        if (this.renderMode === RenderMode.StretchedBillBoard) {
            return {
                speedFactor: (this.rendererEmitterSettings as StretchedBillBoardSettings).speedFactor,
                lengthFactor: (this.rendererEmitterSettings as StretchedBillBoardSettings).lengthFactor,
            };
        }
        return {};
    }

    private ensureGeometryMeta(meta: BabylonMetaData): string {
        const geometryUUID = ParticleSystem.nextSerializationId('quarks_geometry');
        meta.geometries[geometryUUID] = {
            uuid: geometryUUID,
            type: 'QuarksGeometry',
            positions: Array.from(this.rendererSettings.instancingGeometry),
            indices: Array.from(this.rendererSettings.instancingIndices),
            uvs: this.rendererSettings.instancingUVs ? Array.from(this.rendererSettings.instancingUVs) : undefined,
            ...(this.rendererSettings.instancingUVs2 ? {uvs2: Array.from(this.rendererSettings.instancingUVs2)} : {}),
            normals: this.rendererSettings.instancingNormals
                ? Array.from(this.rendererSettings.instancingNormals)
                : undefined,
        };
        return geometryUUID;
    }

    private ensureMaterialMeta(meta: BabylonMetaData): string {
        const texture = this.rendererSettings.texture;
        let textureUUID: string | undefined;
        if (texture) {
            textureUUID = ParticleSystem.nextSerializationId('quarks_texture');
            meta.textures[textureUUID] = texture;
        }

        const reflectionAtlas = this.rendererSettings.reflectionAtlas;
        let reflectionAtlasUUID: string | undefined;
        if (reflectionAtlas instanceof Texture) {
            reflectionAtlasUUID = ParticleSystem.nextSerializationId('quarks_texture');
            meta.textures[reflectionAtlasUUID] = reflectionAtlas;
        }

        const textureRef = (value: BaseTexture | null | undefined): string | undefined => {
            if (!(value instanceof Texture)) {
                return undefined;
            }
            const uuid = ParticleSystem.nextSerializationId('quarks_texture');
            meta.textures[uuid] = value;
            return uuid;
        };
        const erosion = this.erosion;
        const distortion = this.uvDistortion;
        const gradientMap = this.gradientMap;
        const optional = <T>(key: string, value: T | undefined) => (value !== undefined ? {[key]: value} : {});

        const materialUUID = ParticleSystem.nextSerializationId('quarks_material');
        meta.materials[materialUUID] = {
            uuid: materialUUID,
            type: 'QuarksMaterial',
            transparent: this.rendererSettings.materialTransparent,
            alphaMode: this.rendererSettings.materialBlendMode,
            depthTest: this.rendererSettings.materialDepthTest,
            depthWrite: this.rendererSettings.materialDepthWrite,
            alphaTest: this.rendererSettings.materialAlphaTest,
            texture: textureUUID,
            reflectionAtlas: reflectionAtlasUUID,
            reflectionLevel: this.rendererSettings.reflectionLevel,
            // Written only when not the default, so existing effects serialise as before.
            ...(this.lighting !== 'fixed' ? {lighting: this.lighting} : {}),
            ...(this.rim ? {rim: {...this.rim, color: [...this.rim.color]}} : {}),
            ...optional('mapUV', this.mapUV ? textureUVToJSON(this.mapUV) : undefined),
            ...(gradientMap
                ? {
                      gradientMap: {
                          ramp: textureRef(gradientMap.ramp),
                          ...(gradientMap.channel !== 'r' ? {channel: gradientMap.channel} : {}),
                      },
                  }
                : {}),
            ...(erosion
                ? {
                      erosion: {
                          mask: textureRef(erosion.mask),
                          ...optional('maskUV', textureUVToJSON(erosion.maskUV)),
                          softness: erosion.softness,
                          edgeWidth: erosion.edgeWidth,
                          edgeColor: [...erosion.edgeColor],
                      },
                  }
                : {}),
            ...(distortion
                ? {
                      uvDistortion: {
                          map: textureRef(distortion.map),
                          ...optional('mapUV', textureUVToJSON(distortion.mapUV, UV_DISTORTION_DEFAULT_UV)),
                          strength: distortion.strength,
                      },
                  }
                : {}),
            sourceMaterial: this.materialRef ?? undefined,
        };
        return materialUUID;
    }

    private static resolveGeometryData(entry: any): {
        positions: Float32Array;
        indices: Uint32Array | Uint16Array;
        uvs?: Float32Array;
        uvs2?: Float32Array;
        normals?: Float32Array;
    } {
        if (entry?.positions) {
            const positions =
                entry.positions instanceof Float32Array ? entry.positions : new Float32Array(entry.positions);
            const rawIndices =
                entry.indices instanceof Uint16Array || entry.indices instanceof Uint32Array
                    ? entry.indices
                    : entry.indices
                      ? new Uint32Array(entry.indices)
                      : undefined;
            return {
                positions,
                indices: ensureTriangleIndices(positions, rawIndices),
                uvs: entry.uvs
                    ? entry.uvs instanceof Float32Array
                        ? entry.uvs
                        : new Float32Array(entry.uvs)
                    : undefined,
                uvs2: entry.uvs2
                    ? entry.uvs2 instanceof Float32Array
                        ? entry.uvs2
                        : new Float32Array(entry.uvs2)
                    : undefined,
                normals: entry.normals
                    ? entry.normals instanceof Float32Array
                        ? entry.normals
                        : new Float32Array(entry.normals)
                    : undefined,
            };
        }

        const data = entry?.data ?? entry;
        if (data?.attributes?.position?.array) {
            const positions = new Float32Array(data.attributes.position.array);
            let indices: Uint32Array | Uint16Array | undefined;
            if (data.index?.array) {
                const indexType = data.index.type === 'Uint16Array' ? Uint16Array : Uint32Array;
                indices = new indexType(data.index.array);
            }
            return {
                positions,
                indices: ensureTriangleIndices(positions, indices),
                uvs: data.attributes.uv?.array ? new Float32Array(data.attributes.uv.array) : undefined,
                // three.js names the second set `uv1` (r151 on), `uv2` before.
                uvs2: (data.attributes.uv1 ?? data.attributes.uv2)?.array
                    ? new Float32Array((data.attributes.uv1 ?? data.attributes.uv2).array)
                    : undefined,
                normals: data.attributes.normal?.array ? new Float32Array(data.attributes.normal.array) : undefined,
            };
        }

        return {
            positions: DEFAULT_POSITIONS,
            indices: DEFAULT_INDICES,
            uvs: DEFAULT_UVS,
        };
    }

    addBehavior(behavior: Behavior) {
        this.behaviors.push(behavior);
        // A sub emitter added here changes which system has to update first.
        this._renderer?._invalidateUpdateOrder();
    }

    getRendererSettings(): VFXBatchSettings {
        return this.rendererSettings;
    }

    addEventListener(event: ParticleSystemEventType, callback: (event: ParticleSystemEvent) => void): void {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    removeAllEventListeners(event: ParticleSystemEventType): void {
        if (this.listeners[event]) this.listeners[event] = [];
    }

    removeEventListener(event: ParticleSystemEventType, callback: (event: ParticleSystemEvent) => void): void {
        if (this.listeners[event]) {
            const index = this.listeners[event].indexOf(callback);
            if (index !== -1) this.listeners[event].splice(index, 1);
        }
    }

    /** True when at least one callback is registered for the event type. */
    private hasListeners(event: ParticleSystemEventType): boolean {
        const callbacks = this.listeners[event];
        return callbacks !== undefined && callbacks.length > 0;
    }

    private fire(event: ParticleSystemEvent) {
        const callbacks = this.listeners[event.type];
        if (callbacks === undefined) {
            return;
        }
        for (let i = 0; i < callbacks.length; i++) {
            callbacks[i](event);
        }
    }

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
            autoDestroy: this.autoDestroy,
            looping: this.looping,
            prewarm: this.prewarm,
            duration: this.duration,
            startDelay: this.startDelay.clone(),
            shape: this.emitterShape.clone(),
            startLife: this.startLife.clone(),
            startSpeed: this.startSpeed.clone(),
            startRotation: this.startRotation.clone(),
            startSize: this.startSize.clone(),
            startColor: this.startColor.clone(),
            emissionOverTime: this.emissionOverTime.clone(),
            emissionOverDistance: this.emissionOverDistance.clone(),
            emissionBursts: this.emissionBursts.map((b) => ({...b, count: b.count.clone()})),
            maxParticles: this.maxParticles,
            onlyUsedByOther: this.onlyUsedByOther,
            instancingGeometry: this.rendererSettings.instancingGeometry,
            instancingIndices: this.rendererSettings.instancingIndices,
            instancingUVs: this.rendererSettings.instancingUVs,
            instancingUVs2: this.rendererSettings.instancingUVs2,
            instancingNormals: this.rendererSettings.instancingNormals,
            renderMode: this.renderMode,
            renderOrder: this.renderOrder,
            renderingGroupId: this.renderingGroupId,
            applyFog: this.applyFog,
            playbackSpeed: this.playbackSpeed,
            cullingMode: this.cullingMode,
            scalingMode: this.scalingMode,
            seed: this.seedValue,
            sortMode: this.sortMode,
            alignToDirection: this.alignToDirection,
            minParticleSize: this.minParticleSize,
            maxParticleSize: this.maxParticleSize,
            rendererEmitterSettings,
            material: this.materialRef,
            texture: this.rendererSettings.texture,
            startTileIndex: this.startTileIndex.clone(),
            uTileCount: this.rendererSettings.uTileCount,
            vTileCount: this.rendererSettings.vTileCount,
            blendTiles: this.rendererSettings.blendTiles,
            softParticles: this.rendererSettings.softParticles,
            softFarFade: this.rendererSettings.softFarFade,
            softNearFade: this.rendererSettings.softNearFade,
            behaviors: newBehaviors,
            worldSpace: this.worldSpace,
            blendMode: this.rendererSettings.materialBlendMode,
            transparent: this.rendererSettings.materialTransparent,
            depthTest: this.rendererSettings.materialDepthTest,
            depthWrite: this.rendererSettings.materialDepthWrite,
            alphaTest: this.rendererSettings.materialAlphaTest,
            layerMask: this.rendererSettings.layerMask,
            pivot: this.pivot,
            flip: this.flip,
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
