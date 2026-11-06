import type {Vector3} from '@babylonjs/core/Maths/math.vector';
import type {IParticleSystem} from 'quarks.core';
import type {VFXBatch} from './VFXBatch';

/** A visible system of a transparent batch, with what it is ordered by. */
interface DrawEntry {
    system: IParticleSystem | null;
    batch: VFXBatch | null;
    batchIndex: number;
    group: number;
    alphaIndex: number;
    key: number;
}

/** Whether `a` is drawn after `b`: by rendering group, alpha index, key (back to front), batch. */
function after(a: DrawEntry, b: DrawEntry): boolean {
    if (a.group !== b.group) {
        return a.group > b.group;
    }
    if (a.alphaIndex !== b.alphaIndex) {
        return a.alphaIndex > b.alphaIndex;
    }
    if (a.key !== b.key) {
        return a.key < b.key;
    }
    return a.batchIndex > b.batchIndex;
}

/**
 * The renderer's order of its transparent particle systems, set each frame before the batches
 * fill: Unity's order of transparent renderers, back to front by the distance from the camera to
 * the centre of each system's bounds plus its sorting fudge, within each rendering group and
 * alpha index. Each batch is then filled in that order and split into the runs of its systems
 * that come one after another, one draw each (see `VFXBatch.runCount`). Two systems at one key
 * go by the order the batches were made in, which keeps a batch's systems together.
 * @internal
 */
export class DrawOrder {
    /** The entries, pooled; each frame's first ones in the order they were sorted into. */
    private readonly entries: DrawEntry[] = [];
    /** The merge sort's other array, as long as {@link entries}. */
    private readonly spare: DrawEntry[] = [];
    /** Visible systems without particles, and their batches: they draw nothing and are not ordered. */
    private readonly idle: Array<IParticleSystem | VFXBatch> = [];

    /** Orders the systems of the transparent `batches` as seen from `eye`, for their coming fill. */
    order(batches: ReadonlyArray<VFXBatch>, eye: Vector3): void {
        const idle = this.idle;
        let count = 0;
        for (let b = 0; b < batches.length; b++) {
            const batch = batches[b];
            if (batch.systems.size === 0 || !batch.settings.materialTransparent) {
                continue;
            }
            const systems = batch.getVisibleSystems();
            for (let i = 0; i < systems.length; i++) {
                const system = systems[i];
                if (system.particleNum === 0) {
                    idle.push(system, batch);
                    continue;
                }
                const entry = this.entryAt(count++);
                entry.system = system;
                entry.batch = batch;
                entry.batchIndex = b;
                entry.group = batch.settings.renderingGroupId;
                entry.alphaIndex = batch.settings.renderOrder;
                entry.key = batch.drawKey(system, eye);
            }
            // The systems were read out of the list this clears.
            batch.beginDrawOrder();
        }
        const sorted = this.sort(count);
        let previous: VFXBatch | null = null;
        let sequence = 0;
        for (let i = 0; i < count; i++) {
            const entry = sorted[i];
            const batch = entry.batch!;
            if (batch !== previous) {
                batch.startRun(entry.key, sequence++);
                previous = batch;
            }
            batch.addToRun(entry.system!);
            // Not kept past the frame: a removed system or batch is let go.
            entry.system = null;
            entry.batch = null;
        }
        for (let i = 0; i < idle.length; i += 2) {
            (idle[i + 1] as VFXBatch).addIdle(idle[i] as IParticleSystem);
        }
        idle.length = 0;
    }

    private entryAt(index: number): DrawEntry {
        let entry = this.entries[index];
        if (entry === undefined) {
            entry = {system: null, batch: null, batchIndex: 0, group: 0, alphaIndex: 0, key: 0};
            this.entries[index] = entry;
            this.spare[index] = entry;
        }
        return entry;
    }

    /**
     * Sorts the first `count` entries, stably, and returns them: a bottom-up merge sort between
     * {@link entries} and {@link spare}, which allocates nothing.
     */
    private sort(count: number): DrawEntry[] {
        let from = this.entries;
        let to = this.spare;
        for (let width = 1; width < count; width *= 2) {
            for (let left = 0; left < count; left += 2 * width) {
                const middle = Math.min(left + width, count);
                const right = Math.min(left + 2 * width, count);
                let i = left;
                let j = middle;
                let k = left;
                while (i < middle && j < right) {
                    to[k++] = after(from[i], from[j]) ? from[j++] : from[i++];
                }
                while (i < middle) {
                    to[k++] = from[i++];
                }
                while (j < right) {
                    to[k++] = from[j++];
                }
            }
            const swap = from;
            from = to;
            to = swap;
        }
        // Back into the pool, which then holds each entry once whatever the count next frame.
        if (from !== this.entries) {
            for (let i = 0; i < count; i++) {
                this.entries[i] = from[i];
            }
        }
        return this.entries;
    }
}
