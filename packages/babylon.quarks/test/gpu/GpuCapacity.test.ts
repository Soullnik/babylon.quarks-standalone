import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, IntervalValue, PiecewiseBezier, PointEmitter, Vector4} from 'quarks.core';
import {ParticleSystem, ParticleSystemParameters} from '../../src/ParticleSystem';
import {RenderMode} from '../../src/VFXBatch';
import {estimateCapacity, maxOfGenerator, MIN_GPU_CAPACITY} from '../../src/gpu/GpuCapacity';

describe('GpuCapacity', () => {
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

    const createSystem = (overrides: Partial<ParticleSystemParameters> = {}) =>
        new ParticleSystem({
            scene,
            duration: 1,
            startLife: new ConstantValue(4),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(1000),
            shape: new PointEmitter(),
            renderMode: RenderMode.BillBoard,
            ...overrides,
        });

    it('bounds generators statically', () => {
        expect(maxOfGenerator(new ConstantValue(5))).toBe(5);
        expect(maxOfGenerator(new IntervalValue(2, 7))).toBe(7);
        expect(maxOfGenerator(new PiecewiseBezier())).toBe(1);
        expect(maxOfGenerator({} as never)).toBeUndefined();
    });

    it('estimates steady-state emission with headroom', () => {
        // 1000/s * 4s life * 1.2 = 4800, rounded up to workgroups
        const capacity = estimateCapacity(createSystem());
        expect(capacity).toBeGreaterThanOrEqual(4800);
        expect(capacity).toBeLessThan(4800 + 64);
        expect(capacity % 64).toBe(0);
    });

    it('adds burst peaks', () => {
        const system = createSystem({
            emissionBursts: [{time: 0, count: new ConstantValue(2000), cycle: 1, interval: 1, probability: 1}],
        });
        expect(estimateCapacity(system)).toBeGreaterThanOrEqual(4800 + 2000);
    });

    it('respects the explicit maxParticles override and clamps to the floor', () => {
        expect(estimateCapacity(createSystem(), 100000)).toBe(100032); // rounded to 64
        expect(estimateCapacity(createSystem(), 10)).toBe(MIN_GPU_CAPACITY);
    });
});
