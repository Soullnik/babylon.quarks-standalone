import {Constants} from '@babylonjs/core/Engines/constants';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {RawTexture} from '@babylonjs/core/Materials/Textures/rawTexture';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import {SpriteBatch} from '../src/SpriteBatch';
import {TrailBatch} from '../src/TrailBatch';
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

    it('creates TrailBatch for trail render mode and updates', () => {
        const renderer = new BatchedRenderer('batcher-trail', scene);
        const system = new ParticleSystem({
            scene,
            duration: 2,
            looping: true,
            startLife: new ConstantValue(2),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(50),
            shape: new PointEmitter(),
            renderMode: RenderMode.Trail,
            rendererEmitterSettings: {
                startLength: new ConstantValue(6),
                followLocalOrigin: false,
            },
        });
        renderer.addSystem(system);
        expect(renderer.batches[0]).toBeInstanceOf(TrailBatch);
        renderer.update(1 / 60);
        expect(renderer.batches.length).toBe(1);
        renderer.dispose();
        system.dispose();
    });

    it('throws for unsupported render mode when adding a system', () => {
        const renderer = new BatchedRenderer('batcher-bad-mode', scene);
        const system = createSystem();
        (system as any).rendererSettings.renderMode = 99;
        expect(() => renderer.addSystem(system)).toThrow(/Unsupported render mode/);
        renderer.dispose();
        system.dispose();
    });

    it('applies depth texture to new batches and via setDepthTexture', () => {
        const depthTex = RawTexture.CreateLuminanceTexture(new Uint8Array([255]), 1, 1, scene);
        const renderer = new BatchedRenderer('batcher-depth', scene);
        const system = createSystem();
        const onCreateSpy = jest.spyOn(SpriteBatch.prototype, 'applyDepthTexture');
        renderer.depthTexture = depthTex;
        renderer.addSystem(system);
        expect(onCreateSpy).toHaveBeenCalledWith(depthTex);

        const batch = renderer.batches[0];
        const spy = jest.spyOn(batch, 'applyDepthTexture');
        renderer.setDepthTexture(depthTex);
        expect(spy).toHaveBeenCalledWith(depthTex);
        spy.mockRestore();
        onCreateSpy.mockRestore();

        const system2 = createSystem();
        system2.blending = Constants.ALPHA_SUBTRACT;
        renderer.addSystem(system2);
        const secondBatch = renderer.batches.find((b) => b !== batch);
        expect(secondBatch).toBeDefined();
        const spy2 = jest.spyOn(secondBatch!, 'applyDepthTexture');
        renderer.setDepthTexture(depthTex);
        expect(spy2).toHaveBeenCalledWith(depthTex);

        renderer.dispose();
        system.dispose();
        system2.dispose();
        depthTex.dispose();
    });

    it('applies depth texture when depth is set before first batch is created', () => {
        const depthTex = RawTexture.CreateLuminanceTexture(new Uint8Array([128]), 1, 1, scene);
        const renderer = new BatchedRenderer('batcher-depth-order', scene);
        renderer.depthTexture = depthTex;
        const system = createSystem();
        const batchSpy = jest.spyOn(TrailBatch.prototype, 'applyDepthTexture');
        const trail = new ParticleSystem({
            scene,
            duration: 1,
            looping: true,
            startLife: new ConstantValue(1),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(0),
            shape: new PointEmitter(),
            renderMode: RenderMode.Trail,
            rendererEmitterSettings: {startLength: new ConstantValue(4), followLocalOrigin: false},
        });
        renderer.addSystem(trail);
        expect(batchSpy).toHaveBeenCalledWith(depthTex);
        batchSpy.mockRestore();
        renderer.dispose();
        trail.dispose();
        depthTex.dispose();
    });

    it('increases adaptive quality when frame stays under budget', () => {
        let tick = 0;
        const nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => {
            tick += 1;
            return tick === 1 ? 1000 : 1000.2;
        });
        const renderer = new BatchedRenderer('batcher-adaptive-up', scene);
        const system = createSystem();
        renderer.addSystem(system);
        renderer.configureAdaptivePerformance({
            targetFrameMs: 50,
            minQuality: 0.5,
            maxQuality: 1,
            decreaseStep: 0.1,
            increaseStep: 0.05,
        });
        (renderer as any).adaptivePerformanceState.currentQuality = 0.5;
        renderer.update(1 / 60);
        expect(renderer.getAdaptivePerformanceState().currentQuality).toBeGreaterThan(0.5);
        nowSpy.mockRestore();
        renderer.dispose();
        system.dispose();
    });

    it('disableAdaptivePerformance without reset leaves quality unchanged', () => {
        const renderer = new BatchedRenderer('batcher-adaptive-no-reset', scene);
        const system = createSystem();
        renderer.addSystem(system);
        renderer.configureAdaptivePerformance({targetFrameMs: 0.1, minQuality: 0.2, maxQuality: 1});
        const q = renderer.getAdaptivePerformanceState().currentQuality;
        renderer.disableAdaptivePerformance(false);
        expect(renderer.getAdaptivePerformanceState().enabled).toBe(false);
        expect(renderer.getAdaptivePerformanceState().currentQuality).toBe(q);
        renderer.dispose();
        system.dispose();
    });

    it('skips redundant adaptive quality application when quality is unchanged', () => {
        const renderer = new BatchedRenderer('batcher-adaptive-skip', scene);
        const system = createSystem();
        renderer.addSystem(system);
        renderer.configureAdaptivePerformance({targetFrameMs: 500, minQuality: 1, maxQuality: 1});
        const spy = jest.spyOn(system as any, 'setQualityFactor');
        renderer.update(1 / 60);
        spy.mockClear();
        (renderer as any).lastAppliedQuality = (renderer as any).adaptivePerformanceState.currentQuality;
        renderer.update(1 / 60);
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
        renderer.dispose();
        system.dispose();
    });

    it('configureAdaptivePerformance clamps inverted min/max and tiny target frame budgets', () => {
        const renderer = new BatchedRenderer('cfg-edge', scene);
        const system = new ParticleSystem({
            scene,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
        });
        renderer.addSystem(system);
        renderer.configureAdaptivePerformance({
            minQuality: 2,
            maxQuality: 0.1,
            targetFrameMs: 0.01,
            decreaseStep: 0.0001,
            increaseStep: 0.0001,
        });
        const st = renderer.getAdaptivePerformanceState();
        expect(st.minQuality).toBeLessThanOrEqual(st.maxQuality);
        expect(st.targetFrameMs).toBeGreaterThanOrEqual(0.1);
        renderer.dispose();
        system.dispose();
    });

    it('deleteSystem ignores systems that were never registered', () => {
        const renderer = new BatchedRenderer('del-unknown', scene);
        const orphan = new ParticleSystem({
            scene,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
        });
        renderer.deleteSystem(orphan);
        renderer.dispose();
        orphan.dispose();
    });

    it('freezes systems whose emitter is disabled and resumes them on enable', () => {
        const renderer = new BatchedRenderer('hidden-sim', scene);
        const system = createSystem();
        renderer.addSystem(system);
        for (let i = 0; i < 30; i++) renderer.update(1 / 60);

        const particlesWhenHidden = system.particleNum;
        expect(particlesWhenHidden).toBeGreaterThan(0);
        const frozenAge = system.particles[0].age;
        const frozenTime = system.time;

        system.emitter.visible = false;
        for (let i = 0; i < 30; i++) renderer.update(1 / 60);
        expect(system.particleNum).toBe(particlesWhenHidden);
        expect(system.particles[0].age).toBe(frozenAge);
        expect(system.time).toBe(frozenTime);
        // Nothing of a hidden system reaches the GPU either.
        expect(renderer.getBatchRenderStats()[0].instanceCount).toBe(0);

        system.emitter.visible = true;
        renderer.update(1 / 60);
        expect(system.particles[0].age).toBeGreaterThan(frozenAge);
        expect(renderer.getBatchRenderStats()[0].instanceCount).toBeGreaterThan(0);

        renderer.dispose();
        system.dispose();
    });

    it('keeps an orphaned batch warm briefly, then reclaims it', () => {
        const renderer = new BatchedRenderer('batch-reclaim', scene);
        const system = createSystem();
        renderer.addSystem(system);
        renderer.update(1 / 60);
        expect(renderer.batches.length).toBe(1);

        // Moves the system to a new batch and leaves the old one empty.
        system.uTileCount = 4;
        renderer.update(1 / 60);
        expect(renderer.batches.length).toBe(2);

        // Still kept around shortly after, so toggling back reuses it.
        for (let i = 0; i < 5; i++) renderer.update(1 / 60);
        expect(renderer.batches.length).toBe(2);

        for (let i = 0; i < 200; i++) renderer.update(1 / 60);
        expect(renderer.batches.length).toBe(1);
        // The surviving batch is the one the system actually uses.
        expect(renderer.batches[0].systems.has(system)).toBe(true);
        expect(renderer.getBatchRenderStats()[0].particleCount).toBeGreaterThan(0);

        renderer.dispose();
        system.dispose();
    });

    it('remaps system batch indices when an earlier batch is reclaimed', () => {
        const renderer = new BatchedRenderer('batch-remap', scene);
        const dropped = createSystem();
        renderer.addSystem(dropped);
        renderer.update(1 / 60);

        const kept = createSystem();
        kept.uTileCount = 4;
        renderer.addSystem(kept);
        renderer.update(1 / 60);
        expect(renderer.batches.length).toBe(2);

        // Retire the first batch so the second one shifts down an index.
        dropped.dispose();
        for (let i = 0; i < 200; i++) renderer.update(1 / 60);
        expect(renderer.batches.length).toBe(1);
        expect(renderer.systemToBatchIndex.get(kept)).toBe(0);

        // The remaining system must still be routed to a live batch.
        kept.uTileCount = 8;
        renderer.update(1 / 60);
        expect(renderer.batches[renderer.systemToBatchIndex.get(kept)!].systems.has(kept)).toBe(true);

        renderer.dispose();
        kept.dispose();
    });
});
