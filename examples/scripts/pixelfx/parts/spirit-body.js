// pixelfx fire/spirit-flame's body alone (tongue, side wisps, strands), for a flipbook.
// The layered tongue, its noise-torn edges and the shed puffs are adapted from Sprite Fusion's open-source fire
// (https://www.spritefusion.com/pixel-art-vfx/fire), MIT License, Copyright (c) 2026 Hugo Duprez.
import {fit, TAU} from '../../core/index.js';
import {hotFirst, noiseFor} from '../fire/_lib.js';

export const meta = {
    name: 'Spirit flame body',
    size: [44, 60],
    origin: [22, 56],
    duration: 3,
    loop: true,
    fps: 12,
    bg: 'none',
    options: {
        palette: ['#040a16', '#08203a', '#0b3a52', '#0f5e6e', '#16908e', '#2cc4b4', '#7ef0dc', '#c8fff2', '#ffffff'],
        seed: 7,
    },
};
const D = meta.duration,
    NL = noiseFor(D);
// inverted layers: the rim burns brightest, a teal band inside it, a dark hollow heart, a pale core low down
const GHOST = [
    [1, 1, 1],
    [0.8, 0.92, 3],
    [0.6, 0.78, 6],
    [0.3, 0.42, 2],
    [0.14, 0.22, 0],
];

// a tongue whose centre line carries a wave climbing it: drawn row by row in layers like a fire tongue
function ghostTongue(p, x, y, h, w, centre, N, n, H, layers, jit = 0.5) {
    for (const [lw, lh, ri] of layers) {
        const L = h * lh,
            c = H[ri];
        for (let r = 0; r <= L; r++) {
            const u = r / Math.max(1, L),
                v = r / h;
            // a teardrop: round at the bottom, swelling, then drawn out thin
            const half = w * lw * Math.pow(1 - u, 0.75) * Math.min(1, (r + 1.5) / 4) + N(6, n, r * 0.4) * jit * u;
            if (half < 0.3) continue;
            const cx = x + centre(v, r),
                Y = Math.round(y - r);
            for (let px = Math.round(cx - half), x1 = Math.round(cx + half); px <= x1; px++) p.px(px, Y, c);
        }
    }
}

export function draw(p, t, o) {
    const F = fit(o.palette, 9),
        H = hotFirst(F),
        S = o.seed,
        ph = t / D;
    const N = (rate, seed = 0, off = 0) => NL(t, rate, seed, off);
    const bob = 0;
    // the wave: it climbs the flame twice a loop, growing toward the tip, and the whole flame leans with a slow drift
    const lean = N(0.67, S + 2) * 3;
    const wave = (v, r, k = 0) =>
        (Math.sin(r * 0.24 - ph * TAU * 2 + k) * 2.2 + Math.sin(r * 0.11 - ph * TAU + k * 0.5) * 3.2) * v * v +
        lean * v * v;
    const H0 = 44 * (0.92 + 0.08 * N(1.3, S + 3)),
        y0 = bob;

    // two thin wisps trailing off the sides, then the body
    // side wisps that flicker out and curl, now long, now gone
    const wl = Math.max(0, 0.25 + 0.55 * N(1.7, S + 6)),
        wr = Math.max(0, 0.25 + 0.55 * N(1.7, S + 7));
    if (wl > 0.12)
        ghostTongue(
            p,
            -4,
            y0 - 4,
            H0 * wl,
            2.4,
            (v, r) => wave(v, r, 2.1) - 6 * v * v + 3 * Math.sin(v * 5 - ph * TAU * 2) * v,
            N,
            S * 11 + 1,
            H,
            GHOST
        );
    if (wr > 0.12)
        ghostTongue(
            p,
            4.2,
            y0 - 4,
            H0 * wr,
            2.4,
            (v, r) => wave(v, r, -1.8) + 6 * v * v - 3 * Math.sin(v * 5 - ph * TAU * 2 + 1) * v,
            N,
            S * 11 + 2,
            H,
            GHOST
        );
    ghostTongue(p, 0, y0, H0, 8.6, (v, r) => wave(v, r), N, S * 11, H, GHOST, 0.6);
    // bright strands drifting up through the hollow heart
    for (const k of [0, 1]) {
        for (let r = 4; r < H0 * 0.72; r++) {
            const v = r / H0,
                x = wave(v, r) + Math.sin(r * 0.35 - ph * TAU * 3 + k * Math.PI) * 2.2 * (1 - v),
                on = Math.sin(r * 0.2 - ph * TAU * 4 + k * 2) > 0.2;
            if (on) p.px(x, y0 - r, k ? H[2] : H[1]);
        }
    }
}
