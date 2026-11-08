import {Buffer, VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import type {Mesh} from '@babylonjs/core/Meshes/mesh';
import {copyRange, PrefixViews} from './prefixViews';

/** A view of an interleaved instance attribute: its vertex buffer kind, offset and size, in floats. */
export type InstanceView = readonly [kind: string, offset: number, size: number];

/**
 * An instance attribute of a sprite batch: its vertex buffer kind and floats per instance, and,
 * for one that interleaves several, the views the shader reads it through. The views of one
 * buffer take a single vertex buffer binding on WebGPU, which allows 8.
 */
export type InstanceAttribute = readonly [kind: string, size: number, views?: readonly InstanceView[]];

/** A mesh instance's stretch: its three columns, interleaved. */
export const STRETCH_ATTRIBUTE: InstanceAttribute = [
    'stretch',
    9,
    [
        ['stretchX', 0, 3],
        ['stretchY', 3, 3],
        ['stretchZ', 6, 3],
    ],
];

/**
 * A later run of a sprite batch's systems (see `VFXBatch.runCount`): a mesh over the batch's
 * geometry and material with instance buffers of its own, into which the batch copies the run's
 * instances each frame. Its buffers grow and are kept, so a run drawn every frame reallocates
 * nothing; a buffer that moved would rebuild the mesh's vertex bindings.
 * @internal
 */
export class InstanceRun {
    private arrays: Float32Array[] = [];
    private buffers: Array<VertexBuffer | Buffer> = [];
    private readonly views: PrefixViews[] = [];
    private capacity = 0;

    /** @param mesh - The run's mesh, which the batch has bound its geometry to. */
    constructor(readonly mesh: Mesh) {}

    /** Smallest capacity a run starts with, in instances. */
    private static readonly MIN_CAPACITY = 64;

    /**
     * Copies `count` instances from `first` of each of `sources` (one array per attribute of
     * `layout`) into the run's buffers and uploads them, and draws that many.
     */
    write(
        sources: ReadonlyArray<Float32Array | undefined>,
        layout: readonly InstanceAttribute[],
        first: number,
        count: number
    ): void {
        this.fit(count, layout);
        for (let a = 0; a < layout.length; a++) {
            const size = layout[a][1];
            const source = sources[a]!;
            const target = this.arrays[a];
            copyRange(target, 0, source, first * size, (first + count) * size);
            this.buffers[a].update(this.views[a].of(target, count * size));
        }
        this.mesh.forcedInstanceCount = count;
    }

    /** Grows the buffers to hold `count` instances, doubling. */
    private fit(count: number, layout: readonly InstanceAttribute[]): void {
        if (count <= this.capacity) {
            return;
        }
        let capacity = Math.max(InstanceRun.MIN_CAPACITY, this.capacity);
        while (capacity < count) {
            capacity *= 2;
        }
        this.capacity = capacity;
        const engine = this.mesh.getEngine();
        for (let a = 0; a < layout.length; a++) {
            const [kind, size, views] = layout[a];
            const array = new Float32Array(capacity * size);
            let buffer: VertexBuffer | Buffer;
            if (views) {
                // The views do not own the buffer they read, so the one replaced goes here.
                (this.buffers[a] as Buffer | undefined)?.dispose();
                buffer = new Buffer(engine, array, true, size, false, true);
                for (const [viewKind, offset, viewSize] of views) {
                    this.mesh.setVerticesBuffer(buffer.createVertexBuffer(viewKind, offset, viewSize));
                }
            } else {
                buffer = new VertexBuffer(engine, array, kind, true, false, size, true);
                // Disposes the buffer it replaces.
                this.mesh.setVerticesBuffer(buffer);
            }
            this.arrays[a] = array;
            this.buffers[a] = buffer;
            this.views[a] ??= new PrefixViews();
        }
    }

    /** Disposes the mesh and its buffers; the batch's geometry buffer and material stay. */
    dispose(): void {
        this.mesh.dispose(false, false);
        // An interleaved buffer outlives its views, which the mesh disposed.
        for (const buffer of this.buffers) {
            if (buffer instanceof Buffer) {
                buffer.dispose();
            }
        }
        this.arrays = [];
        this.buffers = [];
    }
}
