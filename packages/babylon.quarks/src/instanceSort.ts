/**
 * Sorting a batch's instances by a per-instance key, fast enough to run every
 * frame over tens of thousands of particles: a three-pass radix sort on 32-bit
 * keys (no comparator calls, linear time) and a gather of each attribute buffer
 * in the resulting order.
 */

const RADIX_BITS = 11;
const RADIX_SIZE = 1 << RADIX_BITS;
const RADIX_MASK = RADIX_SIZE - 1;

/** Scratch space for {@link sortByKey}, sized for a given instance count. */
export class SortScratch {
    keys: Uint32Array;
    orderA: Uint32Array;
    orderB: Uint32Array;
    readonly counts = new Uint32Array(RADIX_SIZE);
    private readonly floatView = new Float32Array(1);
    private readonly uintView = new Uint32Array(this.floatView.buffer);

    constructor(capacity: number) {
        this.keys = new Uint32Array(capacity);
        this.orderA = new Uint32Array(capacity);
        this.orderB = new Uint32Array(capacity);
    }

    ensure(capacity: number): void {
        if (this.keys.length < capacity) {
            this.keys = new Uint32Array(capacity);
            this.orderA = new Uint32Array(capacity);
            this.orderB = new Uint32Array(capacity);
        }
    }

    /**
     * The bits of a non-negative float, which order the same way the float
     * does, so they can be radix sorted. `descending` flips the order.
     */
    floatKey(value: number, descending: boolean): number {
        this.floatView[0] = value;
        const bits = this.uintView[0];
        return descending ? ~bits >>> 0 : bits;
    }
}

/**
 * Fills `order` with the instance indices `[0, count)` sorted by ascending
 * `scratch.keys`. Returns the array holding the result, one of the two order
 * buffers of the scratch.
 */
export function sortByKey(scratch: SortScratch, count: number): Uint32Array {
    const keys = scratch.keys;
    const counts = scratch.counts;
    let from = scratch.orderA;
    let to = scratch.orderB;
    for (let i = 0; i < count; i++) {
        from[i] = i;
    }
    for (let shift = 0; shift < 32; shift += RADIX_BITS) {
        counts.fill(0);
        for (let i = 0; i < count; i++) {
            counts[(keys[from[i]] >>> shift) & RADIX_MASK]++;
        }
        // A pass whose keys all share one digit changes nothing; skip the scatter.
        if (counts[(keys[from[0]] >>> shift) & RADIX_MASK] === count) {
            continue;
        }
        let sum = 0;
        for (let b = 0; b < RADIX_SIZE; b++) {
            const c = counts[b];
            counts[b] = sum;
            sum += c;
        }
        for (let i = 0; i < count; i++) {
            const index = from[i];
            to[counts[(keys[index] >>> shift) & RADIX_MASK]++] = index;
        }
        const swap = from;
        from = to;
        to = swap;
    }
    return from;
}

/** Copies `count` instances of `stride` floats from `source` into `target` in `order`. */
export function gather(
    source: Float32Array,
    target: Float32Array,
    order: Uint32Array,
    count: number,
    stride: number
): void {
    if (stride === 1) {
        for (let i = 0; i < count; i++) {
            target[i] = source[order[i]];
        }
    } else if (stride === 3) {
        for (let i = 0, o = 0; i < count; i++, o += 3) {
            const s = order[i] * 3;
            target[o] = source[s];
            target[o + 1] = source[s + 1];
            target[o + 2] = source[s + 2];
        }
    } else if (stride === 4) {
        for (let i = 0, o = 0; i < count; i++, o += 4) {
            const s = order[i] * 4;
            target[o] = source[s];
            target[o + 1] = source[s + 1];
            target[o + 2] = source[s + 2];
            target[o + 3] = source[s + 3];
        }
    } else {
        for (let i = 0; i < count; i++) {
            const s = order[i] * stride;
            const o = i * stride;
            for (let k = 0; k < stride; k++) {
                target[o + k] = source[s + k];
            }
        }
    }
}
