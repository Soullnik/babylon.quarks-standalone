import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {
    ApplyForce,
    Bezier,
    ColorOverLife,
    ConeEmitter,
    ConstantValue,
    Gradient,
    IntervalValue,
    PiecewiseBezier,
    RandomColor,
    RotationOverLife,
    SizeOverLife,
    Vector3,
    Vector4,
} from 'quarks.core';
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

/**
 * The system simulates in fixed 1/60 s steps however often it is updated, so a seeded effect must
 * reach the same particles at the same time whether the display runs at 20 Hz or 240 Hz. Every rate
 * here fits a whole number of frames into half a second, so each one lands on the same step count
 * at every half second.
 */
const RATES = [20, 30, 50, 60, 120, 144, 240];
const BASELINE = 60;

function system(): ParticleSystem {
    return new ParticleSystem({
        scene,
        duration: 1,
        looping: false,
        worldSpace: true,
        seed: 11,
        startLife: new IntervalValue(0.5, 1.5),
        startSpeed: new IntervalValue(1, 3),
        startSize: new IntervalValue(0.5, 1),
        startRotation: new IntervalValue(0, Math.PI),
        startColor: new RandomColor(new Vector4(1, 0, 0, 1), new Vector4(0, 0, 1, 1)),
        emissionOverTime: new ConstantValue(40),
        emissionBursts: [{time: 0.25, count: new ConstantValue(10), cycle: 1, interval: 0, probability: 1}],
        shape: new ConeEmitter({radius: 0.5, angle: 0.4}),
        behaviors: [
            new ApplyForce(new Vector3(0, -1, 0), new ConstantValue(9.8)),
            new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.8, 0.4, 0), 0]])),
            new ColorOverLife(new Gradient()),
            new RotationOverLife(new ConstantValue(2)),
        ],
    });
}

/** Every live particle's state, in emission order, rounded past float noise. */
function snapshot(ps: ParticleSystem): number[][] {
    const rows: number[][] = [];
    for (let i = 0; i < ps.particleNum; i++) {
        const p = ps.particles[i];
        rows.push(
            [
                p.age,
                p.position.x,
                p.position.y,
                p.position.z,
                p.velocity.x,
                p.velocity.y,
                p.velocity.z,
                p.size.x,
                p.color.x,
                p.color.w,
                p.rotation as number,
            ].map((v) => Math.round(v * 1e6) / 1e6)
        );
    }
    return rows;
}

/** Updates `ps` at `rate` Hz for `seconds`. */
function run(ps: ParticleSystem, rate: number, seconds: number): void {
    for (let frame = 0; frame < seconds * rate; frame++) {
        ps.update(1 / rate);
    }
}

describe('frame-rate independence', () => {
    // The 60 Hz state at 0.5 s, 1 s and 1.5 s.
    let expected: number[][][];
    beforeAll(() => {
        const baseline = system();
        expected = [0, 1, 2].map(() => {
            run(baseline, BASELINE, 0.5);
            return snapshot(baseline);
        });
    });

    test('the baseline emits, moves and kills particles', () => {
        expect(expected[0].length).toBeGreaterThan(10);
        expect(expected[2].length).toBeLessThan(expected[1].length);
    });

    test.each(RATES.filter((rate) => rate !== BASELINE))('%i Hz matches 60 Hz at every half second', (rate) => {
        const ps = system();
        for (const state of expected) {
            run(ps, rate, 0.5);
            expect(snapshot(ps)).toEqual(state);
        }
    });

    test.each(RATES)('a one-shot finishes at the same time at %i Hz', (rate) => {
        const ps = system();
        let finishedAt: number | undefined;
        let finishedCount = 0;
        let time = 0;
        ps.addEventListener('finished', () => {
            finishedAt ??= time;
            finishedCount++;
        });
        for (let frame = 0; frame < 4 * rate; frame++) {
            time += 1 / rate;
            ps.update(1 / rate);
        }
        expect(finishedCount).toBe(1);
        // The last particle can live 1.5 s past the 1 s of emission; finishing waits for it.
        expect(finishedAt).toBeGreaterThan(1);
        expect(finishedAt).toBeLessThanOrEqual(2.5 + 1 / rate);
        expect(ps.particleNum).toBe(0);
    });

    test.each(RATES)('pausing at %i Hz holds the particles and resumes where it stopped', (rate) => {
        const ps = system();
        run(ps, rate, 0.5);
        const before = snapshot(ps);
        ps.pause();
        run(ps, rate, 0.5);
        expect(snapshot(ps)).toEqual(before);
        ps.play();
        run(ps, rate, 0.5);
        expect(snapshot(ps)).toEqual(expected[1]);
    });
});
