import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Quaternion} from '@babylonjs/core/Maths/math.vector';
import {Scene} from '@babylonjs/core/scene';
import {ConstantValue} from 'quarks.core';
import {ParticleEmitter} from '../src/ParticleEmitter';
import {ParticleSystem} from '../src/ParticleSystem';

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

    it('extractFromCache keeps primitives and skips metadata stripping for non-objects', () => {
        const emitter = new ParticleSystem({
            scene,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(1),
        }).emitter as ParticleEmitter;

        const values = emitter.extractFromCache({
            num: 42,
            str: 'x',
            obj: {metadata: {a: 1}, v: 1},
        });

        expect(values).toEqual([42, 'x', {v: 1}]);
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

    it('constructs emitter without passing scene while retaining system link', () => {
        const system = new ParticleSystem({
            scene,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
        });
        const detached = new ParticleEmitter(system);
        expect(detached.system).toBe(system);
        detached.dispose();
    });

    it('exposes visible and uuid helpers', () => {
        const system = new ParticleSystem({
            scene,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
        });
        const emitter = system.emitter as ParticleEmitter;
        emitter.visible = false;
        expect(emitter.visible).toBe(false);
        expect(emitter.uuid).toBe(emitter.uniqueId.toString());
    });

    it('clones without copying quaternion when unset', () => {
        const system = new ParticleSystem({
            scene,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
        });
        const emitter = system.emitter as ParticleEmitter;
        emitter.rotationQuaternion = null;
        emitter.rotation.set(0.2, 0.3, 0.4);
        const clone = emitter.clone('no-quat');
        expect(clone.rotationQuaternion).toBeNull();
        clone.dispose();
    });

    it('serializes without quaternion when euler rotation is used', () => {
        const system = new ParticleSystem({
            scene,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(0),
        });
        const emitter = system.emitter as ParticleEmitter;
        emitter.rotationQuaternion = null;
        emitter.rotation.set(0.1, 0.2, 0.3);
        const json = emitter.toJSON();
        expect(json.quaternion).toBeUndefined();
        expect(json.rotation).toEqual([0.1, 0.2, 0.3]);
    });

    it('clone copies emitter name when clone name argument is omitted', () => {
        const ps = new ParticleSystem({scene, startLife: new ConstantValue(1), emissionOverTime: new ConstantValue(0)});
        const emitter = ps.emitter as ParticleEmitter;
        emitter.name = 'emitter-base';
        const copy = emitter.clone();
        expect(copy.name).toBe('emitter-base');
        copy.dispose();
    });
});
