import {loadPlugin} from 'quarks.core';
import {MeshSurfaceEmitterPlugin} from './MeshSurfaceEmitter';

export * from 'quarks.core';
export {BatchedRenderer} from './BatchedRenderer';
export type {AdaptivePerformanceOptions, AdaptivePerformanceState, VFXBatchSettings} from './BatchedRenderer';
export type {
    BufferAttributeJSON,
    BufferGeometryAttributesJSON,
    BufferGeometryDataJSON,
    BufferGeometryJSON,
    BufferIndexJSON,
    EffectDocumentJSON,
    EffectGeometryJSON,
    EffectImageJSON,
    ErosionJSON,
    GeometryArrays,
    GeometryEntry,
    GradientMapJSON,
    InterleavedBufferJSON,
    MaterialTextureRef,
    PlaneGeometryJSON,
    QuarksGeometryEntryJSON,
    QuarksMaterialJSON,
    SphereGeometryJSON,
    UVDistortionJSON,
} from './effectDocumentJSON';
export {EffectPool} from './EffectPool';
export type {EffectPlacement, EffectPoolOptions} from './EffectPool';
export {
    cacheEnvAtlas,
    createEnvAtlasFromFaceUrls,
    cubeFaceUrls,
    disposeEnvAtlas,
    ensureEnvAtlasFromCube,
    getCachedEnvAtlas,
} from './envAtlas';
export {MeshSurfaceEmitter, MeshSurfaceEmitterPlugin} from './MeshSurfaceEmitter';
export {quarksNodeId} from './nodeId';
export {ParticleEmitter} from './ParticleEmitter';
export type {ParticleEmitterJSON} from './ParticleEmitter';
export {ParticleSystem} from './ParticleSystem';
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
} from './ParticleSystem';
export {QuarksFormatError, QuarksLoader} from './QuarksLoader';
export type {
    QuarksBatchLoadOptions,
    QuarksJSONLoadEntry,
    QuarksLoaderOptions,
    QuarksLoadOptions,
    QuarksResolveOptions,
    QuarksResourceKind,
    QuarksResourceResolver,
} from './QuarksLoader';
export {QuarksPrefab} from './QuarksPrefab';
export type {AnimationData, AnimationJSON, QuarksPrefabJSON, QuarksTimelineClip} from './QuarksPrefab';
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
export {blendCategory, shaderProgram} from './shaderProgram';
export type {
    BlendCategory,
    BlendOutput,
    FogTarget,
    ShaderContext,
    ShaderDepth,
    ShaderProgram,
    ShaderSettings,
} from './shaderProgram';
export type {ShaderSources} from './shaders/shaderLanguageSupport';
export {shaderVariants} from './shaderVariants';
export type {ShaderVariant} from './shaderVariants';
export {decodeSoftDepth, softDepthParams} from './softDepth';
export type {DepthTextureOptions, SoftDepthEncoding} from './softDepth';
export type {ParticleMaterialSource} from './system/materialResolve';
export type {RendererEmitterSettingsJSON, TrailSettingsJSON} from './system/types';
export {textureSourceUrl} from './textureSource';
export {
    MAX_TRAIL_TESSELLATION,
    trailCurveTension,
    trailLifetime,
    trailMinVertexDistance,
    trailTessellation,
    trailTextureMode,
    trailTextureScale,
    type TrailOptions,
} from './trailSettings';
export {
    defaultMeshLighting,
    EROSION_DEFAULT_SOFTNESS,
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
    UV_DISTORTION_DEFAULT_STRENGTH,
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
    RenderFace,
    SortMode,
    StoredBatchSettings,
    TextureUV,
    UVChannel,
} from './VFXBatch';

loadPlugin(MeshSurfaceEmitterPlugin);
