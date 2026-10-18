import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {
    BehaviorFromJSON,
    Bezier,
    ConstantColor,
    ConstantValue,
    PiecewiseBezier,
    PointEmitter,
    SizeOverLife,
    TrailParticle,
    Vector4,
    WidthOverLength,
} from 'quarks.core';
import {ParticleSystem} from '../src/ParticleSystem';
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

function trailSystem(startSize: number, length = 20) {
    return new ParticleSystem({
        scene,
        duration: 1,
        looping: false,
        worldSpace: true,
        startLife: new ConstantValue(5),
        startSpeed: new ConstantValue(1),
        startSize: new ConstantValue(startSize),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionOverDistance: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), probability: 1, interval: 0.01, cycle: 1}],
        shape: new PointEmitter(),
        renderMode: RenderMode.Trail,
        rendererEmitterSettings: {startLength: new ConstantValue(length), followLocalOrigin: false},
    });
}

function run(system: ParticleSystem, seconds: number): void {
    for (let t = 0; t < seconds; t += 1 / 60) system.update(1 / 60);
}

/** Recorded widths, oldest (tail) first. */
function widths(trail: TrailParticle): number[] {
    const out: number[] = [];
    for (let i = 0; i < trail.historyCount; i++) out.push(trail.historySizes[trail.getHistoryIndex(i)]);
    return out;
}

const taper = () => new PiecewiseBezier([[new Bezier(1, 2 / 3, 1 / 3, 0), 0]]);

describe('WidthOverLength', () => {
    it('scales the particle size', () => {
        const system = trailSystem(0.1);
        system.addBehavior(new WidthOverLength(new ConstantValue(1) as never));
        system.play();
        run(system, 0.2);
        const trail = system.particles[0] as TrailParticle;
        expect(trail.historyCount).toBeGreaterThan(5);
        for (const width of widths(trail)) {
            expect(width).toBeCloseTo(0.1);
        }
    });

    it('tapers from the particle size at the head to the curve’s end at the tail, with no step at the tip', () => {
        const system = trailSystem(0.1, 10);
        system.addBehavior(new WidthOverLength(taper()));
        system.play();
        run(system, 0.5);
        const trail = system.particles[0] as TrailParticle;
        const w = widths(trail);
        expect(w).toHaveLength(10);
        // Head: curve(0) × size.
        expect(w[w.length - 1]).toBeCloseTo(0.1, 5);
        // Sample k steps behind the head: curve(k / length) × size.
        for (let k = 0; k < w.length; k++) {
            expect(w[w.length - 1 - k]).toBeCloseTo(0.1 * (1 - k / 10), 5);
        }
    });

    it('does not compound its factor step after step', () => {
        const system = trailSystem(0.2, 30);
        system.addBehavior(new WidthOverLength(new ConstantValue(0.5) as never));
        system.play();
        run(system, 1);
        for (const width of widths(system.particles[0] as TrailParticle)) {
            expect(width).toBeCloseTo(0.1, 5);
        }
    });

    it('multiplies the size each sample was recorded with', () => {
        const system = trailSystem(1, 60);
        // Size shrinks to 0.7 over the 5 s life.
        system.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.9, 0.8, 0.7), 0]])));
        system.addBehavior(new WidthOverLength(new ConstantValue(1) as never));
        system.play();
        run(system, 0.5);
        const w = widths(system.particles[0] as TrailParticle);
        // Older samples were recorded while the particle was larger.
        expect(w[0]).toBeGreaterThan(w[w.length - 1]);
        expect(w[w.length - 1]).toBeCloseTo((system.particles[0] as TrailParticle).size.x, 5);
    });

    it('reads the curve as the width itself when absolute', () => {
        const system = trailSystem(0.1);
        system.addBehavior(new WidthOverLength(new ConstantValue(1) as never, true));
        system.play();
        run(system, 0.2);
        const w = widths(system.particles[0] as TrailParticle);
        // The head keeps the particle size until the next step, as before.
        expect(w[w.length - 1]).toBeCloseTo(0.1);
        w.slice(0, -1).forEach((width) => expect(width).toBeCloseTo(1));
    });

    it('loads JSON without `absolute` as absolute, the way it was authored', () => {
        const legacy = BehaviorFromJSON(
            {type: 'WidthOverLength', width: {type: 'ConstantValue', value: 1}},
            null as never
        );
        expect((legacy as WidthOverLength).absolute).toBe(true);
    });

    it('round-trips the mode through JSON and clone', () => {
        const relative = new WidthOverLength(new ConstantValue(1) as never);
        expect(relative.toJSON().absolute).toBe(false);
        expect((BehaviorFromJSON(relative.toJSON(), null as never) as WidthOverLength).absolute).toBe(false);
        expect((relative.clone() as WidthOverLength).absolute).toBe(false);
        const absolute = new WidthOverLength(new ConstantValue(1) as never, true);
        expect((BehaviorFromJSON(absolute.toJSON(), null as never) as WidthOverLength).absolute).toBe(true);
        expect((absolute.clone() as WidthOverLength).absolute).toBe(true);
    });
});
