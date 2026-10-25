import {FunctionValueGenerator, ValueGenerator} from './functions';
import {Matrix4, Vector2, Vector3} from './math';
import type {Particle} from './Particle';
import {IParticle} from './Particle';
import {ParticleStore} from './ParticleStore';
/**
 * Where a system, or one sub emission, is in its emission: the cycle time, the burst and wave
 * counters and the rate and distance carry-over. The system owns one; `EmitSubParticleSystem` keeps
 * one per parent particle.
 */
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
    /**
     * Index of the particle being spawned within the current burst wave; shapes in
     * {@link EmitterMode.Burst} mode spread the wave by it.
     */
    burstParticleIndex: number;
    /** Particles in the current burst wave. */
    burstParticleCount: number;
    /** True while a burst wave spawns, false for rate and distance emission. */
    isBursting: boolean;
    /** Seconds into the current emission cycle (0 to `duration`). */
    time: number;
    /**
     * Particles owed to rate and distance emission and not spawned yet; the fraction carries into
     * the next step.
     */
    waitEmiting: number;
    /** How far the emitter has moved past its last emission-over-distance mark. */
    travelDistance: number;
    /**
     * Where the emitter was at the previous step, for emission over distance; unset until the first
     * step and after a restart.
     */
    previousWorldPos?: Vector3;
    /** The particle a sub emission comes from, when it does; see `EmitSubParticleSystem.inherit`. */
    particle?: Particle;
    /** Bit mask of the parent's properties the spawned particles take, see `SubEmitterInheritMask`. */
    inherit?: number;
}

/** A texture or geometry a renderer stores in {@link JsonMetaData}; its shape is the renderer's. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- a texture or geometry a renderer stores
export interface Resource {}

/** The shared resources a serialized system refers to by uuid. */
export interface JsonMetaData {
    /** Textures by uuid; null for one a renderer could not make. */
    textures: {[uuid: string]: Resource | null};
    /** Geometries by uuid. */
    geometries: {[uuid: string]: Resource};
}

/** Options for {@link IParticleSystem.toJSON}. */
export interface SerializationOptions {
    /**
     * Use URL for image.
     * @type {boolean}
     */
    useUrlForImage?: boolean;
}

/** The render-mode-specific settings of a system: one of the shapes below, by its render mode. */
export type RendererEmitterSettings = TrailSettings | MeshSettings | BillBoardSettings | StretchedBillBoardSettings;

/** Settings of a stretched billboard system. */
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

/** Settings of a billboard system; none yet. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- billboards take no settings yet
export interface BillBoardSettings {}

/** Settings of a trail system: how each particle records and draws its ribbon. */
export interface TrailSettings {
    /**
     * How many samples the trail keeps, rolled per particle at emission. The particle records one
     * sample per simulation step, so in babylon.quarks, which steps at 60 Hz, 30 samples is half a
     * second of travel. Defaults to 30 in babylon.quarks.
     * @type {ValueGenerator | FunctionValueGenerator}
     */
    startLength: ValueGenerator | FunctionValueGenerator;
    /**
     * Keep each particle where it was emitted relative to the emitter, carried by the emitter's
     * transform instead of its own velocity, so the trail draws the emitter's motion (a weapon
     * tip) rather than the particle's travel. Defaults to false.
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
    /**
     * Draw each segment between two recorded samples as this many more
     * segments, along a curve through the samples (Niagara's ribbon
     * tessellation), so a fast or sharply turning trail stays round instead
     * of showing the corners between frames. A whole number from 0 (the
     * default: straight segments) to 16. The curve passes through every
     * sample: it smooths the trail without moving it.
     * @type {number}
     */
    tessellation?: number;
    /**
     * How tightly a tessellated trail's curve is drawn between its samples
     * (Niagara's curve tension): 0 (the default) a Catmull-Rom spline, rising
     * toward 1 for straight segments.
     * @type {number}
     */
    curveTension?: number;
    /**
     * How the texture's U runs along the ribbon (Unity's Texture Mode):
     * - `'stretch'` (the default): once along the ribbon, by distance, so a fast stretch of the
     *   trail shows more of the texture than a slow one.
     * - `'distributePerSegment'`: once along the ribbon, each recorded segment an equal share
     *   whatever its length (Niagara's Scaled Uniformly).
     * - `'tile'`: repeated every world unit along the ribbon, scaled by `textureScale`
     *   (Niagara's Tiling Distance). A sample keeps its U for as long as it lives, so the texture
     *   stays put on the trail as the trail grows. The unit is the space the trail is recorded
     *   in, scaled by the emitter for a local-space trail (as the width is).
     * - `'repeatPerSegment'`: once per recorded segment.
     *
     * `uvFromHead` runs any of them from the particle back. The sprite sheet's cell is the
     * texture's U range, so the repeating modes want a sheet of 1×1 (the default); on a larger
     * sheet they run into the next cell.
     * @type {TrailTextureMode}
     */
    textureMode?: TrailTextureMode;
    /**
     * Repeats of the texture along the ribbon (Unity's Texture Scale, Niagara's UV Scale): per
     * world unit in `'tile'`, per recorded segment in `'repeatPerSegment'` and over the whole
     * ribbon in the other modes. Finite and above 0; the default is 1. For repeats across the
     * ribbon use the texture's own UV layout (`mapUV.tiling`).
     * @type {number}
     */
    textureScale?: number;
    /**
     * A new sample is only recorded once the particle has moved this far from the last one, in
     * the space the trail is recorded in; until then the last sample follows the particle
     * (Unity's Min Vertex Distance). Keeps a slow or standing particle from filling its history
     * with points on one spot, so the trail keeps its length in distance rather than in steps.
     * 0, the default: a sample every simulation step.
     * @type {number}
     */
    minVertexDistance?: number;
    /**
     * How long each recorded sample of the trail is kept, in seconds (Unity's Time): the ribbon
     * reaches that far back in time, however many samples that is, up to `startLength`. Unset or
     * 0, the default: samples are kept until the history is full, `startLength` samples. The
     * `WidthOverLength` curve spans the samples kept.
     * @type {number}
     */
    lifetime?: number;
}

/** How a trail's texture runs along the ribbon, see {@link TrailSettings.textureMode}. */
export type TrailTextureMode = 'stretch' | 'tile' | 'distributePerSegment' | 'repeatPerSegment';

/**
 * Settings of a mesh system; none are read. A mesh particle's start rotation about each axis is the
 * system's `startRotation`, a rotation generator such as an `EulerGenerator` (Unity's 3D Start
 * Rotation).
 */
export interface MeshSettings {
    /**
     * Never read.
     * @deprecated Set the system's `startRotation` to an `EulerGenerator` instead.
     */
    startRotationX?: ValueGenerator | FunctionValueGenerator;
    /**
     * Never read.
     * @deprecated Set the system's `startRotation` to an `EulerGenerator` instead.
     */
    startRotationY?: ValueGenerator | FunctionValueGenerator;
    /**
     * Never read.
     * @deprecated Set the system's `startRotation` to an `EulerGenerator` instead.
     */
    startRotationZ?: ValueGenerator | FunctionValueGenerator;
}

/** The scene node a system emits from, as the simulation sees it. */
export interface IEmitter {
    /** The system emitting from this node. */
    system: IParticleSystem;
    /** The node's id in the effect JSON. */
    uuid: string;
    /** Whether the node, and so the system, is visible. */
    visible: boolean;
    /**
     * The matrix the system simulates and draws in: the node's world matrix, with the scale its
     * scaling mode applies on each axis (babylon.quarks' `ScalingMode`).
     */
    matrixWorld: Matrix4;
}

/**
 * The events a system fires: `'emitEnd'` when emission ends, `'finished'` when the last particle of
 * an ended system dies, `'particleDied'` per particle and `'destroy'` on dispose.
 */
export type ParticleSystemEventType = 'emitEnd' | 'finished' | 'destroy' | 'particleDied';
/** What a system passes to its event listeners. */
export interface ParticleSystemEvent {
    /** The event. */
    type: ParticleSystemEventType;
    /** The system that fired it. */
    particleSystem: IParticleSystem;
    /** The particle that died, for `'particleDied'`; valid only while the listener runs. */
    particle?: IParticle;
}

/**
 * What the simulation core needs of a particle system: its emission, particles, transform and
 * lifecycle. babylon.quarks' `ParticleSystem` implements it.
 */
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
     * What world-space forces and speed limits are multiplied by: the mean
     * scale of {@link IEmitter.matrixWorld}'s axes for a world-space system,
     * which carries what its scaling mode scales motion by; 1 or undefined
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
     * Whether the system has been disposed. A disposed system takes no more particles, so a sub
     * emitter aimed at it emits nothing.
     * @type {boolean}
     */
    readonly isDisposed?: boolean;
    /**
     * Whether the system is disposed once it has finished.
     * @deprecated Read {@link IParticleSystem.stopAction}: true is `'destroy'`.
     * @type {boolean}
     */
    autoDestroy: boolean;
    /**
     * What the system does once it has finished, as Unity's Stop Action: nothing (`'none'`),
     * disable its emitter (`'disable'`) or dispose itself (`'destroy'`). Undefined is `'none'`.
     */
    stopAction?: 'none' | 'disable' | 'destroy';
    /**
     * Whether particles outlive their lifetime: held or looped at the end of it until new ones
     * replace them, as with Unity's Ring Buffer Mode on a full system. A Death sub emitter does
     * not fire for them, since they do not die.
     */
    readonly ringBufferActive?: boolean;
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
    //_renderer?: BatchedRenderer;
    //instancingGeometry: BufferGeometry;
    /** Settings of the renderer that draws the particles, such as the trail or beam setup. */
    rendererEmitterSettings: RendererEmitterSettings;
    /**
     * Fraction of billboard particles mirrored along U (x) and V (y), each
     * picked at random when the particle is born — Unity's renderer Flip.
     * Absent: nothing is mirrored.
     */
    flip?: Vector2;
    /** Emission progress: time in the cycle, burst and distance counters. */
    emissionState: EmissionState;

    //getRendererSettings(): VFXBatchSettings;

    /** True while paused: the system is not simulated. */
    paused: boolean;
    /** True after `endEmit()` — emission window closed (non-looping duration elapsed). */
    readonly isEmitEnded: boolean;
    /**
     * Whether more particles can still spawn (bursts, rate, distance): from the system's own
     * emission, or with `state` from one a sub emitter runs into it for a parent particle.
     */
    hasPendingEmission(state?: EmissionState): boolean;
    /** Non-looping system with no live particles and no pending emission. */
    isFinished(): boolean;
    /** Freezes the system where it is until {@link IParticleSystem.play}. */
    pause(): void;
    /** Clears every particle, rewinds to the start and pauses. */
    stop(): void;
    /** Resumes a paused system. */
    play(): void;
    /** Clears every particle and plays the system again from the start. */
    restart(): void;
    /** Stops emission and lets the particles alive die out; fires `'emitEnd'`. */
    endEmit(): void;

    /** A new system with the same settings, behaviors and generators. */
    clone(): IParticleSystem;

    /**
     * Writes the system's settings, putting its shared resources into `metaData`; the shapes of both
     * are the renderer's.
     */
    toJSON(metaData: unknown, options: SerializationOptions): unknown;

    /**
     * Spawns what `delta` seconds of emission call for, on `subEmissionState` from the emitter at
     * `matrix`; how a sub emitter target emits for a parent particle.
     */
    emit(delta: number, subEmissionState: EmissionState, matrix: Matrix4): void;

    /** Calls `callback` on each `event`. */
    addEventListener(event: ParticleSystemEventType, callback: (event: ParticleSystemEvent) => void): void;
    /** Removes one callback added with {@link IParticleSystem.addEventListener}. */
    removeEventListener(event: ParticleSystemEventType, callback: (event: ParticleSystemEvent) => void): void;
    /** Removes every callback registered for `event`, or every callback when it is left out. */
    removeAllEventListeners(event?: ParticleSystemEventType): void;
}
