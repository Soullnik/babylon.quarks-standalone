import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import {RenderMode, VFXBatch} from '../src/VFXBatch';

describe('VFXBatch base helpers', () => {
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

    const createSystem = () =>
        new ParticleSystem({
            scene,
            duration: 1,
            looping: true,
            startLife: new ConstantValue(1),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(10),
            shape: new PointEmitter(),
            renderMode: RenderMode.BillBoard,
        });

    it('filters visible systems and supports add/remove helpers', () => {
        const renderer = new BatchedRenderer('vfx-batch-visibility', scene);
        const a = createSystem();
        const b = createSystem();
        renderer.addSystem(a);
        renderer.addSystem(b);

        const batch = renderer.batches[0] as VFXBatch;
        expect(batch.getVisibleSystems().length).toBe(2);

        b.emitter.visible = false;
        expect(batch.getVisibleSystems().length).toBe(1);

        batch.removeSystem(a);
        expect(batch.systems.size).toBe(1);
        batch.addSystem(a);
        expect(batch.systems.size).toBe(2);

        renderer.dispose();
    });

    it('applies depth texture only for shader materials', () => {
        const renderer = new BatchedRenderer('vfx-batch-depth', scene);
        const system = createSystem();
        renderer.addSystem(system);
        const batch = renderer.batches[0] as VFXBatch;
        const material = batch.mesh.material as any;
        const setTextureSpy = jest.spyOn(material, 'setTexture');

        batch.applyDepthTexture(null);
        expect(setTextureSpy).toHaveBeenCalledWith('depthTexture', null);

        batch.mesh.material = null;
        expect(() => batch.applyDepthTexture(null)).not.toThrow();

        renderer.dispose();
    });
});
