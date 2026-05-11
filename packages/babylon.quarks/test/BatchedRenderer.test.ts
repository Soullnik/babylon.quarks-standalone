import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Constants} from '@babylonjs/core/Engines/constants';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import {RenderMode} from '../src/VFXBatch';

describe('BatchedRenderer', () => {
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

    it('reuses the same batch for equivalent systems', () => {
        const renderer = new BatchedRenderer('batcher-equal', scene);
        const a = createSystem();
        const b = createSystem();

        renderer.addSystem(a);
        renderer.addSystem(b);

        expect(renderer.batches.length).toBe(1);
        expect(renderer.batches[0].systems.size).toBe(2);
    });

    it('rebuilds batching when renderer settings diverge', () => {
        const renderer = new BatchedRenderer('batcher-diverge', scene);
        const a = createSystem();
        const b = createSystem();
        renderer.addSystem(a);
        renderer.addSystem(b);
        expect(renderer.batches.length).toBe(1);

        a.blending = Constants.ALPHA_SUBTRACT;
        renderer.updateSystem(a);

        expect(renderer.batches.length).toBe(2);
    });
});
