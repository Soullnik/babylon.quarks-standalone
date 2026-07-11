import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {
    ApplyCollision,
    ApplyForce,
    ColorOverLife,
    ConstantColor,
    ConstantValue,
    Gradient,
    GravityForce,
    IntervalValue,
    PointEmitter,
    SizeOverLife,
    PiecewiseBezier,
    SphereEmitter,
    Vector3,
    Vector4,
} from 'quarks.core';
import {BatchedRenderer} from '../../src/BatchedRenderer';
import {ParticleSystem, ParticleSystemParameters} from '../../src/ParticleSystem';
import {RenderMode} from '../../src/VFXBatch';
import {evaluateGpuSupport, resolveSimulationBackend, SimulationBackend} from '../../src/gpu/SimulationBackend';

describe('SimulationBackend', () => {
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
            looping: true,
            startLife: new IntervalValue(1, 2),
            startSpeed: new ConstantValue(1),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(10),
            shape: new PointEmitter(),
            renderMode: RenderMode.BillBoard,
            behaviors: [
                new ApplyForce(new Vector3(0, -1, 0), new ConstantValue(9.8)),
                new GravityForce(new Vector3(0, 0, 0), 1),
                new SizeOverLife(new PiecewiseBezier()),
                new ColorOverLife(new Gradient()),
            ],
            ...overrides,
        });

    it('reports compute-shader capability as a blocking reason under NullEngine', () => {
        const {supported, reasons} = evaluateGpuSupport(createSystem(), scene);
        expect(supported).toBe(false);
        expect(reasons.some((r) => r.includes('compute shaders'))).toBe(true);
        // capability is the only blocker for a fully supported config
        expect(reasons).toHaveLength(1);
    });

    it('lists every unsupported feature', () => {
        const system = createSystem({
            renderMode: RenderMode.Trail,
            behaviors: [new ApplyCollision({resolve: () => false} as any, 0.5)],
            prewarm: true,
            shape: new SphereEmitter({mode: 2}),
        });
        const {supported, reasons} = evaluateGpuSupport(system, scene);
        expect(supported).toBe(false);
        expect(reasons.join('\n')).toContain('render mode Trail');
        expect(reasons.join('\n')).toContain('prewarm');
        expect(reasons.join('\n')).toContain('ApplyCollision');
        expect(reasons.join('\n')).toContain('emitter mode');
    });

    it('demotes systems with particleDied listeners', () => {
        const system = createSystem();
        system.addEventListener('particleDied', () => undefined);
        const {reasons} = evaluateGpuSupport(system, scene);
        expect(reasons.join('\n')).toContain('particleDied');
    });

    it('resolves cpu requests without evaluating support', () => {
        const state = resolveSimulationBackend(createSystem(), scene, 'cpu');
        expect(state).toEqual({requested: 'cpu', active: SimulationBackend.CPU});
    });

    it('falls back to cpu with reasons when gpu is requested but unsupported', () => {
        const state = resolveSimulationBackend(createSystem(), scene, 'gpu');
        expect(state.active).toBe(SimulationBackend.CPU);
        expect(state.requested).toBe('gpu');
        expect(state.fallbackReason).toBeDefined();
        expect(state.unsupportedFeatures!.length).toBeGreaterThan(0);
    });

    describe('BatchedRenderer integration', () => {
        it('keeps cpu systems on the existing SpriteBatch path by default', () => {
            const renderer = new BatchedRenderer('gpu-default-cpu', scene);
            const system = createSystem();
            renderer.addSystem(system);
            expect(system.simulationState.active).toBe(SimulationBackend.CPU);
            expect(system._gpuSimulator).toBeUndefined();
            renderer.update(1 / 60);
            expect(renderer.batches).toHaveLength(1);
            renderer.dispose();
        });

        it('warns once and falls back when gpu is requested without WebGPU', () => {
            const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
            const renderer = new BatchedRenderer('gpu-fallback', scene);
            const system = createSystem({simulation: 'gpu'});
            renderer.addSystem(system);
            expect(system.simulationState.active).toBe(SimulationBackend.CPU);
            expect(system.simulationState.fallbackReason).toContain('compute shaders');
            expect(warn).toHaveBeenCalledTimes(1);

            // re-adding (updateSystem path) must not warn again
            renderer.updateSystem(system);
            expect(warn).toHaveBeenCalledTimes(1);
            warn.mockRestore();
            renderer.dispose();
        });

        it('auto mode falls back silently', () => {
            const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
            const renderer = new BatchedRenderer('gpu-auto', scene);
            const system = createSystem({simulation: 'auto'});
            renderer.addSystem(system);
            expect(system.simulationState.active).toBe(SimulationBackend.CPU);
            expect(warn).not.toHaveBeenCalled();
            warn.mockRestore();
            renderer.dispose();
        });

        it('applies the renderer defaultSimulation to systems without an explicit mode', () => {
            const renderer = new BatchedRenderer('gpu-renderer-default', scene, {defaultSimulation: 'auto'});
            const system = createSystem();
            renderer.addSystem(system);
            expect(system.simulationState.requested).toBe('auto');
            expect(system.simulationState.active).toBe(SimulationBackend.CPU);
            renderer.dispose();
        });

        it('cpu simulation still runs while the gpu request is demoted', () => {
            const renderer = new BatchedRenderer('gpu-demoted-sim', scene);
            const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
            const system = createSystem({simulation: 'gpu'});
            renderer.addSystem(system);
            for (let i = 0; i < 30; i++) {
                renderer.update(1 / 60);
            }
            expect(system.particleNum).toBeGreaterThan(0);
            warn.mockRestore();
            renderer.dispose();
        });
    });
});
