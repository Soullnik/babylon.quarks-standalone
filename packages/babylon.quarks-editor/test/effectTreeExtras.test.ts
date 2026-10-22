import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {EDITOR_SCENE_NODE_METADATA} from '../src/core/editorScene';
import {buildEffectTree, collectSystems} from '../src/core/effectTree';
import {makeSystem, useScene} from './helpers';

describe('effect tree', () => {
    const scene = useScene();

    it('walks groups and emitters, names the unnamed and skips editor helpers', () => {
        const root = new TransformNode('', scene.get());
        const main = makeSystem(scene.get());
        main.emitter.name = '';
        main.emitter.parent = root;
        const helper = new TransformNode('helper', scene.get());
        helper.metadata = {...EDITOR_SCENE_NODE_METADATA};
        helper.parent = root;
        const group = new TransformNode('g', scene.get());
        group.parent = root;
        const sub = makeSystem(scene.get());
        sub.emitter.parent = group;

        const tree = buildEffectTree(root);
        expect(tree.name).toBe('group');
        expect(tree.children.map((c) => [c.name, c.depth, !!c.system])).toEqual([
            ['emitter', 1, true],
            ['g', 1, false],
        ]);
        expect(collectSystems(tree)).toEqual([main, sub]);
    });
});
