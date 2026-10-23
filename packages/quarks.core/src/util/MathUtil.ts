import {MathUtils, Vector3} from '../math';
import {random} from './random';

export function randomInt(a: number, b: number): number {
    return Math.floor(random() * (b - a)) + a;
}

/**
 * A radius fraction in [1 - `thickness`, 1] (Unity's Radius Thickness), uniform over the area of
 * that ring (`dimension` 2) or the volume of that shell (`dimension` 3), so a full-thickness disc or
 * ball is evenly filled rather than crowded at its centre. `thickness` is clamped to [0, 1], and NaN
 * is read as 1. Draws one random number.
 */
export function shellRadius(thickness: number, dimension: 2 | 3): number {
    const inner = Number.isNaN(thickness) ? 0 : 1 - MathUtils.clamp(thickness, 0, 1);
    const roll = MathUtils.lerp(Math.pow(inner, dimension), 1, random());
    return dimension === 2 ? Math.sqrt(roll) : Math.cbrt(roll);
}

export const UP_VEC3 = new Vector3(0, 1, 0);
export const ZERO_VEC3 = new Vector3(0, 0, 0);
export const ONE_VEC3 = new Vector3(1, 1, 1);
export const Z_VEC3 = new Vector3(0, 0, 1);
