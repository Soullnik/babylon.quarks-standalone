import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {ParticleSystem} from '../src/ParticleSystem';

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

function distanceSystem(options: {worldSpace?: boolean; perMeter?: number; perSecond?: number} = {}) {
    return new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        worldSpace: options.worldSpace ?? true,
        startLife: new ConstantValue(5),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(options.perSecond ?? 0),
        emissionOverDistance: new ConstantValue(options.perMeter ?? 10),
        emissionBursts: [],
        shape: new PointEmitter(),
    });
}

function moveTo(system: ParticleSystem, x: number): void {
    system.emitter.position.x = x;
    system.emitter.computeWorldMatrix(true);
}

function spawnedX(system: ParticleSystem): number[] {
    return system.particles
        .slice(0, system.particleNum)
        .map((p) => p.position.x)
        .sort((a, b) => a - b);
}

describe('emission over distance', () => {
    it('spreads the particles along the path travelled this step', () => {
        const system = distanceSystem();
        system.play();
        system.update(1 / 60);
        // In one frame the emitter jumps a whole unit: ten particles' worth.
        moveTo(system, 1);
        system.update(1 / 60);
        const xs = spawnedX(system);
        expect(xs).toHaveLength(10);
        expect(Math.min(...xs)).toBeLessThan(0.5);
        xs.forEach((x, i) => expect(x).toBeCloseTo((i + 1) / 10, 5));
    });

    it('keeps the spacing across steps, carrying the distance past the last mark', () => {
        const system = distanceSystem({perMeter: 4});
        system.play();
        system.update(1 / 60);
        // 0.3 per step against marks every 0.25: 0.25, 0.5, 0.75, 1.0, 1.25 …
        for (let i = 1; i <= 5; i++) {
            moveTo(system, 0.3 * i);
            system.update(1 / 60);
        }
        const xs = spawnedX(system);
        expect(xs).toHaveLength(6);
        xs.forEach((x, i) => expect(x).toBeCloseTo((i + 1) * 0.25, 5));
    });

    it('still spawns time-driven particles at the emitter', () => {
        const system = distanceSystem({perMeter: 0, perSecond: 60});
        system.play();
        system.update(1 / 60);
        moveTo(system, 1);
        system.update(1 / 60);
        const xs = spawnedX(system);
        expect(xs[xs.length - 1]).toBeCloseTo(1, 5);
        expect(xs.filter((x) => x > 0 && x < 1)).toHaveLength(0);
    });

    it('leaves a local-space system spawning at the emitter, which its particles follow', () => {
        const system = distanceSystem({worldSpace: false});
        system.play();
        system.update(1 / 60);
        moveTo(system, 1);
        system.update(1 / 60);
        expect(system.particleNum).toBe(10);
        // Local positions: every particle is born at the emitter's origin.
        spawnedX(system).forEach((x) => expect(x).toBeCloseTo(0, 5));
    });
});
