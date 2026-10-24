import type {FunctionValueGenerator, RotationGenerator, ValueGenerator, Vector3Generator} from 'babylon.quarks';
import {Bezier, ConstantValue, IntervalValue, PiecewiseBezier, RandomBetweenCurves} from 'babylon.quarks';

/** A generator of one number: a constant or random value, or a curve over the particle's life. */
export type ScalarGenerator = ValueGenerator | FunctionValueGenerator;
/** Any generator a value field can be pointed at; ones that are not scalar read as the default. */
export type AnyGenerator = ScalarGenerator | Vector3Generator | RotationGenerator;
/**
 * How a value field produces its number: Unity's Constant, Random Between Two Constants, Curve or
 * Random Between Two Curves.
 */
export type ScalarMode = 'constant' | 'random' | 'curve' | 'curves';

/** Editable snapshot of a scalar value generator. */
export interface ScalarValueState {
    /** Which of the fields below is the value. */
    mode: ScalarMode;
    /** Constant value (mode: constant). */
    value: number;
    /** Lower end of the random range (mode: random). */
    min: number;
    /** Upper end of the random range (mode: random). */
    max: number;
    /** Cubic bezier control values over normalized lifetime (mode: curve; the first curve of curves). */
    curve: [number, number, number, number];
    /** The second curve's control values (mode: curves); the first curve's when left out. */
    curve2?: [number, number, number, number];
}

/**
 * What a value field shows for `generator`: its constant, its range or its first curve segment.
 * Anything else, including a missing generator, reads as the constant 1.
 */
export function readScalar(generator: AnyGenerator | undefined): ScalarValueState {
    const state: ScalarValueState = {
        mode: 'constant',
        value: 1,
        min: 0.5,
        max: 1.5,
        curve: [0, 1, 1, 0],
        curve2: [0, 1, 1, 0],
    };
    if (generator instanceof ConstantValue) {
        state.mode = 'constant';
        state.value = generator.value;
        state.min = generator.value * 0.5;
        state.max = generator.value * 1.5;
    } else if (generator instanceof IntervalValue) {
        state.mode = 'random';
        state.min = generator.a;
        state.max = generator.b;
        state.value = (generator.a + generator.b) / 2;
    } else if (generator instanceof PiecewiseBezier) {
        state.mode = 'curve';
        state.curve = firstSegment(generator) ?? state.curve;
        state.curve2 = state.curve;
        state.value = state.curve[0];
    } else if (generator instanceof RandomBetweenCurves) {
        state.mode = 'curves';
        state.curve = firstSegment(generator.curve1) ?? state.curve;
        state.curve2 = firstSegment(generator.curve2) ?? state.curve;
        state.value = state.curve[0];
    }
    return state;
}

/** The control values of a curve's first segment, if it has one. */
function firstSegment(curve: PiecewiseBezier): [number, number, number, number] | undefined {
    const first = curve.functions[0]?.[0];
    return first ? [first.p[0], first.p[1], first.p[2], first.p[3]] : undefined;
}

/** The generator a value field's state describes; a curve state builds a one-segment curve. */
export function buildScalar(state: ScalarValueState & {mode: 'curve'}): PiecewiseBezier;
export function buildScalar(state: ScalarValueState): ScalarGenerator;
export function buildScalar(state: ScalarValueState): ScalarGenerator {
    switch (state.mode) {
        case 'constant':
            return new ConstantValue(state.value);
        case 'random':
            return new IntervalValue(Math.min(state.min, state.max), Math.max(state.min, state.max));
        case 'curve':
            return new PiecewiseBezier([[new Bezier(...state.curve), 0]]);
        case 'curves':
            return new RandomBetweenCurves(
                new PiecewiseBezier([[new Bezier(...state.curve), 0]]),
                new PiecewiseBezier([[new Bezier(...(state.curve2 ?? state.curve)), 0]])
            );
    }
}

/** One segment of a piecewise bezier curve: start x (0..1) + four control values. */
export interface CurvePiece {
    /** Where the segment starts, 0..1 over the particle's life. */
    start: number;
    /** The segment's four bezier control values. */
    p: [number, number, number, number];
}

/**
 * Reads pieces from a PiecewiseBezier, or from the first curve of a RandomBetweenCurves (the
 * second with `second`). A constant reads as a flat curve, a random range as a flat curve at its
 * lower end (its upper with `second`), and other generators as one default segment.
 */
export function readPieces(generator: AnyGenerator | undefined, second = false): CurvePiece[] {
    if (generator instanceof RandomBetweenCurves) {
        return readPieces(second ? generator.curve2 : generator.curve1);
    }
    // A constant is a flat curve, and a random range two flat curves at its ends.
    if (generator instanceof ConstantValue || generator instanceof IntervalValue) {
        const value = generator instanceof ConstantValue ? generator.value : second ? generator.b : generator.a;
        return [{start: 0, p: [value, value, value, value]}];
    }
    if (generator instanceof PiecewiseBezier && generator.functions.length > 0) {
        return generator.functions.map(([bezier, start]) => ({
            start,
            p: [bezier.p[0], bezier.p[1], bezier.p[2], bezier.p[3]] as [number, number, number, number],
        }));
    }
    const fallback = readScalar(generator);
    return [{start: 0, p: fallback.curve}];
}

/** A piecewise bezier from segments, sorted by their start. */
export function buildCurve(pieces: CurvePiece[]): PiecewiseBezier {
    const sorted = [...pieces].sort((a, b) => a.start - b.start);
    return new PiecewiseBezier(sorted.map((piece) => [new Bezier(...piece.p), piece.start] as [Bezier, number]));
}

/**
 * `generator` as one curve (`'curve'`) or two (`'curves'`, Unity's Random Between Two Curves),
 * keeping every segment: one curve becomes both bounds of two, and two keep their first as one.
 * A constant is a flat curve, and a random range flat curves at its ends.
 */
export function withCurves(generator: AnyGenerator | undefined, mode: 'curve'): PiecewiseBezier;
export function withCurves(generator: AnyGenerator | undefined, mode: 'curves'): RandomBetweenCurves;
export function withCurves(
    generator: AnyGenerator | undefined,
    mode: 'curve' | 'curves'
): PiecewiseBezier | RandomBetweenCurves;
export function withCurves(
    generator: AnyGenerator | undefined,
    mode: 'curve' | 'curves'
): PiecewiseBezier | RandomBetweenCurves {
    const first = buildCurve(readPieces(generator));
    if (mode === 'curve') {
        return first;
    }
    const second = generator instanceof RandomBetweenCurves || generator instanceof IntervalValue;
    return new RandomBetweenCurves(first, buildCurve(readPieces(generator, second)));
}

/** Splits the piece containing x into two exact halves using Bezier.split. */
export function splitPieces(pieces: CurvePiece[], x: number): CurvePiece[] {
    const sorted = [...pieces].sort((a, b) => a.start - b.start);
    for (let i = 0; i < sorted.length; i++) {
        const end = i + 1 < sorted.length ? sorted[i + 1].start : 1;
        if (x > sorted[i].start + 0.02 && x < end - 0.02) {
            const t = (x - sorted[i].start) / (end - sorted[i].start);
            const {left, right} = new Bezier(...sorted[i].p).split(t);
            sorted.splice(
                i,
                1,
                {start: sorted[i].start, p: [left.p[0], left.p[1], left.p[2], left.p[3]]},
                {start: x, p: [right.p[0], right.p[1], right.p[2], right.p[3]]}
            );
            return sorted;
        }
    }
    return sorted;
}

/** Removes the boundary at pieces[index].start by merging with the previous piece. */
export function mergePieces(pieces: CurvePiece[], index: number): CurvePiece[] {
    if (index <= 0 || index >= pieces.length) {
        return pieces;
    }
    const sorted = [...pieces].sort((a, b) => a.start - b.start);
    const a = sorted[index - 1];
    const b = sorted[index];
    sorted.splice(index - 1, 2, {start: a.start, p: [a.p[0], a.p[1], b.p[2], b.p[3]]});
    return sorted;
}

/** Samples a cubic bezier defined by four control values at normalized t. */
export function sampleCurve(curve: [number, number, number, number], t: number): number {
    const [p0, p1, p2, p3] = curve;
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}
