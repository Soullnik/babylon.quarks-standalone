import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {
    ConstantColor,
    ConstantValue,
    EmitSubParticleSystem,
    IntervalValue,
    PointEmitter,
    SubParticleEmitMode,
    Vector4,
} from 'quarks.core';
import {ParticleSystem} from '../src/ParticleSystem';
import {QuarksUtil} from '../src/QuarksUtil';

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

function run(system: ParticleSystem, seconds: number): void {
    const step = 1 / 60;
    for (let t = 0; t < seconds - 1e-9; t += step) {
        system.update(step);
    }
}

function burstSystem(options: {looping: boolean; count?: number; rate?: number}): ParticleSystem {
    return new ParticleSystem({
        scene,
        duration: 0.5,
        looping: options.looping,
        startLife: new ConstantValue(0.2),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(options.rate ?? 0),
        emissionOverDistance: new ConstantValue(0),
        emissionBursts: [
            {time: 0, count: new ConstantValue(options.count ?? 4), probability: 1, interval: 0, cycle: 1},
        ],
        shape: new PointEmitter(),
    });
}

describe('bursts after endEmit', () => {
    it('a looping system stops bursting once its emission is ended and finishes', () => {
        const system = burstSystem({looping: true});
        run(system, 0.1);
        expect(system.particleNum).toBeGreaterThan(0);
        system.endEmit();
        run(system, 1.5);
        expect(system.particleNum).toBe(0);
        expect(system.isFinished()).toBe(true);
    });

    it('stop() followed by endEmit() leaves a looping system finished, and play() replays it', () => {
        const system = burstSystem({looping: true});
        run(system, 0.3);
        system.stop();
        system.endEmit();
        expect(system.particleNum).toBe(0);
        expect(system.isFinished()).toBe(true);
        // Unity's Play on a finished system starts it over.
        system.play();
        expect(system.isEmitEnded).toBe(false);
        run(system, 0.1);
        expect(system.particleNum).toBeGreaterThan(0);
    });

    it('a burst due on the step that crosses the end of a one-shot still fires', () => {
        const system = burstSystem({looping: false});
        system.emissionBursts[0].time = 0.5;
        let peak = 0;
        for (let i = 0; i < 40; i++) {
            system.update(1 / 60);
            peak = Math.max(peak, system.particleNum);
        }
        expect(peak).toBe(4);
    });
});

describe('emissionMultiplier', () => {
    it('scales bursts above and below 1', () => {
        const strong = burstSystem({looping: false, count: 10});
        strong.emissionMultiplier = 2.5;
        strong.update(1 / 60);
        expect(strong.particleNum).toBe(25);

        const weak = burstSystem({looping: false, count: 10});
        weak.emissionMultiplier = 0.5;
        weak.update(1 / 60);
        expect(weak.particleNum).toBe(5);
    });

    it('scales emission over time and multiplies with the quality factor', () => {
        const system = burstSystem({looping: true, count: 0, rate: 100});
        system.emissionMultiplier = 2;
        system.setQualityFactor(0.5);
        run(system, 0.1);
        // 100/s for 0.1s, times 2, times 0.5: about 10.
        expect(system.particleNum).toBeGreaterThanOrEqual(9);
        expect(system.particleNum).toBeLessThanOrEqual(11);
    });
});

describe('QuarksUtil.getDuration', () => {
    it('adds start delay, duration and the longest life, over playback speed', () => {
        const root = new TransformNode('fx', scene);
        const system = burstSystem({looping: false});
        system.startDelay = new IntervalValue(0.1, 0.3);
        system.startLife = new IntervalValue(0.5, 1);
        system.emitter.parent = root;
        expect(QuarksUtil.getDuration(root)).toBeCloseTo(0.3 + 0.5 + 1);
        system.playbackSpeed = 2;
        expect(QuarksUtil.getDuration(root)).toBeCloseTo((0.3 + 0.5 + 1) / 2);
    });

    it('is Infinity for a looping effect', () => {
        const root = new TransformNode('loop', scene);
        burstSystem({looping: true}).emitter.parent = root;
        expect(QuarksUtil.getDuration(root)).toBe(Infinity);
    });

    it('a sub emitter target runs its duration and a life after its parent', () => {
        const root = new TransformNode('sub', scene);
        const parent = burstSystem({looping: false});
        const child = burstSystem({looping: false});
        child.onlyUsedByOther = true;
        child.startLife = new ConstantValue(2);
        parent.emitter.parent = root;
        child.emitter.parent = root;
        parent.addBehavior(new EmitSubParticleSystem(parent, false, child.emitter, SubParticleEmitMode.Death));
        expect(QuarksUtil.getDuration(root)).toBeCloseTo(0.5 + 0.2 + 0.5 + 2);
    });
});

describe('review fixes', () => {
    function parentWithSub(looping: boolean) {
        const root = new TransformNode('fw', scene);
        const parent = burstSystem({looping, count: 3});
        parent.startLife = new ConstantValue(0.2);
        const child = burstSystem({looping: false, count: 5});
        child.onlyUsedByOther = true;
        parent.emitter.parent = root;
        child.emitter.parent = root;
        parent.addBehavior(new EmitSubParticleSystem(parent, false, child.emitter, SubParticleEmitMode.Death));
        return {root, parent, child};
    }

    it('sub emitter bursts still go off for particles dying after endEmit', () => {
        const {root, parent, child} = parentWithSub(true);
        parent.update(1 / 60);
        expect(parent.particleNum).toBe(3);
        QuarksUtil.endEmit(root);
        let peak = 0;
        for (let i = 0; i < 40; i++) {
            parent.update(1 / 60);
            child.update(1 / 60);
            peak = Math.max(peak, child.particleNum);
        }
        expect(peak).toBe(15);
    });

    it('getDuration follows a sub emitter target outside the root, and a frozen system never ends', () => {
        const {root, parent, child} = parentWithSub(false);
        child.emitter.parent = null;
        child.startLife = new ConstantValue(5);
        expect(QuarksUtil.getDuration(root)).toBeCloseTo(0.5 + 0.2 + 0.5 + 5);
        parent.playbackSpeed = 0;
        expect(QuarksUtil.getDuration(root)).toBe(Infinity);
    });
});
