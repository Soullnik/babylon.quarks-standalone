import type {EffectBinding} from './binding.js';

const COALESCE_MS = 400;
const MAX_DEPTH = 50;

/** Undo/redo stacks of one effect, kept by the host while another effect is focused. */
export interface HistoryStacks {
    /** Snapshots to undo to, oldest first. */
    undo: string[];
    /** Snapshots to redo to, most recent undo last. */
    redo: string[];
}

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

    /** There is a change to undo. */
    get canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    /** There is an undone change to redo. */
    get canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    /** Forgets every snapshot. */
    clear(): void {
        this.undoStack = [];
        this.redoStack = [];
        this.lastCaptureTime = 0;
    }

    /** The current stacks, to hand back to `restoreStacks` when this effect is focused again. */
    saveStacks(): HistoryStacks {
        return {undo: this.undoStack, redo: this.redoStack};
    }

    /** Puts back stacks from `saveStacks`; undefined starts empty. */
    restoreStacks(stacks: HistoryStacks | undefined): void {
        this.undoStack = stacks?.undo ?? [];
        this.redoStack = stacks?.redo ?? [];
        this.lastCaptureTime = 0;
    }

    /**
     * Pushes an undo snapshot. A burst of edits — typing a number, dragging a curve handle or a
     * slider — is one step: each edit within COALESCE_MS of the previous one extends the burst.
     */
    capture(): void {
        if (!this.binding) {
            return;
        }
        const now = Date.now();
        const continuesBurst = now - this.lastCaptureTime < COALESCE_MS && this.undoStack.length > 0;
        this.lastCaptureTime = now;
        if (continuesBurst) {
            return;
        }
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
