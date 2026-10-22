import type {Texture} from '@babylonjs/core/Materials/Textures/texture';
import type {Scene} from '@babylonjs/core/scene';
import type {
    Behavior,
    ColorGenerator,
    EmitterShape,
    FunctionColorGenerator,
    FunctionJSON,
    FunctionValueGenerator,
    RendererEmitterSettings,
    RotationGenerator,
    ValueGenerator,
    Vector2,
    Vector3,
    Vector3Generator,
} from 'quarks.core';
import type {
    MeshLighting,
    MeshRim,
    ParticleErosionOptions,
    ParticleGradientMap,
    ParticleUVDistortionOptions,
    RenderMode,
    SortMode,
    TextureUV,
} from '../VFXBatch';

/**
 * One burst of a system's emission (Unity's Emission Bursts): `count` particles at `time` seconds
 * into each loop, repeated `cycle` times `interval` seconds apart, each wave with the chance
 * `probability`.
 */
export interface BurstParameters {
    /** Seconds into the system's duration the first wave fires at. */
    time: number;
    /**
     * Particles each wave spawns, rolled once per loop. A curve is read at the seconds into the
     * cycle the wave fires, not at the 0 to 1 fraction of the duration the start curves use.
     */
    count: ValueGenerator | FunctionValueGenerator;
    /** How many waves the burst fires, at least 1. */
    cycle: number;
    /** Seconds between waves; 0 or less fires them all at once. */
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
    /** See {@link ParticleSystem.autoDestroy}. Default false. */
    autoDestroy?: boolean;
    /** See {@link ParticleSystem.looping}. Default true. */
    looping?: boolean;
    /** See {@link ParticleSystem.prewarm}. Default false. */
    prewarm?: boolean;
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
    /** @deprecated Set `speedFactor` in {@link rendererEmitterSettings} instead; this one wins when both are set. */
    speedFactor?: number;
    /** See {@link ParticleSystem.material}. Default none. */
    material?: unknown;
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
    /** See {@link ParticleSystem.softFarFade}. Default 0. */
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
    /** Scene the emitter node is created in. Default Babylon's last created scene. */
    scene?: Scene;
}

/** A {@link BurstParameters} in an effect file. A plain number `count` is read as a constant. */
export interface BurstParametersJSON {
    /** See {@link BurstParameters.time}. */
    time: number;
    /** See {@link BurstParameters.count}. */
    count: FunctionJSON | number;
    /** See {@link BurstParameters.cycle}. */
    cycle: number;
    /** See {@link BurstParameters.interval}. */
    interval: number;
    /** See {@link BurstParameters.probability}. */
    probability: number;
}

/**
 * A particle system in an effect file, as {@link ParticleSystem.toJSON} writes it and
 * {@link ParticleSystem.fromJSON} reads it; `docs/FORMAT.md` describes the document around it.
 * Each field mirrors the {@link ParticleSystem} member of the same name. Curves and generators
 * are written as quarks.core's `FunctionJSON`; textures, materials and geometries as uuids into
 * the document.
 */
export interface ParticleSystemJSONParameters {
    /** The quarks.core version line the system was written with. */
    version: string;
    /** See {@link ParticleSystem.autoDestroy}. */
    autoDestroy: boolean;
    /** See {@link ParticleSystem.looping}. */
    looping: boolean;
    /** See {@link ParticleSystem.prewarm}. */
    prewarm: boolean;
    /** See {@link ParticleSystem.duration}. */
    duration: number;
    /** See {@link ParticleSystem.startDelay}. */
    startDelay?: FunctionJSON;
    /** The emitter shape, as its `toJSON` writes it. */
    shape: any;
    /** See {@link ParticleSystem.startLife}. */
    startLife: FunctionJSON;
    /** See {@link ParticleSystem.startSpeed}. */
    startSpeed: FunctionJSON;
    /** See {@link ParticleSystem.startRotation}. */
    startRotation: FunctionJSON;
    /** See {@link ParticleSystem.startSize}. */
    startSize: FunctionJSON;
    /** See {@link ParticleSystem.startColor}. */
    startColor: FunctionJSON;
    /** See {@link ParticleSystem.emissionOverTime}. */
    emissionOverTime: FunctionJSON;
    /** See {@link ParticleSystem.emissionOverDistance}. */
    emissionOverDistance: FunctionJSON;
    /** See {@link ParticleSystem.emissionBursts}. */
    emissionBursts?: Array<BurstParametersJSON>;
    /** See {@link ParticleSystem.maxParticles}. */
    maxParticles?: number;
    /** See {@link ParticleSystem.onlyUsedByOther}. */
    onlyUsedByOther: boolean;
    /** Trail, stretched or mesh settings; a trail's `startLength` as `FunctionJSON`. */
    rendererEmitterSettings: RendererEmitterSettings;
    /** Uuid of the mesh particles' geometry entry. */
    instancingGeometry?: any;
    /** A {@link RenderMode} value. */
    renderMode: number;
    /** See {@link ParticleSystem.renderOrder}. */
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
    /** A stretched billboard's speed factor, as older files wrote it outside `rendererEmitterSettings`. */
    speedFactor?: number;
    /** Uuid of the texture entry. */
    texture?: string;
    /** Uuid of the material entry. */
    material?: string;
    /** The camera layer mask. */
    layers?: number;
    /** See {@link ParticleSystem.startTileIndex}. */
    startTileIndex: FunctionJSON | number;
    /** See {@link ParticleSystem.uTileCount}. */
    uTileCount: number;
    /** See {@link ParticleSystem.vTileCount}. */
    vTileCount: number;
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
    behaviors: Array<any>;
    /** See {@link ParticleSystem.worldSpace}. */
    worldSpace: boolean;
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
    textures: {[uuid: string]: Texture | null};
    /** Material entries by uuid. */
    materials: {[uuid: string]: any};
    /** Geometry entries by uuid. */
    geometries: {[uuid: string]: any};
    /** Image entries by uuid. */
    images?: {[uuid: string]: any};
    /** Not used by babylon.quarks; kept for three.js-shaped documents. */
    shapes?: {[uuid: string]: any};
    /** Not used by babylon.quarks; kept for three.js-shaped documents. */
    skeletons?: {[uuid: string]: any};
    /** Not used by babylon.quarks; kept for three.js-shaped documents. */
    animations?: {[uuid: string]: any};
    /** Nodes by uuid, which a mesh surface shape links to. */
    nodes?: {[uuid: string]: any};
}
