import {
    AxisAngleGenerator,
    Bezier,
    ConstantValue,
    Gradient,
    PiecewiseBezier,
    Quaternion,
    RandomColorBetweenGradient,
    RandomQuatGenerator,
    Vector3,
    Vector4,
} from '../../src';

describe('generators read before startGen', () => {
    it('RandomQuatGenerator rolls its own slots instead of reading another generator’s', () => {
        const gen = new RandomQuatGenerator();
        const memory = [0.9, 0.9];
        const first = gen.genValue(memory, new Quaternion(), 1, 0).clone();
        expect(memory).toHaveLength(6);
        expect(first.length()).toBeCloseTo(1, 6);
        expect(gen.genValue(memory, new Quaternion(), 1, 0).equals(first)).toBe(true);
    });

    it('RandomColorBetweenGradient keeps one mix instead of a new one per call', () => {
        const black = new Gradient([[new Vector3(0, 0, 0), 0]]);
        const white = new Gradient([[new Vector3(1, 1, 1), 0]]);
        const gen = new RandomColorBetweenGradient(black, white);
        const memory = [0.25];
        const first = gen.genColor(memory, new Vector4(), 0.5).clone();
        expect(memory).toHaveLength(2);
        expect(first.x).toBeCloseTo(memory[1], 6);
        for (let i = 0; i < 5; i++) expect(gen.genColor(memory, new Vector4(), 0.5).equals(first)).toBe(true);
    });
});

describe('AxisAngleGenerator', () => {
    it('rotates about the unit axis whatever the axis length, and about z for a zero axis', () => {
        const angle = new ConstantValue(1);
        const long = new AxisAngleGenerator(new Vector3(0, 0, 2), angle).genValue([], new Quaternion(), 0.5);
        const unit = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.5);
        expect(long.length()).toBeCloseTo(1, 9);
        expect(long.equals(unit)).toBe(true);
        const zero = new AxisAngleGenerator(new Vector3(0, 0, 0), angle).genValue([], new Quaternion(), 0.5);
        expect(zero.equals(unit)).toBe(true);
    });

    it('leaves its axis as given, so its JSON round-trips', () => {
        const gen = new AxisAngleGenerator(new Vector3(0, 3, 4), new ConstantValue(1));
        gen.genValue([], new Quaternion(), 1);
        expect(gen.toJSON().axis).toEqual({x: 0, y: 3, z: 4});
    });
});

describe('PiecewiseFunction.insertFunction', () => {
    it('keeps the pieces sorted wherever a piece is inserted, clamping to [0, 1]', () => {
        const curve = new PiecewiseBezier([[new Bezier(0, 0, 0, 0), 0]]);
        curve.insertFunction(1.2, new Bezier(1, 1, 1, 1));
        curve.insertFunction(0.5, new Bezier(2, 2, 2, 2));
        curve.insertFunction(-0.1, new Bezier(3, 3, 3, 3));
        curve.insertFunction(0.25, new Bezier(4, 4, 4, 4));
        expect(curve.functions.map(([, x]) => x)).toEqual([0, 0, 0.25, 0.5, 1]);
        expect(curve.functions.map(([f]) => f.p[0])).toEqual([0, 3, 4, 2, 1]);
    });
});
