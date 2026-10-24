import type {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import type {Texture} from '@babylonjs/core/Materials/Textures/texture';
import type {Scene} from '@babylonjs/core/scene';
import type {
    Behavior,
    BehaviorJSON,
    ColorGenerator,
    ColorGeneratorJSON,
    EmitterShape,
    FunctionColorGenerator,
    FunctionValueGenerator,
    RendererEmitterSettings,
    RotationGenerator,
    RotationGeneratorJSON,
    ShapeJSON,
    StretchedBillBoardSettings,
    ValueGenerator,
    ValueGeneratorJSON,
    Vector2Like,
    Vector3ArrayJSON,
    Vector3Generator,
    Vector3GeneratorJSON,
    Vector3JSON,
    Vector3Like,
} from 'quarks.core';
import type {
    MeshLighting,
    MeshRim,
    ParticleErosionOptions,
    ParticleGradientMap,
    ParticleUVDistortionOptions,
    RenderFace,
    RenderMode,
    SortMode,
    TextureUV,
} from '../VFXBatch';
import type {GeometryEntry, QuarksMaterialJSON} from '../effectDocumentJSON';
import type {TrailOptions} from '../trailSettings';
import type {ParticleMaterialSource} from './materialResolve';

/** A trail's settings in JSON, each only when not its default: the start length as a generator's JSON, the side axis as `[x, y, z]`. */
export type TrailSettingsJSON = Partial<TrailOptions> & {
    /** See `TrailSettings.startLength`. */
    startLength?: ValueGeneratorJSON;
    /** See `TrailSettings.sideAxis`; files may hold it as `{x, y, z}`. */
    sideAxis?: Vector3ArrayJSON | Vector3JSON;
};

/**
 * A render mode's own settings in JSON, see {@link RendererEmitterSettings}: a trail's or a
 * stretched billboard's. The other render modes have none, and their systems leave the field out.
 */
export type RendererEmitterSettingsJSON = TrailSettingsJSON | StretchedBillBoardSettings;

/**
 * One burst of a system's emission (Unity's Emission Bursts): `count` particles at `time` seconds
 * into each loop, repeated `cycle` times `interval` seconds apart, each wave with the chance
 * `probability`. A burst given to the constructor or read from a file is normalised (a missing
 * `interval` is 0.1 s, `probability` is kept to 0..1, `cycle` to at least 1) and the bursts are
 * kept in time order.
 */
export interface BurstParameters {
    /** Seconds into the system's duration the first wave fires at. */
    time: number;
    /**
     * Particles each wave spawns. The generator is rolled when the system plays or restarts, so
     * a random count is the same for every loop of one play; a curve is read at the wave's time
     * as a fraction of the duration, 0 to 1, like the start curves.
     */
    count: ValueGenerator | FunctionValueGenerator;
    /** How many waves the burst fires, at least 1. */
    cycle: number;
    /** Seconds between waves; 0 fires them all at once. 0.1 when left out. */
    interval: number;
    /** Chance from 0 to 1 that a wave spawns at all, rolled per wave. */
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
 *
 * The cameras tested are the scene's active cameras (`scene.activeCameras`, or
 * `scene.activeCamera`), each only for the systems on a layer it renders
 * (`camera.layerMask & system.layers.mask`). A camera that renders into a
 * render target texture (a mirror, a minimap, a portal) is not one of them: a
 * system seen only through one should keep `'always'`.
 */
export type CullingMode = 'always' | 'pause' | 'pauseAndCatchUp';

/**
 * What a system does once it has finished, its emission over and its last particle dead (Unity's
 * Stop Action):
 *
 * - `'none'` (the default): nothing; {@link ParticleSystem.restart} plays it again.
 * - `'disable'`: disables its emitter node (`setEnabled(false)`), and with it the nodes under it.
 *   A disabled system is not advanced or drawn; enable the emitter again before playing it.
 * - `'destroy'`: disposes the system and its emitter, as `ParticleSystem.dispose()` does.
 *
 * Unity's Callback is the system's `finished` event, which fires whatever the stop action. The
 * action waits for the system's sub emitters, see {@link ParticleSystem.stopAction}. A disabled
 * emitter is state like any other: saved as not visible, and copied disabled by `clone`.
 */
export type StopAction = 'none' | 'disable' | 'destroy';

/**
 * What a full system does with the particles it emits next (Unity's Ring Buffer Mode). It needs
 * {@link ParticleSystemParameters.maxParticles}; without a limit it is ignored.
 *
 * - `'disabled'` (the default): particles die at the end of their life, and a full system drops
 *   what it would emit.
 * - `'pauseUntilReplaced'`: a particle at the end of its life stays where and as it is, frozen,
 *   until a new particle replaces it, the oldest first. For footprints, decals and bullet holes.
 * - `'loopUntilReplaced'`: a particle at the end of its life goes back to an earlier point of it
 *   and plays that part again, over and over, until a new particle replaces it; see
 *   {@link ParticleSystem.ringBufferLoopRange}.
 *
 * Particles are never killed by age, so a system in either mode keeps its particles and does not
 * finish while it has any: a non-looping ring effect never fires `finished`, and an
 * `EffectPool` copy of it returns to the pool only when it is released. A replaced particle
 * does not fire `particleDied`, nor Death sub emitters, which never fire in either mode since
 * no particle dies. Lowering `maxParticles` drops the oldest particles over the new limit, also
 * without `particleDied`. Particles are replaced oldest first in the order they were emitted;
 * switching a mode on in a system whose particles have already died in a different order
 * replaces them in row order the first time round. `'oldestInFront'` and `'youngestInFront'`
 * sorting reads age, so a looping particle sorts by its age in the loop. Applies in every
 * render mode but Trail, whose particles always die at the end of their life.
 */
export type RingBufferMode = 'disabled' | 'pauseUntilReplaced' | 'loopUntilReplaced';

/**
 * What the emitter's scale does to the system, as Unity's Scaling Mode, in world and local space
 * alike. The scale reaches the emission shape, the particles' size, their start speed and, in world
 * space, `ForceOverLife`, `ApplyForce` and `LimitSpeedOverLife` (by the mean of the axes), so a
 * scaled effect looks and moves like a scaled model, except where a mode leaves it out:
 *
 * - `'local'` (default, as in Unity): only the emitter's own `scaling`; its parents' scale is left
 *   out, so an effect keeps its size under a scaled character or prop.
 * - `'hierarchy'`: the emitter's whole world scale, its parents' included.
 * - `'shape'`: the world scale sizes the emission shape alone; the particles keep their size and
 *   speed, so a bigger emitter spreads the same particles over a larger area.
 *
 * Under every mode the emitter's position, rotation and any mirroring come from the whole
 * hierarchy; only the length of each axis changes. A sub emission starts in its parent particle's
 * frame and takes its size and speed from that, not from the sub emitter's scale; `'shape'` still
 * scales its shape by the sub emitter's world scale. With a non-uniform scale `'shape'` stretches
 * where particles start, not the directions the shape sends them.
 *
 * Known differences from Unity: a world force (`ForceOverLife`, `ApplyForce`, and so the gravity
 * the Unity exporter writes) is scaled with the motion in `'local'` and `'hierarchy'`, where
 * Unity's gravity is not.
 */
export type ScalingMode = 'local' | 'hierarchy' | 'shape';

/**
 * Where a {@link RenderMode.Beam} system's quads end: a point in world space,
 * or anything with a world position, such as a Babylon `TransformNode`, read
 * every frame.
 */
export type BeamEnd =
    | {
          /** World x. */
          x: number;
          /** World y. */
          y: number;
          /** World z. */
          z: number;
      }
    | {
          /** The world position, read every frame. */
          getAbsolutePosition(): {
              /** World x. */
              x: number;
              /** World y. */
              y: number;
              /** World z. */
              z: number;
          };
      };

/**
 * Settings for a new {@link ParticleSystem}. Every one is optional: a setting left out takes the
 * default named on it, the same default `fromJSON` gives a file that leaves it out.
 */
export interface ParticleSystemParameters {
    /** What the system does once it has finished, see {@link StopAction}. Default `'none'`. */
    stopAction?: StopAction;
    /** See {@link ParticleSystem.looping}. Default true. */
    looping?: boolean;
    /** See {@link ParticleSystem.prewarm}. Default false. */
    prewarm?: boolean;
    /** See {@link ParticleSystem.prewarmTime}. Default 0: a whole cycle; only with `prewarm` on a looping system. */
    prewarmTime?: number;
    /** See {@link ParticleSystem.duration}. Default 1 second. */
    duration?: number;
    /** See {@link ParticleSystem.startDelay}. Default 0. */
    startDelay?: ValueGenerator | FunctionValueGenerator;
    /** Where particles are born and which way they start, see {@link ParticleSystem.emitterShape}. Default a `SphereEmitter`. */
    shape?: EmitterShape;
    /** See {@link ParticleSystem.startLife}. Default 5 seconds. */
    startLife?: ValueGenerator | FunctionValueGenerator;
    /** See {@link ParticleSystem.startSpeed}. Default 0. */
    startSpeed?: ValueGenerator | FunctionValueGenerator;
    /** See {@link ParticleSystem.startRotation}. Default 0. */
    startRotation?: ValueGenerator | FunctionValueGenerator | RotationGenerator;
    /** See {@link ParticleSystem.startSize}. Default 1. */
    startSize?: ValueGenerator | FunctionValueGenerator | Vector3Generator;
    /** See {@link ParticleSystem.startColor}. Default opaque white. */
    startColor?: ColorGenerator | FunctionColorGenerator;
    /** See {@link ParticleSystem.emissionOverTime}. Default 10 per second. */
    emissionOverTime?: ValueGenerator | FunctionValueGenerator;
    /** See {@link ParticleSystem.emissionOverDistance}. Default 0. */
    emissionOverDistance?: ValueGenerator | FunctionValueGenerator;
    /** See {@link ParticleSystem.emissionBursts}. Default none. */
    emissionBursts?: Array<BurstParameters>;
    /** Most particles alive at once; emission past it is dropped. Leave unset for no limit. */
    maxParticles?: number;
    /** What a full system does with new particles, see {@link RingBufferMode}. Default `'disabled'`. */
    ringBufferMode?: RingBufferMode;
    /** See {@link ParticleSystem.ringBufferLoopRange}. Default the whole life, (0, 1). */
    ringBufferLoopRange?: Vector2Like;
    /** See {@link ParticleSystem.onlyUsedByOther}. Default false. */
    onlyUsedByOther?: boolean;
    /** See {@link ParticleSystem.behaviors}. Default none. */
    behaviors?: Array<Behavior>;
    /** Mesh particles' vertex positions, three values per vertex. Default a unit quad in XY. */
    instancingGeometry?: Float32Array;
    /** Triangle indices into {@link instancingGeometry}. Default the unit quad's two triangles. */
    instancingIndices?: Uint32Array | Uint16Array;
    /** Mesh particles' first UV set, two values per vertex. Default the quad's UVs, or zeros for another geometry. */
    instancingUVs?: Float32Array;
    /**
     * A second UV set for the mesh (glTF `TEXCOORD_1`, Unity's `uv2`), what
     * textures on UV channel 1 read on a mesh particle; see `UVChannel`.
     * Default none: channel 1 reads the first set.
     */
    instancingUVs2?: Float32Array;
    /** Mesh particles' vertex normals, three values per vertex. Default +Z for every vertex. */
    instancingNormals?: Float32Array;
    /** See {@link ParticleSystem.renderMode}. Default `RenderMode.BillBoard`. */
    renderMode?: RenderMode;
    /** See {@link ParticleSystem.rendererEmitterSettings}. Default the render mode's own. */
    rendererEmitterSettings?: RendererEmitterSettings;
    /** See {@link ParticleSystem.material}. Default none. */
    material?: ParticleMaterialSource | null;
    /** See {@link ParticleSystem.texture}. Unset takes the material's texture; null draws without one. */
    texture?: Texture | null;
    /** See {@link ParticleSystem.startTileIndex}. Default 0. */
    startTileIndex?: ValueGenerator;
    /** See {@link ParticleSystem.uTileCount}. Default 1. */
    uTileCount?: number;
    /** See {@link ParticleSystem.vTileCount}. Default 1. */
    vTileCount?: number;
    /** See {@link ParticleSystem.blendTiles}. Default false. */
    blendTiles?: boolean;
    /**
     * Fade particles out as they near the scene behind them, like Unity's Soft Particles and
     * Unreal's Depth Fade, between `softNearFade` and `softFarFade` world units. Needs a depth
     * texture, see `BatchedRenderer.setDepthTexture`; without one particles draw hard. Applies to
     * every render mode: billboard, stretched, mesh, beam and trail.
     */
    softParticles?: boolean;
    /** See {@link ParticleSystem.softFarFade}. Default 1. */
    softFarFade?: number;
    /** See {@link ParticleSystem.softNearFade}. Default 0. */
    softNearFade?: number;
    /** See {@link ParticleSystem.renderOrder}. Default 0. */
    renderOrder?: number;
    /** See {@link ParticleSystem.worldSpace}. Default false. */
    worldSpace?: boolean;
    /** Babylon alpha mode the batch blends with, see {@link ParticleSystem.blending}. Default `Constants.ALPHA_ADD`. */
    blendMode?: number;
    /** Whether the batch draws in the transparent pass. Default true. */
    transparent?: boolean;
    /**
     * Whether particles are hidden behind nearer geometry. `false` draws them over everything
     * (Unity's `ZTest Always`), in every render mode. Default `true`.
     */
    depthTest?: boolean;
    /** Whether the particles write depth. Default false. */
    depthWrite?: boolean;
    /** Alpha below which a fragment is discarded, 0 to 1. Default 0: nothing is. */
    alphaTest?: number;
    /** Camera layer mask the batch draws for, see {@link ParticleSystem.layers}. Default `0x0fffffff`. */
    layerMask?: number;
    /** Billboard pivot in particle-size units, see {@link VFXBatchSettings.pivot}. */
    pivot?: Vector3Like;
    /** Fraction of billboard particles mirrored along U (x) and V (y), see {@link ParticleSystem.flip}. */
    flip?: Vector2Like;
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
    /** What the emitter's scale does to the system, see {@link ScalingMode}. Default `'local'`. */
    scalingMode?: ScalingMode;
    /** Seed for this system's own random generator, see {@link ParticleSystem.seed}. Default none. */
    seed?: number;
    /** Draw order within the batch, see {@link ParticleSystem.sortMode}. Default `'none'`. */
    sortMode?: SortMode;
    /** Which faces a mesh particle draws, see {@link ParticleSystem.renderFace}. Default `'both'`. */
    renderFace?: RenderFace;
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
    /** Whether the scene's image processing applies, see {@link ParticleSystem.applyImageProcessing}. Default true. */
    applyImageProcessing?: boolean;
    /** Scene the emitter node is created in. Default Babylon's last created scene. */
    scene?: Scene;
}

/** A {@link BurstParameters} in an effect file. A plain number `count` is read as a constant. */
export interface BurstParametersJSON {
    /** See {@link BurstParameters.time}. */
    time: number;
    /** See {@link BurstParameters.count}. */
    count: ValueGeneratorJSON | number;
    /** See {@link BurstParameters.cycle}. */
    cycle: number;
    /** See {@link BurstParameters.interval}. */
    interval: number;
    /** See {@link BurstParameters.probability}. */
    probability: number;
    /** `cycle`, as files before it was named wrote it; read when there is no `cycle`. */
    cycleCount?: number;
}

/**
 * A particle system in an effect file, as {@link ParticleSystem.toJSON} writes it and
 * {@link ParticleSystem.fromJSON} reads it; `docs/FORMAT.md` describes the document around it.
 * Each field mirrors the {@link ParticleSystem} member of the same name. Curves and generators
 * are written as quarks.core's `FunctionJSON`; textures, materials and geometries as uuids into
 * the document. Most settings are written only when they differ from their default, and a field
 * that is missing reads as the default, so every field but `version` is optional. The shape, the
 * start and emission curves except `startDelay`, `startTileIndex`, `instancingGeometry`, `material`
 * and `behaviors` are always written, because older loaders and three.quarks need them.
 */
export interface ParticleSystemJSONParameters {
    /** The quarks.core version line the system was written with. */
    version: string;
    /** Written only when not `'none'`. */
    stopAction?: StopAction;
    /** Read from older files: `true` is `stopAction: 'destroy'`. No longer written. */
    autoDestroy?: boolean;
    /** See {@link ParticleSystem.looping}. */
    looping?: boolean;
    /** See {@link ParticleSystem.prewarm}. */
    prewarm?: boolean;
    /** See {@link ParticleSystem.prewarmTime}. */
    prewarmTime?: number;
    /** See {@link ParticleSystem.duration}. */
    duration?: number;
    /** See {@link ParticleSystem.startDelay}. */
    startDelay?: ValueGeneratorJSON;
    /** The emitter shape, as its `toJSON` writes it. */
    shape?: ShapeJSON;
    /** See {@link ParticleSystem.startLife}. */
    startLife?: ValueGeneratorJSON;
    /** See {@link ParticleSystem.startSpeed}. */
    startSpeed?: ValueGeneratorJSON;
    /** See {@link ParticleSystem.startRotation}. */
    startRotation?: ValueGeneratorJSON | RotationGeneratorJSON;
    /** See {@link ParticleSystem.startSize}. */
    startSize?: ValueGeneratorJSON | Vector3GeneratorJSON;
    /** See {@link ParticleSystem.startColor}. */
    startColor?: ColorGeneratorJSON;
    /** See {@link ParticleSystem.emissionOverTime}. */
    emissionOverTime?: ValueGeneratorJSON;
    /** See {@link ParticleSystem.emissionOverDistance}. */
    emissionOverDistance?: ValueGeneratorJSON;
    /** See {@link ParticleSystem.emissionBursts}. */
    emissionBursts?: Array<BurstParametersJSON>;
    /** See {@link ParticleSystem.maxParticles}. */
    maxParticles?: number;
    /** Written only when not `'disabled'`. */
    ringBufferMode?: RingBufferMode;
    /** `[start, end]`; written only when not `[0, 1]`. */
    ringBufferLoopRange?: [number, number];
    /** See {@link ParticleSystem.onlyUsedByOther}. */
    onlyUsedByOther?: boolean;
    /**
     * Trail, stretched or mesh settings; a trail's `startLength` as `ValueGeneratorJSON`. Left out when
     * the render mode has none.
     */
    rendererEmitterSettings?: RendererEmitterSettingsJSON;
    /** Uuid of the mesh particles' geometry entry; a document made in code may hold the entry itself. */
    instancingGeometry?: string | GeometryEntry;
    /** A {@link RenderMode} value. */
    renderMode?: number;
    /** See {@link ParticleSystem.renderOrder}. */
    renderOrder?: number;
    /** Written only when not 0. */
    renderingGroupId?: number;
    /** Written only when false. */
    applyFog?: boolean;
    /** Written only when false. */
    applyImageProcessing?: boolean;
    /** Written only when not 1. */
    playbackSpeed?: number;
    /** Written only when not `'always'`. */
    cullingMode?: CullingMode;
    /** Written only when not `'local'`. */
    scalingMode?: ScalingMode;
    /** Written only when set. */
    seed?: number;
    /** Written only when not `'none'`. */
    sortMode?: SortMode;
    /** Written only when not `'both'`. */
    renderFace?: RenderFace;
    /** Written only when true. */
    alignToDirection?: boolean;
    /** Written only when not 0. */
    minParticleSize?: number;
    /** Written only when limited. */
    maxParticleSize?: number;
    /** A stretched billboard's speed factor, as older files wrote it outside `rendererEmitterSettings`. */
    speedFactor?: number;
    /** Uuid of the texture entry. */
    texture?: string;
    /** Uuid of the material entry. */
    material?: string;
    /** The camera layer mask. */
    layers?: number;
    /** See {@link ParticleSystem.startTileIndex}. */
    startTileIndex?: ValueGeneratorJSON | number;
    /** See {@link ParticleSystem.uTileCount}. */
    uTileCount?: number;
    /** See {@link ParticleSystem.vTileCount}. */
    vTileCount?: number;
    /** See {@link ParticleSystem.blendTiles}. */
    blendTiles?: boolean;
    /** See {@link ParticleSystem.softParticles}. */
    softParticles?: boolean;
    /** See {@link ParticleSystem.softFarFade}. */
    softFarFade?: number;
    /** See {@link ParticleSystem.softNearFade}. */
    softNearFade?: number;
    /** See {@link ParticleSystem.blending}. */
    blending?: number;
    /** See {@link ParticleSystemParameters.transparent}. */
    transparent?: boolean;
    /** See {@link ParticleSystemParameters.depthTest}. */
    depthTest?: boolean;
    /** See {@link ParticleSystemParameters.depthWrite}. */
    depthWrite?: boolean;
    /** See {@link ParticleSystemParameters.alphaTest}. */
    alphaTest?: number;
    /** Each behavior as its `toJSON` writes it. */
    behaviors?: BehaviorJSON[];
    /** See {@link ParticleSystem.worldSpace}. */
    worldSpace?: boolean;
    /** `[x, y, z]`; written only when non-zero. */
    pivot?: number[];
    /** `[u, v]`; written only when non-zero. */
    flip?: number[];
}

/**
 * The resources of one effect document, by uuid: what {@link ParticleSystem.toJSON} writes a
 * system's geometry, material and texture into, and what {@link ParticleSystem.fromJSON} resolves
 * them from. While writing, entries hold live Babylon objects; `serializeEffect` turns them into
 * plain data.
 */
export interface BabylonMetaData {
    /** Textures by uuid; null for one that could not be made. */
    textures: {[uuid: string]: BaseTexture | null};
    /** Material entries by uuid. */
    materials: {[uuid: string]: QuarksMaterialJSON};
    /** Geometry entries by uuid. */
    geometries: {[uuid: string]: GeometryEntry};
    /** Not used by babylon.quarks; kept for three.js-shaped documents. */
    images?: {[uuid: string]: unknown};
    /** Not used by babylon.quarks; kept for three.js-shaped documents. */
    shapes?: {[uuid: string]: unknown};
    /** Not used by babylon.quarks; kept for three.js-shaped documents. */
    skeletons?: {[uuid: string]: unknown};
    /** Not used by babylon.quarks; kept for three.js-shaped documents. */
    animations?: {[uuid: string]: unknown};
    /** Not used by babylon.quarks; kept for three.js-shaped documents. */
    nodes?: {[uuid: string]: unknown};
}
