import type {Scene} from '@babylonjs/core/scene';
import type {BatchedRenderer} from 'babylon.quarks';
import type {EffectBinding} from './binding';
import {clearFocusFinished, isFocusFinished, setFocusElapsed, type PlaybackState} from './playback';
import {playFocus, scrubFocusTo} from './scrub';

/**
 * Stage Play/Pause shared by the viewport transport bar and the timeline. Pressing Play on a
 * one-shot focus that already parked at its end replays it from the start.
 */
export function toggleStagePlayback(
    binding: EffectBinding | null,
    scene: Scene,
    playback: PlaybackState,
    stagePlaying: boolean,
    setStagePlaying: (playing: boolean) => void
): void {
    if (stagePlaying) {
        playback.stagePlaying = false;
        setStagePlaying(false);
        return;
    }
    if (binding) {
        const rootId = binding.root.uniqueId;
        if (isFocusFinished(playback, rootId)) {
            binding.restart();
            clearFocusFinished(playback, rootId);
            setFocusElapsed(playback, rootId, 0);
            scene.render();
        }
    }
    playback.stagePlaying = true;
    setStagePlaying(true);
}

/** Restarts the focused effect only; other visible effects keep playing. */
export function restartFocusPlayback(
    binding: EffectBinding,
    renderer: BatchedRenderer,
    scene: Scene,
    playback: PlaybackState
): void {
    const rootId = binding.root.uniqueId;
    scrubFocusTo(binding, renderer, 0);
    setFocusElapsed(playback, rootId, 0);
    clearFocusFinished(playback, rootId);
    if (playback.stagePlaying) {
        playFocus(binding);
    }
    scene.render();
}

export const PLAYBACK_SPEEDS = [0.1, 0.25, 0.5, 1, 2, 4];
