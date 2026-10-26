// Views of the start of a typed array, for a steady frame that allocates nothing. Babylon uploads
// a whole array without a copy or a view of its own, so a batch uploads the filled start of a
// buffer through one of these: its length is rounded up to a whole chunk, and the view for each
// rounded length is made once and kept. The few values past the filled slots that go up with it
// are never drawn, since the draw count stops before them.

/**
 * The lengths a batch's uploads go up in, in values: a few hundred values past the filled slots
 * cost nothing next to a frame's upload, and keep the number of kept views small.
 * @internal
 */
export const UPLOAD_CHUNK = 256;

/** @internal */
export class PrefixViews<T extends Float32Array | Uint32Array = Float32Array> {
    // Two buffers, since a sorted batch swaps each buffer with a spare every frame: the views of
    // both are kept, and a third buffer, grown for a new high-water mark, takes the older slot.
    private buffers: [T | undefined, T | undefined] = [undefined, undefined];
    private readonly views: [Map<number, T>, Map<number, T>] = [new Map(), new Map()];

    /** @param chunk - The lengths views come in, in values. */
    constructor(private readonly chunk: number = UPLOAD_CHUNK) {}

    /**
     * A view of `buffer` from its start, at least `length` values long: `length` rounded up to a
     * whole chunk, or the whole buffer when that is shorter.
     */
    of(buffer: T, length: number): T {
        if (buffer !== this.buffers[0]) {
            if (buffer === this.buffers[1]) {
                this.buffers.reverse();
                this.views.reverse();
            } else {
                // A buffer grown for a new high-water mark; the views of the older one go.
                this.buffers[1] = this.buffers[0];
                this.buffers[0] = buffer;
                const older = this.views[1];
                older.clear();
                this.views[1] = this.views[0];
                this.views[0] = older;
            }
        }
        const views = this.views[0];
        const rounded = Math.min(buffer.length, Math.ceil(length / this.chunk) * this.chunk);
        let view = views.get(rounded);
        if (view === undefined) {
            view = rounded === buffer.length ? buffer : (buffer.subarray(0, rounded) as T);
            views.set(rounded, view);
        }
        return view;
    }
}

/**
 * Copies the first `count` values of `source` into `target` from `offset`: what
 * `target.set(source.subarray(0, count), offset)` does, without making the view.
 * @internal
 */
export function copyPrefix(target: Float32Array, offset: number, source: Float32Array, count: number): void {
    copyRange(target, offset, source, 0, count);
}

/**
 * Copies the values of `source` from `begin` up to `end` into `target` from `offset`: what
 * `target.set(source.subarray(begin, end), offset)` does, without making the view.
 * @internal
 */
export function copyRange(
    target: Float32Array,
    offset: number,
    source: Float32Array,
    begin: number,
    end: number
): void {
    if (begin === 0 && end === source.length) {
        target.set(source, offset);
        return;
    }
    if (offset + end - begin > target.length) {
        throw new RangeError('offset is out of bounds');
    }
    for (let i = begin; i < end; i++) {
        target[offset + i - begin] = source[i];
    }
}
