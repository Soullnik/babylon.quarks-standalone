/**
 * The life of a load: waiting for textures, reporting what failed, stopping early, and freeing a
 * loaded effect with what it holds.
 */
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {EffectPool} from '../src/EffectPool';
import {ParticleEmitter} from '../src/ParticleEmitter';
import {ParticleSystem} from '../src/ParticleSystem';
import {QuarksLoader, QuarksLoaderOptions} from '../src/QuarksLoader';
import {QuarksUtil} from '../src/QuarksUtil';

let engine: NullEngine;
let scene: Scene;
let warn: jest.SpyInstance;
/** Image loads held back, by url: call `load` or `fail` to finish one. */
let images: Map<string, {load: () => void; fail: (error: unknown) => void}>;

beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    images = new Map();
    const create = engine.createTexture.bind(engine);
    jest.spyOn(engine, 'createTexture').mockImplementation((...args: Parameters<typeof create>) => {
        const [url, , , , , onLoad, onError] = args;
        args[5] = null;
        args[6] = null;
        const internal = create(...args);
        internal.isReady = false;
        images.set(url ?? '', {
            load: () => {
                internal.isReady = true;
                onLoad?.(internal);
            },
            fail: (error) => onError?.('could not load', error),
        });
        return internal;
    });
});

afterEach(() => {
    warn.mockRestore();
    if (!scene.isDisposed) {
        scene.dispose();
    }
    engine.dispose();
});

/** A one-quad mesh with a texture, and an emitter with another. */
const effect = (image = 'https://example.com/a.png', particles = 'https://example.com/p.png') => ({
    images: [
        {uuid: 'img', url: image},
        {uuid: 'pimg', url: particles},
    ],
    textures: [
        {uuid: 'tex', image: 'img'},
        {uuid: 'ptex', image: 'pimg'},
    ],
    materials: [
        {uuid: 'mat', map: 'tex'},
        {uuid: 'pmat', type: 'QuarksMaterial', texture: 'ptex'},
    ],
    geometries: [{uuid: 'geo', type: 'QuarksGeometry', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2]}],
    object: {
        uuid: 'root',
        type: 'Mesh',
        name: 'root',
        geometry: 'geo',
        material: 'mat',
        children: [{uuid: 'e', type: 'ParticleEmitter', name: 'sparks', ps: {material: 'pmat'}}],
    },
});

const settled = async (promise: Promise<unknown>) => {
    let done = false;
    promise.then(
        () => (done = true),
        () => (done = true)
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    return done;
};

const nodeCount = () => scene.transformNodes.length + scene.meshes.length;

describe('waiting for textures', () => {
    test('resolves at once by default', async () => {
        const root = await new QuarksLoader(scene).loadFromJSON(effect());
        expect(root).toBeInstanceOf(Mesh);
    });

    test('resolves once every texture has loaded, with waitForTextures', async () => {
        const loading = new QuarksLoader(scene, {waitForTextures: true}).loadFromJSON(effect());
        expect(await settled(loading)).toBe(false);
        images.get('https://example.com/a.png')!.load();
        expect(await settled(loading)).toBe(false);
        images.get('https://example.com/p.png')!.load();
        expect(await settled(loading)).toBe(true);
    });

    test('counts an effect in onProgress once its textures have loaded', async () => {
        const progress = jest.fn();
        const loading = new QuarksLoader(scene, {waitForTextures: true}).loadFromJSONAll([effect()], {
            onProgress: progress,
        });
        await settled(loading);
        expect(progress).not.toHaveBeenCalled();
        images.forEach((image) => image.load());
        expect(await loading).toHaveLength(1);
        expect(progress).toHaveBeenCalledWith(1, 1);
    });

    test('reports a texture that fails, still loads, and tries it again next time', async () => {
        const onResourceError = jest.fn();
        const options: QuarksLoaderOptions = {waitForTextures: true, onResourceError};
        const loading = new QuarksLoader(scene, options).loadFromJSON(effect());
        await settled(loading);
        const error = new Error('404');
        images.get('https://example.com/a.png')!.fail(error);
        images.get('https://example.com/p.png')!.load();
        const root = (await loading) as Mesh;
        expect(onResourceError).toHaveBeenCalledWith('image', 'https://example.com/a.png', error);
        const failed = (root.material as StandardMaterial).diffuseTexture;

        const again = (await new QuarksLoader(scene).loadFromJSON(effect())) as Mesh;
        expect((again.material as StandardMaterial).diffuseTexture).not.toBe(failed);
        // The texture that loaded is shared.
        const system = (node: Mesh) => ((node.getChildren()[0] as ParticleEmitter).system as ParticleSystem).texture;
        expect(system(again)).toBe(system(root));
    });

    test('stops waiting for a texture disposed before it loads', async () => {
        const loading = new QuarksLoader(scene, {waitForTextures: true}).loadFromJSON(effect());
        await settled(loading);
        scene.textures.slice().forEach((texture) => texture.dispose());
        await expect(loading).resolves.toBeInstanceOf(Mesh);
    });

    test('loads a delayed texture rather than wait for a draw that cannot come', async () => {
        scene.useDelayedTextureLoading = true;
        const loading = new QuarksLoader(scene, {waitForTextures: true}).loadFromJSON(effect());
        await settled(loading);
        expect([...images.keys()].sort()).toEqual(['https://example.com/a.png', 'https://example.com/p.png']);
        images.forEach((image) => image.load());
        await expect(loading).resolves.toBeInstanceOf(Mesh);
    });

    test('reports an image whose texture fails while it is made', async () => {
        const onResourceError = jest.fn();
        const error = new Error('no engine texture');
        (engine.createTexture as unknown as jest.SpyInstance).mockImplementationOnce(() => {
            throw error;
        });
        const loading = new QuarksLoader(scene, {waitForTextures: true, onResourceError}).loadFromJSON(effect());
        await settled(loading);
        images.forEach((image) => image.load());
        const root = (await loading) as Mesh;
        expect(onResourceError).toHaveBeenCalledWith('image', 'https://example.com/a.png', error);
        expect((root.material as StandardMaterial).diffuseTexture).toBeNull();
    });

    test('reports a geometry file that fails, and loads without it', async () => {
        const onResourceError = jest.fn();
        const error = new Error('gone');
        const loader = new QuarksLoader(scene, {
            onResourceError,
            resolver: {
                fetchJson: async () => {
                    throw error;
                },
            },
        });
        await loader.loadFromJSON({
            geometries: [{uuid: 'geo', type: 'QuarksGeometry', url: 'quad.json'}],
            object: {uuid: 'm', type: 'Mesh', geometry: 'geo'},
        });
        expect(onResourceError).toHaveBeenCalledWith('geometry', 'quad.json', error);
    });
});

describe('stopping a load', () => {
    test('an aborted signal rejects before anything is built', async () => {
        const controller = new AbortController();
        controller.abort();
        const before = nodeCount();
        await expect(new QuarksLoader(scene).loadFromJSON(effect(), '', {signal: controller.signal})).rejects.toBe(
            controller.signal.reason
        );
        expect(nodeCount()).toBe(before);
    });

    test('aborting while linked files load leaves no node', async () => {
        const controller = new AbortController();
        let release!: () => void;
        const loader = new QuarksLoader(scene, {
            resolver: {
                fetchJson: () =>
                    new Promise((resolve) => {
                        release = () => resolve({positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2]});
                    }),
            },
        });
        const before = nodeCount();
        const loading = loader.loadFromJSON(
            {
                geometries: [{uuid: 'geo', type: 'QuarksGeometry', url: 'quad.json'}],
                object: {uuid: 'm', type: 'Mesh', geometry: 'geo'},
            },
            '',
            {signal: controller.signal}
        );
        await settled(loading);
        controller.abort();
        // The fetch never answers, and the load stops anyway.
        await expect(loading).rejects.toBe(controller.signal.reason);
        release();
        await settled(loading);
        expect(nodeCount()).toBe(before);
    });

    test('a signal reaches the resolver for the effect document, and stops loadAll', async () => {
        const controller = new AbortController();
        const fetchJson = jest.fn((_url: string, _options?: {signal?: AbortSignal}) => new Promise<unknown>(() => {}));
        const loading = new QuarksLoader(scene, {resolver: {fetchJson}}).loadAll(['fx/a.json', 'fx/b.json'], {
            concurrency: 1,
            continueOnError: true,
            signal: controller.signal,
        });
        await settled(loading);
        expect(fetchJson).toHaveBeenCalledTimes(1);
        expect(fetchJson.mock.calls[0][1]?.signal).toBe(controller.signal);
        controller.abort();
        await expect(loading).rejects.toBe(controller.signal.reason);
        await settled(loading);
        expect(fetchJson).toHaveBeenCalledTimes(1);
    });

    test('a failed effect in a batch rejects at once and frees the others still waiting', async () => {
        const progress = jest.fn();
        const before = nodeCount();
        const loading = new QuarksLoader(scene, {waitForTextures: true}).loadFromJSONAll([effect(), {object: null}], {
            onProgress: progress,
        });
        await expect(loading).rejects.toThrow('Not an effect document');
        expect(nodeCount()).toBe(before);
        images.forEach((image) => image.load());
        await settled(loading);
        expect(progress).not.toHaveBeenCalled();
    });

    test('aborting while textures load frees the effect and its textures', async () => {
        const controller = new AbortController();
        const before = nodeCount();
        const textures = scene.textures.length;
        const loading = new QuarksLoader(scene, {waitForTextures: true}).loadFromJSON(effect(), '', {
            signal: controller.signal,
        });
        await settled(loading);
        expect(nodeCount()).toBeGreaterThan(before);
        controller.abort();
        await expect(loading).rejects.toBe(controller.signal.reason);
        expect(nodeCount()).toBe(before);
        expect(scene.textures.length).toBe(textures);
    });

    test('a scene disposed during the load rejects it', async () => {
        let release!: () => void;
        const loader = new QuarksLoader(scene, {
            resolver: {fetchJson: () => new Promise((resolve) => (release = () => resolve({})))},
        });
        const loading = loader.loadFromJSON({
            geometries: [{uuid: 'geo', type: 'QuarksGeometry', url: 'quad.json'}],
            object: {uuid: 'g', type: 'Group'},
        });
        await settled(loading);
        scene.dispose();
        release();
        await expect(loading).rejects.toThrow('scene was disposed');
    });

    test('aborting a batch rejects it whatever continueOnError says, and frees what was built', async () => {
        const controller = new AbortController();
        const before = nodeCount();
        const loading = new QuarksLoader(scene, {waitForTextures: true}).loadFromJSONAll(
            [effect(), effect('https://example.com/b.png')],
            {continueOnError: true, signal: controller.signal}
        );
        await settled(loading);
        images.forEach((image) => image.load());
        controller.abort();
        await expect(loading).rejects.toBe(controller.signal.reason);
        expect(nodeCount()).toBe(before);
    });
});

describe('disposeEffect', () => {
    const textureOf = (root: Mesh) => (root.material as StandardMaterial).diffuseTexture as Texture;

    test('keeps a shared texture until the last effect using it goes', async () => {
        const loader = new QuarksLoader(scene);
        const first = (await loader.loadFromJSON(effect())) as Mesh;
        const second = (await loader.loadFromJSON(effect())) as Mesh;
        const texture = textureOf(first);
        expect(textureOf(second)).toBe(texture);
        const material = first.material!;

        QuarksLoader.disposeEffect(first);
        expect(first.isDisposed()).toBe(true);
        expect(scene.materials).not.toContain(material);
        expect(texture.getScene()).toBe(scene);

        QuarksLoader.disposeEffect(second);
        expect(texture.getScene()).toBeNull();
        // A new load makes a new texture.
        const third = (await loader.loadFromJSON(effect())) as Mesh;
        expect(textureOf(third)).not.toBe(texture);
        // Twice is harmless.
        QuarksLoader.disposeEffect(first);
    });

    test('a copy holds the textures it draws with', async () => {
        const source = (await new QuarksLoader(scene).loadFromJSON(effect())) as Mesh;
        const system = (source.getChildren()[0] as ParticleEmitter).system as ParticleSystem;
        const texture = system.texture!;
        const copy = QuarksUtil.instantiate(source);
        QuarksLoader.disposeEffect(source);
        expect(texture.getScene()).toBe(scene);
        QuarksLoader.disposeEffect(copy);
        expect(texture.getScene()).toBeNull();
    });

    test('frees what an effect holds however it is disposed', async () => {
        const loader = new QuarksLoader(scene);
        const level = new TransformNode('level', scene);
        const first = (await loader.loadFromJSON(effect())) as Mesh;
        first.parent = level;
        const texture = textureOf(first);
        const second = (await loader.loadFromJSON(effect())) as Mesh;
        level.dispose();
        expect(texture.getScene()).toBe(scene);
        second.dispose();
        expect(texture.getScene()).toBeNull();
        QuarksLoader.disposeEffect(second);
    });

    test('an effect parsed with its own textures frees them', () => {
        const loader = new QuarksLoader(scene, {shareResources: false});
        const first = loader.parse(effect()) as Mesh;
        const second = loader.parse(effect()) as Mesh;
        expect(textureOf(first)).not.toBe(textureOf(second));
        const texture = textureOf(first);
        QuarksLoader.disposeEffect(first);
        expect(texture.getScene()).toBeNull();
        expect(textureOf(second).getScene()).toBe(scene);
    });

    test('a copy of a node inside an effect holds the textures too', async () => {
        const source = (await new QuarksLoader(scene).loadFromJSON(effect())) as Mesh;
        const emitter = source.getChildren()[0] as ParticleEmitter;
        const texture = (emitter.system as ParticleSystem).texture!;
        const copy = QuarksUtil.instantiate(emitter);
        QuarksLoader.disposeEffect(source);
        expect(texture.getScene()).toBe(scene);
        copy.dispose();
        expect(texture.getScene()).toBeNull();
    });

    test("a pool's copies keep the template's textures until the last one goes", async () => {
        const template = (await new QuarksLoader(scene).loadFromJSON(effect())) as Mesh;
        const texture = ((template.getChildren()[0] as ParticleEmitter).system as ParticleSystem).texture!;
        const pool = new EffectPool(template, {renderer: new BatchedRenderer('pool', scene), prewarm: 1});
        QuarksLoader.disposeEffect(template);
        expect(texture.getScene()).toBe(scene);
        pool.dispose();
        expect(texture.getScene()).toBeNull();
    });

    test('disposes a root the loader did not build, and nothing else', () => {
        const texture = new Texture('https://example.com/own.png', scene);
        const system = new ParticleSystem({scene, texture});
        QuarksLoader.disposeEffect(system.emitter);
        expect(system.emitter.isDisposed()).toBe(true);
        expect(texture.getScene()).toBe(scene);
    });
});
