import {FreeCamera} from '@babylonjs/core/Cameras/freeCamera';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {BatchedRenderer} from 'babylon.quarks';
import {EffectBinding} from '../src/core/binding';
import {
    clearFocusFinished,
    createPlaybackState,
    getFocusElapsed,
    isFocusFinished,
    markFocusFinished,
    setFocusElapsed,
} from '../src/core/playback';
import {PLAYBACK_SPEEDS, restartFocusPlayback, toggleStagePlayback} from '../src/core/transport';
import {makeSystem, useScene} from './helpers';

describe('playback state', () => {
    it('tracks elapsed time and the parked flag per effect root', () => {
        const state = createPlaybackState();
        expect(state).toMatchObject({stagePlaying: true, focusRootId: null, speed: 1, scrubbing: false});
        expect(getFocusElapsed(state, 7)).toBe(0);
        setFocusElapsed(state, 7, 2.5);
        expect(getFocusElapsed(state, 7)).toBe(2.5);
        expect(isFocusFinished(state, 7)).toBe(false);
        markFocusFinished(state, 7);
        expect(isFocusFinished(state, 7)).toBe(true);
        clearFocusFinished(state, 7);
        expect(isFocusFinished(state, 7)).toBe(false);
    });

    it('offers the usual speeds', () => {
        expect(PLAYBACK_SPEEDS).toContain(1);
        expect([...PLAYBACK_SPEEDS].sort((a, b) => a - b)).toEqual(PLAYBACK_SPEEDS);
    });
});

describe('stage transport', () => {
    const scene = useScene();
    beforeEach(() => new FreeCamera('c', new Vector3(0, 0, -5), scene.get()));

    it('pauses and resumes the stage', () => {
        const state = createPlaybackState();
        const seen: boolean[] = [];
        toggleStagePlayback(null, scene.get(), state, true, (p) => seen.push(p));
        expect(state.stagePlaying).toBe(false);
        toggleStagePlayback(null, scene.get(), state, false, (p) => seen.push(p));
        expect(state.stagePlaying).toBe(true);
        expect(seen).toEqual([false, true]);
    });

    it('replays a one-shot that parked at its end when Play is pressed', () => {
        const state = createPlaybackState();
        const renderer = new BatchedRenderer('r', scene.get());
        const system = makeSystem(scene.get(), {duration: 10});
        renderer.addSystem(system);
        const binding = new EffectBinding(system);
        const rootId = binding.root.uniqueId;
        system.update(0.5);
        setFocusElapsed(state, rootId, 0.5);
        markFocusFinished(state, rootId);
        toggleStagePlayback(binding, scene.get(), state, false, () => {});
        expect(system.emissionState.time).toBe(0);
        expect(getFocusElapsed(state, rootId)).toBe(0);
        expect(isFocusFinished(state, rootId)).toBe(false);
        expect(state.stagePlaying).toBe(true);
    });

    it('restarts only the focused effect, keeping it paused while the stage is', () => {
        const state = createPlaybackState();
        const renderer = new BatchedRenderer('r', scene.get());
        const system = makeSystem(scene.get(), {duration: 10});
        const other = makeSystem(scene.get(), {duration: 10});
        renderer.addSystem(system);
        renderer.addSystem(other);
        renderer.update(0.5);
        const binding = new EffectBinding(system);
        setFocusElapsed(state, binding.root.uniqueId, 0.5);
        markFocusFinished(state, binding.root.uniqueId);
        state.stagePlaying = false;
        restartFocusPlayback(binding, renderer, scene.get(), state);
        expect(system.emissionState.time).toBe(0);
        expect(other.emissionState.time).toBeGreaterThan(0);
        expect(getFocusElapsed(state, binding.root.uniqueId)).toBe(0);
        expect(isFocusFinished(state, binding.root.uniqueId)).toBe(false);
        state.stagePlaying = true;
        system.pause();
        restartFocusPlayback(binding, renderer, scene.get(), state);
        expect(system.paused).toBe(false);
    });
});
