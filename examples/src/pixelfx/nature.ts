import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {CircleEmitter, ConeEmitter, RenderMode, SphereEmitter} from 'babylon.quarks';
import {held, window} from './arcane';
import {
    airDrag,
    extrude,
    fadeOut,
    flicker,
    floorBounce,
    gravity,
    grow,
    horn,
    lathe,
    lens,
    orbit,
    outlineBand,
    popOut,
    spike,
    subEmit,
    tint,
    turn,
    wobble,
} from './kit';
import {clods, dust, hotSparks, light, star, type At} from './parts';
import {decal, shockwave, windBand, type Ramp} from './recipes';
import {chain, tube} from './shadow';
import {between, hero} from './spawn';
import {shapes, type FxBuilder, type FxDef} from './stage';

const ACID = ['#0e1d14', '#173320', '#23552e', '#318232', '#55b92f', '#8eea3f', '#cfff63', '#f6ffc2'];
const EARTH = ['#1c1410', '#3a2a1e', '#5e4430', '#8a6844', '#b08e62', '#d4b88a', '#f0e0bc'];
const LEAF = ['#1d3a1a', '#2f5e22', '#4a8a2c', '#78b83a', '#b4dc5a', '#e8c040', '#e07a2a', '#c0402a'];
const BLOOM = ['#3a0e24', '#7a1e48', '#c4467a', '#f07aa6', '#ffb8d0', '#fff0f4'];
const SPORE = ['#06201e', '#0c4440', '#167a70', '#2ab8a4', '#6ae8d0', '#c8fff2', '#ffffff'];
const MIASMA = ['#140c24', '#2e1a4a', '#4c2e6e', '#5a6a2a', '#8aa83a', '#c8e060', '#f0ffb0'];
const GLOW = ['#fff6c4', '#ffe066', '#e8b030'];

const ACIDRAMP: Ramp = [
    ['#ffffff', 0],
    [ACID[6], 0.25],
    [ACID[5], 0.6],
    [ACID[3], 1],
];

const ease = (k: number) => k * k * (3 - 2 * k);
const outCubic = (k: number) => 1 - (1 - k) ** 3;
const outBack = (k: number) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;

/** A leaf: a pointed oval along y, about one unit long. */
function leafOutline(): Array<[number, number]> {
    const right: Array<[number, number]> = [];
    const left: Array<[number, number]> = [];
    for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const w = Math.sin(Math.PI * t) ** 0.8 * 0.28;
        right.push([w, t - 0.5]);
        left.push([-w, t - 0.5]);
    }
    return [...right, ...left.reverse().slice(1, -1)];
}
const LEAFGEO = extrude(leafOutline(), 0.03);
const BALL = lathe(
    Array.from({length: 11}, (_, i) => {
        const a = -Math.PI / 2 + (i / 10) * Math.PI;
        return [Math.max(0.001, Math.cos(a)), Math.sin(a)] as [number, number];
    }),
    16
);
/** pixelfx's toadstool, traced off its spore-burst sprite: `[radius, height]` in metres. */
const TOADSTOOL_STEM: Array<[number, number]> = [
    [0.151, 0],
    [0.12, 0.09],
    [0.12, 0.27],
    [0.09, 0.33],
    [0.135, 0.36],
    [0.09, 0.4],
    [0.09, 0.5],
];
const TOADSTOOL_CAP: Array<[number, number]> = [
    [0.09, 0.49],
    [0.571, 0.5],
    [0.571, 0.63],
    [0.541, 0.69],
    [0.511, 0.75],
    [0.481, 0.81],
    [0.419, 0.87],
    [0.271, 0.93],
    [0.181, 0.96],
    [0.001, 0.965],
];
const STEM = lathe(
    [
        [1, 0],
        [0.8, 1],
    ],
    10
);

/** A lit, solid shape riding `parent`, for the length of an effect or from `time` for `life`. */
function solid(
    fx: FxBuilder,
    parent: TransformNode,
    o: {
        geo: ReturnType<typeof extrude>;
        color: string;
        rim?: [number, number, number];
        time?: number;
        life?: number;
        loop?: boolean;
        order?: number;
        alpha?: Array<[number, number]>;
        image?: 'noise';
    }
) {
    return fx.sys({
        geo: o.geo,
        tex: 'white',
        blend: 'alpha',
        loop: o.loop ?? false,
        life: o.life ?? 1e4,
        size: 1,
        burst: [[o.time ?? 0, 1]],
        color: o.color,
        parent,
        order: o.order ?? 4,
        look: {
            lighting: 'fixed',
            scalingMode: 'hierarchy',
            rim: o.rim ? {color: o.rim, power: 2, strength: 1, mode: 'add'} : undefined,
        },
        b: o.alpha ? [tint([['#ffffff', 0]], o.alpha)] : [],
    });
}

/** Leaves flung or whirled as tumbling solid meshes. */
function leaves(
    fx: FxBuilder,
    o: {
        at: At;
        count?: number;
        rate?: number;
        time?: number;
        speed: [number, number];
        life: [number, number];
        size?: [number, number];
        colors?: [string, string];
        emitter?: ConeEmitter | SphereEmitter | CircleEmitter;
        aim?: 'up' | 'right' | 'left';
        rotate?: [number, number, number];
        weight?: number;
        whirl?: number;
        loop?: boolean;
        world?: boolean;
        parent?: TransformNode;
    }
) {
    return fx.sys({
        geo: LEAFGEO,
        tex: 'white',
        blend: 'alpha',
        loop: o.loop ?? false,
        life: o.life,
        speed: o.speed,
        size: o.size ?? [0.14, 0.22],
        burst: o.count ? [[o.time ?? 0, o.count]] : undefined,
        rate: o.rate,
        tumble: 7,
        color: o.colors ?? [LEAF[3], LEAF[6]],
        shape: o.emitter ?? new SphereEmitter({radius: 0.1, thickness: 1}),
        aim: o.aim,
        rotate: o.rotate,
        at: o.at,
        world: o.world ?? true,
        parent: o.parent,
        order: 5,
        look: {lighting: 'fixed', renderFace: 'both'},
        b: [
            ...(o.whirl ? [orbit(o.whirl, o.aim === 'up' ? [0, 0, 1] : [0, 1, 0])] : []),
            gravity(o.weight ?? 2),
            airDrag(1.5),
            wobble(1.5, 0.6),
            grow([0, 1], [0.85, 1], [1, 0]),
        ],
    });
}

/** `a` to `b` by `k`, as hex. */
function mixHex(a: string, b: string, k: number): string {
    const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
    return (
        '#' +
        [0, 1, 2]
            .map((i) =>
                Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * k)
                    .toString(16)
                    .padStart(2, '0')
            )
            .join('')
    );
}

/** A tar or acid puddle's outline: a radius near 1 that wanders round it. */
const PUDDLE = (a: number) =>
    1 + 0.09 * Math.sin(3 * a + 0.7) + 0.06 * Math.sin(5 * a + 2.1) + 0.04 * Math.sin(7 * a + 4.2);

/**
 * Vapour off a pool: thin ribbons that curl up, lit green from below and greying as they climb, then
 * fade. Trails, so they leave the curl behind them as they rise.
 */
function vapour(
    fx: FxBuilder,
    o: {
        rate: number;
        burst?: number;
        life: [number, number];
        /** The radius of the pool they rise from; a point when left out. */
        radius?: number;
        at?: At;
        world?: boolean;
        colors?: [string, string];
    }
) {
    return fx.sys({
        tex: 'glow',
        mode: RenderMode.Trail,
        trail: 40,
        blend: 'alpha',
        loop: o.burst ? false : undefined,
        life: o.life,
        speed: [0.28, 0.42],
        size: [0.06, 0.1],
        rate: o.rate,
        burst: o.burst ? [[0, o.burst]] : undefined,
        color: o.colors ?? ['#a6d46a', '#c8e0a4'],
        alpha: 0.55,
        shape: new ConeEmitter({radius: o.radius ?? 0.02, angle: 0.15}),
        aim: 'up',
        at: o.at,
        world: o.world ?? true,
        order: 6,
        b: [
            gravity(0.35, [0, 1, 0]),
            wobble(1.1, 0.5),
            tint(
                [
                    ['#ffffff', 0],
                    ['#e4e8e0', 1],
                ],
                fadeOut(0.45, 0.12)
            ),
        ],
    });
}

export const nature: FxDef[] = [
    {
        id: 'nature/acid-splash',
        name: 'Acid splash',
        loop: false,
        period: 2.8,
        build(fx) {
            const P = 2.8;
            const HIT = 0.32;
            // A gob of acid drops.
            const gob = fx.node('gob', [0, 2.6, 0]);
            fx.every((t) => {
                const k = Math.min(1, t / HIT);
                gob.position.y = 2.6 - 2.55 * k * k;
                gob.scaling.set(1 - k * 0.2, 1 + k * 0.4, 1 - k * 0.2);
                if (t > HIT) gob.scaling.setAll(0.001);
            });
            const bead = fx.node('bead', [0, 0, 0], gob);
            bead.scaling.setAll(0.16);
            solid(fx, bead, {geo: BALL, color: ACID[5], rim: [0.8, 1.4, 0.4], life: HIT});
            held(fx, gob, {size: 0.8, color: ACID[5], alpha: 0.6});
            // It bursts into a crown and spatters.
            star(fx, {at: [0, 0.1, 0.1], size: 2, life: 0.2, time: HIT, tex: 'glow', ramp: ACIDRAMP});
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.05, length: 1},
                world: true,
                loop: false,
                life: [0.5, 0.8],
                speed: [2.5, 4],
                size: [0.07, 0.11],
                burst: [[HIT, 30]],
                color: [ACID[5], ACID[6]],
                shape: new ConeEmitter({radius: 0.25, angle: 0.55, thickness: 0.2}),
                aim: 'up',
                at: [0, 0.05, 0],
                order: 6,
                b: [gravity(10), floorBounce(0), tint(ACIDRAMP, fadeOut(0.85, 0))],
            });
            // It eats a glowing, smoking pit into the floor.
            const pit = fx.node('pit', [0, 0, 0]);
            fx.every((t) => {
                const k = outCubic(between(t, HIT, HIT + 0.6)) * (1 - ease(between(t, 2.3, 2.75)));
                pit.scaling.setAll(Math.max(0.001, k));
            });
            fx.sys({
                tex: 'glow',
                mode: RenderMode.HorizontalBillBoard,
                blend: 'alpha',
                loop: false,
                life: P - HIT,
                size: 1.9,
                burst: [[HIT, 1]],
                color: '#060a06',
                alpha: 0.95,
                at: [0, 0.015, 0],
                parent: pit,
                order: 0,
                look: {scalingMode: 'hierarchy'},
            });
            // The acid pooled in it, boiling: a shallow lens with a wandering edge, its surface
            // churning, a bright lip where it bites the floor.
            const bath = {
                loop: false,
                life: P - HIT,
                size: 0.62,
                burst: [[HIT, 1]] as Array<[number, number]>,
                parent: pit,
            };
            fx.sys({
                ...bath,
                geo: lens(PUDDLE, 0.05, {power: 0.3}),
                image: 'noise',
                blend: 'add',
                color: ACID[4],
                at: [0, 0.01, 0],
                order: 1,
                look: {scalingMode: 'hierarchy', mapUV: {tiling: [2, 2], scroll: [0.25, -0.4]}},
            });
            fx.sys({
                ...bath,
                geo: outlineBand(PUDDLE, 0.92, 1.06),
                tex: 'white',
                blend: 'add',
                color: ACID[6],
                alpha: 0.8,
                at: [0, 0.012, 0],
                order: 2,
                look: {renderFace: 'both', scalingMode: 'hierarchy'},
                b: [tint([['#ffffff', 0]], flicker())],
            });
            // The crown the gob bursts into: a flared wall of acid that leaps up and slumps back.
            fx.sys({
                geo: lathe(
                    [
                        [0.12, 0],
                        [0.16, 0.1],
                        [0.26, 0.22],
                        [0.34, 0.28],
                    ],
                    32
                ),
                tex: 'white',
                blend: 'alpha',
                loop: false,
                life: 0.4,
                size: 1,
                burst: [[HIT, 1]],
                color: ACID[5],
                at: [0, 0.01, 0],
                order: 5,
                look: {
                    renderFace: 'both',
                    lighting: 'fixed',
                    rim: {color: [0.6, 1, 0.3], power: 2, strength: 1, mode: 'add'},
                },
                b: [grow([0, 0.4], [0.35, 1.1], [1, 1.4]), tint(ACIDRAMP, popOut(0.35))],
            });
            fx.sys({
                tex: 'glow',
                mode: RenderMode.HorizontalBillBoard,
                loop: false,
                life: P - HIT,
                size: 1.4,
                burst: [[HIT, 1]],
                color: ACID[4],
                alpha: 0.5,
                at: [0, 0.03, 0],
                parent: pit,
                order: 1,
                look: {scalingMode: 'hierarchy'},
                b: [tint([['#ffffff', 0]], flicker())],
            });
            // It boils, spitting bright beads, pale steam curling off.
            const spit = fx.sys({
                tex: 'dot',
                world: true,
                life: [0.3, 0.5],
                speed: [1, 2],
                size: [0.04, 0.07],
                color: [ACID[6], ACID[7]],
                shape: new ConeEmitter({radius: 0.5, angle: 0.3, thickness: 1}),
                aim: 'up',
                at: [0, 0.05, 0],
                order: 6,
                b: [gravity(9), tint(ACIDRAMP, popOut(0.5))],
            });
            window(spit, P, HIT + 0.2, 2.3, 22);
            const steam = vapour(fx, {
                rate: 0,
                life: [0.6, 1.1],
                radius: 0.45,
                at: [0, 0.05, 0],
                colors: ['#dcecd0', '#f4fae8'],
            });
            window(steam, P, HIT + 0.3, 2.4, 24);
            light(fx, {at: [0, 0.05, 0], size: 3, color: ACID[4], floor: true, life: 2, alpha: 0.5, time: HIT});
        },
    },
    {
        id: 'nature/boulder',
        name: 'Boulder',
        loop: false,
        period: 2.3,
        view: {distance: 12},
        build(fx) {
            const HIT = 0.55;
            const from: At = [-3.2, 1.6, 0];
            const to: At = [0.8, 0.45, 0];
            // A spinning boulder arcs right, shedding dust and pebbles.
            const rock = fx.node('rock', from);
            fx.every((t) => {
                const k = Math.min(1, t / HIT);
                rock.position.set(
                    from[0] + (to[0] - from[0]) * k,
                    from[1] + (to[1] - from[1]) * k + Math.sin(k * Math.PI) * 1.1,
                    0
                );
                rock.rotation.z = -t * 9;
                rock.scaling.setAll(t < HIT ? 1 : 0.001);
            });
            fx.sys({
                mesh: 'rock',
                loop: false,
                life: HIT,
                size: 0.95,
                burst: [[0, 1]],
                color: EARTH[3],
                parent: rock,
                order: 4,
            });
            const trail = dust(fx, {
                size: [0.35, 0.55],
                life: [0.5, 0.8],
                world: true,
                parent: rock,
                color: [EARTH[4], EARTH[5]],
                alpha: 0.5,
                loop: false,
            });
            window(trail, 2.3, 0, HIT, 30);
            const pebbles = clods(fx, {count: 1, color: [EARTH[2], EARTH[4]], parent: rock, size: [0.05, 0.09]});
            pebbles.emissionBursts = [];
            window(pebbles, 2.3, 0, HIT, 14);
            // It smashes into the floor in a white flash and bursts.
            star(fx, {at: [to[0], 0.5, 0.3], size: 2.6, life: 0.2, time: HIT, tex: 'burst'});
            fx.sys({
                tex: 'glow',
                loop: false,
                life: 0.25,
                size: 3,
                burst: [[HIT, 1]],
                color: '#ffffff',
                at: [to[0], 0.5, 0],
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.1))],
            });
            shockwave(fx, {at: [to[0], 0.04, 0], size: 4, color: EARTH[6], life: 0.4, delay: HIT});
            clods(fx, {
                count: 16,
                color: [EARTH[2], EARTH[4]],
                at: [to[0], 0.3, 0],
                shape: new ConeEmitter({radius: 0.4, angle: 0.8, thickness: 1}),
                aim: 'up',
                speed: [2.5, 5],
                size: [0.14, 0.3],
                delay: HIT,
                life: [1.2, 1.6],
            });
            clods(fx, {
                count: 30,
                color: [EARTH[3], EARTH[5]],
                at: [to[0], 0.2, 0],
                shape: new ConeEmitter({radius: 0.3, angle: 0.9, thickness: 1}),
                aim: 'up',
                speed: [2, 4.5],
                size: [0.04, 0.08],
                delay: HIT,
                life: [1, 1.4],
            });
            dust(fx, {
                at: [to[0], 0.2, 0],
                size: [0.8, 1.2],
                life: [1.2, 1.7],
                burst: [[HIT, 14]],
                speed: [1.5, 3],
                shape: new CircleEmitter({radius: 0.3, thickness: 1}),
                rotate: [Math.PI / 2, 0, 0],
                color: [EARTH[4], EARTH[5]],
                alpha: 0.6,
                drag: 2,
                loop: false,
            });
        },
    },
    {
        id: 'nature/earth-spike',
        name: 'Earth spike',
        loop: false,
        period: 3.4,
        build(fx) {
            const P = 3.4;
            const UP = 0.35;
            const SPLIT = 2.1;
            // The floor cracks with light and heaves.
            decal(fx, {tex: 'crack', size: 2.6, color: GLOW[1], alpha: 0.9, blend: 'add', life: 1.2, rot: 0.5});
            decal(fx, {
                tex: 'crack',
                size: 2.6,
                color: EARTH[0],
                alpha: 0.9,
                life: P,
                rot: 0.5,
                alphas: fadeOut(0.85, 0.05),
            });
            light(fx, {at: [0, 0.05, 0], size: 2.4, color: GLOW[1], floor: true, life: 0.6, alpha: 0.7});
            // A faceted stone spike rams up with two side shards.
            const spikes: Array<[number, number, number, number, number]> = [
                // x, z, lean (z rotation), height, width
                [0, 0, 0, 2.2, 1.6],
                [-0.45, 0.15, 0.45, 1.1, 0.9],
                [0.5, -0.1, -0.5, 1.3, 1],
            ];
            const geo = spike(0, 6);
            spikes.forEach(([x, z, lean, h, w], i) => {
                const node = fx.node('spike', [x, 0, z]);
                node.rotation.z = lean;
                fx.every((t) => {
                    const up = outBack(between(t, UP + i * 0.06, UP + 0.18 + i * 0.06));
                    const crumble = between(t, SPLIT + i * 0.1, SPLIT + 0.5 + i * 0.1);
                    node.scaling.set(
                        w * (1 - crumble * 0.3),
                        Math.max(0.001, h * up * (1 - crumble)),
                        w * (1 - crumble * 0.3)
                    );
                });
                solid(fx, node, {geo, color: EARTH[3], rim: [0.6, 0.45, 0.3], life: P});
            });
            clods(fx, {
                count: 24,
                color: [EARTH[3], EARTH[5]],
                at: [0, 0.2, 0],
                shape: new ConeEmitter({radius: 0.4, angle: 0.6, thickness: 1}),
                aim: 'up',
                speed: [3, 6],
                size: [0.06, 0.14],
                delay: UP,
                life: [1.2, 1.8],
            });
            hotSparks(fx, {
                count: 20,
                time: UP,
                at: [0, 0.2, 0],
                shape: new ConeEmitter({radius: 0.3, angle: 0.5, thickness: 1}),
                aim: 'up',
                speed: [4, 7],
                palette: [
                    ['#ffffff', 0],
                    [GLOW[0], 0.3],
                    [EARTH[5], 1],
                ],
            });
            dust(fx, {
                at: [0, 0.2, 0],
                size: [0.7, 1.1],
                life: [1.2, 1.6],
                burst: [[UP, 12]],
                speed: [1.2, 2.5],
                shape: new CircleEmitter({radius: 0.4, thickness: 1}),
                rotate: [Math.PI / 2, 0, 0],
                color: [EARTH[4], EARTH[5]],
                alpha: 0.6,
                drag: 2,
                loop: false,
            });
            // Then it splits and crumbles.
            clods(fx, {
                count: 30,
                color: [EARTH[3], EARTH[4]],
                at: [0, 1, 0],
                shape: new SphereEmitter({radius: 0.5, thickness: 1}),
                speed: [0.5, 2],
                size: [0.08, 0.18],
                delay: SPLIT,
                life: [1, 1.2],
            });
            dust(fx, {
                at: [0, 0.6, 0],
                size: [0.6, 0.9],
                life: [1, 1.3],
                burst: [[SPLIT, 10]],
                speed: [0.6, 1.4],
                shape: new SphereEmitter({radius: 0.5, thickness: 1}),
                color: [EARTH[4], EARTH[5]],
                alpha: 0.5,
                loop: false,
            });
        },
    },
    {
        id: 'nature/healing-bloom',
        name: 'Healing bloom',
        loop: false,
        period: 3.3,
        view: {height: 0.9, distance: 5},
        build(fx) {
            const P = 3.3;
            const OPEN = 1.05;
            // A sprout pushes up and unfurls.
            const stem = fx.node('stem', [0, 0, 0]);
            fx.every((t) => {
                const k = outCubic(between(t, 0.2, 0.9));
                stem.scaling.set(0.035, Math.max(0.001, 1.25 * k), 0.035);
                stem.rotation.z = Math.sin(t * 2) * 0.04;
            });
            solid(fx, stem, {geo: STEM, color: LEAF[2], rim: [0.4, 0.8, 0.3], life: P});
            [
                [0.35, 1, 0.55],
                [0.6, -1, 0.7],
            ].forEach(([y, side, t0]) => {
                const leaf = fx.node('leaf', [0, 0, 0]);
                fx.every((t) => {
                    const k = outBack(between(t, t0, t0 + 0.35));
                    leaf.position.y = y * 1.25 * outCubic(between(t, 0.2, 0.9));
                    leaf.scaling.setAll(Math.max(0.001, 0.4 * k));
                    leaf.rotation.set(0.3, 0, -side * (0.9 + (1 - k) * 0.6));
                });
                const blade = fx.node('blade', [0, 0.5, 0], leaf);
                solid(fx, blade, {geo: LEAFGEO, color: LEAF[3], rim: [0.5, 0.9, 0.3], life: P});
            });
            // A bud swells and opens round a glowing golden heart.
            const head = fx.node('head', [0, 0, 0]);
            fx.every((t) => {
                const k = outCubic(between(t, 0.2, 0.9));
                head.position.set(Math.sin(t * 2) * -0.05 * k, 1.25 * k, 0);
                head.scaling.setAll(t < 0.6 ? 0.001 : 1);
            });
            const bud = fx.node('bud', [0, 0.05, 0], head);
            fx.every((t) => {
                const k = outCubic(between(t, 0.6, 1)) * (t < OPEN ? 1 : 0.001);
                bud.scaling.set(0.11 * k + 0.001, 0.16 * k + 0.001, 0.11 * k + 0.001);
            });
            solid(fx, bud, {geo: BALL, color: BLOOM[2], rim: [1, 0.6, 0.8], life: OPEN});
            const PETALS = 6;
            for (let i = 0; i < PETALS; i++) {
                const turn = fx.node('turn', [0, 0, 0], head);
                turn.rotation.y = (i / PETALS) * Math.PI * 2;
                const petal = fx.node('petal', [0, 0, 0], turn);
                const lift = 1.75 + i * 0.16;
                fx.every((t) => {
                    const open = outBack(between(t, OPEN, OPEN + 0.3));
                    const away = between(t, lift, lift + 0.8);
                    petal.rotation.x = 0.2 + (1 - open) * 1.2 + away * 1.5;
                    petal.position.set(0, away * 0.9, away * 0.25);
                    petal.scaling.setAll(t < OPEN ? 0.001 : 0.42 * (1 - away) + 0.001);
                });
                const blade = fx.node('blade', [0, 0, 0.45], petal);
                blade.rotation.x = Math.PI / 2;
                solid(fx, blade, {geo: LEAFGEO, color: i % 2 ? BLOOM[3] : BLOOM[4], rim: [1, 0.7, 0.85], life: P});
            }
            const heart = fx.node('heart', [0, 0.08, 0], head);
            fx.every((t) => {
                heart.scaling.setAll(t < OPEN ? 0.001 : 1);
            });
            held(fx, heart, {size: 0.5, color: GLOW[1]});
            held(fx, heart, {tex: 'dot', size: 0.14, color: '#ffffff', order: 7});
            // A flare of healing light.
            star(fx, {
                at: [0, 1.3, 0.2],
                size: 2.6,
                life: 0.4,
                time: OPEN,
                tex: 'glow',
                ramp: [
                    ['#ffffff', 0],
                    [GLOW[0], 0.4],
                    ['#a0e46c', 1],
                ],
            });
            shockwave(fx, {size: 3, color: '#a0e46c', life: 0.6, delay: OPEN, alpha: 0.35});
            const motes = fx.sys({
                tex: 'plus',
                life: [0.8, 1.2],
                speed: [0.5, 1],
                size: [0.12, 0.2],
                color: ['#a0e46c', '#dcffb4'],
                shape: new ConeEmitter({radius: 0.6, angle: 0.2, thickness: 1}),
                aim: 'up',
                at: [0, 0.3, 0],
                order: 7,
                b: [tint([['#ffffff', 0]], popOut(0.5)), wobble(1, 0.4)],
            });
            window(motes, P, OPEN, 2.9, 8);
            const glints = fx.sys({
                tex: 'glint',
                life: [0.6, 1],
                speed: [0.3, 0.6],
                size: [0.08, 0.14],
                color: GLOW[0],
                shape: new SphereEmitter({radius: 0.6, thickness: 1}),
                at: [0, 1.4, 0],
                order: 7,
                b: [tint([['#ffffff', 0]], popOut(0.4))],
            });
            window(glints, P, OPEN, 3, 12);
            light(fx, {at: [0, 0.05, 0], size: 2.6, color: '#a0e46c', floor: true, life: 2, alpha: 0.5, time: OPEN});
        },
    },
    {
        id: 'nature/leaf-storm',
        name: 'Leaf storm',
        loop: true,
        period: 2.4,
        build(fx) {
            hero(fx, {period: 2.4, loop: true});
            // Leaves tumbling up a rising spiral round the character.
            leaves(fx, {
                at: [0, 0.1, 0],
                rate: 50,
                speed: [1, 1.4],
                size: [0.22, 0.34],
                life: [1.8, 2.2],
                emitter: new ConeEmitter({radius: 0.9, angle: 0, thickness: 0.2}),
                aim: 'up',
                whirl: 3.2,
                weight: 0,
                colors: [LEAF[3], LEAF[6]],
                loop: true,
                world: false,
            });
            // Bright bands of wind wrapped round it.
            for (let i = 0; i < 4; i++) {
                const band = fx.node('band', [0, 0.4 + i * 0.45, 0]);
                band.rotation.z = (i % 2 ? 1 : -1) * 0.18;
                const turn = fx.node('turn', [0, 0, 0], band);
                fx.every((t) => {
                    turn.rotation.y = -t * (5 + i);
                });
                const r = 1.0 + i * 0.08;
                fx.sys({
                    geo: lathe(
                        [
                            [r, 0],
                            [r, 0.08],
                        ],
                        32,
                        2.4,
                        0
                    ),
                    tex: 'smear',
                    blend: 'add',
                    life: 1e4,
                    size: 1,
                    burst: [[0, 1]],
                    color: '#e8ffe0',
                    alpha: 0.7,
                    parent: turn,
                    order: 6,
                    look: {renderFace: 'both'},
                });
            }
            // Litter swirling at the feet.
            fx.sys({
                tex: 'dot',
                life: [0.8, 1.2],
                speed: [0.2, 0.4],
                size: [0.04, 0.07],
                rate: 20,
                color: [LEAF[4], LEAF[5]],
                shape: new CircleEmitter({radius: 0.8, thickness: 0.4}),
                rotate: [Math.PI / 2, 0, 0],
                at: [0, 0.08, 0],
                order: 6,
                b: [orbit(4, [0, 0, 1]), tint([['#ffffff', 0]], popOut(0.6))],
            });
            dust(fx, {
                at: [0, 0.1, 0],
                size: [0.4, 0.6],
                life: [0.6, 0.9],
                rate: 10,
                speed: [0.6, 1],
                shape: new CircleEmitter({radius: 0.6, thickness: 1}),
                rotate: [Math.PI / 2, 0, 0],
                color: ['#a09a80', '#c0b898'],
                alpha: 0.35,
                loop: true,
            });
        },
    },
    {
        id: 'nature/poison-cloud',
        name: 'Poison cloud',
        loop: true,
        period: 4,
        build(fx) {
            // Ragged sheets of gas hugging the floor, lit yellow-green within, violet without.
            fx.sys({
                tex: 'smoke',
                blend: 'alpha',
                life: [2.4, 3.2],
                speed: [0.3, 0.7],
                size: [1, 1.6],
                rot: true,
                rate: 10,
                color: [MIASMA[1], MIASMA[2]],
                alpha: 0.55,
                shape: new CircleEmitter({radius: 0.6, thickness: 1}),
                rotate: [Math.PI / 2, 0, 0],
                at: [0, 0.3, 0],
                order: 2,
                b: [
                    tint([['#ffffff', 0]], fadeOut(0.5, 0.2)),
                    grow([0, 0.5], [1, 1.4]),
                    wobble(0.6, 0.3),
                    airDrag(0.4),
                ],
            });
            fx.sys({
                tex: 'smoke',
                life: [1.6, 2.2],
                speed: [0.3, 0.6],
                size: [0.7, 1.1],
                rot: true,
                rate: 12,
                color: MIASMA[4],
                alpha: 0.25,
                shape: new CircleEmitter({radius: 0.5, thickness: 1}),
                rotate: [Math.PI / 2, 0, 0],
                at: [0, 0.25, 0],
                order: 3,
                b: [
                    tint([['#ffffff', 0]], fadeOut(0.4, 0.2)),
                    grow([0, 0.5], [1, 1.3]),
                    wobble(0.6, 0.3),
                    airDrag(0.4),
                ],
            });
            // Tongues creeping out, curling up at their tips.
            fx.sys({
                tex: 'smoke',
                life: [1.4, 1.8],
                speed: [1, 1.4],
                size: [0.4, 0.6],
                rot: true,
                rate: 8,
                color: [MIASMA[3], MIASMA[4]],
                alpha: 0.5,
                shape: new CircleEmitter({radius: 0.4, thickness: 1}),
                rotate: [Math.PI / 2, 0, 0],
                at: [0, 0.15, 0],
                order: 3,
                b: [
                    tint([['#ffffff', 0]], fadeOut(0.4, 0.1)),
                    grow([0, 0.6], [1, 1.2]),
                    airDrag(1),
                    gravity(0.6, [0, 1, 0]),
                ],
            });
            // Plumes twisting up as ribbons.
            fx.sys({
                tex: 'smoke',
                life: [1.6, 2],
                speed: [0.6, 0.9],
                size: [0.25, 0.4],
                rot: true,
                rate: 8,
                color: [MIASMA[4], MIASMA[2]],
                alpha: 0.4,
                shape: new ConeEmitter({radius: 1.2, angle: 0.05, thickness: 1}),
                aim: 'up',
                at: [0, 0.3, 0],
                order: 4,
                b: [tint([['#ffffff', 0]], fadeOut(0.4, 0.2)), grow([0, 0.6], [1, 1.5]), wobble(1.2, 1)],
            });
            fx.sys({
                tex: 'glint',
                life: [0.6, 1],
                size: [0.08, 0.14],
                rate: 8,
                color: MIASMA[6],
                shape: new SphereEmitter({radius: 1.4, thickness: 1}),
                at: [0, 0.3, 0],
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.5))],
            });
            light(fx, {at: [0, 0.05, 0], size: 4.5, color: MIASMA[4], floor: true, life: 4, alpha: 0.45, loop: true});
        },
    },
    {
        id: 'nature/quake',
        name: 'Quake',
        loop: false,
        period: 3.1,
        view: {distance: 12},
        build(fx) {
            const P = 3.1;
            const JOLTS = [0.3, 1.0, 1.7];
            // A rift tearing out along the floor, glowing deep inside.
            JOLTS.forEach((at, i) => {
                const x = (i - 1) * 1.1;
                fx.sys({
                    tex: 'crack',
                    mode: RenderMode.HorizontalBillBoard,
                    blend: 'alpha',
                    loop: false,
                    life: P - at,
                    size: 1.8,
                    rot: i * 1.3,
                    burst: [[at, 1]],
                    color: '#0a0604',
                    at: [x, 0.016, 0],
                    order: 0,
                    b: [tint([['#ffffff', 0]], fadeOut(0.85, 0)), grow([0, 0.3], [0.1, 1])],
                });
                fx.sys({
                    tex: 'crack',
                    mode: RenderMode.HorizontalBillBoard,
                    loop: false,
                    life: P - at,
                    size: 1.8,
                    rot: i * 1.3,
                    burst: [[at, 1]],
                    color: '#ff8a2a',
                    alpha: 0.8,
                    at: [x, 0.02, 0],
                    order: 1,
                    b: [
                        tint(
                            [['#ffffff', 0]],
                            [
                                [1, 0],
                                [0.5, 0.3],
                                [0.7, 0.6],
                                [0, 1],
                            ]
                        ),
                        grow([0, 0.3], [0.1, 0.9]),
                    ],
                });
                // Pebbles hop and dust bursts out of the split.
                clods(fx, {
                    count: 14,
                    color: [EARTH[2], EARTH[4]],
                    at: [x, 0.05, 0],
                    shape: new ConeEmitter({radius: 0.8, angle: 0.3, thickness: 1}),
                    aim: 'up',
                    speed: [1.5, 3],
                    size: [0.05, 0.1],
                    delay: at,
                    life: [0.8, 1.2],
                });
                dust(fx, {
                    at: [x, 0.15, 0],
                    size: [0.6, 1],
                    life: [1, 1.4],
                    burst: [[at, 8]],
                    speed: [0.8, 1.6],
                    shape: new ConeEmitter({radius: 0.6, angle: 0.6, thickness: 1}),
                    aim: 'up',
                    color: [EARTH[4], EARTH[5]],
                    alpha: 0.55,
                    loop: false,
                });
                light(fx, {at: [x, 0.05, 0], size: 2, color: '#ff8a2a', floor: true, life: 0.8, alpha: 0.5, time: at});
            });
            // Slabs of floor heave up on each jolt and drop back askew.
            // They lie along the rift, flush with the floor until their jolt, and settle proud of it.
            const slabs: Array<[number, number, number, number]> = [
                [-1.5, 0.38, 0.6, 0],
                [-0.6, -0.4, 0.7, 0],
                [0.5, 0.4, 0.6, 1],
                [1.5, -0.36, 0.7, 2],
                [-0.05, -0.42, 0.5, 1],
            ];
            slabs.forEach(([x, z, w, j], i) => {
                const slab = fx.prop(shapes.box(fx.scene, w, 0.14, w * 0.8), {at: [x, -0.09, z], color: EARTH[2]});
                fx.every((t) => {
                    let y = t > JOLTS[j] ? -0.035 : -0.09;
                    let tilt = 0;
                    JOLTS.forEach((at, k) => {
                        if (k < j) return;
                        const d = t - at;
                        if (d > 0) {
                            const hop = d < 0.35 ? Math.sin((d / 0.35) * Math.PI) : 0;
                            y += hop * (0.35 - k * 0.05);
                            tilt += Math.min(1, d / 0.35) * (i % 2 ? 0.08 : -0.1);
                        }
                    });
                    slab.position.y = Math.max(-0.09, y);
                    slab.rotation.set(tilt, 0, tilt * 0.7);
                });
            });
        },
    },
    {
        id: 'nature/root-snare',
        name: 'Root snare',
        loop: false,
        period: 2.7,
        build(fx) {
            const P = 2.7;
            hero(fx, {period: P});
            decal(fx, {tex: 'crack', size: 2.2, color: EARTH[0], alpha: 0.9, life: P, alphas: fadeOut(0.85, 0.05)});
            // Roots bursting up and spiralling round the legs.
            const ROOTS = 3;
            const SEG = 40;
            for (let r = 0; r < ROOTS; r++) {
                const segs = chain(fx, SEG, {color: EARTH[2], rim: [0.6, 0.45, 0.25], life: P, tube: true});
                const phase = (r / ROOTS) * Math.PI * 2;
                fx.every((t) => {
                    const grow = outCubic(between(t, 0.1 + r * 0.05, 0.55 + r * 0.05));
                    const cinch = ease(between(t, 0.65, 0.75));
                    const crumble = between(t, 1.9, 2.1);
                    const radius = 0.62 - cinch * 0.2;
                    for (let i = 0; i < SEG; i++) {
                        const s = i / (SEG - 1);
                        const reach = s <= grow ? 1 : 0;
                        const a = phase + s * Math.PI * 1.6;
                        const rr = radius * (1 + (1 - s) * 0.5);
                        segs[i].position.set(Math.cos(a) * rr, s * 1.2 * grow, Math.sin(a) * rr);
                        segs[i].scaling.setAll(reach && crumble < 1 ? 0.09 * (1 - s * 0.6) : 0.001);
                    }
                });
                tube(fx, segs);
            }
            // They cinch tight with a snap.
            star(fx, {
                at: [0, 0.8, 0.5],
                size: 1.2,
                life: 0.18,
                time: 0.72,
                tex: 'burst',
                ramp: [
                    ['#ffffff', 0],
                    [EARTH[6], 1],
                ],
            });
            clods(fx, {
                count: 12,
                color: [EARTH[3], EARTH[5]],
                at: [0, 0.6, 0],
                shape: new SphereEmitter({radius: 0.5, thickness: 0.2}),
                speed: [1, 2],
                size: [0.04, 0.08],
                delay: 0.72,
                life: [0.6, 0.9],
            });
            // Then crack and crumble into bark and dust.
            clods(fx, {
                count: 36,
                color: [EARTH[2], EARTH[4]],
                mesh: 'plank',
                at: [0, 0.6, 0],
                shape: new SphereEmitter({radius: 0.55, thickness: 0.3}),
                speed: [0.4, 1.4],
                size: [0.06, 0.12],
                delay: 1.95,
                life: [0.8, 1.1],
            });
            dust(fx, {
                at: [0, 0.5, 0],
                size: [0.5, 0.8],
                life: [0.9, 1.2],
                burst: [[1.95, 10]],
                speed: [0.5, 1.2],
                shape: new SphereEmitter({radius: 0.5, thickness: 1}),
                color: [EARTH[4], EARTH[5]],
                alpha: 0.5,
                loop: false,
            });
            light(fx, {at: [0, 0.05, 0], size: 2.2, color: '#a0c060', floor: true, life: 1.6, alpha: 0.35, time: 0.1});
        },
    },
    {
        id: 'nature/spore-burst',
        name: 'Spore burst',
        loop: false,
        period: 3.2,
        view: {height: 1.2, distance: 8},
        build(fx) {
            const P = 3.2;
            const POP = 1.15;
            // A toadstool pushes up, swells and trembles as its gills glow.
            const shroom = fx.node('shroom', [0, 0, 0]);
            fx.every((t) => {
                const up = outBack(between(t, 0.1, 0.5));
                const swell = between(t, 0.55, POP);
                const squash = between(t, POP, POP + 0.12) * (1 - between(t, POP + 0.12, POP + 0.4));
                const shake = Math.sin(t * 60) * 0.03 * swell;
                shroom.scaling.set(
                    Math.max(0.001, up * (1 + swell * 0.2 + squash * 0.3)),
                    Math.max(0.001, up * (1 + swell * 0.1 - squash * 0.4)),
                    Math.max(0.001, up * (1 + swell * 0.2 + squash * 0.3))
                );
                shroom.position.x = shake;
            });
            // The toadstool turned from pixelfx's own silhouette (traced off its sprite, 3 cm a pixel):
            // a stem with a frilled ring, under a domed cap with a flat, gilled underside.
            solid(fx, shroom, {geo: lathe(TOADSTOOL_STEM, 20), color: '#d8ccd0', life: P});
            const cap = fx.node('cap', [0, 0, 0], shroom);
            solid(fx, cap, {geo: lathe(TOADSTOOL_CAP, 32), color: '#8e3462', rim: [1, 0.55, 0.6], life: P});
            fx.sys({
                tex: 'glow',
                mode: RenderMode.HorizontalBillBoard,
                life: P,
                size: 1.1,
                burst: [[0, 1]],
                color: SPORE[4],
                at: [0, 0.48, 0],
                parent: shroom,
                order: 3,
                look: {scalingMode: 'hierarchy'},
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [0, 0],
                            [0, 0.17],
                            [1, POP / P],
                            [0.3, (POP + 0.3) / P],
                            [0, 1],
                        ]
                    ),
                ],
            });
            for (let i = 0; i < 7; i++) {
                const a = (i / 7) * Math.PI * 2;
                // Pale spots sitting on the dome, high and low round it.
                const [r, h] = TOADSTOOL_CAP[i % 2 ? 4 : 6];
                const spot = fx.node('spot', [Math.cos(a) * r * 0.97, h, Math.sin(a) * r * 0.97], cap);
                spot.scaling.setAll(0.05 + (i % 3) * 0.012);
                solid(fx, spot, {geo: BALL, color: '#fff4e8', life: P});
            }
            // It squashes and puffs a lumpy cloud of glowing spores that billows up.
            fx.sys({
                tex: 'smoke',
                blend: 'alpha',
                loop: false,
                life: [1.4, 1.9],
                speed: [1, 2.2],
                size: [0.8, 1.3],
                rot: true,
                burst: [[POP + 0.05, 24]],
                color: [SPORE[3], SPORE[4]],
                alpha: 0.7,
                shape: new ConeEmitter({radius: 0.4, angle: 0.7, thickness: 1}),
                aim: 'up',
                at: [0, 0.75, 0],
                order: 5,
                b: [
                    tint([['#ffffff', 0]], fadeOut(0.5, 0.05)),
                    grow([0, 0.5], [0.3, 1.2], [1, 1.6]),
                    airDrag(2.5),
                    wobble(0.6, 0.3),
                ],
            });
            fx.sys({
                tex: 'glow',
                loop: false,
                life: 0.4,
                size: 2.6,
                burst: [[POP + 0.05, 1]],
                color: SPORE[5],
                at: [0, 1.2, 0],
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.2))],
            });
            // And drifts down twinkling.
            fx.sys({
                tex: 'glint',
                loop: false,
                life: [1.4, 2],
                speed: [0.6, 1.6],
                size: [0.07, 0.12],
                burst: [[POP + 0.1, 60]],
                color: [SPORE[5], '#ffffff'],
                shape: new ConeEmitter({radius: 0.4, angle: 0.8, thickness: 1}),
                aim: 'up',
                at: [0, 0.75, 0],
                order: 7,
                b: [tint([['#ffffff', 0]], flicker()), airDrag(2), gravity(0.25), wobble(0.8, 0.4)],
            });
            light(fx, {at: [0, 0.05, 0], size: 3, color: SPORE[3], floor: true, life: 2, alpha: 0.5, time: POP});
        },
    },
    {
        id: 'nature/thorns',
        name: 'Thorns',
        loop: false,
        period: 2.4,
        view: {distance: 12},
        build(fx) {
            const P = 2.4;
            const X0 = -2.6;
            const X1 = 2.4;
            // A seam racing along the floor.
            const head = fx.node('seam', [X0, 0.02, 0]);
            fx.every((t) => {
                head.position.x = X0 + (X1 - X0) * outCubic(between(t, 0, 0.6));
            });
            const seam = fx.sys({
                tex: 'glow',
                mode: RenderMode.HorizontalBillBoard,
                world: true,
                life: [1.6, 1.8],
                size: [0.3, 0.4],
                color: '#9ae04a',
                parent: head,
                order: 1,
                b: [tint([['#ffffff', 0]], fadeOut(0.6, 0.02))],
            });
            window(seam, P, 0, 0.6, 120);
            const N = 6;
            // Hooked like pixelfx's thorns: thick at the foot, the tip curling over toward the way the
            // seam ran.
            const geo = horn(0.45, 6, 0.16);
            for (let i = 0; i < N; i++) {
                const k = i / (N - 1);
                const x = X0 + 0.4 + k * (X1 - X0 - 0.6);
                const t0 = 0.12 + k * 0.42;
                const h = 0.5 + k * 1.1;
                const node = fx.node('thorn', [x, 0, i % 2 ? 0.2 : -0.15]);
                node.rotation.y = i % 2 ? 0.25 : -0.25;
                fx.every((t) => {
                    const up = outBack(between(t, t0, t0 + 0.14));
                    const sink = ease(between(t, 1.6 + k * 0.1, 2.0 + k * 0.1));
                    node.scaling.set(h * 1.3, Math.max(0.001, h * up * (1 - sink)), h * 1.3);
                });
                solid(fx, node, {geo, color: '#5a3a2a', rim: [0.4, 0.9, 0.3], life: P});
                // Each in a burst of dirt and green light.
                dust(fx, {
                    at: [x, 0.1, 0],
                    size: [0.3, 0.5],
                    life: [0.6, 0.9],
                    burst: [[t0, 5]],
                    speed: [0.8, 1.5],
                    shape: new ConeEmitter({radius: 0.2, angle: 0.6, thickness: 1}),
                    aim: 'up',
                    color: [EARTH[3], EARTH[4]],
                    alpha: 0.6,
                    loop: false,
                });
                clods(fx, {
                    count: 6,
                    color: [EARTH[2], EARTH[4]],
                    at: [x, 0.05, 0],
                    shape: new ConeEmitter({radius: 0.2, angle: 0.5, thickness: 1}),
                    aim: 'up',
                    speed: [1.5, 3],
                    size: [0.04, 0.08],
                    delay: t0,
                    life: [0.7, 1],
                });
                star(fx, {
                    at: [x, 0.3, 0.3],
                    size: 0.9 + k * 0.6,
                    life: 0.2,
                    time: t0,
                    tex: 'glow',
                    color: '#9ae04a',
                    ramp: [
                        ['#ffffff', 0],
                        ['#9ae04a', 1],
                    ],
                });
            }
        },
    },
    {
        id: 'nature/tornado',
        name: 'Tornado',
        loop: true,
        period: 2,
        view: {height: 1.7},
        build(fx) {
            // pixelfx's funnel at 3 cm a pixel: its axis snakes, a wave running up it (here round both
            // floor axes), and its radius flares at the top. It is cut into rings, each carried along
            // the wave, and is built of wind rather than a skin: thin bands wrapped round it, each
            // ring spinning at its own speed, over a faint translucent column.
            const D = 2;
            const PX = 0.03;
            const FH = 112 * PX;
            const N = 14;
            const C = ['#141221', '#231f33', '#36314a', '#4d4762', '#68617d', '#8a839e', '#b3adc4', '#e2def0'];
            const DUST = ['#2a2018', '#4e3e2e', '#76624a', '#a08a6a', '#cbb894'];
            const smooth = (a: number, b: number, x: number) => ease(Math.min(1, Math.max(0, (x - a) / (b - a))));
            const rad = (u: number) => (3 + 20 * Math.pow(u, 1.5) + 17 * smooth(0.78, 1, u) ** 2) * PX;
            const sway = (u: number, t: number): [number, number] => {
                const ph = (Math.PI * 2 * t) / D;
                return [
                    (8.5 * Math.sin(ph - 2.6 * u) * (0.2 + 0.8 * u) + 3 * Math.sin(2 * ph + 1.3 - 4.5 * u) * u) * PX,
                    6 * Math.cos(ph - 2.6 * u) * (0.2 + 0.8 * u) * PX,
                ];
            };
            const rings: Array<[TransformNode, number]> = [];
            for (let i = 0; i < N; i++) {
                const u0 = i / N;
                const u1 = (i + 1) / N;
                const um = (u0 + u1) / 2;
                const ring = fx.node('ring', [0, u0 * FH, 0]);
                rings.push([ring, u0]);
                const fade = Math.min(1, um * 8 + 0.25) * (1 - smooth(0.9, 1.02, um));
                // Rows spin two or three turns a loop; the faster ones shear past their neighbours.
                const turns = i % 3 === 1 ? 3 : 2;
                const dir = -1;
                const low = Math.max(0, 1 - um / 0.3) * 0.7;
                const column = lathe(
                    [u0, um, u1].map((u) => [rad(u), (u - u0) * FH] as [number, number]),
                    40
                );
                const body = {
                    geo: column,
                    image: 'noise' as const,
                    blend: 'alpha' as const,
                    loop: false,
                    life: 1e4,
                    size: 1,
                    burst: 1,
                    parent: ring,
                };
                const streaks = {
                    tiling: [3, 0.45] as [number, number],
                    offset: [i * 0.37, i * 0.45] as [number, number],
                    scroll: [dir * turns * 0.5 * 3, 0] as [number, number],
                };
                // The far wall, dim, seen through the near one.
                fx.sys({
                    ...body,
                    color: mixHex(C[2], DUST[1], low),
                    alpha: 0.3 * fade,
                    order: 1,
                    look: {renderFace: 'back', mapUV: streaks},
                });
                // The near wall, lit from the left like the original.
                fx.sys({
                    ...body,
                    color: mixHex(C[6], DUST[4], low),
                    alpha: 0.42 * fade,
                    order: 5,
                    look: {renderFace: 'front', lighting: 'fixed', mapUV: streaks},
                });
                // Wind bands: one pixel wide, bright at the head and fading along the tail.
                windBand(fx, {
                    radius: rad(um) * 1.04,
                    turns: (dir * turns) / D,
                    width: PX * 1.6,
                    rate: 8 * fade,
                    colors: i % 4 === 0 ? [C[3], C[6]] : [C[5], C[7]],
                    at: [0, (u1 - u0) * FH * 0.5, 0],
                    parent: ring,
                });
            }
            // The flared top: a lid of cloud sheared into flat bands riding round with the funnel, lit
            // along their upper rims, over a dark mass at its core; once a loop it lights up inside.
            const crown = fx.node('crown', [0, FH + 3 * PX, 0]);
            const R = rad(1);
            fx.sys({
                tex: 'smoke',
                blend: 'alpha',
                life: [0.9, 1.3],
                speed: [0.1, 0.3],
                size: [0.8, 1.3],
                rot: true,
                rate: 9,
                color: [C[1], C[3]],
                alpha: 0.6,
                shape: new CircleEmitter({radius: R * 0.7, thickness: 0.8}),
                rotate: [Math.PI / 2, 0, 0],
                parent: crown,
                order: 2,
                b: [orbit(2.5, [0, 0, 1]), tint([['#ffffff', 0]], fadeOut(0.5, 0.25)), grow([0, 0.7], [1, 1.2])],
            });
            fx.sys({
                geo: lathe(
                    [
                        [1, -0.05],
                        [1, 0.05],
                    ],
                    24,
                    2.4
                ),
                tex: 'comet',
                blend: 'alpha',
                life: [1.2, 1.8],
                size: [R * 0.4, R * 1.15],
                rate: 9,
                upright: true,
                color: [C[3], C[6]],
                shape: new SphereEmitter({radius: 0.12, thickness: 1}),
                parent: crown,
                order: 4,
                look: {renderFace: 'both', lighting: 'fixed'},
                b: [
                    turn([-Math.PI, -Math.PI * 2]),
                    tint(
                        [['#ffffff', 0]],
                        [
                            [0, 0],
                            [0.9, 0.2],
                            [0.9, 0.7],
                            [0, 1],
                        ]
                    ),
                ],
            });
            const FLASH = 1.24;
            fx.sys({
                tex: 'bolt',
                life: [0.06, 0.1],
                size: [0.9, 1.4],
                rot: true,
                burst: [
                    [FLASH, 2],
                    [FLASH + 0.14, 1],
                ],
                color: C[7],
                shape: new CircleEmitter({radius: R * 0.6, thickness: 0.6}),
                rotate: [Math.PI / 2, 0, 0],
                parent: crown,
                order: 6,
            });
            fx.sys({
                tex: 'glow',
                life: 0.12,
                size: R * 4,
                burst: [
                    [FLASH, 1],
                    [FLASH + 0.14, 1],
                ],
                color: C[7],
                alpha: 0.45,
                parent: crown,
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.1))],
            });
            fx.every((t) => {
                for (const [ring, u] of rings) {
                    const [x, z] = sway(u, t);
                    ring.position.x = x;
                    ring.position.z = z;
                }
                const [x, z] = sway(1, t);
                crown.position.x = x;
                crown.position.z = z;
            });
            // Leaves, twigs and pebbles spiral up round it and are flung off the top.
            leaves(fx, {
                at: [0, 0.1, 0],
                rate: 9,
                speed: [1.6, 2.1],
                life: [1.3, 1.9],
                size: [0.16, 0.24],
                colors: [LEAF[2], LEAF[6]],
                emitter: new ConeEmitter({radius: 0.35, angle: 0.3, thickness: 0.4}),
                aim: 'up',
                whirl: 6,
                weight: 0,
                loop: true,
                world: false,
            });
            fx.sys({
                mesh: 'rock',
                life: [1.2, 1.6],
                speed: [1.6, 2.1],
                size: [0.06, 0.1],
                rate: 5,
                tumble: 6,
                color: [DUST[1], DUST[3]],
                shape: new ConeEmitter({radius: 0.35, angle: 0.3, thickness: 0.4}),
                aim: 'up',
                order: 5,
                b: [orbit(6, [0, 0, 1]), grow([0, 1], [0.85, 1], [1, 0])],
            });
            // At its foot: dust boiling round and out, grit hopping, scuffs swept round the floor.
            dust(fx, {
                at: [0, 0.12, 0],
                size: [0.5, 0.9],
                life: [0.7, 1.3],
                rate: 26,
                speed: [0.6, 1.2],
                shape: new CircleEmitter({radius: 0.15, thickness: 1}),
                rotate: [Math.PI / 2, 0, 0],
                color: [DUST[2], DUST[3]],
                alpha: 0.7,
                loop: true,
            });
            fx.sys({
                tex: 'dot',
                world: true,
                life: [0.35, 0.6],
                speed: [1.2, 2],
                size: [0.03, 0.05],
                rate: 12,
                color: [DUST[3], DUST[4]],
                shape: new ConeEmitter({radius: 0.15, angle: 1.1}),
                aim: 'up',
                at: [0, 0.03, 0],
                order: 5,
                b: [gravity(9), floorBounce(0.2), tint([['#ffffff', 0]], popOut(0.6))],
            });
            fx.sys({
                geo: lathe(
                    [
                        [0.92, 0],
                        [1, 0],
                    ],
                    20,
                    1.1
                ),
                tex: 'comet',
                blend: 'alpha',
                life: [0.5, 0.8],
                size: [0.36, 0.84],
                rate: 5,
                upright: true,
                color: [DUST[2], DUST[3]],
                at: [0, 0.015, 0],
                order: 2,
                look: {renderFace: 'both'},
                b: [turn(-3 * Math.PI), tint([['#ffffff', 0]], fadeOut(0.4, 0.1))],
            });
            // A soft pale column of light and a cold pool at its foot.
            for (const [at, size, color, alpha, mode] of [
                [[0, FH * 0.5, 0], 3.2, C[5], 0.08, undefined],
                [[0, 0.02, 0], 2.4, DUST[3], 0.18, RenderMode.HorizontalBillBoard],
            ] as const) {
                fx.sys({
                    tex: 'glow',
                    mode,
                    loop: false,
                    life: 1e4,
                    size,
                    burst: 1,
                    color,
                    alpha,
                    at: [...at],
                    order: 1,
                });
            }
        },
    },
    {
        id: 'nature/toxic-puddle',
        name: 'Toxic puddle',
        loop: true,
        period: 4,
        build(fx) {
            const D = 4;
            const C = ['#06070a', '#0c100c', '#141a10', '#1e2814', '#2e3c18', '#5a7a1c', '#a6d42a', '#ecff86'];
            const SHEEN = ['#2a1648', '#5a2e8e', '#1e7a86', '#6adccc'];
            // A heavy lens of black tar with a wandering outline, not a disc: its lip glows chartreuse
            // where it meets the floor and the glow bleeds out over the floor round it.
            const tar = fx.node('tar', [0, 0.004, 0]);
            const pool = {geo: lens(PUDDLE, 0.12, {sx: 1.35}), loop: false, life: 1e4, size: 1, burst: 1, parent: tar};
            fx.sys({
                ...pool,
                tex: 'white',
                blend: 'alpha',
                color: C[1],
                order: 3,
                look: {lighting: 'fixed', rim: {color: [0.25, 0.42, 0.06], power: 3, strength: 1, mode: 'add'}},
            });
            // Veins of light under the crust, swelling brighter and dimmer in a slow pulse.
            fx.sys({
                ...pool,
                loop: true,
                life: D,
                tex: 'crack',
                blend: 'add',
                size: 1.004,
                color: C[6],
                order: 4,
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [0.45, 0],
                            [1, 0.5],
                            [0.45, 1],
                        ]
                    ),
                ],
            });
            // An oily violet and teal sheen sliding over its skin.
            for (const [color, scroll] of [
                [SHEEN[1], [0.03, 0.012]],
                [SHEEN[2], [-0.02, 0.025]],
            ] as const) {
                fx.sys({
                    ...pool,
                    image: 'noise',
                    blend: 'add',
                    size: 1.008,
                    color,
                    alpha: 0.25,
                    order: 5,
                    look: {mapUV: {tiling: [1.5, 1.5], scroll: [...scroll]}},
                });
            }
            fx.sys({
                ...pool,
                geo: outlineBand(PUDDLE, 0.98, 1.03, {sx: 1.35}),
                tex: 'white',
                blend: 'add',
                color: C[6],
                alpha: 0.75,
                at: [0, 0.006, 0],
                order: 2,
                look: {renderFace: 'both'},
            });
            fx.sys({
                ...pool,
                geo: outlineBand(PUDDLE, 1, 1.45, {sx: 1.35}),
                image: 'light-column',
                blend: 'add',
                color: C[6],
                alpha: 0.4,
                at: [0, 0.003, 0],
                order: 1,
                look: {renderFace: 'both'},
            });
            light(fx, {at: [0, 0.02, 0], size: 4.2, color: C[5], floor: true, life: D, alpha: 0.35, loop: true});
            // Fat bubbles dome up dark and glossy with light glowing through them, then pop in a ripple
            // and a spatter of tar, loosing a ribbon of vapour.
            const bubbles = fx.sys({
                geo: BALL,
                tex: 'white',
                blend: 'alpha',
                world: true,
                life: [1, 1.6],
                size: [0.17, 0.28],
                rate: 2,
                upright: true,
                color: C[2],
                shape: new CircleEmitter({radius: 0.75, thickness: 1}),
                rotate: [Math.PI / 2, 0, 0],
                at: [0, 0.08, 0],
                order: 4,
                look: {lighting: 'fixed', rim: {color: [0.65, 0.95, 0.2], power: 1.3, strength: 1.5, mode: 'add'}},
                b: [grow([0, 0.05], [0.7, 0.9], [1, 1.08])],
            });
            const ripple = fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                loop: false,
                life: 0.3,
                size: 0.9,
                burst: [[0, 1]],
                color: C[7],
                world: true,
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.1)), grow([0, 0.15], [1, 1])],
            });
            const flash = fx.sys({
                tex: 'glow',
                loop: false,
                life: 0.12,
                size: 0.8,
                burst: [[0, 1]],
                color: C[6],
                alpha: 0.8,
                world: true,
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.1))],
            });
            const spatter = fx.sys({
                tex: 'dot',
                loop: false,
                life: [0.35, 0.55],
                speed: [1.2, 2.2],
                size: [0.035, 0.05],
                burst: [[0, 7]],
                color: [C[2], C[6]],
                shape: new ConeEmitter({radius: 0.03, angle: 0.6}),
                aim: 'up',
                world: true,
                order: 6,
                b: [gravity(12), floorBounce(0, 0.05)],
            });
            const puff = vapour(fx, {rate: 0, burst: 1, life: [1.4, 2], world: true});
            for (const s of [ripple, flash, spatter, puff]) subEmit(bubbles, s);
            // A steady breath of vapour ribbons off the whole pool.
            vapour(fx, {rate: 2.4, life: [2.4, 3.2], radius: 0.95, at: [0, 0.07, 0]});
        },
    },
    {
        id: 'nature/vine-whip',
        name: 'Vine whip',
        loop: false,
        period: 1.4,
        view: {distance: 12},
        build(fx) {
            const P = 1.4;
            const CRACK = 0.55;
            const root: At = [-1.2, 0, 0];
            decal(fx, {
                at: [root[0], 0.015, 0],
                tex: 'crack',
                size: 1.2,
                color: EARTH[0],
                alpha: 0.9,
                life: P,
                alphas: fadeOut(0.85, 0.05),
            });
            // A thorny vine bursting up, rearing back coiled, then lashing out right.
            const SEG = 44;
            const segs = chain(fx, SEG, {color: LEAF[2], rim: [0.4, 0.9, 0.3], life: P, tube: true});
            const tip = fx.node('tip', [0, 0, 0]);
            fx.every((t) => {
                const rise = outCubic(between(t, 0, 0.25));
                const lash = between(t, 0.38, CRACK);
                const back = ease(between(t, 0.85, 1.3));
                const len = 2.8 * rise * (1 - back);
                // Curl: reared back (leaning left, coiled) to whipped out flat to the right.
                const lean = -0.9 + lash * lash * 2.6 - Math.max(0, between(t, CRACK, 0.75)) * 0.5 * (1 - lash * 0);
                const curl = (1 - lash) * 2.4 + 0.3;
                let x = root[0];
                let y = 0;
                let a = Math.PI / 2 - lean * 0.2;
                const step = len / SEG;
                for (let i = 0; i < SEG; i++) {
                    const s = i / (SEG - 1);
                    segs[i].position.set(x, y, 0);
                    segs[i].scaling.setAll(len > 0.05 ? 0.12 * (1 - s * 0.7) : 0.001);
                    a -= ((lean + curl * s) / SEG) * 1.2;
                    x += Math.cos(a) * step;
                    y = Math.max(0.05, y + Math.sin(a) * step);
                }
                tip.position.set(x, y, 0);
            });
            tube(fx, segs);
            // The crack: sap sprays and leaves tear off.
            star(fx, {
                at: [0, 0, 0.2],
                size: 1.6,
                life: 0.15,
                time: CRACK,
                tex: 'burst',
                parent: tip,
                ramp: [
                    ['#ffffff', 0],
                    ['#dcffb4', 1],
                ],
            });
            fx.sys({
                tex: 'dot',
                world: true,
                loop: false,
                life: [0.4, 0.7],
                speed: [2, 4],
                size: [0.04, 0.07],
                burst: [[CRACK, 24]],
                color: ['#a0e46c', '#dcffb4'],
                shape: new SphereEmitter({radius: 0.1, thickness: 1}),
                parent: tip,
                order: 6,
                b: [gravity(8), tint([['#ffffff', 0]], popOut(0.5))],
            });
            leaves(fx, {
                at: [0, 0, 0],
                count: 8,
                time: CRACK,
                speed: [1.5, 3],
                life: [0.8, 1.1],
                colors: [LEAF[3], LEAF[4]],
                parent: tip,
            });
            wedges(fx, CRACK, tip);
        },
    },
];

/** A comic crack flash at the whip's tip. */
function wedges(fx: FxBuilder, time: number, tip: TransformNode) {
    fx.sys({
        tex: 'wedge',
        mode: RenderMode.StretchedBillBoard,
        stretch: {speed: 0, length: 3},
        loop: false,
        life: [0.1, 0.16],
        speed: -0.4,
        size: [0.06, 0.09],
        burst: [[time, 7]],
        color: '#ffffff',
        shape: new CircleEmitter({radius: 0.5, thickness: 0}),
        parent: tip,
        order: 7,
        b: [grow([0, 0], [0.3, 1], [1, 0])],
    });
}
