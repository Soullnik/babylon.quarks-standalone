import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Constants} from '@babylonjs/core/Engines/constants';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {TrailBatch} from '../src/TrailBatch';
import {ParticleSystem} from '../src/ParticleSystem';
import {RenderMode} from '../src/VFXBatch';

describe('TrailBatch', () => {
    let engine: NullEngine;
    let scene: Scene;

    beforeAll(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
    });

    afterAll(() => {
        scene.dispose();
        engine.dispose();
    });

    const createTrailSystem = (overrides: Partial<ConstructorParameters<typeof ParticleSystem>[0]> = {}) =>
        new ParticleSystem({
            scene,
            duration: 5,
            looping: true,
            startLife: new ConstantValue(5),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(200),
            shape: new PointEmitter(),
            renderMode: RenderMode.Trail,
            rendererEmitterSettings: {
                startLength: new ConstantValue(8),
                followLocalOrigin: false,
            },
            ...overrides,
        });

    const getTrailBatch = (renderer: BatchedRenderer): TrailBatch => renderer.batches[0] as TrailBatch;

    it('keeps trail mesh disabled when emitter is hidden', () => {
        const renderer = new BatchedRenderer('trail-hidden', scene);
        const system = createTrailSystem();
        renderer.addSystem(system);
        system.emitter.visible = false;

        for (let i = 0; i < 30; i++) {
            renderer.update(1 / 60);
        }

        const batch = getTrailBatch(renderer);
        expect(batch.mesh.isEnabled()).toBe(false);

        renderer.dispose();
        system.dispose();
    });

    it('builds trail geometry for visible particles in local space', () => {
        const renderer = new BatchedRenderer('trail-visible', scene);
        const system = createTrailSystem({worldSpace: false});
        system.emitter.scaling.set(2, 3, 4);
        renderer.addSystem(system);

        for (let i = 0; i < 30; i++) {
            renderer.update(1 / 60);
        }

        const batch = getTrailBatch(renderer);
        const widthBuffer = (batch as any).widthBuffer as Float32Array;
        expect(system.particleNum).toBeGreaterThan(0);
        expect(batch.mesh.isEnabled()).toBe(true);
        expect(batch.mesh.subMeshes[0].indexCount).toBeGreaterThan(0);
        expect(batch.mesh.subMeshes[0].verticesCount).toBeGreaterThan(0);
        expect(widthBuffer[0]).toBeGreaterThan(1);

        renderer.dispose();
        system.dispose();
    });

    it('expands buffers when dense trails exceed the initial capacity', () => {
        const renderer = new BatchedRenderer('trail-expand', scene);
        const system = createTrailSystem({
            emissionOverTime: new ConstantValue(4000),
            rendererEmitterSettings: {
                startLength: new ConstantValue(12),
                followLocalOrigin: false,
            },
            worldSpace: true,
        });
        renderer.addSystem(system);

        const batch = getTrailBatch(renderer);
        expect((batch as any).maxParticles).toBe(10000);

        for (let i = 0; i < 90; i++) {
            renderer.update(1 / 60);
        }

        expect((batch as any).maxParticles).toBeGreaterThan(10000);
        expect(batch.mesh.isEnabled()).toBe(true);

        renderer.dispose();
        system.dispose();
    });

    it('configures shader material flags for opaque trails', () => {
        const renderer = new BatchedRenderer('trail-opaque', scene);
        const system = createTrailSystem({
            transparent: false,
            depthWrite: true,
        });
        renderer.addSystem(system);

        const batch = getTrailBatch(renderer);
        const material = batch.mesh.material as ShaderMaterial;
        expect(material.alphaMode).toBe(Constants.ALPHA_DISABLE);
        expect(material.forceDepthWrite).toBe(true);
        expect(material.disableDepthWrite).toBe(false);

        renderer.dispose();
        system.dispose();
    });
});
