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
    velocity: Float32Array;
    size: Float32Array;
    startSize: Float32Array;
    color: Float32Array;
    startColor: Float32Array;

    constructor(capacity = 64) {
        this.capacity = Math.max(1, capacity);
        this.position = new Float32Array(this.capacity * 3);
        this.velocity = new Float32Array(this.capacity * 3);
        this.size = new Float32Array(this.capacity * 3);
        this.startSize = new Float32Array(this.capacity * 3);
        this.color = new Float32Array(this.capacity * 4);
        this.startColor = new Float32Array(this.capacity * 4);
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
        this.velocity = ParticleStore.grow(this.velocity, capacity * 3);
        this.size = ParticleStore.grow(this.size, capacity * 3);
        this.startSize = ParticleStore.grow(this.startSize, capacity * 3);
        this.color = ParticleStore.grow(this.color, capacity * 4);
        this.startColor = ParticleStore.grow(this.startColor, capacity * 4);
        this.capacity = capacity;
        return true;
    }

    private static grow(source: Float32Array, length: number): Float32Array {
        const grown = new Float32Array(length);
        grown.set(source);
        return grown;
    }
}
