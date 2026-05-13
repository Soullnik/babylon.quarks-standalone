import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Quaternion} from '@babylonjs/core/Maths/math.vector';
import {ConstantValue} from 'quarks.core';
import {ParticleSystem} from '../src/ParticleSystem';
import {ParticleEmitter} from '../src/ParticleEmitter';

describe('ParticleEmitter parity helpers', () => {
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

    it('extractFromCache strips metadata entries', () => {
        const emitter = new ParticleSystem({
            scene,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(1),
        }).emitter as ParticleEmitter;

        const values = emitter.extractFromCache({
            first: {metadata: {source: 'meta'}, payload: 1},
            second: {metadata: {source: 'meta'}, payload: 2},
        });

        expect(values.length).toBe(2);
        expect(values[0].metadata).toBeUndefined();
        expect(values[1].metadata).toBeUndefined();
    });

    it('clones transform and serialization fields', () => {
        const system = new ParticleSystem({
            scene,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
        });
        const emitter = system.emitter as ParticleEmitter;
        emitter.name = 'source-emitter';
        emitter.position.set(1, 2, 3);
        emitter.rotation.set(0.1, 0.2, 0.3);
        emitter.scaling.set(2, 3, 4);
        emitter.rotationQuaternion = Quaternion.FromEulerAngles(0.1, 0.2, 0.3);
        emitter.setEnabled(false);

        const clone = emitter.clone('cloned-emitter');
        expect(clone.name).toBe('cloned-emitter');
        expect(clone.position.x).toBeCloseTo(1, 5);
        expect(clone.scaling.z).toBeCloseTo(4, 5);
        expect(clone.isEnabled()).toBe(false);
        expect(clone.rotationQuaternion).not.toBeNull();

        (emitter as any)._quarksUUID = 'custom-uuid';
        const json = emitter.toJSON();
        expect(json.uuid).toBe('custom-uuid');
        expect(json.type).toBe('ParticleEmitter');
        expect(json.visible).toBe(false);
        expect(json.quaternion).toBeDefined();
    });
});
