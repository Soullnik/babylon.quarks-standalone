/**
 * Column storage for the vector-valued particle attributes.
 *
 * The three-component and four-component fields of a particle used to be six
 * separate objects per particle, so walking a system meant chasing pointers
 * across the heap. Here each attribute is one flat `Float32Array` shared by
 * every particle in a system, and a particle holds views into its own row. The
 * numbers a simulation step touches are then contiguous and prefetchable, while
 * `particle.position.x` keeps working exactly as before.
 *
 * Scalar attributes (age, life, rotation, …) stay as plain properties on the
 * particle: a monomorphic own property is already a single load, so moving them
 * here would add an indirection rather than remove one.
 */
export class ParticleStore {
    private static readonly EMPTY = new Float32Array(0);

    /** Number of particle rows the arrays can hold. */
    capacity: number;

    position: Float32Array;
    /**
     * Where each particle was when the current simulation step began.
     *
     * The step is fixed while frames are not, so a frame is usually drawn some
     * way past the last step. The renderer closes that gap by continuing the
     * motion the last step produced — and the only way to know that motion for
     * every kind of behavior, not just the ones that move a particle by its
     * velocity, is to have kept where it started.
     */
    previousPosition: Float32Array;
    /**
     * Size and colour at the start of the current step, for the same reason as
     * {@link previousPosition}. These are read off a curve at `age / life`
     * rather than integrated, and at the lifetimes an explosion uses — a fifth
     * of a second, a dozen steps in total — a whole step of fade lands on one
     * frame and none on the next.
     */
    previousSize: Float32Array;
    previousColor: Float32Array;
    /**
     * Velocity at the start of the current step. A stretched billboard's shape
     * is its velocity — the streak points along it and is as long as it — so a
     * velocity that only changes on steps makes the sprite's outline pop at the
     * step rate even while its position moves smoothly.
     *
     * Empty until {@link keepPreviousVelocity} asks for it, because only that
     * one render mode reads it and an unused column is not free: it sits
     * between the columns that are hot and costs them their locality.
     */
    previousVelocity: Float32Array = ParticleStore.EMPTY;
    velocity: Float32Array;
    size: Float32Array;
    startSize: Float32Array;
    color: Float32Array;
    startColor: Float32Array;
    /**
     * age, life and speedModifier interleaved, {@link SCALAR_STRIDE} per row.
     *
     * Double precision, unlike the vector columns: age accumulates `+= delta`
     * for the particle's whole life and is compared against life to decide
     * death, so rounding it to float32 shifts when particles die and makes
     * tightly balanced emitters flicker.
     */
    scalars: Float64Array;
    /**
     * Scalars the renderer uploads and the behaviors write, one per row, so a
     * batch copies them as ranges instead of visiting every particle object:
     * sprite rotation angle and its rate, texture tile, mirroring bits and the
     * speed the particle was born with. A mesh particle keeps its quaternion
     * rotation on the particle; its `rotation` row here is then unused.
     */
    rotation: Float32Array;
    angularVelocity: Float32Array;
    uvTile: Float32Array;
    startSpeed: Float32Array;
    /** Bit 1 mirrors along U, bit 2 along V. */
    flip: Uint8Array;
    /**
     * Quaternion rotation and one step's quaternion turn, 4 per row, for
     * particles that rotate by quaternion (mesh render mode). Empty until
     * {@link ensureQuaternionColumns} is asked for them, so systems of
     * billboards do not pay for columns they never read.
     */
    rotationQuaternion: Float32Array = ParticleStore.EMPTY;
    angularVelocityQuaternion: Float32Array = ParticleStore.EMPTY;

    /**
     * Numeric copy of each particle's generator memory, {@link memoryStride}
     * values per row. The spawn path calls every generator's `startGen` in a
     * fixed order, so a given slot holds the same generator's sample for every
     * particle, which lets a compiled behavior pass read a particle's random
     * sample from a column instead of through its `memory` array. Slots that
     * hold something other than a number are NaN here; readers then fall back
     * to the array. Empty until {@link recordMemory} sees the first spawn.
     */
    memory: Float64Array = new Float64Array(0);
    memoryStride = 0;

    /** Values per row in {@link scalars}. */
    static readonly SCALAR_STRIDE = 3;
    /** Offsets within a {@link scalars} row. */
    static readonly AGE = 0;
    static readonly LIFE = 1;
    static readonly SPEED_MODIFIER = 2;

    constructor(capacity = 64) {
        this.capacity = Math.max(1, capacity);
        this.position = new Float32Array(this.capacity * 3);
        this.previousPosition = new Float32Array(this.capacity * 3);
        this.previousSize = new Float32Array(this.capacity * 3);
        this.previousColor = new Float32Array(this.capacity * 4);
        this.velocity = new Float32Array(this.capacity * 3);
        this.size = new Float32Array(this.capacity * 3);
        this.startSize = new Float32Array(this.capacity * 3);
        this.color = new Float32Array(this.capacity * 4);
        this.startColor = new Float32Array(this.capacity * 4);
        this.scalars = new Float64Array(this.capacity * ParticleStore.SCALAR_STRIDE);
        this.rotation = new Float32Array(this.capacity);
        this.angularVelocity = new Float32Array(this.capacity);
        this.uvTile = new Float32Array(this.capacity);
        this.startSpeed = new Float32Array(this.capacity);
        this.flip = new Uint8Array(this.capacity);
    }

    /**
     * Grows the arrays so `count` rows fit, preserving the existing contents.
     *
     * @param count - Number of rows that must be addressable.
     * @returns `true` when the arrays were replaced, meaning every particle
     * bound to this store has to be re-bound.
     */
    ensureCapacity(count: number): boolean {
        if (count <= this.capacity) {
            return false;
        }
        let capacity = this.capacity;
        while (capacity < count) {
            capacity *= 2;
        }
        this.position = ParticleStore.grow(this.position, capacity * 3);
        this.previousPosition = ParticleStore.grow(this.previousPosition, capacity * 3);
        const sizeAliased = this.previousSize === this.size;
        const colorAliased = this.previousColor === this.color;
        if (!sizeAliased) {
            this.previousSize = ParticleStore.grow(this.previousSize, capacity * 3);
        }
        if (this.previousVelocity.length > 0) {
            this.previousVelocity = ParticleStore.grow(this.previousVelocity, capacity * 3);
        }
        if (this.rotationQuaternion.length > 0) {
            const previousLength = this.rotationQuaternion.length;
            this.rotationQuaternion = ParticleStore.grow(this.rotationQuaternion, capacity * 4);
            this.angularVelocityQuaternion = ParticleStore.grow(this.angularVelocityQuaternion, capacity * 4);
            for (let i = previousLength + 3; i < capacity * 4; i += 4) {
                this.rotationQuaternion[i] = 1;
                this.angularVelocityQuaternion[i] = 1;
            }
        }
        if (!colorAliased) {
            this.previousColor = ParticleStore.grow(this.previousColor, capacity * 4);
        }
        this.velocity = ParticleStore.grow(this.velocity, capacity * 3);
        this.size = ParticleStore.grow(this.size, capacity * 3);
        this.startSize = ParticleStore.grow(this.startSize, capacity * 3);
        this.color = ParticleStore.grow(this.color, capacity * 4);
        if (sizeAliased) {
            this.previousSize = this.size;
        }
        if (colorAliased) {
            this.previousColor = this.color;
        }
        this.startColor = ParticleStore.grow(this.startColor, capacity * 4);
        this.scalars = ParticleStore.growDouble(this.scalars, capacity * ParticleStore.SCALAR_STRIDE);
        if (this.memoryStride > 0) {
            const grown = new Float64Array(capacity * this.memoryStride);
            grown.fill(NaN);
            grown.set(this.memory);
            this.memory = grown;
        }
        this.rotation = ParticleStore.grow(this.rotation, capacity);
        this.angularVelocity = ParticleStore.grow(this.angularVelocity, capacity);
        this.uvTile = ParticleStore.grow(this.uvTile, capacity);
        this.startSpeed = ParticleStore.grow(this.startSpeed, capacity);
        const flip = new Uint8Array(capacity);
        flip.set(this.flip);
        this.flip = flip;
        this.capacity = capacity;
        return true;
    }

    /**
     * Exchanges the contents of two rows.
     *
     * Used to keep row order aligned with the owning system's particle order, so
     * the live particles stay a contiguous range that a renderer can copy in one
     * go rather than gathering particle by particle.
     */
    /**
     * Starts keeping {@link previousVelocity}. Harmless to call every step;
     * returns true on the call that allocated, which replaces the array and so
     * leaves every particle's view of it pointing at the old one.
     */
    keepPreviousVelocity(): boolean {
        if (this.previousVelocity.length >= this.capacity * 3) {
            return false;
        }
        this.previousVelocity = new Float32Array(this.capacity * 3);
        return true;
    }

    /**
     * Mirrors a freshly spawned particle's generator memory into the
     * {@link ParticleStore.memory | memory} column, widening the column when this spawn used more
     * slots than any before it.
     */
    recordMemory(row: number, memory: ReadonlyArray<unknown>): void {
        const slots = memory.length;
        let stride = this.memoryStride;
        if (slots > stride || this.memory.length < this.capacity * stride) {
            stride = Math.max(stride, slots);
            const widened = new Float64Array(this.capacity * stride);
            widened.fill(NaN);
            const previousStride = this.memoryStride;
            const previous = this.memory;
            const rows = previousStride > 0 ? previous.length / previousStride : 0;
            for (let r = 0, from = 0, to = 0; r < rows; r++, from += previousStride, to += stride) {
                for (let j = 0; j < previousStride; j++) {
                    widened[to + j] = previous[from + j];
                }
            }
            this.memory = widened;
            this.memoryStride = stride;
        }
        const base = row * stride;
        for (let j = 0; j < stride; j++) {
            const value = j < slots ? memory[j] : undefined;
            this.memory[base + j] = typeof value === 'number' ? value : NaN;
        }
    }

    /**
     * Whether {@link previousSize} is a snapshot of its own or an alias of
     * {@link size}. A system whose behaviors never change a particle's size
     * after birth has nothing to carry between steps for it, and aliasing the
     * two saves the copy a step would otherwise make; readers that interpolate
     * from previous to current then get the current value unchanged.
     */
    useSizeSnapshot(enabled: boolean): void {
        if (enabled) {
            if (this.previousSize === this.size) {
                this.previousSize = new Float32Array(this.size);
            }
        } else {
            this.previousSize = this.size;
        }
    }

    /** The same for {@link previousColor}, see {@link useSizeSnapshot}. */
    useColorSnapshot(enabled: boolean): void {
        if (enabled) {
            if (this.previousColor === this.color) {
                this.previousColor = new Float32Array(this.color);
            }
        } else {
            this.previousColor = this.color;
        }
    }

    /**
     * Allocates the quaternion columns. Returns true on the call that did,
     * which means views already bound to the store need re-binding.
     */
    ensureQuaternionColumns(): boolean {
        if (this.rotationQuaternion.length >= this.capacity * 4) {
            return false;
        }
        this.rotationQuaternion = new Float32Array(this.capacity * 4);
        this.angularVelocityQuaternion = new Float32Array(this.capacity * 4);
        // Identity, so a row read before its particle writes it draws unturned.
        for (let i = 3; i < this.rotationQuaternion.length; i += 4) {
            this.rotationQuaternion[i] = 1;
            this.angularVelocityQuaternion[i] = 1;
        }
        return true;
    }

    swapRows(a: number, b: number): void {
        if (a === b) {
            return;
        }
        const a3 = a * 3;
        const b3 = b * 3;
        ParticleStore.swap3(this.position, a3, b3);
        ParticleStore.swap3(this.previousPosition, a3, b3);
        if (this.previousSize !== this.size) {
            ParticleStore.swap3(this.previousSize, a3, b3);
        }
        if (this.previousVelocity.length > 0) {
            ParticleStore.swap3(this.previousVelocity, a3, b3);
        }
        ParticleStore.swap3(this.velocity, a3, b3);
        ParticleStore.swap3(this.size, a3, b3);
        ParticleStore.swap3(this.startSize, a3, b3);
        const a4 = a * 4;
        const b4 = b * 4;
        ParticleStore.swap4(this.color, a4, b4);
        if (this.previousColor !== this.color) {
            ParticleStore.swap4(this.previousColor, a4, b4);
        }
        ParticleStore.swap4(this.startColor, a4, b4);
        if (this.rotationQuaternion.length > 0) {
            ParticleStore.swap4(this.rotationQuaternion, a4, b4);
            ParticleStore.swap4(this.angularVelocityQuaternion, a4, b4);
        }
        ParticleStore.swap3(this.scalars, a * ParticleStore.SCALAR_STRIDE, b * ParticleStore.SCALAR_STRIDE);
        const stride = this.memoryStride;
        if (stride > 0) {
            const memory = this.memory;
            for (let j = 0, ma = a * stride, mb = b * stride; j < stride; j++, ma++, mb++) {
                const temp = memory[ma];
                memory[ma] = memory[mb];
                memory[mb] = temp;
            }
        }
        ParticleStore.swap1(this.rotation, a, b);
        ParticleStore.swap1(this.angularVelocity, a, b);
        ParticleStore.swap1(this.uvTile, a, b);
        ParticleStore.swap1(this.startSpeed, a, b);
        ParticleStore.swap1(this.flip, a, b);
    }

    private static swap1(data: Float32Array | Uint8Array, a: number, b: number): void {
        const temp = data[a];
        data[a] = data[b];
        data[b] = temp;
    }

    private static growDouble(source: Float64Array, length: number): Float64Array {
        const grown = new Float64Array(length);
        grown.set(source);
        return grown;
    }

    private static swap3(data: Float32Array | Float64Array, a: number, b: number): void {
        let temp = data[a];
        data[a] = data[b];
        data[b] = temp;
        temp = data[a + 1];
        data[a + 1] = data[b + 1];
        data[b + 1] = temp;
        temp = data[a + 2];
        data[a + 2] = data[b + 2];
        data[b + 2] = temp;
    }

    private static swap4(data: Float32Array, a: number, b: number): void {
        ParticleStore.swap3(data, a, b);
        const temp = data[a + 3];
        data[a + 3] = data[b + 3];
        data[b + 3] = temp;
    }

    private static grow(source: Float32Array, length: number): Float32Array {
        const grown = new Float32Array(length);
        grown.set(source);
        return grown;
    }
}
