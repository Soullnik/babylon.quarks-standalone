import {Bezier, ConstantValue, IntervalValue, PiecewiseBezier} from 'babylon.quarks';
import type {FunctionValueGenerator, ValueGenerator} from 'babylon.quarks';

export type ScalarGenerator = ValueGenerator | FunctionValueGenerator;
export type ScalarMode = 'constant' | 'random' | 'curve';

/** Editable snapshot of a scalar value generator. */
export interface ScalarValueState {
    mode: ScalarMode;
    /** Constant value (mode: constant). */
    value: number;
    /** Random range (mode: random). */
    min: number;
    max: number;
    /** Cubic bezier control values over normalized lifetime (mode: curve). */
    curve: [number, number, number, number];
}

export function readScalar(generator: ScalarGenerator | undefined): ScalarValueState {
    const state: ScalarValueState = {mode: 'constant', value: 1, min: 0.5, max: 1.5, curve: [0, 1, 1, 0]};
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
        const first = generator.functions[0]?.[0];
        if (first) {
            state.curve = [first.p[0], first.p[1], first.p[2], first.p[3]];
            state.value = first.p[0];
        }
    }
    return state;
}

export function buildScalar(state: ScalarValueState): ScalarGenerator {
    switch (state.mode) {
        case 'constant':
            return new ConstantValue(state.value);
        case 'random':
            return new IntervalValue(Math.min(state.min, state.max), Math.max(state.min, state.max));
        case 'curve':
            return new PiecewiseBezier([[new Bezier(...state.curve), 0]]);
    }
}

/** One segment of a piecewise bezier curve: start x (0..1) + four control values. */
export interface CurvePiece {
    start: number;
    p: [number, number, number, number];
}

/** Reads pieces from a PiecewiseBezier (or synthesizes one segment for other generators). */
export function readPieces(generator: ScalarGenerator | undefined): CurvePiece[] {
    if (generator instanceof PiecewiseBezier && generator.functions.length > 0) {
        return generator.functions.map(([bezier, start]) => ({
            start,
            p: [bezier.p[0], bezier.p[1], bezier.p[2], bezier.p[3]] as [number, number, number, number],
        }));
    }
    const fallback = readScalar(generator);
    return [{start: 0, p: fallback.curve}];
}

export function buildCurve(pieces: CurvePiece[]): PiecewiseBezier {
    const sorted = [...pieces].sort((a, b) => a.start - b.start);
    return new PiecewiseBezier(sorted.map((piece) => [new Bezier(...piece.p), piece.start] as [Bezier, number]));
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
