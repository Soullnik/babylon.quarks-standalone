import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import type {StretchedBillBoardSettings} from 'quarks.core';
import {AxisAngleGenerator, ConstantValue, EulerGenerator, PointEmitter, Vector3} from 'quarks.core';
import {ParticleSystem} from '../src/ParticleSystem';
import {RenderMode, STRETCHED_LENGTH_FACTOR} from '../src/VFXBatch';

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

/** Spawns one particle and returns its rotation. */
function spawnedRotation(startRotation: ParticleSystem['startRotation'], renderMode = RenderMode.BillBoard): number {
    const ps = new ParticleSystem({
        scene,
        renderMode,
        startLife: new ConstantValue(1),
        startSpeed: new ConstantValue(0),
        emissionOverTime: new ConstantValue(0),
        startRotation,
        shape: new PointEmitter(),
    });
    ps.emissionState.waitEmiting = 1;
    ps.emit(0, ps.emissionState, ps.emitter.matrixWorld);
    expect(ps.particleNum).toBe(1);
    const rotation = ps.particles[0].rotation;
    ps.dispose();
    if (typeof rotation !== 'number') {
        throw new Error('a billboard rotation is an angle');
    }
    return rotation;
}

describe('stretched billboard length default', () => {
    it('uses 2 when the length factor is left out, and keeps an explicit 0', () => {
        const omitted = new ParticleSystem({
            scene,
            renderMode: RenderMode.StretchedBillBoard,
            emissionOverTime: new ConstantValue(0),
            rendererEmitterSettings: {speedFactor: 1} as StretchedBillBoardSettings,
        });
        expect(STRETCHED_LENGTH_FACTOR).toBe(2);
        expect((omitted.rendererEmitterSettings as StretchedBillBoardSettings).lengthFactor).toBe(
            STRETCHED_LENGTH_FACTOR
        );
        expect((omitted.rendererEmitterSettings as StretchedBillBoardSettings).speedFactor).toBe(1);
        omitted.dispose();

        const none = new ParticleSystem({
            scene,
            renderMode: RenderMode.StretchedBillBoard,
            emissionOverTime: new ConstantValue(0),
        });
        expect((none.rendererEmitterSettings as StretchedBillBoardSettings).lengthFactor).toBe(STRETCHED_LENGTH_FACTOR);
        none.renderMode = RenderMode.BillBoard;
        none.renderMode = RenderMode.StretchedBillBoard;
        expect((none.rendererEmitterSettings as StretchedBillBoardSettings).lengthFactor).toBe(STRETCHED_LENGTH_FACTOR);
        none.dispose();

        const zero = new ParticleSystem({
            scene,
            renderMode: RenderMode.StretchedBillBoard,
            emissionOverTime: new ConstantValue(0),
            rendererEmitterSettings: {speedFactor: 0, lengthFactor: 0},
        });
        expect((zero.rendererEmitterSettings as StretchedBillBoardSettings).lengthFactor).toBe(0);
        zero.dispose();
    });
});

describe('a billboard start rotation from a rotation generator', () => {
    it('uses an Euler generator Z angle and ignores X and Y', () => {
        const rotation = spawnedRotation(
            new EulerGenerator(new ConstantValue(1), new ConstantValue(2), new ConstantValue(0.4))
        );
        expect(rotation).toBeCloseTo(0.4, 6);
    });

    it('uses the twist about Z of an axis-angle generator', () => {
        expect(spawnedRotation(new AxisAngleGenerator(new Vector3(0, 0, 1), new ConstantValue(0.7)))).toBeCloseTo(
            0.7,
            6
        );
        expect(spawnedRotation(new AxisAngleGenerator(new Vector3(0, 1, 0), new ConstantValue(1.2)))).toBeCloseTo(0, 6);
    });

    it('does the same for a stretched billboard', () => {
        const rotation = spawnedRotation(
            new EulerGenerator(new ConstantValue(0), new ConstantValue(0), new ConstantValue(-0.25)),
            RenderMode.StretchedBillBoard
        );
        expect(rotation).toBeCloseTo(-0.25, 6);
    });
});
