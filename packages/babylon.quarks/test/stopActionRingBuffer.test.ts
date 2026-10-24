import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {
    ColorOverLife,
    ConstantColor,
    ConstantValue,
    Gradient,
    PointEmitter,
    Vector2,
    Vector3,
    Vector4,
} from 'quarks.core';
import {ParticleSystem} from '../src/ParticleSystem';
import {QuarksUtil} from '../src/QuarksUtil';
import {RenderMode} from '../src/VFXBatch';

/**
 * Unity's Stop Action (what a finished system does) and Ring Buffer Mode (what a full system does
 * with new particles).
 */
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

const STEP = 1 / 60;

function system(parameters: Partial<ConstructorParameters<typeof ParticleSystem>[0]> = {}): ParticleSystem {
    return new ParticleSystem({
        scene,
        duration: 0.5,
        looping: false,
        worldSpace: false,
        startLife: new ConstantValue(0.5),
        startSpeed: new ConstantValue(1),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(20),
        emissionBursts: [],
        shape: new PointEmitter(),
        ...parameters,
    });
}

function run(ps: ParticleSystem, seconds: number): void {
    for (let t = 0; t < seconds - 1e-9; t += STEP) {
        ps.update(STEP);
    }
}

const metaData = () => ({geometries: {}, materials: {}, textures: {}});

describe('stopAction', () => {
    it('does nothing with none, the default', () => {
        const ps = system();
        expect(ps.stopAction).toBe('none');
        run(ps, 1.5);
        expect(ps.isFinished()).toBe(true);
        expect(ps.emitter.isEnabled()).toBe(true);
        expect(ps.emitter.isDisposed()).toBe(false);
        ps.dispose();
    });

    it('disables the emitter once when it finishes, and leaves it enabled again', () => {
        const ps = system({stopAction: 'disable'});
        const finished = jest.fn();
        ps.addEventListener('finished', finished);
        run(ps, 1.5);
        expect(finished).toHaveBeenCalledTimes(1);
        expect(ps.emitter.isEnabled()).toBe(false);
        ps.emitter.setEnabled(true);
        run(ps, 0.5);
        expect(ps.emitter.isEnabled()).toBe(true);
        // A replay finishes again and disables it again.
        ps.restart();
        run(ps, 1.5);
        expect(ps.emitter.isEnabled()).toBe(false);
        ps.dispose();
    });

    it('disposes the system and its emitter with destroy', () => {
        const ps = system({stopAction: 'destroy'});
        run(ps, 1.5);
        expect(ps.emitter.isDisposed()).toBe(true);
    });

    it('reads the old autoDestroy as destroy, in code and in files', () => {
        const coded = system({autoDestroy: true});
        expect(coded.stopAction).toBe('destroy');
        expect(coded.autoDestroy).toBe(true);
        coded.autoDestroy = false;
        expect(coded.stopAction).toBe('none');
        coded.stopAction = 'disable';
        coded.autoDestroy = false;
        expect(coded.stopAction).toBe('disable');
        coded.dispose();

        const json = {...system().toJSON(metaData()), autoDestroy: true};
        const read = ParticleSystem.fromJSON(json as never, metaData() as never, {}, scene);
        expect(read.stopAction).toBe('destroy');
        read.dispose();
    });

    it('writes the stop action only when not none, reads it back, clones it and drops an unknown one', () => {
        const ps = system({stopAction: 'disable'});
        const json = ps.toJSON(metaData());
        expect(json.stopAction).toBe('disable');
        expect(json).not.toHaveProperty('autoDestroy');
        expect(system().toJSON(metaData())).not.toHaveProperty('stopAction');
        const read = ParticleSystem.fromJSON(json, metaData() as never, {}, scene);
        expect(read.stopAction).toBe('disable');
        const copy = ps.clone();
        expect(copy.stopAction).toBe('disable');
        expect(system({stopAction: 'explode' as never}).stopAction).toBe('none');
        for (const s of [ps, read, copy]) s.dispose();
    });

    it('is skipped while ignoreStopAction is set, which is not saved or cloned', () => {
        const ps = system({stopAction: 'destroy'});
        ps.ignoreStopAction = true;
        const finished = jest.fn();
        ps.addEventListener('finished', finished);
        run(ps, 1.5);
        expect(finished).toHaveBeenCalledTimes(1);
        expect(ps.emitter.isDisposed()).toBe(false);
        expect(ps.toJSON(metaData()).stopAction).toBe('destroy');
        expect(ps.clone().ignoreStopAction).toBe(false);
        ps.dispose();
    });

    it('is set on every system under a root by QuarksUtil', () => {
        const ps = system();
        QuarksUtil.setStopAction(ps.emitter, 'destroy');
        expect(ps.stopAction).toBe('destroy');
        ps.dispose();
    });
});

/** The ages of the live particles of `ps`, row by row. */
const ages = (ps: ParticleSystem) => ps.particles.slice(0, ps.particleNum).map((p) => p.age);

describe('ringBufferMode', () => {
    const ringSystem = (mode: 'pauseUntilReplaced' | 'loopUntilReplaced', extra = {}) =>
        system({
            looping: true,
            duration: 1,
            maxParticles: 4,
            ringBufferMode: mode,
            emissionOverTime: new ConstantValue(4),
            ...extra,
        });

    it('is disabled by default: a full system drops new particles and old ones die', () => {
        const ps = system({looping: true, maxParticles: 4, emissionOverTime: new ConstantValue(60)});
        expect(ps.ringBufferMode).toBe('disabled');
        run(ps, 0.3);
        expect(ps.particleNum).toBe(4);
        run(ps, 1);
        expect(ages(ps).every((age) => age < 0.5)).toBe(true);
        ps.dispose();
    });

    it('pauses particles at the end of their life, frozen, until the oldest is replaced', () => {
        const ps = ringSystem('pauseUntilReplaced');
        // Four particles a second, life 0.5: the first ones reach their end before the buffer is full.
        run(ps, 0.9);
        const first = ps.particles[0];
        expect(first.age).toBeCloseTo(0.5, 6);
        const frozenAt = first.position.clone();
        run(ps, 0.05);
        expect(first.position.x).toBe(frozenAt.x);
        expect(first.position.y).toBe(frozenAt.y);
        expect(first.position.z).toBe(frozenAt.z);
        expect(ps.particleNum).toBeLessThanOrEqual(4);
        // Full: the next one replaces the oldest, row 0, and the cursor walks on.
        run(ps, 0.4);
        expect(ps.particleNum).toBe(4);
        expect(ps.particles[0].age).toBeLessThan(0.5);
        ps.dispose();
    });

    it('never kills by age, so the system keeps its particles once its emission ends', () => {
        const ps = ringSystem('pauseUntilReplaced');
        run(ps, 2);
        ps.endEmit();
        run(ps, 3);
        expect(ps.particleNum).toBe(4);
        expect(ps.isFinished()).toBe(false);
        ps.dispose();
    });

    it('replaces the oldest particle first', () => {
        const ps = ringSystem('pauseUntilReplaced', {startLife: new ConstantValue(100)});
        run(ps, 1.05);
        expect(ps.particleNum).toBe(4);
        const before = ages(ps);
        const oldest = before.indexOf(Math.max(...before));
        run(ps, 0.25);
        const after = ages(ps);
        expect(after[oldest]).toBeLessThan(0.25 + 1e-6);
        ps.dispose();
    });

    it('loops a particle over its loop range until it is replaced', () => {
        const ps = ringSystem('loopUntilReplaced', {
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
            looping: false,
            ringBufferLoopRange: new Vector2(0.5, 0.8),
        });
        const seen: number[] = [];
        for (let i = 0; i < 120; i++) {
            ps.update(STEP);
            seen.push(ps.particles[0].age / ps.particles[0].life);
        }
        expect(ps.particleNum).toBe(1);
        const later = seen.slice(60);
        expect(Math.min(...later)).toBeGreaterThanOrEqual(0.5 - 1e-6);
        expect(Math.max(...later)).toBeLessThan(0.8);
        ps.dispose();
    });

    it('is ignored without maxParticles, and in the trail render mode', () => {
        const unlimited = system({looping: true, ringBufferMode: 'pauseUntilReplaced'});
        run(unlimited, 2);
        expect(ages(unlimited).every((age) => age < 0.5)).toBe(true);
        unlimited.dispose();

        // Trail particles die at the end of their life, ring buffer or not.
        const trail = system({
            looping: true,
            maxParticles: 4,
            ringBufferMode: 'pauseUntilReplaced',
            renderMode: RenderMode.Trail,
        });
        run(trail, 1);
        expect(trail.particleNum).toBeGreaterThan(0);
        trail.endEmit();
        run(trail, 5);
        expect(trail.particleNum).toBe(0);
        trail.dispose();
    });

    it('keeps a frozen colour from the behaviors, without running them past the end', () => {
        const ps = ringSystem('pauseUntilReplaced', {
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
            looping: false,
        });
        ps.addBehavior(
            new ColorOverLife(
                new Gradient(
                    [
                        [new Vector3(1, 1, 1), 0],
                        [new Vector3(1, 1, 1), 1],
                    ],
                    [
                        [1, 0],
                        [0.2, 1],
                    ]
                )
            )
        );
        run(ps, 2);
        expect(ps.particleNum).toBe(1);
        expect(ps.particles[0].color.w).toBeGreaterThan(0.2);
        expect(ps.particles[0].color.w).toBeLessThan(0.3);
        ps.dispose();
    });

    it('writes its mode and loop range only when set, clamps the range, and round-trips and clones', () => {
        const ps = ringSystem('loopUntilReplaced', {ringBufferLoopRange: new Vector2(0.9, 0.2)});
        expect(ps.ringBufferLoopRange.x).toBe(0.2);
        expect(ps.ringBufferLoopRange.y).toBe(0.9);
        expect(system({ringBufferLoopRange: new Vector2(-1, 5)}).ringBufferLoopRange).toEqual(new Vector2(0, 1));
        const json = ps.toJSON(metaData());
        expect(json.ringBufferMode).toBe('loopUntilReplaced');
        expect(json.ringBufferLoopRange).toEqual([0.2, 0.9]);
        const plain = system().toJSON(metaData());
        expect(plain).not.toHaveProperty('ringBufferMode');
        expect(plain).not.toHaveProperty('ringBufferLoopRange');
        const read = ParticleSystem.fromJSON(json, metaData() as never, {}, scene);
        expect(read.ringBufferMode).toBe('loopUntilReplaced');
        expect(read.ringBufferLoopRange).toEqual(new Vector2(0.2, 0.9));
        const copy = ps.clone();
        expect(copy.ringBufferLoopRange).toEqual(ps.ringBufferLoopRange);
        expect(copy.ringBufferLoopRange).not.toBe(ps.ringBufferLoopRange);
        expect(system({ringBufferMode: 'forever' as never}).ringBufferMode).toBe('disabled');
        for (const s of [ps, read, copy]) s.dispose();
    });
});
