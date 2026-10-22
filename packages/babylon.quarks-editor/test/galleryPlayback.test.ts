import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {
    applyGalleryPlayback,
    countActivePreviews,
    countGalleryParticles,
    hasActivePreview,
    pauseFinishedPreviews,
} from '../src/core/galleryPlayback';
import {SceneEntry} from '../src/core/sceneEntries';
import {advance, makeSystem, useScene} from './helpers';

describe('gallery playback', () => {
    const scene = useScene();

    const entry = (name: string, looping = true): SceneEntry => {
        const root = new TransformNode(name, scene.get());
        const system = makeSystem(scene.get(), {looping});
        system.emitter.parent = root;
        return {name, path: `${name}.json`, assetId: null, root, systems: [system]};
    };

    it('pauses everything, then plays only the previewed entries while the transport runs', () => {
        const a = entry('a');
        const b = entry('b');
        const preview = new Set([a.root.uniqueId]);

        applyGalleryPlayback([a, b], preview, false);
        expect(a.systems[0].paused).toBe(true);
        expect(b.systems[0].paused).toBe(true);

        applyGalleryPlayback([a, b], preview, true);
        expect(a.systems[0].paused).toBe(false);
        expect(b.systems[0].paused).toBe(true);

        // A previewed entry whose one-shot already finished stays frozen.
        applyGalleryPlayback([a, b], preview, true, new Set([a.root.uniqueId]));
        expect(a.systems[0].paused).toBe(true);
    });

    it('counts previews and their particles', () => {
        const a = entry('a');
        const b = entry('b');
        const preview = new Set([a.root.uniqueId]);
        expect(hasActivePreview([a, b], preview)).toBe(true);
        expect(hasActivePreview([b], preview)).toBe(false);
        expect(countActivePreviews([a, b], preview)).toBe(1);

        advance(a.systems[0], 0.5);
        advance(b.systems[0], 0.5);
        expect(a.systems[0].particleNum).toBeGreaterThan(0);
        expect(countGalleryParticles([a, b], preview)).toBe(a.systems[0].particleNum);
    });

    it('pauses finished one-shot previews once and reports it', () => {
        const oneShot = entry('shot', false);
        const live = entry('live');
        const preview = new Set([oneShot.root.uniqueId, live.root.uniqueId]);
        // Run the one-shot past its duration and its particles' life.
        advance(oneShot.systems[0], 3);
        advance(live.systems[0], 0.1);
        expect(oneShot.systems[0].isFinished()).toBe(true);
        expect(live.systems[0].isFinished()).toBe(false);

        expect(pauseFinishedPreviews([oneShot, live], preview)).toBe(true);
        expect(oneShot.systems[0].paused).toBe(true);
        expect(live.systems[0].paused).toBe(false);
        // Already paused: nothing changes. Excluded by the focus set: nothing changes either.
        expect(pauseFinishedPreviews([oneShot, live], preview)).toBe(false);
        oneShot.systems[0].play();
        expect(pauseFinishedPreviews([oneShot], preview, new Set([oneShot.root.uniqueId]))).toBe(false);
        expect(oneShot.systems[0].paused).toBe(false);
    });
});
