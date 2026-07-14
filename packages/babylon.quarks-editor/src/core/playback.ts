/** Stage transport + per-focus timeline state (decoupled from gallery preview set). */
export interface PlaybackState {
    /** When true, all in-scene preview effects simulate. */
    stagePlaying: boolean;
    focusRootId: number | null;
    focusElapsedByRoot: Map<number, number>;
    focusFinishedByRoot: Set<number>;
    speed: number;
    stepQueued: boolean;
    scrubbing: boolean;
}

/** Default playback state for a new editor session. */
export function createPlaybackState(): PlaybackState {
    return {
        stagePlaying: true,
        focusRootId: null,
        focusElapsedByRoot: new Map(),
        focusFinishedByRoot: new Set(),
        speed: 1,
        stepQueued: false,
        scrubbing: false,
    };
}

/** Elapsed timeline time for one focused effect root. */
export function getFocusElapsed(state: PlaybackState, rootId: number): number {
    return state.focusElapsedByRoot.get(rootId) ?? 0;
}

/** Writes focus elapsed time (playhead position). */
export function setFocusElapsed(state: PlaybackState, rootId: number, elapsed: number): void {
    state.focusElapsedByRoot.set(rootId, elapsed);
}

/** Clears the parked-at-end flag after restart or scrub before the end. */
export function clearFocusFinished(state: PlaybackState, rootId: number): void {
    state.focusFinishedByRoot.delete(rootId);
}

/** Marks a one-shot focus effect as finished (playhead parked at duration). */
export function markFocusFinished(state: PlaybackState, rootId: number): void {
    state.focusFinishedByRoot.add(rootId);
}

/** Whether a one-shot focus effect has reached the end of its timeline. */
export function isFocusFinished(state: PlaybackState, rootId: number): boolean {
    return state.focusFinishedByRoot.has(rootId);
}
