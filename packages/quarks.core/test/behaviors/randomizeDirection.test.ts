import {RandomizeDirection, SpriteParticle} from '../../src';

function spawn(behavior: RandomizeDirection, velocity: [number, number, number]) {
    const p = new SpriteParticle();
    p.life = 1;
    p.velocity.set(...velocity);
    behavior.initialize(p);
    return p;
}

describe('RandomizeDirection', () => {
    test('at 1 sends particles every way, evenly, and keeps their speed', () => {
        const behavior = new RandomizeDirection(1);
        const n = 4000;
        let sumZ = 0;
        let backward = 0;
        for (let i = 0; i < n; i++) {
            const p = spawn(behavior, [0, 0, 3]);
            expect(p.velocity.length()).toBeCloseTo(3, 4);
            sumZ += p.velocity.z / 3;
            if (p.velocity.z < 0) backward++;
        }
        // A uniform sphere: no pull toward the emit direction, half go backward.
        expect(Math.abs(sumZ / n)).toBeLessThan(0.05);
        expect(backward / n).toBeGreaterThan(0.45);
        expect(backward / n).toBeLessThan(0.55);
    });

    test('at 0 keeps the emit direction', () => {
        const p = spawn(new RandomizeDirection(0), [1, 2, 2]);
        expect(p.velocity.toArray()).toEqual([1, 2, 2]);
    });

    test('in between keeps particles nearer the emit direction, never turned around', () => {
        const behavior = new RandomizeDirection(0.5);
        let sumZ = 0;
        for (let i = 0; i < 2000; i++) {
            const p = spawn(behavior, [0, 0, 2]);
            expect(p.velocity.length()).toBeCloseTo(2, 4);
            // Half of the emit direction plus half of a unit vector never points backward.
            expect(p.velocity.z).toBeGreaterThanOrEqual(-1e-6);
            sumZ += p.velocity.z / 2;
        }
        expect(sumZ / 2000).toBeGreaterThan(0.6);
    });

    test('leaves a still particle alone and clamps the amount', () => {
        expect(spawn(new RandomizeDirection(1), [0, 0, 0]).velocity.length()).toBe(0);
        expect(spawn(new RandomizeDirection(-1), [0, 3, 0]).velocity.toArray()).toEqual([0, 3, 0]);
        expect(spawn(new RandomizeDirection(5), [0, 3, 0]).velocity.length()).toBeCloseTo(3, 4);
    });

    test('round-trips through JSON and clone', () => {
        const behavior = new RandomizeDirection(0.25);
        expect(behavior.toJSON()).toEqual({type: 'RandomizeDirection', amount: 0.25});
        expect((RandomizeDirection.fromJSON(behavior.toJSON()) as RandomizeDirection).amount).toBe(0.25);
        expect((behavior.clone() as RandomizeDirection).amount).toBe(0.25);
    });
});
