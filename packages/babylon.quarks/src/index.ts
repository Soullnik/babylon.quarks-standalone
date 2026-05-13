import {loadPlugin} from 'quarks.core';
import {MeshSurfaceEmitterPlugin} from './MeshSurfaceEmitter';
import {registerShaderChunks} from './shaders';

export {BatchedRenderer} from './BatchedRenderer';
export type {VFXBatchSettings} from './BatchedRenderer';
export {BatchedParticleRenderer} from './BatchedParticleRenderer';
export {VFXBatch, RenderMode} from './VFXBatch';
export type {StoredBatchSettings} from './VFXBatch';
export {SpriteBatch} from './SpriteBatch';
export {TrailBatch} from './TrailBatch';
export {ParticleSystem} from './ParticleSystem';
export type {ParticleSystemParameters, BurstParameters} from './ParticleSystem';
export {ParticleEmitter} from './ParticleEmitter';
export {QuarksUtil} from './QuarksUtil';
export {QuarksLoader} from './QuarksLoader';
export type {QuarksLoaderOptions} from './QuarksLoader';
export {QuarksPrefab} from './QuarksPrefab';
export {MeshSurfaceEmitter, MeshSurfaceEmitterPlugin} from './MeshSurfaceEmitter';
export * from './shaders/';
export * from './materials/';
export * from 'quarks.core';


// Re-export quarks.core types (interfaces - type-only)
export type {
    IParticleSystem,
    IParticle,
    Particle,
    EmissionState,
    RendererEmitterSettings,
    TrailSettings,
    StretchedBillBoardSettings,
    BillBoardSettings,
    MeshSettings,
    IEmitter,
    ParticleSystemEvent,
    ParticleSystemEventType,
    SerializationOptions,
    Behavior,
    EmitterShape,
    ValueGenerator,
    FunctionValueGenerator,
    ColorGenerator,
    FunctionColorGenerator,
    RotationGenerator,
    Vector3Generator,
} from 'quarks.core';

registerShaderChunks();
loadPlugin(MeshSurfaceEmitterPlugin);

