/**
 * Arc modes (Unity's Arc Mode and Spread): where along the arc a particle starts, for every
 * mode, sweep position and spread, always within 0…1; and the shape's sweep starts over on reset.
 */
import {
    CircleEmitter,
    ConeEmitter,
    ConstantValue,
    EmissionState,
    EmitterMode,
    getValueFromEmitterMode,
    IParticleSystem,
    PointEmitter,
    SpriteParticle,
} from '../../src';

const emissionState = (bursting = false, index = 0, count = 0): EmissionState => ({
    isBursting: bursting,
    burstParticleIndex: index,
    burstParticleCount: count,
    burstIndex: 0,
    burstWaveIndex: 0,
    time: 0,
    waitEmiting: 0,
    travelDistance: 0,
});

const SWEEPS = [-2.25, -0.5, 0, 0.25, 1, 1.5, 3.7];
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe('getValueFromEmitterMode', () => {
    test.each(SWEEPS)('Loop wraps a sweep position of %p into 0…1', (sweep) => {
        const u = getValueFromEmitterMode(EmitterMode.Loop, sweep, 0, emissionState());
        expect(close(u, sweep - Math.floor(sweep))).toBe(true);
    });

    test('PingPong starts at the arc start, reaches the end at 1 and comes back', () => {
        const at = (sweep: number) => getValueFromEmitterMode(EmitterMode.PingPong, sweep, 0, emissionState());
        expect(at(0)).toBe(0);
        expect(at(0.25)).toBe(0.25);
        expect(at(1)).toBe(1);
        expect(at(1.5)).toBe(0.5);
        expect(at(2)).toBe(0);
        expect(at(-0.5)).toBe(0.5);
        expect(at(-2.25)).toBe(0.25);
        expect(at(3.7)).toBeCloseTo(0.3, 9);
    });

    test('Burst spreads a burst over the arc and places rate-emitted particles at random', () => {
        expect(getValueFromEmitterMode(EmitterMode.Burst, 3.7, 0, emissionState(true, 3, 4))).toBe(0.75);
        for (let i = 0; i < 200; i++) {
            const u = getValueFromEmitterMode(EmitterMode.Burst, 3.7, 0, emissionState());
            expect(u).toBeGreaterThanOrEqual(0);
            expect(u).toBeLessThan(1);
        }
        // A burst of zero particles cannot divide; it falls back to random.
        const u = getValueFromEmitterMode(EmitterMode.Burst, 0, 0, emissionState(true, 0, 0));
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThan(1);
    });

    test.each([EmitterMode.Random, EmitterMode.Loop, EmitterMode.PingPong, EmitterMode.Burst])(
        'spread snaps mode %p to multiples of itself, within 0…1',
        (mode) => {
            for (const sweep of SWEEPS) {
                for (const bursting of [false, true]) {
                    const u = getValueFromEmitterMode(mode, sweep, 0.25, emissionState(bursting, 1, 3));
                    expect(u).toBeGreaterThanOrEqual(0);
                    expect(u).toBeLessThanOrEqual(1);
                    expect(close(u / 0.25, Math.round(u / 0.25))).toBe(true);
                }
            }
        }
    );

    test('every mode stays within 0…1 for every sweep position', () => {
        for (const mode of [EmitterMode.Random, EmitterMode.Loop, EmitterMode.PingPong, EmitterMode.Burst]) {
            for (const sweep of SWEEPS) {
                const u = getValueFromEmitterMode(mode, sweep, 0, emissionState(true, 2, 5));
                expect(u).toBeGreaterThanOrEqual(0);
                expect(u).toBeLessThanOrEqual(1);
            }
        }
    });
});

describe('sweeping shapes', () => {
    const system = (time = 0) => ({emissionState: {time}, duration: 1}) as unknown as IParticleSystem;

    test('a Loop circle advances with its speed and reset() starts the arc over', () => {
        const shape = new CircleEmitter({mode: EmitterMode.Loop, speed: new ConstantValue(1), radius: 1, thickness: 0});
        const angle = () => {
            const p = new SpriteParticle();
            p.startSpeed = 1;
            shape.initialize(p, emissionState());
            return Math.atan2(p.position.y, p.position.x);
        };
        shape.update(system(), 0.37);
        expect(angle()).toBeCloseTo(0.37 * Math.PI * 2, 5); // positions are float32
        shape.reset();
        expect(angle()).toBeCloseTo(0, 5);
        shape.update(system(), 1.25); // past one full turn
        expect(angle()).toBeCloseTo(0.25 * Math.PI * 2, 5);
    });

    test('a reset shape forgets its speed generator sample too', () => {
        const shape = new ConeEmitter({mode: EmitterMode.Loop});
        shape.memory.push(0.5);
        shape.reset();
        expect(shape.memory).toEqual([]);
    });
});

describe('PointEmitter', () => {
    test('emits at the start speed in directions uniform over the sphere', () => {
        const shape = new PointEmitter();
        let up = 0;
        const count = 4000;
        for (let i = 0; i < count; i++) {
            const p = new SpriteParticle();
            p.startSpeed = 5;
            shape.initialize(p);
            expect(p.velocity.length()).toBeCloseTo(5, 5);
            if (p.velocity.z > 2.5) up++; // a quarter of a uniform sphere has z above half the speed
        }
        // A quarter of a uniform sphere has z above 0.5.
        expect(up / count).toBeGreaterThan(0.21);
        expect(up / count).toBeLessThan(0.29);
    });
});

describe('ConeEmitter thickness', () => {
    const radii = (thickness: number, count = 4000) => {
        const shape = new ConeEmitter({radius: 1, thickness, angle: 0});
        const out: number[] = [];
        for (let i = 0; i < count; i++) {
            const p = new SpriteParticle();
            p.startSpeed = 1;
            shape.initialize(p, emissionState());
            out.push(Math.hypot(p.position.x, p.position.y));
        }
        return out;
    };

    test('the ring starts at radius 1 - thickness, as Unity maps Radius Thickness', () => {
        const r = radii(0.5);
        expect(Math.min(...r)).toBeGreaterThanOrEqual(0.5 - 1e-6);
        expect(Math.min(...r)).toBeLessThan(0.52);
        expect(Math.max(...r)).toBeLessThanOrEqual(1 + 1e-6);
        expect(radii(0).every((x) => Math.abs(x - 1) < 1e-6)).toBe(true);
    });

    test('a full cone is uniform over its base area', () => {
        const r = radii(1);
        const inner = r.filter((x) => x < 0.5).length / r.length;
        expect(inner).toBeGreaterThan(0.21); // a quarter of the area lies within half the radius
        expect(inner).toBeLessThan(0.29);
    });
});
