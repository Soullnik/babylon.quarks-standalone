import {DynamicTexture} from '@babylonjs/core/Materials/Textures/dynamicTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import type {Scene} from '@babylonjs/core/scene';

/**
 * Procedural particle textures for the pixelfx gallery, painted on canvases at start-up so the
 * demos carry no image assets. All are white on transparent: the particle colour tints them.
 */
export type TextureName =
    | 'glow'
    | 'dot'
    | 'smoke'
    | 'flame'
    | 'ring'
    | 'shock'
    | 'glint'
    | 'flake'
    | 'shard'
    | 'square'
    | 'bolt'
    | 'crack'
    | 'swirl'
    | 'rune'
    | 'streak'
    | 'white'
    | 'burst'
    | 'pow';

/** How a texture is split into tiles, for `uTileCount` / `vTileCount` and random tile picks. */
export interface TextureSheet {
    texture: Texture;
    u: number;
    v: number;
}

type Painter = (image: ImageData, size: number) => void;
type CanvasPainter = (ctx: CanvasRenderingContext2D, size: number) => void;

interface TextureSpec {
    size: number;
    u?: number;
    v?: number;
    paint: Painter | {canvas: CanvasPainter};
}

/** A small seeded random, so the painted textures look the same on every load. */
function seeded(seed: number) {
    let s = seed >>> 0 || 1;
    return () => {
        s = (s * 16807) % 2147483647;
        return s / 2147483647;
    };
}

/** Smooth 2D value noise in [0, 1], tiling with period `period`. */
function valueNoise(seed: number, period: number) {
    const random = seeded(seed);
    const grid = new Float32Array(period * period);
    for (let i = 0; i < grid.length; i++) grid[i] = random();
    const at = (x: number, y: number) =>
        grid[(((y % period) + period) % period) * period + (((x % period) + period) % period)];
    return (x: number, y: number) => {
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        const fx = x - xi;
        const fy = y - yi;
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);
        const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * sx;
        const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * sx;
        return a + (b - a) * sy;
    };
}

/** Fractal noise: four octaves of value noise. */
function fbm(seed: number) {
    const layers = [valueNoise(seed, 4), valueNoise(seed + 1, 8), valueNoise(seed + 2, 16), valueNoise(seed + 3, 32)];
    return (u: number, v: number) => {
        let sum = 0;
        let amp = 0.5;
        let norm = 0;
        for (let i = 0; i < layers.length; i++) {
            const f = 4 << i;
            sum += layers[i](u * f, v * f) * amp;
            norm += amp;
            amp *= 0.5;
        }
        return sum / norm;
    };
}

/** Fills each pixel from `fn(u, v)` → alpha in [0, 1], over a tile `(tx, ty)` of a `tiles`×`tiles` sheet. */
function fillAlpha(image: ImageData, size: number, fn: (u: number, v: number, tile: number) => number, tiles = 1) {
    const tileSize = size / tiles;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const tx = Math.floor(x / tileSize);
            const ty = Math.floor(y / tileSize);
            const u = (x - tx * tileSize + 0.5) / tileSize;
            const v = (y - ty * tileSize + 0.5) / tileSize;
            const a = Math.max(0, Math.min(1, fn(u, v, ty * tiles + tx)));
            const i = (y * size + x) * 4;
            image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
            image.data[i + 3] = Math.round(a * 255);
        }
    }
}

const smoothstep = (e0: number, e1: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
};

/** Distance from (u, v) to the tile centre, 0 at the centre and 1 at the edge midpoints. */
const radius = (u: number, v: number) => Math.hypot(u - 0.5, v - 0.5) * 2;

const SPECS: Record<TextureName, TextureSpec> = {
    // A jagged comic-book burst star with an irregular rim.
    burst: {
        size: 128,
        paint: {
            canvas: (ctx, s) => {
                const random = seeded(53);
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                const points = 14;
                for (let i = 0; i < points * 2; i++) {
                    const r =
                        (i % 2 === 0 ? 0.47 : 0.27 + random() * 0.08) * s * (i % 2 === 0 ? 0.8 + random() * 0.2 : 1);
                    const a = (i / (points * 2)) * Math.PI * 2;
                    const x = s / 2 + Math.cos(a) * r;
                    const y = s / 2 + Math.sin(a) * r;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.fill();
            },
        },
    },
    // Comic lettering, white with a soft halo stroked round it.
    pow: {
        size: 256,
        paint: {
            canvas: (ctx, s) => {
                ctx.font = `900 ${Math.round(s * 0.36)}px Impact, 'Arial Black', sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.translate(s / 2, s / 2);
                ctx.rotate(-0.12);
                ctx.lineWidth = s * 0.04;
                ctx.strokeStyle = 'rgba(255,255,255,0.55)';
                ctx.strokeText('POW!', 0, 0);
                ctx.fillStyle = '#fff';
                ctx.fillText('POW!', 0, 0);
            },
        },
    },
    // Plain white: mesh particles, which take their look from colour and light.
    white: {size: 4, paint: (img, s) => fillAlpha(img, s, () => 1)},
    // Soft round falloff: light, heat, mist.
    glow: {size: 64, paint: (img, s) => fillAlpha(img, s, (u, v) => Math.pow(Math.max(0, 1 - radius(u, v)), 2))},
    // A crisp disc with a thin soft rim: sparks, drops, embers, motes.
    dot: {size: 64, paint: (img, s) => fillAlpha(img, s, (u, v) => 1 - smoothstep(0.7, 0.95, radius(u, v)))},
    // Four billowing puffs in a 2×2 sheet: smoke, dust, steam, cloud.
    smoke: {
        size: 256,
        u: 2,
        v: 2,
        paint: (img, s) => {
            const noises = [fbm(11), fbm(23), fbm(37), fbm(41)];
            fillAlpha(
                img,
                s,
                (u, v, tile) => {
                    const n = noises[tile](u, v);
                    const r = radius(u, v) + (n - 0.5) * 0.7;
                    return (1 - smoothstep(0.35, 0.95, r)) * (0.55 + 0.45 * n);
                },
                2
            );
        },
    },
    // Four tongues of flame in a 2×2 sheet, tip up: wide at the base, torn at the tip.
    flame: {
        size: 256,
        u: 2,
        v: 2,
        paint: (img, s) => {
            const noises = [fbm(5), fbm(7), fbm(13), fbm(17)];
            fillAlpha(
                img,
                s,
                (u, v, tile) => {
                    const n = noises[tile](u * 0.8, v * 0.6);
                    // v runs down the canvas: the tip is at the top.
                    const h = 1 - v;
                    const width = 0.4 * Math.pow(Math.max(0, 1 - h), 0.7) * (0.7 + 0.6 * n) + 0.02;
                    const dx = Math.abs(u - 0.5 + (n - 0.5) * 0.3 * h);
                    const body = 1 - smoothstep(width * 0.25, width, dx);
                    const base = smoothstep(0.02, 0.22, h) * (1 - smoothstep(0.55, 0.98, h));
                    return body * base * (0.55 + 0.45 * n);
                },
                2
            );
        },
    },
    // A thin soft ring: ripples, halos, shock rings.
    ring: {
        size: 128,
        paint: (img, s) =>
            fillAlpha(img, s, (u, v) => Math.pow(Math.max(0, 1 - Math.abs(radius(u, v) - 0.86) / 0.1), 2)),
    },
    // A ring with a sharp outer edge and a long fade inward: a shockwave front.
    shock: {
        size: 128,
        paint: (img, s) =>
            fillAlpha(img, s, (u, v) => {
                const r = radius(u, v);
                return r > 0.95 ? 0 : Math.pow(r / 0.95, 4) * (1 - smoothstep(0.9, 0.95, r));
            }),
    },
    // A four-point glint with a glow: twinkles, sparkles, star bursts.
    glint: {
        size: 64,
        paint: (img, s) =>
            fillAlpha(img, s, (u, v) => {
                const dx = Math.abs(u - 0.5) * 2;
                const dy = Math.abs(v - 0.5) * 2;
                const arms = Math.max(Math.max(0, 1 - dx * 8) * (1 - dy), Math.max(0, 1 - dy * 8) * (1 - dx));
                const core = Math.pow(Math.max(0, 1 - radius(u, v) * 1.6), 2);
                return Math.max(arms * arms, core);
            }),
    },
    // A six-armed snowflake.
    flake: {
        size: 64,
        paint: {
            canvas: (ctx, s) => {
                ctx.strokeStyle = '#fff';
                ctx.lineCap = 'round';
                ctx.translate(s / 2, s / 2);
                for (let i = 0; i < 6; i++) {
                    ctx.rotate(Math.PI / 3);
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(0, -s * 0.44);
                    ctx.stroke();
                    ctx.lineWidth = 3;
                    for (const [at, len] of [
                        [0.22, 0.1],
                        [0.33, 0.07],
                    ]) {
                        ctx.beginPath();
                        ctx.moveTo(-s * len, -s * (at + len));
                        ctx.lineTo(0, -s * at);
                        ctx.lineTo(s * len, -s * (at + len));
                        ctx.stroke();
                    }
                }
            },
        },
    },
    // A long thin diamond: shards, splinters, crystals, slivers of light.
    shard: {
        size: 64,
        paint: {
            canvas: (ctx, s) => {
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.moveTo(s / 2, 2);
                ctx.lineTo(s * 0.68, s * 0.62);
                ctx.lineTo(s / 2, s - 2);
                ctx.lineTo(s * 0.32, s * 0.62);
                ctx.closePath();
                ctx.fill();
            },
        },
    },
    // A filled square: chunks, debris, confetti, pixels.
    square: {
        size: 16,
        paint: (img, s) => fillAlpha(img, s, (u, v) => (Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) < 0.42 ? 1 : 0)),
    },
    // Four jagged bolts in a 1×4 sheet, each running along U: beams and arcs that flicker between rows.
    bolt: {
        size: 256,
        u: 1,
        v: 4,
        paint: {
            canvas: (ctx, s) => {
                const rows = 4;
                const rowHeight = s / rows;
                for (let r = 0; r < rows; r++) {
                    const mid = rowHeight * (r + 0.5);
                    for (const [width, alpha] of [
                        [9, 0.18],
                        [5, 0.35],
                        [2, 1],
                    ]) {
                        const random = seeded(7 + r * 131);
                        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
                        ctx.lineWidth = width;
                        ctx.lineJoin = 'round';
                        ctx.beginPath();
                        ctx.moveTo(0, mid);
                        for (let x = 10; x <= s; x += 10) {
                            const envelope = Math.sin((x / s) * Math.PI);
                            ctx.lineTo(x, mid + (random() - 0.5) * rowHeight * 0.75 * envelope);
                        }
                        ctx.stroke();
                    }
                }
            },
        },
    },
    // Jagged cracks running out from the centre: a decal for scorched or broken ground.
    crack: {
        size: 128,
        paint: {
            canvas: (ctx, s) => {
                const random = seeded(29);
                ctx.strokeStyle = '#fff';
                ctx.lineCap = 'round';
                for (let i = 0; i < 9; i++) {
                    let a = (i / 9) * Math.PI * 2 + random() * 0.4;
                    let x = s / 2;
                    let y = s / 2;
                    let w = 4;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    const steps = 5 + Math.floor(random() * 3);
                    for (let k = 0; k < steps; k++) {
                        a += (random() - 0.5) * 0.9;
                        const len = s * (0.05 + random() * 0.05);
                        x += Math.cos(a) * len;
                        y += Math.sin(a) * len;
                        ctx.lineWidth = w;
                        ctx.lineTo(x, y);
                        w = Math.max(1, w * 0.8);
                    }
                    ctx.stroke();
                }
            },
        },
    },
    // Three spiral arms winding into the centre: vortices, portals, whirlpools.
    swirl: {
        size: 128,
        paint: (img, s) =>
            fillAlpha(img, s, (u, v) => {
                const dx = u - 0.5;
                const dy = v - 0.5;
                const r = Math.hypot(dx, dy) * 2;
                const a = Math.atan2(dy, dx);
                const arm = 0.5 + 0.5 * Math.cos(a * 3 + r * 9);
                return Math.pow(arm, 3) * smoothstep(1, 0.6, r) * smoothstep(0.02, 0.2, r);
            }),
    },
    // A magic circle: two rings, a hexagram and tick marks between them.
    rune: {
        size: 256,
        paint: {
            canvas: (ctx, s) => {
                ctx.strokeStyle = '#fff';
                ctx.translate(s / 2, s / 2);
                const r = s * 0.47;
                for (const [rad, w] of [
                    [r, 4],
                    [r * 0.84, 2],
                    [r * 0.3, 2],
                ]) {
                    ctx.lineWidth = w;
                    ctx.beginPath();
                    ctx.arc(0, 0, rad, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.lineWidth = 2.5;
                for (const offset of [0, Math.PI / 3]) {
                    ctx.beginPath();
                    for (let i = 0; i <= 3; i++) {
                        const a = offset + (i / 3) * Math.PI * 2 - Math.PI / 2;
                        const x = Math.cos(a) * r * 0.84;
                        const y = Math.sin(a) * r * 0.84;
                        if (i === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    ctx.stroke();
                }
                ctx.lineWidth = 3;
                for (let i = 0; i < 24; i++) {
                    const a = (i / 24) * Math.PI * 2;
                    const inner = i % 2 === 0 ? r * 0.86 : r * 0.9;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
                    ctx.lineTo(Math.cos(a) * r * 0.98, Math.sin(a) * r * 0.98);
                    ctx.stroke();
                }
            },
        },
    },
    // A soft horizontal streak, bright in the middle: wind lines, speed lines, motion blur.
    streak: {
        size: 64,
        paint: (img, s) =>
            fillAlpha(
                img,
                s,
                (u, v) => Math.pow(Math.sin(u * Math.PI), 1.5) * Math.pow(Math.max(0, 1 - Math.abs(v - 0.5) * 4), 2)
            ),
    },
};

const cache = new WeakMap<Scene, Map<TextureName, TextureSheet>>();

/** The named texture for this scene, painted once and shared by every system that uses it. */
export function sheet(scene: Scene, name: TextureName): TextureSheet {
    let map = cache.get(scene);
    if (!map) {
        map = new Map();
        cache.set(scene, map);
    }
    const found = map.get(name);
    if (found) return found;
    const spec = SPECS[name];
    const texture = new DynamicTexture(`pixelfx-${name}`, {width: spec.size, height: spec.size}, scene, true);
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, spec.size, spec.size);
    if (typeof spec.paint === 'function') {
        const image = ctx.createImageData(spec.size, spec.size);
        spec.paint(image, spec.size);
        ctx.putImageData(image, 0, 0);
    } else {
        ctx.save();
        spec.paint.canvas(ctx, spec.size);
        ctx.restore();
    }
    texture.update(true);
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    const result = {texture, u: spec.u ?? 1, v: spec.v ?? 1};
    map.set(name, result);
    return result;
}
