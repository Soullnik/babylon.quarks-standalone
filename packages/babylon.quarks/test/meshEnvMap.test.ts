import {Constants} from '@babylonjs/core/Engines/constants';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import * as envAtlas from '../src/envAtlas';
import {cacheEnvAtlas, cubeFaceUrls, getCachedEnvAtlas} from '../src/envAtlas';
import {ParticleSystem} from '../src/ParticleSystem';
import {SpriteBatch} from '../src/SpriteBatch';
import type {ParticleMaterialSource} from '../src/system/materialResolve';
import {RenderMode} from '../src/VFXBatch';
import {forceSet, shaderOptions} from './internals';

/** A ready cube texture with these face files, as a loaded `CubeTexture` has. */
function fakeCube(scene: Scene, files: string[], level = 1): BaseTexture {
    const cube = new BaseTexture(scene);
    cube['isCube'] = true;
    cube.level = level;
    forceSet(cube, 'files', files);
    jest.spyOn(cube, 'isReady').mockReturnValue(true);
    return cube;
}

describe('mesh particle environment map', () => {
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

    it('harvests reflectionAtlas from the material into renderer settings', () => {
        const atlas = new Texture('data:atlas', scene, {
            noMipmap: true,
            invertY: true,
            samplingMode: Texture.LINEAR_LINEAR,
        });
        atlas.level = 0.8;
        const material: StandardMaterial & ParticleMaterialSource = new StandardMaterial('env-mat', scene);
        material.reflectionAtlas = atlas;
        material.reflectionLevel = 0.8;

        const system = new ParticleSystem({
            scene,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
            renderMode: RenderMode.Mesh,
            material,
            transparent: true,
            blendMode: Constants.ALPHA_COMBINE,
        });

        expect(system.getRendererSettings().reflectionAtlas).toBe(atlas);
        expect(system.getRendererSettings().reflectionLevel).toBeCloseTo(0.8, 5);

        system.dispose();
        material.dispose();
        atlas.dispose();
    });

    it('enables USE_MAP on mesh batches even without a diffuse texture', () => {
        const system = new ParticleSystem({
            scene,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(5),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            shape: new PointEmitter(),
            renderMode: RenderMode.Mesh,
            transparent: false,
            blendMode: Constants.ALPHA_DISABLE,
        });

        const renderer = new BatchedRenderer('mesh-white-map', scene);
        renderer.addSystem(system);
        renderer.update(1 / 60);

        const batch = renderer.batches[0] as SpriteBatch;
        const defines = shaderOptions(batch.mesh.material).defines!;
        expect(defines).toContain('USE_MAP');
        expect(defines).not.toContain('USE_ENVMAP_ATLAS');

        renderer.dispose();
        system.dispose();
    });

    it('enables USE_ENVMAP_ATLAS when reflectionAtlas is ready', () => {
        const atlas = new Texture('data:atlas2', scene, {
            noMipmap: true,
            invertY: false,
            samplingMode: Texture.LINEAR_LINEAR,
        });
        jest.spyOn(atlas, 'isReady').mockReturnValue(true);

        const material: StandardMaterial & ParticleMaterialSource = new StandardMaterial('env-shader', scene);
        material.reflectionAtlas = atlas;

        const system = new ParticleSystem({
            scene,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(5),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            shape: new PointEmitter(),
            renderMode: RenderMode.Mesh,
            material,
            transparent: true,
            blendMode: Constants.ALPHA_COMBINE,
        });

        const renderer = new BatchedRenderer('env-shader', scene);
        renderer.addSystem(system);
        renderer.update(1 / 60);

        const defines = shaderOptions(renderer.batches[0].mesh.material).defines!;
        expect(defines).toContain('USE_MAP');
        expect(defines).toContain('USE_ENVMAP_ATLAS');

        renderer.dispose();
        system.dispose();
        material.dispose();
        atlas.dispose();
    });

    it('auto-uses a cached env atlas built from CubeTexture face URLs', () => {
        const atlas = new Texture('data:auto-atlas', scene, {
            noMipmap: true,
            invertY: false,
            samplingMode: Texture.LINEAR_LINEAR,
        });
        jest.spyOn(atlas, 'isReady').mockReturnValue(true);

        const faceUrls = ['px', 'py', 'pz', 'nx', 'ny', 'nz'];
        const cube = fakeCube(scene, faceUrls, 0.7);
        cacheEnvAtlas(cube, atlas);

        const material = new StandardMaterial('cube-env', scene);
        material.reflectionTexture = cube;

        const system = new ParticleSystem({
            scene,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
            renderMode: RenderMode.Mesh,
            material,
            transparent: true,
            blendMode: Constants.ALPHA_COMBINE,
        });

        expect(system.getRendererSettings().reflectionAtlas).toBe(atlas);
        expect(system.getRendererSettings().reflectionLevel).toBeCloseTo(0.7, 5);
        expect(cubeFaceUrls(cube)).toEqual(faceUrls);

        system.dispose();
        material.dispose();
        atlas.dispose();
    });

    it('kicks async atlas build when a CubeTexture has face URLs', async () => {
        const atlas = new Texture('data:async-atlas', scene, {
            noMipmap: true,
            invertY: false,
            samplingMode: Texture.LINEAR_LINEAR,
        });
        const faceUrls = ['px', 'py', 'pz', 'nx', 'ny', 'nz'];
        const cube = fakeCube(scene, faceUrls);

        const originalBuilder = envAtlas.envAtlasBuilder.createFromFaceUrls;
        envAtlas.envAtlasBuilder.createFromFaceUrls = jest.fn().mockResolvedValue(atlas);

        try {
            const ready = await new Promise<Texture>((resolve) => {
                envAtlas.ensureEnvAtlasFromCube(cube, scene, resolve);
            });
            expect(envAtlas.envAtlasBuilder.createFromFaceUrls).toHaveBeenCalledWith(faceUrls, scene);
            expect(ready).toBe(atlas);
            expect(getCachedEnvAtlas(cube, scene)).toBe(atlas);
        } finally {
            envAtlas.envAtlasBuilder.createFromFaceUrls = originalBuilder;
            atlas.dispose();
        }
    });

    it('does not try a cube whose atlas failed again, and warns once', async () => {
        const cube = fakeCube(scene, ['px', 'py', 'pz', 'nx', 'ny', 'nz']);
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const originalBuilder = envAtlas.envAtlasBuilder.createFromFaceUrls;
        const build = jest.fn().mockRejectedValue(new Error('no faces'));
        envAtlas.envAtlasBuilder.createFromFaceUrls = build;
        try {
            const onReady = jest.fn();
            envAtlas.ensureEnvAtlasFromCube(cube, scene, onReady);
            await new Promise((resolve) => setTimeout(resolve, 0));
            envAtlas.ensureEnvAtlasFromCube(cube, scene, onReady);
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(build).toHaveBeenCalledTimes(1);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(onReady).not.toHaveBeenCalled();
            // New faces are tried again.
            forceSet(cube, 'files', ['a', 'b', 'c', 'd', 'e', 'f']);
            envAtlas.ensureEnvAtlasFromCube(cube, scene, onReady);
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(build).toHaveBeenCalledTimes(2);
        } finally {
            envAtlas.envAtlasBuilder.createFromFaceUrls = originalBuilder;
            warn.mockRestore();
            cube.dispose();
        }
    });

    it('sizes fallback UVs to custom mesh geometry so the uv attribute is complete', () => {
        // A capsule-sized position buffer with the old DEFAULT_UVS (4 verts) left the
        // uv attribute short — iOS WebKit then raised GL_INVALID_OPERATION on draw.
        const positions = new Float32Array(208 * 3);
        const system = new ParticleSystem({
            scene,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
            renderMode: RenderMode.Mesh,
            instancingGeometry: positions,
            transparent: false,
            blendMode: Constants.ALPHA_DISABLE,
        });

        expect(system.getRendererSettings().instancingUVs?.length).toBe(208 * 2);

        system.dispose();
    });
});
