import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
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
    it('never empties an emitter of one a second living a second', () => {
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
