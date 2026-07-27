import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Constants} from '@babylonjs/core/Engines/constants';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import {SpriteBatch} from '../src/SpriteBatch';
import {RenderMode} from '../src/VFXBatch';
import * as envAtlas from '../src/envAtlas';
import {cacheEnvAtlas, cubeFaceUrls, getCachedEnvAtlas} from '../src/envAtlas';

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
        const material = new StandardMaterial('env-mat', scene);
        (material as any).reflectionAtlas = atlas;
        (material as any).reflectionLevel = 0.8;

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
        const defines = (batch.mesh.material as any).options.defines as string[];
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

        const material = new StandardMaterial('env-shader', scene);
        (material as any).reflectionAtlas = atlas;

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

        const defines = (renderer.batches[0].mesh.material as any).options.defines as string[];
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
        const cube = {
            isCube: true,
            isReady: () => true,
            level: 0.7,
            files: faceUrls,
            _files: faceUrls,
        } as any;
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
        const cube = {
            isCube: true,
            isReady: () => true,
            files: faceUrls,
            _files: faceUrls,
        } as any;

        const originalBuilder = envAtlas.envAtlasBuilder.createFromFaceUrls;
        envAtlas.envAtlasBuilder.createFromFaceUrls = jest.fn().mockResolvedValue(atlas);

        try {
            const ready = await new Promise<Texture>((resolve) => {
                envAtlas.ensureEnvAtlasFromCube(cube, scene, resolve);
            });
            expect(envAtlas.envAtlasBuilder.createFromFaceUrls).toHaveBeenCalledWith(faceUrls, scene);
            expect(ready).toBe(atlas);
            expect(getCachedEnvAtlas(cube)).toBe(atlas);
        } finally {
            envAtlas.envAtlasBuilder.createFromFaceUrls = originalBuilder;
            atlas.dispose();
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
