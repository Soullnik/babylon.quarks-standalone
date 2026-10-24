import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {
    ColorOverLife,
    ConstantColor,
    ConstantValue,
    EmitSubParticleSystem,
    Gradient,
    IntervalValue,
    PointEmitter,
    SubParticleEmitMode,
    Vector2,
    Vector3,
    Vector4,
} from 'quarks.core';
import {ParticleEmitter} from '../src/ParticleEmitter';
import {ParticleSystem} from '../src/ParticleSystem';
import {QuarksLoader} from '../src/QuarksLoader';
import {serializeEffect} from '../src/QuarksSerializer';
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

    it('takes a stop action over an old autoDestroy false beside it', () => {
        const json = {...system({stopAction: 'disable'}).toJSON(metaData()), autoDestroy: false};
        const read = ParticleSystem.fromJSON(json as never, metaData() as never, {}, scene);
        expect(read.stopAction).toBe('disable');
        read.dispose();
    });

    it('round-trips the stop action and the ring buffer through serializeEffect and QuarksLoader', () => {
        const ps = system({
            stopAction: 'destroy',
            maxParticles: 8,
            ringBufferMode: 'loopUntilReplaced',
            ringBufferLoopRange: new Vector2(0.25, 0.75),
        });
        const json = JSON.parse(JSON.stringify(serializeEffect(ps.emitter)));
        const loaded = new QuarksLoader(scene).parse(json);
        const systems: ParticleSystem[] = [];
        QuarksUtil.runOnAllParticleEmitters(loaded, (e: ParticleEmitter) => systems.push(e.system as ParticleSystem));
        expect(systems).toHaveLength(1);
        const read = systems[0];
        expect(read.stopAction).toBe('destroy');
        expect(read.ringBufferMode).toBe('loopUntilReplaced');
        expect([read.ringBufferLoopRange.x, read.ringBufferLoopRange.y]).toEqual([0.25, 0.75]);
        expect(read.maxParticles).toBe(8);
        loaded.dispose();
        ps.dispose();
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

/** A parent whose particles each start `mode` sub emissions of a three-particle burst into a child. */
function withSubEmitter(mode: SubParticleEmitMode, parentParameters = {}, childParameters = {}) {
    const parent = system({
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(10), cycle: 1, interval: 0, probability: 1}],
        ...parentParameters,
    });
    const child = system({
        duration: 0.05,
        startLife: new ConstantValue(1),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(3), cycle: 1, interval: 0, probability: 1}],
        ...childParameters,
    });
    // As the editor and Unity exports lay a sub emitter out: under its parent.
    child.emitter.parent = parent.emitter;
    parent.addBehavior(new EmitSubParticleSystem(parent, false, child.emitter, mode));
    const step = () => {
        parent.update(STEP);
        child.update(STEP);
    };
    return {parent, child, step};
}

describe('stopAction with sub emitters', () => {
    it.each(['disable', 'destroy'] as const)('is not taken by a sub emitter target (%s)', (action) => {
        const {parent, child, step} = withSubEmitter(
            SubParticleEmitMode.Death,
            {stopAction: 'none'},
            {stopAction: action}
        );
        // Empty before the parent's first death: finished, yet its parent owns its life.
        for (let i = 0; i < 10; i++) step();
        expect(child.isDisposed).toBe(false);
        expect(child.emitter.isEnabled()).toBe(true);
        for (let i = 0; i < 30; i++) step();
        expect(child.particleNum).toBe(30);
        parent.dispose();
        child.dispose();
    });

    it('emits the Death burst of every particle, those dying on the last step included', () => {
        const {parent, child, step} = withSubEmitter(SubParticleEmitMode.Death);
        let deaths = 0;
        parent.addEventListener('particleDied', () => deaths++);
        let finishedWithPending = false;
        parent.addEventListener('finished', () => (finishedWithPending = child.particleNum < 30));
        for (let i = 0; i < 60; i++) step();
        expect(deaths).toBe(10);
        expect(child.particleNum).toBe(30);
        expect(finishedWithPending).toBe(false);
        parent.dispose();
        child.dispose();
    });

    it.each(['disable', 'destroy'] as const)("waits for the sub emitters' particles before it runs (%s)", (action) => {
        const {parent, child, step} = withSubEmitter(SubParticleEmitMode.Death, {stopAction: action});
        let finished = 0;
        parent.addEventListener('finished', () => finished++);
        for (let i = 0; i < 45; i++) step();
        // The parent is done; its sub emitter's particles have most of their life left.
        expect(finished).toBe(1);
        expect(parent.isAlive(false)).toBe(false);
        expect(parent.isAlive()).toBe(true);
        expect(child.particleNum).toBe(30);
        expect(parent.isDisposed).toBe(false);
        expect(parent.emitter.isEnabled()).toBe(true);
        for (let i = 0; i < 60; i++) step();
        expect(child.particleNum).toBe(0);
        expect(parent.isAlive()).toBe(false);
        expect(finished).toBe(1);
        if (action === 'disable') {
            expect(parent.emitter.isEnabled()).toBe(false);
            parent.dispose();
        } else {
            expect(parent.isDisposed).toBe(true);
        }
        child.dispose();
    });
});

describe('ringBufferMode at the edges', () => {
    const ring = (extra = {}) =>
        system({
            looping: true,
            duration: 1,
            maxParticles: 7,
            ringBufferMode: 'pauseUntilReplaced',
            startLife: new ConstantValue(1000),
            startSpeed: new ConstantValue(0),
            ...extra,
        });

    /** Steps `ps` `steps` times, counting the steps that replaced a particle younger than one kept. */
    function oldestFirstViolations(ps: ParticleSystem, steps: number): number {
        let violations = 0;
        for (let i = 0; i < steps; i++) {
            const before = ps.particles.slice(0, ps.particleNum).map((p) => [p, p.serial, p.age] as const);
            ps.update(STEP);
            const replaced = before.filter(([p, serial]) => p.serial !== serial);
            const kept = before.filter(([p, serial]) => p.serial === serial);
            if (replaced.length > 0 && kept.length > 0) {
                const youngestReplaced = Math.min(...replaced.map(([, , age]) => age));
                const oldestKept = Math.max(...kept.map(([, , age]) => age));
                if (youngestReplaced < oldestKept - 1e-9) violations++;
            }
        }
        return violations;
    }

    it('replaces oldest first across wraps, with a varying count, and after the limit is raised', () => {
        const ps = ring({emissionOverTime: new IntervalValue(0, 300)});
        expect(oldestFirstViolations(ps, 600)).toBe(0);
        // Full and wrapped at a steady rate, then given room.
        ps.emissionOverTime = new ConstantValue(60);
        expect(oldestFirstViolations(ps, 60)).toBe(0);
        ps.maxParticles = 10;
        expect(oldestFirstViolations(ps, 300)).toBe(0);
        expect(ps.particleNum).toBe(10);
        ps.dispose();
    });

    it('drops the oldest particles over a lowered limit, and keeps replacing oldest first', () => {
        const ps = ring({emissionOverTime: new ConstantValue(60)});
        run(ps, 1);
        expect(ps.particleNum).toBe(7);
        const newest = ps.particles
            .slice(0, 7)
            .sort((a, b) => a.age - b.age)
            .slice(0, 4);
        ps.maxParticles = 4;
        // The step drops the three oldest first, then the newborn replaces the oldest kept.
        ps.update(STEP);
        expect(ps.particleNum).toBe(4);
        const kept = ps.particles.slice(0, 4);
        expect(newest.slice(0, 3).every((p) => kept.includes(p))).toBe(true);
        expect(oldestFirstViolations(ps, 120)).toBe(0);
        ps.dispose();
    });

    it.each(['pauseUntilReplaced', 'loopUntilReplaced'] as const)('fires no Death sub emitter (%s)', (mode) => {
        const {parent, child, step} = withSubEmitter(SubParticleEmitMode.Death, {
            maxParticles: 10,
            ringBufferMode: mode,
        });
        for (let i = 0; i < 300; i++) step();
        expect(parent.particleNum).toBe(10);
        expect(child.particleNum).toBe(0);
        parent.dispose();
        child.dispose();
    });

    it('fires Birth once per particle, over many loops and with a loop range starting at 0', () => {
        const {parent, child, step} = withSubEmitter(
            SubParticleEmitMode.Birth,
            {maxParticles: 10, ringBufferMode: 'loopUntilReplaced', startLife: new ConstantValue(0.1)},
            {startLife: new ConstantValue(100)}
        );
        for (let i = 0; i < 300; i++) step();
        expect(child.particleNum).toBe(30);
        parent.dispose();
        child.dispose();
    });

    it('holds a particle still at a loop range of no length, and fires Birth once', () => {
        for (const point of [0, 0.5]) {
            const {parent, child, step} = withSubEmitter(
                SubParticleEmitMode.Birth,
                {
                    maxParticles: 10,
                    ringBufferMode: 'loopUntilReplaced',
                    ringBufferLoopRange: new Vector2(point, point),
                },
                {startLife: new ConstantValue(100)}
            );
            for (let i = 0; i < 60; i++) step();
            const particle = parent.particles[0];
            const age = particle.age;
            const at = particle.position.clone();
            for (let i = 0; i < 60; i++) step();
            expect(particle.age).toBe(age);
            expect(age / particle.life).toBeCloseTo(point, 4);
            expect(particle.position.equals(at)).toBe(true);
            expect(child.particleNum).toBe(30);
            parent.dispose();
            child.dispose();
        }
    });

    it('reads an assigned loop range clamped into 0..1 and in order', () => {
        const ps = system({
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
            maxParticles: 1,
            ringBufferMode: 'loopUntilReplaced',
        });
        ps.ringBufferLoopRange = new Vector2(0.8, 0.2);
        const seen: number[] = [];
        for (let i = 0; i < 180; i++) {
            ps.update(STEP);
            seen.push(ps.particles[0].age / ps.particles[0].life);
        }
        const later = seen.slice(60);
        expect(Math.min(...later)).toBeGreaterThanOrEqual(0.2 - 1e-6);
        expect(Math.max(...later)).toBeLessThan(0.8);
        ps.ringBufferLoopRange = new Vector2(0, 2);
        for (let i = 0; i < 120; i++) {
            ps.update(STEP);
            expect(ps.particles[0].age).toBeLessThan(ps.particles[0].life);
        }
        ps.dispose();
    });

    it.each([
        ['mesh', RenderMode.Mesh],
        ['stretched', RenderMode.StretchedBillBoard],
        ['beam', RenderMode.Beam],
    ])('applies in the %s render mode', (_name, renderMode) => {
        const ps = ring({renderMode, maxParticles: 4, emissionOverTime: new ConstantValue(60)});
        expect(ps.ringBufferActive).toBe(true);
        run(ps, 1);
        expect(ps.particleNum).toBe(4);
        expect(ps.particles.slice(0, 4).every((p) => p.age < 0.1)).toBe(true);
        ps.dispose();
    });
});
