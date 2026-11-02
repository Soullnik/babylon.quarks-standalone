import {DynamicTexture} from '@babylonjs/core/Materials/Textures/dynamicTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Scene} from '@babylonjs/core/scene';
import {BoxEmitter, ConeEmitter, ConstantValue, RenderMode, SphereEmitter, Vector3Function} from 'babylon.quarks';
import {
    airDrag,
    extrude,
    fadeOut,
    floorBounce,
    gravity,
    grow,
    lathe,
    popOut,
    quad,
    tint,
    wobble,
    type Geometry,
} from './kit';
import {gate, type At} from './parts';
import {flash, shockwave} from './recipes';
import {hero} from './spawn';
import {type FxBuilder, type FxDef} from './stage';

const WARM = ['#1a120c', '#33241a', '#5a4030', '#8a6848', '#c09a6a', '#e8cc98', '#fff0cc', '#ffffff'];
const EMBER = ['#4a1712', '#8a1f17', '#c9281f', '#f2561d', '#ff8a2a', '#ffc23d', '#ffe26b', '#fff3a6', '#ffffff'];
const CRT = ['#060a14', '#0e1a33', '#1a3360', '#2a5a9a', '#4a8fd0', '#8cc4f0', '#d4ecff', '#ffffff'];
const ARCANE = ['#140a24', '#2c1250', '#4b1d86', '#7330c0', '#a050f0', '#c890ff', '#ecd4ff', '#ffffff'];
const CYBER = ['#0a0a1a', '#141a3a', '#1e2f66', '#2a4f9e', '#3cc8ff', '#a0f0ff', '#e8ffff', '#ffffff'];
const SPOT = ['#1c140c', '#3b2a18', '#6e5233', '#a8875a', '#d9bd8a', '#f3e2bd', '#fff7e8', '#ffffff'];
const NEON = ['#120818', '#2a0e3a', '#4a1670', '#7a22b0', '#b03ae8', '#e070ff', '#ffc0ff', '#ffffff'];
const GLASS = ['#0c1430', '#162c5c', '#1f4f94', '#2f7fcc', '#58b4ec', '#9bdcff', '#d8f4ff', '#ffffff'];
const STEEL = ['#151a3d', '#212f6b', '#2c58aa', '#3a8bd8', '#62c8f4', '#b8c9e8', '#e8f1ff', '#ffffff'];
const GOLD = ['#2a1604', '#5e3208', '#a05c0c', '#e09414', '#ffc626', '#ffe866', '#fff8c4', '#ffffff'];

/** The screen every transition plays over: a panel in front of the hero, `W` by `H`, centred at `S`. */
const W = 4.2;
const H = 2.6;
const S: At = [0, 1.35, 1.2];
const COVER = '#0b0a12';
const VIEW = {height: 1.35, distance: 6.4};

const HIDE = 1e-4;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const easeIn = (x: number) => x ** 3;
/** A seeded hash in [0, 1). */
const hash = (i: number) => {
    const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
};

const QUAD = quad();

/** What the transitions cover: the hero and a warm pool of light, a scene to wipe away. */
function backdrop(fx: FxBuilder, period: number) {
    hero(fx, {period});
    fx.sys({
        tex: 'glow',
        mode: RenderMode.HorizontalBillBoard,
        life: period,
        size: 3,
        burst: [[0, 1]],
        color: '#5a6a9a',
        alpha: 0.35,
        at: [0, 0.012, 0],
        order: 0,
    });
}

/**
 * A flat frame round a hole: quads from each point of `inner` out to the same point scaled by
 * `k`, so the frame closes on the hole as its node scales down and still reaches far out.
 */
function holeFrame(inner: Array<[number, number]>, k: number): Geometry {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const n = inner.length;
    for (let i = 0; i < n; i++) {
        const [x, y] = inner[i];
        positions.push(x, y, 0, x * k, y * k, 0);
        normals.push(0, 0, 1, 0, 0, 1);
        uvs.push(i / n, 0, i / n, 1);
    }
    for (let i = 0; i < n; i++) {
        const a = i * 2;
        const b = ((i + 1) % n) * 2;
        indices.push(a, b, b + 1, a, b + 1, a + 1);
    }
    return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        uvs: new Float32Array(uvs),
        indices: new Uint32Array(indices),
    };
}

/** A box `w` by `h` by `d`, centred, for slats, bands and panes. */
function slab(w: number, h: number, d: number): Geometry {
    return extrude(
        [
            [-w / 2, -h / 2],
            [w / 2, -h / 2],
            [w / 2, h / 2],
            [-w / 2, h / 2],
        ],
        d
    );
}

/** The part of polygon `pts` on the side of the line through the origin that normal (nx, ny) points to. */
function clipHalf(pts: Array<[number, number]>, nx: number, ny: number): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    const side = ([x, y]: [number, number]) => x * nx + y * ny;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const sa = side(a);
        const sb = side(b);
        if (sa >= 0) out.push(a);
        if (sa * sb < 0) {
            const k = sa / (sa - sb);
            out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
        }
    }
    return out;
}

/** A circle of `n` points. */
function circle(r: number, n = 48): Array<[number, number]> {
    return Array.from({length: n}, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        return [Math.cos(a) * r, Math.sin(a) * r] as [number, number];
    });
}

/** A five-point star, its points `outer` out, evenly resampled so a frame round it stays even. */
function starPoints(outer: number, inner: number, per = 6): Array<[number, number]> {
    const corners = Array.from({length: 10}, (_, i) => {
        const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
        const r = i % 2 === 0 ? outer : inner;
        return [Math.cos(a) * r, Math.sin(a) * r] as [number, number];
    });
    const out: Array<[number, number]> = [];
    for (let i = 0; i < 10; i++) {
        const [x0, y0] = corners[i];
        const [x1, y1] = corners[(i + 1) % 10];
        for (let k = 0; k < per; k++) out.push([x0 + ((x1 - x0) * k) / per, y0 + ((y1 - y0) * k) / per]);
    }
    return out;
}

const masks = new WeakMap<Scene, Map<string, Texture>>();

/**
 * An erosion mask painted once per scene: `red(u, v)` in 0 to 1 for each texel. Low values go
 * first as alpha falls, and come back last as it rises.
 */
function mask(scene: Scene, key: string, red: (u: number, v: number) => number, nearest = false, size = 256): Texture {
    let map = masks.get(scene);
    if (!map) {
        map = new Map();
        masks.set(scene, map);
    }
    const found = map.get(key);
    if (found) return found;
    const texture = new DynamicTexture(
        `pixelfx-mask-${key}`,
        {width: size, height: size},
        scene,
        false,
        nearest ? Texture.NEAREST_SAMPLINGMODE : Texture.BILINEAR_SAMPLINGMODE
    );
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const r = Math.round(clamp01(red((x + 0.5) / size, 1 - (y + 0.5) / size)) * 255);
            const o = (y * size + x) * 4;
            img.data[o] = r;
            img.data[o + 1] = r;
            img.data[o + 2] = r;
            img.data[o + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    texture.update(false);
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    map.set(key, texture);
    return texture;
}

/** Smooth value noise, for ragged edges. */
function noise2(u: number, v: number, f: number, seed: number): number {
    const x = u * f;
    const y = v * f;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const h = (a: number, b: number) => hash(a * 57 + b * 131 + seed * 17);
    const sx = xf * xf * (3 - 2 * xf);
    const sy = yf * yf * (3 - 2 * yf);
    const top = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * sx;
    const bottom = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * sx;
    return top + (bottom - top) * sy;
}

/** The screen panel as one eroding quad: alpha keys bring it in and take it away along `mask`. */
function erodingCover(
    fx: FxBuilder,
    o: {
        period: number;
        mask: Texture;
        alphas: Array<[number, number]>;
        edge: [number, number, number];
        edgeWidth: number;
        softness?: number;
        color?: string;
        at?: At;
    }
) {
    const node = fx.node('cover', o.at ?? S);
    node.scaling.set(W, H, 1);
    fx.sys({
        geo: QUAD,
        tex: 'white',
        blend: 'alpha',
        life: o.period,
        size: 1,
        burst: [[0, 1]],
        color: o.color ?? COVER,
        parent: node,
        order: 6,
        look: {
            scalingMode: 'hierarchy',
            renderFace: 'both',
            erosion: {mask: o.mask, softness: o.softness ?? 0.03, edgeWidth: o.edgeWidth, edgeColor: o.edge},
        },
        b: [tint([['#ffffff', 0]], o.alphas)],
    });
    return node;
}

/** A solid, lit block riding `parent`, born once per `life`. */
function solid(
    fx: FxBuilder,
    parent: TransformNode,
    geo: Geometry,
    color: string,
    o: {
        life: number;
        rim?: [number, number, number];
        at?: At;
        order?: number;
        alpha?: number;
        blend?: 'add' | 'alpha';
        lit?: boolean;
        alphas?: Array<[number, number]>;
    }
) {
    return fx.sys({
        geo,
        tex: 'white',
        blend: o.blend ?? 'alpha',
        life: o.life,
        size: 1,
        burst: [[0, 1]],
        color,
        alpha: o.alpha,
        at: o.at,
        parent,
        order: o.order ?? 6,
        look: {
            lighting: o.lit === false ? 'unlit' : 'fixed',
            scalingMode: 'hierarchy',
            renderFace: 'both',
            rim: o.rim ? {color: o.rim, power: 2, strength: 1, mode: 'add'} : undefined,
        },
        b: o.alphas ? [tint([['#ffffff', 0]], o.alphas)] : [],
    });
}

/** A bar of light in the camera's plane, `w` by `h`, turned `rot`. */
function bar(
    fx: FxBuilder,
    o: {
        w: number;
        h: number;
        rot?: number;
        color: string;
        life: number;
        time?: number;
        alpha?: number;
        at?: At;
        parent?: TransformNode;
        order?: number;
        alphas?: Array<[number, number]>;
    }
) {
    const system = fx.sys({
        tex: 'streak',
        blend: 'add',
        life: o.life,
        size: 1,
        burst: [[o.time ?? 0, 1]],
        rot: o.rot ?? 0,
        color: o.color,
        alpha: o.alpha ?? 1,
        at: o.at,
        parent: o.parent,
        order: o.order ?? 8,
        b: o.alphas ? [tint([['#ffffff', 0]], o.alphas)] : [],
    });
    system.startSize = new Vector3Function(new ConstantValue(o.w), new ConstantValue(o.h), new ConstantValue(1));
    return system;
}

/** Alpha keys over `period`: on from `t0` to `t1`, faded `fade` at each end. */
function windowed(period: number, t0: number, t1: number, fade = 0.05): Array<[number, number]> {
    const keys: Array<[number, number]> = [[t0 <= 0 ? 1 : 0, 0]];
    for (const [a, t] of [
        [0, t0],
        [1, t0 + fade],
        [1, t1 - fade],
        [0, t1],
    ] as Array<[number, number]>) {
        const u = clamp01(t / period);
        if (u > keys[keys.length - 1][1]) keys.push([a, u]);
    }
    if (keys[keys.length - 1][1] < 1) keys.push([0, 1]);
    return keys;
}

/** Distance from the origin to (x, y) in units of the closed outline `points` along that ray: 1 on the outline. */
function shapeDistance(points: Array<[number, number]>): (x: number, y: number) => number {
    return (x, y) => {
        const rho = Math.hypot(x, y);
        if (rho < 1e-9) return 0;
        const dx = x / rho;
        const dy = y / rho;
        let reach = Infinity;
        for (let i = 0; i < points.length; i++) {
            const [ax, ay] = points[i];
            const [bx, by] = points[(i + 1) % points.length];
            const ex = bx - ax;
            const ey = by - ay;
            const den = dx * ey - dy * ex;
            if (Math.abs(den) < 1e-12) continue;
            const along = (ax * ey - ay * ex) / den;
            const k = (ax * dy - ay * dx) / den;
            if (along > 0 && k >= 0 && k <= 1) reach = Math.min(reach, along);
        }
        return reach === Infinity ? 0 : rho / reach;
    };
}

/**
 * The screen as one quad with a hole of `points` round `center`, `radius(t)` across, eroded out of
 * a distance mask. Unlike a frame scaled with its hole, it never reaches past the screen.
 */
function irisCover(
    fx: FxBuilder,
    key: string,
    center: At,
    points: Array<[number, number]>,
    period: number,
    radius: (t: number) => number,
    edge: [number, number, number]
) {
    const dist = shapeDistance(points);
    const dx = center[0] - S[0];
    const dy = center[1] - S[1];
    let far = 0;
    for (let i = 0; i <= 64; i++) {
        const k = i / 64;
        for (const [u, v] of [
            [k, 0],
            [k, 1],
            [0, k],
            [1, k],
        ]) {
            far = Math.max(far, dist((u - 0.5) * W - dx, (0.5 - v) * H - dy));
        }
    }
    const alphas: Array<[number, number]> = [];
    for (let i = 0; i <= 80; i++) {
        const u = i / 80;
        alphas.push([clamp01(1 - radius(u * period) / far), u]);
    }
    erodingCover(fx, {
        period,
        mask: mask(fx.scene, key, (u, v) => dist((u - 0.5) * W - dx, (0.5 - v) * H - dy) / far),
        alphas,
        edge,
        edgeWidth: 0.015,
        softness: 0.004,
    });
}

export const transitions: FxDef[] = [
    {
        id: 'transitions/blinds',
        name: 'Blinds',
        loop: false,
        period: 2,
        view: VIEW,
        build(fx) {
            const P = 2;
            backdrop(fx, P);
            const N = 10;
            const h = H / N;
            const blind = fx.node('blinds', S);
            const SLAT = slab(W, h * 1.04, 0.05);
            const slats = Array.from({length: N}, (_, i) => {
                const node = fx.node('slat', [0, H / 2 - h * (i + 0.5), 0], blind);
                solid(fx, node, SLAT, i % 2 ? WARM[2] : WARM[1], {life: P, rim: [1, 0.85, 0.6]});
                return node;
            });
            // Warm light squeezing through the gaps as they close, glints running along the rims.
            for (let i = 0; i < N; i++) {
                bar(fx, {
                    w: W * 1.1,
                    h: 0.14,
                    color: WARM[6],
                    life: P,
                    alpha: 0.7,
                    at: [S[0], S[1] + H / 2 - h * (i + 1), S[2] + 0.05],
                    order: 7,
                    alphas: windowed(P, 0.2 + i * 0.05, 0.8 + i * 0.05, 0.1),
                });
                fx.sys({
                    tex: 'glint',
                    life: 0.4,
                    speed: 6,
                    size: 0.3,
                    burst: [[0.3 + i * 0.05, 1]],
                    color: '#ffffff',
                    aim: 'right',
                    at: [S[0] - W / 2, S[1] + H / 2 - h * (i + 1), S[2] + 0.08],
                    order: 9,
                    b: [tint([['#ffffff', 0]], popOut(0.4))],
                });
            }
            const dust = fx.sys({
                tex: 'dot',
                life: [0.8, 1.4],
                speed: [0.05, 0.2],
                size: [0.02, 0.04],
                rate: 30,
                color: WARM[6],
                shape: new BoxEmitter({width: W, height: H, depth: 0.2}),
                at: [S[0], S[1], S[2] + 0.2],
                order: 9,
                b: [wobble(1, 0.1), tint([['#ffffff', 0]], popOut(0.5))],
            });
            gate(dust, P, 0.2, 1.5, 30);
            fx.every((t) => {
                slats.forEach((node, i) => {
                    // Edge-on, tilting shut top to bottom; then tilting open again, bottom up.
                    const shut = easeOut(span(t, 0.1 + i * 0.05, 0.4 + i * 0.05));
                    const open = easeOut(span(t, 1.2 + (N - i) * 0.03, 1.5 + (N - i) * 0.03));
                    node.rotation.x = (Math.PI / 2) * (1 - shut) + (Math.PI / 2) * open;
                });
                const fade = 1 - easeIn(span(t, 1.6, 1.95));
                const appear = span(t, 0, 0.1);
                blind.scaling.set(1, Math.max(HIDE, fade * appear), 1);
            });
        },
    },
    {
        id: 'transitions/burn-away',
        name: 'Burn Away',
        loop: false,
        period: 3,
        view: VIEW,
        build(fx) {
            const P = 3;
            backdrop(fx, P);
            // High at the rim, ragged: it burns in from the edges and burns open from the middle.
            const burn = mask(fx.scene, 'burn', (u, v) => {
                const d = Math.hypot((u - 0.5) * 1.2, v - 0.5) * 1.6;
                const n = noise2(u, v, 6, 3) * 0.6 + noise2(u, v, 17, 7) * 0.4;
                return d * 0.75 + n * 0.3 - 0.05;
            });
            erodingCover(fx, {
                period: P,
                mask: burn,
                edge: [3, 1.2, 0.3],
                edgeWidth: 0.08,
                alphas: [
                    [0, 0],
                    [1, 1.2 / P],
                    [1, 1.5 / P],
                    [0, 2.8 / P],
                    [0, 1],
                ],
            });
            // Embers and licks of flame off the burning line.
            const embers = fx.sys({
                tex: 'dot',
                blend: 'add',
                life: [0.5, 1],
                speed: [0.3, 1],
                size: [0.03, 0.06],
                rate: 70,
                color: [EMBER[5], EMBER[7]],
                shape: new BoxEmitter({width: W, height: H, depth: 0.05}),
                at: [S[0], S[1], S[2] + 0.1],
                order: 8,
                b: [gravity(-1.5), wobble(2, 0.4), tint([['#ffffff', 0]], popOut(0.5))],
            });
            gate(embers, P, 0, 2.8, 70);
            const flames = fx.sys({
                tex: 'flame',
                blend: 'add',
                life: [0.3, 0.5],
                speed: [0.4, 0.8],
                size: [0.18, 0.3],
                rate: 40,
                color: [EMBER[4], EMBER[6]],
                shape: new BoxEmitter({width: W, height: H, depth: 0.05}),
                at: [S[0], S[1], S[2] + 0.05],
                order: 7,
                b: [gravity(-1), tint([['#ffffff', 0]], popOut(0.4)), grow([0, 1], [1, 0.3])],
            });
            gate(flames, P, 0.1, 2.7, 40);
            const smoke = fx.sys({
                tex: 'smoke',
                life: [1, 1.6],
                speed: [0.3, 0.6],
                size: [0.4, 0.7],
                rate: 10,
                color: '#2a2228',
                alpha: 0.5,
                shape: new BoxEmitter({width: W, height: H, depth: 0.1}),
                at: [S[0], S[1], S[2] + 0.2],
                order: 5,
                b: [gravity(-0.6), grow([0, 0.6], [1, 1.5]), tint([['#ffffff', 0]], fadeOut(0.3))],
            });
            gate(smoke, P, 0.3, 2.9, 10);
        },
    },
    {
        id: 'transitions/crt-off',
        name: 'CRT Off',
        loop: false,
        period: 2,
        view: VIEW,
        build(fx) {
            const P = 2;
            backdrop(fx, P);
            // A rounded bezel round the screen, the screen itself glowing with scanlines.
            const tv = fx.node('tv', S);
            const bezelHole = Array.from({length: 40}, (_, i) => {
                const a = (i / 40) * Math.PI * 2;
                const c = Math.cos(a);
                const s = Math.sin(a);
                const p = 0.25;
                return [Math.sign(c) * Math.abs(c) ** p * (W / 2), Math.sign(s) * Math.abs(s) ** p * (H / 2)] as [
                    number,
                    number,
                ];
            });
            const bezel = fx.node('bezel', [0, 0, -0.02], tv);
            solid(fx, bezel, holeFrame(bezelHole, 1.08), '#2a2a34', {life: P, rim: [0.4, 0.5, 0.7]});
            const pic = fx.node('pic', [0, 0, 0], tv);
            fx.sys({
                geo: QUAD,
                image: 'scanlines',
                blend: 'alpha',
                life: P,
                size: 1,
                burst: [[0, 1]],
                color: CRT[3],
                parent: pic,
                order: 6,
                look: {scalingMode: 'hierarchy', renderFace: 'both', mapUV: {tiling: [1, 8], offset: [0, 0]}},
            });
            const lineNode = fx.node('line', [0, 0, 0.05], tv);
            fx.sys({
                tex: 'streak',
                blend: 'add',
                life: P,
                size: 1,
                burst: [[0, 1]],
                color: CRT[7],
                parent: lineNode,
                order: 8,
                look: {scalingMode: 'hierarchy'},
            });
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: P,
                size: 1,
                burst: [[0, 1]],
                color: CRT[6],
                parent: lineNode,
                order: 9,
                look: {scalingMode: 'hierarchy'},
            });
            fx.every((t) => {
                // Off: picture to a line, the line to a dot, the dot lingering; then on again.
                const squeeze = easeIn(span(t, 0.05, 0.3));
                const shrink = easeIn(span(t, 0.3, 0.5));
                const on1 = easeOut(span(t, 1.1, 1.25));
                const on2 = easeOut(span(t, 1.25, 1.5));
                const off = t < 1.1;
                const sy = off ? 1 - squeeze * 0.995 : 0.005 + on2 * 0.995;
                const sx = off ? 1 - shrink * 0.99 : 0.01 + on1 * 0.99;
                pic.scaling.set(W * Math.max(HIDE, sx), H * Math.max(HIDE, sy), 1);
                const dot = off && t > 0.5 ? 1 - span(t, 0.5, 1.0) : 0;
                const lineOn = (t > 0.15 && t < 0.55) || (t > 1.1 && t < 1.45);
                const lw = lineOn ? W * Math.max(0.05, sx) : dot > 0 ? 0.6 * dot : HIDE;
                lineNode.scaling.set(Math.max(HIDE, lw), Math.max(HIDE, lineOn ? 0.4 : dot * 0.6), 1);
            });
            flash(fx, {at: [S[0], S[1], S[2] + 0.3], size: 2, time: 0.48, color: CRT[6]});
            flash(fx, {at: [S[0], S[1], S[2] + 0.3], size: 3, time: 1.25, color: CRT[5], life: 0.5});
        },
    },
    {
        id: 'transitions/diamond-wipe',
        name: 'Diamond Wipe',
        loop: false,
        period: 2,
        view: VIEW,
        build(fx) {
            const P = 2;
            backdrop(fx, P);
            // Diamonds swelling from their centres in a wave from the left.
            const COLS = 10;
            const ROWS = Math.round((COLS * H) / W);
            const diamonds = mask(fx.scene, 'diamonds', (u, v) => {
                const x = u * COLS;
                const y = v * ROWS;
                // Diamond cells: rotate the grid 45 degrees.
                const a = (x + y) / 2;
                const b = (x - y) / 2;
                const ca = Math.floor(a) + 0.5;
                const cb = Math.floor(b) + 0.5;
                const d = Math.max(Math.abs(a - ca), Math.abs(b - cb)) * 2;
                const centreU = (ca + cb) / COLS;
                return (1 - centreU) * 0.7 + (1 - d) * 0.3;
            });
            erodingCover(fx, {
                period: P,
                mask: diamonds,
                edge: [1.6, 0.8, 2.6],
                edgeWidth: 0.12,
                softness: 0.02,
                color: ARCANE[0],
                alphas: [
                    [0, 0],
                    [1, 0.8 / P],
                    [1, 1.05 / P],
                    [0, 1.85 / P],
                    [0, 1],
                ],
            });
            // Glints and little gems along the wave front.
            const front = fx.node('front', [S[0] - W / 2, S[1], S[2] + 0.15]);
            const gl = fx.sys({
                tex: 'glint',
                life: [0.25, 0.4],
                size: [0.2, 0.35],
                rate: 40,
                color: ['#ffffff', ARCANE[6]],
                shape: new BoxEmitter({width: 0.3, height: H, depth: 0.05}),
                parent: front,
                order: 9,
                b: [tint([['#ffffff', 0]], popOut(0.5))],
            });
            gate(gl, P, 0, 1.9, 40);
            fx.sys({
                geo: lathe(
                    [
                        [0.001, -0.5],
                        [0.5, 0],
                        [0.001, 0.5],
                    ],
                    4
                ),
                tex: 'white',
                blend: 'alpha',
                world: true,
                tumble: 6,
                life: [0.5, 0.8],
                speed: [0.6, 1.4],
                size: [0.12, 0.2],
                burst: [
                    [1.15, 8],
                    [1.4, 8],
                    [1.65, 8],
                ],
                color: [ARCANE[5], ARCANE[6]],
                shape: new BoxEmitter({width: 0.4, height: H, depth: 0.05}),
                parent: front,
                order: 8,
                look: {lighting: 'fixed', rim: {color: [1, 0.8, 1], power: 2, strength: 1, mode: 'add'}},
                b: [gravity(-1), tint([['#ffffff', 0]], popOut(0.4))],
            });
            fx.every((t) => {
                const k = t < 1.05 ? span(t, 0, 0.8) : span(t, 1.05, 1.85);
                front.position.x = S[0] - W / 2 + W * k;
            });
        },
    },
    {
        id: 'transitions/glitch-wipe',
        name: 'Glitch Wipe',
        loop: false,
        period: 1.8,
        view: VIEW,
        build(fx) {
            const P = 1.8;
            backdrop(fx, P);
            const N = 12;
            const h = H / N;
            const BAND = slab(W, h * 1.02, 0.08);
            const bands = Array.from({length: N}, (_, i) => {
                const node = fx.node('band', [0, S[1] + H / 2 - h * (i + 0.5), S[2]]);
                solid(fx, node, BAND, i % 3 ? CYBER[0] : CYBER[1], {life: P, rim: [0.3, 0.5, 1]});
                // Magenta and cyan ghosts split off its edges.
                solid(fx, node, slab(W, h * 0.9, 0.02), '#ff2d6f', {
                    life: P,
                    blend: 'add',
                    lit: false,
                    at: [0.16, 0.025, -0.06],
                    alpha: 0.9,
                    order: 5,
                });
                solid(fx, node, slab(W, h * 0.9, 0.02), CYBER[4], {
                    life: P,
                    blend: 'add',
                    lit: false,
                    at: [-0.16, -0.025, -0.06],
                    alpha: 0.9,
                    order: 5,
                });
                return {node, i, lag: hash(i) * 0.35, freeze: hash(i + 9)};
            });
            // Data slivers spat off the torn edges, while there are edges on screen.
            const slivers = fx.sys({
                tex: 'white',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.06, length: 3},
                life: [0.15, 0.3],
                speed: [3, 8],
                size: [0.02, 0.04],
                rate: 80,
                color: ['#ff2d6f', CYBER[5]],
                shape: new BoxEmitter({width: 0.1, height: H, depth: 0.1}),
                aim: 'right',
                at: [S[0], S[1], S[2] + 0.15],
                order: 9,
                b: [tint([['#ffffff', 0]], popOut(0.4))],
            });
            gate(slivers, P, 0.05, 1.75, 80);
            fx.every((t) => {
                for (const b of bands) {
                    // In from the left in stutters, freezing and jerking back; then on through.
                    const k = span(t, b.lag, b.lag + 0.6);
                    const step = Math.floor(k * 7) / 7;
                    const jerk = Math.sin(t * 40 + b.i) > 0.85 ? -0.08 : 0;
                    const inX = -W + W * (step + jerk);
                    const out = easeIn(span(t, 1.1 + b.lag * 0.5, 1.6 + b.lag * 0.5));
                    b.node.position.x = S[0] + (k >= 1 ? 0 : inX) + out * W * 1.2;
                    const glitch = Math.sin(t * 31 + b.i * 3) > 0.8 ? 0.12 : 0;
                    b.node.position.y = S[1] + H / 2 - h * (b.i + 0.5) + glitch * (b.freeze - 0.5);
                    const vis = t > b.lag && out < 1 ? 1 : HIDE;
                    b.node.scaling.setAll(vis);
                }
            });
        },
    },
    {
        id: 'transitions/iris',
        name: 'Iris',
        loop: false,
        period: 2.2,
        view: VIEW,
        build(fx) {
            const P = 2.2;
            backdrop(fx, P);
            const C: At = [0, 1.6, S[2]];
            const SHUT = 1.25;
            const OPEN = 1.45;
            // Closes onto the hero's head, holds as a spotlight, snaps shut, pops open.
            const radius = (t: number) => {
                if (t < 0.45) return 6 - 5.4 * easeOut(span(t, 0, 0.45));
                if (t < 1.05) return 0.6 - 0.05 * Math.sin((t - 0.45) * 8);
                if (t < SHUT) return 0.6 * (1 - easeIn(span(t, 1.05, SHUT)));
                if (t < OPEN) return 0;
                return 6 * easeOut(span(t, OPEN, P));
            };
            irisCover(fx, 'iris-circle', C, circle(1), P, radius, [1.6, 1.4, 1]);
            const ap = fx.node('iris', C);
            const rim = fx.node('rim', [0, 0, 0.02], ap);
            solid(fx, rim, holeFrame(circle(0.98), 1.05), SPOT[6], {life: P, blend: 'add', lit: false});
            // The spotlight's dust.
            const dust = fx.sys({
                tex: 'dot',
                life: [0.8, 1.2],
                speed: [0.05, 0.15],
                size: [0.02, 0.04],
                rate: 20,
                color: SPOT[6],
                shape: new SphereEmitter({radius: 0.5, thickness: 1}),
                at: [C[0], C[1], C[2] - 0.2],
                order: 9,
                b: [wobble(1, 0.1), tint([['#ffffff', 0]], popOut(0.5))],
            });
            gate(dust, P, 0.4, 1.1, 20);
            const tw = fx.sys({
                tex: 'glint',
                life: 0.3,
                size: [0.15, 0.25],
                rate: 12,
                color: SPOT[6],
                parent: rim,
                shape: new ConeEmitter({radius: 1, angle: 0, thickness: 0.01}),
                order: 9,
                b: [tint([['#ffffff', 0]], popOut(0.5))],
            });
            gate(tw, P, 0.5, 1.1, 12);
            flash(fx, {at: [C[0], C[1], C[2] + 0.2], size: 1, time: SHUT, color: '#ffffff', life: 0.2});
            flash(fx, {at: [C[0], C[1], C[2] + 0.2], size: 3, time: OPEN, color: SPOT[6]});
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.08, length: 1},
                life: [0.3, 0.5],
                speed: [4, 7],
                size: [0.03, 0.05],
                burst: [[OPEN, 30]],
                color: [SPOT[6], '#ffffff'],
                shape: new ConeEmitter({radius: 0.05, angle: Math.PI / 2, thickness: 1}),
                at: [C[0], C[1], C[2] + 0.1],
                order: 9,
                b: [gravity(4), tint([['#ffffff', 0]], popOut(0.4))],
            });
            fx.every((t) => {
                // The rim rides the hole while it is on screen.
                const r = radius(t);
                ap.scaling.setAll(r > 1.2 ? HIDE : Math.max(0.004, r));
            });
        },
    },
    {
        id: 'transitions/pixel-dissolve',
        name: 'Pixel Dissolve',
        loop: false,
        period: 2.2,
        view: VIEW,
        build(fx) {
            const P = 2.2;
            backdrop(fx, P);
            // Blocks in clumps: each cell a value from coarse noise and its own jitter.
            const COLS = 16;
            const ROWS = 10;
            const blocks = mask(
                fx.scene,
                'blocks',
                (u, v) => {
                    const cx = Math.floor(u * COLS);
                    const cy = Math.floor(v * ROWS);
                    return noise2(cx / COLS, cy / ROWS, 3, 5) * 0.7 + hash(cx * 31 + cy) * 0.3;
                },
                true,
                128
            );
            erodingCover(fx, {
                period: P,
                mask: blocks,
                edge: [2.2, 1.4, 2.6],
                edgeWidth: 0.08,
                softness: 0.005,
                color: NEON[0],
                alphas: [
                    [0, 0],
                    [1, 0.95 / P],
                    [1, 1.15 / P],
                    [0, 2.05 / P],
                    [0, 1],
                ],
            });
            // Blocks breaking off as solid cubes, and sparkles.
            for (const [time, dir] of [
                [0.2, -1],
                [1.3, 1],
            ] as Array<[number, number]>) {
                fx.sys({
                    mesh: 'cube',
                    tumble: 4,
                    life: [0.6, 0.9],
                    speed: [0.4, 1.2],
                    size: [0.12, 0.26],
                    burst: [[time, 20]],
                    color: [NEON[4], NEON[6]],
                    shape: new BoxEmitter({width: W, height: H, depth: 0.05}),
                    at: [S[0], S[1], S[2] + 0.2 * dir],
                    order: 7,
                    b: [grow([0, 0], [0.2, 1], [1, 0])],
                });
            }
            const sp = fx.sys({
                tex: 'glint',
                life: [0.25, 0.4],
                size: [0.15, 0.3],
                rate: 30,
                color: ['#ffffff', NEON[6]],
                shape: new BoxEmitter({width: W, height: H, depth: 0.05}),
                at: [S[0], S[1], S[2] + 0.2],
                order: 9,
                b: [tint([['#ffffff', 0]], popOut(0.5))],
            });
            gate(sp, P, 0, 2.1, 30);
        },
    },
    {
        id: 'transitions/shatter-wipe',
        name: 'Shatter Wipe',
        loop: false,
        period: 2.8,
        view: VIEW,
        build(fx) {
            const P = 2.8;
            backdrop(fx, P);
            const DROP = 0.45;
            const CRACK = 1.0;
            const BREAK = 1.6;
            const pane = fx.node('pane', S);
            solid(fx, pane, slab(W, H, 0.06), GLASS[1], {life: P, rim: [0.5, 0.8, 1], alpha: 0.94});
            solid(
                fx,
                pane,
                holeFrame(
                    [
                        [-W / 2, -H / 2],
                        [W / 2, -H / 2],
                        [W / 2, H / 2],
                        [-W / 2, H / 2],
                    ],
                    1.03
                ),
                GLASS[4],
                {life: P, blend: 'add', lit: false, at: [0, 0, 0.04]}
            );
            // Cracks racing out from the impact: thin lit quads.
            const IMPACT: [number, number] = [0.6, 0.3];
            const cracks = fx.node('cracks', [0, 0, 0.05], pane);
            for (let i = 0; i < 9; i++) {
                const a = (i / 9) * Math.PI * 2 + hash(i) * 0.5;
                let [x, y] = IMPACT;
                for (let k = 0; k < 4; k++) {
                    const len = 0.2 + hash(i * 4 + k) * 0.25;
                    const b = a + (hash(i * 7 + k) - 0.5) * 0.7;
                    const nx = x + Math.cos(b) * len;
                    const ny = y + Math.sin(b) * len;
                    const piece = fx.node('crack', [(x + nx) / 2, (y + ny) / 2, 0], cracks);
                    piece.rotation.z = Math.atan2(ny - y, nx - x);
                    piece.scaling.set(len, 0.025, 1);
                    fx.sys({
                        geo: QUAD,
                        tex: 'white',
                        blend: 'add',
                        life: P,
                        size: 1,
                        burst: [[0, 1]],
                        color: GLASS[6],
                        parent: piece,
                        order: 8,
                        look: {scalingMode: 'hierarchy'},
                    });
                    x = nx;
                    y = ny;
                }
            }
            flash(fx, {at: [S[0] + IMPACT[0], S[1] + IMPACT[1], S[2] + 0.3], size: 2.4, time: CRACK, color: '#ffffff'});
            flash(fx, {at: [S[0], S[1], S[2] + 0.3], size: 5, time: BREAK, color: GLASS[6]});
            // The burst: tumbling glass shards with lit edges, falling away.
            fx.sys({
                geo: extrude(
                    [
                        [0, 0.5],
                        [-0.35, -0.4],
                        [0.4, -0.3],
                    ],
                    0.05
                ),
                tex: 'white',
                blend: 'alpha',
                world: true,
                tumble: 7,
                life: [0.9, 1.2],
                speed: [1.5, 4],
                size: [0.3, 0.6],
                burst: [[BREAK, 60]],
                color: [GLASS[2], GLASS[3]],
                shape: new BoxEmitter({width: W, height: H, depth: 0.05}),
                at: S,
                order: 7,
                look: {
                    lighting: 'fixed',
                    renderFace: 'both',
                    rim: {color: [0.6, 0.9, 1], power: 1.5, strength: 1.2, mode: 'add'},
                },
                b: [gravity(9), floorBounce(0.2), tint([['#ffffff', 0]], fadeOut(0.8, 0))],
            });
            fx.sys({
                tex: 'glint',
                world: true,
                life: [0.3, 0.6],
                speed: [1, 3],
                size: [0.12, 0.24],
                burst: [[BREAK, 20]],
                color: ['#ffffff', GLASS[6]],
                shape: new BoxEmitter({width: W, height: H, depth: 0.05}),
                at: S,
                order: 9,
                b: [gravity(6), tint([['#ffffff', 0]], popOut(0.4))],
            });
            fx.every((t) => {
                // Drops in and bounces, cracks, then is gone.
                const d = span(t, 0, DROP);
                const bounce = t > DROP ? Math.abs(Math.sin((t - DROP) * 14)) * 0.25 * Math.exp(-(t - DROP) * 7) : 0;
                pane.position.y = S[1] + (1 - easeIn(d)) * 4 + bounce;
                pane.scaling.setAll(t < BREAK ? 1 : HIDE);
                cracks.scaling.setAll(t < CRACK ? HIDE : 1);
            });
        },
    },
    {
        id: 'transitions/slash-wipe',
        name: 'Slash Wipe',
        loop: false,
        period: 1.7,
        view: VIEW,
        build(fx) {
            const P = 1.7;
            backdrop(fx, P);
            const ANGLE = 0.5;
            const tx = Math.cos(ANGLE);
            const ty = Math.sin(ANGLE);
            // The cover, cut along the diagonal into two halves.
            const rect: Array<[number, number]> = [
                [-W / 2, -H / 2],
                [W / 2, -H / 2],
                [W / 2, H / 2],
                [-W / 2, H / 2],
            ];
            const halfA = extrude(clipHalf(rect, -ty, tx), 0.06);
            const halfB = extrude(clipHalf(rect, ty, -tx), 0.06);
            const clip = fx.node('clip', S);
            const a = fx.node('a', [0, 0, 0], clip);
            const b = fx.node('b', [0, 0, 0], clip);
            solid(fx, a, halfA, STEEL[0], {life: P, rim: [0.4, 0.6, 1]});
            solid(fx, b, halfB, STEEL[0], {life: P, rim: [0.4, 0.6, 1]});
            // Two cuts: a white-hot edge slicing across with light ahead and sparks thrown back.
            for (const [time, off] of [
                [0.25, 0.35],
                [0.75, 0],
            ] as Array<[number, number]>) {
                const blade = fx.node('blade', [S[0] - tx * 4 - ty * off, S[1] - ty * 4 + tx * off, S[2] + 0.1]);
                bar(fx, {
                    w: 2.4,
                    h: 0.12,
                    rot: ANGLE,
                    color: '#ffffff',
                    life: P,
                    parent: blade,
                    alphas: windowed(P, time, time + 0.25, 0.03),
                });
                bar(fx, {
                    w: 3.4,
                    h: 0.5,
                    rot: ANGLE,
                    color: STEEL[5],
                    alpha: 0.6,
                    life: P,
                    parent: blade,
                    alphas: windowed(P, time, time + 0.25, 0.03),
                });
                const spray = fx.sys({
                    tex: 'dot',
                    mode: RenderMode.StretchedBillBoard,
                    stretch: {speed: 0.06, length: 1},
                    world: true,
                    life: [0.3, 0.5],
                    speed: [2, 5],
                    size: [0.03, 0.05],
                    rate: 160,
                    color: [STEEL[6], '#ffffff'],
                    shape: new ConeEmitter({radius: 0.05, angle: 0.6, thickness: 1}),
                    aim: 'left',
                    rotate: [-ANGLE, 0, 0],
                    parent: blade,
                    order: 9,
                    b: [gravity(6), airDrag(2), tint([['#ffffff', 0]], popOut(0.4))],
                });
                gate(spray, P, time, time + 0.25, 160);
                // A lit scar left on the cover by the cut.
                bar(fx, {
                    w: 9,
                    h: 0.06,
                    rot: ANGLE,
                    color: STEEL[5],
                    life: P,
                    at: [S[0] - ty * off, S[1] + tx * off, S[2] + 0.05],
                    alphas: windowed(P, time + 0.1, 1.2, 0.1),
                });
                fx.every((t) => {
                    const k = span(t, time, time + 0.25);
                    blade.position.x = S[0] - tx * 4 - ty * off + tx * 8 * k;
                    blade.position.y = S[1] - ty * 4 + tx * off + ty * 8 * k;
                });
            }
            fx.every((t) => {
                // The cover slams in, takes the cuts, then splits apart.
                const inn = easeOut(span(t, 0, 0.15));
                const split = easeIn(span(t, 1.05, 1.6));
                a.position.set(-ty * split * 4, tx * split * 4, 0);
                b.position.set(ty * split * 4, -tx * split * 4, 0);
                a.rotation.z = split * 0.3;
                b.rotation.z = -split * 0.3;
                clip.scaling.set(Math.max(HIDE, inn), Math.max(HIDE, inn), 1);
            });
        },
    },
    {
        id: 'transitions/star-iris',
        name: 'Star Iris',
        loop: false,
        period: 2.2,
        view: VIEW,
        build(fx) {
            const P = 2.2;
            backdrop(fx, P);
            const C: At = [0, 1.45, S[2]];
            const STAR = starPoints(1, 0.42);
            const SHUT = 1.3;
            const OPEN = 1.5;
            const radius = (t: number) => {
                if (t < 0.5) return 7 - 6.2 * easeOut(span(t, 0, 0.5));
                if (t < 1.1) return 0.8 - 0.06 * Math.sin((t - 0.5) * 8);
                if (t < SHUT) return 0.8 * (1 - easeIn(span(t, 1.1, SHUT)));
                if (t < OPEN) return 0;
                return 7 * easeOut(span(t, OPEN, P));
            };
            irisCover(fx, 'iris-star', C, STAR, P, radius, [1.8, 1.4, 0.6]);
            const ap = fx.node('star', C);
            const rim = fx.node('rim', [0, 0, 0.02], ap);
            solid(fx, rim, holeFrame(STAR, 1.07), GOLD[5], {life: P, blend: 'add', lit: false});
            // Tips twinkling and shedding motes.
            const tips = fx.node('tips', [0, 0, 0.05], ap);
            for (let i = 0; i < 5; i++) {
                const a = Math.PI / 2 + (i / 5) * Math.PI * 2;
                const tip = fx.node('tip', [Math.cos(a), Math.sin(a), 0], tips);
                const g = fx.sys({
                    tex: 'glint',
                    life: [0.2, 0.35],
                    size: [0.25, 0.4],
                    rate: 6,
                    color: '#ffffff',
                    parent: tip,
                    order: 9,
                    b: [tint([['#ffffff', 0]], popOut(0.5))],
                });
                gate(g, P, 0.3, 1.2, 6);
                const m = fx.sys({
                    tex: 'glow',
                    world: true,
                    life: [0.5, 0.9],
                    speed: [0.1, 0.4],
                    size: [0.05, 0.1],
                    rate: 14,
                    color: [GOLD[5], GOLD[7]],
                    shape: new SphereEmitter({radius: 0.03, thickness: 1}),
                    parent: tip,
                    order: 9,
                    b: [gravity(1), tint([['#ffffff', 0]], popOut(0.5))],
                });
                gate(m, P, 0.2, 1.3, 14);
            }
            flash(fx, {at: [C[0], C[1], C[2] + 0.2], size: 1, time: SHUT, color: '#ffffff', life: 0.2});
            flash(fx, {at: [C[0], C[1], C[2] + 0.2], size: 3.4, time: OPEN, color: GOLD[6]});
            shockwave(fx, {
                at: [C[0], C[1], C[2] + 0.1],
                facing: true,
                tex: 'ring',
                size: 4,
                life: 0.4,
                color: GOLD[6],
                delay: OPEN,
            });
            fx.every((t) => {
                // The gold rim and its tips ride the hole while it is on screen.
                const r = radius(t);
                ap.scaling.setAll(r > 1.2 ? HIDE : Math.max(0.004, r));
            });
        },
    },
];
