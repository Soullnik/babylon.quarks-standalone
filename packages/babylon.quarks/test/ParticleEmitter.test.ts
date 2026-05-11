import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
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
});
