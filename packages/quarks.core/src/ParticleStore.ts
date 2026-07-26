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
        this.previousSize = ParticleStore.grow(this.previousSize, capacity * 3);
        this.previousColor = ParticleStore.grow(this.previousColor, capacity * 4);
        this.velocity = ParticleStore.grow(this.velocity, capacity * 3);
        this.size = ParticleStore.grow(this.size, capacity * 3);
        this.startSize = ParticleStore.grow(this.startSize, capacity * 3);
        this.color = ParticleStore.grow(this.color, capacity * 4);
        this.startColor = ParticleStore.grow(this.startColor, capacity * 4);
        this.scalars = ParticleStore.growDouble(this.scalars, capacity * ParticleStore.SCALAR_STRIDE);
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
    swapRows(a: number, b: number): void {
        if (a === b) {
            return;
        }
        const a3 = a * 3;
        const b3 = b * 3;
        ParticleStore.swap3(this.position, a3, b3);
        ParticleStore.swap3(this.previousPosition, a3, b3);
        ParticleStore.swap3(this.previousSize, a3, b3);
        ParticleStore.swap3(this.velocity, a3, b3);
        ParticleStore.swap3(this.size, a3, b3);
        ParticleStore.swap3(this.startSize, a3, b3);
        const a4 = a * 4;
        const b4 = b * 4;
        ParticleStore.swap4(this.color, a4, b4);
        ParticleStore.swap4(this.previousColor, a4, b4);
        ParticleStore.swap4(this.startColor, a4, b4);
        ParticleStore.swap3(this.scalars, a * ParticleStore.SCALAR_STRIDE, b * ParticleStore.SCALAR_STRIDE);
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
