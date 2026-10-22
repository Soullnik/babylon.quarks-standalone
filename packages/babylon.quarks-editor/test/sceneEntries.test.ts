import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {BatchedRenderer, serializeEffect} from 'babylon.quarks';
import {createEffectAsset} from '../src/core/assets';
import {
    bindingFromSceneEntry,
    countInstancesByAsset,
    disposeSceneEntry,
    instantiateSceneEntry,
    SceneEntry,
    uniqueEntryName,
} from '../src/core/sceneEntries';
import {createChildSystem} from '../src/core/systems';
import {makeSystem, useScene} from './helpers';

describe('scene entries', () => {
    const scene = useScene();

    const entryNamed = (name: string, assetId: number | null = null): SceneEntry => ({
        name,
        path: `${name}.json`,
        assetId,
        root: new TransformNode(name, scene.get()),
        systems: [],
    });

    it('numbers duplicate names', () => {
        const existing = [entryNamed('Fire'), entryNamed('Fire (2)')];
        expect(uniqueEntryName('Fire', existing)).toBe('Fire (3)');
        expect(uniqueEntryName('Ice', existing)).toBe('Ice');
    });

    it('instantiates an asset as a paused, registered, independent copy', () => {
        const root = new TransformNode('Effect', scene.get());
        const parent = new TransformNode('scene-parent', scene.get());
        root.parent = parent;
        const main = makeSystem(scene.get());
        main.emitter.parent = root;
        const oneShot = makeSystem(scene.get());
        oneShot.onlyUsedByOther = true;
        oneShot.emitter.parent = root;
        const asset = createEffectAsset('Burst', 'fx/Burst.json', serializeEffect(root, {name: 'Effect'}));
        const renderer = new BatchedRenderer('r', scene.get());

        const first = instantiateSceneEntry(scene.get(), renderer, asset, [])!;
        expect(first.name).toBe('Burst');
        expect(first.root.parent).toBeNull();
        expect(first.root.name).toBe('Burst');
        expect(first.assetId).toBe(asset.id);
        expect(first.systems).toHaveLength(2);
        expect(first.systems.every((s) => s.paused && renderer.systemToBatchIndex.has(s))).toBe(true);
        const second = instantiateSceneEntry(scene.get(), renderer, asset, [first])!;
        expect(second.name).toBe('Burst (2)');
        expect(second.systems[0]).not.toBe(first.systems[0]);

        const binding = bindingFromSceneEntry(first);
        expect(binding.system.onlyUsedByOther).toBe(false);
        expect(binding.subSystems).toHaveLength(1);
        expect(binding.root).toBe(first.root);

        expect(countInstancesByAsset([first, second, entryNamed('made')])).toEqual(new Map([[asset.id, 2]]));
    });

    it('keeps a root name the file gave it', () => {
        const root = new TransformNode('Named root', scene.get());
        makeSystem(scene.get()).emitter.parent = root;
        const asset = createEffectAsset('file', 'file.json', serializeEffect(root, {name: 'Named root'}));
        const entry = instantiateSceneEntry(scene.get(), new BatchedRenderer('r', scene.get()), asset, [])!;
        expect(entry.name).toBe('Named root');
    });

    it('returns null and cleans up for a file with no systems', () => {
        const root = new TransformNode('Group', scene.get());
        const child = new TransformNode('child', scene.get());
        child.parent = root;
        const asset = createEffectAsset('empty', 'empty.json', serializeEffect(root, {name: 'Group'}));
        const renderer = new BatchedRenderer('r', scene.get());
        const before = scene.get().transformNodes.length;
        expect(instantiateSceneEntry(scene.get(), renderer, asset, [])).toBeNull();
        expect(scene.get().transformNodes.length).toBe(before);
    });

    it('disposes an entry with the systems added to it since', () => {
        const renderer = new BatchedRenderer('r', scene.get());
        const root = new TransformNode('fx', scene.get());
        makeSystem(scene.get()).emitter.parent = root;
        const asset = createEffectAsset('fx', 'fx.json', serializeEffect(root, {name: 'fx'}));
        const entry = instantiateSceneEntry(scene.get(), renderer, asset, [])!;
        const added = createChildSystem(entry.systems[0]);
        renderer.addSystem(added);
        disposeSceneEntry(entry, renderer);
        expect(entry.systems[0].isDisposed).toBe(true);
        expect(added.isDisposed).toBe(true);
        expect(renderer.batches.every((b) => b.systems.size === 0)).toBe(true);
        expect(entry.root.isDisposed()).toBe(true);
    });
});
