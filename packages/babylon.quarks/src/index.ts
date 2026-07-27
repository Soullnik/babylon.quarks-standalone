import {loadPlugin} from 'quarks.core';
import {MeshSurfaceEmitterPlugin} from './MeshSurfaceEmitter';
import {registerShaderChunks} from './shaders';

export * from 'quarks.core';
export {BatchedParticleRenderer} from './BatchedParticleRenderer';
export {BatchedRenderer} from './BatchedRenderer';
export type {AdaptivePerformanceOptions, AdaptivePerformanceState, VFXBatchSettings} from './BatchedRenderer';
export {
    cacheEnvAtlas,
    createEnvAtlasFromFaceUrls,
    cubeFaceUrls,
    ensureEnvAtlasFromCube,
    getCachedEnvAtlas,
} from './envAtlas';
export * from './materials/';
export {MeshSurfaceEmitter, MeshSurfaceEmitterPlugin} from './MeshSurfaceEmitter';
export {ParticleEmitter} from './ParticleEmitter';
export {ParticleSystem} from './ParticleSystem';
export type {
    BabylonMetaData,
    BurstParameters,
    BurstParametersJSON,
    ParticleSystemJSONParameters,
    ParticleSystemParameters,
} from './ParticleSystem';
export {QuarksLoader} from './QuarksLoader';
export type {QuarksLoaderOptions} from './QuarksLoader';
export {QuarksPrefab} from './QuarksPrefab';
export type {AnimationData, QuarksTimelineClip} from './QuarksPrefab';
export {QuarksUtil} from './QuarksUtil';
export * from './shaders/';
export {SpriteBatch} from './SpriteBatch';
export {TrailBatch} from './TrailBatch';
export {RenderMode, VFXBatch} from './VFXBatch';
export type {StoredBatchSettings} from './VFXBatch';

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
