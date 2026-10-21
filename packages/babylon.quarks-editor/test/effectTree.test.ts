import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {ConstantValue, ParticleEmitter, ParticleSystem, QuarksLoader} from 'babylon.quarks';
import {EDITOR_SCENE_NODE_METADATA} from '../src/core/editorScene';
import {serializeEffectForest, serializeEffectTree} from '../src/core/effectTree';

describe('effect tree serialization', () => {
    let engine: NullEngine;
    let scene: Scene;

    beforeEach(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
    });

    afterEach(() => {
        scene.dispose();
        engine.dispose();
    });

    const emitter = (name: string, parent: TransformNode) => {
        const system = new ParticleSystem({scene, emissionOverTime: new ConstantValue(0)});
        system.emitter.name = name;
        system.emitter.parent = parent;
        return system;
    };

    test('writes meshes with their geometry and leaves out editor helpers', () => {
        const root = new TransformNode('fx', scene);
        emitter('sparks', root);
        const source = MeshBuilder.CreateBox('source', {size: 1}, scene);
        source.parent = root;
        const helper = new TransformNode('pick', scene);
        helper.metadata = {...EDITOR_SCENE_NODE_METADATA};
        helper.parent = root;

        const json = JSON.parse(serializeEffectTree(root, 'fx'));
        expect(json.metadata.generator).toBe('babylon.quarks-editor');
        expect(json.object.children.map((child: {name: string; type: string}) => [child.name, child.type])).toEqual([
            ['sparks', 'ParticleEmitter'],
            ['source', 'Mesh'],
        ]);
        const loaded = new QuarksLoader(scene).parse(json);
        const mesh = loaded.getChildren((node) => node.name === 'source', true)[0] as typeof source;
        expect(mesh.getTotalVertices()).toBe(source.getTotalVertices());
    });

    test('keeps texture sampler state through a save', () => {
        const root = new TransformNode('fx', scene);
        const texture = new Texture('https://example.com/a.png', scene, {invertY: false, noMipmap: true});
        texture.wrapU = Texture.CLAMP_ADDRESSMODE;
        texture.uScale = 2;
        const system = emitter('sparks', root);
        system.texture = texture;
        const json = JSON.parse(serializeEffectTree(root, 'fx'));
        expect(json.textures).toEqual([
            {
                uuid: expect.any(String),
                image: expect.any(String),
                invertY: false,
                noMipmap: true,
                wrap: [1001, 1000],
                repeat: [2, 1],
            },
        ]);
        const loaded = new QuarksLoader(scene, {shareResources: false}).parse(json);
        const copy = ((loaded.getChildren()[0] as ParticleEmitter).system as ParticleSystem).texture as Texture;
        expect([copy.invertY, copy.noMipmap, copy.wrapU, copy.uScale]).toEqual([
            false,
            true,
            Texture.CLAMP_ADDRESSMODE,
            2,
        ]);
    });

    test('writes several roots under one group, and one root as itself', () => {
        const a = new TransformNode('a', scene);
        const b = new TransformNode('b', scene);
        emitter('one', a);
        emitter('two', b);
        expect(JSON.parse(serializeEffectForest([a, b], 'pack')).object).toMatchObject({type: 'Group', name: 'pack'});
        expect(JSON.parse(serializeEffectForest([a], 'pack')).object.name).toBe('a');
    });
});
