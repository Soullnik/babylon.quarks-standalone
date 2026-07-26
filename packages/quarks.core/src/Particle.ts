import {Matrix4, Quaternion, Vector3, Vector3View, Vector4, Vector4View} from './math';
import {EmissionState} from './IParticleSystem';
import {LinkedList} from './util/LinkedList';
import {GeneratorMemory} from './functions';
import {ParticleStore} from './ParticleStore';

export interface IParticle {
    /**
     * Position of the particle.
     * @type {Vector3}
     */
    position: Vector3;
    /**
     * Velocity of the particle.
     * @type {Vector3}
     */
    velocity: Vector3;
    /**
     * Age of the particle.
     * @type {number}
     */
    age: number;
    /**
     * Life duration of the particle.
     * @type {number}
     */
    life: number;
    /**
     * Size of the particle.
     * @type {Vector3}
     */
    size: Vector3;
    /**
     * Rotation of the particle.
     * @type {number | Quaternion}
     */
    rotation?: number | Quaternion;
    /**
     * UV tile index.
     * @type {number}
     */
    uvTile: number;
    /**
     * Color of the particle.
     * @type {Vector4}
     */
    color: Vector4;
    /**
     * the memory of the particle.
     */
    memory: GeneratorMemory;
    /**
     * Indicates if the particle has died.
     * @type {boolean}
     */
    get died(): boolean;
}

export interface Particle extends IParticle {
    /**
     * Where the particle was when the current simulation step began, when the
     * implementation keeps it. A renderer draws between fixed steps and uses
     * this to continue the motion the last step produced, whatever produced it.
     * @type {Vector3}
     */
    previousPosition?: Vector3;
    /**
     * How fast the particle is turning, as the behavior that turns it last left
     * it: a rate in radians per second for a particle that rotates by an angle,
     * or one simulation step's turn for one that rotates by quaternion.
     *
     * Written by the turning behaviors and read by the renderer, which draws
     * between simulation steps and has no other way to continue the turn.
     * @type {number | Quaternion}
     */
    angularVelocity?: number | Quaternion;
    /**
     * Speed modifier of the particle.
     * @type {number}
     */
    speedModifier: number;
    /**
     * Emission state of the particle.
     * @type {EmissionState}
     */
    emissionState?: EmissionState;
    /**
     * Parent matrix for transformation.
     * @type {Matrix4}
     */
    parentMatrix?: Matrix4;
    /**
     * Initial speed of the particle.
     * @type {number}
     */
    startSpeed: number;
    /**
     * Initial color of the particle.
     * @type {Vector4}
     */
    startColor: Vector4;
    /**
     * Initial size of the particle.
     * @type {Vector3}
     */
    startSize: Vector3;

    reset(): void;
}

/**
 * Particle implementation for node-based particle systems.
 */
export class NodeParticle implements IParticle {
    /**
     * Position of the particle.
     * @type {Vector3}
     */
    position: Vector3 = new Vector3();
    /**
     * Velocity of the particle.
     * @type {Vector3}
     */
    velocity: Vector3 = new Vector3();
    /**
     * Age of the particle.
     * @type {number}
     */
    age = 0;
    /**
     * Life duration of the particle.
     * @type {number}
     */
    life = 1;
    /**
     * Size of the particle.
     * @type {Vector3}
     */
    size : Vector3 = new Vector3();
    /**
     * Angular velocity of the particle.
     * @type {number | Quaternion}
     */
    angularVelocity?: number | Quaternion;
    /**
     * Rotation of the particle.
     * @type {number | Quaternion}
     */
    rotation: number | Quaternion = 0;
    /**
     * Color of the particle.
     * @type {Vector4}
     */
    color: Vector4 = new Vector4(1, 1, 1, 1);
    /**
     * UV tile index.
     * @type {number}
     */
    uvTile = 0;

    /**
     * Indicates if the particle has died.
     * @type {boolean}
     */
    get died() {
        return this.age >= this.life;
    }

    /**
     * Resets the particle properties to initial values.
     */
    reset() {
        this.memory.length = 0;
        this.position.set(0, 0, 0);
        this.velocity.set(0, 0, 0);
        this.age = 0;
        this.life = 1;
        this.size.set(1, 1, 1);
        this.rotation = 0;
        this.color.set(1, 1, 1, 1);
        this.uvTile = 0;
    }

    memory = [];
}

/**
 * Particle implementation for sprite-based particle.
 */
export class SpriteParticle implements Particle {
    /** Column storage backing this particle's vector attributes. */
    readonly store: ParticleStore;
    /** Row this particle occupies in {@link store}. */
    storeIndex: number;
    /**
     * Parent matrix for transformation.
     * @type {Matrix4}
     */
    parentMatrix?: Matrix4;
    /**
     * Initial speed of the particle.
     * @type {number}
     */
    startSpeed = 0;
    /**
     * Initial color of the particle.
     * @type {Vector4}
     */
    startColor: Vector4;
    /**
     * Initial size of the particle.
     * @type {Vector3}
     */
    startSize: Vector3;
    /**
     * Position of the particle.
     * @type {Vector3}
     */
    position: Vector3;
    /**
     * Where this particle was when the current simulation step began; see
     * {@link Particle.previousPosition}.
     * @type {Vector3}
     */
    previousPosition: Vector3;
    /**
     * Velocity of the particle.
     * @type {Vector3}
     */
    velocity: Vector3;
    /**
     * Size of the particle.
     * @type {Vector3}
     */
    size: Vector3;
    /** Row of the store's interleaved scalars this particle owns. */
    protected scalars: Float64Array;
    protected scalarOffset: number;

    /**
     * Age of the particle.
     * @type {number}
     */
    get age(): number {
        return this.scalars[this.scalarOffset];
    }

    set age(value: number) {
        this.scalars[this.scalarOffset] = value;
    }

    /**
     * Life duration of the particle.
     * @type {number}
     */
    get life(): number {
        return this.scalars[this.scalarOffset + 1];
    }

    set life(value: number) {
        this.scalars[this.scalarOffset + 1] = value;
    }

    /**
     * Speed modifier of the particle.
     * @type {number}
     */
    get speedModifier(): number {
        return this.scalars[this.scalarOffset + 2];
    }

    set speedModifier(value: number) {
        this.scalars[this.scalarOffset + 2] = value;
    }
    // extra properties
    /**
     * Angular velocity of the particle.
     * @type {number | Quaternion}
     */
    angularVelocity?: number | Quaternion;
    // GPU properties
    /**
     * Rotation of the particle.
     * @type {number | Quaternion}
     */
    rotation: number | Quaternion = 0;
    /**
     * Color of the particle.
     * @type {Vector4}
     */
    color: Vector4;
    /**
     * UV tile index.
     * @type {number}
     */
    uvTile = 0;

    /**
     * @param store - Column storage to bind to. A private single-row store is
     * created when omitted, so a standalone `new SpriteParticle()` still works.
     * @param storeIndex - Row this particle owns.
     */
    constructor(store: ParticleStore = new ParticleStore(1), storeIndex = 0) {
        this.store = store;
        this.storeIndex = storeIndex;
        const offset3 = storeIndex * 3;
        const offset4 = storeIndex * 4;
        this.position = new Vector3View(store.position, offset3);
        this.previousPosition = new Vector3View(store.previousPosition, offset3);
        this.velocity = new Vector3View(store.velocity, offset3);
        this.size = new Vector3View(store.size, offset3);
        this.startSize = new Vector3View(store.startSize, offset3);
        this.color = new Vector4View(store.color, offset4);
        this.startColor = new Vector4View(store.startColor, offset4);
        this.scalars = store.scalars;
        this.scalarOffset = storeIndex * ParticleStore.SCALAR_STRIDE;
        this.size.set(1, 1, 1);
        this.startSize.set(1, 1, 1);
        this.life = 1;
        this.speedModifier = 1;
    }

    /**
     * Moves this particle onto a different store row. The caller is responsible
     * for having moved the row contents too.
     */
    setStoreIndex(index: number): void {
        this.storeIndex = index;
        this.rebind();
    }

    /** Re-points the vector views after the store grew its arrays. */
    rebind(): void {
        const store = this.store;
        const offset3 = this.storeIndex * 3;
        const offset4 = this.storeIndex * 4;
        (this.position as Vector3View).bind(store.position, offset3);
        (this.previousPosition as Vector3View).bind(store.previousPosition, offset3);
        (this.velocity as Vector3View).bind(store.velocity, offset3);
        (this.size as Vector3View).bind(store.size, offset3);
        (this.startSize as Vector3View).bind(store.startSize, offset3);
        (this.color as Vector4View).bind(store.color, offset4);
        (this.startColor as Vector4View).bind(store.startColor, offset4);
        this.scalars = store.scalars;
        this.scalarOffset = this.storeIndex * ParticleStore.SCALAR_STRIDE;
    }

    /**
     * Indicates if the particle has died.
     * @type {boolean}
     */
    get died() {
        return this.age >= this.life;
    }

    reset() {
        this.memory.length = 0;
    }

    memory = [];
}

/** Shared zero-length placeholder so trail buffers are never null. */
const EMPTY_HISTORY = new Float32Array(0);

export class RecordState {
    /**
     * Creates a new record state.
     * @param {Vector3} position - The position of the particle.
     * @param {number} size - The size of the particle.
     * @param {Vector4} color - The color of the particle.
     */
    constructor(
        public position: Vector3,
        public size: number,
        public color: Vector4
    ) {}
}

/**
 * Particle implementation for trail-based particles.
 */
export class TrailParticle implements Particle {
    /** Column storage backing this particle's vector attributes. */
    readonly store: ParticleStore;
    /** Row this particle occupies in {@link store}. */
    storeIndex: number;
    /**
     * Parent matrix for transformation.
     * @type {Matrix4}
     */
    parentMatrix?: Matrix4;
    /**
     * Initial speed of the particle.
     * @type {number}
     */
    startSpeed = 0;
    /**
     * Initial color of the particle.
     * @type {Vector4}
     */
    startColor: Vector4;
    /**
     * Initial size of the particle.
     * @type {Vector3}
     */
    startSize: Vector3;
    /**
     * Position of the particle.
     * @type {Vector3}
     */
    position: Vector3;
    /**
     * Where this particle was when the current simulation step began; see
     * {@link Particle.previousPosition}.
     * @type {Vector3}
     */
    previousPosition: Vector3;
    /**
     * Local position of the particle.
     * @type {Vector3}
     */
    localPosition?: Vector3;
    /**
     * Velocity of the particle.
     * @type {Vector3}
     */
    velocity: Vector3;
    /**
     * Size of the particle.
     * @type {Vector3}
     */
    size: Vector3;
    /** Row of the store's interleaved scalars this particle owns. */
    protected scalars: Float64Array;
    protected scalarOffset: number;

    /**
     * Age of the particle.
     * @type {number}
     */
    get age(): number {
        return this.scalars[this.scalarOffset];
    }

    set age(value: number) {
        this.scalars[this.scalarOffset] = value;
    }

    /**
     * Life duration of the particle.
     * @type {number}
     */
    get life(): number {
        return this.scalars[this.scalarOffset + 1];
    }

    set life(value: number) {
        this.scalars[this.scalarOffset + 1] = value;
    }

    /**
     * Speed modifier of the particle.
     * @type {number}
     */
    get speedModifier(): number {
        return this.scalars[this.scalarOffset + 2];
    }

    set speedModifier(value: number) {
        this.scalars[this.scalarOffset + 2] = value;
    }
    /**
     * Length of the trail.
     * @type {number}
     */
    length = 100;
    // GPU properties
    /**
     * Color of the particle.
     * @type {Vector4}
     */
    color: Vector4;
    /**
     * Previous states of the particle.
     *
     * @deprecated The trail history now lives in the flat ring buffer below
     * (`historyPositions` / `historySizes` / `historyColors`), which records a
     * sample without allocating. This list is no longer populated or rendered.
     * @type {LinkedList<RecordState>}
     */
    previous: LinkedList<RecordState> = new LinkedList<RecordState>();
    /**
     * UV tile index.
     * @type {number}
     */
    uvTile = 0;

    /** Ring buffer of recorded positions, 3 floats per sample. */
    historyPositions: Float32Array = EMPTY_HISTORY;
    /** Ring buffer of recorded widths, 1 float per sample. */
    historySizes: Float32Array = EMPTY_HISTORY;
    /** Ring buffer of recorded colors, 4 floats per sample. */
    historyColors: Float32Array = EMPTY_HISTORY;
    /** Number of samples the ring buffers can hold. */
    historyCapacity = 0;
    /** Slot the next sample is written to. */
    historyHead = 0;
    /** Number of valid samples currently held. */
    historyCount = 0;

    /**
     * @param store - Column storage to bind to. A private single-row store is
     * created when omitted, so a standalone `new TrailParticle()` still works.
     * @param storeIndex - Row this particle owns.
     */
    constructor(store: ParticleStore = new ParticleStore(1), storeIndex = 0) {
        this.store = store;
        this.storeIndex = storeIndex;
        const offset3 = storeIndex * 3;
        const offset4 = storeIndex * 4;
        this.position = new Vector3View(store.position, offset3);
        this.previousPosition = new Vector3View(store.previousPosition, offset3);
        this.velocity = new Vector3View(store.velocity, offset3);
        this.size = new Vector3View(store.size, offset3);
        this.startSize = new Vector3View(store.startSize, offset3);
        this.color = new Vector4View(store.color, offset4);
        this.startColor = new Vector4View(store.startColor, offset4);
        this.scalars = store.scalars;
        this.scalarOffset = storeIndex * ParticleStore.SCALAR_STRIDE;
        this.size.set(1, 1, 1);
        this.startSize.set(1, 1, 1);
        this.life = 1;
        this.speedModifier = 1;
    }

    /**
     * Moves this particle onto a different store row. The caller is responsible
     * for having moved the row contents too.
     */
    setStoreIndex(index: number): void {
        this.storeIndex = index;
        this.rebind();
    }

    /** Re-points the vector views after the store grew its arrays. */
    rebind(): void {
        const store = this.store;
        const offset3 = this.storeIndex * 3;
        const offset4 = this.storeIndex * 4;
        (this.position as Vector3View).bind(store.position, offset3);
        (this.previousPosition as Vector3View).bind(store.previousPosition, offset3);
        (this.velocity as Vector3View).bind(store.velocity, offset3);
        (this.size as Vector3View).bind(store.size, offset3);
        (this.startSize as Vector3View).bind(store.startSize, offset3);
        (this.color as Vector4View).bind(store.color, offset4);
        (this.startColor as Vector4View).bind(store.startColor, offset4);
        this.scalars = store.scalars;
        this.scalarOffset = this.storeIndex * ParticleStore.SCALAR_STRIDE;
    }

    /**
     * Allocates the trail ring buffers, reusing them when the capacity is unchanged.
     * @param {number} capacity - Number of samples to hold.
     */
    ensureHistoryCapacity(capacity: number): void {
        if (this.historyCapacity === capacity) {
            return;
        }
        this.historyCapacity = capacity;
        this.historyPositions = new Float32Array(capacity * 3);
        this.historySizes = new Float32Array(capacity);
        this.historyColors = new Float32Array(capacity * 4);
        this.historyHead = 0;
        this.historyCount = 0;
    }

    /** Drops every recorded sample without releasing the buffers. */
    resetHistory(): void {
        this.historyHead = 0;
        this.historyCount = 0;
    }

    /**
     * Ring buffer slot of the i-th sample counting from the oldest one.
     * @param {number} i - Sample offset, `0` being the oldest live sample.
     */
    getHistoryIndex(i: number): number {
        const capacity = this.historyCapacity;
        return (this.historyHead - this.historyCount + capacity + i) % capacity;
    }

    /**
     * Records the current state into the trail ring buffer, or retires the
     * oldest sample once the particle is dead. Allocation free.
     */
    update() {
        this.ensureHistoryCapacity(Math.max(1, Math.ceil(this.length)));
        const capacity = this.historyCapacity;

        if (this.age > this.life) {
            if (this.historyCount > 0) {
                this.historyCount--;
            }
            return;
        }

        const head = this.historyHead;
        const positionIndex = head * 3;
        const positions = this.historyPositions;
        positions[positionIndex] = this.position.x;
        positions[positionIndex + 1] = this.position.y;
        positions[positionIndex + 2] = this.position.z;
        this.historySizes[head] = this.size.x;
        const colorIndex = head * 4;
        const colors = this.historyColors;
        colors[colorIndex] = this.color.x;
        colors[colorIndex + 1] = this.color.y;
        colors[colorIndex + 2] = this.color.z;
        colors[colorIndex + 3] = this.color.w;

        this.historyHead = (head + 1) % capacity;
        if (this.historyCount < capacity) {
            this.historyCount++;
        }
    }

    /**
     * Indicates if the particle has died.
     * @type {boolean}
     */
    get died() {
        return this.age >= this.life;
    }

    /**
     * Resets the particle properties and clears the previous states.
     */
    reset() {
        this.memory.length = 0;
        this.resetHistory();
    }

    memory = [];
}
