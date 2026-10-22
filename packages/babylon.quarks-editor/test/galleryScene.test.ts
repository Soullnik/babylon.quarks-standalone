import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {BatchedRenderer} from 'babylon.quarks';
import {
    clearSceneEntrySimulation,
    pickGroundPosition,
    placeSceneEntriesAt,
    setSceneEntryVisible,
} from '../src/core/galleryScene';
import {SceneEntry} from '../src/core/sceneEntries';
import {advance, makeSystem, useScene} from './helpers';

describe('gallery scene', () => {
    const scene = useScene();

    const entry = (name: string): SceneEntry => {
        const root = new TransformNode(name, scene.get());
        const system = makeSystem(scene.get());
        system.emitter.parent = root;
        return {name, path: `${name}.json`, assetId: null, root, systems: [system]};
    };

    it('clears and freezes an entry, and hiding it does the same before disabling the root', () => {
        const renderer = new BatchedRenderer('r', scene.get());
        const e = entry('a');
        renderer.addSystem(e.systems[0]);
        const refresh = jest.spyOn(renderer, 'refreshBatches');
        advance(e.systems[0], 0.5);
        expect(e.systems[0].particleNum).toBeGreaterThan(0);

        clearSceneEntrySimulation(e, renderer);
        expect(e.systems[0].particleNum).toBe(0);
        expect(e.systems[0].paused).toBe(true);
        expect(refresh).toHaveBeenCalledTimes(1);

        e.systems[0].play();
        setSceneEntryVisible(e, renderer, false);
        expect(e.root.isEnabled()).toBe(false);
        expect(e.systems[0].paused).toBe(true);
        expect(refresh).toHaveBeenCalledTimes(2);

        setSceneEntryVisible(e, renderer, true);
        expect(e.root.isEnabled()).toBe(true);
        expect(e.systems[0].paused).toBe(true);
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it('places one entry at the centre and several on a grid around it', () => {
        const only = entry('only');
        placeSceneEntriesAt([only], new Vector3(1, 2, 3));
        expect(only.root.position.asArray()).toEqual([1, 2, 3]);

        const four = [entry('a'), entry('b'), entry('c'), entry('d')];
        placeSceneEntriesAt(four, new Vector3(10, 0, 0), 2);
        expect(four.map((e) => [e.root.position.x, e.root.position.z])).toEqual([
            [9, -1],
            [11, -1],
            [9, 1],
            [11, 1],
        ]);
    });

    it('picks the origin when there is no canvas to pick on', () => {
        expect(pickGroundPosition(scene.get(), 10, 10).equals(Vector3.Zero())).toBe(true);
    });
});
