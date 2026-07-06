import {Quaternion, RandomQuatGenerator} from '../../src';

describe('RandomQuatGenerator', () => {
    test('.toJSON', () => {
        const gen = new RandomQuatGenerator();
        expect(gen.toJSON().type).toBe('RandomQuat');
    });

    test('.fromJSON', () => {
        const gen = RandomQuatGenerator.fromJSON({type: 'RandomQuat'});
        expect(gen).toBeInstanceOf(RandomQuatGenerator);
    });

    test('.genValue produces a unit quaternion', () => {
        const gen = new RandomQuatGenerator();
        const memory: any[] = [];
        gen.startGen(memory);
        const q = new Quaternion();
        gen.genValue(memory, q, 1, 0);
        const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
        expect(len).toBeCloseTo(1, 5);
    });

    test('produces a fresh sample per particle', () => {
        // Mirrors the per-particle spawn pattern: each particle owns its own
        // memory array, startGen claims a slot and rolls a sample, genValue
        // reads it back. Two particles must not share the same sample.
        const gen = new RandomQuatGenerator();
        const samples: Quaternion[] = [];
        for (let i = 0; i < 5; i++) {
            const memory: any[] = [];
            gen.startGen(memory);
            const q = new Quaternion();
            gen.genValue(memory, q, 1, 0);
            samples.push(q);
        }
        for (let i = 0; i < samples.length; i++) {
            for (let j = i + 1; j < samples.length; j++) {
                expect(samples[i].x).not.toBe(samples[j].x);
            }
        }
    });

    test('preserves the per-particle sample across genValue calls', () => {
        // Once startGen has stored a slot, repeated genValue calls on the
        // same memory return the same quat (rotation stays stable over the
        // particle's lifetime).
        const gen = new RandomQuatGenerator();
        const memory: any[] = [];
        gen.startGen(memory);
        const q1 = new Quaternion();
        gen.genValue(memory, q1, 1, 0);
        const q2 = new Quaternion();
        gen.genValue(memory, q2, 1, 0.5);
        expect(q2.x).toBe(q1.x);
        expect(q2.y).toBe(q1.y);
        expect(q2.z).toBe(q1.z);
        expect(q2.w).toBe(q1.w);
    });
});
