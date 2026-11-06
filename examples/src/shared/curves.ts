import {Color3} from '@babylonjs/core/Maths/math.color';
import {Bezier, Gradient, PiecewiseBezier} from 'babylon.quarks';

/** A curve over a particle's life through `[t, value]` points, straight between them. */
export function curve(keys: readonly (readonly [number, number])[]): PiecewiseBezier {
    const pieces: [Bezier, number][] = [];
    for (let i = 0; i < keys.length - 1; i++) {
        const [t, a] = keys[i];
        const b = keys[i + 1][1];
        pieces.push([new Bezier(a, a + (b - a) / 3, a + ((b - a) * 2) / 3, b), t]);
    }
    if (pieces.length === 0) {
        const v = keys[0]?.[1] ?? 1;
        pieces.push([new Bezier(v, v, v, v), 0]);
    }
    return new PiecewiseBezier(pieces);
}

/**
 * White over life, its alpha in by `fadeIn` of the life and out from `fadeOut`: the start
 * colour shows as it is, faded at both ends.
 */
export function fade(fadeIn: number, fadeOut: number): Gradient {
    return new Gradient(
        [
            [new Color3(1, 1, 1), 0],
            [new Color3(1, 1, 1), 1],
        ],
        [
            [0, 0],
            [1, fadeIn],
            [1, fadeOut],
            [0, 1],
        ]
    );
}
