import {Matrix4, Vector3} from './math';
import {IParticle} from './Particle';
import {ParticleStore} from './ParticleStore';
import {FunctionValueGenerator, ValueGenerator} from './functions';
export interface EmissionState {
    burstIndex: number;
    burstWaveIndex: number;
    burstParticleIndex: number;
    burstParticleCount: number;
    isBursting: boolean;
    time: number;
    waitEmiting: number;
    travelDistance: number;
    previousWorldPos?: Vector3;
}

export interface Resource {

}

export interface JsonMetaData {
    textures: {[uuid: string]: Resource};
    geometries: {[uuid: string]: Resource};
}

export interface SerializationOptions {
    /**
     * Use URL for image.
     * @type {boolean}
     */
    useUrlForImage?: boolean;
}

export type RendererEmitterSettings = TrailSettings | MeshSettings | BillBoardSettings | StretchedBillBoardSettings;

export interface StretchedBillBoardSettings {
    /**
     * how stretched the particle is in the direction of the camera based on the speed of the particle.
     * @type {number}
     */
    speedFactor: number;
    /**
     * how stretched the particle is in the direction of the camera based on the size of the particle.
     * @type {number}
     */
    lengthFactor: number;
}

export interface BillBoardSettings {}

export interface TrailSettings {
    /**
     * Start length of the trail.
     * @type {ValueGenerator | FunctionValueGenerator}
     */
    startLength: ValueGenerator | FunctionValueGenerator;
    /**
     * Whether to follow the local origin.
     * @type {boolean}
     */
    followLocalOrigin: boolean;
}

export interface MeshSettings {
    /**
     * Rotation axis.
     * @type {Vector3}
     */
    rotationAxis?: Vector3;
    /**
     * Initial rotation around the X-axis.
     * @type {ValueGenerator | FunctionValueGenerator}
     */
    startRotationX: ValueGenerator | FunctionValueGenerator;
    /**
     * Initial rotation around the Y-axis.
     * @type {ValueGenerator | FunctionValueGenerator}
     */
    startRotationY: ValueGenerator | FunctionValueGenerator;
    /**
     * Initial rotation around the Z-axis.
     * @type {ValueGenerator | FunctionValueGenerator}
     */
    startRotationZ: ValueGenerator | FunctionValueGenerator;
}

export interface IEmitter {
    system: IParticleSystem;
    uuid: string;
    visible: boolean;
    matrixWorld: any; //type is annoying
}

export type ParticleSystemEventType = "emitEnd" | "finished" | "destroy" | "particleDied";
export interface ParticleSystemEvent {
    type: ParticleSystemEventType;
    particleSystem: IParticleSystem;
    particle?: IParticle;
}

export interface IParticleSystem {

    /**
     * Column storage backing the particles' vector attributes, when the
     * implementation uses one. Rows `[0, particleNum)` hold the live particles
     * in the same order as `particles`, so a renderer can read them as ranges.
     * @type {ParticleStore}
     */
    store?: ParticleStore;
    /**
     * Whether this system only emits through another system, which is when its
     * particles carry their own parent transform.
     * @type {boolean}
     */
    onlyUsedByOther?: boolean;
    /**
     * Whether the ParticleSystem should be automatically disposed when it finishes emitting particles.
     * @type {string}
     */
    autoDestroy: boolean;
    /**
     * Whether the system is in world space.
     * @type {boolean}
     */
    worldSpace: boolean;
    /**
     * World-space velocity of the emitter, updated each frame by the runtime.
     * @type {Vector3}
     */
    emitterVelocity?: Vector3;
    /**
     * Number of particles.
     * @type {number}
     */
    particleNum: number;
    /**
     * Duration of the system.
     * @type {number}
     */
    duration: number;
    /**
     * Whether the system is looping.
     * @type {boolean}
     */
    looping: boolean;
    /**
     * Array of particles.
     * @type {Array<IParticle>}
     */
    particles: Array<IParticle>;
    /**
     * Emitter for the particles.
     * @type {IEmitter}
     */
    emitter: IEmitter;
    /**
     * Optional renderer.
     * @type {BatchedRenderer}
     */
    //_renderer?: BatchedRenderer;
    //instancingGeometry: BufferGeometry;
    rendererEmitterSettings: RendererEmitterSettings;
    emissionState: EmissionState;

    //getRendererSettings(): VFXBatchSettings;

    paused: boolean;
    /** True after `endEmit()` — emission window closed (non-looping duration elapsed). */
    readonly isEmitEnded: boolean;
    /** Whether more particles can still spawn (bursts, rate, distance). */
    hasPendingEmission(): boolean;
    /** Non-looping system with no live particles and no pending emission. */
    isFinished(): boolean;
    pause(): void;
    stop(): void;
    play(): void;
    restart(): void;
    endEmit(): void;

    clone(): IParticleSystem;

    toJSON(metaData: any, options: SerializationOptions): any;

    emit(delta: number, subEmissionState: EmissionState, matrix: Matrix4): void;

    addEventListener(event: ParticleSystemEventType, callback: (event: ParticleSystemEvent)=>void): void;
    removeEventListener(event: ParticleSystemEventType, callback: (event: ParticleSystemEvent)=>void): void;
    removeAllEventListeners(event: ParticleSystemEventType): void;
}
