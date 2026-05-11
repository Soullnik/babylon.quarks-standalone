import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {ConstantValue} from 'quarks.core';
import {ParticleSystem} from '../src/ParticleSystem';
import {ParticleEmitter} from '../src/ParticleEmitter';
import {QuarksUtil} from '../src/QuarksUtil';

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
});
