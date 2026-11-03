import {BoxEmitter, RenderMode, SphereEmitter, type EmitterShape} from 'babylon.quarks';
import {held, window} from './arcane';
import {
    airDrag,
    extrude,
    fadeOut,
    flicker,
    floorBounce,
    gravity,
    grow,
    lathe,
    popOut,
    spike,
    spin,
    tint,
    wobble,
    type Geometry,
    type SysOptions,
} from './kit';
import {light} from './parts';
import {arcs, decal, type Ramp} from './recipes';
import {type FxBuilder, type FxDef} from './stage';
import {image} from './textures';

/** Weather fills a stretch of sky and floor round the cell: this wide, this deep, this high. */
const W = 7;
const D = 4;
const H = 4.6;
const VIEW = {height: 1.9, distance: 9};

const AURORA = ['#0a1430', '#163c4a', '#1f8a6a', '#3ee08a', '#9effc0', '#b070ff', '#e0b0ff'];
const SNOW = ['#1a2448', '#3a5490', '#8ab0e0', '#d0e8ff', '#ffffff'];
const BLOSSOM = ['#7a2a4a', '#d06a90', '#f4a6c0', '#ffd6e4', '#fff4f8'];
const AUTUMN = ['#5a1a10', '#a03a18', '#d86a20', '#f0a030', '#f8d050', '#8a6a30'];
const FIREFLY = ['#0c1a10', '#1a3a20', '#2e5a2a', '#9aff6a', '#e8ffa0'];
const MOON = ['#1c2240', '#3c4470', '#8890b8', '#d0d4ea', '#fffaf0'];
const RAY = ['#3a2a10', '#8a6a2a', '#e8c070', '#fff0c0'];
const METEOR: Ramp = [
    ['#ffffff', 0],
    ['#ffe6a0', 0.2],
    ['#ff9a6a', 0.55],
    ['#c0406a', 1],
];

/** A thin box of sky to fall from, `width` by `deep`, emitting along the system's aim. */
function sky(depth = 0.1, width = W, deep = D): EmitterShape {
    return new BoxEmitter({width, height: deep, depth});
}

/** A solid box of air over the floor to scatter things through: stars, motes, fireflies. */
function air(width = W, height = H, deep = D): EmitterShape {
    return new BoxEmitter({width, height, depth: deep});
}

/**
 * A curtain: a sheet `width` wide and `height` tall standing on y = 0, folded along x by `folds`
 * waves of `depth`, U along it and V up it, facing +z.
 */
function curtain(width: number, height: number, folds: number, depth: number, columns = 64): Geometry {
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= columns; i++) {
        const u = i / columns;
        const x = (u - 0.5) * width;
        const a = u * folds * Math.PI * 2;
        const z = Math.sin(a) * depth + Math.sin(a * 0.37 + 1) * depth * 0.6;
        for (const v of [0, 1]) {
            pos.push(x, v * height, z - v * depth * 0.4);
            nor.push(0, 0, 1);
            uv.push(u, v);
        }
    }
    for (let i = 0; i < columns; i++) {
        const a = i * 2;
        idx.push(a, a + 3, a + 1, a, a + 2, a + 3);
    }
    return {
        positions: new Float32Array(pos),
        normals: new Float32Array(nor),
        uvs: new Float32Array(uv),
        indices: new Uint32Array(idx),
    };
}

/** A petal: a broad rounded drop. */
function petalOutline(): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let i = 0; i < 20; i++) {
        const t = (i / 20) * Math.PI * 2;
        const r = 0.5 * (1 - 0.35 * Math.sin(t));
        out.push([Math.cos(t) * r * 0.75, Math.sin(t) * r]);
    }
    return out;
}

/** A five-petalled blossom. */
function blossomOutline(): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let i = 0; i < 60; i++) {
        const t = (i / 60) * Math.PI * 2;
        const r = 0.28 + 0.22 * Math.abs(Math.cos(t * 2.5));
        out.push([Math.cos(t) * r, Math.sin(t) * r]);
    }
    return out;
}

/** A leaf: a pointed oval, a little notched at the stem. */
function leafOutline(): Array<[number, number]> {
    const right: Array<[number, number]> = [];
    const left: Array<[number, number]> = [];
    for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const w = Math.sin(Math.PI * t) ** 0.7 * (0.3 + 0.02 * Math.sin(t * 9));
        right.push([w, t - 0.5]);
        left.push([-w, t - 0.5]);
    }
    return [...right, ...left.reverse().slice(1, -1)];
}

const PETAL = extrude(petalOutline(), 0.03);
const BLOSSOM5 = extrude(blossomOutline(), 0.05);
const LEAF = extrude(leafOutline(), 0.03);

/** Lit, thin, tumbling flat things falling through the air: petals, leaves. */
function flutter(
    fx: FxBuilder,
    o: {
        geo: Geometry;
        colors: [string, string];
        rate: number;
        size: [number, number];
        fall: [number, number];
        life: [number, number];
        wind?: number;
        sway?: number;
        rim?: [number, number, number];
    }
) {
    const base: SysOptions = {
        geo: o.geo,
        tex: 'white',
        blend: 'alpha',
        life: o.life,
        speed: o.fall,
        size: o.size,
        tumble: 4,
        color: o.colors,
        shape: sky(),
        aim: 'down',
        at: [-(o.wind ?? 0) * 1.5, H, 0],
        world: true,
        order: 4,
        look: {
            lighting: 'fixed',
            renderFace: 'both',
            rim: o.rim ? {color: o.rim, power: 2, strength: 1, mode: 'add'} : undefined,
        },
        b: [
            wobble(0.8, o.sway ?? 1),
            gravity(o.wind ?? 0.3, [1, 0, 0]),
            floorBounce(0),
            airDrag(0.4),
            tint([['#ffffff', 0]], fadeOut(0.85, 0.05)),
        ],
    };
    // Already falling when the scene opens, then a steady fall.
    fx.sys({
        ...base,
        loop: false,
        burst: [[0, Math.round(o.rate * o.life[0])]],
        shape: air(),
        at: [0, H / 2, 0],
        aim: undefined,
    });
    return fx.sys({...base, rate: o.rate});
}

/** Rain or snow: streaks falling from the sky box, at one depth band. */
function precip(
    fx: FxBuilder,
    o: {
        z: number;
        deep: number;
        rate: number;
        speed: [number, number];
        size: [number, number];
        color: string | [string, string];
        alpha: number;
        slant?: number;
        streak?: number;
        tex?: SysOptions['tex'];
        order?: number;
        b?: SysOptions['b'];
        life?: [number, number];
    }
) {
    return fx.sys({
        tex: o.tex ?? 'dot',
        mode: o.streak ? RenderMode.StretchedBillBoard : undefined,
        stretch: o.streak ? {speed: o.streak, length: 1} : undefined,
        life: o.life ?? [H / o.speed[1], H / o.speed[0]],
        speed: o.speed,
        size: o.size,
        rate: o.rate,
        color: o.color,
        alpha: o.alpha,
        shape: sky(0.1, W + 2, o.deep),
        aim: 'down',
        rotate: [0, 0, o.slant ?? 0],
        at: [-(o.slant ?? 0) * H, H, o.z],
        world: true,
        order: o.order ?? 5,
        b: o.b ?? [floorBounce(0)],
    });
}

/** Splashes on the floor: a tiny ring and a crown of droplets at random spots. */
function splashes(fx: FxBuilder, rate: number, color: string) {
    fx.sys({
        tex: 'ring',
        mode: RenderMode.HorizontalBillBoard,
        life: [0.3, 0.45],
        size: [0.2, 0.35],
        rate,
        color,
        alpha: 0.6,
        shape: new BoxEmitter({width: W, height: D, depth: 0}),
        aim: 'up',
        at: [0, 0.02, 0],
        order: 1,
        b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.2], [1, 1])],
    });
    fx.sys({
        tex: 'dot',
        life: [0.2, 0.3],
        speed: [0.8, 1.4],
        size: [0.025, 0.04],
        rate: rate * 3,
        color,
        alpha: 0.8,
        shape: new BoxEmitter({width: W, height: D, depth: 0}),
        aim: 'up',
        at: [0, 0.02, 0],
        order: 6,
        b: [gravity(9), tint([['#ffffff', 0]], popOut(0.3))],
    });
}

/** Stars twinkling on a wall of sky behind the scene: each lives a few seconds, already lit at the start. */
function stars(fx: FxBuilder, o: {count: number; color?: string; at?: [number, number, number]} = {count: 80}) {
    const base: SysOptions = {
        tex: 'glint',
        life: [2, 3.5],
        size: [0.05, 0.14],
        color: o.color ?? '#e8ecff',
        shape: new BoxEmitter({width: W + 4, height: 3.2, depth: 0.5}),
        at: o.at ?? [0, 3.6, -D],
        order: 0,
        b: [
            tint(
                [['#ffffff', 0]],
                [
                    [0, 0],
                    [1, 0.2],
                    [0.5, 0.5],
                    [1, 0.75],
                    [0, 1],
                ]
            ),
        ],
    };
    fx.sys({...base, loop: false, life: [0.5, 3], burst: [[0, o.count]]});
    fx.sys({...base, rate: o.count / 2.75});
}

/** Slow banks of something soft (cloud, fog) drifting across, already there when it opens. */
function banks(
    fx: FxBuilder,
    o: {
        y: number;
        z: number;
        height: number;
        deep: number;
        size: [number, number];
        colors: [string, string];
        alpha: number;
        drift: number;
        rate: number;
        life: number;
        order: number;
        blend?: 'alpha' | 'add';
    }
) {
    const base: SysOptions = {
        tex: 'smoke',
        blend: o.blend ?? 'alpha',
        life: [o.life * 0.85, o.life],
        speed: [o.drift * 0.8, o.drift],
        size: o.size,
        rot: true,
        color: o.colors,
        alpha: o.alpha,
        aim: 'right',
        world: true,
        order: o.order,
        b: [
            tint(
                [['#ffffff', 0]],
                [
                    [0, 0],
                    [1, 0.15],
                    [1, 0.8],
                    [0, 1],
                ]
            ),
            grow([0, 0.85], [1, 1.15]),
            spin([-0.05, 0.05]),
        ],
    };
    fx.sys({
        ...base,
        loop: false,
        burst: [[0, Math.round(o.rate * o.life * 0.9)]],
        shape: new BoxEmitter({width: o.deep, height: o.height, depth: o.drift * o.life}),
        at: [-W / 2 + (o.drift * o.life) / 2, o.y, o.z],
    });
    fx.sys({
        ...base,
        rate: o.rate,
        shape: new BoxEmitter({width: o.deep, height: o.height, depth: 0.2}),
        at: [-W / 2 - 1, o.y, o.z],
    });
}

export const weather: FxDef[] = [
    {
        id: 'weather/aurora',
        name: 'Aurora',
        loop: true,
        period: 6,
        view: {height: 2.6, distance: 9},
        build(fx) {
            stars(fx, {count: 90});
            // Rippling curtains of light, green at their burning hems and violet up into the sky.
            const sheets: Array<[number, number, number, string, number, number]> = [
                // y, z, height, colour, folds, scroll
                [1.4, -2.2, 2.4, AURORA[3], 2.5, 0.05],
                [1.9, -2.9, 2, AURORA[5], 1.8, -0.035],
                [1.2, -1.6, 1.7, AURORA[4], 3.2, 0.07],
            ];
            sheets.forEach(([y, z, height, color, folds, scroll], i) => {
                const node = fx.node('curtain', [0, y, z]);
                fx.every((t) => {
                    node.position.x = Math.sin(t * 0.5 + i * 2) * 0.3;
                    node.scaling.y = 1 + Math.sin(t * 0.9 + i) * 0.12;
                });
                fx.sys({
                    geo: curtain(W + 1, height, folds, 0.45),
                    image: 'light-column',
                    blend: 'add',
                    life: 1e4,
                    size: 1,
                    burst: [[0, 1]],
                    color,
                    alpha: 0.9 - i * 0.15,
                    parent: node,
                    order: 1 + i,
                    look: {
                        renderFace: 'both',
                        scalingMode: 'hierarchy',
                        mapUV: {tiling: [6, 1], scroll: [scroll, 0]},
                        uvDistortion: {
                            map: image(fx.scene, 'noise').texture,
                            strength: 0.05,
                            mapUV: {tiling: [3, 1], scroll: [scroll * 2, 0.05]},
                        },
                    },
                });
                // A violet fringe above each.
                fx.sys({
                    geo: curtain(W + 1, height * 0.6, folds, 0.45),
                    image: 'light-column',
                    blend: 'add',
                    life: 1e4,
                    size: 1,
                    burst: [[0, 1]],
                    color: AURORA[6],
                    alpha: 0.35,
                    at: [0, height * 0.55, -0.1],
                    parent: node,
                    order: 1,
                    look: {renderFace: 'both', scalingMode: 'hierarchy', mapUV: {tiling: [6, 1], scroll: [scroll, 0]}},
                });
            });
            // Rays shimmering up.
            fx.sys({
                tex: 'streak',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.6, length: 1},
                life: [0.8, 1.4],
                speed: [0.8, 1.4],
                size: [0.04, 0.08],
                rate: 18,
                color: [AURORA[4], AURORA[6]],
                alpha: 0.6,
                shape: new BoxEmitter({width: W, height: 0.6, depth: 0}),
                aim: 'up',
                at: [0, 2.2, -2.2],
                order: 4,
                b: [tint([['#ffffff', 0]], popOut(0.5))],
            });
            light(fx, {at: [0, 0.05, -1], size: 8, color: AURORA[3], floor: true, life: 6, alpha: 0.2, loop: true});
        },
    },
    {
        id: 'weather/blizzard',
        name: 'Blizzard',
        loop: true,
        period: 4,
        view: VIEW,
        build(fx) {
            // Streaks driven almost flat by the gale, at three depths.
            [
                [-1.6, 0.03, 0.4, 70],
                [0, 0.045, 0.7, 60],
                [1.6, 0.07, 1, 40],
            ].forEach(([z, size, alpha, rate], i) => {
                fx.sys({
                    tex: 'dot',
                    mode: RenderMode.StretchedBillBoard,
                    stretch: {speed: 0.5, length: 1},
                    life: [0.6, 0.9],
                    speed: [9 + i * 2, 12 + i * 2],
                    size: [size * 0.7, size],
                    rate,
                    color: SNOW[4],
                    alpha,
                    shape: new BoxEmitter({width: 1.2, height: H, depth: 0.1}),
                    aim: 'left',
                    rotate: [0.12, 0, 0],
                    at: [W / 2 + 1, H / 2, z],
                    order: 3 + i,
                    b: [wobble(2, 0.6)],
                });
            });
            // Gusts throwing translucent sheets of snow across.
            fx.sys({
                tex: 'smoke',
                life: [0.9, 1.2],
                speed: [7, 9],
                size: [2, 3],
                rot: true,
                rate: 4,
                color: SNOW[3],
                alpha: 0.18,
                shape: new BoxEmitter({width: 1, height: H * 0.7, depth: D}),
                aim: 'left',
                at: [W / 2 + 1.5, H / 2, 0],
                order: 2,
                b: [tint([['#ffffff', 0]], popOut(0.6)), grow([0, 0.8], [1, 1.4])],
            });
            // Drifts, and spindrift streaming off them.
            for (const [x, z, w] of [
                [-2.2, -0.8, 1.4],
                [0.6, 0.4, 1.8],
                [2.6, -1.2, 1.2],
            ]) {
                fx.sys({
                    tex: 'glow',
                    mode: RenderMode.HorizontalBillBoard,
                    blend: 'alpha',
                    life: 1e4,
                    size: w * 1.6,
                    burst: [[0, 1]],
                    color: SNOW[4],
                    alpha: 0.55,
                    at: [x, 0.02, z],
                    order: 1,
                });
                fx.sys({
                    tex: 'smoke',
                    life: [0.6, 0.9],
                    speed: [2.5, 4],
                    size: [0.4, 0.7],
                    rot: true,
                    rate: 6,
                    color: SNOW[4],
                    alpha: 0.35,
                    shape: new SphereEmitter({radius: w * 0.3, thickness: 1}),
                    aim: 'left',
                    at: [x, 0.3, z],
                    order: 4,
                    b: [tint([['#ffffff', 0]], popOut(0.6)), grow([0, 0.5], [1, 1.5]), gravity(0.6, [0, 1, 0])],
                });
            }
            light(fx, {at: [0, 0.05, 0], size: 9, color: SNOW[2], floor: true, life: 4, alpha: 0.2, loop: true});
        },
    },
    {
        id: 'weather/cherry-blossoms',
        name: 'Cherry blossoms',
        loop: true,
        period: 5,
        view: VIEW,
        build(fx) {
            // Pink petals fluttering down on a breeze, tumbling and catching the light.
            flutter(fx, {
                geo: PETAL,
                colors: [BLOSSOM[2], BLOSSOM[3]],
                rate: 26,
                size: [0.1, 0.16],
                fall: [0.5, 0.8],
                life: [6, 8],
                wind: 0.35,
                sway: 1.2,
                rim: [1, 0.8, 0.9],
            });
            // A few whole blossoms spinning among them.
            flutter(fx, {
                geo: BLOSSOM5,
                colors: [BLOSSOM[3], BLOSSOM[4]],
                rate: 2.5,
                size: [0.22, 0.3],
                fall: [0.6, 0.9],
                life: [5, 7],
                wind: 0.3,
                rim: [1, 0.8, 0.9],
            });
            // Flashes as they turn to the light.
            fx.sys({
                tex: 'glint',
                life: [0.15, 0.25],
                size: [0.12, 0.2],
                rate: 10,
                color: '#ffffff',
                shape: air(),
                at: [0, H / 2, 0],
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.3))],
            });
            decal(fx, {size: 7, color: BLOSSOM[1], alpha: 0.25, life: 1e4, loop: true, alphas: [[1, 0]]});
        },
    },
    {
        id: 'weather/clouds',
        name: 'Clouds',
        loop: true,
        period: 6,
        view: {height: 2.6, distance: 9},
        build(fx) {
            stars(fx, {count: 60});
            // A bright moon.
            const moon = fx.node('moon', [1.6, 3.4, -2.6]);
            moon.scaling.setAll(0.55);
            fx.sys({
                geo: lathe(
                    Array.from({length: 13}, (_, i) => {
                        const a = -Math.PI / 2 + (i / 12) * Math.PI;
                        return [Math.max(0.001, Math.cos(a)), Math.sin(a)] as [number, number];
                    }),
                    24
                ),
                tex: 'white',
                blend: 'alpha',
                life: 1e4,
                size: 1,
                burst: [[0, 1]],
                color: MOON[4],
                parent: moon,
                order: 1,
                look: {scalingMode: 'hierarchy', rim: {color: [0.4, 0.4, 0.5], power: 1.5, strength: 1, mode: 'mix'}},
            });
            held(fx, moon, {size: 3.2, color: MOON[3], alpha: 0.35, order: 0});
            // Layers of cloud drifting past: dark bellies under silver-lit tops.
            banks(fx, {
                y: 3.3,
                z: -1.6,
                height: 0.5,
                deep: 1.2,
                size: [1.2, 1.8],
                colors: [MOON[1], MOON[2]],
                alpha: 0.85,
                drift: 0.45,
                rate: 2.2,
                life: 16,
                order: 2,
            });
            banks(fx, {
                y: 3.55,
                z: -1.5,
                height: 0.3,
                deep: 1.2,
                size: [0.9, 1.3],
                colors: [MOON[2], MOON[3]],
                alpha: 0.6,
                drift: 0.45,
                rate: 2.2,
                life: 16,
                order: 3,
            });
            banks(fx, {
                y: 2.6,
                z: 0,
                height: 0.5,
                deep: 1.5,
                size: [1.4, 2],
                colors: [MOON[0], MOON[1]],
                alpha: 0.9,
                drift: 0.7,
                rate: 1.6,
                life: 11,
                order: 4,
            });
            banks(fx, {
                y: 2.85,
                z: 0.1,
                height: 0.3,
                deep: 1.5,
                size: [1, 1.4],
                colors: [MOON[2], MOON[3]],
                alpha: 0.5,
                drift: 0.7,
                rate: 1.6,
                life: 11,
                order: 5,
            });
        },
    },
    {
        id: 'weather/falling-leaves',
        name: 'Falling leaves',
        loop: true,
        period: 5,
        view: VIEW,
        build(fx) {
            // Leaves swinging down, flipping to show their pale backs, landing and fading.
            flutter(fx, {
                geo: LEAF,
                colors: [AUTUMN[2], AUTUMN[4]],
                rate: 12,
                size: [0.2, 0.3],
                fall: [0.6, 0.9],
                life: [6, 7],
                wind: 0.4,
                sway: 1.6,
            });
            flutter(fx, {
                geo: LEAF,
                colors: [AUTUMN[1], AUTUMN[5]],
                rate: 6,
                size: [0.2, 0.28],
                fall: [0.7, 1],
                life: [5, 6],
                wind: 0.2,
                sway: 1.2,
            });
            // The litter they land in.
            fx.sys({
                geo: LEAF,
                tex: 'white',
                blend: 'alpha',
                loop: false,
                life: 1e4,
                size: [0.18, 0.28],
                burst: [[0, 120]],
                color: [AUTUMN[0], AUTUMN[3]],
                shape: new BoxEmitter({width: W, height: D, depth: 0}),
                aim: 'up',
                at: [0, 0.02, 0],
                order: 1,
                look: {lighting: 'fixed', renderFace: 'both'},
            });
            decal(fx, {size: 8, color: AUTUMN[1], alpha: 0.35, life: 1e4, loop: true, alphas: [[1, 0]]});
        },
    },
    {
        id: 'weather/fireflies',
        name: 'Fireflies',
        loop: true,
        period: 6,
        view: VIEW,
        build(fx) {
            // A meadow of grass blades.
            fx.sys({
                geo: spike(0.15, 3),
                tex: 'white',
                blend: 'alpha',
                loop: false,
                life: 1e4,
                size: [0.25, 0.5],
                burst: [[0, 260]],
                upright: true,
                color: [FIREFLY[1], FIREFLY[2]],
                shape: new BoxEmitter({width: W, height: D, depth: 0}),
                aim: 'up',
                at: [0, 0, 0],
                order: 1,
                look: {lighting: 'fixed', rim: {color: [0.4, 0.9, 0.3], power: 3, strength: 0.6, mode: 'add'}},
            });
            // Fireflies wandering, each glowing up and fading on its own rhythm, trailing light.
            const pulse: Array<[number, number]> = [
                [0, 0],
                [0.1, 0.15],
                [1, 0.3],
                [0.2, 0.5],
                [1, 0.7],
                [0, 1],
            ];
            fx.sys({
                tex: 'glow',
                life: [3, 4],
                speed: [0.1, 0.3],
                size: [0.45, 0.65],
                rate: 12,
                color: FIREFLY[3],
                shape: air(W, 1.8, D),
                at: [0, 1.2, 0],
                world: true,
                order: 5,
                b: [tint([['#ffffff', 0]], pulse), wobble(0.5, 0.8)],
            });
            fx.sys({
                tex: 'dot',
                loop: false,
                life: [3, 4],
                speed: [0.1, 0.3],
                size: 0.06,
                burst: [[0, 20]],
                color: FIREFLY[4],
                shape: air(W, 1.8, D),
                at: [0, 1.2, 0],
                world: true,
                order: 6,
                b: [tint([['#ffffff', 0]], pulse), wobble(0.5, 0.8)],
            });
            fx.sys({
                tex: 'dot',
                life: [3, 4],
                speed: [0.1, 0.3],
                size: 0.07,
                rate: 12,
                color: FIREFLY[4],
                shape: air(W, 1.8, D),
                at: [0, 1.2, 0],
                world: true,
                order: 6,
                b: [tint([['#ffffff', 0]], pulse), wobble(0.5, 0.8)],
            });
            light(fx, {at: [0, 0.05, 0], size: 8, color: FIREFLY[3], floor: true, life: 6, alpha: 0.15, loop: true});
        },
    },
    {
        id: 'weather/fog',
        name: 'Fog',
        loop: true,
        period: 6,
        view: VIEW,
        build(fx) {
            stars(fx, {count: 40});
            held(fx, fx.node('moon', [-2, 3.8, -D]), {size: 2.4, color: MOON[3], alpha: 0.5, order: 0});
            // Slow banks of moonlit fog at three depths, drifting past each other.
            banks(fx, {
                y: 0.5,
                z: -1.6,
                height: 0.6,
                deep: 1,
                size: [2, 3],
                colors: [MOON[1], MOON[2]],
                alpha: 0.5,
                drift: 0.35,
                rate: 1.5,
                life: 18,
                order: 2,
            });
            banks(fx, {
                y: 0.4,
                z: 0,
                height: 0.5,
                deep: 1,
                size: [1.8, 2.6],
                colors: [MOON[1], MOON[2]],
                alpha: 0.45,
                drift: 0.55,
                rate: 1.6,
                life: 12,
                order: 3,
            });
            banks(fx, {
                y: 0.3,
                z: 1.6,
                height: 0.4,
                deep: 1,
                size: [1.6, 2.2],
                colors: [MOON[2], MOON[3]],
                alpha: 0.4,
                drift: 0.8,
                rate: 1.8,
                life: 9,
                order: 4,
            });
            // Thin streaks of mist sliding by in front.
            fx.sys({
                tex: 'streak',
                life: [4, 5],
                speed: [1.2, 1.6],
                size: [2, 3],
                rate: 1.2,
                color: MOON[3],
                alpha: 0.25,
                shape: new BoxEmitter({width: 1, height: 1, depth: 0.1}),
                aim: 'right',
                at: [-W / 2 - 1, 0.8, 2],
                world: true,
                order: 6,
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [0, 0],
                            [1, 0.2],
                            [1, 0.8],
                            [0, 1],
                        ]
                    ),
                ],
            });
        },
    },
    {
        id: 'weather/god-rays',
        name: 'God rays',
        loop: true,
        period: 5,
        view: VIEW,
        build(fx) {
            // Shafts of light slanting down from high on the left, swaying and breathing.
            const BEAM = lathe(
                [
                    [0.35, 0],
                    [0.2, 1],
                ],
                24
            );
            const beams: Array<[number, number, number]> = [
                [-1.8, -0.6, 0.9],
                [-0.6, 0.2, 1.2],
                [0.7, -0.3, 0.8],
                [1.8, 0.4, 1],
            ];
            beams.forEach(([x, z, width], i) => {
                // Sunk below the floor so the shaft's cut end is hidden and it simply meets the ground.
                const foot = fx.node('beam', [x, -0.35, z]);
                fx.every((t) => {
                    foot.rotation.z = 0.55 + Math.sin(t * 0.8 + i) * 0.03;
                });
                const shaft = fx.node('shaft', [0, 0, 0], foot);
                shaft.scaling.set(width, 7, width);
                for (const [face, alpha, order] of [
                    ['back', 0.25, 2],
                    ['front', 0.4, 5],
                ] as const) {
                    fx.sys({
                        geo: BEAM,
                        image: 'light-column',
                        blend: 'add',
                        life: 1e4,
                        size: 1,
                        burst: [[0, 1]],
                        color: RAY[3],
                        alpha,
                        parent: shaft,
                        order,
                        look: {renderFace: face, scalingMode: 'hierarchy', mapUV: {scroll: [0.02, 0]}},
                    });
                }
                // Pooling on the floor.
                fx.sys({
                    tex: 'glow',
                    mode: RenderMode.HorizontalBillBoard,
                    life: 1e4,
                    size: width * 1.6,
                    burst: [[0, 1]],
                    color: RAY[2],
                    alpha: 0.5,
                    at: [x, 0.03, z],
                    order: 1,
                });
                // Motes lighting up as they drift through.
                fx.sys({
                    tex: 'dot',
                    life: [2, 3],
                    speed: [0.05, 0.15],
                    size: [0.03, 0.05],
                    rate: 6,
                    color: RAY[3],
                    shape: new BoxEmitter({width: width * 0.5, height: 5, depth: width * 0.5}),
                    at: [0, 2.5, 0],
                    parent: foot,
                    order: 6,
                    b: [tint([['#ffffff', 0]], flicker()), wobble(0.4, 0.3)],
                });
            });
            // Dust drifting in the dark between them.
            fx.sys({
                tex: 'dot',
                life: [3, 4],
                speed: [0.05, 0.15],
                size: [0.02, 0.035],
                rate: 10,
                color: RAY[1],
                alpha: 0.4,
                shape: air(),
                at: [0, H / 2, 0],
                order: 3,
                b: [wobble(0.4, 0.3), tint([['#ffffff', 0]], popOut(0.5))],
            });
        },
    },
    {
        id: 'weather/rain',
        name: 'Rain',
        loop: true,
        period: 4,
        view: VIEW,
        build(fx) {
            // Slanted rain at four depths: far drops faint, near ones bright.
            [
                [-1.8, 0.04, 0.35, 70],
                [-0.6, 0.05, 0.5, 60],
                [0.6, 0.06, 0.7, 50],
                [1.8, 0.08, 0.9, 40],
            ].forEach(([z, size, alpha, rate], i) => {
                precip(fx, {
                    z,
                    deep: 1.2,
                    rate,
                    speed: [11 + i, 13 + i],
                    size: [size * 0.8, size],
                    color: i === 3 ? '#c8e0ff' : '#8aa8d8',
                    alpha,
                    slant: 0.18,
                    streak: 0.9,
                    order: 3 + i,
                });
            });
            // Drops ring the puddles and splash.
            splashes(fx, 40, '#a8c4f0');
            for (const [x, z, s] of [
                [-1.6, 0.6, 1.6],
                [1.2, -0.4, 2],
                [0.2, 1.4, 1.2],
            ]) {
                decal(fx, {
                    at: [x, 0.015, z],
                    size: s,
                    color: '#0c1424',
                    alpha: 0.8,
                    life: 1e4,
                    loop: true,
                    alphas: [[1, 0]],
                });
                fx.sys({
                    tex: 'glow',
                    mode: RenderMode.HorizontalBillBoard,
                    life: 1e4,
                    size: s * 0.7,
                    burst: [[0, 1]],
                    color: '#4a6aa8',
                    alpha: 0.4,
                    at: [x, 0.02, z],
                    order: 1,
                });
            }
            // A low mist over the wet floor.
            banks(fx, {
                y: 0.2,
                z: 0,
                height: 0.2,
                deep: D,
                size: [1.4, 2],
                colors: ['#3a4a6a', '#5a6a8a'],
                alpha: 0.12,
                drift: 0.5,
                rate: 2,
                life: 12,
                order: 2,
            });
        },
    },
    {
        id: 'weather/shooting-stars',
        name: 'Shooting stars',
        loop: true,
        period: 5,
        view: {height: 2.6, distance: 9},
        build(fx) {
            const P = 5;
            stars(fx, {count: 200});
            // Meteors burning across, each leaving a glowing train.
            const meteors: Array<[number, number, [number, number, number], [number, number, number], boolean]> = [
                [0.2, 0.7, [-3, 4.4, -2.5], [1, 2.8, -2.5], false],
                [1.6, 1, [3.4, 4.6, -2], [-1.2, 2.2, -2], true],
                [3.2, 0.6, [-1, 4.8, -3], [2.4, 3.6, -3], false],
            ];
            meteors.forEach(([t0, dur, from, to, big]) => {
                const head = fx.node('meteor', from);
                fx.every((t) => {
                    const k = Math.min(1, Math.max(0, (t - t0) / dur));
                    head.position.set(from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2]);
                    head.scaling.setAll(t > t0 && t < t0 + dur ? 1 : 0.001);
                });
                held(fx, head, {tex: 'glint', size: big ? 0.6 : 0.35, color: '#ffffff', order: 7});
                held(fx, head, {size: big ? 0.9 : 0.5, color: '#ffe6a0', alpha: 0.6, order: 6});
                const train = fx.sys({
                    tex: 'glow',
                    world: true,
                    life: [0.8, 1.4],
                    speed: [0, 0.1],
                    size: big ? [0.16, 0.24] : [0.1, 0.16],
                    color: '#ffffff',
                    parent: head,
                    order: 5,
                    b: [tint(METEOR, fadeOut(0.3, 0)), wobble(0.6, 0.15), grow([0, 1], [1, 0.4])],
                });
                window(train, P, t0, t0 + dur, 160);
                if (big) {
                    // It flares and breaks up.
                    fx.sys({
                        tex: 'glow',
                        loop: true,
                        life: 0.3,
                        size: 2,
                        burst: [[t0 + dur - 0.05, 1]],
                        color: '#ffe6a0',
                        at: to,
                        order: 7,
                        b: [tint([['#ffffff', 0]], popOut(0.2))],
                    });
                    fx.sys({
                        tex: 'dot',
                        mode: RenderMode.StretchedBillBoard,
                        stretch: {speed: 0.06, length: 1},
                        world: true,
                        life: [0.5, 0.9],
                        speed: [1, 2.5],
                        size: [0.04, 0.07],
                        burst: [[t0 + dur - 0.05, 18]],
                        color: '#ffffff',
                        shape: new SphereEmitter({radius: 0.05, thickness: 1}),
                        at: to,
                        order: 6,
                        b: [tint(METEOR, popOut(0.5)), gravity(1.5), airDrag(1)],
                    });
                }
            });
        },
    },
    {
        id: 'weather/snow',
        name: 'Snow',
        loop: true,
        period: 5,
        view: VIEW,
        build(fx) {
            const settle = [floorBounce(0), wobble(0.6, 0.5), tint([['#ffffff', 0]], fadeOut(0.85, 0.05))];
            // Far specks, drifting flakes and big near crystals that spin and glow.
            precip(fx, {
                z: -1.6,
                deep: 1.2,
                rate: 60,
                speed: [0.5, 0.8],
                size: [0.03, 0.05],
                color: SNOW[3],
                alpha: 0.6,
                life: [6, 7],
                b: settle,
            });
            precip(fx, {
                z: 0,
                deep: 1.6,
                rate: 30,
                speed: [0.6, 0.9],
                size: [0.08, 0.12],
                color: SNOW[4],
                alpha: 0.9,
                tex: 'flake',
                life: [5, 6],
                b: [...settle, spin([-1, 1])],
            });
            precip(fx, {
                z: 1.8,
                deep: 0.8,
                rate: 6,
                speed: [0.7, 1],
                size: [0.2, 0.3],
                color: SNOW[4],
                alpha: 1,
                tex: 'flake',
                life: [4, 5],
                order: 7,
                b: [...settle, spin([-1.5, 1.5])],
            });
            // Already snowing when it opens.
            fx.sys({
                tex: 'flake',
                loop: false,
                life: [3, 5],
                speed: [0.6, 0.9],
                size: [0.06, 0.12],
                burst: [[0, 140]],
                color: SNOW[4],
                shape: air(),
                aim: 'down',
                at: [0, H / 2, 0],
                world: true,
                order: 5,
                b: settle,
            });
            // A sparkling drift.
            for (const [x, z, w] of [
                [-1.8, -0.4, 3],
                [1.6, 0.4, 3.4],
            ]) {
                fx.sys({
                    tex: 'glow',
                    mode: RenderMode.HorizontalBillBoard,
                    blend: 'alpha',
                    life: 1e4,
                    size: w * 1.6,
                    burst: [[0, 1]],
                    color: SNOW[4],
                    alpha: 0.55,
                    at: [x, 0.02, z],
                    order: 1,
                });
            }
            fx.sys({
                tex: 'glint',
                life: [0.3, 0.5],
                size: [0.08, 0.14],
                rate: 14,
                color: '#ffffff',
                shape: new BoxEmitter({width: W, height: D * 0.6, depth: 0}),
                aim: 'up',
                at: [0, 0.25, 0],
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.3))],
            });
            light(fx, {at: [0, 0.05, 0], size: 9, color: SNOW[2], floor: true, life: 5, alpha: 0.2, loop: true});
        },
    },
    {
        id: 'weather/storm',
        name: 'Storm',
        loop: true,
        period: 5,
        view: {height: 2.2, distance: 9},
        build(fx) {
            const STRIKE = 1.2;
            // A churning cloud deck.
            banks(fx, {
                y: 4.2,
                z: -0.5,
                height: 0.6,
                deep: D,
                size: [1.6, 2.4],
                colors: ['#1a1c2c', '#2c3046'],
                alpha: 0.95,
                drift: 0.6,
                rate: 4,
                life: 12,
                order: 2,
            });
            // Driving rain at two depths.
            precip(fx, {
                z: -1,
                deep: 2,
                rate: 120,
                speed: [14, 16],
                size: [0.04, 0.05],
                color: '#8aa0c8',
                alpha: 0.35,
                slant: 0.3,
                streak: 0.9,
                order: 4,
            });
            precip(fx, {
                z: 1.2,
                deep: 1.5,
                rate: 70,
                speed: [15, 17],
                size: [0.06, 0.08],
                color: '#b0c4e8',
                alpha: 0.6,
                slant: 0.3,
                streak: 0.9,
                order: 5,
            });
            splashes(fx, 50, '#a0b8e0');
            // A forked bolt strikes in a double flash.
            const ground = fx.node('ground', [-0.2, 0, -0.5]);
            arcs(fx, {
                to: ground,
                at: [0.4, 4.2, -0.5],
                burst: [
                    [STRIKE, 2],
                    [STRIKE + 0.15, 2],
                ],
                width: [0.5, 0.7],
                life: [0.08, 0.12],
                color: '#e0ecff',
                loop: true,
            });
            const fork = fx.node('fork', [1.6, 0, 0.2]);
            arcs(fx, {
                to: fork,
                at: [0.4, 4.2, -0.5],
                burst: [[STRIKE + 0.15, 1]],
                width: [0.3, 0.4],
                life: 0.08,
                color: '#c0d8ff',
                loop: true,
            });
            for (const [t, size, alpha] of [
                [STRIKE, 14, 0.5],
                [STRIKE + 0.15, 14, 0.6],
                [3.4, 10, 0.25],
            ]) {
                fx.sys({
                    tex: 'glow',
                    loop: true,
                    life: t > 3 ? 0.6 : 0.15,
                    size,
                    burst: [[t, 1]],
                    color: '#a8c0ff',
                    alpha,
                    at: [0.4, 3.6, -1.5],
                    order: 1,
                    b: [tint([['#ffffff', 0]], t > 3 ? flicker() : popOut(0.1))],
                });
            }
            light(fx, {
                at: [-0.2, 0.05, -0.5],
                size: 5,
                color: '#c8d8ff',
                floor: true,
                life: 0.35,
                alpha: 0.8,
                time: STRIKE,
                loop: true,
            });
            fx.sys({
                tex: 'glow',
                life: 0.4,
                size: [0.8, 1.2],
                burst: [[STRIKE, 1]],
                color: '#ffffff',
                at: [-0.2, 0.1, -0.5],
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.15))],
            });
        },
    },
];
