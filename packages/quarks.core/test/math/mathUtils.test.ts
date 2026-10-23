import {
    ceilPowerOfTwo,
    clamp,
    damp,
    DEG2RAD,
    degToRad,
    denormalize,
    euclideanModulo,
    floorPowerOfTwo,
    generateUUID,
    inverseLerp,
    isPowerOfTwo,
    lerp,
    mapLinear,
    MathUtils,
    normalize,
    pingpong,
    Quaternion,
    RAD2DEG,
    radToDeg,
    randFloat,
    randFloatSpread,
    randInt,
    seededRandom,
    setQuaternionFromProperEuler,
    smootherstep,
    smoothstep,
    Vector3,
    Vector3View,
    Vector4View,
} from '../../src';
import {setRandomSource} from '../../src/util/random';

describe('MathUtils', () => {
    it('gathers every helper in one object', () => {
        expect(MathUtils.clamp).toBe(clamp);
        expect(MathUtils.DEG2RAD).toBe(DEG2RAD);
        expect(Object.keys(MathUtils)).toHaveLength(24);
    });

    it('converts angles', () => {
        expect(degToRad(180)).toBeCloseTo(Math.PI);
        expect(radToDeg(Math.PI)).toBeCloseTo(180);
        expect(DEG2RAD * RAD2DEG).toBeCloseTo(1);
    });

    it('clamps, wraps and maps', () => {
        expect(clamp(5, 0, 2)).toBe(2);
        expect(clamp(-1, 0, 2)).toBe(0);
        expect(euclideanModulo(-1, 3)).toBe(2);
        expect(euclideanModulo(4, 3)).toBe(1);
        expect(mapLinear(5, 0, 10, 100, 200)).toBe(150);
        expect(mapLinear(20, 0, 10, 100, 200)).toBe(300);
        expect(inverseLerp(2, 4, 3)).toBe(0.5);
        expect(inverseLerp(2, 2, 3)).toBe(0);
        expect(lerp(2, 4, 0.25)).toBe(2.5);
        expect(pingpong(0.5)).toBe(0.5);
        expect(pingpong(1.5)).toBe(0.5);
        expect(pingpong(3, 2)).toBe(1);
    });

    it('damps the same over one step or several of the same total length', () => {
        const once = damp(0, 10, 3, 0.2);
        const twice = damp(damp(0, 10, 3, 0.1), 10, 3, 0.1);
        expect(once).toBeCloseTo(twice);
        expect(damp(0, 10, 3, 0)).toBe(0);
    });

    it('steps smoothly between its edges', () => {
        expect(smoothstep(-1, 0, 1)).toBe(0);
        expect(smoothstep(2, 0, 1)).toBe(1);
        expect(smoothstep(0.5, 0, 1)).toBe(0.5);
        expect(smootherstep(-1, 0, 1)).toBe(0);
        expect(smootherstep(2, 0, 1)).toBe(1);
        expect(smootherstep(0.5, 0, 1)).toBe(0.5);
        expect(smootherstep(0.1, 0, 1)).toBeLessThan(smoothstep(0.1, 0, 1));
    });

    it('draws random numbers in their ranges from the library random source', () => {
        const values = [0, 0.999999];
        let i = 0;
        const previous = setRandomSource(() => values[i++ % 2]);
        try {
            expect(randInt(3, 5)).toBe(3);
            expect(randInt(3, 5)).toBe(5);
            expect(randFloat(1, 2)).toBe(1);
            expect(randFloat(1, 2)).toBeLessThan(2);
            expect(randFloatSpread(4)).toBe(2);
            expect(randFloatSpread(4)).toBeGreaterThan(-2);
        } finally {
            setRandomSource(previous ?? null);
        }
    });

    it('repeats a seeded sequence', () => {
        const first = [
            seededRandom(42),
            seededRandom(undefined as unknown as number),
            seededRandom(undefined as unknown as number),
        ];
        const again = [
            seededRandom(42),
            seededRandom(undefined as unknown as number),
            seededRandom(undefined as unknown as number),
        ];
        expect(again).toEqual(first);
        for (const value of first) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });

    it('makes version 4 UUIDs', () => {
        const uuid = generateUUID();
        expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(generateUUID()).not.toBe(uuid);
    });

    it('finds powers of two', () => {
        expect(isPowerOfTwo(8)).toBe(true);
        expect(isPowerOfTwo(6)).toBe(false);
        expect(isPowerOfTwo(0)).toBe(false);
        expect(ceilPowerOfTwo(5)).toBe(8);
        expect(ceilPowerOfTwo(8)).toBe(8);
        expect(floorPowerOfTwo(5)).toBe(4);
    });

    it('normalizes and denormalizes for every integer array type', () => {
        const cases: [ArrayLike<number>, number][] = [
            [new Float32Array(1), 1],
            [new Uint32Array(1), 4294967295],
            [new Uint16Array(1), 65535],
            [new Uint8Array(1), 255],
            [new Int32Array(1), 2147483647],
            [new Int16Array(1), 32767],
            [new Int8Array(1), 127],
        ];
        for (const [array, scale] of cases) {
            const typed = array as unknown as number[];
            const stored = normalize(0.5, typed);
            expect(stored).toBe(scale === 1 ? 0.5 : Math.round(0.5 * scale));
            expect(denormalize(stored, typed)).toBeCloseTo(0.5, 2);
        }
        expect(denormalize(-200, new Int8Array(1) as unknown as number[])).toBe(-1);
        expect(() => normalize(0.5, [])).toThrow();
        expect(() => denormalize(0.5, [])).toThrow();
    });

    it('sets quaternions from proper Euler angles in every proper order', () => {
        const axes = {X: new Vector3(1, 0, 0), Y: new Vector3(0, 1, 0), Z: new Vector3(0, 0, 1)};
        for (const order of ['XYX', 'YZY', 'ZXZ', 'XZX', 'YXY', 'ZYZ'] as const) {
            const q = new Quaternion();
            setQuaternionFromProperEuler(q, 0.3, 0.5, 0.7, order);
            const expected = new Quaternion()
                .setFromAxisAngle(axes[order[0] as 'X'], 0.3)
                .multiply(new Quaternion().setFromAxisAngle(axes[order[1] as 'X'], 0.5))
                .multiply(new Quaternion().setFromAxisAngle(axes[order[2] as 'X'], 0.7));
            expect(Math.abs(q.dot(expected))).toBeCloseTo(1);
        }
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            setQuaternionFromProperEuler(new Quaternion(), 0, 0, 0, 'XYZ');
            expect(warn).toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }
    });
});

describe('vector views', () => {
    it('read and write their components in a shared array at an offset', () => {
        const data = new Float32Array(8);
        const v3 = new Vector3View(data, 2);
        v3.set(1, 2, 3);
        expect(Array.from(data.slice(2, 5))).toEqual([1, 2, 3]);
        data[3] = 9;
        expect(v3.y).toBe(9);
        expect(v3.clone()).toBeInstanceOf(Vector3);
        v3.bind(data, 0);
        expect(v3.toArray()).toEqual([0, 0, 1]);
        const v4 = new Vector4View(data, 4);
        v4.set(1, 2, 3, 4);
        expect(Array.from(data.slice(4))).toEqual([1, 2, 3, 4]);
        expect(v4.w).toBe(4);
        v4.bind(data, 0);
        expect(v4.x).toBe(0);
    });
});
