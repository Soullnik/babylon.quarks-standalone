import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {
    Bezier,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    PiecewiseBezier,
    RandomBetweenCurves,
    SizeOverLife,
    Vector4,
} from 'quarks.core';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import {QuarksUtil} from '../src/QuarksUtil';
import {emptyMeta} from './internals';

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

/** A flat curve at `value`, or a straight line from `from` to `to`. */
const line = (from: number, to = from) =>
    new PiecewiseBezier([[new Bezier(from, from + (to - from) / 3, from + ((to - from) * 2) / 3, to), 0]]);

function system(parameters: Partial<ParticleSystemParameters> = {}) {
    return new ParticleSystem({
        scene,
        duration: 1,
        looping: false,
        startLife: new ConstantValue(10),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(200), probability: 1, interval: 0, cycle: 1}],
        shape: new ConeEmitter({radius: 0, angle: 0}),
        seed: 7,
        ...parameters,
    });
}

describe('RandomBetweenCurves in a system', () => {
    it('gives each particle its own start speed between the curves', () => {
        const ps = system({startSpeed: new RandomBetweenCurves(line(1), line(3))});
        ps.update(1 / 60);
        const speeds = ps.particles.slice(0, ps.particleNum).map((p) => p.velocity.length());
        expect(Math.min(...speeds)).toBeGreaterThanOrEqual(1 - 1e-6);
        expect(Math.max(...speeds)).toBeLessThanOrEqual(3 + 1e-6);
        expect(Math.max(...speeds) - Math.min(...speeds)).toBeGreaterThan(1.5);
    });

    it('keeps each particle on its own curve in a behavior over its life', () => {
        // Sizes between a curve shrinking from 2 to 0 and one growing from 2 to 4.
        const ps = system();
        ps.addBehavior(new SizeOverLife(new RandomBetweenCurves(line(2, 0), line(2, 4))));
        ps.update(1 / 60);
        const early = ps.particles.slice(0, ps.particleNum).map((p) => p.size.x);
        for (const size of early) expect(size).toBeCloseTo(2, 1);
        for (let i = 0; i < 300; i++) ps.update(1 / 60);
        // Half way through their lives: between 1 and 3, spread over the band.
        const mid = ps.particles.slice(0, ps.particleNum).map((p) => p.size.x);
        expect(Math.min(...mid)).toBeGreaterThanOrEqual(1 - 0.05);
        expect(Math.max(...mid)).toBeLessThanOrEqual(3 + 0.05);
        expect(Math.max(...mid) - Math.min(...mid)).toBeGreaterThan(1.5);
    });

    it('keeps emitting while either curve of an emission rate is still to rise', () => {
        const ps = system({
            emissionBursts: [],
            // 0 until half way through the cycle, then rising.
            emissionOverTime: new RandomBetweenCurves(
                line(0),
                new PiecewiseBezier([
                    [new Bezier(0, 0, 0, 0), 0],
                    [new Bezier(0, 0, 50, 50), 0.5],
                ])
            ),
        });
        ps.update(0.1);
        expect(ps.particleNum).toBe(0);
        expect(ps.hasPendingEmission()).toBe(true);
    });

    it("counts the upper curve in an effect's duration", () => {
        const ps = system({startLife: new RandomBetweenCurves(line(1), line(4))});
        expect(QuarksUtil.getDuration(ps.emitter)).toBeCloseTo(1 + 4, 1);
    });

    it('round-trips a system through JSON', () => {
        const ps = system({startSpeed: new RandomBetweenCurves(line(1), line(3))});
        const meta = emptyMeta();
        const json = ps.toJSON(meta);
        const loaded = ParticleSystem.fromJSON(json, meta, scene);
        expect(loaded.startSpeed).toBeInstanceOf(RandomBetweenCurves);
        expect(loaded.startSpeed.toJSON()).toEqual(ps.startSpeed.toJSON());
        expect(ps.clone().startSpeed.toJSON()).toEqual(ps.startSpeed.toJSON());
    });
});
