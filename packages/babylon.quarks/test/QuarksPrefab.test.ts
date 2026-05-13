import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {ConstantValue} from 'quarks.core';
import {ParticleSystem} from '../src/ParticleSystem';
import {ParticleEmitter} from '../src/ParticleEmitter';
import {QuarksPrefab} from '../src/QuarksPrefab';

describe('QuarksPrefab', () => {
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

    it('adds and resolves particle animation references', () => {
        const root = new TransformNode('root', scene);
        const system = new ParticleSystem({scene, startLife: new ConstantValue(1), emissionOverTime: new ConstantValue(1)});
        const emitter = system.emitter as ParticleEmitter;
        (emitter as any)._quarksUUID = 'emitter-1';
        emitter.parent = root;

        const prefab = QuarksPrefab.fromJSON({
            name: 'prefab',
            animationData: [{startTime: 0, duration: 2, type: 'ps', targetUUID: 'emitter-1', loop: false}],
        }, scene);
        prefab.parent = root;
        prefab.resolveReferences(root);

        expect(prefab.animationData.length).toBe(1);
        expect(prefab.animationData[0].target).toBe(emitter);
        expect(prefab.getDuration()).toBe(2);
    });

    it('plays and stops particle system animations on timeline transitions', () => {
        const system = new ParticleSystem({scene, startLife: new ConstantValue(1), emissionOverTime: new ConstantValue(5)});
        const emitter = system.emitter as ParticleEmitter;
        const prefab = new QuarksPrefab('prefab-runtime', scene);
        prefab.addParticleSystemAnimation(emitter, 0, 0.5, false);

        let emitEnded = false;
        system.addEventListener('emitEnd', () => {
            emitEnded = true;
        });

        prefab.play();
        prefab.update(0.1);
        expect(prefab.isPlaying).toBe(true);

        prefab.setTime(1.0);
        expect(emitEnded).toBe(true);
    });

    it('supports three-style timeline entries with clip references', () => {
        const root = new TransformNode('root-three', scene);
        const animatedTarget = new TransformNode('animated-target', scene);
        (animatedTarget as any)._quarksUUID = 'animated-uuid';
        animatedTarget.parent = root;

        const clip = {
            uuid: 'clip-uuid',
            duration: 1.5,
            play: jest.fn(),
            pause: jest.fn(),
            stop: jest.fn(),
            setTime: jest.fn(),
        };
        (animatedTarget as any).animations = [clip];

        const prefab = QuarksPrefab.fromJSON({
            name: 'prefab-three',
            animationData: [
                {startTime: 0.25, duration: 1.5, type: 'three', targetUUID: 'animated-uuid', clipUUID: 'clip-uuid', loop: false},
            ],
        }, scene);
        prefab.parent = root;
        prefab.resolveReferences(root);

        expect(prefab.animationData.length).toBe(1);
        expect(prefab.animationData[0].type).toBe('three');
        expect((prefab.animationData[0] as any).clipUUID).toBe('clip-uuid');

        prefab.play();
        prefab.update(0.3);
        expect(clip.play).toHaveBeenCalled();

        prefab.setTime(0.5);
        expect(clip.setTime).toHaveBeenCalled();

        const json = prefab.toJSON();
        expect(json.animationData[0].clipUUID).toBe('clip-uuid');
    });

    it('supports clip-only animations and removeAnimation bookkeeping', () => {
        const prefab = new QuarksPrefab('prefab-clip-only', scene);
        const target = new TransformNode('clip-target', scene);
        const clip = {uuid: 'clip-main', duration: 2, play: jest.fn(), stop: jest.fn(), pause: jest.fn()};
        prefab.addThreeAnimation(target, clip, 0.5, 0, false);
        expect(prefab.getDuration()).toBe(2.5);

        prefab.removeAnimation(0);
        expect(prefab.animationData.length).toBe(0);
        expect(prefab.getDuration()).toBe(0);
    });

    it('loops particle and three animations on active window exits', () => {
        const system = new ParticleSystem({scene, startLife: new ConstantValue(1), emissionOverTime: new ConstantValue(1)});
        const emitter = system.emitter as ParticleEmitter;
        const clip = {duration: 0.4, play: jest.fn(), stop: jest.fn(), pause: jest.fn(), setTime: jest.fn()};
        const keepAliveClip = {duration: 1, play: jest.fn(), stop: jest.fn(), pause: jest.fn(), setTime: jest.fn()};
        const target = new TransformNode('loop-target', scene);
        const prefab = new QuarksPrefab('prefab-loop', scene);

        prefab.addParticleSystemAnimation(emitter, 0, 0.2, true);
        prefab.addThreeAnimation(target, clip, 0, 0.2, true);
        prefab.addThreeAnimation(target, keepAliveClip, 0, 1, false);
        const restartSpy = jest.spyOn(system, 'restart');

        prefab.play();
        prefab.update(0.05);
        prefab.update(0.3);

        expect(restartSpy).toHaveBeenCalled();
        expect(clip.play).toHaveBeenCalledTimes(2);
    });

    it('pauses and stops three timeline clips when no particle target is active', () => {
        const target = new TransformNode('pause-stop-target', scene);
        const clip = {duration: 1, play: jest.fn(), stop: jest.fn(), pause: jest.fn(), setTime: jest.fn()};
        const prefab = new QuarksPrefab('prefab-stop-three', scene);
        prefab.addThreeAnimation(target, clip, 0, 1, false);

        prefab.play();
        prefab.pause();
        expect(clip.pause).toHaveBeenCalled();

        prefab.play();
        prefab.stop();
        expect(clip.stop).toHaveBeenCalled();
    });
});
