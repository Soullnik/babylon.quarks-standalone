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

    const rounded = (frames: number[]) => frames.map((f) => Math.round(f * 100) / 100);

    it('plays at a frame rate by age in seconds, wrapping within the segment', () => {
        const behavior = new FrameOverLife(new ConstantValue(4), {fps: 10, frameCount: 3});
        expect(rounded(framesOf(behavior, [0, 0.1, 0.2, 0.3, 0.4], 10))).toEqual([4, 5, 6, 4, 5]);
    });

    it('runs on between whole frames at a frame rate, as Unity does, so tiles can blend', () => {
        // Unity 6000.6, 4x4 sheet at 4 fps: AnimFrame 0.4 at 0.1 s, 1.5 at 0.375 s, and 1.6 at
        // 4.4 s, wrapped round the 16 frames; the blend is the part past the whole frame.
        const behavior = new FrameOverLife(new ConstantValue(0), {fps: 4, frameCount: 16});
        expect(rounded(framesOf(behavior, [0.1, 0.375, 1.125, 3.9, 4.4], 10))).toEqual([0.4, 1.5, 4.5, 15.6, 1.6]);
    });

    it('holds the last frame of the segment when not looping, whole', () => {
        const behavior = new FrameOverLife(new ConstantValue(0), {fps: 10, frameCount: 3, loop: false});
        expect(rounded(framesOf(behavior, [0, 0.15, 0.25, 0.9], 10))).toEqual([0, 1.5, 2, 2]);
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

    describe('single row', () => {
        // A 4 x 3 sheet; the curve runs over one row's 4 frames.
        const rowRamp = () => new PiecewiseBezier([[new Bezier(0, 4 / 3, 8 / 3, 3.999), 0]]);

        it('plays the curve within a fixed row', () => {
            const behavior = new FrameOverLife(rowRamp(), {rowLength: 4, rowCount: 3, row: 2});
            const frames = framesOf(behavior, [0, 1, 1.9999]);
            expect(frames.map((f) => Math.floor(f))).toEqual([8, 9, 11]);
        });

        it('picks a row per particle and keeps each one in it', () => {
            const behavior = new FrameOverLife(rowRamp(), {rowLength: 4, rowCount: 3, randomRow: true});
            const ages = new Array(48).fill(0).map((_, i) => (i % 2) * 1.9999);
            const frames = framesOf(behavior, ages);
            const rows = frames.map((f) => Math.floor(Math.floor(f) / 4));
            expect(new Set(rows)).toEqual(new Set([0, 1, 2]));
            for (let i = 0; i < frames.length; i++) {
                // Young particles start their row, old ones end it; none leaves it.
                expect(Math.floor(frames[i]) % 4).toBe(i % 2 === 0 ? 0 : 3);
            }
        });

        it('wraps a start frame within the row, not into the next', () => {
            const behavior = new FrameOverLife(new ConstantValue(3), {
                frameCount: 4,
                startFrame: new ConstantValue(2),
                rowLength: 4,
                rowCount: 2,
                row: 1,
            });
            expect(framesOf(behavior, [0, 1]).map((f) => Math.floor(f))).toEqual([5, 5]);
        });

        it('is not plain, so the fused pass goes through frameAt', () => {
            expect(new FrameOverLife(rowRamp(), {rowLength: 4, rowCount: 3}).isPlain()).toBe(false);
        });

        it('normalises the row and round-trips through JSON and clone', () => {
            const behavior = new FrameOverLife(rowRamp(), {rowLength: 4.7, rowCount: 0, row: -2});
            expect([behavior.rowLength, behavior.rowCount, behavior.row]).toEqual([4, 1, 0]);
            const random = new FrameOverLife(rowRamp(), {rowLength: 4, rowCount: 3, row: 1, randomRow: true});
            for (const copy of [
                FrameOverLife.fromJSON(random.toJSON()) as FrameOverLife,
                random.clone() as FrameOverLife,
            ]) {
                expect([copy.rowLength, copy.rowCount, copy.row, copy.randomRow]).toEqual([4, 3, 1, true]);
            }
            expect(new FrameOverLife(rowRamp()).toJSON()).toEqual({type: 'FrameOverLife', frame: rowRamp().toJSON()});
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
