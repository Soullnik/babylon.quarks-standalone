import {GeneratorMemory} from './functions';
import {EmissionState} from './IParticleSystem';
import {Matrix4, Quaternion, QuaternionView, Vector3, Vector3View, Vector4, Vector4View} from './math';
import {ParticleStore} from './ParticleStore';
import {LinkedList} from './util/LinkedList';

/**
 * The state every particle has, whatever kind: where it is, how it moves, how it looks and how old
 * it is.
 */
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

/**
 * A particle the simulation core spawns and updates: an {@link IParticle} that can be reset for
 * reuse.
 */
export interface Particle extends IParticle {
    /**
     * Where the particle was when the current simulation step began, when the
     * implementation keeps it. A renderer draws between fixed steps and uses
     * this to continue the motion the last step produced, whatever produced it.
     * @type {Vector3}
     */
    previousPosition?: Vector3;
    /**
     * Velocity at the start of the current step, when the implementation keeps
     * it. A stretched billboard is drawn from its velocity, so a renderer needs
     * this to keep the sprite's shape moving between steps as its position does.
     * @type {Vector3}
     */
    previousVelocity?: Vector3;
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
    /**
     * Counts the particles this object has held, when the implementation reuses particle objects:
     * the system bumps it at every spawn. Something that keeps a reference to a particle, such as
     * a sub emission following its parent, compares it to tell the particle it saw from a later
     * one that took over the same object.
     * @type {number}
     */
    serial?: number;

    /**
     * Clears the per-particle state (generator memory, a trail's history) before the particle is
     * reused.
     */
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
    size: Vector3 = new Vector3();
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
    /** See {@link Particle.serial}. */
    serial?: number;
    /**
     * Initial speed of the particle, kept in the store's `startSpeed` column.
     * @type {number}
     */
    get startSpeed(): number {
        return this.store.startSpeed[this.storeIndex];
    }

    set startSpeed(value: number) {
        this.store.startSpeed[this.storeIndex] = value;
    }
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
     * Velocity at the start of the current step; see
     * {@link Particle.previousVelocity}.
     * @type {Vector3}
     */
    previousVelocity: Vector3;
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
    /** Index of this particle's first entry in the store's interleaved scalars. */
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
     * View of this particle's row in the store's quaternion rotation column,
     * when it rotates by quaternion (mesh render mode); undefined while it
     * rotates by an angle, which then lives in the store's `rotation` column.
     * Always present so every sprite particle keeps one hidden class.
     */
    private rotationQuaternion: QuaternionView | undefined = undefined;
    /** Same split for the turn rate: a quaternion step here, a scalar rate in the store. */
    private angularVelocityQuaternion: QuaternionView | undefined = undefined;

    /**
     * Angular velocity of the particle: a rate in radians per second for an
     * angle rotation, one step's turn for a quaternion rotation. Both live in
     * the store so the renderer and compiled behaviors read them as ranges;
     * assigning a quaternion copies it into the particle's row and returns a
     * view of that row from then on.
     * @type {number | Quaternion}
     */
    get angularVelocity(): number | Quaternion {
        const q = this.angularVelocityQuaternion;
        return q !== undefined ? q : this.store.angularVelocity[this.storeIndex];
    }

    set angularVelocity(value: number | Quaternion | undefined) {
        if (typeof value === 'number') {
            this.angularVelocityQuaternion = undefined;
            this.store.angularVelocity[this.storeIndex] = value;
        } else if (value === undefined) {
            this.angularVelocityQuaternion = undefined;
            this.store.angularVelocity[this.storeIndex] = 0;
        } else {
            let view = this.angularVelocityQuaternion;
            if (view === undefined) {
                this.store.ensureQuaternionColumns();
                view = new QuaternionView(this.store.angularVelocityQuaternion, this.storeIndex * 4);
                this.angularVelocityQuaternion = view;
            }
            if (view !== value) {
                view.copy(value);
            }
        }
    }

    /**
     * Rotation of the particle: an angle, or a quaternion for mesh particles.
     * Both live in the store; see {@link angularVelocity} for how assigning a
     * quaternion behaves.
     * @type {number | Quaternion}
     */
    get rotation(): number | Quaternion {
        const q = this.rotationQuaternion;
        return q !== undefined ? q : this.store.rotation[this.storeIndex];
    }

    set rotation(value: number | Quaternion) {
        if (typeof value === 'number') {
            this.rotationQuaternion = undefined;
            this.store.rotation[this.storeIndex] = value;
        } else {
            let view = this.rotationQuaternion;
            if (view === undefined) {
                this.store.ensureQuaternionColumns();
                view = new QuaternionView(this.store.rotationQuaternion, this.storeIndex * 4);
                this.rotationQuaternion = view;
            }
            if (view !== value) {
                view.copy(value);
            }
        }
    }

    /**
     * Color of the particle.
     * @type {Vector4}
     */
    color: Vector4;
    /**
     * UV tile index, kept in the store's `uvTile` column.
     * @type {number}
     */
    get uvTile(): number {
        return this.store.uvTile[this.storeIndex];
    }

    set uvTile(value: number) {
        this.store.uvTile[this.storeIndex] = value;
    }

    /**
     * Mirroring picked at birth from the system's `flip` fractions: bit 1
     * mirrors the sprite along U, bit 2 along V. 0 draws it as is. Kept in
     * the store's `flip` column.
     * @type {number}
     */
    get flip(): number {
        return this.store.flip[this.storeIndex];
    }

    /** Sets the mirroring bits; see the getter. */
    set flip(value: number) {
        this.store.flip[this.storeIndex] = value;
    }

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
        this.previousVelocity = new Vector3View(store.previousVelocity, offset3);
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
        (this.previousVelocity as Vector3View).bind(store.previousVelocity, offset3);
        (this.velocity as Vector3View).bind(store.velocity, offset3);
        (this.size as Vector3View).bind(store.size, offset3);
        (this.startSize as Vector3View).bind(store.startSize, offset3);
        (this.color as Vector4View).bind(store.color, offset4);
        (this.startColor as Vector4View).bind(store.startColor, offset4);
        this.rotationQuaternion?.bind(store.rotationQuaternion, offset4);
        this.angularVelocityQuaternion?.bind(store.angularVelocityQuaternion, offset4);
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

    /** Clears the particle's generator memory before it is reused. */
    reset() {
        this.memory.length = 0;
    }

    memory = [];
}

/** Shared zero-length placeholder so trail buffers are never null. */
const EMPTY_HISTORY = new Float32Array(0);

/**
 * One recorded sample of a trail in the old linked-list history.
 * @deprecated Trails record into a flat ring buffer now (`TrailParticle.historyPositions` and its siblings).
 */
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
    /** See {@link Particle.serial}. */
    serial?: number;
    /**
     * Initial speed of the particle, kept in the store's `startSpeed` column.
     * @type {number}
     */
    get startSpeed(): number {
        return this.store.startSpeed[this.storeIndex];
    }

    set startSpeed(value: number) {
        this.store.startSpeed[this.storeIndex] = value;
    }
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
     * Velocity at the start of the current step; see
     * {@link Particle.previousVelocity}.
     * @type {Vector3}
     */
    previousVelocity: Vector3;
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
    /** Index of this particle's first entry in the store's interleaved scalars. */
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
     * How many samples the trail keeps, the capacity of the history below; `TrailSettings.startLength`
     * rolls it at emission. 30, babylon.quarks's default, until then.
     * @type {number}
     */
    length = 30;
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
     * @internal
     */
    get previous(): LinkedList<RecordState> {
        return (this._previous ??= new LinkedList<RecordState>());
    }

    /**
     * Replaces the old history list.
     * @deprecated See the getter.
     * @internal
     */
    set previous(value: LinkedList<RecordState>) {
        this._previous = value;
    }

    private _previous: LinkedList<RecordState> | undefined = undefined;
    /**
     * UV tile index, kept in the store's `uvTile` column.
     * @type {number}
     */
    get uvTile(): number {
        return this.store.uvTile[this.storeIndex];
    }

    set uvTile(value: number) {
        this.store.uvTile[this.storeIndex] = value;
    }

    /** Ring buffer of recorded positions, 3 floats per sample. */
    historyPositions: Float32Array = EMPTY_HISTORY;
    /** Ring buffer of the widths the renderer draws, 1 float per sample. */
    historySizes: Float32Array = EMPTY_HISTORY;
    /**
     * Ring buffer of the particle's size (`size.x`) at each sample, before any
     * behavior rescaled it. Width behaviors scale this rather than
     * `historySizes`, so their factor is never compounded step after step.
     */
    historyBaseSizes: Float32Array = EMPTY_HISTORY;
    /**
     * Factor the next recorded sample's width is drawn with — what a width
     * behavior gives the head of the trail, which is recorded after the
     * behaviors have run. 1 unless such a behavior sets it.
     */
    headWidthScale = 1;
    /** Ring buffer of recorded colors, 4 floats per sample. */
    historyColors: Float32Array = EMPTY_HISTORY;
    /**
     * Ring buffer of recorded side vectors, 3 floats per sample, in the space
     * the positions are recorded in. Empty unless the trail is swept along an
     * axis (`TrailSettings.sideAxis`); see {@link ensureSideHistory}.
     */
    historySides: Float32Array = EMPTY_HISTORY;
    /** Ring buffer of the particle's age when each sample was recorded, 1 float per sample. */
    historyAges: Float32Array = EMPTY_HISTORY;
    /**
     * Ring buffer of each sample's distance along the trail, 1 float per sample: the straight
     * distances between the samples added up from the particle's first sample, in the space the
     * positions are recorded in. See {@link measureHeadDistance}.
     */
    historyDistances: Float32Array = EMPTY_HISTORY;
    /** Number of samples the ring buffers hold; the buffers themselves may be longer. */
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
        this.previousVelocity = new Vector3View(store.previousVelocity, offset3);
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
        (this.previousVelocity as Vector3View).bind(store.previousVelocity, offset3);
        (this.velocity as Vector3View).bind(store.velocity, offset3);
        (this.size as Vector3View).bind(store.size, offset3);
        (this.startSize as Vector3View).bind(store.startSize, offset3);
        (this.color as Vector4View).bind(store.color, offset4);
        (this.startColor as Vector4View).bind(store.startColor, offset4);
        this.scalars = store.scalars;
        this.scalarOffset = this.storeIndex * ParticleStore.SCALAR_STRIDE;
    }

    /**
     * Sets how many samples the history holds and empties it. The ring buffers are only
     * allocated when they are too short, so a particle re-emitted with a shorter or a random
     * length keeps the buffers it has.
     * @param {number} capacity - Number of samples to hold.
     */
    ensureHistoryCapacity(capacity: number): void {
        if (this.historyCapacity === capacity) {
            return;
        }
        this.historyCapacity = capacity;
        if (this.historySizes.length < capacity) {
            this.historyPositions = new Float32Array(capacity * 3);
            this.historySizes = new Float32Array(capacity);
            this.historyBaseSizes = new Float32Array(capacity);
            this.historyColors = new Float32Array(capacity * 4);
            this.historyAges = new Float32Array(capacity);
            this.historyDistances = new Float32Array(capacity);
            if (this.historySides.length > 0) {
                this.historySides = new Float32Array(capacity * 3);
            }
        }
        this.historyHead = 0;
        this.historyCount = 0;
    }

    /** Allocates {@link historySides} for the current capacity, once a trail is swept. */
    ensureSideHistory(): void {
        if (this.historySides.length < this.historyCapacity * 3) {
            this.historySides = new Float32Array(this.historyCapacity * 3);
        }
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
     * Records the current state into the trail ring buffer as a new sample, or over the newest
     * one with `replaceHead` (the head following the particle until it has moved far enough for
     * a sample of its own, see `TrailSettings.minVertexDistance`). Once the particle is dead
     * (`age >= life`) it drops the oldest sample instead, so the trail fades from the tail.
     * Allocation free.
     * @param replaceHead - Overwrite the newest sample rather than append one; appends when there is none.
     * @param measureDistance - Set the sample's distance along the trail; a host that moves the sample
     * after recording it passes false and calls {@link measureHeadDistance} itself.
     */
    update(replaceHead = false, measureDistance = true) {
        // Sized at spawn; this only catches a particle driven without one.
        if (this.historyCapacity === 0) {
            this.ensureHistoryCapacity(Math.max(1, Math.ceil(this.length)));
        }
        const capacity = this.historyCapacity;
        const store = this.store;
        const row = this.storeIndex;
        const scalar = row * ParticleStore.SCALAR_STRIDE;
        const age = store.scalars[scalar + ParticleStore.AGE];

        if (age >= store.scalars[scalar + ParticleStore.LIFE]) {
            this.dropOldest();
            return;
        }

        // Straight off the store's columns rather than through the vector views.
        const replacing = replaceHead && this.historyCount > 0;
        const head = replacing ? (this.historyHead + capacity - 1) % capacity : this.historyHead;
        const positionIndex = head * 3;
        const positions = this.historyPositions;
        const storePositions = store.position;
        const o3 = row * 3;
        positions[positionIndex] = storePositions[o3];
        positions[positionIndex + 1] = storePositions[o3 + 1];
        positions[positionIndex + 2] = storePositions[o3 + 2];
        const size = store.size[o3];
        this.historyBaseSizes[head] = size;
        this.historySizes[head] = size * this.headWidthScale;
        const colorIndex = head * 4;
        const colors = this.historyColors;
        const storeColors = store.color;
        const o4 = row * 4;
        colors[colorIndex] = storeColors[o4];
        colors[colorIndex + 1] = storeColors[o4 + 1];
        colors[colorIndex + 2] = storeColors[o4 + 2];
        colors[colorIndex + 3] = storeColors[o4 + 3];
        this.historyAges[head] = age;

        if (!replacing) {
            this.historyHead = (head + 1) % capacity;
            if (this.historyCount < capacity) {
                this.historyCount++;
            }
        }
        if (measureDistance) {
            this.measureHeadDistance();
        }
    }

    /**
     * Sets the newest sample's distance along the trail: the sample before it plus the straight
     * distance between the two, in the space the positions are recorded in; 0 for a trail's
     * first sample. {@link update} does this; a host that moves the sample after recording it
     * (babylon.quarks's world-space recording) calls it again.
     */
    measureHeadDistance(): void {
        const count = this.historyCount;
        if (count === 0) {
            return;
        }
        const capacity = this.historyCapacity;
        const head = (this.historyHead + capacity - 1) % capacity;
        if (count === 1) {
            this.historyDistances[head] = 0;
            return;
        }
        const previous = (head + capacity - 1) % capacity;
        const p = this.historyPositions;
        const dx = p[head * 3] - p[previous * 3];
        const dy = p[head * 3 + 1] - p[previous * 3 + 1];
        const dz = p[head * 3 + 2] - p[previous * 3 + 2];
        this.historyDistances[head] = this.historyDistances[previous] + Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /** Drops the oldest sample, the one the tail is drawn from, keeping the rest. */
    dropOldest(): void {
        if (this.historyCount > 0) {
            this.historyCount--;
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
        this.headWidthScale = 1;
        this.resetHistory();
    }

    memory = [];
}
