import {
    Bezier,
    ConstantValue,
    FrameOverLife,
    IntervalValue,
    ParticleStore,
    PiecewiseBezier,
    planBehaviorFusion,
    SpriteParticle,
} from '../../src';

function particle(store: ParticleStore, row: number, age: number, life: number): SpriteParticle {
    const p = new SpriteParticle(store, row);
    p.age = age;
    p.life = life;
    return p;
}

/** Runs the behavior's own update and the fused pass on copies; both must agree, and the frames are returned. */
function framesOf(behavior: FrameOverLife, ages: number[], life = 2): number[] {
    const own = new ParticleStore(ages.length);
    const fused = new ParticleStore(ages.length);
    const a = ages.map((age, i) => particle(own, i, age, life));
    const b = ages.map((age, i) => particle(fused, i, age, life));
    for (let i = 0; i < ages.length; i++) {
        behavior.initialize(a[i]);
        b[i].memory = a[i].memory.slice();
    }
    behavior.frameUpdate(0);
    behavior.updateAll(a, a.length, 0);
    const steps = planBehaviorFusion([behavior]);
    expect(steps[0].run).toBeDefined();
    steps[0].run!([behavior], b, b.length, 0, fused);
    const frames = a.map((p) => p.uvTile);
    expect(b.map((p) => p.uvTile)).toEqual(frames);
    return frames;
}

describe('FrameOverLife', () => {
    const ramp = () => new PiecewiseBezier([[new Bezier(0, 1, 2, 3), 0]]);

    it('without options samples the frame at the life fraction', () => {
        // A particle at age == life is dead and skipped, so the last one is just short of it.
        const frames = framesOf(new FrameOverLife(ramp()), [0, 1, 1.9999]);
        expect(frames.map((f) => Math.round(f * 100) / 100)).toEqual([0, 1.5, 3]);
    });

    it('plays the curve several times over the life with cycles', () => {
        const frames = framesOf(new FrameOverLife(ramp(), {cycles: 2}), [0, 0.5, 1, 1.5, 1.9999]);
        expect(frames.map((f) => Math.round(f * 100) / 100)).toEqual([0, 1.5, 0, 1.5, 3]);
    });

    it('plays at a frame rate by age in seconds, wrapping within the segment', () => {
        const behavior = new FrameOverLife(new ConstantValue(4), {fps: 10, frameCount: 3});
        expect(framesOf(behavior, [0, 0.1, 0.25, 0.3, 0.45], 10)).toEqual([4, 5, 6, 4, 5]);
    });

    it('holds the last frame of the segment when not looping', () => {
        const behavior = new FrameOverLife(new ConstantValue(0), {fps: 10, frameCount: 3, loop: false});
        expect(framesOf(behavior, [0, 0.15, 0.25, 0.9], 10)).toEqual([0, 1, 2, 2]);
    });

    it('starts each particle at its own random frame', () => {
        const behavior = new FrameOverLife(new ConstantValue(0), {
            fps: 1,
            frameCount: 16,
            startFrame: new IntervalValue(0, 16),
        });
        const frames = framesOf(behavior, new Array(32).fill(0), 10);
        expect(new Set(frames).size).toBeGreaterThan(4);
        for (const frame of frames) {
            expect(Number.isInteger(frame)).toBe(true);
            expect(frame).toBeGreaterThanOrEqual(0);
            expect(frame).toBeLessThan(16);
        }
    });

    it('round-trips its options through JSON and clone', () => {
        const behavior = new FrameOverLife(new ConstantValue(2), {
            fps: 12,
            cycles: 3,
            frameCount: 8,
            loop: false,
            random: true,
            startFrame: new IntervalValue(0, 4),
        });
        for (const copy of [
            FrameOverLife.fromJSON(behavior.toJSON()) as FrameOverLife,
            behavior.clone() as FrameOverLife,
        ]) {
            expect(copy.fps).toBe(12);
            expect(copy.cycles).toBe(3);
            expect(copy.frameCount).toBe(8);
            expect(copy.loop).toBe(false);
            expect(copy.random).toBe(true);
            expect(copy.startFrame).toBeInstanceOf(IntervalValue);
        }
        expect(new FrameOverLife(new ConstantValue(1)).toJSON()).toEqual({
            type: 'FrameOverLife',
            frame: new ConstantValue(1).toJSON(),
        });
    });

    describe('random frames', () => {
        const flicker = () => new FrameOverLife(new ConstantValue(4), {fps: 10, frameCount: 6, random: true});

        it('stays within the segment, the same through the fused pass', () => {
            const ages = Array.from({length: 40}, (_, i) => i * 0.05);
            for (const frame of framesOf(flicker(), ages, 100)) {
                expect(Number.isInteger(frame)).toBe(true);
                expect(frame).toBeGreaterThanOrEqual(4);
                expect(frame).toBeLessThan(10);
            }
        });

        it('gives one particle a stable frame within a tick and changes it across ticks', () => {
            const behavior = flicker();
            const store = new ParticleStore(1);
            const p = particle(store, 0, 0, 100);
            behavior.initialize(p);
            const at = (age: number) => behavior.frameAt(p, age, age / 100);
            expect(at(0.31)).toBe(at(0.39));
            const seen = new Set<number>();
            for (let tick = 0; tick < 60; tick++) seen.add(at(tick / 10 + 0.05));
            expect(seen.size).toBeGreaterThan(3);
            for (const frame of seen) {
                expect(frame).toBeGreaterThanOrEqual(4);
                expect(frame).toBeLessThan(10);
            }
        });

        it('sets particles apart', () => {
            const behavior = flicker();
            const store = new ParticleStore(8);
            const particles = Array.from({length: 8}, (_, i) => particle(store, i, 0.25, 100));
            for (const p of particles) behavior.initialize(p);
            const frames = particles.map((p) => behavior.frameAt(p, 0.25, 0.0025));
            expect(new Set(frames).size).toBeGreaterThan(1);
        });

        it('is not plain, so the fused pass goes through frameAt', () => {
            expect(flicker().isPlain()).toBe(false);
        });
    });
});
