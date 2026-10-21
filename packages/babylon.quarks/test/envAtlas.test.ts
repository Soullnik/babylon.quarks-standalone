import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Scene} from '@babylonjs/core/scene';
import {ConstantValue} from 'quarks.core';
import {
    cacheEnvAtlas,
    disposeEnvAtlas,
    ensureEnvAtlasFromCube,
    envAtlasBuilder,
    getCachedEnvAtlas,
} from '../src/envAtlas';
import {ParticleSystem} from '../src/ParticleSystem';
import {RenderMode} from '../src/VFXBatch';

const FACES = ['px', 'py', 'pz', 'nx', 'ny', 'nz'];

let engines: NullEngine[];
let scenes: Scene[];
let build: jest.SpyInstance;

beforeEach(() => {
    engines = [new NullEngine(), new NullEngine()];
    scenes = engines.map((engine) => new Scene(engine));
    // Each build makes a texture in the scene it was asked for, as the real one does.
    build = jest
        .spyOn(envAtlasBuilder, 'createFromFaceUrls')
        .mockImplementation(async (_urls, scene) => new Texture('data:atlas', scene));
});

afterEach(() => {
    build.mockRestore();
    scenes.forEach((scene) => scene.dispose());
    engines.forEach((engine) => engine.dispose());
});

/** A cube texture with six face files, as a CubeTexture made from six URLs has. */
function cube(scene: Scene): BaseTexture {
    const texture = new BaseTexture(scene);
    (texture as any).isCube = true;
    (texture as any)._files = FACES;
    jest.spyOn(texture, 'isReady').mockReturnValue(true);
    return texture;
}

function atlasFor(source: BaseTexture, scene: Scene): Promise<Texture> {
    return new Promise((resolve) => ensureEnvAtlasFromCube(source, scene, resolve));
}

const disposed = (texture: BaseTexture) => texture.getScene() === null;

describe('env atlas cache', () => {
    test('builds one atlas per scene for a cube, each in its own scene', async () => {
        const source = cube(scenes[0]);
        const [first, second] = await Promise.all(scenes.map((scene) => atlasFor(source, scene)));
        expect(first).not.toBe(second);
        expect(first.getScene()).toBe(scenes[0]);
        expect(second.getScene()).toBe(scenes[1]);
        expect(getCachedEnvAtlas(source, scenes[0])).toBe(first);
        expect(getCachedEnvAtlas(source, scenes[1])).toBe(second);
        // The cube's own scene is the default.
        expect(getCachedEnvAtlas(source)).toBe(first);
    });

    test('shares one build between the systems that ask for it at once', async () => {
        const source = cube(scenes[0]);
        const [a, b] = await Promise.all([atlasFor(source, scenes[0]), atlasFor(source, scenes[0])]);
        expect(a).toBe(b);
        expect(build).toHaveBeenCalledTimes(1);
        // Later asks get the cached atlas at once.
        const onReady = jest.fn();
        expect(ensureEnvAtlasFromCube(source, scenes[0], onReady)).toBe(a);
        expect(onReady).toHaveBeenCalledWith(a);
    });

    test('disposes the atlases it built when the cube is disposed', async () => {
        const source = cube(scenes[0]);
        const atlases = await Promise.all(scenes.map((scene) => atlasFor(source, scene)));
        source.dispose();
        expect(atlases.every(disposed)).toBe(true);
        expect(getCachedEnvAtlas(source, scenes[0])).toBeNull();
        expect(getCachedEnvAtlas(source, scenes[1])).toBeNull();
    });

    test('disposeEnvAtlas drops one scene, or every scene', async () => {
        const source = cube(scenes[0]);
        const [first, second] = await Promise.all(scenes.map((scene) => atlasFor(source, scene)));
        disposeEnvAtlas(source, scenes[1]);
        expect(disposed(second)).toBe(true);
        expect(disposed(first)).toBe(false);
        expect(getCachedEnvAtlas(source, scenes[0])).toBe(first);
        disposeEnvAtlas(source);
        expect(disposed(first)).toBe(true);
        expect(getCachedEnvAtlas(source, scenes[0])).toBeNull();
        // Nothing left to drop.
        disposeEnvAtlas(source);
        disposeEnvAtlas(cube(scenes[0]));
    });

    test('lets go of an atlas its scene disposed', async () => {
        const source = cube(scenes[0]);
        await atlasFor(source, scenes[1]);
        scenes[1].dispose();
        expect(getCachedEnvAtlas(source, scenes[1])).toBeNull();
    });

    test('keeps a cached atlas the caller gave it, and only forgets it', () => {
        const source = cube(scenes[0]);
        const given = new Texture('data:given', scenes[0]);
        cacheEnvAtlas(source, given);
        expect(getCachedEnvAtlas(source, scenes[0])).toBe(given);
        source.dispose();
        expect(disposed(given)).toBe(false);
        expect(getCachedEnvAtlas(source, scenes[0])).toBeNull();
    });

    test('a cube disposed before its build finishes gets no atlas', async () => {
        const source = cube(scenes[0]);
        let made: Texture | undefined;
        build.mockImplementation(async (_urls, scene) => (made = new Texture('data:late', scene)));
        const onReady = jest.fn();
        ensureEnvAtlasFromCube(source, scenes[0], onReady);
        source.dispose();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(onReady).not.toHaveBeenCalled();
        expect(disposed(made!)).toBe(true);
        expect(getCachedEnvAtlas(source, scenes[0])).toBeNull();
    });

    test('a build lets go of its cube once it settles', async () => {
        const source = cube(scenes[0]);
        const before = source.onDisposeObservable.observers.length;
        await atlasFor(source, scenes[0]);
        // Babylon removes an observer on the next tick.
        await new Promise((resolve) => setTimeout(resolve, 0));
        // Only the cache's own listener, which disposes the atlas with the cube, stays.
        expect(source.onDisposeObservable.observers.length).toBe(before + 1);
    });

    test('a system rebuilds an atlas disposed under it, with the cube kept', async () => {
        const scene = scenes[0];
        const source = cube(scene);
        const material = new StandardMaterial('env', scene);
        material.reflectionTexture = source;
        const system = new ParticleSystem({
            scene,
            emissionOverTime: new ConstantValue(0),
            renderMode: RenderMode.Mesh,
            material,
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        const first = system.getRendererSettings().reflectionAtlas as Texture;
        expect(first.getScene()).toBe(scene);

        disposeEnvAtlas(source);
        expect(system.getRendererSettings().reflectionAtlas).toBeNull();
        await new Promise((resolve) => setTimeout(resolve, 0));
        const second = system.getRendererSettings().reflectionAtlas as Texture;
        expect(second).not.toBe(first);
        expect(second.getScene()).toBe(scene);
        expect((material as any).reflectionAtlas).toBe(second);

        // Disposed with the cube, the atlas is not rebuilt.
        source.dispose();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(system.getRendererSettings().reflectionAtlas).toBeNull();
        system.dispose();
    });

    test('cacheEnvAtlas warns and stores nothing without a scene', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const loose = {isCube: true, onDisposeObservable: undefined} as never;
        const atlas = new Texture('data:loose', scenes[0]);
        atlas.dispose();
        cacheEnvAtlas(loose, atlas);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    test('a system whose atlas was disposed builds a new one', async () => {
        const scene = scenes[0];
        const source = cube(scene);
        const material = new StandardMaterial('env', scene);
        material.reflectionTexture = source;
        const system = new ParticleSystem({
            scene,
            emissionOverTime: new ConstantValue(0),
            renderMode: RenderMode.Mesh,
            material,
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        const first = system.getRendererSettings().reflectionAtlas as Texture;
        expect(first.getScene()).toBe(scene);

        disposeEnvAtlas(source);
        system.material = material;
        await new Promise((resolve) => setTimeout(resolve, 0));
        const second = system.getRendererSettings().reflectionAtlas as Texture;
        expect(second).not.toBe(first);
        expect(second.getScene()).toBe(scene);
        system.dispose();
    });
});
