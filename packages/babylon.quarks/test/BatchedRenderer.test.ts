import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Constants} from '@babylonjs/core/Engines/constants';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import {RenderMode} from '../src/VFXBatch';
import {SimulationBackend} from '../src/SimulationBackends';

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

    it('adapts quality factor when frame budget is exceeded', () => {
        const renderer = new BatchedRenderer('batcher-adaptive', scene);
        const a = createSystem();
        const b = createSystem();
        renderer.addSystem(a);
        renderer.addSystem(b);

        const qualitySpyA = jest.spyOn(a as any, 'setQualityFactor');
        const qualitySpyB = jest.spyOn(b as any, 'setQualityFactor');
        renderer.configureAdaptivePerformance({
            targetFrameMs: 0.1,
            minQuality: 0.4,
            maxQuality: 1,
            decreaseStep: 0.2,
            increaseStep: 0.01,
        });

        renderer.update(1 / 60);
        renderer.update(1 / 60);
        const state = renderer.getAdaptivePerformanceState();

        expect(state.enabled).toBe(true);
        expect(state.currentQuality).toBeLessThan(1);
        expect(state.currentQuality).toBeGreaterThanOrEqual(0.4);
        expect(qualitySpyA).toHaveBeenCalled();
        expect(qualitySpyB).toHaveBeenCalled();

        renderer.disableAdaptivePerformance();
        const disabledState = renderer.getAdaptivePerformanceState();
        expect(disabledState.enabled).toBe(false);
        expect(disabledState.currentQuality).toBe(1);
    });

    it('defaults to cpu backend and supports runtime switching', () => {
        const renderer = new BatchedRenderer('batcher-backend-default', scene);
        const defaultState = renderer.getSimulationBackendState();
        expect(defaultState.requestedBackend).toBe(SimulationBackend.CPU);
        expect(defaultState.activeBackend).toBe(SimulationBackend.CPU);

        renderer.setSimulationBackend(SimulationBackend.CPU);
        const switchedState = renderer.getSimulationBackendState();
        expect(switchedState.activeBackend).toBe(SimulationBackend.CPU);
    });

    it('falls back to cpu when gpu backend is unavailable', () => {
        const renderer = new BatchedRenderer('batcher-backend-fallback', scene, {
            simulationBackend: SimulationBackend.GPU,
        });
        const state = renderer.getSimulationBackendState();
        expect(state.requestedBackend).toBe(SimulationBackend.GPU);
        expect(state.activeBackend).toBe(SimulationBackend.CPU);
        expect(state.fallbackReason).toBeDefined();
    });
});
