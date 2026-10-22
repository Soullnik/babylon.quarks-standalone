import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {ConeEmitter, ConstantColor, ConstantValue, PointEmitter, TrailParticle, Vector4} from 'quarks.core';
import {ParticleSystem} from '../src/ParticleSystem';
import type {ParticleSystemParameters} from '../src/system/types';
import {RenderMode} from '../src/VFXBatch';

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

/** One particle per step, standing still where it was born, so where it is tells where the emitter was. */
function system(parameters: Partial<ParticleSystemParameters> = {}): ParticleSystem {
    return new ParticleSystem({
        scene,
        duration: 10,
        looping: true,
        worldSpace: true,
        seed: 3,
        startLife: new ConstantValue(10),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(60),
        shape: new PointEmitter(),
        ...parameters,
    });
}

function moveTo(ps: ParticleSystem, x: number): void {
    ps.emitter.position.x = x;
    ps.emitter.computeWorldMatrix(true);
}

function xs(ps: ParticleSystem): number[] {
    const out: number[] = [];
    for (let i = 0; i < ps.particleNum; i++) {
        out.push(Math.round(ps.particles[i].position.x * 1000) / 1000);
    }
    return out.sort((a, b) => a - b);
}

/**
 * A frame that runs several fixed steps hands each step the emitter interpolated between where
 * the last step had it and where it is now, so a moving emitter's spawns lie along its path
 * (Niagara's interpolated spawning) instead of clumping where the frame ends.
 */
describe('emitter interpolation across the steps of a frame', () => {
    it('spreads the spawns of a multi-step frame along the emitter path', () => {
        const ps = system();
        ps.update(STEP); // the first step: one particle at x 0, and the matrix to interpolate from
        moveTo(ps, 6);
        ps.update(STEP * 6);
        expect(xs(ps)).toEqual([0, 1, 2, 3, 4, 5, 6]);
        ps.dispose();
    });

    it('turns the emitter along the way too', () => {
        const ps = system({startSpeed: new ConstantValue(1), shape: new ConeEmitter({radius: 0, angle: 0})});
        ps.update(STEP);
        ps.emitter.rotation.y = Math.PI / 2; // +Z turns toward +X over the frame
        ps.emitter.computeWorldMatrix(true);
        ps.update(STEP * 4);
        const headings = [];
        for (let i = 1; i < ps.particleNum; i++) {
            const v = ps.particles[i].velocity;
            headings.push(Math.round((Math.atan2(v.x, v.z) / (Math.PI / 2)) * 100) / 100);
        }
        expect(headings.sort((a, b) => a - b)).toEqual([0.25, 0.5, 0.75, 1]);
        ps.dispose();
    });

    it('uses the current matrix as it is for a single-step frame', () => {
        const ps = system();
        ps.update(STEP);
        moveTo(ps, 6);
        ps.update(STEP);
        expect(xs(ps)).toEqual([0, 6]);
        ps.dispose();
    });

    it('does not smear spawns over a move made before the first frame, across a restart or while paused', () => {
        const ps = system();
        moveTo(ps, 6);
        ps.update(STEP * 3);
        expect(xs(ps)).toEqual([6, 6, 6]);
        ps.restart();
        moveTo(ps, 20);
        ps.update(STEP * 3);
        expect(xs(ps)).toEqual([20, 20, 20]);
        ps.pause();
        moveTo(ps, 40);
        ps.play();
        ps.update(STEP * 3);
        expect(xs(ps)).toEqual([20, 20, 20, 40, 40, 40]);
        ps.dispose();
    });

    it('hands the last step of a frame the current matrix itself', () => {
        const ps = system();
        ps.update(STEP);
        moveTo(ps, 6);
        ps.update(STEP * 2);
        // A still emitter from here on: every later frame uses the matrix as it is, exactly.
        ps.update(STEP * 2);
        expect(xs(ps)).toEqual([0, 3, 6, 6, 6]);
        expect(ps.particles[ps.particleNum - 1].position.x).toBe(6);
        ps.dispose();
    });

    it('interpolates from the last step actually simulated, across frames that ran none', () => {
        const ps = system();
        ps.update(STEP);
        moveTo(ps, 2);
        ps.update(STEP * 0.3); // too short for a step: the move waits
        moveTo(ps, 6);
        ps.update(STEP * 2.7); // three steps from x 0 to x 6
        expect(xs(ps)).toEqual([0, 2, 4, 6]);
        ps.dispose();
    });

    it('records world-space trail samples along the path of a local-space emitter', () => {
        const ps = system({
            worldSpace: false,
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0.1, probability: 1}],
            renderMode: RenderMode.Trail,
            rendererEmitterSettings: {
                startLength: new ConstantValue(10),
                followLocalOrigin: false,
                recordWorldSpace: true,
            },
        });
        ps.update(STEP);
        moveTo(ps, 5);
        ps.update(STEP * 5);
        const trail = ps.particles[0] as TrailParticle;
        const samples: number[] = [];
        for (let i = 0; i < trail.historyCount; i++) {
            samples.push(Math.round(trail.historyPositions[trail.getHistoryIndex(i) * 3] * 1000) / 1000);
        }
        expect(samples).toEqual([0, 1, 2, 3, 4, 5]);
        ps.dispose();
    });
});
