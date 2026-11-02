import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {CircleEmitter, ConeEmitter, ConstantValue, RenderMode, SphereEmitter, Vector3Function} from 'babylon.quarks';
import {
    airDrag,
    extrude,
    fadeOut,
    floorBounce,
    gravity,
    grow,
    lathe,
    orbit,
    popOut,
    spin,
    tint,
    wobble,
    type Geometry,
} from './kit';
import {gate, type At} from './parts';
import {decal, flash, shockwave} from './recipes';
import {type FxBuilder, type FxDef} from './stage';

const GOLD = ['#1e1206', '#4a2c08', '#86520c', '#c48412', '#f0b424', '#ffe066', '#fff6c4', '#ffffff'];
const MAGENTA = ['#1a0516', '#3d0a33', '#701560', '#b0228f', '#f53cd1', '#ff86e6', '#ffd2f6', '#ffffff'];
const AMBER = ['#1a0a04', '#3e1606', '#702a08', '#a8480c', '#e07818', '#ffa838', '#ffd890', '#ffffff'];
const RUBY = ['#16040e', '#3e0a1e', '#760e2e', '#b8163c', '#ec3250', '#ff7482', '#ffc4c8', '#ffffff'];
const HEARTS = ['#1a0408', '#4a0a14', '#8a1222', '#d02436', '#ff4a56', '#ff8a8e', '#ffd0cc', '#ffffff'];
const SILVER = ['#0e1018', '#222838', '#3c4660', '#5e6d8e', '#8c9cbc', '#bccae2', '#e6eeff', '#ffffff'];
const EPIC = ['#140a24', '#2c1250', '#4b1d86', '#7330c0', '#a050f0', '#c890ff', '#ecd4ff', '#ffffff'];
const STAR = ['#2a1604', '#5e3208', '#a05c0c', '#e09414', '#ffc626', '#ffe866', '#fff8c4', '#ffffff'];
const XP = ['#0c1806', '#1e3a0a', '#36620e', '#5c9614', '#8cd024', '#c4f060', '#effcc0', '#ffffff'];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const easeOut = (x: number) => 1 - (1 - x) ** 3;

/**
 * The same shape with hard edges: every triangle gets its own vertices and a flat normal, turned
 * to agree with the smooth normals it had, so a lathed gem or crystal shows its facets.
 */
function faceted(geo: Geometry): Geometry {
    const {positions: p, normals: n, uvs: u, indices: idx} = geo;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let t = 0; t < idx.length; t += 3) {
        const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
        const ax = p[a * 3];
        const ay = p[a * 3 + 1];
        const az = p[a * 3 + 2];
        const e1 = [p[b * 3] - ax, p[b * 3 + 1] - ay, p[b * 3 + 2] - az];
        const e2 = [p[c * 3] - ax, p[c * 3 + 1] - ay, p[c * 3 + 2] - az];
        let nx = e1[1] * e2[2] - e1[2] * e2[1];
        let ny = e1[2] * e2[0] - e1[0] * e2[2];
        let nz = e1[0] * e2[1] - e1[1] * e2[0];
        const len = Math.hypot(nx, ny, nz);
        if (len < 1e-9) continue;
        nx /= len;
        ny /= len;
        nz /= len;
        const sx = n[a * 3] + n[b * 3] + n[c * 3];
        const sy = n[a * 3 + 1] + n[b * 3 + 1] + n[c * 3 + 1];
        const sz = n[a * 3 + 2] + n[b * 3 + 2] + n[c * 3 + 2];
        const flip = nx * sx + ny * sy + nz * sz < 0;
        const base = positions.length / 3;
        for (const v of flip ? [a, c, b] : [a, b, c]) {
            positions.push(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]);
            uvs.push(u[v * 2], u[v * 2 + 1]);
            if (flip) normals.push(-nx, -ny, -nz);
            else normals.push(nx, ny, nz);
        }
        indices.push(base, base + 1, base + 2);
    }
    return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        uvs: new Float32Array(uvs),
        indices: new Uint32Array(indices),
    };
}

/** Moves every vertex of `geo` with `fn`, before {@link faceted} gives it hard edges. */
function warp(geo: Geometry, fn: (x: number, y: number, z: number) => [number, number, number]): Geometry {
    const positions = new Float32Array(geo.positions);
    for (let i = 0; i < positions.length; i += 3) {
        const [x, y, z] = fn(positions[i], positions[i + 1], positions[i + 2]);
        positions[i] = x;
        positions[i + 1] = y;
        positions[i + 2] = z;
    }
    return {...geo, positions};
}

/** A sphere of radius 0.5. */
function sphereProfile(rows = 12, r = 0.5): Array<[number, number]> {
    return Array.from({length: rows + 1}, (_, i) => {
        const a = -Math.PI / 2 + (i / rows) * Math.PI;
        return [Math.max(0.001, Math.cos(a) * r), Math.sin(a) * r] as [number, number];
    });
}

/** A ring of tube `tube` thick, `radius` round, lying in the x-z plane. */
function torus(radius: number, tube: number, segments = 32): Geometry {
    const profile = Array.from({length: 13}, (_, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        return [radius + Math.cos(a) * tube, Math.sin(a) * tube] as [number, number];
    });
    return lathe(profile, segments);
}

/** A disc of radius `r`, for {@link extrude}. */
function disk(r: number, n = 40): Array<[number, number]> {
    return Array.from({length: n}, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        return [Math.cos(a) * r, Math.sin(a) * r] as [number, number];
    });
}

/** A star of `points` points. */
function starOutline(points: number, outer: number, inner: number): Array<[number, number]> {
    return Array.from({length: points * 2}, (_, i) => {
        const a = Math.PI / 2 + (i / (points * 2)) * Math.PI * 2;
        const r = i % 2 === 0 ? outer : inner;
        return [Math.cos(a) * r, Math.sin(a) * r] as [number, number];
    });
}

/** A heart about one unit across. */
function heartOutline(): Array<[number, number]> {
    return Array.from({length: 48}, (_, i) => {
        const t = (i / 48) * Math.PI * 2;
        const x = 16 * Math.sin(t) ** 3;
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        return [x / 32, (y + 2) / 32] as [number, number];
    });
}

const SPHERE = lathe(sphereProfile(), 20);
const COIN = extrude(disk(0.5), 0.16);
const COIN_STAR = extrude(starOutline(5, 0.3, 0.13), 0.2);
const COIN_RIM = torus(0.47, 0.06, 40);
/** A brilliant cut: a table, a crown sloping to the girdle and a deep pavilion to the culet. */
const BRILLIANT = faceted(
    lathe(
        [
            [0.001, 0.3],
            [0.28, 0.3],
            [0.5, 0.08],
            [0.5, 0.02],
            [0.001, -0.5],
        ],
        10
    )
);
const HEART = extrude(heartOutline(), 0.42);

/** A solid, lit, glossy shape riding `parent`, born again every `life` seconds. */
function solid(
    fx: FxBuilder,
    parent: TransformNode,
    geo: Geometry,
    color: string,
    o: {
        life: number;
        rim?: [number, number, number];
        size?: number;
        at?: At;
        order?: number;
        alpha?: number;
        blend?: 'add' | 'alpha';
        lit?: boolean;
    }
) {
    return fx.sys({
        geo,
        tex: 'white',
        blend: o.blend ?? 'alpha',
        life: o.life,
        size: o.size ?? 1,
        burst: [[0, 1]],
        color,
        alpha: o.alpha,
        at: o.at,
        parent,
        order: o.order ?? 5,
        look: {
            lighting: o.lit === false ? 'unlit' : 'fixed',
            scalingMode: 'hierarchy',
            rim: o.rim ? {color: o.rim, power: 2, strength: 1, mode: 'add'} : undefined,
        },
    });
}

/** A soft shadow on the floor under a hovering pickup, shrinking as it rises. */
function shadow(fx: FxBuilder, o: {size: number; life: number; at?: At}) {
    const node = fx.node('shadow', o.at ?? [0, 0.012, 0]);
    fx.sys({
        tex: 'glow',
        mode: RenderMode.HorizontalBillBoard,
        life: o.life,
        size: o.size,
        burst: [[0, 1]],
        color: '#000000',
        alpha: 0.6,
        parent: node,
        order: 1,
        look: {scalingMode: 'hierarchy'},
    });
    return node;
}

/** A node hovering at `y`, bobbing `amp` up and down once a `period`. */
function hover(fx: FxBuilder, y: number, amp: number, period: number, at: At = [0, 0, 0]): TransformNode {
    const node = fx.node('hover', [at[0], y, at[2]]);
    fx.every((t) => {
        node.position.y = y + Math.sin((t / period) * Math.PI * 2) * amp;
    });
    return node;
}

/** Little four-point stars winking round `at`. */
function twinkles(
    fx: FxBuilder,
    o: {at: At; radius: number; rate: number; color: string; size?: number; parent?: TransformNode}
) {
    return fx.sys({
        tex: 'glint',
        life: [0.3, 0.55],
        size: o.size ? [o.size * 0.6, o.size] : [0.12, 0.22],
        rate: o.rate,
        color: ['#ffffff', o.color],
        shape: new SphereEmitter({radius: o.radius, thickness: 1}),
        at: o.at,
        parent: o.parent,
        order: 8,
        b: [tint([['#ffffff', 0]], popOut(0.5)), grow([0, 0.2], [0.4, 1], [1, 0.2])],
    });
}

/** A bar of light in the camera's plane, `w` long and `h` thick, turned `rot`. */
function bar(
    fx: FxBuilder,
    o: {
        w: number;
        h: number;
        rot: number;
        color: string;
        life: number;
        time?: number;
        alpha?: number;
        at?: At;
        parent?: TransformNode;
        order?: number;
        alphas?: Array<[number, number]>;
        spinning?: number;
    }
) {
    const system = fx.sys({
        tex: 'streak',
        blend: 'add',
        life: o.life,
        size: 1,
        burst: [[o.time ?? 0, 1]],
        rot: o.rot,
        color: o.color,
        alpha: o.alpha ?? 1,
        at: o.at,
        parent: o.parent,
        order: o.order ?? 4,
        b: [...(o.alphas ? [tint([['#ffffff', 0]], o.alphas)] : []), ...(o.spinning ? [spin(o.spinning)] : [])],
    });
    system.startSize = new Vector3Function(new ConstantValue(o.w), new ConstantValue(o.h), new ConstantValue(1));
    return system;
}

/** Alpha keys over `period`: on between `t0` and `t1`, faded `fade` at each end. */
function windowed(period: number, t0: number, t1: number, fade = 0.05): Array<[number, number]> {
    const k = (t: number) => clamp01(t / period);
    const keys: Array<[number, number]> = [[0, 0]];
    for (const [a, t] of [
        [0, t0],
        [1, t0 + fade],
        [1, t1 - fade],
        [0, t1],
    ] as Array<[number, number]>) {
        if (k(t) > keys[keys.length - 1][1]) keys.push([a, k(t)]);
    }
    if (keys[keys.length - 1][1] < 1) keys.push([0, 1]);
    return keys;
}

export const pickups: FxDef[] = [
    {
        id: 'pickups/chest-open',
        name: 'Chest Open',
        loop: false,
        period: 4.6,
        view: {height: 0.9, distance: 6},
        build(fx) {
            const P = 4.6;
            const OPEN = 1.2;
            const WOOD = '#6a3a16';
            const chest = fx.node('chest', [0, 0, 0]);
            // The box, its gold bands and its lock.
            const box = extrude(
                [
                    [-0.7, 0],
                    [0.7, 0],
                    [0.7, 0.62],
                    [-0.7, 0.62],
                ],
                0.9
            );
            solid(fx, chest, box, WOOD, {life: P, rim: [0.5, 0.3, 0.1]});
            for (const x of [-0.5, 0.5]) {
                solid(
                    fx,
                    chest,
                    extrude(
                        [
                            [-0.07, -0.01],
                            [0.07, -0.01],
                            [0.07, 0.63],
                            [-0.07, 0.63],
                        ],
                        0.94
                    ),
                    GOLD[4],
                    {life: P, at: [x, 0, 0], rim: [1, 0.8, 0.4], order: 6}
                );
            }
            solid(fx, chest, extrude(disk(0.11, 16), 0.1), GOLD[5], {
                life: P,
                at: [0, 0.56, 0.47],
                rim: [1, 0.9, 0.5],
                order: 6,
            });
            // The lid: a half barrel hinged along the back edge.
            const hinge = fx.node('hinge', [0, 0.62, -0.45], chest);
            const lidShape = extrude(
                Array.from({length: 13}, (_, i) => {
                    const a = (i / 12) * Math.PI;
                    return [Math.cos(a) * 0.45 + 0.45, Math.sin(a) * 0.32] as [number, number];
                }),
                1.4
            );
            const lid = fx.node('lid', [0, 0, 0], hinge);
            lid.rotation.y = -Math.PI / 2;
            solid(fx, lid, lidShape, '#7a4418', {life: P, rim: [0.5, 0.3, 0.1]});
            for (const x of [-0.5, 0.5]) {
                const band = extrude(
                    Array.from({length: 13}, (_, i) => {
                        const a = (i / 12) * Math.PI;
                        return [Math.cos(a) * 0.47 + 0.45, Math.sin(a) * 0.34] as [number, number];
                    }),
                    0.14
                );
                solid(fx, lid, band, GOLD[4], {life: P, at: [0, 0, x], rim: [1, 0.8, 0.4], order: 6});
            }
            // Light leaking from the seam while it rattles, then pouring out.
            const seam = fx.sys({
                tex: 'glow',
                blend: 'add',
                life: OPEN + 0.1,
                size: 1,
                burst: [[0, 1]],
                color: GOLD[5],
                at: [0, 0.64, 0.46],
                order: 6,
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [0, 0],
                            [0.4, 0.2],
                            [0.2, 0.4],
                            [0.7, 0.6],
                            [0.3, 0.8],
                            [1, 1],
                        ]
                    ),
                ],
            });
            seam.startSize = new Vector3Function(new ConstantValue(1.8), new ConstantValue(0.18), new ConstantValue(1));
            for (let i = 0; i < 7; i++) {
                bar(fx, {
                    w: 3.4,
                    h: 0.22,
                    rot: Math.PI / 2 + (i - 3) * 0.22,
                    color: i % 2 ? GOLD[5] : GOLD[6],
                    life: 2.2,
                    time: OPEN,
                    at: [0, 1.5, 0],
                    order: 4,
                    alphas: [
                        [0, 0],
                        [0.9, 0.08],
                        [0.6, 0.6],
                        [0, 1],
                    ],
                });
            }
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: 2.4,
                size: 2.4,
                burst: [[OPEN, 1]],
                color: GOLD[5],
                at: [0, 0.75, 0],
                order: 3,
                b: [tint([['#ffffff', 0]], fadeOut(0.3, 0.05))],
            });
            flash(fx, {at: [0, 0.8, 0.3], size: 3, time: OPEN, color: GOLD[6]});
            // Coins and gems arcing out, bouncing and glinting, then collected.
            const loot = (geo: Geometry, color: [string, string], count: number, size: [number, number]) =>
                fx.sys({
                    geo,
                    tex: 'white',
                    blend: 'alpha',
                    world: true,
                    tumble: 9,
                    life: [2.6, 3.0],
                    speed: [3.5, 5.5],
                    size,
                    burst: [[OPEN + 0.05, count]],
                    color,
                    shape: new ConeEmitter({radius: 0.3, angle: 0.55, thickness: 1}),
                    aim: 'up',
                    at: [0, 0.6, 0],
                    order: 6,
                    look: {lighting: 'fixed', rim: {color: [1, 0.85, 0.5], power: 2, strength: 0.8, mode: 'add'}},
                    b: [gravity(9), floorBounce(0.45, 0.04), tint([['#ffffff', 0]], fadeOut(0.88, 0))],
                });
            loot(COIN, [GOLD[4], GOLD[5]], 18, [0.15, 0.2]);
            loot(BRILLIANT, [RUBY[4], RUBY[5]], 4, [0.24, 0.3]);
            loot(BRILLIANT, ['#3cc8ff', '#7ae0ff'], 3, [0.22, 0.28]);
            loot(BRILLIANT, ['#5ad84a', '#9af07a'], 3, [0.22, 0.28]);
            const glints = fx.sys({
                tex: 'glint',
                life: [0.25, 0.4],
                size: [0.18, 0.32],
                rate: 10,
                color: '#ffffff',
                shape: new CircleEmitter({radius: 1.6, thickness: 1}),
                aim: 'up',
                at: [0, 0.15, 0],
                order: 8,
                b: [tint([['#ffffff', 0]], popOut(0.5))],
            });
            gate(glints, P, OPEN + 0.8, 3.8, 10);
            // Collected: each glint snaps up as a twinkle.
            fx.sys({
                tex: 'glint',
                life: [0.4, 0.6],
                speed: [2, 4],
                size: [0.14, 0.24],
                burst: [[3.75, 24]],
                color: [GOLD[6], '#ffffff'],
                shape: new CircleEmitter({radius: 1.4, thickness: 1}),
                aim: 'down',
                rotate: [Math.PI, 0, 0],
                at: [0, 0.15, 0],
                order: 8,
                b: [tint([['#ffffff', 0]], popOut(0.5)), airDrag(3)],
            });
            decal(fx, {
                at: [0, 0.012, 0],
                size: 3.4,
                color: GOLD[4],
                alpha: 0.45,
                life: 2.6,
                delay: OPEN,
                blend: 'add',
            });
            fx.every((t) => {
                // Rattling harder and harder, then the kick.
                const r = t < OPEN ? span(t, 0.1, OPEN) : 0;
                chest.rotation.z = Math.sin(t * 46) * 0.03 * r;
                chest.position.y = Math.abs(Math.sin(t * 23)) * 0.04 * r;
                const kick = easeOut(span(t, OPEN, OPEN + 0.18));
                const settle =
                    t > OPEN + 0.18 ? Math.sin((t - OPEN - 0.18) * 18) * 0.15 * Math.exp(-(t - OPEN - 0.18) * 6) : 0;
                hinge.rotation.x = t < OPEN ? -Math.abs(Math.sin(t * 23)) * 0.08 * r : -(1.95 * kick + settle);
            });
        },
    },
    {
        id: 'pickups/coin-spin',
        name: 'Coin Spin',
        loop: true,
        period: 1.6,
        view: {height: 1.0, distance: 4},
        build(fx) {
            const P = 1.6;
            const L = P + 0.02;
            const float = hover(fx, 1.0, 0.08, P);
            const coin = fx.node('coin', [0, 0, 0], float);
            solid(fx, coin, COIN, GOLD[4], {life: L, size: 0.9, rim: [1, 0.85, 0.4]});
            // The reeded rim, a ring stood up to face the camera like the disc.
            const rimNode = fx.node('rim', [0, 0, 0], coin);
            rimNode.rotation.x = Math.PI / 2;
            solid(fx, rimNode, COIN_RIM, GOLD[3], {life: L, size: 0.9, rim: [1, 0.85, 0.4]});
            solid(fx, coin, COIN_STAR, GOLD[6], {life: L, size: 0.9, rim: [1, 1, 0.8]});
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: L,
                size: 1.6,
                burst: [[0, 1]],
                color: GOLD[4],
                alpha: 0.35,
                parent: float,
                order: 2,
            });
            // A flash across the face each time it turns square on.
            for (const time of [0, P / 2]) {
                fx.sys({
                    tex: 'glint',
                    life: 0.25,
                    size: 0.9,
                    burst: [[time + 0.01, 1]],
                    color: '#ffffff',
                    at: [0.15, 0.15, 0.2],
                    parent: float,
                    order: 8,
                    b: [tint([['#ffffff', 0]], popOut(0.3)), grow([0, 0.2], [0.3, 1], [1, 0.3])],
                });
            }
            twinkles(fx, {at: [0, 0, 0], radius: 0.55, rate: 4, color: GOLD[6], parent: float});
            const sh = shadow(fx, {size: 0.9, life: L});
            fx.every((t) => {
                coin.rotation.y = (t / P) * Math.PI * 2;
                const k = 1 - (float.position.y - 0.92) / 0.4;
                sh.scaling.set(k * (0.55 + 0.45 * Math.abs(Math.cos(coin.rotation.y))), 1, k);
            });
        },
    },
    {
        id: 'pickups/collect-burst',
        name: 'Collect Burst',
        loop: false,
        period: 1.35,
        view: {height: 1.2, distance: 4.5},
        build(fx) {
            const C: At = [0, 1.2, 0];
            // The pickup itself, swallowed by the flash.
            const gem = fx.node('gem', C);
            solid(fx, gem, BRILLIANT, MAGENTA[4], {life: 0.12, size: 0.5, rim: [1, 0.6, 1]});
            flash(fx, {at: C, size: 2.6, color: '#ffffff', life: 0.25});
            for (const rot of [0, Math.PI / 2]) {
                bar(fx, {
                    w: 3.4,
                    h: 0.16,
                    rot,
                    color: MAGENTA[6],
                    life: 0.35,
                    at: C,
                    order: 7,
                    alphas: [
                        [1, 0],
                        [0.8, 0.3],
                        [0, 1],
                    ],
                });
            }
            shockwave(fx, {at: C, facing: true, tex: 'ring', size: 3, life: 0.3, color: MAGENTA[6]});
            shockwave(fx, {
                at: C,
                facing: true,
                tex: 'shock',
                size: 2.2,
                life: 0.55,
                color: MAGENTA[4],
                alpha: 0.7,
                delay: 0.06,
            });
            // A ring round the vertical too, so the burst reads as a sphere when the camera turns.
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 0.4,
                size: 2.6,
                burst: [[0.02, 1]],
                color: MAGENTA[5],
                at: C,
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.15], [1, 1])],
            });
            // Twinkles thrown wide on curving paths, braking and hanging before they wink out.
            fx.sys({
                tex: 'glint',
                life: [0.7, 1.25],
                speed: [2.5, 4.5],
                size: [0.12, 0.22],
                burst: [[0.02, 26]],
                color: ['#ffffff', MAGENTA[5]],
                shape: new SphereEmitter({radius: 0.1, thickness: 1}),
                at: C,
                order: 8,
                b: [
                    airDrag(4.5),
                    orbit(2.4, [0, 0, 1]),
                    tint(
                        [['#ffffff', 0]],
                        [
                            [1, 0],
                            [1, 0.6],
                            [0, 0.7],
                            [1, 0.8],
                            [0, 1],
                        ]
                    ),
                ],
            });
            fx.sys({
                tex: 'dot',
                life: [0.4, 0.8],
                speed: [1.5, 3],
                size: [0.04, 0.07],
                burst: [[0.02, 16]],
                color: MAGENTA[6],
                shape: new SphereEmitter({radius: 0.1, thickness: 1}),
                at: C,
                order: 7,
                b: [airDrag(3), tint([['#ffffff', 0]], fadeOut(0.5, 0))],
            });
            fx.every((t) => {
                gem.scaling.setAll(Math.max(1e-4, 1 - span(t, 0, 0.12)));
            });
        },
    },
    {
        id: 'pickups/crystal-shard',
        name: 'Crystal Shard',
        loop: true,
        period: 3.2,
        view: {height: 1.2, distance: 4.5},
        build(fx) {
            const P = 3.2;
            const L = P + 0.02;
            // A broken prism: chipped faces, the top sheared off at a slant.
            const rough = (i: number) => Math.sin(i * 12.9898) * 0.5 + Math.sin(i * 4.1414) * 0.5;
            const SHARD = faceted(
                warp(
                    lathe(
                        [
                            [0.001, -0.62],
                            [0.2, -0.36],
                            [0.27, 0.0],
                            [0.24, 0.3],
                            [0.2, 0.42],
                            [0.001, 0.42],
                        ],
                        6
                    ),
                    (x, y, z) => {
                        const k = 1 + 0.12 * rough(Math.round((Math.atan2(z, x) + 4) * 10) + Math.round(y * 20));
                        const top = y > 0.4 ? x * 0.35 : 0;
                        return [x * k, y + top, z * k];
                    }
                )
            );
            const float = hover(fx, 1.25, 0.08, P);
            const sway = fx.node('sway', [0, 0, 0], float);
            solid(fx, sway, SHARD, AMBER[4], {life: L, size: 1.2, rim: [1, 0.6, 0.2]});
            // Light pulsing up through it: the same shard a touch bigger, added on top.
            fx.sys({
                geo: SHARD,
                tex: 'white',
                blend: 'add',
                life: L,
                size: 1.22,
                burst: [[0, 1]],
                color: AMBER[5],
                parent: sway,
                order: 6,
                look: {scalingMode: 'hierarchy'},
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [0.05, 0],
                            [0.45, 0.25],
                            [0.05, 0.5],
                            [0.45, 0.75],
                            [0.05, 1],
                        ]
                    ),
                ],
            });
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: L,
                size: 1.6,
                burst: [[0, 1]],
                color: AMBER[4],
                alpha: 0.45,
                parent: sway,
                order: 2,
            });
            // Flaring out of the break.
            fx.sys({
                tex: 'flame',
                blend: 'add',
                life: [0.4, 0.7],
                speed: [0.6, 1.2],
                size: [0.18, 0.3],
                rate: 14,
                color: [AMBER[5], AMBER[6]],
                shape: new ConeEmitter({radius: 0.12, angle: 0.4, thickness: 1}),
                aim: 'up',
                at: [0.06, 0.55, 0],
                parent: sway,
                order: 7,
                b: [tint([['#ffffff', 0]], popOut(0.4)), grow([0, 1], [1, 0.3]), wobble(2, 0.3)],
            });
            // Splinters orbiting it.
            fx.sys({
                geo: faceted(
                    lathe(
                        [
                            [0.001, -0.5],
                            [0.3, 0],
                            [0.001, 0.5],
                        ],
                        3
                    )
                ),
                tex: 'white',
                blend: 'alpha',
                life: L,
                size: [0.1, 0.18],
                burst: [[0, 7]],
                color: [AMBER[4], AMBER[6]],
                tumble: 3,
                shape: new CircleEmitter({radius: 0.7, thickness: 0.3}),
                aim: 'up',
                parent: float,
                order: 6,
                look: {lighting: 'fixed', rim: {color: [1, 0.6, 0.2], power: 2, strength: 0.8, mode: 'add'}},
                b: [orbit(1.6)],
            });
            twinkles(fx, {at: [0, 0, 0], radius: 0.6, rate: 3, color: AMBER[6], parent: float});
            const sh = shadow(fx, {size: 0.9, life: L});
            decal(fx, {
                at: [0, 0.013, 0],
                size: 1.6,
                color: AMBER[4],
                alpha: 0.3,
                life: L,
                loop: true,
                blend: 'add',
                alphas: [[1, 0]],
            });
            fx.every((t) => {
                sway.rotation.z = Math.sin((t / P) * Math.PI * 2) * 0.18;
                sway.rotation.y = t * 0.6;
                const k = 1 - (float.position.y - 1.17) / 0.5;
                sh.scaling.set(k, 1, k);
            });
        },
    },
    {
        id: 'pickups/gem-spin',
        name: 'Gem Spin',
        loop: true,
        period: 2.4,
        view: {height: 1.0, distance: 4},
        build(fx) {
            const P = 2.4;
            const L = P + 0.02;
            const float = hover(fx, 1.0, 0.07, P / 2);
            const gem = fx.node('gem', [0, 0, 0], float);
            solid(fx, gem, BRILLIANT, RUBY[4], {life: L, size: 0.9, rim: [1, 0.5, 0.6]});
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: L,
                size: 1.5,
                burst: [[0, 1]],
                color: RUBY[4],
                alpha: 0.4,
                parent: float,
                order: 2,
            });
            // Flashes rolling over the crown as facets catch the light.
            fx.sys({
                tex: 'glint',
                life: 0.22,
                size: [0.3, 0.5],
                burst: [0, 0.4, 0.8, 1.2, 1.6, 2.0].map((t) => [t, 1] as [number, number]),
                color: '#ffffff',
                shape: new CircleEmitter({radius: 0.25, thickness: 1}),
                aim: 'up',
                at: [0, 0.2, 0],
                parent: float,
                order: 8,
                b: [tint([['#ffffff', 0]], popOut(0.3)), grow([0, 0.2], [0.3, 1], [1, 0.3])],
            });
            // Refracted light sliding over the floor, turning with the gem.
            const caustic = fx.node('caustic', [0, 0.013, 0]);
            for (const [r, c] of [
                [0.6, RUBY[5]],
                [0.9, RUBY[6]],
                [0.5, RUBY[4]],
            ] as Array<[number, string]>) {
                const spot = fx.node('spot', [r, 0, 0], caustic);
                spot.rotation.y = r * 7;
                fx.sys({
                    tex: 'glow',
                    mode: RenderMode.HorizontalBillBoard,
                    blend: 'add',
                    life: L,
                    size: 0.45,
                    burst: [[0, 1]],
                    color: c,
                    alpha: 0.6,
                    parent: spot,
                    order: 1,
                });
            }
            twinkles(fx, {at: [0, 0, 0], radius: 0.6, rate: 4, color: RUBY[6], parent: float});
            const sh = shadow(fx, {size: 0.8, life: L});
            fx.every((t) => {
                gem.rotation.y = (t / P) * Math.PI * 2;
                gem.rotation.x = 0.25;
                caustic.rotation.y = -(t / P) * Math.PI * 2 * 2;
                const k = 1 - (float.position.y - 0.93) / 0.5;
                sh.scaling.set(k, 1, k);
            });
        },
    },
    {
        id: 'pickups/heart-pickup',
        name: 'Heart Pickup',
        loop: true,
        period: 1.2,
        view: {height: 1.0, distance: 4},
        build(fx) {
            const P = 1.2;
            const L = P + 0.02;
            const float = hover(fx, 1.0, 0.06, P);
            const heart = fx.node('heart', [0, 0, 0], float);
            const plump = fx.node('plump', [0, 0, 0], heart);
            plump.scaling.set(1, 1, 1.4);
            solid(fx, plump, HEART, HEARTS[4], {life: L, size: 0.9, rim: [1, 0.6, 0.6]});
            solid(fx, plump, extrude(heartOutline(), 0.44), HEARTS[6], {
                life: L,
                size: 0.32,
                at: [-0.16, 0.14, 0.01],
                alpha: 0.9,
                lit: false,
            });
            for (const [time, size] of [
                [0, 2.2],
                [0.24, 1.6],
            ] as Array<[number, number]>) {
                fx.sys({
                    tex: 'glow',
                    blend: 'add',
                    life: 0.4,
                    size,
                    burst: [[time, 1]],
                    color: HEARTS[5],
                    alpha: 0.6,
                    parent: float,
                    order: 2,
                    b: [tint([['#ffffff', 0]], popOut(0.15))],
                });
                fx.sys({
                    tex: 'ring',
                    life: 0.45,
                    size: size * 0.9,
                    burst: [[time, 1]],
                    color: HEARTS[6],
                    parent: float,
                    order: 7,
                    b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.35], [1, 1])],
                });
            }
            // Tiny hearts drifting off.
            fx.sys({
                tex: 'heart',
                life: [0.8, 1.2],
                speed: [0.4, 0.8],
                size: [0.12, 0.2],
                rate: 3,
                color: [HEARTS[5], HEARTS[6]],
                shape: new SphereEmitter({radius: 0.35, thickness: 1}),
                aim: 'up',
                parent: float,
                order: 8,
                b: [gravity(-0.6), wobble(2, 0.3), tint([['#ffffff', 0]], popOut(0.5))],
            });
            const sh = shadow(fx, {size: 0.8, life: L});
            fx.every((t) => {
                // Lub-dub: a big squash and stretch, then a smaller echo.
                const b1 = Math.max(0, Math.sin(span(t, 0, 0.18) * Math.PI));
                const b2 = Math.max(0, Math.sin(span(t, 0.24, 0.38) * Math.PI));
                const s = 1 + b1 * 0.22 + b2 * 0.1;
                heart.scaling.set(s * (1 + b1 * 0.08), s * (1 - b1 * 0.06), s);
                heart.rotation.y = Math.sin((t / P) * Math.PI * 2) * 0.35;
                const k = 1 - (float.position.y - 0.94) / 0.5;
                sh.scaling.set(k * s, 1, k * s);
            });
        },
    },
    {
        id: 'pickups/key-glint',
        name: 'Key Glint',
        loop: true,
        period: 2,
        view: {height: 1.1, distance: 4},
        build(fx) {
            const P = 2;
            const L = P + 0.02;
            const float = hover(fx, 1.1, 0.06, P);
            const key = fx.node('key', [0, 0, 0], float);
            // The bow: a ring and a quatrefoil of little rings, then the shaft and the bit.
            const bowNode = fx.node('bow', [-0.55, 0, 0], key);
            bowNode.rotation.x = Math.PI / 2;
            solid(fx, bowNode, torus(0.2, 0.055), SILVER[5], {life: L, rim: [0.8, 0.9, 1]});
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
                solid(fx, bowNode, torus(0.08, 0.03, 20), SILVER[4], {
                    life: L,
                    at: [Math.cos(a) * 0.24, 0, Math.sin(a) * 0.24],
                    rim: [0.8, 0.9, 1],
                });
            }
            const shaft = fx.node('shaft', [-0.33, 0, 0], key);
            shaft.rotation.z = -Math.PI / 2;
            solid(
                fx,
                shaft,
                lathe(
                    [
                        [0.001, 0],
                        [0.06, 0],
                        [0.06, 0.06],
                        [0.045, 0.08],
                        [0.045, 0.95],
                        [0.001, 0.95],
                    ],
                    16
                ),
                SILVER[5],
                {life: L, rim: [0.8, 0.9, 1]}
            );
            solid(
                fx,
                key,
                extrude(
                    [
                        [0.38, -0.02],
                        [0.6, -0.02],
                        [0.6, -0.26],
                        [0.53, -0.26],
                        [0.53, -0.18],
                        [0.47, -0.18],
                        [0.47, -0.3],
                        [0.38, -0.3],
                    ],
                    0.07
                ),
                SILVER[4],
                {life: L, rim: [0.8, 0.9, 1]}
            );
            // The glint running from the bow to the teeth, bursting off the tip.
            const runner = fx.node('runner', [-0.55, 0, 0.1], key);
            fx.sys({
                tex: 'glint',
                blend: 'add',
                life: L,
                size: 0.55,
                burst: [[0, 1]],
                color: '#ffffff',
                parent: runner,
                order: 8,
                b: [tint([['#ffffff', 0]], windowed(P, 0.3, 0.95, 0.08))],
            });
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.08, length: 1},
                world: true,
                life: [0.4, 0.7],
                speed: [1, 2.5],
                size: [0.03, 0.05],
                burst: [[0.95, 12]],
                color: ['#ffffff', SILVER[6]],
                shape: new SphereEmitter({radius: 0.05, thickness: 1}),
                at: [0.55, -0.15, 0.05],
                parent: key,
                order: 8,
                b: [gravity(6), tint([['#ffffff', 0]], popOut(0.5))],
            });
            twinkles(fx, {at: [0, 0, 0], radius: 0.7, rate: 2.5, color: SILVER[6], parent: float});
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: L,
                size: 1.6,
                burst: [[0, 1]],
                color: SILVER[4],
                alpha: 0.25,
                parent: float,
                order: 2,
            });
            const sh = shadow(fx, {size: 1.2, life: L});
            fx.every((t) => {
                key.rotation.z = Math.sin((t / P) * Math.PI * 2) * 0.2 - 0.15;
                key.rotation.y = Math.sin((t / P) * Math.PI * 2 + 1) * 0.4;
                runner.position.x = -0.55 + 1.1 * easeOut(span(t, 0.3, 0.95));
                const k = 1 - (float.position.y - 1.04) / 0.5;
                sh.scaling.set(k, 1, k * 0.6);
            });
        },
    },
    {
        id: 'pickups/loot-beam',
        name: 'Loot Beam',
        loop: true,
        period: 2.4,
        view: {height: 2.0, distance: 7},
        build(fx) {
            const P = 2.4;
            const L = P + 0.02;
            // The sword, stuck in the ground at a slant.
            const sword = fx.node('sword', [0, 0.85, 0]);
            sword.rotation.z = 0.18;
            sword.scaling.setAll(1.6);
            solid(
                fx,
                sword,
                extrude(
                    [
                        [-0.08, -0.6],
                        [0, -0.75],
                        [0.08, -0.6],
                        [0.08, 0.5],
                        [-0.08, 0.5],
                    ],
                    0.05
                ),
                SILVER[5],
                {life: L, rim: [0.8, 0.7, 1]}
            );
            solid(
                fx,
                sword,
                extrude(
                    [
                        [-0.32, 0.5],
                        [0.32, 0.5],
                        [0.26, 0.6],
                        [-0.26, 0.6],
                    ],
                    0.12
                ),
                GOLD[4],
                {life: L, rim: [1, 0.85, 0.5]}
            );
            const grip = fx.node('grip', [0, 0.6, 0], sword);
            solid(
                fx,
                grip,
                lathe(
                    [
                        [0.001, 0],
                        [0.05, 0],
                        [0.05, 0.32],
                        [0.09, 0.36],
                        [0.07, 0.44],
                        [0.001, 0.46],
                    ],
                    14
                ),
                '#4a2c18',
                {life: L, rim: [0.6, 0.4, 0.3]}
            );
            solid(fx, grip, SPHERE, EPIC[5], {life: L, size: 0.16, at: [0, 0.4, 0], rim: [1, 0.8, 1]});
            // The pillar: a white core thinning to the sky in a wide purple glow.
            for (const [w, h, c, a] of [
                [12, 1.6, EPIC[4], 0.5],
                [12, 0.7, EPIC[5], 0.8],
                [11, 0.22, '#ffffff', 1],
            ] as Array<[number, number, string, number]>) {
                bar(fx, {w, h, rot: Math.PI / 2, color: c, life: L, alpha: a, at: [0, w / 2 - 0.2, 0], order: 4});
            }
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: L,
                size: 2.2,
                burst: [[0, 1]],
                color: EPIC[5],
                alpha: 0.6,
                at: [0, 0.3, 0],
                order: 3,
            });
            // Rings pulsing across the floor.
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 1.2,
                size: 3,
                rate: 1.25,
                color: EPIC[5],
                at: [0, 0.03, 0],
                order: 2,
                b: [tint([['#ffffff', 0]], popOut(0.4)), grow([0, 0.2], [1, 1])],
            });
            decal(fx, {
                at: [0, 0.012, 0],
                size: 2.6,
                color: EPIC[4],
                alpha: 0.6,
                life: L,
                loop: true,
                blend: 'add',
                alphas: [[1, 0]],
            });
            // Motes streaming up.
            fx.sys({
                tex: 'glow',
                life: [1, 1.8],
                speed: [1.5, 3.5],
                size: [0.06, 0.12],
                rate: 22,
                color: [EPIC[5], '#ffffff'],
                shape: new ConeEmitter({radius: 0.5, angle: 0.1, thickness: 1}),
                aim: 'up',
                at: [0, 0.1, 0],
                order: 6,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.1)), wobble(1.5, 0.2)],
            });
            // A glint racing up the shaft.
            fx.sys({
                tex: 'glint',
                blend: 'add',
                life: 0.8,
                speed: 9,
                size: 0.5,
                burst: [[0.2, 1]],
                color: '#ffffff',
                aim: 'up',
                at: [0, 0.5, 0.05],
                order: 8,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.05))],
            });
        },
    },
    {
        id: 'pickups/potion',
        name: 'Potion',
        loop: true,
        period: 2.4,
        view: {height: 1.1, distance: 4},
        build(fx) {
            const P = 2.4;
            const L = P + 0.02;
            const float = hover(fx, 0.95, 0.06, P);
            const flask = fx.node('flask', [0, 0, 0], float);
            // The brew inside: a lit ball, tilting behind the rock.
            const brew = fx.node('brew', [0, -0.05, 0], flask);
            solid(fx, brew, SPHERE, MAGENTA[4], {life: L, size: 0.66, rim: [1, 0.6, 1], at: [0, 0, 0]});
            solid(
                fx,
                brew,
                lathe(
                    [
                        [0.001, 0],
                        [0.32, 0],
                        [0.32, 0.02],
                        [0.001, 0.02],
                    ],
                    24
                ),
                MAGENTA[5],
                {life: L, at: [0, 0.12, 0], lit: false, alpha: 0.7}
            );
            // The glass: see-through, its edges catching the light.
            const glass = lathe(
                [
                    [0.001, -0.42],
                    [0.25, -0.38],
                    [0.4, -0.18],
                    [0.42, 0.0],
                    [0.36, 0.2],
                    [0.18, 0.32],
                    [0.12, 0.36],
                    [0.12, 0.58],
                    [0.15, 0.6],
                    [0.15, 0.63],
                ],
                28
            );
            fx.sys({
                geo: glass,
                tex: 'white',
                blend: 'add',
                life: L,
                size: 1,
                burst: [[0, 1]],
                color: '#3a3050',
                alpha: 0.5,
                parent: flask,
                order: 7,
                look: {scalingMode: 'hierarchy', rim: {color: [0.9, 0.8, 1], power: 2.5, strength: 1.2, mode: 'add'}},
            });
            solid(
                fx,
                flask,
                lathe(
                    [
                        [0.001, 0.52],
                        [0.1, 0.52],
                        [0.13, 0.7],
                        [0.001, 0.72],
                    ],
                    14
                ),
                '#8a5a32',
                {life: L, rim: [0.6, 0.4, 0.3]}
            );
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: L,
                size: 1.6,
                burst: [[0, 1]],
                color: MAGENTA[4],
                alpha: 0.45,
                parent: float,
                order: 2,
            });
            // Bubbles rising and popping at the surface.
            fx.sys({
                tex: 'ring',
                life: [0.5, 0.8],
                speed: [0.3, 0.5],
                size: [0.05, 0.09],
                rate: 9,
                color: MAGENTA[6],
                shape: new ConeEmitter({radius: 0.2, angle: 0.1, thickness: 1}),
                aim: 'up',
                at: [0, -0.3, 0],
                parent: flask,
                order: 8,
                b: [tint([['#ffffff', 0]], popOut(0.2)), wobble(3, 0.05)],
            });
            // Wisps curling off the cork.
            fx.sys({
                tex: 'smoke',
                blend: 'add',
                life: [0.9, 1.3],
                speed: [0.3, 0.5],
                size: [0.12, 0.2],
                rate: 5,
                color: MAGENTA[5],
                alpha: 0.6,
                aim: 'up',
                at: [0, 0.74, 0],
                parent: flask,
                order: 8,
                b: [wobble(2, 0.3), grow([0, 0.6], [1, 1.6]), tint([['#ffffff', 0]], fadeOut(0.3))],
            });
            const sh = shadow(fx, {size: 0.9, life: L});
            fx.every((t) => {
                const a = Math.sin((t / P) * Math.PI * 2);
                flask.rotation.z = a * 0.22;
                // The brew lags the rock, so it sloshes.
                brew.rotation.z = -Math.sin((t / P) * Math.PI * 2 - 0.9) * 0.3;
                flask.rotation.y = t * 0.5;
                const k = 1 - (float.position.y - 0.89) / 0.5;
                sh.scaling.set(k, 1, k);
            });
        },
    },
    {
        id: 'pickups/power-star',
        name: 'Power Star',
        loop: true,
        period: 1.6,
        view: {height: 1.2, distance: 4.5},
        build(fx) {
            const P = 1.6;
            const L = P + 0.02;
            const float = hover(fx, 1.2, 0.05, P);
            const star = fx.node('star', [0, 0, 0], float);
            // A fat bevelled star: a deep body and a smaller, brighter face standing off it.
            solid(fx, star, extrude(starOutline(5, 0.62, 0.3), 0.3), STAR[4], {life: L, rim: [1, 0.85, 0.4]});
            solid(fx, star, extrude(starOutline(5, 0.46, 0.22), 0.4), STAR[5], {life: L, rim: [1, 1, 0.7]});
            for (const x of [-0.09, 0.09]) {
                solid(fx, star, extrude(disk(0.045, 12), 0.44), STAR[0], {life: L, at: [x, 0.05, 0], lit: false});
            }
            // Rays turning slowly behind it.
            for (let i = 0; i < 8; i++) {
                bar(fx, {
                    w: i % 2 ? 2.4 : 3.4,
                    h: 0.3,
                    rot: (i / 8) * Math.PI,
                    color: i % 2 ? STAR[5] : STAR[6],
                    alpha: 0.55,
                    life: L,
                    at: [0, 0, -0.3],
                    parent: float,
                    order: 3,
                    spinning: 0.5,
                });
            }
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: L,
                size: 2,
                burst: [[0, 1]],
                color: STAR[4],
                alpha: 0.5,
                parent: float,
                order: 2,
            });
            // Sparks spinning off its points.
            fx.sys({
                tex: 'glint',
                life: [0.5, 0.8],
                speed: [0.8, 1.4],
                size: [0.14, 0.24],
                burst: [
                    [0, 6],
                    [0.8, 6],
                ],
                color: ['#ffffff', STAR[6]],
                shape: new CircleEmitter({radius: 0.6, thickness: 0.05}),
                parent: float,
                order: 8,
                b: [orbit(3, [0, 0, 1]), airDrag(2), tint([['#ffffff', 0]], popOut(0.4))],
            });
            const sh = shadow(fx, {size: 1, life: L});
            fx.every((t) => {
                star.rotation.z = Math.sin((t / P) * Math.PI * 2) * 0.2;
                star.rotation.y = Math.sin((t / P) * Math.PI * 2 + 0.5) * 0.4;
                const beat = Math.max(0, Math.sin(span(t % 0.8, 0, 0.2) * Math.PI));
                star.scaling.setAll(1 + beat * 0.14);
                const k = 1 - (float.position.y - 1.15) / 0.6;
                sh.scaling.set(k, 1, k);
            });
        },
    },
    {
        id: 'pickups/xp-orb',
        name: 'XP Orb',
        loop: true,
        period: 1.8,
        view: {height: 1.0, distance: 5},
        build(fx) {
            const P = 1.8;
            const L = P + 0.02;
            const orb = fx.node('orb', [0, 1, 0]);
            solid(fx, orb, SPHERE, XP[5], {life: L, size: 0.2, lit: false});
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: L,
                size: 0.8,
                burst: [[0, 1]],
                color: XP[4],
                parent: orb,
                order: 6,
            });
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: L,
                size: 0.3,
                burst: [[0, 1]],
                color: '#ffffff',
                parent: orb,
                order: 7,
            });
            // The comet tail, tapering along its path.
            fx.sys({
                tex: 'glow',
                blend: 'add',
                world: true,
                life: 0.45,
                size: 0.32,
                rateOverDistance: 40,
                color: XP[5],
                parent: orb,
                order: 5,
                b: [
                    tint(
                        [
                            [XP[6], 0],
                            [XP[3], 1],
                        ],
                        fadeOut(0.1, 0)
                    ),
                    grow([0, 1], [1, 0.1]),
                ],
            });
            // Flecks shed from it, winking out.
            fx.sys({
                tex: 'glint',
                world: true,
                life: [0.4, 0.7],
                speed: [0.1, 0.3],
                size: [0.06, 0.12],
                rate: 18,
                color: [XP[6], '#ffffff'],
                shape: new SphereEmitter({radius: 0.08, thickness: 1}),
                parent: orb,
                order: 7,
                b: [gravity(0.8), tint([['#ffffff', 0]], popOut(0.4))],
            });
            // Its light on the floor, following it.
            const pool = fx.node('pool', [0, 0.013, 0]);
            fx.sys({
                tex: 'glow',
                mode: RenderMode.HorizontalBillBoard,
                blend: 'add',
                life: L,
                size: 1.4,
                burst: [[0, 1]],
                color: XP[4],
                alpha: 0.5,
                parent: pool,
                order: 1,
            });
            fx.every((t) => {
                // A figure-eight tipped into depth, rising and dipping.
                const a = (t / P) * Math.PI * 2;
                const x = Math.sin(a) * 1.3;
                const z = Math.sin(a * 2) * 0.5;
                const y = 1 + Math.sin(a * 2 + 1) * 0.25;
                orb.position.set(x, y, z);
                pool.position.set(x, 0.013, z);
            });
        },
    },
];
