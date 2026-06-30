import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {ConstantValue} from 'quarks.core';
import {ParticleSystem} from '../src/ParticleSystem';
import {ParticleEmitter} from '../src/ParticleEmitter';
import {QuarksUtil} from '../src/QuarksUtil';
import {BatchedRenderer} from '../src/BatchedRenderer';

describe('QuarksUtil parity helpers', () => {
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

    it('runs callback on all particle emitters in subtree', () => {
        const root = new TransformNode('root', scene);
        const emitterA = new ParticleSystem({scene, startLife: new ConstantValue(1), emissionOverTime: new ConstantValue(1)})
            .emitter as ParticleEmitter;
        const emitterB = new ParticleSystem({scene, startLife: new ConstantValue(1), emissionOverTime: new ConstantValue(1)})
            .emitter as ParticleEmitter;
        const container = new TransformNode('container', scene);
        emitterA.parent = root;
        container.parent = root;
        emitterB.parent = container;

        let counter = 0;
        QuarksUtil.runOnAllParticleEmitters(root, () => {
            counter += 1;
        });

        expect(counter).toBe(2);
    });

    it('calls endEmit on all emitters in subtree', () => {
        const root = new TransformNode('root-end-emit', scene);
        const system = new ParticleSystem({scene, startLife: new ConstantValue(1), emissionOverTime: new ConstantValue(1)});
        const emitter = system.emitter as ParticleEmitter;
        emitter.parent = root;

        let emitEnded = false;
        system.addEventListener('emitEnd', () => {
            emitEnded = true;
        });

        QuarksUtil.endEmit(root);
        expect(emitEnded).toBe(true);
    });

    it('forwards lifecycle helpers and autoDestroy changes to all emitters', () => {
        const root = new TransformNode('root-controls', scene);
        const systemA = new ParticleSystem({scene, startLife: new ConstantValue(1), emissionOverTime: new ConstantValue(1)});
        const systemB = new ParticleSystem({scene, startLife: new ConstantValue(1), emissionOverTime: new ConstantValue(1)});
        const emitterA = systemA.emitter as ParticleEmitter;
        const emitterB = systemB.emitter as ParticleEmitter;
        emitterA.parent = root;
        emitterB.parent = root;

        const playSpyA = jest.spyOn(systemA, 'play');
        const playSpyB = jest.spyOn(systemB, 'play');
        const pauseSpyA = jest.spyOn(systemA, 'pause');
        const pauseSpyB = jest.spyOn(systemB, 'pause');
        const stopSpyA = jest.spyOn(systemA, 'stop');
        const stopSpyB = jest.spyOn(systemB, 'stop');
        const restartSpyA = jest.spyOn(systemA, 'restart');
        const restartSpyB = jest.spyOn(systemB, 'restart');

        QuarksUtil.play(root);
        QuarksUtil.pause(root);
        QuarksUtil.stop(root);
        QuarksUtil.restart(root);
        QuarksUtil.setAutoDestroy(root, true);

        expect(playSpyA).toHaveBeenCalled();
        expect(playSpyB).toHaveBeenCalled();
        expect(pauseSpyA).toHaveBeenCalled();
        expect(pauseSpyB).toHaveBeenCalled();
        expect(stopSpyA).toHaveBeenCalled();
        expect(stopSpyB).toHaveBeenCalled();
        expect(restartSpyA).toHaveBeenCalled();
        expect(restartSpyB).toHaveBeenCalled();
        expect(systemA.autoDestroy).toBe(true);
        expect(systemB.autoDestroy).toBe(true);
    });

    it('adds all emitter systems to the provided batch renderer', () => {
        const root = new TransformNode('root-batch', scene);
        const renderer = new BatchedRenderer('batch-util', scene);
        const systemA = new ParticleSystem({scene, startLife: new ConstantValue(1), emissionOverTime: new ConstantValue(1)});
        const systemB = new ParticleSystem({scene, startLife: new ConstantValue(1), emissionOverTime: new ConstantValue(1)});
        (systemA.emitter as ParticleEmitter).parent = root;
        (systemB.emitter as ParticleEmitter).parent = root;

        QuarksUtil.addToBatchRenderer(root, renderer);

        expect(renderer.batches.length).toBe(1);
        expect(renderer.batches[0].systems.size).toBe(2);
        renderer.dispose();
    });

    it('applies a uniform scale factor to the effect root', () => {
        const root = new TransformNode('root-resize-uniform', scene);

        QuarksUtil.resizeEffect(root, 0.5);

        expect(root.scaling.x).toBe(0.5);
        expect(root.scaling.y).toBe(0.5);
        expect(root.scaling.z).toBe(0.5);
    });

    it('applies a per-axis scale vector to the effect root', () => {
        const root = new TransformNode('root-resize-vector', scene);

        QuarksUtil.resizeEffect(root, new Vector3(0.25, 0.5, 0.75));

        expect(root.scaling.x).toBe(0.25);
        expect(root.scaling.y).toBe(0.5);
        expect(root.scaling.z).toBe(0.75);
    });

    it('restarts worldSpace systems by default so already-spawned particles do not keep a stale scale', () => {
        const root = new TransformNode('root-resize-restart', scene);
        const worldSpaceSystem = new ParticleSystem({
            scene,
            worldSpace: true,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(1),
        });
        const localSpaceSystem = new ParticleSystem({scene, startLife: new ConstantValue(1), emissionOverTime: new ConstantValue(1)});
        (worldSpaceSystem.emitter as ParticleEmitter).parent = root;
        (localSpaceSystem.emitter as ParticleEmitter).parent = root;

        const worldSpaceRestartSpy = jest.spyOn(worldSpaceSystem, 'restart');
        const localSpaceRestartSpy = jest.spyOn(localSpaceSystem, 'restart');

        QuarksUtil.resizeEffect(root, 0.5);

        expect(worldSpaceRestartSpy).toHaveBeenCalled();
        expect(localSpaceRestartSpy).not.toHaveBeenCalled();
    });

    it('skips the restart when options.restart is false', () => {
        const root = new TransformNode('root-resize-no-restart', scene);
        const worldSpaceSystem = new ParticleSystem({
            scene,
            worldSpace: true,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(1),
        });
        (worldSpaceSystem.emitter as ParticleEmitter).parent = root;

        const worldSpaceRestartSpy = jest.spyOn(worldSpaceSystem, 'restart');

        QuarksUtil.resizeEffect(root, 0.5, {restart: false});

        expect(worldSpaceRestartSpy).not.toHaveBeenCalled();
    });
});
