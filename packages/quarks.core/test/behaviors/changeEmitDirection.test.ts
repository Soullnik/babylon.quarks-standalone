import {ChangeEmitDirection, ConstantValue, IntervalValue, SpriteParticle} from '../../src';

function spawn(behavior: ChangeEmitDirection, velocity: [number, number, number]) {
    const p = new SpriteParticle();
    p.life = 1;
    p.velocity.set(...velocity);
    behavior.initialize(p);
    return p;
}

describe('ChangeEmitDirection', () => {
    test('turns a particle by a random angle in the range and keeps its speed', () => {
        const behavior = new ChangeEmitDirection(new IntervalValue(0.1, 0.5));
        for (let i = 0; i < 200; i++) {
            const p = spawn(behavior, [0, 0, 3]);
            expect(p.velocity.length()).toBeCloseTo(3, 5); // velocities are float32
            const angle = Math.acos(Math.min(1, p.velocity.z / 3));
            expect(angle).toBeGreaterThanOrEqual(0.1 - 1e-6);
            expect(angle).toBeLessThanOrEqual(0.5 + 1e-6);
        }
        // One sample per spawn, not one more every spawn.
        expect(behavior.memory.length).toBe(1);
    });

    test('a constant angle turns every particle by exactly that angle', () => {
        const behavior = new ChangeEmitDirection(new ConstantValue(Math.PI / 4));
        for (let i = 0; i < 20; i++) {
            const p = spawn(behavior, [2, 0, 0]);
            expect(Math.acos(p.velocity.x / 2)).toBeCloseTo(Math.PI / 4, 5);
        }
    });

    test('leaves a still particle alone and reset() clears its scratch', () => {
        const behavior = new ChangeEmitDirection(new IntervalValue(0.1, 0.5));
        const p = spawn(behavior, [0, 0, 0]);
        expect(p.velocity.length()).toBe(0);
        spawn(behavior, [0, 1, 0]);
        behavior.reset();
        expect(behavior.memory).toEqual([]);
    });
});
