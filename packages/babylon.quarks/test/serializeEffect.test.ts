import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {Constants} from '@babylonjs/core/Engines/constants';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {ConstantValue, EmitSubParticleSystem, loadPlugin, SubParticleEmitMode} from 'quarks.core';
import {MeshSurfaceEmitter, MeshSurfaceEmitterPlugin} from '../src/MeshSurfaceEmitter';
import {ParticleEmitter} from '../src/ParticleEmitter';
import {ParticleSystem} from '../src/ParticleSystem';
import {QuarksLoader} from '../src/QuarksLoader';
import {QuarksPrefab} from '../src/QuarksPrefab';
import {QUARKS_FORMAT_VERSION, serializeEffect} from '../src/QuarksSerializer';
import {RenderMode} from '../src/VFXBatch';

let engine: NullEngine;
let scene: Scene;
let warn: jest.SpyInstance;

loadPlugin(MeshSurfaceEmitterPlugin);

beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    warn.mockRestore();
    scene.dispose();
    engine.dispose();
});

const system = (name: string, extra: Record<string, unknown> = {}) => {
    const ps = new ParticleSystem({scene, emissionOverTime: new ConstantValue(0), ...extra});
    ps.emitter.name = name;
    return ps;
};

/** A texture with every sampler setting off its default. */
function sampledTexture(): Texture {
    const texture = new Texture('https://example.com/smoke.png', scene, {
        noMipmap: true,
        invertY: false,
        samplingMode: Constants.TEXTURE_NEAREST_SAMPLINGMODE,
    });
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.MIRROR_ADDRESSMODE;
    texture.uScale = 2;
    texture.vScale = 3;
    texture.uOffset = 0.25;
    texture.vOffset = 0.5;
    texture.wAng = 0.75;
    return texture;
}

/**
 * A prefab holding: a sprite emitter with a sampled texture, a parent with a sub emitter, its
 * target, and an emitter on the surface of a hidden source mesh.
 */
function effect() {
    const root = new QuarksPrefab('fx', scene);
    root.timeScale = 2;
    const sprite = system('sprite', {texture: sampledTexture()});
    const target = system('target');
    const parent = system('parent');
    parent.addBehavior(new EmitSubParticleSystem(parent, false, target.emitter, SubParticleEmitMode.Death));
    const source = MeshBuilder.CreateBox('source', {size: 2}, scene);
    source.isVisible = false;
    const surface = system('surface', {shape: new MeshSurfaceEmitter(source), renderMode: RenderMode.Mesh});
    for (const node of [sprite.emitter, target.emitter, parent.emitter, source, surface.emitter]) {
        node.parent = root;
    }
    sprite.emitter.position.set(1, 2, 3);
    root.addParticleSystemAnimation(sprite.emitter, 0.5, 1, true);
    return {root, sprite, target, parent, source, surface};
}

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe('serializeEffect', () => {
    test('writes a document JSON.stringify takes, with the format version', () => {
        const {root} = effect();
        const json = serializeEffect(root);
        expect(() => JSON.stringify(json)).not.toThrow();
        expect(json.metadata).toEqual({
            version: 4.5,
            type: 'Object3D',
            generator: 'babylon.quarks',
            quarksFormat: QUARKS_FORMAT_VERSION,
        });
        expect(JSON.stringify(json)).not.toContain('sourceMaterial');
        expect(warn).not.toHaveBeenCalled();
    });

    test('loads back to the same effect, and saves again to the same file', () => {
        const {root} = effect();
        const first = plain(serializeEffect(root));
        const loaded = new QuarksLoader(scene).parse(plain(first));
        const second = plain(serializeEffect(loaded));
        expect(second).toEqual(first);
    });

    test('keeps the links between nodes', () => {
        const {root} = effect();
        const loaded = new QuarksLoader(scene).parse(plain(serializeEffect(root))) as QuarksPrefab;
        const byName = (name: string) =>
            loaded.getChildren((node) => node.name === name, true)[0] as TransformNode | undefined;
        const parent = byName('parent') as ParticleEmitter;
        const sub = (parent.system as ParticleSystem).behaviors[0] as EmitSubParticleSystem;
        expect(sub.subParticleSystem).toBe(byName('target'));
        const surface = (byName('surface') as ParticleEmitter).system as ParticleSystem;
        const source = byName('source') as Mesh;
        expect(source).toBeInstanceOf(Mesh);
        expect((surface.emitterShape as MeshSurfaceEmitter).mesh).toBe(source);
        expect(source.getTotalVertices()).toBe(24);
        expect(source.isVisible).toBe(false);
        expect(source.isEnabled(false)).toBe(true);
        expect(loaded).toBeInstanceOf(QuarksPrefab);
        expect(loaded.timeScale).toBe(2);
        expect(loaded.animationData).toHaveLength(1);
        expect(loaded.animationData[0].target).toBe(byName('sprite'));
        expect(byName('sprite')!.position.asArray()).toEqual([1, 2, 3]);
    });

    test('writes a texture with its sampler state, and loads it the same', () => {
        const {root} = effect();
        const json = serializeEffect(root);
        expect(json.images).toEqual([{uuid: 'quarks_image_1', url: 'https://example.com/smoke.png'}]);
        expect(json.textures).toEqual([
            {
                uuid: expect.any(String),
                image: 'quarks_image_1',
                invertY: false,
                noMipmap: true,
                samplingMode: Constants.TEXTURE_NEAREST_SAMPLINGMODE,
                wrap: [1001, 1002],
                repeat: [2, 3],
                offset: [0.25, 0.5],
                rotation: 0.75,
            },
        ]);
        const loaded = new QuarksLoader(scene, {shareResources: false}).parse(plain(json));
        const sprite = loaded.getChildren((node) => node.name === 'sprite', true)[0] as ParticleEmitter;
        const texture = (sprite.system as ParticleSystem).texture as Texture;
        expect(texture.invertY).toBe(false);
        expect(texture.noMipmap).toBe(true);
        expect(texture.samplingMode).toBe(Constants.TEXTURE_NEAREST_SAMPLINGMODE);
        expect([texture.wrapU, texture.wrapV]).toEqual([Texture.CLAMP_ADDRESSMODE, Texture.MIRROR_ADDRESSMODE]);
        expect([texture.uScale, texture.vScale, texture.uOffset, texture.vOffset, texture.wAng]).toEqual([
            2, 3, 0.25, 0.5, 0.75,
        ]);
    });

    test('writes a default texture with no sampler fields', () => {
        const ps = system('plain', {texture: new Texture('https://example.com/a.png', scene)});
        expect(serializeEffect(ps.emitter).textures).toEqual([{uuid: expect.any(String), image: 'quarks_image_1'}]);
    });

    test('writes a shared geometry, texture and image once', () => {
        const texture = new Texture('https://example.com/a.png', scene);
        const group = new TransformNode('group', scene);
        for (const name of ['a', 'b', 'c']) {
            system(name, {texture}).emitter.parent = group;
        }
        const other = new Texture('https://example.com/a.png', scene);
        system('d', {texture: other}).emitter.parent = group;
        const json = serializeEffect(group);
        expect(json.geometries).toHaveLength(1);
        expect(json.textures).toHaveLength(2);
        expect(json.images).toHaveLength(1);
        const systems = json.object.children!.map((child) => child.ps!);
        expect(new Set(systems.map((ps) => ps.instancingGeometry)).size).toBe(1);
    });

    test('writes the same ids each time', () => {
        const {root} = effect();
        expect(plain(serializeEffect(root))).toEqual(plain(serializeEffect(root)));
    });

    test.each([
        ['made in code', () => new Texture(null, scene)],
        ['with a blob: url', () => new Texture('blob:https://example.com/1234', scene)],
        ['embedded in a glTF', () => new Texture('data:scene.glb#image0', scene)],
    ])('warns about a texture %s, and writes it without an image', (_name, make) => {
        const ps = system('fx', {texture: make()});
        const warnings: string[] = [];
        const json = serializeEffect(ps.emitter, {onWarning: (message) => warnings.push(message)});
        expect(warnings).toEqual([expect.stringContaining('no url a file can point at')]);
        expect(json.textures).toEqual([{uuid: expect.any(String)}]);
        expect(json.images).toEqual([]);
    });

    test('writes a mesh node with its StandardMaterial, and warns about another material', () => {
        const mesh = MeshBuilder.CreatePlane('plane', {}, scene);
        const material = new StandardMaterial('m', scene);
        material.alphaMode = Constants.ALPHA_ADD;
        material.backFaceCulling = false;
        material.diffuseTexture = new Texture('https://example.com/a.png', scene);
        mesh.material = material;
        const json = serializeEffect(mesh);
        expect(json.object).toMatchObject({type: 'Mesh', geometry: expect.any(String), material: expect.any(String)});
        expect(json.materials).toEqual([
            {
                uuid: expect.any(String),
                type: 'MeshBasicMaterial',
                alphaMode: Constants.ALPHA_ADD,
                alphaTest: 0.4,
                depthWrite: true,
                map: json.textures[0].uuid,
            },
        ]);
        const loaded = new QuarksLoader(scene).parse(plain(json)) as Mesh;
        expect(loaded.getTotalVertices()).toBe(mesh.getTotalVertices());
        expect((loaded.material as StandardMaterial).alphaMode).toBe(Constants.ALPHA_ADD);
        expect((loaded.material as StandardMaterial).backFaceCulling).toBe(false);

        mesh.material = new PBRMaterial('pbr', scene);
        const warnings: string[] = [];
        expect(serializeEffect(mesh, {onWarning: (m) => warnings.push(m)}).object.material).toBeUndefined();
        expect(warnings).toEqual([expect.stringContaining('PBRMaterial')]);
    });

    test('leaves out the nodes a filter rejects', () => {
        const group = new TransformNode('group', scene);
        system('kept').emitter.parent = group;
        const helper = new TransformNode('helper', scene);
        helper.parent = group;
        system('under helper').emitter.parent = helper;
        const json = serializeEffect(group, {filter: (node) => node.name !== 'helper'});
        expect(json.object.children!.map((child) => child.name)).toEqual(['kept']);
    });

    test('writes several roots under one group', () => {
        const a = system('a');
        const b = system('b');
        const json = serializeEffect([a.emitter, b.emitter], {name: 'pack', generator: 'my-tool'});
        expect(json.metadata.generator).toBe('my-tool');
        expect(json.object).toMatchObject({uuid: 'pack-root', type: 'Group', name: 'pack'});
        expect(json.object.children!.map((child) => child.name)).toEqual(['a', 'b']);
        const loaded = new QuarksLoader(scene).parse(plain(json));
        expect(loaded.getChildren().map((node) => node.name)).toEqual(['a', 'b']);
    });

    test('keeps the emitters under a mesh that is not drawn', () => {
        const mesh = MeshBuilder.CreateBox('hidden', {}, scene);
        mesh.isVisible = false;
        system('child').emitter.parent = mesh;
        const json = serializeEffect(mesh);
        expect(json.object).toMatchObject({isVisible: false});
        expect(json.object.visible).toBeUndefined();
        const loaded = new QuarksLoader(scene).parse(plain(json)) as Mesh;
        expect(loaded.isVisible).toBe(false);
        expect((loaded.getChildren()[0] as ParticleEmitter).visible).toBe(true);
    });

    test('writes an unindexed mesh with its vertices in order', () => {
        const mesh = new Mesh('soup', scene);
        mesh.setVerticesData(VertexBuffer.PositionKind, [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 2, 1, 0, 1, 2, 0]);
        const json = serializeEffect(mesh);
        expect(json.geometries[0].indices).toEqual([0, 1, 2, 3, 4, 5]);
        const loaded = new QuarksLoader(scene).parse(plain(json)) as Mesh;
        expect(loaded.getTotalVertices()).toBe(6);
        expect(loaded.getTotalIndices()).toBe(6);

        const warnings: string[] = [];
        serializeEffect(new Mesh('empty', scene), {onWarning: (m) => warnings.push(m)});
        expect(warnings).toEqual([expect.stringContaining('no vertices')]);
    });

    test('writes the geometry of cloned meshes once', () => {
        const group = new TransformNode('group', scene);
        const box = MeshBuilder.CreateBox('a', {}, scene);
        box.parent = group;
        box.clone('b', group);
        const json = serializeEffect(group);
        expect(json.geometries).toHaveLength(1);
        expect(new Set(json.object.children!.map((child) => child.geometry)).size).toBe(1);
    });

    test('writes a texture a mesh and a system share once, whichever comes first', () => {
        const texture = new Texture('https://example.com/a.png', scene);
        const group = new TransformNode('group', scene);
        const mesh = MeshBuilder.CreatePlane('plane', {}, scene);
        mesh.material = new StandardMaterial('m', scene);
        (mesh.material as StandardMaterial).diffuseTexture = texture;
        mesh.parent = group;
        system('fx', {texture}).emitter.parent = group;
        const json = serializeEffect(group);
        expect(json.textures).toHaveLength(1);
        expect(json.materials.find((m) => m.type === 'MeshBasicMaterial')!.map).toBe(json.textures[0].uuid);
    });

    test('writes image urls through imageUrl', () => {
        const ps = system('fx', {texture: new Texture('fx/tex/a.png', scene)});
        const json = serializeEffect(ps.emitter, {imageUrl: (texture) => texture.url!.replace(/^fx\//, '')});
        expect(json.images).toEqual([{uuid: 'quarks_image_1', url: 'tex/a.png'}]);
        const dropped = serializeEffect(ps.emitter, {imageUrl: () => null, onWarning: () => {}});
        expect(dropped.images).toEqual([]);
    });

    test('warns about links to nodes it does not write', () => {
        const target = system('target');
        const parent = system('parent');
        parent.addBehavior(new EmitSubParticleSystem(parent, false, target.emitter, SubParticleEmitMode.Death));
        const warnings: string[] = [];
        serializeEffect(parent.emitter, {onWarning: (m) => warnings.push(m)});
        expect(warnings).toEqual([expect.stringContaining('a sub emitter')]);
    });

    test('writes only the mesh material settings that differ from the defaults, and warns about colour', () => {
        const mesh = MeshBuilder.CreatePlane('plane', {}, scene);
        const material = new StandardMaterial('m', scene);
        material.backFaceCulling = false;
        material.alphaCutOff = 0;
        material.disableDepthWrite = true;
        mesh.material = material;
        const warnings: string[] = [];
        expect(serializeEffect(mesh, {onWarning: (m) => warnings.push(m)}).materials).toEqual([
            {uuid: expect.any(String), type: 'MeshBasicMaterial'},
        ]);
        expect(warnings).toEqual([]);
        material.alpha = 0.5;
        serializeEffect(mesh, {onWarning: (m) => warnings.push(m)});
        expect(warnings).toEqual([expect.stringContaining('alpha and colours')]);
    });

    test('writes a disabled node as not visible', () => {
        const ps = system('off');
        ps.emitter.setEnabled(false);
        expect(serializeEffect(ps.emitter).object.visible).toBe(false);
        ps.emitter.setEnabled(true);
        expect(serializeEffect(ps.emitter).object.visible).toBeUndefined();
    });
});
