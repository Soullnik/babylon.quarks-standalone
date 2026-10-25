import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {ConstantValue, EulerGenerator, Matrix4} from 'quarks.core';
import {ParticleSystem} from '../src/ParticleSystem';
import {QuarksUtil} from '../src/QuarksUtil';

/**
 * The 0.30 surface: what the API freeze removed stays removed, and what it made read-only cannot
 * be written. The API report (`npm run api:check`) guards the types; this guards the runtime.
 */
let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
});

afterEach(() => {
    scene.dispose();
    engine.dispose();
});

describe('API surface', () => {
    it('has no deprecated aliases left', () => {
        const ps = new ParticleSystem({scene});
        expect('autoDestroy' in ps).toBe(false);
        expect('setAutoDestroy' in QuarksUtil).toBe(false);
        const euler = new EulerGenerator(new ConstantValue(0), new ConstantValue(0), new ConstantValue(0));
        expect('eular' in euler).toBe(false);
        for (const name of ['extractPosition', 'multiplyToArray', 'setRotationFromQuaternion']) {
            expect(name in new Matrix4()).toBe(false);
        }
        ps.dispose();
    });

    it('counts live particles behind a read-only particleNum', () => {
        const descriptor = Object.getOwnPropertyDescriptor(ParticleSystem.prototype, 'particleNum');
        expect(descriptor?.get).toBeDefined();
        expect(descriptor?.set).toBeUndefined();
        const ps = new ParticleSystem({
            scene,
            emissionOverTime: new ConstantValue(30),
            startLife: new ConstantValue(5),
        });
        ps.update(0.1);
        expect(ps.particleNum).toBe(3);
        expect(ps.particles.length).toBeGreaterThanOrEqual(3);
        ps.dispose();
    });
});
