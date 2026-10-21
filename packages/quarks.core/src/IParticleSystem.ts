import {FunctionValueGenerator, ValueGenerator} from './functions';
import {Matrix4, Vector2, Vector3} from './math';
import type {Particle} from './Particle';
import {IParticle} from './Particle';
import {ParticleStore} from './ParticleStore';
export interface EmissionState {
    /** Bursts whose first wave has fired this loop, in time order. */
    burstIndex: number;
    /** Wave of the burst being spawned right now (0 for its first wave). */
    burstWaveIndex: number;
    /**
     * Waves fired so far this loop, per burst. Created by the system on first
     * use, so states made elsewhere (sub emitters) can leave it out.
     */
    burstWaves?: number[];
    burstParticleIndex: number;
    burstParticleCount: number;
    isBursting: boolean;
    time: number;
    waitEmiting: number;
    travelDistance: number;
    previousWorldPos?: Vector3;
    /** The particle a sub emission comes from, when it does; see `EmitSubParticleSystem.inherit`. */
    particle?: Particle;
    /** Bit mask of the parent's properties the spawned particles take, see `SubEmitterInheritMask`. */
    inherit?: number;
}

export interface Resource {}

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
    /**
     * Run the texture's U from the particle (0) back to the tail (1), the way
     * Unity's stretched trails map it. Off, U runs from the tail to the particle.
     * @type {boolean}
     */
    uvFromHead?: boolean;
    /**
     * Draw the whole trail in the particle's current color, as Unity's trails
     * do, instead of the color each sample had when it was recorded.
     * @type {boolean}
     */
    colorFromParticle?: boolean;
    /**
     * Drop the trail the moment its particle dies, instead of letting it
     * shrink away one sample per step.
     * @type {boolean}
     */
    dieWithParticle?: boolean;
    /**
     * Record trail points in world space even though the system simulates in
     * local space, so the trail streaks behind a moving emitter instead of
     * moving rigidly with it (Unity's Trails > World Space).
     * @type {boolean}
     */
    recordWorldSpace?: boolean;
    /**
     * Sweep the ribbon along this axis of the emitter instead of turning it to
     * face the camera: every sample records the axis as the emitter held it,
     * and the ribbon spans the particle's width along it, centred on the
     * particle. With the emitter on a blade, the axis along the blade and the
     * width the blade's length, the trail is the surface the blade swept, as a
     * weapon trail (Unreal's AnimTrail) is. The emitter's scale applies to the
     * width, and so does the axis's length: give a unit vector for the width
     * as set. Unset (the default): a camera-facing ribbon.
     * @type {Vector3}
     */
    sideAxis?: Vector3;
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

export type ParticleSystemEventType = 'emitEnd' | 'finished' | 'destroy' | 'particleDied';
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
     * Wall-clock time that has passed since the last simulated step, in
     * seconds, when the implementation simulates on a fixed timestep. Negative
     * when that step ran a hair ahead of real time instead (rounded to the
     * nearest step rather than floored, so this stays small either way). A
     * renderer uses it to draw where the particles are now rather than where
     * the last step left them.
     * @type {number}
     */
    simulationResidual?: number;
    /**
     * Length of one simulation step, in seconds, when the implementation
     * simulates on a fixed timestep. Turning is recorded per step rather than
     * per second, so a renderer needs this to know what fraction of a step
     * {@link simulationResidual} is.
     * @type {number}
     */
    simulationStep?: number;
    /**
     * What world-space forces and speed limits are multiplied by: the
     * emitter's world scale when the system scales its motion with it (a
     * world-space system in `'hierarchy'` scaling mode), 1 or undefined
     * otherwise.
     * @type {number}
     */
    motionScale?: number;
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
    /**
     * Fraction of billboard particles mirrored along U (x) and V (y), each
     * picked at random when the particle is born — Unity's renderer Flip.
     * Absent: nothing is mirrored.
     */
    flip?: Vector2;
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

    addEventListener(event: ParticleSystemEventType, callback: (event: ParticleSystemEvent) => void): void;
    removeEventListener(event: ParticleSystemEventType, callback: (event: ParticleSystemEvent) => void): void;
    removeAllEventListeners(event: ParticleSystemEventType): void;
}
