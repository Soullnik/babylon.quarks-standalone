import type {EffectBinding} from './binding';

const COALESCE_MS = 400;
const MAX_DEPTH = 50;

/**
 * Snapshot-based undo/redo over serialized effect JSON. Owned by the host (not the
 * binding) so history survives rebinding when a restore rebuilds the systems.
 *
 * Wire-up: call attach() whenever a binding is (re)mounted; on undo()/redo() feed the
 * returned JSON back through the host's import path and attach the new binding.
 */
export class EffectHistory {
    private undoStack: string[] = [];
    private redoStack: string[] = [];
    private lastCaptureTime = 0;
    private binding: EffectBinding | null = null;

    /** Points the history at the active binding and hooks snapshot capture. */
    attach(binding: EffectBinding): void {
        this.binding = binding;
        binding.onBeforeChange = () => this.capture();
    }

    get canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    get canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    clear(): void {
        this.undoStack = [];
        this.redoStack = [];
        this.lastCaptureTime = 0;
    }

    /** Pushes an undo snapshot; rapid consecutive edits are coalesced into one step. */
    capture(): void {
        if (!this.binding) {
            return;
        }
        const now = Date.now();
        if (now - this.lastCaptureTime < COALESCE_MS && this.undoStack.length > 0) {
            return;
        }
        this.lastCaptureTime = now;
        this.undoStack.push(this.binding.exportJSON());
        if (this.undoStack.length > MAX_DEPTH) {
            this.undoStack.shift();
        }
        this.redoStack = [];
    }

    /** Returns the previous effect state as parsed JSON, or null when nothing to undo. */
    undo(): unknown | null {
        if (!this.binding || this.undoStack.length === 0) {
            return null;
        }
        const snapshot = this.undoStack.pop()!;
        this.redoStack.push(this.binding.exportJSON());
        this.lastCaptureTime = 0;
        return JSON.parse(snapshot);
    }

    /** Returns the next effect state as parsed JSON, or null when nothing to redo. */
    redo(): unknown | null {
        if (!this.binding || this.redoStack.length === 0) {
            return null;
        }
        const snapshot = this.redoStack.pop()!;
        this.undoStack.push(this.binding.exportJSON());
        this.lastCaptureTime = 0;
        return JSON.parse(snapshot);
    }
}
