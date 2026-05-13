import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Constants} from '@babylonjs/core/Engines/constants';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import {SpriteBatch} from '../src/SpriteBatch';
import {RenderMode} from '../src/VFXBatch';

describe('SpriteBatch', () => {
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

    const createSpriteSystem = (overrides: Partial<ConstructorParameters<typeof ParticleSystem>[0]> = {}) =>
        new ParticleSystem({
            scene,
            duration: 5,
            looping: true,
            startLife: new ConstantValue(5),
            startSpeed: new ConstantValue(1),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(200),
            shape: new PointEmitter(),
            renderMode: RenderMode.BillBoard,
            ...overrides,
        });

    const getSpriteBatch = (renderer: BatchedRenderer): SpriteBatch => renderer.batches[0] as SpriteBatch;

    it('skips hidden emitter systems during update', () => {
        const renderer = new BatchedRenderer('sprite-hidden', scene);
        const system = createSpriteSystem();
        renderer.addSystem(system);
        system.emitter.visible = false;

        for (let i = 0; i < 30; i++) {
            renderer.update(1 / 60);
        }

        const batch = getSpriteBatch(renderer);
        expect(batch).toBeInstanceOf(SpriteBatch);
        expect(batch.mesh.forcedInstanceCount).toBe(0);
        expect(batch.mesh.isEnabled()).toBe(false);

        renderer.dispose();
        system.dispose();
    });

    it('populates instance buffers and applies local-space scale', () => {
        const renderer = new BatchedRenderer('sprite-local-space', scene);
        const system = createSpriteSystem({worldSpace: false});
        system.emitter.scaling.set(2, 3, 4);
        renderer.addSystem(system);

        for (let i = 0; i < 30; i++) {
            renderer.update(1 / 60);
        }

        const batch = getSpriteBatch(renderer);
        const sizeBuffer = (batch as any).sizeBuffer as Float32Array;
        expect(system.particleNum).toBeGreaterThan(0);
        expect(batch.mesh.forcedInstanceCount).toBe(system.particleNum);
        expect(sizeBuffer[0]).toBeGreaterThan(1);

        renderer.dispose();
        system.dispose();
    });

    it('expands dynamic sprite buffers for dense particle counts', () => {
        const renderer = new BatchedRenderer('sprite-expand', scene);
        const system = createSpriteSystem({
            emissionOverTime: new ConstantValue(4000),
            startLife: new ConstantValue(8),
        });
        renderer.addSystem(system);

        const batch = getSpriteBatch(renderer);
        expect((batch as any).maxParticles).toBe(1000);

        for (let i = 0; i < 60; i++) {
            renderer.update(1 / 60);
        }

        expect(system.particleNum).toBeGreaterThan(1000);
        expect((batch as any).maxParticles).toBeGreaterThan(1000);

        renderer.dispose();
        system.dispose();
    });

    it('handles stretched billboard velocity buffers and speedFactor clamping', () => {
        const renderer = new BatchedRenderer('sprite-stretched', scene);
        const system = createSpriteSystem({
            renderMode: RenderMode.StretchedBillBoard,
            rendererEmitterSettings: {
                speedFactor: 0,
                lengthFactor: 3,
            },
            worldSpace: true,
        });
        renderer.addSystem(system);
        renderer.update(1 / 60);
        renderer.update(1 / 60);

        for (let i = 0; i < system.particleNum; i++) {
            system.particles[i].velocity.set(3, 0, 0);
        }

        renderer.update(1 / 60);

        const batch = getSpriteBatch(renderer);
        const velocityBuffer = (batch as any).velocityBuffer as Float32Array;
        const material = batch.mesh.material as ShaderMaterial;
        expect(velocityBuffer[0]).toBeCloseTo(0.003, 6);
        expect(velocityBuffer[3]).toBe(3);
        expect((material as any)._floats.speedFactor).toBe(0.001);

        renderer.dispose();
        system.dispose();
    });

    it('applies opaque mesh material depth settings', () => {
        const renderer = new BatchedRenderer('sprite-mesh-material', scene);
        const system = createSpriteSystem({
            renderMode: RenderMode.Mesh,
            transparent: false,
            depthWrite: true,
            worldSpace: false,
        });
        renderer.addSystem(system);
        renderer.update(1 / 60);

        const batch = getSpriteBatch(renderer);
        const material = batch.mesh.material as ShaderMaterial;
        const rotationBuffer = (batch as any).rotationBuffer as Float32Array;
        expect(rotationBuffer.length % 4).toBe(0);
        expect(material.alphaMode).toBe(Constants.ALPHA_DISABLE);
        expect(material.forceDepthWrite).toBe(true);
        expect(material.disableDepthWrite).toBe(false);

        renderer.dispose();
        system.dispose();
    });
});
