import {loadPlugin} from 'quarks.core';
import {MeshSurfaceEmitterPlugin} from './MeshSurfaceEmitter';
import {registerShaderChunks} from './shaders';

export * from 'quarks.core';
export {BatchedParticleRenderer} from './BatchedParticleRenderer';
export {BatchedRenderer} from './BatchedRenderer';
export type {AdaptivePerformanceOptions, AdaptivePerformanceState, VFXBatchSettings} from './BatchedRenderer';
export {EffectPool} from './EffectPool';
export type {EffectPoolOptions} from './EffectPool';
export {
    cacheEnvAtlas,
    createEnvAtlasFromFaceUrls,
    cubeFaceUrls,
    disposeEnvAtlas,
    ensureEnvAtlasFromCube,
    getCachedEnvAtlas,
} from './envAtlas';
export * from './materials/';
export {MeshSurfaceEmitter, MeshSurfaceEmitterPlugin} from './MeshSurfaceEmitter';
export {quarksNodeId} from './nodeId';
export {ParticleEmitter} from './ParticleEmitter';
export {ParticleSystem} from './ParticleSystem';
export type {
    BabylonMetaData,
    BeamEnd,
    BurstParameters,
    BurstParametersJSON,
    CullingMode,
    ParticleSystemJSONParameters,
    ParticleSystemParameters,
    ScalingMode,
} from './ParticleSystem';
export {QuarksFormatError, QuarksLoader} from './QuarksLoader';
export type {
    QuarksBatchLoadOptions,
    QuarksJSONLoadEntry,
    QuarksLoadOptions,
    QuarksLoaderOptions,
    QuarksResourceKind,
    QuarksResourceResolver,
} from './QuarksLoader';
export {QuarksPrefab} from './QuarksPrefab';
export type {AnimationData, QuarksTimelineClip} from './QuarksPrefab';
export {QUARKS_FORMAT_VERSION, serializeEffect} from './QuarksSerializer';
export type {
    QuarksEffectJSON,
    QuarksGeometryJSON,
    QuarksImageJSON,
    QuarksNodeJSON,
    QuarksTextureJSON,
    SerializeEffectOptions,
} from './QuarksSerializer';
export {QuarksUtil} from './QuarksUtil';
export * from './shaders/';
export {decodeSoftDepth, softDepthParams} from './softDepth';
export type {DepthTextureOptions, SoftDepthEncoding} from './softDepth';
export {SpriteBatch} from './SpriteBatch';
export {TrailBatch} from './TrailBatch';
export {MAX_TRAIL_TESSELLATION, trailCurveTension, trailTessellation} from './trailCurve';
export {
    defaultMeshLighting,
    erosionEqual,
    GRADIENT_MAP_WEIGHTS,
    gradientMapEqual,
    mapUVEqual,
    meshRimEqual,
    normalizeErosion,
    normalizeGradientMap,
    normalizeMapUV,
    normalizeMeshRim,
    normalizeTextureUV,
    normalizeUVDistortion,
    readsUV1,
    RenderMode,
    textureUVEqual,
    textureUVToJSON,
    UV_DISTORTION_DEFAULT_UV,
    uvDistortionEqual,
    VFXBatch,
} from './VFXBatch';
export type {
    GradientMapChannel,
    MeshLighting,
    MeshLightingSettings,
    MeshRim,
    ParticleErosion,
    ParticleErosionOptions,
    ParticleGradientMap,
    ParticleUVDistortion,
    ParticleUVDistortionOptions,
    SortMode,
    StoredBatchSettings,
    TextureUV,
    UVChannel,
} from './VFXBatch';

// Re-export quarks.core types (interfaces - type-only)
export type {
    Behavior,
    BillBoardSettings,
    ColorGenerator,
    EmissionState,
    EmitterShape,
    FunctionColorGenerator,
    FunctionValueGenerator,
    IEmitter,
    IParticle,
    IParticleSystem,
    MeshSettings,
    Particle,
    ParticleSystemEvent,
    ParticleSystemEventType,
    RendererEmitterSettings,
    RotationGenerator,
    SerializationOptions,
    StretchedBillBoardSettings,
    TrailSettings,
    ValueGenerator,
    Vector3Generator,
} from 'quarks.core';

registerShaderChunks();
loadPlugin(MeshSurfaceEmitterPlugin);
