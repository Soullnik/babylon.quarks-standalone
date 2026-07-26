import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Behavior, ConstantColor, ConstantValue, Particle, PointEmitter, Vector4} from 'quarks.core';
import {ParticleSystem} from '../src/ParticleSystem';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {RenderMode} from '../src/VFXBatch';

/**
 * An emitter whose rate times lifetime is a whole number holds that many
 * particles — one a second living a second holds one. It is the knife edge, and
 * the black hole demo's beam and ring layers sit on it.
 *
 * A particle emitted by a step has not lived through that step. Ageing it anyway
 * ends its life one step before the emitter refills, so the count drops to zero
 * for exactly one frame, once per period. At sixty frames a second that reads as
 * a blink.
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

function makeSystem(rate: number, life: number): ParticleSystem {
    return new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        worldSpace: true,
        startLife: new ConstantValue(life),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(rate),
        emissionBursts: [],
        shape: new PointEmitter(),
        renderMode: RenderMode.BillBoard,
    });
}

/** Frames with no particles at all, once the first has been emitted. */
function blankFrames(system: ParticleSystem, seconds: number): number {
    const renderer = new BatchedRenderer('continuity', scene);
    renderer.addSystem(system);
    system.play();
    let blank = 0;
    let started = false;
    for (let i = 0; i < seconds * 60; i++) {
        renderer.update(1 / 60);
        if (system.particleNum > 0) started = true;
        else if (started) blank++;
    }
    renderer.dispose();
    return blank;
}

describe('emission continuity at whole-number occupancy', () => {
    // KNOWN GAP, present since at least v0.18.0: a particle emitted by a step
    // is aged by that same step, so its life ends one step before the emitter
    // refills and the count drops to zero for one frame per period.
    //
    // Written as `failing` rather than skipped on purpose. Skipping would go
    // green and be forgotten; this keeps the assertion running, expects it to
    // fail, and turns the suite red the day it starts passing — which is the
    // day someone should delete this comment and the `.failing`.
    //
    // The obvious fix — leaving a newborn alone until the next step — was tried
    // and reverted: it makes `age === 0` true on two consecutive steps, so every
    // sub emitter in Birth mode fires twice, and it freezes each particle for
    // its first frame, which is visible at the start of a fast trail.
    //
    // The fix belongs on the death boundary instead (`age > life` rather than
    // `>=`), which needs the same comparison in the behaviors and in the fused
    // pass to move with it.
    it.failing('never empties an emitter of one a second living a second', () => {
        expect(blankFrames(makeSystem(1, 1), 20)).toBe(0);
    });

    it('never empties an emitter of five a second living a fifth', () => {
        expect(blankFrames(makeSystem(5, 0.2), 20)).toBe(0);
    });

    it('never empties an emitter of two a second living one and a half', () => {
        // Occupancy of three, so the gap would be one particle short rather
        // than empty — the count must never dip below the steady state.
        const system = makeSystem(2, 1.5);
        const renderer = new BatchedRenderer('continuity-3', scene);
        renderer.addSystem(system);
        system.play();
        const counts: number[] = [];
        for (let i = 0; i < 20 * 60; i++) {
            renderer.update(1 / 60);
            if (i > 3 * 60) counts.push(system.particleNum);
        }
        expect(Math.min(...counts)).toBe(3);
        renderer.dispose();
    });
});

describe('the step that emits a particle', () => {
    it('leaves age at zero for exactly one step', () => {
        // Behaviors keyed on a particle being new — a sub emitter in Birth mode
        // is the one that ships — fire once per particle only if age reads zero
        // on a single step. Freezing a newborn for its first step makes it read
        // zero on two, and every such behavior fires twice.
        //
        // Only a behavior can see this: from outside, the step has already aged
        // the particle by the time the frame returns.
        const runs = new Map<object, {current: number; longest: number}>();
        class WatchAge implements Behavior {
            type = 'WatchAge';
            initialize(): void {}
            frameUpdate(): void {}
            update(particle: Particle): void {
                let state = runs.get(particle);
                if (!state) {
                    state = {current: 0, longest: 0};
                    runs.set(particle, state);
                }
                if (particle.age === 0) {
                    state.current++;
                    state.longest = Math.max(state.longest, state.current);
                } else {
                    state.current = 0;
                }
            }
            toJSON(): unknown {
                return {type: this.type};
            }
            clone(): Behavior {
                return new WatchAge();
            }
            reset(): void {}
        }

        const system = makeSystem(20, 1);
        system.addBehavior(new WatchAge());
        const renderer = new BatchedRenderer('age-zero', scene);
        renderer.addSystem(system);
        system.play();
        for (let i = 0; i < 300; i++) renderer.update(1 / 60);

        expect(runs.size).toBeGreaterThan(10);
        for (const state of runs.values()) {
            expect(state.longest).toBe(1);
        }
        renderer.dispose();
    });
});
