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

    it('keeps USE_ENVMAP_ATLAS gated off unless the window flag is set', () => {
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

        let defines = (renderer.batches[0].mesh.material as any).options.defines as string[];
        expect(defines).toContain('USE_MAP');
        expect(defines).not.toContain('USE_ENVMAP_ATLAS');

        const root = globalThis as {__QUARKS_MESH_ENV__?: boolean; window?: unknown};
        root.window = root;
        root.__QUARKS_MESH_ENV__ = true;
        (renderer.batches[0] as SpriteBatch).rebuildMaterial();
        defines = (renderer.batches[0].mesh.material as any).options.defines as string[];
        expect(defines).toContain('USE_ENVMAP_ATLAS');
        delete root.__QUARKS_MESH_ENV__;

        renderer.dispose();
        system.dispose();
        material.dispose();
        atlas.dispose();
    });

    it('does not enable alpha-test from StandardMaterial default alphaCutOff', () => {
        const material = new StandardMaterial('no-at', scene);
        expect(material.alphaCutOff).toBeCloseTo(0.4, 5);
        material.transparencyMode = null;

        const system = new ParticleSystem({
            scene,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
            renderMode: RenderMode.Mesh,
            material,
            transparent: true,
            blendMode: Constants.ALPHA_COMBINE,
        });

        expect(system.getRendererSettings().materialAlphaTest).toBe(0);

        system.dispose();
        material.dispose();
    });
});
