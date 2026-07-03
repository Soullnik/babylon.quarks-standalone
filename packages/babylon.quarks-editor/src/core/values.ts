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

/** Samples a cubic bezier defined by four control values at normalized t. */
export function sampleCurve(curve: [number, number, number, number], t: number): number {
    const [p0, p1, p2, p3] = curve;
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}
