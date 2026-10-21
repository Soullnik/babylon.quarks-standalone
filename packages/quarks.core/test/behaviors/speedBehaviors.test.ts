import {
    Bezier,
    ColorBySpeed,
    ConstantValue,
    Gradient,
    IntervalValue,
    LimitSpeedOverLife,
    PiecewiseBezier,
    RotationBySpeed,
    SizeBySpeed,
    speedFraction,
    SpriteParticle,
    Vector3,
} from '../../src';

const ramp = (from: number, to: number) =>
    new PiecewiseBezier([[new Bezier(from, from + (to - from) / 3, from + ((to - from) * 2) / 3, to), 0]]);

function particle(speed: number): SpriteParticle {
    const p = new SpriteParticle();
    p.life = 1;
    p.age = 0;
    p.startSpeed = 0;
    p.velocity.set(speed, 0, 0);
    p.startSize.set(1, 1, 1);
    p.startColor.set(1, 1, 1, 1);
    return p;
}

describe('speedFraction', () => {
    test('reads the current speed times the speed modifier, not the start speed', () => {
        const p = particle(4);
        p.startSpeed = 10;
        expect(speedFraction(p, new IntervalValue(0, 8))).toBeCloseTo(0.5);
        p.speedModifier = 0.5;
        expect(speedFraction(p, new IntervalValue(0, 8))).toBeCloseTo(0.25);
    });

    test('clamps to the range at both ends', () => {
        expect(speedFraction(particle(20), new IntervalValue(2, 8))).toBe(1);
        expect(speedFraction(particle(1), new IntervalValue(2, 8))).toBe(0);
    });

    test('an empty range is a step, never NaN', () => {
        expect(speedFraction(particle(3), new IntervalValue(5, 5))).toBe(0);
        expect(speedFraction(particle(5), new IntervalValue(5, 5))).toBe(1);
    });
});

describe('by-speed behaviors follow the current speed', () => {
    test('ColorBySpeed changes as the particle speeds up', () => {
        const gradient = new Gradient([
            [new Vector3(1, 0, 0), 0],
            [new Vector3(0, 0, 1), 1],
        ]);
        const behavior = new ColorBySpeed(gradient, new IntervalValue(0, 10));
        const p = particle(0);
        behavior.initialize(p);
        behavior.update(p, 1 / 60);
        expect(p.color.x).toBeCloseTo(1);
        p.velocity.set(10, 0, 0);
        behavior.update(p, 1 / 60);
        expect(p.color.z).toBeCloseTo(1);
    });

    test('SizeBySpeed changes as the particle slows down', () => {
        const behavior = new SizeBySpeed(ramp(1, 3), new IntervalValue(0, 10));
        const p = particle(10);
        behavior.initialize(p);
        behavior.update(p);
        expect(p.size.x).toBeCloseTo(3);
        p.velocity.set(0, 0, 0);
        behavior.update(p);
        expect(p.size.x).toBeCloseTo(1);
    });

    test('RotationBySpeed turns at the rate for the current speed', () => {
        const behavior = new RotationBySpeed(ramp(0, 6), new IntervalValue(0, 10));
        const p = particle(5);
        p.rotation = 0;
        behavior.initialize(p);
        behavior.update(p, 1);
        expect(p.rotation as number).toBeCloseTo(3);
    });
});

describe('LimitSpeedOverLife dampen', () => {
    test('removes a third of the excess per step at 60 Hz, as before', () => {
        const behavior = new LimitSpeedOverLife(ramp(2, 2), 1);
        const p = particle(5);
        behavior.initialize(p);
        behavior.update(p, 1 / 60);
        expect(p.velocity.x).toBeCloseTo(5 - 3 / 3, 5);
    });

    test('never reverses the velocity, however long the step', () => {
        const behavior = new LimitSpeedOverLife(ramp(2, 2), 1);
        const p = particle(10);
        behavior.initialize(p);
        behavior.update(p, 0.5);
        expect(p.velocity.x).toBeGreaterThan(2);
        expect(p.velocity.x).toBeLessThan(10);
    });

    test('clamps dampen to 0..1', () => {
        const over = new LimitSpeedOverLife(ramp(2, 2), 5);
        const one = new LimitSpeedOverLife(ramp(2, 2), 1);
        expect(over.dampenStep(1 / 30)).toBe(one.dampenStep(1 / 30));
        expect(new LimitSpeedOverLife(ramp(2, 2), -1).dampenStep(1 / 30)).toBe(0);
    });

    test('loses the same share of the excess per second at any step', () => {
        const one = new LimitSpeedOverLife(new ConstantValue(0) as never, 0.5);
        const perSecond = (rate: number) => Math.pow(1 - one.dampenStep(1 / rate), rate);
        expect(perSecond(30)).toBeCloseTo(perSecond(60), 10);
        expect(perSecond(144)).toBeCloseTo(perSecond(60), 10);
    });
});
