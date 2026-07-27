import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {CubeTexture} from '@babylonjs/core/Materials/Textures/cubeTexture';
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

    /** Placeholder cube texture — NullEngine never samples it; settings only need isCube + level. */
    function makeEnv(tag: string, level = 1): CubeTexture {
        const env = CubeTexture.CreateFromImages(
            [0, 1, 2, 3, 4, 5].map((i) => `data:${tag}/${i}`),
            scene
        );
        env.level = level;
        return env;
    }

    it('harvests reflectionTexture from a StandardMaterial into renderer settings', () => {
        const env = makeEnv('harvest', 0.75);
        const material = new StandardMaterial('env-mat', scene);
        material.reflectionTexture = env;

        const system = new ParticleSystem({
            scene,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
            renderMode: RenderMode.Mesh,
            material,
            transparent: true,
            blendMode: Constants.ALPHA_COMBINE,
        });

        expect(system.getRendererSettings().reflectionTexture).toBe(env);
        expect(system.getRendererSettings().reflectionLevel).toBeCloseTo(0.75, 5);

        system.dispose();
        material.dispose();
        env.dispose();
    });

    it('batches mesh systems with different env maps separately', () => {
        const envA = makeEnv('a');
        const envB = makeEnv('b');
        const matA = new StandardMaterial('env-a', scene);
        matA.reflectionTexture = envA;
        const matB = new StandardMaterial('env-b', scene);
        matB.reflectionTexture = envB;

        const make = (material: StandardMaterial) =>
            new ParticleSystem({
                scene,
                startLife: new ConstantValue(1),
                emissionOverTime: new ConstantValue(10),
                startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
                startSize: new ConstantValue(0.1),
                startSpeed: new ConstantValue(0),
                shape: new PointEmitter(),
                renderMode: RenderMode.Mesh,
                material,
                transparent: true,
                blendMode: Constants.ALPHA_COMBINE,
            });

        const renderer = new BatchedRenderer('env-batch', scene);
        const systemA = make(matA);
        const systemB = make(matB);
        renderer.addSystem(systemA);
        renderer.addSystem(systemB);

        expect(renderer.batches.length).toBe(2);
        expect(renderer.batches[0]).toBeInstanceOf(SpriteBatch);
        expect(renderer.batches[0].settings.reflectionTexture).toBe(envA);
        expect(renderer.batches[1].settings.reflectionTexture).toBe(envB);

        renderer.dispose();
        systemA.dispose();
        systemB.dispose();
        matA.dispose();
        matB.dispose();
        envA.dispose();
        envB.dispose();
    });

    it('enables USE_ENVMAP on the mesh ShaderMaterial when a cube map is present', () => {
        const env = makeEnv('shader');
        jest.spyOn(env, 'isReady').mockReturnValue(true);
        const material = new StandardMaterial('env-shader', scene);
        material.reflectionTexture = env;

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

        const batch = renderer.batches[0] as SpriteBatch;
        const defines = (batch.mesh.material as any).options.defines as string[];
        expect(defines).toContain('USE_ENVMAP');
        expect(defines).not.toContain('USE_ALPHATEST');

        renderer.dispose();
        system.dispose();
        material.dispose();
        env.dispose();
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
