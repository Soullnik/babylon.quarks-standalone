import {ConstantValue, IntervalValue, PiecewiseBezier} from 'quarks.core';
import type {ParticleSystem} from '../ParticleSystem';

export const MIN_GPU_CAPACITY = 256;
export const MAX_GPU_CAPACITY = 1 << 20;

/** Conservative upper bound of a value generator's output, or undefined. */
export function maxOfGenerator(gen: unknown): number | undefined {
    if (gen instanceof ConstantValue) {
        return gen.value;
    }
    if (gen instanceof IntervalValue) {
        return Math.max(gen.a, gen.b);
    }
    if (gen instanceof PiecewiseBezier) {
        // A cubic Bezier stays within the convex hull of its control points.
        let max = -Infinity;
        for (const [bezier] of gen.functions) {
            for (const p of (bezier as any).p as number[]) {
                max = Math.max(max, p);
            }
        }
        return Number.isFinite(max) ? max : undefined;
    }
    return undefined;
}

/**
 * Estimates the GPU particle-slot capacity for a system: steady-state emission
 * (rate x max life) with 1.2x headroom for the one-frame freelist latency,
 * plus burst peaks. Falls back to a generous default when generators aren't
 * statically boundable.
 */
export function estimateCapacity(system: ParticleSystem, explicitMax?: number): number {
    if (explicitMax !== undefined && explicitMax > 0) {
        return clampCapacity(explicitMax);
    }
    const rate = maxOfGenerator(system.emissionOverTime) ?? 100;
    const life = maxOfGenerator(system.startLife) ?? 5;
    let estimate = rate * life * 1.2;
    for (const burst of system.emissionBursts) {
        estimate += maxOfGenerator(burst.count) ?? 100;
    }
    const overDistance = maxOfGenerator(system.emissionOverDistance) ?? 0;
    if (overDistance > 0) {
        // Distance emission is unbounded in theory; assume a moving emitter
        // covers up to ~20 units/s.
        estimate += overDistance * life * 20;
    }
    return clampCapacity(Math.ceil(estimate));
}

function clampCapacity(value: number): number {
    const clamped = Math.min(MAX_GPU_CAPACITY, Math.max(MIN_GPU_CAPACITY, value));
    // round up to whole workgroups
    return Math.ceil(clamped / 64) * 64;
}
