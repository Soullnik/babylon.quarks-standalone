import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {ConstantValue, PointEmitter} from 'quarks.core';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import {RenderMode} from '../src/VFXBatch';
import {
    MAX_CATCH_UP_SECONDS,
    MAX_FRAME_SECONDS,
    MAX_STEPS_PER_FRAME,
    SIMULATION_STEP,
    SimulationClock,
} from '../src/system/SimulationClock';

describe('SimulationClock', () => {
    it('runs one step per 60 Hz frame and keeps the residual near zero', () => {
        const clock = new SimulationClock();
        let steps = 0;
        for (let i = 0; i < 600; i++) {
            steps += clock.accrue(1 / 60);
            expect(Math.abs(clock.residual)).toBeLessThan(1e-9);
        }
        expect(steps).toBe(600);
    });

    it('runs a step every other frame at exactly 120 Hz', () => {
        const clock = new SimulationClock();
        const pattern = Array.from({length: 6}, () => clock.accrue(1 / 120));
        expect(pattern).toEqual([0, 1, 0, 1, 0, 1]);
    });

    it('rounds to the nearest step, so a frame just short of one still runs it', () => {
        const clock = new SimulationClock();
        expect(clock.accrue(SIMULATION_STEP * 0.9)).toBe(1);
        expect(clock.residual).toBeCloseTo(-SIMULATION_STEP * 0.1, 12);
        expect(clock.accrue(SIMULATION_STEP * 0.4)).toBe(0);
    });

    it('caps the steps of one frame and drops the time it could not simulate', () => {
        const clock = new SimulationClock();
        expect(clock.accrue(1)).toBe(MAX_STEPS_PER_FRAME);
        expect(clock.residual).toBe(SIMULATION_STEP);
        clock.reset();
        expect(clock.residual).toBe(0);
    });

    it('raises the step cap with the playback speed', () => {
        const clock = new SimulationClock();
        expect(clock.accrue(1, 10)).toBe(60);
        expect(clock.accrue(2, 10)).toBe(MAX_STEPS_PER_FRAME * 10);
        expect(clock.accrue(1, 0.5)).toBe(MAX_STEPS_PER_FRAME);
    });

    it('clamps the host frame before scaling it by the playback speed', () => {
        expect(SimulationClock.frameSeconds(1 / 60, 10)).toBeCloseTo(1 / 6, 12);
        expect(SimulationClock.frameSeconds(5, 10)).toBe(MAX_FRAME_SECONDS * 10);
        expect(SimulationClock.frameSeconds(5, 0)).toBe(0);
        expect(SimulationClock.frameSeconds(NaN, 1)).toBe(0);
        expect(SimulationClock.frameSeconds(-1, 1)).toBe(0);
    });

    it('takes the steps off the clock before they run, so a dropped step is not carried', () => {
        const clock = new SimulationClock();
        const steps = clock.accrue(3 * SIMULATION_STEP);
        expect(steps).toBe(3);
        // Whether the caller runs 1 or 3 of them, the residual is the same.
        expect(clock.residual).toBeCloseTo(0, 12);
    });

    it('waits out the start delay and carries the rest of the frame that ends it', () => {
        const clock = new SimulationClock();
        clock.setStartDelay(0.25);
        expect(clock.delaying).toBe(true);
        expect(clock.consumeStartDelay(0.1)).toBe(0);
        expect(clock.consumeStartDelay(0.1)).toBe(0);
        expect(clock.consumeStartDelay(0.1)).toBeCloseTo(0.05, 12);
        expect(clock.delaying).toBe(false);
        expect(clock.consumeStartDelay(0.1)).toBe(0.1);
    });

    it('ends a delay with at most one frame of time, and ignores a negative or NaN delay', () => {
        const clock = new SimulationClock();
        clock.setStartDelay(0.05);
        expect(clock.consumeStartDelay(1)).toBe(MAX_FRAME_SECONDS);
        clock.setStartDelay(-1);
        expect(clock.delaying).toBe(false);
        clock.setStartDelay(NaN);
        expect(clock.delaying).toBe(false);
    });

    it('owes whole steps for time spent culled, up to the cap', () => {
        const clock = new SimulationClock();
        clock.deferCatchUp(0.5);
        clock.deferCatchUp(5);
        expect(clock.owesCatchUp).toBe(true);
        expect(clock.takeCatchUpSteps()).toBe(MAX_CATCH_UP_SECONDS * 60);
        expect(clock.owesCatchUp).toBe(false);
        clock.deferCatchUp(SIMULATION_STEP / 2);
        expect(clock.takeCatchUpSteps()).toBe(0);
        clock.deferCatchUp(1);
        clock.reset();
        expect(clock.owesCatchUp).toBe(false);
    });
});

describe('the clock in a particle system', () => {
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

    function system(parameters: Partial<ParticleSystemParameters> = {}): ParticleSystem {
        return new ParticleSystem({
            scene,
            looping: false,
            duration: 1,
            startLife: new ConstantValue(0.5),
            startSpeed: new ConstantValue(0),
            emissionOverTime: new ConstantValue(60),
            shape: new PointEmitter(),
            ...parameters,
        });
    }

    it('reads an invalid playback speed as 0, and an invalid duration as one step', () => {
        const ps = system({playbackSpeed: -1, duration: 0});
        expect(ps.playbackSpeed).toBe(0);
        expect(ps.duration).toBe(SIMULATION_STEP);
        ps.playbackSpeed = NaN;
        expect(ps.playbackSpeed).toBe(0);
        ps.playbackSpeed = Infinity;
        expect(ps.playbackSpeed).toBe(0);
        ps.duration = NaN;
        expect(ps.duration).toBe(SIMULATION_STEP);
        ps.duration = 3;
        expect(ps.duration).toBe(3);
        ps.dispose();
    });

    it('does not run backwards at a negative playback speed', () => {
        const ps = system({playbackSpeed: -1, looping: true});
        for (let i = 0; i < 120; i++) ps.update(1 / 60);
        expect(ps.particleNum).toBe(0);
        ps.playbackSpeed = 1;
        for (let i = 0; i < 6; i++) ps.update(1 / 60);
        expect(ps.particleNum).toBe(6);
        ps.dispose();
    });

    it('advances ten seconds per second at playback speed 10', () => {
        const ps = system({playbackSpeed: 10, looping: true, startLife: new ConstantValue(100)});
        for (let i = 0; i < 60; i++) ps.update(1 / 60);
        expect(ps.particleNum).toBe(600);
        expect(ps.particles[0].age).toBeCloseTo(10, 6);
        ps.dispose();
    });

    it('validates the culling mode and the particle cap in the constructor', () => {
        const ps = system({cullingMode: 'bogus' as never, maxParticles: -5});
        expect(ps.cullingMode).toBe('always');
        expect(ps.maxParticles).toBeUndefined();
        const capped = system({maxParticles: 2.7});
        expect(capped.maxParticles).toBe(2);
        ps.dispose();
        capped.dispose();
    });

    it('a system with a zero duration fires its bursts and finishes', () => {
        const ps = system({
            duration: 0,
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(5), cycle: 1, interval: 0, probability: 1}],
        });
        ps.update(1 / 60);
        expect(ps.particleNum).toBe(5);
        for (let i = 0; i < 60; i++) ps.update(1 / 60);
        expect(ps.isFinished()).toBe(true);
        ps.dispose();
    });

    it('stops simulating in the frame a finished listener stops the system', () => {
        const ps = system({duration: 0.2, startLife: new ConstantValue(0.1)});
        let fired = 0;
        ps.addEventListener('finished', () => {
            fired++;
            ps.stop();
        });
        for (let i = 0; i < 30; i++) ps.update(0.1);
        expect(fired).toBe(1);
        expect(ps.particleNum).toBe(0);
        expect(ps.paused).toBe(true);
        ps.dispose();
    });

    it('stops simulating in the frame a listener pauses the system', () => {
        const ps = system({looping: true});
        const stepped = jest.spyOn(ps as never, 'simulateStep' as never);
        ps.addEventListener('particleDied', () => ps.pause());
        for (let i = 0; i < 6; i++) ps.update(0.1);
        // The first death comes in the 31st step; nothing after it.
        expect(ps.paused).toBe(true);
        expect(stepped).toHaveBeenCalledTimes(31);
        expect(ps.particleNum).toBe(30);
        ps.dispose();
    });

    it('stops simulating in the frame the destroy stop action disposes the system', () => {
        const ps = system({stopAction: 'destroy', duration: 0.2, startLife: new ConstantValue(0.1)});
        const stepped = jest.spyOn(ps as never, 'simulateStep' as never);
        let stepsAtDestroy = -1;
        ps.addEventListener('destroy', () => (stepsAtDestroy = stepped.mock.calls.length));
        for (let i = 0; i < 30; i++) ps.update(0.1);
        // The step that disposed it was the last one, in a frame of 6.
        expect(stepsAtDestroy).toBeGreaterThan(12);
        expect(stepsAtDestroy % 6).not.toBe(0);
        expect(stepped).toHaveBeenCalledTimes(stepsAtDestroy);
    });

    it('reports a trail particle dying once its ribbon has faded', () => {
        const ps = system({
            renderMode: RenderMode.Trail,
            duration: 0.1,
            startLife: new ConstantValue(0.1),
            emissionOverTime: new ConstantValue(60),
            rendererEmitterSettings: {startLength: new ConstantValue(3)},
        });
        let died = 0;
        let born = 0;
        let live = 0;
        ps.addEventListener('particleDied', () => died++);
        for (let i = 0; i < 60; i++) {
            const diedBefore = died;
            ps.update(1 / 60);
            born += ps.particleNum - (live - (died - diedBefore));
            live = ps.particleNum;
        }
        expect(born).toBeGreaterThan(0);
        expect(died).toBe(born);
        expect(ps.particleNum).toBe(0);
        ps.dispose();
    });

    it('stops simulating in the frame a particleDied listener disposes the system', () => {
        const ps = system({duration: 0.2, startLife: new ConstantValue(0.1)});
        let died = 0;
        ps.addEventListener('particleDied', () => {
            died++;
            ps.dispose();
        });
        for (let i = 0; i < 30; i++) ps.update(0.1);
        expect(died).toBe(1);
        expect(ps.particleNum).toBe(0);
    });

    it('stops a catch-up in the frame a listener stops the system', () => {
        const ps = system({cullingMode: 'pauseAndCatchUp', duration: 0.2, startLife: new ConstantValue(0.1)});
        let fired = 0;
        ps.addEventListener('finished', () => {
            fired++;
            ps.stop();
        });
        ps.culled = true;
        for (let i = 0; i < 10; i++) ps.update(0.1);
        ps.culled = false;
        ps.update(1 / 60, Infinity, Infinity);
        expect(fired).toBe(1);
        expect(ps.particleNum).toBe(0);
        ps.dispose();
    });

    it('prewarms to the steady state in whole steps, without a frame clamp', () => {
        const ps = system({looping: true, prewarm: true, duration: 2, startLife: new ConstantValue(0.5)});
        ps.update(1 / 60);
        // One particle per step over the last 0.5 s of the cycle: the steady state from the first frame.
        expect(ps.particleNum).toBe(30);
        // The cycle wraps on the step after it ends, as it always has.
        expect(ps.time).toBeCloseTo(ps.duration + SIMULATION_STEP, 6);
        ps.dispose();
    });

    it('prewarms a whole cycle whatever the playback speed', () => {
        for (const playbackSpeed of [0, 0.5, 2]) {
            const ps = system({looping: true, prewarm: true, duration: 2, playbackSpeed});
            ps.update(1 / 60);
            expect([playbackSpeed, ps.particleNum]).toEqual([playbackSpeed, 30]);
            ps.dispose();
        }
    });

    it('fires the waves of an earlier burst that fall inside a partial prewarm', () => {
        const was = ParticleSystem.maxPrewarmSeconds;
        ParticleSystem.maxPrewarmSeconds = 10;
        try {
            const ps = system({
                looping: true,
                prewarm: true,
                duration: 30,
                startLife: new ConstantValue(100),
                emissionOverTime: new ConstantValue(0),
                emissionBursts: [{time: 5, count: new ConstantValue(1), cycle: 20, interval: 1, probability: 1}],
            });
            ps.update(1 / 60);
            // Waves at 5..24 s; the warm-up covers 20..30 s, so waves 15..19 (at 20..24 s) fire.
            expect(ps.particleNum).toBe(5);
            ps.dispose();
        } finally {
            ParticleSystem.maxPrewarmSeconds = was;
        }
    });

    it('prewarms a long cycle over its last part only, skipping the bursts before it', () => {
        const was = ParticleSystem.maxPrewarmSeconds;
        ParticleSystem.maxPrewarmSeconds = 1;
        try {
            const ps = system({
                looping: true,
                prewarm: true,
                duration: 30,
                startLife: new ConstantValue(100),
                emissionOverTime: new ConstantValue(0),
                emissionBursts: [
                    {time: 5, count: new ConstantValue(1000), cycle: 1, interval: 0, probability: 1},
                    {time: 29.5, count: new ConstantValue(7), cycle: 1, interval: 0, probability: 1},
                ],
            });
            const stepped = jest.spyOn(ps as never, 'simulateStep' as never);
            ps.update(1 / 60);
            expect(stepped).toHaveBeenCalledTimes(61);
            expect(ps.particleNum).toBe(7);
            expect(ps.time).toBeCloseTo(ps.duration + SIMULATION_STEP, 6);
            ps.dispose();
        } finally {
            ParticleSystem.maxPrewarmSeconds = was;
        }
    });

    it('prewarms while culled, when the system first comes into view', () => {
        const ps = system({looping: true, prewarm: true, duration: 2, cullingMode: 'pause'});
        ps.culled = true;
        ps.update(1 / 60);
        expect(ps.particleNum).toBe(0);
        ps.culled = false;
        ps.update(1 / 60);
        expect(ps.particleNum).toBe(30);
        ps.dispose();
    });
});
