import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {ConeEmitter, ConstantValue, RenderMode, SphereEmitter, Vector3Function} from 'babylon.quarks';
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
    spin,
    tint,
    wobble,
    type Geometry,
} from './kit';
import {gate, light, type At} from './parts';
import {decal, flash, shockwave, sparks} from './recipes';
import {hero} from './spawn';
import {type FxBuilder, type FxDef} from './stage';
import {label, type LabelStyle} from './textures';

const GOLD = ['#2a1405', '#5c3008', '#9a5a0e', '#d48e18', '#f5b92c', '#ffde5e', '#fff4bc', '#ffffff'];
const MAGENTA = ['#1a0516', '#3d0a33', '#701560', '#b0228f', '#f53cd1', '#ff86e6', '#ffd2f6', '#ffffff'];
const BLUE = ['#0a1030', '#142a66', '#1f4fae', '#2f86e6', '#5cc4ff', '#a8e8ff', '#e6fbff', '#ffffff'];
const FIRE = ['#2a0710', '#5e0f16', '#a3191c', '#e0401c', '#ff7b22', '#ffb93b', '#ffe68a', '#ffffff'];
const RED = ['#1a0508', '#4a0b12', '#8c1420', '#d42a2e', '#ff5a4a', '#ff9a86', '#ffd8cc', '#ffffff'];
const AMBER = ['#2a1405', '#6a2e06', '#b85a0a', '#f08c14', '#ffc23a', '#ffe580', '#fff6c8', '#ffffff'];
const PARTY = ['#ff4a5a', '#ff9a2a', '#ffe03c', '#5ad84a', '#3cc8ff', '#7a6cff', '#f53cd1'];

const GOLD_TEXT: LabelStyle = {top: GOLD[6], bottom: GOLD[3], stroke: GOLD[0]};
const WHITE_TEXT: LabelStyle = {top: '#ffffff', bottom: '#d8d0e8', stroke: '#1a1020'};

/** A scale small enough to hide a node and everything that scales with it. */
const HIDE = 1e-4;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** 0 before `a`, 1 after `b`, straight between. */
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const easeIn = (x: number) => x ** 3;
/** Overshoots past 1 and settles back, for a pop. */
const backOut = (x: number) => {
    const c = 2.2;
    return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
};

/** Alpha keys over a life of `period`: on from `t0` to `t1`, faded `fade` seconds at each end. */
function windowed(period: number, t0: number, t1: number, fade = 0.04): Array<[number, number]> {
    const keys: Array<[number, number]> = [];
    const push = (a: number, t: number) => {
        const u = clamp01(t / period);
        if (keys.length && u <= keys[keys.length - 1][1]) return;
        keys.push([a, u]);
    };
    if (t0 > 0) push(0, 0);
    push(t0 > 0 ? 0 : 1, Math.max(0, t0));
    push(1, t0 + fade);
    push(1, t1 - fade);
    push(0, t1);
    if (t1 < period) push(0, period);
    return keys;
}

/** Shows `node` at `scale`, or hides it, with everything that scales with it, at 0. */
function show(node: TransformNode, scale: number, sx = 1, sy = 1) {
    const s = Math.max(HIDE, scale);
    node.scaling.set(s * sx, s * sy, s);
}

/** A rectangle with rounded corners, centred, for {@link extrude}. */
function roundRect(w: number, h: number, r: number, steps = 5): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    const corners: Array<[number, number, number]> = [
        [w / 2 - r, h / 2 - r, 0],
        [-w / 2 + r, h / 2 - r, Math.PI / 2],
        [-w / 2 + r, -h / 2 + r, Math.PI],
        [w / 2 - r, -h / 2 + r, (Math.PI * 3) / 2],
    ];
    for (const [cx, cy, a0] of corners) {
        for (let i = 0; i <= steps; i++) {
            const a = a0 + (i / steps) * (Math.PI / 2);
            out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
    }
    return out;
}

/** A circle of radius `r`. */
function disk(r: number, n = 32): Array<[number, number]> {
    return Array.from({length: n}, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        return [Math.cos(a) * r, Math.sin(a) * r] as [number, number];
    });
}

/** A star of `points` points, alternating `outer` and `inner` radii; jagged when `jitter` is set. */
function starburst(points: number, outer: number, inner: number, jitter = 0): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let i = 0; i < points * 2; i++) {
        const a = Math.PI / 2 + (i / (points * 2)) * Math.PI * 2;
        const wob = jitter ? 1 + jitter * Math.sin(i * 2.7 + 1.3) : 1;
        const r = (i % 2 === 0 ? outer : inner) * wob;
        out.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return out;
}

/** A heart about one unit across, its two lobes on top. */
function heartPoints(n = 48): Array<[number, number]> {
    return Array.from({length: n}, (_, i) => {
        const t = (i / n) * Math.PI * 2;
        const x = 16 * Math.sin(t) ** 3;
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        return [x / 32, (y + 2) / 32] as [number, number];
    });
}

/** The zig-zag crack down a heart's middle, top to bottom. */
const SEAM: Array<[number, number]> = [
    [0, 0.2],
    [0.05, 0.1],
    [-0.04, 0.0],
    [0.05, -0.12],
    [-0.03, -0.24],
    [0.03, -0.36],
    [0, -0.47],
];

/** One half of the heart, split along {@link SEAM}: the right half with `side` 1, the left with -1. */
function heartHalf(side: 1 | -1): Array<[number, number]> {
    const n = 48;
    const rim: Array<[number, number]> = [];
    for (let i = 1; i < n / 2; i++) {
        const t = (i / n) * Math.PI * 2;
        const x = 16 * Math.sin(t) ** 3;
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        rim.push([(side * x) / 32, (y + 2) / 32]);
    }
    // Down the outside from the cleft to the tip, then back up the crack.
    return [...rim, ...[...SEAM].reverse()];
}

const QUAD = quad();
const COIN = extrude(disk(0.5, 28), 0.14);
const COIN_FACE = extrude(starburst(5, 0.26, 0.12), 0.18);
const HEART = extrude(heartPoints(), 0.3);
const ROD = lathe(
    [
        [0.001, 0],
        [0.5, 0],
        [0.5, 1],
        [0.001, 1],
    ],
    20
);

/** A solid, lit, glossy shape riding `parent`, shown for its `life`. */
function solid(
    fx: FxBuilder,
    parent: TransformNode,
    geo: Geometry,
    color: string,
    o: {life: number; rim?: [number, number, number]; size?: number; at?: At; order?: number; alpha?: number}
) {
    return fx.sys({
        geo,
        tex: 'white',
        blend: 'alpha',
        life: o.life,
        size: o.size ?? 1,
        burst: [[0, 1]],
        color,
        alpha: o.alpha,
        at: o.at,
        parent,
        order: o.order ?? 6,
        look: {
            lighting: 'fixed',
            scalingMode: 'hierarchy',
            rim: o.rim ? {color: o.rim, power: 2, strength: 1, mode: 'add'} : undefined,
        },
    });
}

/**
 * A word as chunky 3D lettering: the painted label on a quad, with darker copies stacked behind it
 * for depth, all on a node that can be moved, turned and scaled. Returns that node.
 */
function sign(
    fx: FxBuilder,
    parent: TransformNode,
    text: string,
    style: LabelStyle,
    height: number,
    o: {
        life: number;
        at?: At;
        layers?: number;
        depth?: number;
        back?: string;
        order?: number;
        alpha?: Array<[number, number]>;
    }
): TransformNode {
    const lab = label(fx.scene, text, style);
    const holder = fx.node('sign', o.at ?? [0, 0, 0], parent);
    const plate = fx.node('plate', [0, 0, 0], holder);
    plate.scaling.set(lab.aspect * height, height, 1);
    const layers = o.layers ?? 5;
    const depth = o.depth ?? 0.12;
    for (let i = layers - 1; i >= 0; i--) {
        fx.sys({
            geo: QUAD,
            sheet: lab,
            blend: 'alpha',
            life: o.life,
            size: 1,
            burst: [[0, 1]],
            color: i === 0 ? '#ffffff' : (o.back ?? '#3a2a44'),
            at: [0, 0, -(i * depth) / Math.max(1, layers - 1)],
            parent: plate,
            order: (o.order ?? 7) + (i === 0 ? 1 : 0),
            look: {scalingMode: 'hierarchy'},
            b: o.alpha ? [tint([['#ffffff', 0]], o.alpha)] : [],
        });
    }
    return holder;
}

/** Each character of `text` as its own {@link sign}, laid out in a row centred on `parent`. */
function letters(
    fx: FxBuilder,
    parent: TransformNode,
    text: string,
    style: LabelStyle,
    height: number,
    o: {life: number; back?: string; layers?: number; order?: number}
): Array<{node: TransformNode; x: number}> {
    const widths = [...text].map((ch) =>
        ch === ' ' ? 0.35 * height : label(fx.scene, ch, style).aspect * height * 0.78
    );
    const total = widths.reduce((a, b) => a + b, 0);
    let x = -total / 2;
    const out: Array<{node: TransformNode; x: number}> = [];
    [...text].forEach((ch, i) => {
        const cx = x + widths[i] / 2;
        x += widths[i];
        if (ch === ' ') return;
        const node = sign(fx, parent, ch, style, height, {...o, at: [cx, 0, 0]});
        out.push({node, x: cx});
    });
    return out;
}

/** Speed lines streaking past along x: a burst at each of `times`. */
function speedLines(
    fx: FxBuilder,
    o: {
        at: At;
        dir: 'right' | 'left';
        times: number[];
        count: number;
        color: string;
        spread?: number;
        parent?: TransformNode;
    }
) {
    return fx.sys({
        tex: 'dot',
        mode: RenderMode.StretchedBillBoard,
        stretch: {speed: 0.9, length: 1},
        life: [0.16, 0.28],
        speed: [14, 22],
        size: [0.025, 0.05],
        burst: o.times.map((t) => [t, o.count] as [number, number]),
        color: [o.color, '#ffffff'],
        shape: new ConeEmitter({radius: o.spread ?? 0.6, angle: 0.01, thickness: 1}),
        aim: o.dir,
        at: o.at,
        parent: o.parent,
        order: 5,
        b: [tint([['#ffffff', 0]], popOut(0.4))],
    });
}

/** A slanted bar of light sweeping across `parent` along x, from `x0` to `x1` between `t0` and `t1`. */
function shine(
    fx: FxBuilder,
    parent: TransformNode,
    o: {period: number; t0: number; t1: number; x0: number; x1: number; height: number; z?: number; y?: number}
) {
    const node = fx.node('shine', [o.x0, o.y ?? 0, o.z ?? 0.25], parent);
    const bar = fx.sys({
        tex: 'streak',
        blend: 'add',
        life: o.period,
        size: 1,
        burst: [[0, 1]],
        rot: Math.PI / 2 - 0.35,
        color: '#ffffff',
        alpha: 0.85,
        parent: node,
        order: 9,
        b: [tint([['#ffffff', 0]], windowed(o.period, o.t0, o.t1, 0.08))],
    });
    bar.startSize = new Vector3Function(
        new ConstantValue(o.height * 1.3),
        new ConstantValue(o.height * 0.22),
        new ConstantValue(1)
    );
    fx.every((t) => {
        node.position.x = o.x0 + (o.x1 - o.x0) * span(t, o.t0, o.t1);
    });
}

/** Little four-point stars popping at random round `at` within `radius`, for a while. */
function twinkles(
    fx: FxBuilder,
    o: {
        at: At;
        radius: number;
        rate: number;
        from: number;
        to: number;
        period: number;
        color: string;
        parent?: TransformNode;
    }
) {
    const system = fx.sys({
        tex: 'glint',
        life: [0.3, 0.5],
        size: [0.14, 0.26],
        rate: o.rate,
        color: ['#ffffff', o.color],
        shape: new SphereEmitter({radius: o.radius, thickness: 1}),
        at: o.at,
        parent: o.parent,
        order: 9,
        b: [tint([['#ffffff', 0]], popOut(0.5)), grow([0, 0.2], [0.4, 1], [1, 0.3])],
    });
    gate(system, o.period, o.from, o.to, o.rate);
    return system;
}

/** A burst of glints and dots flung out of a point, for a pop. */
function pop(
    fx: FxBuilder,
    o: {at: At; time: number; color: string; count?: number; speed?: number; parent?: TransformNode}
) {
    fx.sys({
        tex: 'glint',
        world: true,
        life: [0.35, 0.6],
        speed: [(o.speed ?? 3) * 0.5, o.speed ?? 3],
        size: [0.12, 0.24],
        burst: [[o.time, o.count ?? 10]],
        color: ['#ffffff', o.color],
        shape: new SphereEmitter({radius: 0.1, thickness: 1}),
        at: o.at,
        parent: o.parent,
        order: 9,
        b: [tint([['#ffffff', 0]], popOut(0.4)), airDrag(4)],
    });
}

/** Rays bursting out of a point in the camera's plane: a starburst of streaks. */
function rays(
    fx: FxBuilder,
    o: {at: At; time: number; color: string; count?: number; life?: number; length?: number; parent?: TransformNode}
) {
    fx.sys({
        tex: 'streak',
        blend: 'add',
        mode: RenderMode.StretchedBillBoard,
        stretch: {speed: 0.25, length: o.length ?? 2},
        life: o.life ?? 0.35,
        speed: [3, 6],
        size: [0.08, 0.14],
        burst: [[o.time, o.count ?? 14]],
        color: o.color,
        shape: new ConeEmitter({radius: 0.05, angle: Math.PI / 2, thickness: 1}),
        at: o.at,
        parent: o.parent,
        order: 8,
        b: [tint([['#ffffff', 0]], popOut(0.3)), airDrag(6)],
    });
}

export const ui: FxDef[] = [
    {
        id: 'ui/achievement',
        name: 'Achievement',
        loop: false,
        period: 2.4,
        view: {height: 1.7, distance: 7.5},
        build(fx) {
            const P = 2.4;
            const toast = fx.node('toast', [0, 1.7, 0]);
            // A dark plate in a gold frame, a slab in depth.
            solid(fx, toast, extrude(roundRect(4.6, 1.34, 0.3), 0.14), GOLD[4], {
                life: P,
                at: [0, 0, -0.08],
                rim: [1, 0.85, 0.4],
            });
            solid(fx, toast, extrude(roundRect(4.36, 1.1, 0.22), 0.2), '#241834', {life: P, rim: [0.45, 0.3, 0.7]});
            sign(fx, toast, 'ACHIEVEMENT', GOLD_TEXT, 0.42, {life: P, at: [0.4, 0.2, 0.14], back: GOLD[1]});
            sign(fx, toast, 'UNLOCKED', WHITE_TEXT, 0.34, {life: P, at: [0.4, -0.24, 0.14], back: '#2a2238'});
            // The medal: a spinning gold coin with a star struck in it on a blue ribbon.
            const medal = fx.node('medal', [-1.65, 0, 0.3], toast);
            const ribbon = extrude(
                [
                    [-0.3, 0.1],
                    [-0.1, 0.1],
                    [0.02, -0.3],
                    [-0.06, -0.44],
                    [-0.16, -0.32],
                    [-0.26, -0.44],
                    [-0.36, -0.32],
                ],
                0.06
            );
            solid(fx, medal, ribbon, '#3c64d8', {life: P, at: [0.02, -0.18, -0.06]});
            solid(fx, medal, ribbon, '#2c48a8', {life: P, at: [0.36, -0.18, -0.08]});
            solid(fx, medal, COIN, GOLD[4], {life: P, size: 0.82, rim: [1, 0.9, 0.5]});
            solid(fx, medal, COIN_FACE, GOLD[6], {life: P, size: 0.82, rim: [1, 1, 0.8]});
            flash(fx, {at: [-1.65, 1.7, 0.6], size: 2.4, time: 0.45, color: GOLD[6], order: 9});
            pop(fx, {at: [-1.65, 1.7, 0.6], time: 0.45, color: GOLD[5], count: 16, speed: 4});
            fx.sys({
                tex: 'ring',
                life: 0.4,
                size: 2.2,
                burst: [[0.45, 1]],
                color: GOLD[6],
                at: [-1.65, 1.7, 0.5],
                order: 8,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.2], [1, 1])],
            });
            // In on speed lines, out on more.
            speedLines(fx, {
                at: [-3.2, 1.7, 0],
                dir: 'right',
                times: [0, 0.08, 0.16],
                count: 8,
                color: GOLD[5],
                spread: 0.7,
            });
            speedLines(fx, {
                at: [-1, 1.7, 0],
                dir: 'right',
                times: [2.0, 2.08, 2.16],
                count: 8,
                color: GOLD[5],
                spread: 0.7,
            });
            shine(fx, toast, {period: P, t0: 1.05, t1: 1.5, x0: -2.6, x1: 2.6, height: 1.4});
            twinkles(fx, {at: [-1.65, 1.7, 0.5], radius: 0.6, rate: 6, from: 0.7, to: 1.9, period: P, color: GOLD[5]});
            fx.every((t) => {
                const inn = backOut(span(t, 0, 0.32));
                const out = easeIn(span(t, 2.0, 2.4));
                toast.position.x = -7 * (1 - inn) + 8 * out;
                // It swings round to face us as it slides in, and away as it leaves.
                toast.rotation.y = -0.9 * (1 - easeOut(span(t, 0, 0.4))) + 0.7 * out;
                const m = t < 0.45 ? 0 : backOut(span(t, 0.45, 0.7));
                show(medal, m);
                medal.rotation.y = (1 - easeOut(span(t, 0.45, 0.9))) * Math.PI * 4 + Math.sin(t * 3) * 0.25;
            });
        },
    },
    {
        id: 'ui/coin-collect',
        name: 'Coin Collect',
        loop: false,
        period: 2.45,
        view: {height: 1.6, distance: 7.5},
        build(fx) {
            const P = 2.45;
            const N = 10;
            const HUD: At = [1.3, 3.0, 0];
            // The counter: a coin icon and a count that ticks up as each coin lands.
            const hud = fx.node('hud', HUD);
            solid(fx, hud, extrude(roundRect(2.0, 0.66, 0.3), 0.12), '#1c1428', {
                life: P,
                at: [0.25, 0, -0.1],
                rim: [0.6, 0.45, 0.2],
            });
            const icon = fx.node('icon', [-0.45, 0, 0.05], hud);
            solid(fx, icon, COIN, GOLD[4], {life: P, size: 0.46, rim: [1, 0.9, 0.5]});
            solid(fx, icon, COIN_FACE, GOLD[6], {life: P, size: 0.46});
            const counts = Array.from({length: N + 1}, (_, i) =>
                sign(fx, hud, `×${12 + i}`, GOLD_TEXT, 0.46, {life: P, at: [0.45, 0, 0.08], layers: 3, back: GOLD[1]})
            );
            const arrive = (i: number) => 1.0 + i * 0.09 + 0.18;
            // The coin on the floor, glowing, then the fountain.
            const coins = Array.from({length: N}, (_, i) => {
                const node = fx.node('coin', [0, 0.3, 0]);
                solid(fx, node, COIN, GOLD[4], {life: P, size: 0.34, rim: [1, 0.9, 0.5]});
                solid(fx, node, COIN_FACE, GOLD[6], {life: P, size: 0.34});
                fx.sys({
                    tex: 'glow',
                    world: true,
                    life: 0.25,
                    size: [0.12, 0.2],
                    rateOverDistance: 14,
                    color: GOLD[5],
                    parent: node,
                    order: 5,
                    b: [tint([['#ffffff', 0]], fadeOut(0.2, 0)), grow([0, 1], [1, 0.2])],
                });
                const a = (i / N) * Math.PI * 2 + 0.4;
                const hang: At = [Math.cos(a) * (0.7 + (i % 3) * 0.25), 1.5 + (i % 4) * 0.22, Math.sin(a) * 0.7];
                return {node, hang, i};
            });
            light(fx, {at: [0, 0.3, 0], size: 1, color: GOLD[5], alpha: 0.8, life: 0.3});
            flash(fx, {at: [0, 0.4, 0], size: 2, time: 0.25, color: GOLD[6]});
            sparks(fx, {
                at: [0, 0.3, 0],
                time: 0.25,
                count: 18,
                speed: [3, 6],
                palette: [
                    [GOLD[7], 0],
                    [GOLD[5], 0.4],
                    [GOLD[3], 1],
                ],
                gravity: 6,
            });
            decal(fx, {at: [0, 0.012, 0], size: 1.4, color: GOLD[4], alpha: 0.5, life: 0.8, delay: 0.2});
            for (let i = 0; i < N; i++) pop(fx, {at: HUD, time: arrive(i), color: GOLD[5], count: 4, speed: 2});
            shine(fx, hud, {period: P, t0: 2.0, t1: 2.2, x0: -1, x1: 1.4, height: 0.8});
            fx.every((t) => {
                for (const c of coins) {
                    const launch = 0.25 + c.i * 0.015;
                    const leave = 1.0 + c.i * 0.09;
                    const p = c.node.position;
                    if (t < launch) {
                        p.set(0, 0.3, 0);
                        show(c.node, c.i === 0 ? 1 : 0);
                    } else if (t < leave) {
                        // Up in an arc, then hanging and bobbing.
                        const k = easeOut(span(t, launch, launch + 0.5));
                        const bob = Math.sin(t * 6 + c.i) * 0.05;
                        p.set(
                            c.hang[0] * k,
                            0.3 + (c.hang[1] - 0.3) * k + Math.sin(k * Math.PI) * 0.6 + bob,
                            c.hang[2] * k
                        );
                        show(c.node, 1);
                    } else {
                        // Zipping into the counter.
                        const k = easeIn(span(t, leave, leave + 0.18));
                        p.set(
                            c.hang[0] + (HUD[0] - 0.45 - c.hang[0]) * k,
                            c.hang[1] + (HUD[1] - c.hang[1]) * k,
                            c.hang[2] * (1 - k)
                        );
                        show(c.node, k < 1 ? 1 - k * 0.4 : 0);
                    }
                    c.node.rotation.y = t * 9 + c.i;
                }
                let n = 0;
                let since = 9;
                for (let i = 0; i < N; i++) {
                    if (t >= arrive(i)) {
                        n = i + 1;
                        since = t - arrive(i);
                    }
                }
                const bump = 1 + 0.3 * Math.max(0, 1 - since / 0.15);
                const fold = 1 - easeIn(span(t, 2.15, 2.45));
                const unfold = backOut(span(t, 0, 0.3));
                show(hud, 1, 1, unfold * fold);
                counts.forEach((c, i) => show(c, i === n ? bump : 0));
                icon.rotation.y = since < 0.3 ? since * 20 : 0;
            });
        },
    },
    {
        id: 'ui/combo-counter',
        name: 'Combo Counter',
        loop: false,
        period: 1.45,
        view: {height: 1.8, distance: 7},
        build(fx) {
            const P = 1.45;
            const style: LabelStyle = {top: MAGENTA[6], bottom: MAGENTA[4], stroke: MAGENTA[0]};
            const g = fx.node('combo', [0, 1.9, 0]);
            const tilt = fx.node('tilt', [0, 0, 0], g);
            sign(fx, tilt, 'x5', {top: '#ffffff', bottom: MAGENTA[5], stroke: MAGENTA[0]}, 1.3, {
                life: P,
                at: [-0.9, 0.1, 0],
                back: MAGENTA[1],
                depth: 0.25,
            });
            sign(fx, tilt, 'COMBO', style, 0.62, {life: P, at: [0.75, -0.15, 0], back: MAGENTA[1], depth: 0.18});
            // The timer bar under it, draining from the right.
            solid(fx, tilt, extrude(roundRect(2.9, 0.22, 0.1), 0.1), MAGENTA[0], {life: P, at: [0, -0.75, -0.04]});
            const fill = fx.node('fill', [-1.38, -0.75, 0.03], tilt);
            solid(fx, fill, extrude(roundRect(2.76, 0.12, 0.05), 0.1), MAGENTA[4], {
                life: P,
                at: [1.38, 0, 0],
                rim: [1, 0.6, 1],
            });
            // The slam: a flash, a ring and sparks.
            flash(fx, {at: [0, 1.9, 0.4], size: 4, time: 0.3, color: '#ffffff', order: 9});
            shockwave(fx, {
                at: [0, 1.9, 0.2],
                facing: true,
                tex: 'ring',
                size: 5,
                life: 0.4,
                color: MAGENTA[5],
                delay: 0.3,
            });
            sparks(fx, {
                at: [0, 1.9, 0.3],
                time: 0.3,
                count: 24,
                speed: [4, 8],
                palette: [
                    [MAGENTA[7], 0],
                    [MAGENTA[5], 0.4],
                    [MAGENTA[3], 1],
                ],
                gravity: 4,
            });
            speedLines(fx, {
                at: [-4, 1.9, 0],
                dir: 'right',
                times: [0, 0.07, 0.14, 0.21],
                count: 9,
                color: MAGENTA[5],
                spread: 0.9,
            });
            speedLines(fx, {
                at: [0, 1.9, 0],
                dir: 'right',
                times: [1.15, 1.22, 1.29],
                count: 9,
                color: MAGENTA[5],
                spread: 0.9,
            });
            twinkles(fx, {
                at: [0, 1.9, 0.3],
                radius: 1.4,
                rate: 7,
                from: 0.4,
                to: 1.1,
                period: P,
                color: MAGENTA[5],
                parent: undefined,
            });
            fx.every((t) => {
                const inn = easeOut(span(t, 0, 0.3));
                const out = easeIn(span(t, 1.15, 1.45));
                g.position.x = -8 * (1 - inn) + 9 * out;
                // Smeared long while it flies, squashed on the stop, pulsing while the timer runs.
                const moving = 1 - inn + out;
                const slam = Math.max(0, 1 - Math.abs(t - 0.32) / 0.08);
                const pulse = t > 0.4 && t < 1.15 ? 1 + 0.06 * Math.max(0, Math.sin((t - 0.4) * 14)) : 1;
                show(g, pulse, 1 + moving * 0.9 + slam * 0.25, 1 - moving * 0.35 - slam * 0.2);
                tilt.rotation.y = -0.8 * (1 - inn) + 0.6 * out + Math.sin(t * 3) * 0.12;
                tilt.rotation.z = -0.08 * (1 - inn);
                show(fill, 1, Math.max(HIDE, 1 - span(t, 0.35, 1.15)), 1);
            });
        },
    },
    {
        id: 'ui/confetti',
        name: 'Confetti',
        loop: false,
        period: 3.4,
        view: {height: 1.2, distance: 8},
        build(fx) {
            const P = 3.4;
            const popper = lathe(
                [
                    [0.001, 0],
                    [0.06, 0],
                    [0.24, 0.62],
                    [0.2, 0.62],
                    [0.001, 0.62],
                ],
                20
            );
            const bangs: Array<{side: 1 | -1; time: number}> = [
                {side: -1, time: 0.3},
                {side: 1, time: 0.65},
            ];
            for (const {side, time} of bangs) {
                const x = side * 1.9;
                // The popper, tipped in toward the middle, kicking back as it goes off.
                const base = fx.node('popper', [x, 0.05, 0.3]);
                const body = fx.node('body', [0, 0, 0], base);
                solid(fx, body, popper, side < 0 ? '#e0405a' : '#3ca8f0', {life: P, rim: [1, 1, 1], size: 1.5});
                solid(fx, body, ROD, '#ffe03c', {life: P, size: 0.18, at: [0, -0.06, 0]});
                fx.every((t) => {
                    const kick = t > time ? Math.exp(-(t - time) * 10) * Math.sin((t - time) * 40) : 0;
                    body.rotation.z = side * (0.55 + kick * 0.25);
                    base.position.y = 0.05 - Math.abs(kick) * 0.06;
                });
                const mouth: At = [x - side * 0.5, 0.82, 0.3];
                // Lit paper bits, flipping as they flutter down, settling on the floor.
                for (let k = 0; k < 4; k++) {
                    fx.sys({
                        geo: extrude(roundRect(0.1, 0.16, 0.01, 1), 0.01),
                        tex: 'white',
                        blend: 'alpha',
                        world: true,
                        tumble: 12,
                        life: [2.2, 2.9],
                        speed: [5, 9],
                        size: [1.2, 1.8],
                        burst: [[time, 22]],
                        color: [PARTY[(k * 2) % 7], PARTY[(k * 2 + 1) % 7]],
                        shape: new ConeEmitter({radius: 0.08, angle: 0.4, thickness: 1}),
                        aim: side < 0 ? 'right' : 'left',
                        rotate: [-0.95, 0, 0],
                        at: mouth,
                        order: 6,
                        look: {lighting: 'fixed', renderFace: 'both'},
                        b: [
                            gravity(2.6),
                            airDrag(3.2),
                            wobble(1.4, 0.8),
                            floorBounce(0, 0.02),
                            tint([['#ffffff', 0]], fadeOut(0.9, 0)),
                        ],
                    });
                }
                // Curly streamers trailing behind.
                for (let k = 0; k < 3; k++) {
                    fx.sys({
                        tex: 'white',
                        mode: RenderMode.Trail,
                        trail: 12,
                        world: true,
                        life: [1.4, 1.9],
                        speed: [6, 9],
                        size: [0.035, 0.05],
                        burst: [[time, 2]],
                        color: PARTY[(k * 3 + (side > 0 ? 1 : 0)) % 7],
                        shape: new ConeEmitter({radius: 0.05, angle: 0.35, thickness: 1}),
                        aim: side < 0 ? 'right' : 'left',
                        rotate: [-0.95, 0, 0],
                        at: mouth,
                        order: 6,
                        b: [
                            gravity(2.6),
                            airDrag(2.8),
                            wobble(1.6, 0.7),
                            floorBounce(0, 0.02),
                            tint([['#ffffff', 0]], fadeOut(0.85, 0)),
                        ],
                    });
                }
                flash(fx, {at: mouth, size: 1.6, time, color: '#fff6c8'});
                fx.sys({
                    tex: 'smoke',
                    life: [0.5, 0.8],
                    speed: [0.5, 1.2],
                    size: [0.3, 0.5],
                    burst: [[time, 5]],
                    color: '#c8c0d0',
                    alpha: 0.5,
                    shape: new SphereEmitter({radius: 0.1, thickness: 1}),
                    at: mouth,
                    order: 4,
                    b: [tint([['#ffffff', 0]], fadeOut(0.3)), grow([0, 0.6], [1, 1.4])],
                });
                pop(fx, {at: mouth, time, color: '#ffe03c', count: 8, speed: 4});
            }
        },
    },
    {
        id: 'ui/countdown',
        name: 'Countdown',
        loop: false,
        period: 3.1,
        view: {height: 1.8, distance: 7},
        build(fx) {
            const P = 3.1;
            const BEAT = 0.69;
            const C: At = [0, 1.8, 0];
            const dial = fx.node('dial', C);
            solid(fx, dial, extrude(disk(1.0, 40), 0.16), BLUE[0], {life: P, at: [0, 0, -0.12], rim: [0.3, 0.5, 1]});
            solid(fx, dial, extrude(disk(1.18, 40), 0.08), BLUE[1], {life: P, at: [0, 0, -0.18]});
            // The fuse: 24 segments round the ring, burning away clockwise each beat.
            const SEGS = 24;
            const half = Math.PI / SEGS - 0.02;
            const seg = extrude(
                [
                    [Math.cos(-half) * 1.12, Math.sin(-half) * 1.12],
                    [Math.cos(half) * 1.12, Math.sin(half) * 1.12],
                    [Math.cos(half) * 0.98, Math.sin(half) * 0.98],
                    [Math.cos(-half) * 0.98, Math.sin(-half) * 0.98],
                ],
                0.14
            );
            const segs = Array.from({length: SEGS}, (_, i) => {
                const node = fx.node('seg', [0, 0, 0.02], dial);
                node.rotation.z = Math.PI / 2 - ((i + 0.5) / SEGS) * Math.PI * 2;
                solid(fx, node, seg, BLUE[4], {life: P, rim: [0.6, 0.9, 1]});
                return node;
            });
            const fuse = fx.node('fuse', [0, 1.05, 0.15], dial);
            const burn = fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.08, length: 1},
                world: true,
                life: [0.2, 0.45],
                speed: [1.5, 3.5],
                size: [0.03, 0.05],
                rate: 60,
                color: [BLUE[6], '#ffffff'],
                shape: new SphereEmitter({radius: 0.04, thickness: 1}),
                parent: fuse,
                order: 8,
                b: [tint([['#ffffff', 0]], popOut(0.4)), gravity(4)],
            });
            gate(burn, P, 0, BEAT * 3, 60);
            fx.sys({
                tex: 'glow',
                life: P,
                size: 0.5,
                burst: [[0, 1]],
                color: BLUE[5],
                parent: fuse,
                order: 8,
                b: [tint([['#ffffff', 0]], windowed(P, 0, BEAT * 3, 0.05))],
            });
            const digits = ['3', '2', '1'].map((d) =>
                sign(fx, dial, d, {top: '#ffffff', bottom: BLUE[5], stroke: BLUE[0]}, 1.25, {
                    life: P,
                    at: [0, 0, 0.2],
                    back: BLUE[1],
                    depth: 0.2,
                })
            );
            const go = sign(fx, dial, 'GO!', {top: '#e6ffb0', bottom: '#3cc83a', stroke: '#0a2a10'}, 1.0, {
                life: P,
                at: [0, 0, 0.3],
                back: '#123a18',
                depth: 0.22,
            });
            for (let i = 0; i < 3; i++) {
                flash(fx, {at: [0, 1.8, 0.4], size: 2.6, time: i * BEAT + 0.02, color: BLUE[6], order: 9});
                pop(fx, {at: [0, 1.8, 0.3], time: i * BEAT + 0.02, color: BLUE[5], count: 8, speed: 3});
            }
            const GO = BEAT * 3;
            flash(fx, {at: [0, 1.8, 0.4], size: 5, time: GO, color: '#e6ffb0', order: 9});
            shockwave(fx, {
                at: [0, 1.8, 0.1],
                facing: true,
                tex: 'ring',
                size: 6,
                life: 0.5,
                color: '#9dff6a',
                delay: GO,
            });
            shockwave(fx, {at: [0, 0.03, 0], size: 5, life: 0.6, color: BLUE[5], delay: GO, alpha: 0.6});
            rays(fx, {at: [0, 1.8, 0.2], time: GO, color: '#d8ffa0', count: 18, life: 0.45, length: 3});
            sparks(fx, {
                at: [0, 1.8, 0.2],
                time: GO,
                count: 30,
                speed: [4, 8],
                palette: [
                    ['#ffffff', 0],
                    ['#9dff6a', 0.4],
                    ['#2fae3a', 1],
                ],
                gravity: 5,
            });
            // The ring blows out into shards.
            fx.sys({
                mesh: 'shard',
                tumble: 10,
                world: true,
                life: [0.6, 0.9],
                speed: [3, 6],
                size: [0.08, 0.14],
                burst: [[GO, 20]],
                color: [BLUE[4], BLUE[6]],
                shape: new ConeEmitter({radius: 1.05, angle: Math.PI / 2, thickness: 0.01}),
                at: C,
                order: 7,
                b: [gravity(6), grow([0, 1], [0.7, 1], [1, 0])],
            });
            fx.every((t) => {
                const beat = Math.min(2, Math.floor(t / BEAT));
                const local = t - beat * BEAT;
                const left = t < GO ? 1 - local / BEAT : 0;
                segs.forEach((node, i) => show(node, t < GO && i / SEGS < left ? 1 : 0));
                const a = Math.PI / 2 - (1 - left) * Math.PI * 2;
                fuse.position.set(Math.cos(a) * 1.05, Math.sin(a) * 1.05, 0.15);
                digits.forEach((d, i) => {
                    const on = t < GO && i === beat;
                    const slam = on ? 1 + 0.9 * (1 - easeOut(span(local, 0, 0.14))) : 0;
                    show(d, slam);
                    d.rotation.y = on ? (1 - easeOut(span(local, 0, 0.25))) * 1.2 : 0;
                });
                show(dial, t < GO ? backOut(span(t, 0, 0.2)) : 1 - easeIn(span(t, GO, GO + 0.12)));
                const g = t < GO ? 0 : backOut(span(t, GO, GO + 0.2)) * (1 - easeIn(span(t, GO + 0.55, GO + 0.85)));
                show(go, g);
                go.position.z = t < GO ? 0 : 0.3;
                go.rotation.z = Math.sin(t * 20) * 0.04 * (t > GO ? 1 : 0);
                // The dial's own children hide with it, so GO! rides the root at the dial's place.
                if (t >= GO) go.parent = fx.root;
                else go.parent = dial;
                if (t >= GO) go.position.set(C[0], C[1], 0.3);
                else go.position.set(0, 0, 0.3);
            });
        },
    },
    {
        id: 'ui/crit-number',
        name: 'Crit Number',
        loop: false,
        period: 1.5,
        view: {height: 1.8, distance: 7},
        build(fx) {
            const P = 1.5;
            const shake = fx.node('shake', [0, 1.8, 0]);
            const g = fx.node('crit', [0, 0, 0], shake);
            const burst = fx.node('burst', [0, 0, -0.3], g);
            solid(fx, burst, extrude(starburst(12, 1.5, 0.95, 0.12), 0.12), FIRE[3], {life: P, rim: [1, 0.7, 0.3]});
            solid(fx, burst, extrude(starburst(12, 1.2, 0.78, 0.12), 0.16), FIRE[5], {life: P, at: [0, 0, 0.03]});
            const hot = sign(fx, g, '128!', {top: '#ffffff', bottom: '#fff4d8', stroke: '#3a1010'}, 1.15, {
                life: P,
                at: [0, -0.1, 0.1],
                back: '#6a2a20',
                depth: 0.25,
            });
            const cool = sign(fx, g, '128!', {top: FIRE[6], bottom: FIRE[3], stroke: FIRE[0]}, 1.15, {
                life: P,
                at: [0, -0.1, 0.1],
                back: FIRE[1],
                depth: 0.25,
            });
            sign(fx, g, 'CRIT', {top: FIRE[7], bottom: FIRE[5], stroke: FIRE[0]}, 0.42, {
                life: P,
                at: [-0.2, 0.62, 0.2],
                back: FIRE[1],
            });
            flash(fx, {at: [0, 1.8, 0.4], size: 5, time: 0, color: '#ffffff', order: 9});
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.5, length: 1},
                life: [0.2, 0.3],
                speed: [10, 16],
                size: [0.03, 0.06],
                burst: [
                    [0, 16],
                    [0.08, 10],
                ],
                color: ['#ffffff', FIRE[6]],
                shape: new SphereEmitter({radius: 1.6, thickness: 0.1}),
                at: [0, 1.8, 0],
                order: 5,
                b: [tint([['#ffffff', 0]], popOut(0.4))],
            });
            shockwave(fx, {at: [0, 1.8, 0], facing: true, tex: 'ring', size: 5, life: 0.35, color: FIRE[6]});
            shine(fx, g, {period: P, t0: 0.6, t1: 0.9, x0: -1.4, x1: 1.4, height: 1.4, z: 0.4});
            const END = 1.15;
            sparks(fx, {
                at: [0, 1.8, 0.2],
                time: END,
                count: 40,
                speed: [3, 7],
                palette: [
                    [FIRE[7], 0],
                    [FIRE[5], 0.3],
                    [FIRE[3], 1],
                ],
                gravity: 5,
            });
            flash(fx, {at: [0, 1.8, 0.4], size: 3, time: END, color: FIRE[6], order: 9});
            pop(fx, {at: [0, 1.8, 0.3], time: END, color: FIRE[5], count: 14, speed: 4});
            fx.every((t) => {
                const k = Math.max(0, 1 - t / 0.3);
                shake.position.set(Math.sin(t * 90) * 0.18 * k, 1.8 + Math.cos(t * 77) * 0.12 * k, 0);
                const s = t < END ? 1 + 0.9 * (1 - easeOut(span(t, 0, 0.12))) : 1 - easeIn(span(t, END, END + 0.08));
                show(g, s);
                show(hot, t < 0.14 ? 1 : 0);
                show(cool, t < 0.14 ? 0 : 1 + 0.04 * Math.sin(t * 12));
                burst.rotation.z = t * 0.8;
                g.rotation.y = Math.sin(t * 2.4) * 0.25;
            });
        },
    },
    {
        id: 'ui/damage-number',
        name: 'Damage Number',
        loop: false,
        period: 1.05,
        view: {height: 1.7, distance: 5.2},
        build(fx) {
            const P = 1.05;
            hero(fx, {period: P});
            hero(fx, {
                period: P,
                blend: 'add',
                color: RED[4],
                lighting: 'unlit',
                order: 4,
                fade: [
                    [0, 0],
                    [0.7, 0.02],
                    [0, 0.2],
                    [0, 1],
                ],
            });
            const HIT: At = [0.2, 1.5, 0.45];
            flash(fx, {at: HIT, size: 1.6, time: 0, color: '#ffffff', life: 0.12});
            sparks(fx, {
                at: HIT,
                time: 0,
                count: 14,
                speed: [3, 6],
                palette: [
                    [RED[7], 0],
                    [RED[4], 0.4],
                    [RED[2], 1],
                ],
                gravity: 8,
                size: [0.04, 0.07],
            });
            fx.sys({
                tex: 'ring',
                life: 0.25,
                size: 0.9,
                burst: [[0, 1]],
                color: RED[5],
                at: HIT,
                order: 8,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.2], [1, 1])],
            });
            const num = fx.node('num', [0.3, 2.0, 0.4]);
            const fade = windowed(P, 0, P, 0.2);
            const white = sign(fx, num, '-27', {top: '#ffffff', bottom: '#ffe8e0', stroke: '#2a0a10'}, 1.0, {
                life: P,
                back: '#5a1a20',
                alpha: fade,
            });
            const red = sign(fx, num, '-27', {top: RED[5], bottom: RED[3], stroke: RED[0]}, 1.0, {
                life: P,
                back: RED[1],
                alpha: fade,
            });
            fx.every((t) => {
                // Up in an arc, landing with a squash and a hop, then lifting away.
                const a = span(t, 0, 0.42);
                const hop = span(t, 0.48, 0.66);
                const lift = easeOut(span(t, 0.8, 1.05));
                num.position.set(
                    0.3 + 0.55 * easeOut(a) + 0.15 * hop,
                    2.0 + Math.sin(a * Math.PI) * 0.7 + Math.sin(hop * Math.PI) * 0.2 + lift * 0.5,
                    0.4
                );
                const squash =
                    Math.max(0, 1 - Math.abs(t - 0.44) / 0.06) + 0.5 * Math.max(0, 1 - Math.abs(t - 0.67) / 0.05);
                const pop = 1 + 0.6 * (1 - easeOut(span(t, 0, 0.1)));
                show(num, pop, 1 + squash * 0.3, 1 - squash * 0.35);
                show(white, t < 0.07 ? 1 : 0);
                show(red, t < 0.07 ? 0 : 1);
                num.rotation.z = -0.25 * (1 - easeOut(a)) + 0.06 * Math.sin(hop * Math.PI);
            });
        },
    },
    {
        id: 'ui/exclamation',
        name: 'Exclamation',
        loop: false,
        period: 1.4,
        view: {height: 2.2, distance: 5.4},
        build(fx) {
            const P = 1.4;
            hero(fx, {period: P});
            const bang = fx.node('bang', [0, 2.3, 0]);
            const big = fx.node('big', [0, 0, 0], bang);
            big.scaling.setAll(1.5);
            const mark = fx.node('mark', [0, 0, 0], big);
            const bar = extrude(
                [
                    [-0.13, 0.8],
                    [0.13, 0.8],
                    [0.07, 0.24],
                    [-0.07, 0.24],
                ],
                0.16
            );
            solid(fx, mark, bar, AMBER[4], {life: P, rim: [1, 0.85, 0.4]});
            solid(fx, mark, extrude(disk(0.09, 16), 0.16), AMBER[4], {life: P, at: [0, 0.08, 0], rim: [1, 0.85, 0.4]});
            light(fx, {at: [0, 2.4, 0], size: 1.4, color: AMBER[5], alpha: 0.6, life: 0.4});
            // Surprise ticks flicking out round it.
            for (const time of [0.12, 0.55]) {
                fx.sys({
                    tex: 'streak',
                    mode: RenderMode.StretchedBillBoard,
                    stretch: {speed: 0.12, length: 2},
                    life: 0.2,
                    speed: [3, 4],
                    size: 0.1,
                    burst: [[time, 5]],
                    color: AMBER[6],
                    shape: new ConeEmitter({radius: 0.25, angle: 0.9, thickness: 0.01}),
                    aim: 'up',
                    at: [0, 2.6, 0],
                    order: 8,
                    b: [tint([['#ffffff', 0]], popOut(0.3)), airDrag(8)],
                });
            }
            pop(fx, {at: [0, 2.7, 0], time: 1.2, color: AMBER[5], count: 12, speed: 2.5});
            fx.every((t) => {
                // Springs up stretched, lands squashed, wobbles, then pops.
                const rise = span(t, 0, 0.18);
                const fall = span(t, 0.18, 0.32);
                const y = t < 0.18 ? 1.9 + easeOut(rise) * 0.7 : 2.6 - easeIn(fall) * 0.3;
                bang.position.y = y;
                const stretch = t < 0.18 ? 0.4 * (1 - rise) : 0;
                const squash = Math.max(0, 1 - Math.abs(t - 0.33) / 0.07);
                const s = t < 1.2 ? Math.min(1, t / 0.06) : 1 - easeIn(span(t, 1.2, 1.28));
                show(mark, s, 1 - stretch * 0.4 + squash * 0.35, 1 + stretch - squash * 0.35);
                mark.rotation.z =
                    Math.sin((t - 0.33) * 22) * 0.25 * Math.exp(-Math.max(0, t - 0.33) * 5) * (t > 0.33 ? 1 : 0);
                mark.rotation.y = Math.sin(t * 3) * 0.5;
            });
        },
    },
    {
        id: 'ui/health-bar-hit',
        name: 'Health Bar Hit',
        loop: false,
        period: 2.0,
        view: {height: 1.8, distance: 5.5},
        build(fx) {
            const P = 2.0;
            const N = 10;
            const FROM = 8;
            const TO = 4;
            const SEG = 0.34;
            const holder = fx.node('bar', [0, 1.8, 0]);
            const bar = fx.node('jolt', [0, 0, 0], holder);
            solid(fx, bar, extrude(roundRect(N * SEG + 0.3, 0.5, 0.14), 0.16), '#1a1222', {
                life: P,
                at: [0.25, 0, -0.08],
                rim: [0.6, 0.3, 0.4],
            });
            const heart = fx.node('heart', [-1.75, 0, 0.1], bar);
            solid(fx, heart, HEART, RED[4], {life: P, size: 0.6, rim: [1, 0.6, 0.6]});
            const block = extrude(roundRect(SEG - 0.05, 0.3, 0.05, 2), 0.14);
            const x0 = -1.45 + SEG / 2;
            const segs = Array.from({length: N}, (_, i) => {
                const node = fx.node('seg', [x0 + i * SEG, 0, 0.04], bar);
                const lit = fx.node('lit', [0, 0, 0], node);
                const white = fx.node('white', [0, 0, 0], node);
                const ghost = fx.node('ghost', [0, 0, 0], node);
                solid(fx, lit, block, i < 3 ? RED[3] : RED[4], {life: P, rim: [1, 0.5, 0.5]});
                solid(fx, white, block, '#ffffff', {life: P});
                solid(fx, ghost, block, RED[6], {life: P, alpha: 0.85});
                solid(fx, node, block, '#2a1a2a', {life: P, size: 0.96, at: [0, 0, -0.02]});
                return {node, lit, white, ghost, i};
            });
            const HIT = 0.15;
            flash(fx, {at: [x0 + 6 * SEG, 1.8, 0.4], size: 2, time: HIT, color: '#ffffff'});
            fx.sys({
                mesh: 'cube',
                tumble: 12,
                world: true,
                life: [0.6, 0.9],
                speed: [2, 5],
                size: [0.05, 0.09],
                burst: [[HIT, 16]],
                color: [RED[4], RED[6]],
                shape: new SphereEmitter({radius: 0.3, thickness: 1}),
                at: [x0 + 6 * SEG, 1.8, 0.1],
                order: 7,
                b: [gravity(9), floorBounce(0.3), grow([0, 1], [0.8, 1], [1, 0])],
            });
            // The draining edge throws sparks.
            const edge = fx.node('edge', [0, 1.8, 0.15]);
            const spit = fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.08, length: 1},
                world: true,
                life: [0.2, 0.4],
                speed: [1.5, 3],
                size: [0.03, 0.05],
                rate: 50,
                color: [RED[6], '#ffffff'],
                shape: new SphereEmitter({radius: 0.12, thickness: 1}),
                parent: edge,
                order: 8,
                b: [tint([['#ffffff', 0]], popOut(0.4)), gravity(5)],
            });
            gate(spit, P, 0.9, 1.45, 50);
            fx.every((t) => {
                const k = t > HIT ? Math.exp(-(t - HIT) * 9) : 0;
                bar.position.set(Math.sin((t - HIT) * 60) * 0.12 * k, -0.15 * k, 0);
                heart.rotation.y = t * 2;
                show(heart, 1 + 0.3 * k);
                const drain = easeOut(span(t, 0.9, 1.45));
                const level = FROM - (FROM - TO) * drain;
                for (const s of segs) {
                    const alive = s.i < TO;
                    const lost = s.i >= TO && s.i < FROM;
                    show(s.lit, alive || (lost && t < HIT) ? 1 : 0);
                    show(s.white, lost && t >= HIT && t < HIT + 0.12 ? 1 : 0);
                    const fill = clamp01(level - s.i);
                    show(s.ghost, lost && t >= HIT + 0.12 ? 1 : 0, Math.max(HIDE, fill), 1);
                    s.ghost.position.x = -(1 - fill) * SEG * 0.5;
                }
                edge.position.x = x0 - SEG / 2 + level * SEG;
                show(holder, backOut(span(t, 0, 0.15)), 1, 1 - easeIn(span(t, 1.7, 2.0)));
            });
        },
    },
    {
        id: 'ui/heart-lost',
        name: 'Heart Lost',
        loop: false,
        period: 1.5,
        view: {height: 1.7, distance: 6},
        build(fx) {
            const P = 1.5;
            const C: At = [0, 1.7, 0];
            const HIT = 0.12;
            const CRACK = 0.3;
            const SPLIT = 0.5;
            const whole = fx.node('heart', C);
            solid(fx, whole, HEART, RED[4], {life: P, size: 1.3, rim: [1, 0.6, 0.6]});
            const white = fx.node('white', [0, 0, 0], whole);
            solid(fx, white, HEART, '#ffffff', {life: P, size: 1.34});
            // The crack: a dark seam of quads down the middle.
            const crack = fx.node('crack', [0, 0, 0.22], whole);
            for (let i = 0; i < SEAM.length - 1; i++) {
                const [ax, ay] = SEAM[i];
                const [bx, by] = SEAM[i + 1];
                const piece = fx.node('crack', [((ax + bx) / 2) * 1.3, ((ay + by) / 2) * 1.3, 0], crack);
                piece.rotation.z = Math.atan2(by - ay, bx - ax);
                piece.scaling.set(Math.hypot(bx - ax, by - ay) * 1.3 + 0.03, 0.04, 1);
                fx.sys({
                    geo: QUAD,
                    tex: 'white',
                    blend: 'alpha',
                    life: P,
                    size: 1,
                    burst: [[0, 1]],
                    color: RED[0],
                    parent: piece,
                    order: 8,
                    look: {scalingMode: 'hierarchy'},
                });
            }
            const halves = ([-1, 1] as const).map((side) => {
                const node = fx.node('half', C);
                solid(fx, node, extrude(heartHalf(side), 0.3), RED[4], {life: P, size: 1.3, rim: [1, 0.6, 0.6]});
                return {node, side};
            });
            // The empty socket left behind, a dark outline.
            const socket = fx.node('socket', [C[0], C[1], -0.3]);
            solid(fx, socket, HEART, '#140810', {life: P, size: 1.36, alpha: 0.85, rim: [0.5, 0.15, 0.2]});
            flash(fx, {at: [0, 1.7, 0.4], size: 2.6, time: HIT, color: '#ffffff', order: 9});
            flash(fx, {at: [0, 1.7, 0.4], size: 3.4, time: SPLIT, color: RED[6], order: 9});
            fx.sys({
                tex: 'ring',
                life: 0.4,
                size: 3,
                burst: [[SPLIT, 1]],
                color: RED[5],
                at: [0, 1.7, 0.2],
                order: 8,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.2], [1, 1])],
            });
            fx.sys({
                mesh: 'shard',
                tumble: 12,
                world: true,
                life: [0.6, 1],
                speed: [2, 4.5],
                size: [0.05, 0.1],
                burst: [[SPLIT, 14]],
                color: [RED[3], RED[5]],
                shape: new SphereEmitter({radius: 0.2, thickness: 1}),
                at: C,
                order: 7,
                b: [gravity(8), floorBounce(0.3), grow([0, 1], [0.8, 1], [1, 0])],
            });
            twinkles(fx, {
                at: [0, 1.7, 0.2],
                radius: 0.9,
                rate: 8,
                from: SPLIT,
                to: 1.3,
                period: P,
                color: RED[6],
            });
            fx.every((t) => {
                const k = t > HIT ? Math.exp(-(t - HIT) * 10) : 0;
                whole.position.set(Math.sin((t - HIT) * 70) * 0.14 * k, C[1], 0);
                whole.rotation.y = t < HIT ? Math.sin(t * 6) * 0.3 : 0;
                show(whole, t < SPLIT ? 1 + 0.15 * k : 0);
                show(white, t >= HIT && t < HIT + 0.1 ? 1 : 0);
                show(crack, t >= CRACK ? 1 : 0, 1, t >= CRACK ? span(t, CRACK, CRACK + 0.12) : 1);
                for (const h of halves) {
                    const u = Math.max(0, t - SPLIT);
                    h.node.position.set(C[0] + h.side * (0.03 + u * 1.4), C[1] + u * 1.6 - 4.5 * u * u, u * 0.8);
                    h.node.rotation.z = -h.side * u * 3;
                    h.node.rotation.y = h.side * u * 2;
                    show(h.node, t >= SPLIT ? 1 - easeIn(span(t, 1.1, 1.4)) : 0);
                }
                show(socket, t >= SPLIT ? 1 - easeIn(span(t, 0.95, 1.4)) : 0);
            });
        },
    },
    {
        id: 'ui/level-up',
        name: 'Level Up',
        loop: false,
        period: 3.2,
        view: {height: 1.7, distance: 7.5},
        build(fx) {
            const P = 3.2;
            const BURST = 0.4;
            hero(fx, {period: P});
            hero(fx, {
                period: P,
                blend: 'add',
                color: GOLD[5],
                lighting: 'unlit',
                order: 4,
                fade: [
                    [0, 0],
                    [0, BURST / P],
                    [0.35, (BURST + 0.05) / P],
                    [0.15, 1.2 / P],
                    [0, 2.2 / P],
                    [0, 1],
                ],
            });
            // Gold gathering in at the feet.
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.1, length: 1},
                life: 0.3,
                speed: -4,
                size: [0.04, 0.07],
                burst: [[0, 30]],
                color: [GOLD[5], GOLD[7]],
                shape: new SphereEmitter({radius: 1.2, thickness: 0.1}),
                at: [0, 0.3, 0],
                order: 6,
                b: [tint([['#ffffff', 0]], fadeOut(0.8, 0.2))],
            });
            light(fx, {at: [0, 0.03, 0], size: 2.4, color: GOLD[5], alpha: 0.8, life: 0.5, floor: true});
            // The pillar: a column of light round the hero, swelling and thinning away.
            for (const [w, a, c] of [
                [1.6, 0.45, GOLD[4]],
                [0.6, 0.8, GOLD[6]],
            ] as Array<[number, number, string]>) {
                const beam = fx.sys({
                    tex: 'streak',
                    blend: 'add',
                    life: 1.8,
                    size: 1,
                    burst: [[BURST, 1]],
                    rot: Math.PI / 2,
                    color: c,
                    alpha: a,
                    at: [0, 2.2, 0],
                    order: 5,
                    b: [
                        tint(
                            [['#ffffff', 0]],
                            [
                                [0, 0],
                                [1, 0.06],
                                [0.7, 0.5],
                                [0, 1],
                            ]
                        ),
                        grow([0, 0.3], [0.12, 1.05], [1, 0.7]),
                    ],
                });
                beam.startSize = new Vector3Function(
                    new ConstantValue(5.2),
                    new ConstantValue(w),
                    new ConstantValue(1)
                );
            }
            flash(fx, {at: [0, 1, 0], size: 4, time: BURST, color: GOLD[6]});
            shockwave(fx, {at: [0, 0.05, 0], size: 5, life: 0.6, color: GOLD[5], delay: BURST});
            // Rings climbing it.
            const climb = fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 0.9,
                speed: 2.6,
                size: [1.4, 1.8],
                rate: 5,
                color: GOLD[6],
                aim: 'up',
                at: [0, 0.05, 0],
                order: 6,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.1)), grow([0, 1], [1, 0.6])],
            });
            gate(climb, P, BURST, 1.6, 5);
            const motes = fx.sys({
                tex: 'glow',
                life: [0.6, 1],
                speed: [1.5, 3],
                size: [0.06, 0.12],
                rate: 30,
                color: [GOLD[5], GOLD[7]],
                shape: new ConeEmitter({radius: 0.6, angle: 0.05, thickness: 1}),
                aim: 'up',
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.4))],
            });
            gate(motes, P, BURST, 1.8, 30);
            // LEVEL UP! dropping in letter by letter.
            const word = fx.node('word', [0, 2.75, 0.4]);
            const row = letters(fx, word, 'LEVEL UP!', GOLD_TEXT, 0.8, {life: P, back: GOLD[1]});
            shine(fx, word, {period: P, t0: 1.55, t1: 1.95, x0: -2.2, x1: 2.2, height: 0.9, z: 0.3});
            twinkles(fx, {at: [0, 2.0, 0.3], radius: 1.6, rate: 8, from: 1.2, to: 2.6, period: P, color: GOLD[5]});
            fx.every((t) => {
                row.forEach((r, i) => {
                    const t0 = 0.75 + i * 0.07;
                    const d = span(t, t0, t0 + 0.22);
                    const leave = span(t, 2.6 + i * 0.03, 2.9 + i * 0.03);
                    r.node.position.set(r.x, (1 - backOut(d)) * 1.4 + easeIn(leave) * 1.2, 0);
                    show(r.node, t < t0 ? 0 : 1 - leave);
                    r.node.rotation.y = (1 - easeOut(d)) * 1.5;
                });
                word.rotation.y = Math.sin(t * 1.2) * 0.12;
            });
        },
    },
    {
        id: 'ui/quest-complete',
        name: 'Quest Complete',
        loop: false,
        period: 2.6,
        view: {height: 1.8, distance: 7.5},
        build(fx) {
            const P = 2.6;
            const W = 4.6;
            const banner = fx.node('banner', [0, 1.8, 0]);
            const band = fx.node('band', [0, 0, 0], banner);
            solid(fx, band, extrude(roundRect(W, 0.82, 0.06, 1), 0.12), '#8c1a22', {life: P, rim: [1, 0.5, 0.4]});
            // The stitching, a gold seam along both edges.
            for (const y of [0.3, -0.3]) {
                solid(fx, band, extrude(roundRect(W - 0.2, 0.035, 0.01, 1), 0.14), GOLD[5], {
                    life: P,
                    at: [0, y, 0.01],
                });
            }
            // The rolls at each end, spinning as the ribbon unrolls.
            const rolls = ([-1, 1] as const).map((side) => {
                const node = fx.node('roll', [0, 0, 0.05], banner);
                const spinNode = fx.node('spin', [0, 0, 0], node);
                spinNode.rotation.x = Math.PI / 2;
                solid(fx, spinNode, ROD, '#6a1018', {life: P, size: 0.3, at: [0, -0.5, 0], rim: [1, 0.5, 0.4]});
                return {node, spinNode, side};
            });
            // Swallowtails.
            const tail = extrude(
                [
                    [0, 0.36],
                    [0.7, 0.36],
                    [0.45, 0],
                    [0.7, -0.36],
                    [0, -0.36],
                ],
                0.1
            );
            const tails = ([-1, 1] as const).map((side) => {
                const node = fx.node('tail', [0, 0, -0.12], banner);
                const inner = fx.node('flip', [0, -0.15, 0], node);
                inner.rotation.y = side < 0 ? Math.PI : 0;
                solid(fx, inner, tail, '#5e0e16', {life: P});
                return {node, side};
            });
            const word = fx.node('word', [0, 0, 0.12], banner);
            const row = letters(fx, word, 'QUEST COMPLETE', {top: GOLD[6], bottom: GOLD[4], stroke: '#2a0606'}, 0.5, {
                life: P,
                back: '#3a0a0e',
                layers: 3,
            });
            // The seal: a gold coin with a tick, stamped down hard.
            const STAMP = 1.3;
            const seal = fx.node('seal', [W / 2 + 0.3, 0, 0.35], banner);
            solid(fx, seal, extrude(starburst(16, 0.62, 0.52), 0.14), GOLD[4], {life: P, rim: [1, 0.9, 0.5]});
            solid(fx, seal, extrude(disk(0.44, 28), 0.2), GOLD[5], {life: P});
            solid(
                fx,
                seal,
                extrude(
                    [
                        [-0.26, 0.02],
                        [-0.14, 0.12],
                        [-0.05, 0.0],
                        [0.2, 0.26],
                        [0.3, 0.14],
                        [-0.05, -0.22],
                    ],
                    0.26
                ),
                '#7a3a08',
                {life: P}
            );
            flash(fx, {at: [W / 2 + 0.3, 1.8, 0.6], size: 2.4, time: STAMP, color: GOLD[6], order: 9});
            fx.sys({
                tex: 'ring',
                life: 0.4,
                size: 2.4,
                burst: [[STAMP, 1]],
                color: GOLD[6],
                at: [W / 2 + 0.3, 1.8, 0.4],
                order: 8,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.2], [1, 1])],
            });
            // Stars popping off the stamp: little lit stars, spinning.
            fx.sys({
                geo: extrude(starburst(5, 0.5, 0.22), 0.2),
                tex: 'white',
                blend: 'alpha',
                world: true,
                life: [0.6, 0.9],
                speed: [2.5, 4.5],
                size: [0.12, 0.2],
                burst: [[STAMP, 9]],
                color: [GOLD[5], GOLD[6]],
                shape: new SphereEmitter({radius: 0.2, thickness: 1}),
                at: [W / 2 + 0.3, 1.8, 0.5],
                order: 8,
                look: {lighting: 'fixed', rim: {color: [1, 0.9, 0.5], power: 2, strength: 1, mode: 'add'}},
                b: [gravity(4), airDrag(2), spin(6), tint([['#ffffff', 0]], popOut(0.4))],
            });
            shine(fx, banner, {period: P, t0: 1.55, t1: 1.95, x0: -W / 2, x1: W / 2, height: 1, z: 0.3});
            fx.every((t) => {
                const open = easeOut(span(t, 0.1, 0.5));
                const close = easeIn(span(t, 2.2, 2.55));
                const w = Math.max(HIDE, open * (1 - close));
                show(band, 1, w, 1);
                const show2 = t > 0.1 && t < 2.55 ? 1 : 0;
                for (const r of rolls) {
                    r.node.position.x = (r.side * W * w) / 2;
                    r.spinNode.rotation.y = t * 14 * r.side;
                    show(r.node, show2 && (open < 1 || close > 0) ? 1 : 0);
                }
                for (const tl of tails) {
                    tl.node.position.x = (tl.side * W * w) / 2;
                    show(tl.node, show2 ? Math.min(1, w * 2) : 0);
                }
                row.forEach((r, i) => {
                    const t0 = 0.5 + i * 0.045;
                    const out = Math.abs(r.x) > (W * w) / 2 - 0.1;
                    const k = backOut(span(t, t0, t0 + 0.1));
                    show(r.node, t < t0 || out ? 0 : k);
                });
                word.position.x = -0.35;
                const s =
                    t < STAMP - 0.12
                        ? 0
                        : t < STAMP
                          ? 1 + 0.9 * (1 - span(t, STAMP - 0.12, STAMP))
                          : 1 + 0.1 * Math.max(0, 1 - (t - STAMP) / 0.1);
                show(seal, close > 0 ? s * (1 - close) : s);
                seal.position.z = 0.35 + (t < STAMP ? (1 - span(t, STAMP - 0.12, STAMP)) * 1 : 0);
                seal.rotation.z =
                    t < STAMP
                        ? -0.5 * (1 - span(t, STAMP - 0.12, STAMP))
                        : Math.sin((t - STAMP) * 30) * 0.08 * Math.exp(-(t - STAMP) * 6);
                seal.rotation.y = Math.sin(t * 2) * 0.2;
                banner.rotation.y = Math.sin(t * 1.3) * 0.08;
            });
        },
    },
];
