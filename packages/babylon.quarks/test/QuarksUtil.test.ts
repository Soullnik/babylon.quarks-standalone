import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
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
});
