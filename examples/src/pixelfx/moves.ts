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
    popOut,
    spike,
    spin,
    teleported,
    tint,
    type Geometry,
} from './kit';
import {clods, dust, gate, hotSparks, type At} from './parts';
import {PALETTE, arcs, debris, decal, flames, flash, shockwave, smoke, sparks, type Ramp} from './recipes';
import {hero} from './spawn';
import {type FxBuilder, type FxDef} from './stage';

const GOLD = ['#2a1604', '#5e3208', '#a05c0c', '#e09414', '#ffc626', '#ffe866', '#fff8c4', '#ffffff'];
const ICE = ['#151a3d', '#212f6b', '#2c58aa', '#3a8bd8', '#62c8f4', '#a6ecff', '#dcfbff', '#ffffff'];
const VOLT = ['#0a0a2a', '#1a2a6a', '#2a4fd0', '#5a9aff', '#a8d8ff', '#e8f6ff', '#ffffff'];
const ARC = ['#140a24', '#2c1250', '#4b1d86', '#7330c0', '#a050f0', '#c890ff', '#ecd4ff', '#ffffff'];
const STONE = ['#16141c', '#2a2733', '#433f4d', '#5f5a6a', '#7d7889', '#a29dab', '#cdc8d2'];
const STEEL = '#c8d0e0';
const WOOD = '#7a4a22';
const SKIN = '#e8b890';
const FOE = '#a88478';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const easeIn = (x: number) => x ** 3;
const HIDE = 1e-4;

/** The caster on the left and the target on the right, `GAP` apart. */
const GAP = 4.4;
const LEFT = -GAP / 2;
const RIGHT = GAP / 2;
const VIEW = {height: 1.2, distance: 8};

export const SPHERE = lathe(
    Array.from({length: 11}, (_, i) => {
        const a = -Math.PI / 2 + (i / 10) * Math.PI;
        return [Math.max(0.001, Math.cos(a) * 0.5), Math.sin(a) * 0.5] as [number, number];
    }),
    16
);
const ROD = lathe(
    [
        [0.001, 0],
        [0.5, 0],
        [0.5, 1],
        [0.001, 1],
    ],
    12
);
const CONE = lathe(
    [
        [0.001, 0],
        [0.5, 0],
        [0.001, 1],
    ],
    12
);

/** A solid, lit shape riding `parent`, for the length of the move. */
export function solid(
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
        size?: number;
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
            renderFace: 'both',
            rim: o.rim ? {color: o.rim, power: 2, strength: 1, mode: 'add'} : undefined,
        },
    });
}

/** A node at `at` under `parent`, scaled per axis and turned, for a limb or a prop. */
export function part(
    fx: FxBuilder,
    parent: TransformNode,
    at: At,
    s: [number, number, number],
    rot: At = [0, 0, 0]
): TransformNode {
    const node = fx.node('part', at, parent);
    node.scaling.set(...s);
    node.rotation.set(...rot);
    return node;
}

export interface Actor {
    /** Where the actor stands; move it to step, dash or fly. */
    root: TransformNode;
    /** The body, under the root: lean it, squash it. */
    body: TransformNode;
    /** The leading hand, under the root: raise it, swing it, put a prop in it. */
    hand: TransformNode;
    /** Which way the actor faces along x. */
    face: 1 | -1;
}

/** A stand-in character: the lit capsule, a hand that can hold a prop, facing `face` along x. */
export function actor(fx: FxBuilder, period: number, x: number, face: 1 | -1, color = '#8a8fa8'): Actor {
    const root = fx.node('actor', [x, 0, 0]);
    const body = fx.node('body', [0, 0, 0], root);
    hero(fx, {period, parent: body, color});
    const hand = fx.node('hand', [face * 0.42, 1.15, 0.12], root);
    solid(fx, part(fx, hand, [0, 0, 0], [0.16, 0.16, 0.16]), SPHERE, SKIN, {life: period});
    return {root, body, hand, face};
}

/** A flash of `color` over a body, peaking at each of `times` (seconds). */
export function hitFlash(
    fx: FxBuilder,
    a: Actor,
    period: number,
    times: number[],
    color = '#ffffff',
    peak = 0.8,
    hold = 0.18
) {
    const keys: Array<[number, number]> = [[0, 0]];
    for (const time of times) {
        keys.push(
            [0, Math.max(0.0001, (time - 0.001) / period)],
            [peak, (time + 0.02) / period],
            [0, Math.min(0.9999, (time + hold) / period)]
        );
    }
    keys.push([0, 1]);
    keys.sort((p, q) => p[1] - q[1]);
    hero(fx, {period, parent: a.body, blend: 'add', color, lighting: 'unlit', order: 4, fade: keys});
}

/** A darker skin over a body from `time` on, for a charred or iced target. */
function stain(fx: FxBuilder, a: Actor, period: number, time: number, color: string, alpha = 0.85, until = period) {
    hero(fx, {
        period,
        parent: a.body,
        color,
        order: 4,
        fade: [
            [0, 0],
            [0, time / period],
            [alpha, (time + 0.1) / period],
            [alpha, Math.max((time + 0.1) / period, (until - 0.3) / period)],
            [0, until / period],
            [0, 1],
        ],
    });
}

/** Knockback: each hit at `time` shoves the actor `push` along x and tips it, settling back. */
export function reel(a: Actor, t: number, hits: Array<[number, number]>, base: number) {
    let dx = 0;
    let tilt = 0;
    for (const [time, push] of hits) {
        if (t < time) continue;
        const k = t - time;
        const out = Math.exp(-k * 5) * Math.sin(Math.min(k * 14, Math.PI / 2));
        dx += push * out;
        tilt += push * 0.4 * Math.exp(-k * 7) * Math.sin(k * 30 + 0.5);
    }
    a.root.position.x = base + dx;
    a.body.rotation.z = -tilt;
}

/** A point on the arc from `a` to `b` at `k` (0 to 1), `lift` higher at the middle. */
function arcPoint(a: At, b: At, k: number, lift: number): At {
    return [
        a[0] + (b[0] - a[0]) * k,
        a[1] + (b[1] - a[1]) * k + Math.sin(k * Math.PI) * lift,
        a[2] + (b[2] - a[2]) * k,
    ];
}

/** A node flying from `a` to `b` between `t0` and `t1`, hidden before and after. */
function flier(fx: FxBuilder, a: At, b: At, t0: number, t1: number, lift = 0, ease = (k: number) => k): TransformNode {
    const node = fx.node('flier', a);
    let last = 0;
    fx.every((t) => {
        const k = ease(span(t, t0, t1));
        node.position.set(...arcPoint(a, b, k, lift));
        // Back from the target to the start on a new loop: a jump, not a flight to fill with particles.
        if (t < last) teleported(node);
        last = t;
        node.scaling.setAll(t >= t0 && t <= t1 ? 1 : HIDE);
    });
    return node;
}

/** A glowing streak behind a moving node: world-space glow dots laid along its path. */
function streak(fx: FxBuilder, node: TransformNode, color: string, size = 0.2, life = 0.25, perMetre = 30) {
    return fx.sys({
        tex: 'glow',
        blend: 'add',
        world: true,
        life,
        size,
        rateOverDistance: perMetre,
        color,
        parent: node,
        order: 5,
        b: [tint([['#ffffff', 0]], fadeOut(0.1, 0)), grow([0, 1], [1, 0.2])],
    });
}

/** Cracks spreading on the floor at `at`. */
function cracks(fx: FxBuilder, at: At, size: number, time: number, life = 1.6) {
    decal(fx, {
        tex: 'crack',
        at: [at[0], 0.014, at[2]],
        size,
        color: '#120e14',
        alpha: 0.9,
        life,
        delay: time,
        rot: true,
        alphas: fadeOut(0.7, 0.02),
    });
}

const TARGET_HITS: Ramp = [
    ['#ffffff', 0],
    ['#ffe0a0', 0.3],
    ['#ff8a2a', 1],
];

export const moves: FxDef[] = [
    {
        id: 'moves/arrow-shot',
        name: 'Arrow Shot',
        loop: false,
        period: 1.9,
        view: VIEW,
        build(fx) {
            const P = 1.9;
            const LOOSE = 1.0;
            const HIT = 1.22;
            const me = actor(fx, P, LEFT, 1);
            const foe = actor(fx, P, RIGHT, -1, FOE);
            // The bow: a curved stave and a string that draws back.
            const bow = fx.node('bow', [0.05, 0, 0], me.hand);
            const stave = Array.from({length: 13}, (_, i) => {
                const a = -1 + (i / 12) * 2;
                return [Math.cos(a) * 0.55 - 0.45, Math.sin(a) * 0.55] as [number, number];
            });
            const outline = [...stave, ...stave.map(([x, y]) => [x + 0.05, y * 0.98] as [number, number]).reverse()];
            solid(fx, bow, extrude(outline, 0.05), WOOD, {life: P, rim: [1, 0.8, 0.5]});
            const nock = fx.node('nock', [0.03, 0, 0], bow);
            for (const end of [1, -1]) {
                const s = fx.node('string', [0, 0, 0], nock);
                const piece = part(fx, s, [0, 0, 0], [0.012, 0.47, 0.012]);
                solid(fx, piece, ROD, '#e8e0d0', {life: P, lit: false});
                fx.every(() => {
                    // From the bow's tip to the nock.
                    const tipX = Math.cos(1) * 0.55 - 0.45 + 0.03 - nock.position.x;
                    const tipY = end * Math.sin(1) * 0.55;
                    s.rotation.z = Math.atan2(tipY, tipX) - Math.PI / 2;
                    piece.scaling.y = Math.hypot(tipX, tipY);
                });
            }
            // The arrow: on the string until loosed, then across the floor and into the target.
            const ARROW = (parent: TransformNode) => {
                solid(fx, part(fx, parent, [-0.5, 0, 0], [0.025, 0.85, 0.025], [0, 0, -Math.PI / 2]), ROD, '#c8a070', {
                    life: P,
                });
                solid(fx, part(fx, parent, [0.35, 0, 0], [0.07, 0.14, 0.07], [0, 0, -Math.PI / 2]), CONE, STEEL, {
                    life: P,
                    rim: [1, 1, 1],
                });
                solid(
                    fx,
                    parent,
                    extrude(
                        [
                            [-0.5, 0],
                            [-0.36, 0],
                            [-0.42, 0.07],
                            [-0.55, 0.07],
                        ],
                        0.01
                    ),
                    '#e04040',
                    {life: P}
                );
            };
            const nocked = fx.node('nocked', [0.45, 0, 0], nock);
            ARROW(nocked);
            const from: At = [LEFT + 0.9, 1.15, 0.12];
            const to: At = [RIGHT - 0.3, 1.2, 0.12];
            const flying = flier(fx, from, to, LOOSE, HIT, 0.15);
            ARROW(flying);
            streak(fx, flying, '#fff0c0', 0.12, 0.2, 40);
            const stuck = fx.node('stuck', [RIGHT - 0.35, 1.2, 0.12]);
            ARROW(stuck);
            sparks(fx, {
                at: [RIGHT - 0.35, 1.2, 0.2],
                time: HIT,
                count: 10,
                speed: [2, 4],
                size: [0.03, 0.05],
                gravity: 8,
            });
            dust(fx, {
                at: [RIGHT - 0.3, 1.2, 0.2],
                size: [0.3, 0.5],
                life: [0.4, 0.6],
                burst: [[HIT, 4]],
                speed: [0.5, 1.2],
                color: '#a09080',
                alpha: 0.5,
                shape: new SphereEmitter({radius: 0.1, thickness: 1}),
            });
            hitFlash(fx, foe, P, [HIT], '#ffffff', 0.6);
            fx.every((t) => {
                // Raise, draw to the cheek, hold, loose; the string snaps forward.
                const raise = easeOut(span(t, 0, 0.3));
                me.hand.position.set(0.42 + raise * 0.2, 1.0 + raise * 0.4, 0.12);
                const draw = easeOut(span(t, 0.3, 0.8));
                const snap = t > LOOSE ? Math.exp(-(t - LOOSE) * 18) * Math.cos((t - LOOSE) * 50) : 0;
                nock.position.x = t < LOOSE ? -0.42 * draw : -0.42 * snap * 0.3;
                nocked.scaling.setAll(t < LOOSE && t > 0.25 ? 1 : HIDE);
                stuck.scaling.setAll(t >= HIT ? 1 : HIDE);
                stuck.rotation.z = t >= HIT ? Math.sin((t - HIT) * 40) * 0.12 * Math.exp(-(t - HIT) * 6) : 0;
                me.body.rotation.z = -0.05 * draw;
                reel(foe, t, [[HIT, 0.25]], RIGHT);
                stuck.position.x = foe.root.position.x - 0.35;
            });
        },
    },
    {
        id: 'moves/dash-strike',
        name: 'Dash Strike',
        loop: false,
        period: 2.3,
        view: VIEW,
        build(fx) {
            const P = 2.3;
            const GO = 0.35;
            const ARRIVE = 0.5;
            const CUT = 0.55;
            const BACK = 1.3;
            const me = actor(fx, P, LEFT, 1);
            const foe = actor(fx, P, RIGHT, -1, FOE);
            const blade = fx.node('blade', [0, 0, 0], me.hand);
            solid(
                fx,
                blade,
                extrude(
                    [
                        [0, -0.03],
                        [0.9, -0.03],
                        [1.0, 0],
                        [0.9, 0.03],
                        [0, 0.03],
                    ],
                    0.02
                ),
                STEEL,
                {life: P, rim: [0.8, 0.9, 1]}
            );
            // After-images left along the dash.
            for (let i = 0; i < 4; i++) {
                const k = (i + 0.5) / 4;
                const ghost = fx.node('ghost', [LEFT + (RIGHT - 1 - LEFT) * k, 0, 0]);
                hero(fx, {
                    period: P,
                    parent: ghost,
                    blend: 'add',
                    color: '#2f6f9a',
                    lighting: 'unlit',
                    order: 3,
                    fade: [
                        [0, 0],
                        [0, (GO + k * 0.15) / P],
                        [0.5, (GO + k * 0.15 + 0.02) / P],
                        [0, (GO + k * 0.15 + 0.35) / P],
                        [0, 1],
                    ],
                });
            }
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.6, length: 1},
                life: 0.25,
                speed: [10, 16],
                size: [0.02, 0.04],
                burst: [[GO, 20]],
                color: '#cfeaff',
                shape: new ConeEmitter({radius: 0.6, angle: 0.02, thickness: 1}),
                aim: 'right',
                at: [LEFT, 1, 0],
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.4))],
            });
            // The cut: a slash of light, a critical burst, sparks.
            const S: At = [RIGHT - 0.1, 1.2, 0.3];
            const slash = fx.sys({
                tex: 'smear',
                blend: 'add',
                life: 0.2,
                size: 1,
                burst: [[CUT, 1]],
                rot: -0.6,
                color: '#ffffff',
                at: S,
                order: 8,
                b: [tint([['#ffffff', 0]], popOut(0.3))],
            });
            slash.startSize = new Vector3Function(new ConstantValue(2.6), new ConstantValue(0.9), new ConstantValue(1));
            flash(fx, {at: S, size: 3, time: CUT, color: '#fff3a6'});
            fx.sys({
                tex: 'burst',
                blend: 'add',
                life: 0.3,
                size: 2.2,
                burst: [[CUT + 0.02, 1]],
                color: '#ffc23d',
                at: S,
                order: 8,
                b: [tint(TARGET_HITS, popOut(0.3)), grow([0, 0.4], [0.3, 1], [1, 1.1])],
            });
            sparks(fx, {at: S, time: CUT, count: 30, speed: [4, 8], gravity: 7});
            hitFlash(fx, foe, P, [CUT], '#ffffff', 0.9);
            dust(fx, {
                at: [LEFT, 0.1, 0],
                size: [0.3, 0.6],
                life: [0.4, 0.7],
                burst: [[GO, 8]],
                speed: [0.5, 1.5],
                color: '#8a8070',
                alpha: 0.5,
                shape: new SphereEmitter({radius: 0.3, thickness: 1}),
            });
            fx.every((t) => {
                // Crouch, blur across, cut, a beat, hop back home.
                const crouch = Math.sin(span(t, 0, GO) * Math.PI * 0.5) * (t < GO ? 1 : 0);
                const dash = easeOut(span(t, GO, ARRIVE));
                const back = span(t, BACK, BACK + 0.45);
                const end = RIGHT - 1.0;
                const x = LEFT + (end - LEFT) * dash - (end - LEFT) * easeOut(back);
                me.root.position.set(x, Math.sin(back * Math.PI) * 0.8, 0);
                me.body.scaling.set(1 + crouch * 0.12, 1 - crouch * 0.2, 1);
                me.body.rotation.z = -(t > GO && t < ARRIVE ? 0.35 : crouch * 0.2);
                me.root.scaling.setAll(t > GO + 0.02 && t < ARRIVE - 0.03 ? 0.3 : 1);
                const swing = span(t, ARRIVE, CUT + 0.08);
                blade.rotation.z = 1.6 - swing * 2.8;
                me.hand.position.set(0.42, 1.15 + (1 - swing) * 0.3, 0.12);
                reel(foe, t, [[CUT, 0.4]], RIGHT);
            });
        },
    },
    {
        id: 'moves/earth-stomp',
        name: 'Earth Stomp',
        loop: false,
        period: 3.2,
        view: VIEW,
        build(fx) {
            const P = 3.2;
            const STOMP = 0.5;
            const RISE = 1.0;
            const me = actor(fx, P, LEFT, 1);
            const foe = actor(fx, P, RIGHT, -1, FOE);
            const knee = fx.node('knee', [0.12, 0.35, 0.15], me.root);
            solid(fx, part(fx, knee, [0, 0, 0], [0.24, 0.34, 0.24]), SPHERE, '#b8c0e0', {life: P, rim: [0.6, 0.7, 1]});
            dust(fx, {
                at: [LEFT + 0.2, 0.1, 0],
                size: [0.5, 0.8],
                life: [0.6, 1],
                burst: [[STOMP, 10]],
                speed: [1, 2.5],
                color: '#8a7a68',
                shape: new CircleEmitter({radius: 0.3, thickness: 1}),
                rotate: [Math.PI / 2, 0, 0],
            });
            shockwave(fx, {at: [LEFT + 0.2, 0.04, 0], size: 2.4, life: 0.4, color: '#c8b090', delay: STOMP});
            cracks(fx, [LEFT + 0.3, 0, 0], 1.6, STOMP, 2.4);
            // The heave running along the floor to the target, kicking up clods.
            for (let i = 0; i < 6; i++) {
                const k = (i + 1) / 7;
                const x = LEFT + 0.3 + (RIGHT - LEFT - 0.3) * k;
                const time = STOMP + (RISE - STOMP) * k;
                clods(fx, {
                    at: [x, 0.05, 0],
                    count: 4,
                    delay: time,
                    speed: [1.5, 3],
                    color: ['#5a4a3a', '#7a6650'],
                    shape: new ConeEmitter({radius: 0.15, angle: 0.4, thickness: 1}),
                    aim: 'up',
                });
                cracks(fx, [x, 0, 0], 0.9, time, 2.2);
            }
            // The spike ramming up under the target, and crumbling.
            const spikeNode = fx.node('spike', [RIGHT, 0, 0]);
            solid(fx, part(fx, spikeNode, [0, 0, 0], [1.9, 1.9, 1.9]), spike(0.08, 5), STONE[4], {
                life: P,
                rim: [0.8, 0.7, 0.6],
            });
            solid(fx, part(fx, spikeNode, [0.22, 0, 0.18], [1, 0.9, 1], [0, 1, 0]), spike(-0.2, 4), STONE[3], {
                life: P,
                rim: [0.8, 0.7, 0.6],
            });
            debris(fx, {at: [RIGHT, 0.1, 0], count: 18, speed: [3, 6], color: [STONE[3], STONE[5]], delay: RISE});
            debris(fx, {
                at: [RIGHT, 1.2, 0],
                count: 14,
                speed: [1, 2],
                size: [0.15, 0.3],
                color: [STONE[3], STONE[5]],
                delay: 2.6,
                shape: new SphereEmitter({radius: 0.5, thickness: 1}),
            });
            dust(fx, {
                at: [RIGHT, 0.2, 0],
                size: [0.6, 1],
                life: [0.8, 1.2],
                burst: [[RISE, 14]],
                speed: [1.5, 3],
                color: '#8a7a68',
                shape: new CircleEmitter({radius: 0.4, thickness: 1}),
                rotate: [Math.PI / 2, 0, 0],
            });
            hitFlash(fx, foe, P, [RISE], '#ffe0a0', 0.6);
            fx.every((t) => {
                // A knee up, the boot down.
                const lift = Math.sin(span(t, 0.05, STOMP) * Math.PI * 0.8);
                knee.position.y = 0.35 + (t < STOMP ? lift * 0.55 : 0);
                me.body.rotation.z = t < STOMP ? 0.12 * lift : 0;
                const jolt = t > STOMP ? Math.exp(-(t - STOMP) * 12) : 0;
                me.body.scaling.set(1 + jolt * 0.1, 1 - jolt * 0.12, 1);
                const rise = easeOut(span(t, RISE, RISE + 0.12));
                const crumble = easeIn(span(t, 2.6, 3.0));
                spikeNode.scaling.set(1, Math.max(HIDE, rise * (1 - crumble)), 1);
                // The target thrown up off the spike and landing beside it.
                const air = span(t, RISE, RISE + 0.9);
                foe.root.position.set(RIGHT + air * 1.3, Math.sin(air * Math.PI) * 1.8 * (air < 1 ? 1 : 0), 0);
                foe.body.rotation.z = -Math.sin(air * Math.PI) * 0.8;
            });
        },
    },
    {
        id: 'moves/fireball-throw',
        name: 'Fireball Throw',
        loop: false,
        period: 3.6,
        view: VIEW,
        build(fx) {
            const P = 3.6;
            const THROW = 1.0;
            const HIT = 1.55;
            const me = actor(fx, P, LEFT, 1);
            const foe = actor(fx, P, RIGHT, -1, FOE);
            // Fire gathering in the hand.
            const charge = flames(fx, {
                parent: me.hand,
                radius: 0.08,
                height: 0.3,
                size: [0.14, 0.24],
                rate: 30,
                order: 6,
            });
            gate(charge, P, 0.1, THROW, 30);
            const gather = fx.sys({
                tex: 'dot',
                blend: 'add',
                life: 0.3,
                speed: -2.5,
                size: [0.04, 0.07],
                rate: 40,
                color: ['#ffc23d', '#fff3a6'],
                shape: new SphereEmitter({radius: 0.7, thickness: 0.1}),
                parent: me.hand,
                order: 7,
                b: [tint([['#ffffff', 0]], fadeOut(0.6, 0.2))],
            });
            gate(gather, P, 0.1, THROW - 0.1, 40);
            const from: At = [LEFT + 0.6, 1.5, 0.15];
            const to: At = [RIGHT, 1.1, 0.1];
            const ball = flier(fx, from, to, THROW, HIT, 0.5);
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: P,
                look: {scalingMode: 'hierarchy'},
                size: 1.1,
                burst: [[0, 1]],
                color: '#ff8a2a',
                parent: ball,
                order: 6,
            });
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: P,
                look: {scalingMode: 'hierarchy'},
                size: 0.45,
                burst: [[0, 1]],
                color: '#fff3a6',
                parent: ball,
                order: 7,
            });
            fx.sys({
                tex: 'flame',
                blend: 'add',
                world: true,
                life: [0.25, 0.4],
                size: [0.35, 0.55],
                rateOverDistance: 24,
                color: ['#ffc23d', '#f2561d'],
                shape: new SphereEmitter({radius: 0.1, thickness: 1}),
                parent: ball,
                order: 5,
                b: [tint(PALETTE.fire, fadeOut(0.2, 0)), grow([0, 1], [1, 0.3]), gravity(-1)],
            });
            const trailSmoke = smoke(fx, {
                at: [0, 0, 0],
                parent: ball,
                rate: 12,
                size: [0.3, 0.5],
                world: true,
                color: '#3a3034',
                alpha: 0.4,
                life: [0.6, 0.9],
            });
            gate(trailSmoke, P, THROW, HIT, 12);
            // The blast.
            flash(fx, {at: [RIGHT, 1.2, 0.3], size: 5, time: HIT, color: '#fff3a6'});
            flames(fx, {
                at: [RIGHT, 1.0, 0],
                radius: 0.6,
                height: 1.6,
                size: [0.6, 1],
                burst: [[HIT, 26]],
                puff: true,
                loop: false,
                order: 6,
            });
            shockwave(fx, {at: [RIGHT, 0.04, 0], size: 4, life: 0.5, color: '#ffc23d', delay: HIT});
            hotSparks(fx, {
                at: [RIGHT, 1.1, 0],
                count: 30,
                time: HIT,
                speed: [3, 7],
                shape: new SphereEmitter({radius: 0.3, thickness: 1}),
            });
            smoke(fx, {
                at: [RIGHT, 1.2, 0],
                burst: [[HIT + 0.1, 12]],
                size: [0.7, 1.2],
                speed: [0.5, 1.4],
                color: '#2a2226',
                alpha: 0.7,
                life: [1.4, 2],
                loop: false,
            });
            const after = smoke(fx, {
                at: [RIGHT, 1.4, 0],
                rate: 4,
                size: [0.3, 0.5],
                speed: [0.4, 0.7],
                color: '#2a2226',
                alpha: 0.5,
                life: [1, 1.4],
            });
            gate(after, P, HIT + 0.4, P - 0.2, 4);
            decal(fx, {
                tex: 'glow',
                at: [RIGHT, 0.014, 0],
                size: 2.6,
                color: '#140a08',
                alpha: 0.8,
                life: P - HIT,
                delay: HIT,
            });
            hitFlash(fx, foe, P, [HIT], '#fff3a6', 1);
            stain(fx, foe, P, HIT + 0.1, '#2a1a18', 0.9);
            fx.every((t) => {
                // Gather, lean back, hurl.
                const back = easeOut(span(t, 0.6, THROW));
                const hurl = easeOut(span(t, THROW, THROW + 0.15));
                me.body.rotation.z = 0.2 * back - 0.35 * hurl * (1 - span(t, THROW + 0.3, THROW + 0.8));
                me.hand.position.set(0.42 - back * 0.5 + hurl * 0.8, 1.15 + back * 0.4 - hurl * 0.2, 0.15);
                reel(foe, t, [[HIT, 0.5]], RIGHT);
            });
        },
    },
    {
        id: 'moves/ground-pound',
        name: 'Ground Pound',
        loop: false,
        period: 3.4,
        view: {height: 1.6, distance: 9},
        build(fx) {
            const P = 3.4;
            const JUMP = 0.35;
            const LAND = 1.25;
            const me = actor(fx, P, LEFT, 1);
            const foe = actor(fx, P, RIGHT, -1, FOE);
            const at: At = [0.2, 0, 0];
            flash(fx, {at: [at[0], 0.4, 0.3], size: 3, time: LAND, color: '#fff0c8'});
            cracks(fx, at, 3, LAND, 2.2);
            for (const [delay, size, color] of [
                [0, 5, '#ffe0a0'],
                [0.12, 7, '#d8c0a0'],
                [0.24, 9, '#a89070'],
            ] as Array<[number, number, string]>) {
                shockwave(fx, {at: [at[0], 0.05, 0], size, life: 0.6, color, delay: LAND + delay});
            }
            debris(fx, {at: [at[0], 0.1, 0], count: 22, speed: [4, 7], color: ['#5a4a3a', '#7a6650'], delay: LAND});
            dust(fx, {
                at: [at[0], 0.15, 0],
                size: [0.6, 1.1],
                life: [0.9, 1.4],
                burst: [[LAND, 18]],
                speed: [2, 4],
                color: '#8a7a68',
                shape: new CircleEmitter({radius: 0.5, thickness: 1}),
                rotate: [Math.PI / 2, 0, 0],
            });
            hotSparks(fx, {
                at: [at[0], 0.2, 0],
                count: 26,
                time: LAND,
                speed: [3, 7],
                shape: new ConeEmitter({radius: 0.3, angle: 1, thickness: 1}),
                aim: 'up',
            });
            const passes = LAND + (RIGHT - at[0]) / 6;
            hitFlash(fx, foe, P, [passes], '#ffe0a0', 0.5);
            fx.every((t) => {
                // Coil, leap out of the frame, hang, drop like a rock.
                const coil = Math.sin(span(t, 0, JUMP) * Math.PI * 0.5) * (t < JUMP ? 1 : 0);
                const up = easeOut(span(t, JUMP, 0.75));
                const down = easeIn(span(t, 1.05, LAND));
                const x = LEFT + (at[0] - LEFT) * span(t, JUMP, LAND);
                const y = up * 4.5 * (1 - down);
                me.root.position.set(x, y, 0);
                const land = t > LAND ? Math.exp(-(t - LAND) * 10) : 0;
                me.body.scaling.set(
                    1 + coil * 0.15 + land * 0.25,
                    1 - coil * 0.25 - land * 0.3 + (t > JUMP && t < LAND ? 0.15 : 0),
                    1
                );
                me.body.rotation.z = -Math.PI * 2 * span(t, JUMP, 1.05); // One full flip over the top.
                // Thrown about as the shock wave passes.
                const air = span(t, passes, passes + 0.6);
                foe.root.position.set(RIGHT + air * 0.6, Math.sin(air * Math.PI) * 0.9 * (air < 1 ? 1 : 0), 0);
                foe.body.rotation.z = -Math.sin(air * Math.PI) * 0.5;
            });
        },
    },
    {
        id: 'moves/holy-smite',
        name: 'Holy Smite',
        loop: false,
        period: 2.8,
        view: {height: 1.8, distance: 9},
        build(fx) {
            const P = 2.8;
            const MARK = 0.4;
            const SMITE = 1.0;
            const me = actor(fx, P, LEFT, 1);
            const foe = actor(fx, P, RIGHT, -1, FOE);
            const other = fx.node('hand2', [-0.42, 1.15, 0.12], me.root);
            solid(fx, part(fx, other, [0, 0, 0], [0.16, 0.16, 0.16]), SPHERE, SKIN, {life: P});
            const gather = fx.sys({
                tex: 'glow',
                blend: 'add',
                life: 0.1,
                size: 0.6,
                rate: 30,
                color: GOLD[5],
                parent: me.hand,
                order: 6,
            });
            gate(gather, P, 0.2, SMITE, 30);
            // A glint marks the target.
            fx.sys({
                tex: 'glint',
                blend: 'add',
                life: 0.7,
                size: 1,
                burst: [[MARK, 1]],
                color: '#ffffff',
                at: [RIGHT, 2.6, 0.2],
                order: 8,
                b: [tint([['#ffffff', 0]], popOut(0.4)), spin(2)],
            });
            decal(fx, {
                tex: 'rune',
                at: [RIGHT, 0.014, 0],
                size: 2,
                color: GOLD[5],
                alpha: 0.8,
                life: SMITE - MARK + 0.3,
                delay: MARK,
                blend: 'add',
                alphas: popOut(0.3),
            });
            // The bolt: a hammer of light dropping from the sky.
            const hammer = fx.node('hammer', [RIGHT, 8, 0]);
            for (const [w, c, a] of [
                [1.4, GOLD[5], 0.6],
                [0.5, '#ffffff', 1],
            ] as Array<[number, string, number]>) {
                const beam = fx.sys({
                    tex: 'streak',
                    blend: 'add',
                    life: 0.6,
                    size: 1,
                    burst: [[SMITE, 1]],
                    rot: Math.PI / 2,
                    color: c,
                    alpha: a,
                    parent: hammer,
                    order: 7,
                    b: [tint([['#ffffff', 0]], popOut(0.3))],
                });
                beam.startSize = new Vector3Function(new ConstantValue(9), new ConstantValue(w), new ConstantValue(1));
            }
            const HIT = SMITE + 0.1;
            flash(fx, {at: [RIGHT, 1.2, 0.3], size: 5, time: HIT, color: GOLD[6]});
            shockwave(fx, {at: [RIGHT, 0.04, 0], size: 4.5, life: 0.6, color: GOLD[5], delay: HIT});
            sparks(fx, {
                at: [RIGHT, 0.2, 0],
                time: HIT,
                count: 40,
                speed: [3, 7],
                palette: [
                    ['#ffffff', 0],
                    [GOLD[5], 0.4],
                    [GOLD[3], 1],
                ],
                gravity: 6,
                aim: 'up',
                shape: new ConeEmitter({radius: 0.4, angle: 1, thickness: 1}),
            });
            decal(fx, {
                at: [RIGHT, 0.014, 0],
                size: 3,
                color: GOLD[5],
                alpha: 0.7,
                life: 1.4,
                delay: HIT,
                blend: 'add',
            });
            const motes = fx.sys({
                tex: 'glint',
                life: [0.4, 0.7],
                speed: [0.5, 1.2],
                size: [0.12, 0.22],
                rate: 14,
                color: GOLD[6],
                shape: new ConeEmitter({radius: 0.6, angle: 0.1, thickness: 1}),
                aim: 'up',
                at: [RIGHT, 0.2, 0],
                order: 8,
                b: [tint([['#ffffff', 0]], popOut(0.5))],
            });
            gate(motes, P, HIT, 2.4, 14);
            hitFlash(fx, foe, P, [HIT], '#ffffff', 1, 0.3);
            stain(fx, foe, P, HIT + 0.1, '#f4f0e0', 0.6, P - 0.1);
            fx.every((t) => {
                // Both hands up, then down; the hammer drops.
                const up = easeOut(span(t, 0, 0.4));
                const down = easeIn(span(t, 0.85, SMITE));
                const y = 1.15 + up * 0.9 - down * 1.2;
                me.hand.position.set(0.3, y, 0.12);
                other.position.set(-0.3, y, 0.12);
                hammer.position.y = 8 - 3.6 * easeIn(span(t, SMITE, HIT));
                reel(foe, t, [[HIT, 0.2]], RIGHT);
                foe.body.scaling.set(1, 1 - (t > HIT ? Math.exp(-(t - HIT) * 8) * 0.25 : 0), 1);
            });
        },
    },
    {
        id: 'moves/ice-lance-throw',
        name: 'Ice Lance Throw',
        loop: false,
        period: 3.6,
        view: VIEW,
        build(fx) {
            const P = 3.6;
            const THROW = 1.0;
            const HIT = 1.3;
            const me = actor(fx, P, LEFT, 1);
            const foe = actor(fx, P, RIGHT, -1, FOE);
            const LANCE = lathe(
                [
                    [0.001, -0.5],
                    [0.05, -0.4],
                    [0.06, 0.2],
                    [0.09, 0.3],
                    [0.001, 0.5],
                ],
                6
            );
            const held = fx.node('lance', [0.1, 0.15, 0], me.hand);
            held.rotation.z = -Math.PI / 2;
            solid(fx, part(fx, held, [0, 0, 0], [1, 1.4, 1]), LANCE, ICE[5], {
                life: P,
                rim: [0.7, 0.95, 1],
                alpha: 0.9,
            });
            const frost = fx.sys({
                tex: 'flake',
                blend: 'add',
                life: 0.4,
                speed: -1.6,
                size: [0.06, 0.12],
                rate: 40,
                color: [ICE[5], '#ffffff'],
                shape: new SphereEmitter({radius: 0.7, thickness: 0.1}),
                parent: me.hand,
                order: 7,
                b: [tint([['#ffffff', 0]], fadeOut(0.6, 0.2)), spin(3)],
            });
            gate(frost, P, 0.1, THROW - 0.1, 40);
            const from: At = [LEFT + 0.6, 1.4, 0.15];
            const to: At = [RIGHT - 0.1, 1.15, 0.1];
            const lance = flier(fx, from, to, THROW, HIT, 0.2);
            const lanceBody = fx.node('lanceBody', [0, 0, 0], lance);
            lanceBody.rotation.z = -Math.PI / 2;
            solid(fx, part(fx, lanceBody, [0, 0, 0], [1, 1.4, 1]), LANCE, ICE[5], {life: P, rim: [0.7, 0.95, 1]});
            streak(fx, lance, ICE[5], 0.2, 0.3, 30);
            // The target ices over: a shell of ice grows on it, snowflakes burst, it shivers.
            const shell = fx.node('shell', [0, 0, 0], foe.body);
            fx.sys({
                geo: lathe(
                    [
                        [0.001, -0.02],
                        [0.46, 0],
                        [0.48, 0.9],
                        [0.44, 1.7],
                        [0.2, 2.0],
                        [0.001, 2.05],
                    ],
                    7
                ),
                tex: 'white',
                blend: 'add',
                life: P,
                size: 1,
                burst: [[0, 1]],
                color: ICE[3],
                alpha: 0.6,
                parent: shell,
                order: 6,
                look: {
                    scalingMode: 'hierarchy',
                    renderFace: 'both',
                    rim: {color: [0.7, 0.95, 1], power: 1.5, strength: 1.4, mode: 'add'},
                },
            });
            fx.sys({
                tex: 'flake',
                blend: 'add',
                life: [0.8, 1.4],
                speed: [1, 3],
                size: [0.12, 0.26],
                burst: [[HIT, 30]],
                color: [ICE[5], '#ffffff'],
                shape: new SphereEmitter({radius: 0.4, thickness: 1}),
                at: [RIGHT, 1.2, 0],
                order: 8,
                b: [airDrag(2.5), gravity(0.8), spin(2), tint([['#ffffff', 0]], fadeOut(0.6, 0))],
            });
            flash(fx, {at: [RIGHT, 1.2, 0.3], size: 3.5, time: HIT, color: ICE[6]});
            decal(fx, {
                tex: 'flake',
                at: [RIGHT, 0.014, 0],
                size: 2.4,
                color: ICE[5],
                alpha: 0.7,
                life: P - HIT,
                delay: HIT,
                blend: 'add',
            });
            fx.sys({
                mesh: 'shard',
                tumble: 8,
                world: true,
                life: [0.7, 1],
                speed: [2, 4],
                size: [0.1, 0.2],
                burst: [[3.0, 20]],
                color: [ICE[4], ICE[6]],
                shape: new SphereEmitter({radius: 0.5, thickness: 1}),
                at: [RIGHT, 1, 0],
                order: 6,
                b: [gravity(9), floorBounce(0.3), grow([0, 1], [0.8, 1], [1, 0])],
            });
            hitFlash(fx, foe, P, [HIT], '#ffffff', 0.8);
            stain(fx, foe, P, HIT, ICE[4], 0.6, 3.0);
            fx.every((t) => {
                // Frost gathers into the spear; he throws it like a javelin.
                const form = span(t, 0.1, THROW - 0.1);
                held.scaling.setAll(t < THROW ? Math.max(HIDE, form) : HIDE);
                const back = easeOut(span(t, 0.6, THROW));
                const throwK = easeOut(span(t, THROW, THROW + 0.15));
                me.hand.position.set(0.42 - back * 0.6 + throwK * 0.9, 1.15 + back * 0.35, 0.15);
                me.body.rotation.z = 0.2 * back - 0.3 * throwK * (1 - span(t, 1.3, 1.8));
                const grow = easeOut(span(t, HIT, HIT + 0.35));
                const gone = t > 3.0 ? HIDE : 1;
                shell.scaling.set(
                    Math.max(HIDE, grow * gone),
                    Math.max(HIDE, grow * gone),
                    Math.max(HIDE, grow * gone)
                );
                const shiver = t > HIT && t < 3.0 ? Math.sin(t * 60) * 0.03 : 0;
                foe.root.position.x = RIGHT + shiver;
            });
        },
    },
    {
        id: 'moves/lightning-call',
        name: 'Lightning Call',
        loop: false,
        period: 3,
        view: {height: 1.8, distance: 9},
        build(fx) {
            const P = 3;
            const SIGIL = 0.35;
            const STRIKE = 0.95;
            const me = actor(fx, P, LEFT, 1);
            const foe = actor(fx, P, RIGHT, -1, FOE);
            const spark = fx.sys({
                tex: 'glow',
                blend: 'add',
                life: 0.1,
                size: 0.5,
                rate: 30,
                color: VOLT[4],
                parent: me.hand,
                order: 6,
            });
            gate(spark, P, 0.2, STRIKE, 30);
            decal(fx, {
                tex: 'rune',
                at: [RIGHT, 0.014, 0],
                size: 2.4,
                color: VOLT[4],
                alpha: 0.9,
                life: STRIKE - SIGIL + 0.4,
                delay: SIGIL,
                blend: 'add',
                alphas: popOut(0.3),
            });
            // The bolt: thick arcs from the sky to the target.
            const sky = fx.node('sky', [RIGHT + 0.4, 7, 0]);
            const ground = fx.node('ground', [RIGHT, 1.2, 0]);
            arcs(fx, {
                parent: sky,
                to: ground,
                burst: [
                    [STRIKE, 3],
                    [STRIKE + 0.08, 3],
                    [STRIKE + 0.2, 2],
                ],
                life: [0.12, 0.2],
                width: [0.6, 0.9],
                palette: PALETTE.electric,
                loop: false,
            });
            // Aftershocks crawling over the target.
            const after = fx.node('after', [RIGHT, 0.2, 0]);
            const shocks = arcs(fx, {
                parent: ground,
                to: after,
                rate: 14,
                life: [0.05, 0.1],
                width: [0.15, 0.25],
                palette: PALETTE.electric,
                shape: new SphereEmitter({radius: 0.4, thickness: 1}),
            });
            gate(shocks, P, STRIKE + 0.2, 2.5, 14);
            flash(fx, {at: [RIGHT, 1.4, 0.3], size: 6, time: STRIKE, color: VOLT[5]});
            shockwave(fx, {at: [RIGHT, 0.04, 0], size: 4, life: 0.5, color: VOLT[4], delay: STRIKE});
            sparks(fx, {
                at: [RIGHT, 0.2, 0],
                time: STRIKE,
                count: 40,
                speed: [3, 7],
                palette: PALETTE.electric,
                gravity: 6,
                aim: 'up',
                shape: new ConeEmitter({radius: 0.3, angle: 1, thickness: 1}),
            });
            decal(fx, {
                tex: 'crack',
                at: [RIGHT, 0.015, 0],
                size: 2,
                color: '#0a0a14',
                alpha: 0.9,
                life: P - STRIKE,
                delay: STRIKE,
                rot: true,
            });
            hitFlash(fx, foe, P, [STRIKE, STRIKE + 0.4, STRIKE + 0.75, STRIKE + 1.1], VOLT[5], 0.8, 0.12);
            fx.every((t) => {
                // An arm up, and the downswing.
                const up = easeOut(span(t, 0, 0.4));
                const down = easeIn(span(t, 0.8, STRIKE));
                me.hand.position.set(0.42 + down * 0.3, 1.15 + up * 0.9 - down * 0.7, 0.12);
                me.body.rotation.z = -0.1 * up + 0.25 * down;
                // Jolting through the aftershocks.
                const jolt = t > STRIKE && t < 2.5 ? Math.sin(t * 55) * 0.05 * (1 - span(t, STRIKE, 2.5)) : 0;
                foe.root.position.x = RIGHT + jolt;
                foe.body.scaling.set(1, 1 - (t > STRIKE ? Math.exp(-(t - STRIKE) * 6) * 0.2 : 0), 1);
                after.position.set(
                    RIGHT + Math.sin(t * 13) * 0.3,
                    0.3 + Math.abs(Math.sin(t * 7)) * 1.4,
                    Math.cos(t * 11) * 0.3
                );
            });
        },
    },
    {
        id: 'moves/meteor-call',
        name: 'Meteor Call',
        loop: false,
        period: 4.6,
        view: {height: 2.2, distance: 10},
        build(fx) {
            const P = 4.6;
            const FLARE = 1.4;
            const POINT = 1.6;
            const HIT = 2.3;
            const me = actor(fx, P, LEFT, 1);
            const foe = actor(fx, P, RIGHT, -1, FOE);
            // The circle drawing itself round him, then flaring.
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                blend: 'add',
                life: 2,
                size: 2.6,
                burst: [[0.1, 1]],
                color: ARC[5],
                at: [LEFT, 0.03, 0],
                order: 2,
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [0, 0],
                            [1, 0.4],
                            [1, 0.8],
                            [0, 1],
                        ]
                    ),
                    grow([0, 0.2], [0.5, 1], [1, 1.05]),
                ],
            });
            decal(fx, {
                tex: 'rune',
                at: [LEFT, 0.014, 0],
                size: 2.4,
                color: ARC[5],
                alpha: 0.9,
                life: 2,
                delay: 0.3,
                blend: 'add',
                alphas: [
                    [0, 0],
                    [1, 0.5],
                    [1, 0.8],
                    [0, 1],
                ],
            });
            const rise = fx.sys({
                tex: 'glow',
                blend: 'add',
                life: [0.6, 1],
                speed: [1, 2.5],
                size: [0.06, 0.12],
                rate: 30,
                color: [ARC[5], ARC[7]],
                shape: new ConeEmitter({radius: 1.1, angle: 0.1, thickness: 0.1}),
                aim: 'up',
                at: [LEFT, 0.05, 0],
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.4))],
            });
            gate(rise, P, 0.3, 2.2, 30);
            const pillar = fx.sys({
                tex: 'streak',
                blend: 'add',
                life: 0.9,
                size: 1,
                burst: [[FLARE, 1]],
                rot: Math.PI / 2,
                color: ARC[5],
                at: [LEFT, 3.5, 0],
                order: 4,
                b: [tint([['#ffffff', 0]], popOut(0.3))],
            });
            pillar.startSize = new Vector3Function(new ConstantValue(7), new ConstantValue(1.4), new ConstantValue(1));
            flash(fx, {at: [LEFT, 1, 0.3], size: 3, time: FLARE, color: ARC[6]});
            // The meteor: a burning rock coming down at a slant.
            const from: At = [RIGHT - 4, 9, -1];
            const to: At = [RIGHT, 0.4, 0];
            const rock = flier(fx, from, to, POINT, HIT, 0, easeIn);
            const tumble = fx.node('tumble', [0, 0, 0], rock);
            solid(fx, part(fx, tumble, [0, 0, 0], [0.9, 0.8, 0.85]), SPHERE, '#3a2a26', {life: P, rim: [1, 0.5, 0.2]});
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: P,
                look: {scalingMode: 'hierarchy'},
                size: 2.2,
                burst: [[0, 1]],
                color: '#ff8a2a',
                parent: rock,
                order: 6,
            });
            fx.sys({
                tex: 'flame',
                blend: 'add',
                world: true,
                life: [0.3, 0.5],
                size: [0.6, 1],
                rateOverDistance: 10,
                color: ['#ffc23d', '#f2561d'],
                shape: new SphereEmitter({radius: 0.3, thickness: 1}),
                parent: rock,
                order: 5,
                b: [tint(PALETTE.fire, fadeOut(0.2, 0)), grow([0, 1], [1, 0.3])],
            });
            const trail = smoke(fx, {
                at: [0, 0, 0],
                parent: rock,
                rate: 20,
                size: [0.6, 1],
                world: true,
                color: '#2a2226',
                alpha: 0.6,
                life: [0.8, 1.2],
            });
            gate(trail, P, POINT, HIT, 20);
            // The impact flattens the scene.
            flash(fx, {at: [RIGHT, 1, 0.5], size: 9, time: HIT, color: '#fff3a6'});
            shockwave(fx, {at: [RIGHT, 0.05, 0], size: 9, life: 0.7, color: '#ffc23d', delay: HIT});
            flames(fx, {
                at: [RIGHT, 0.6, 0],
                radius: 1,
                height: 2.4,
                size: [0.8, 1.4],
                burst: [[HIT, 30]],
                puff: true,
                loop: false,
                order: 6,
            });
            debris(fx, {at: [RIGHT, 0.2, 0], count: 30, speed: [5, 9], size: [0.18, 0.35], delay: HIT});
            hotSparks(fx, {
                at: [RIGHT, 0.4, 0],
                count: 40,
                time: HIT,
                speed: [4, 9],
                shape: new ConeEmitter({radius: 0.5, angle: 1.1, thickness: 1}),
                aim: 'up',
            });
            smoke(fx, {
                at: [RIGHT, 0.8, 0],
                burst: [[HIT + 0.1, 18]],
                size: [1, 1.8],
                speed: [0.8, 2],
                color: '#2a2226',
                alpha: 0.7,
                life: [1.6, 2.2],
                loop: false,
            });
            decal(fx, {
                tex: 'crack',
                at: [RIGHT, 0.015, 0],
                size: 4,
                color: '#0a0606',
                alpha: 0.9,
                life: P - HIT,
                delay: HIT,
                rot: true,
            });
            decal(fx, {
                at: [RIGHT, 0.014, 0],
                size: 4,
                color: '#ff6a1a',
                alpha: 0.7,
                life: 1.6,
                delay: HIT,
                blend: 'add',
            });
            hitFlash(fx, foe, P, [HIT], '#fff3a6', 1);
            stain(fx, foe, P, HIT + 0.1, '#2a1a18', 0.9);
            fx.every((t) => {
                // A long chant with both arms out, then the point.
                const chant = span(t, 0, FLARE);
                me.hand.position.set(0.42 + Math.sin(t * 4) * 0.05, 1.15 + chant * 0.4, 0.12 + Math.cos(t * 4) * 0.05);
                const point = easeOut(span(t, POINT - 0.1, POINT + 0.1));
                if (t > POINT - 0.1) me.hand.position.set(0.5 + point * 0.3, 1.55 + point * 0.3, 0.12);
                tumble.rotation.set(t * 3, t * 2, 0);
                reel(foe, t, [[HIT, 0.9]], RIGHT);
                foe.body.scaling.set(1, 1 - (t > HIT ? Math.exp(-(t - HIT) * 4) * 0.4 : 0), 1);
            });
        },
    },
    {
        id: 'moves/pistol-shots',
        name: 'Pistol Shots',
        loop: false,
        period: 2.6,
        view: VIEW,
        build(fx) {
            const P = 2.6;
            const SHOTS = [0.5, 1.05, 1.6];
            const me = actor(fx, P, LEFT, 1);
            const foe = actor(fx, P, RIGHT, -1, FOE);
            const gun = fx.node('gun', [0.05, 0.02, 0], me.hand);
            gun.scaling.setAll(1.7);
            solid(
                fx,
                gun,
                extrude(
                    [
                        [0, 0.02],
                        [0.4, 0.02],
                        [0.4, 0.1],
                        [0, 0.1],
                    ],
                    0.06
                ),
                '#2a2a32',
                {life: P, rim: [0.6, 0.6, 0.7]}
            );
            solid(
                fx,
                gun,
                extrude(
                    [
                        [0, 0.02],
                        [0.1, 0.02],
                        [0.06, -0.14],
                        [-0.04, -0.14],
                    ],
                    0.06
                ),
                '#4a3424',
                {life: P}
            );
            const muzzle: At = [0.45, 0.06, 0];
            for (const shot of SHOTS) {
                fx.sys({
                    tex: 'burst',
                    blend: 'add',
                    life: 0.08,
                    size: 0.6,
                    burst: [[shot, 1]],
                    color: '#ffe080',
                    at: muzzle,
                    parent: gun,
                    order: 8,
                    b: [tint([['#ffffff', 0]], popOut(0.3))],
                });
                fx.sys({
                    tex: 'smoke',
                    life: [0.5, 0.8],
                    speed: [0.3, 0.6],
                    size: [0.15, 0.25],
                    burst: [[shot, 3]],
                    color: '#a0a0a8',
                    alpha: 0.4,
                    at: muzzle,
                    parent: gun,
                    world: true,
                    order: 4,
                    b: [gravity(-0.5), grow([0, 0.6], [1, 1.6]), tint([['#ffffff', 0]], fadeOut(0.3))],
                });
                // A tracer across the floor.
                fx.sys({
                    tex: 'dot',
                    blend: 'add',
                    mode: RenderMode.StretchedBillBoard,
                    stretch: {speed: 0.05, length: 1},
                    life: 0.12,
                    speed: 32,
                    size: 0.06,
                    burst: [[shot, 1]],
                    color: '#fff0a0',
                    at: [LEFT + 0.9, 1.17, 0.12],
                    aim: 'right',
                    order: 7,
                });
                // A casing flicked out.
                fx.sys({
                    geo: ROD,
                    tex: 'white',
                    blend: 'alpha',
                    world: true,
                    tumble: 14,
                    life: 0.8,
                    speed: [1.5, 2.5],
                    size: 0.04,
                    burst: [[shot, 1]],
                    color: '#d8a840',
                    shape: new ConeEmitter({radius: 0.01, angle: 0.3, thickness: 1}),
                    aim: 'up',
                    at: [0.15, 0.1, 0],
                    parent: gun,
                    order: 6,
                    look: {lighting: 'fixed'},
                    b: [gravity(9), floorBounce(0.4)],
                });
                const hit = shot + 0.12;
                sparks(fx, {
                    at: [RIGHT - 0.3, 1.2, 0.2],
                    time: hit,
                    count: 12,
                    speed: [2, 4],
                    size: [0.03, 0.05],
                    gravity: 8,
                });
                fx.sys({
                    tex: 'pow',
                    blend: 'add',
                    life: 0.12,
                    size: 0.7,
                    burst: [[hit, 1]],
                    color: '#ffffff',
                    at: [RIGHT - 0.3, 1.2, 0.3],
                    order: 8,
                    b: [tint([['#ffffff', 0]], popOut(0.3))],
                });
            }
            hitFlash(
                fx,
                foe,
                P,
                SHOTS.map((s) => s + 0.12),
                '#ffffff',
                0.7,
                0.1
            );
            fx.every((t) => {
                // Aim, kick up on each shot, settle.
                const aim = easeOut(span(t, 0, 0.35));
                me.hand.position.set(0.42 + aim * 0.25, 1.0 + aim * 0.17, 0.12);
                let kick = 0;
                for (const s of SHOTS) if (t > s) kick += Math.exp(-(t - s) * 12) * Math.min(1, (t - s) * 40);
                gun.rotation.z = kick * 0.5;
                me.hand.position.x -= kick * 0.06;
                reel(
                    foe,
                    t,
                    SHOTS.map((s) => [s + 0.12, 0.18] as [number, number]),
                    RIGHT
                );
            });
        },
    },
    {
        id: 'moves/rocket-launcher',
        name: 'Rocket Launcher',
        loop: false,
        period: 4.2,
        view: {height: 1.4, distance: 10},
        build(fx) {
            const P = 4.2;
            const FIRE = 0.8;
            const HIT = 1.9;
            const me = actor(fx, P, LEFT - 0.6, 1);
            const foe = actor(fx, P, RIGHT + 0.6, -1, FOE);
            const tube = fx.node('tube', [0.1, 1.45, 0.2], me.root);
            tube.rotation.z = -Math.PI / 2;
            solid(fx, part(fx, tube, [0, -0.5, 0], [0.18, 1.1, 0.18]), ROD, '#4a5a3a', {life: P, rim: [0.6, 0.7, 0.5]});
            // Backblast behind him.
            smoke(fx, {
                at: [LEFT - 1.4, 1.4, 0.2],
                burst: [[FIRE, 14]],
                size: [0.5, 0.9],
                speed: [1.5, 3],
                color: '#b0a8a0',
                alpha: 0.6,
                life: [0.8, 1.2],
                loop: false,
                aim: 'left',
            });
            flash(fx, {at: [LEFT - 1.2, 1.45, 0.3], size: 2, time: FIRE, color: '#ffe0a0'});
            const from: At = [LEFT + 0.2, 1.45, 0.2];
            const to: At = [RIGHT + 0.6, 1.1, 0.1];
            // It crawls out, then accelerates on its jet.
            const rocket = flier(fx, from, to, FIRE, HIT, 0.15, (k) => k * k);
            const body = fx.node('rocketBody', [0, 0, 0], rocket);
            body.rotation.z = -Math.PI / 2;
            solid(fx, part(fx, body, [0, -0.2, 0], [0.12, 0.4, 0.12]), ROD, '#6a6a5a', {life: P});
            solid(fx, part(fx, body, [0, 0.2, 0], [0.12, 0.16, 0.12]), CONE, '#c84030', {life: P});
            const exhaust = fx.sys({
                tex: 'flame',
                blend: 'add',
                world: true,
                life: [0.12, 0.2],
                size: [0.25, 0.4],
                rate: 60,
                color: ['#ffc23d', '#f2561d'],
                parent: rocket,
                order: 6,
                b: [tint(PALETTE.fire, fadeOut(0.2, 0)), grow([0, 1], [1, 0.4])],
            });
            const contrail = smoke(fx, {
                at: [-0.3, 0, 0],
                parent: rocket,
                rate: 26,
                size: [0.3, 0.5],
                world: true,
                color: '#c0b8b0',
                alpha: 0.5,
                life: [1, 1.6],
            });
            gate(exhaust, P, FIRE, HIT, 60);
            gate(contrail, P, FIRE, HIT, 26);
            flash(fx, {at: [RIGHT + 0.6, 1.2, 0.5], size: 7, time: HIT, color: '#fff3a6'});
            flames(fx, {
                at: [RIGHT + 0.6, 1, 0],
                radius: 0.8,
                height: 2,
                size: [0.7, 1.2],
                burst: [[HIT, 30]],
                puff: true,
                loop: false,
                order: 6,
            });
            shockwave(fx, {at: [RIGHT + 0.6, 0.05, 0], size: 6, life: 0.6, color: '#ffc23d', delay: HIT});
            debris(fx, {at: [RIGHT + 0.6, 0.3, 0], count: 24, speed: [4, 8], delay: HIT});
            hotSparks(fx, {
                at: [RIGHT + 0.6, 1, 0],
                count: 40,
                time: HIT,
                speed: [4, 8],
                shape: new SphereEmitter({radius: 0.4, thickness: 1}),
            });
            smoke(fx, {
                at: [RIGHT + 0.6, 1.2, 0],
                burst: [[HIT + 0.1, 16]],
                size: [0.9, 1.6],
                speed: [0.8, 2],
                color: '#2a2226',
                alpha: 0.7,
                life: [1.6, 2.2],
                loop: false,
            });
            decal(fx, {
                tex: 'crack',
                at: [RIGHT + 0.6, 0.015, 0],
                size: 3,
                color: '#0a0606',
                alpha: 0.9,
                life: P - HIT,
                delay: HIT,
                rot: true,
            });
            hitFlash(fx, foe, P, [HIT], '#fff3a6', 1);
            stain(fx, foe, P, HIT + 0.1, '#2a1a18', 0.9);
            fx.every((t) => {
                // Down on one knee, shoulder the tube, the kick shoves him back.
                const kneel = easeOut(span(t, 0, 0.4));
                me.body.scaling.set(1, 1 - kneel * 0.25, 1);
                tube.position.y = 1.45 - kneel * 0.4;
                me.hand.position.set(0.3, 1.1 - kneel * 0.4, 0.2);
                const shove = t > FIRE ? easeOut(span(t, FIRE, FIRE + 0.4)) * 0.6 : 0;
                me.root.position.x = LEFT - 0.6 - shove;
                tube.rotation.z = -Math.PI / 2 + (t > FIRE ? Math.exp(-(t - FIRE) * 8) * 0.3 : 0);
                // Thrown up and back.
                const air = span(t, HIT, HIT + 1);
                foe.root.position.set(RIGHT + 0.6 + air * 1.4, Math.sin(air * Math.PI) * 1.6 * (air < 1 ? 1 : 0), 0);
                foe.body.rotation.z = -air * Math.PI * 2;
            });
        },
    },
    {
        id: 'moves/sword-combo',
        name: 'Sword Combo',
        loop: false,
        period: 2.9,
        view: VIEW,
        build(fx) {
            const P = 2.9;
            const CUTS = [0.4, 0.95, 1.1];
            const CLEAVE = 1.75;
            const me = actor(fx, P, LEFT, 1);
            const foe = actor(fx, P, RIGHT, -1, FOE);
            const blade = fx.node('blade', [0, 0, 0], me.hand);
            solid(
                fx,
                blade,
                extrude(
                    [
                        [0, -0.04],
                        [1.0, -0.04],
                        [1.15, 0],
                        [1.0, 0.04],
                        [0, 0.04],
                    ],
                    0.03
                ),
                STEEL,
                {life: P, rim: [0.8, 0.9, 1]}
            );
            solid(
                fx,
                blade,
                extrude(
                    [
                        [-0.02, -0.14],
                        [0.04, -0.14],
                        [0.04, 0.14],
                        [-0.02, 0.14],
                    ],
                    0.06
                ),
                '#c8a040',
                {life: P}
            );
            const tip = fx.node('tip', [1.1, 0, 0], blade);
            fx.sys({
                tex: 'glow',
                mode: RenderMode.Trail,
                trail: 12,
                trailOpts: {followLocalOrigin: true, tessellation: 3, uvFromHead: true},
                world: true,
                life: P,
                size: 0.3,
                burst: [[0, 1]],
                color: '#cfeaff',
                parent: tip,
                order: 6,
            });
            const hitAt: At = [RIGHT - 0.2, 1.1, 0.3];
            const swings: Array<{time: number; from: number; to: number}> = [
                {time: CUTS[0], from: 1.8, to: -1.4},
                {time: CUTS[1], from: -1.2, to: 1.6},
                {time: CUTS[2], from: 1.6, to: -1.4},
                {time: CLEAVE, from: 2.6, to: -1.1},
            ];
            for (const s of swings) {
                const hit = s.time + 0.08;
                sparks(fx, {at: hitAt, time: hit, count: s.time === CLEAVE ? 30 : 14, speed: [3, 6], gravity: 8});
                fx.sys({
                    tex: 'smear',
                    blend: 'add',
                    life: 0.15,
                    size: 1.6,
                    burst: [[hit, 1]],
                    rot: s.to > s.from ? 0.8 : -0.8,
                    color: '#ffffff',
                    at: hitAt,
                    order: 8,
                    b: [tint([['#ffffff', 0]], popOut(0.3))],
                });
            }
            const C = CLEAVE + 0.08;
            flash(fx, {at: [RIGHT - 0.6, 0.3, 0.3], size: 3, time: C, color: '#fff0c8'});
            cracks(fx, [RIGHT - 0.7, 0, 0], 2, C, 1.2);
            dust(fx, {
                at: [RIGHT - 0.7, 0.1, 0],
                size: [0.5, 0.9],
                life: [0.7, 1.1],
                burst: [[C, 10]],
                speed: [1.5, 3],
                color: '#8a7a68',
                shape: new CircleEmitter({radius: 0.3, thickness: 1}),
                rotate: [Math.PI / 2, 0, 0],
            });
            clods(fx, {
                at: [RIGHT - 0.7, 0.1, 0],
                count: 10,
                delay: C,
                speed: [2, 4],
                color: ['#5a4a3a', '#7a6650'],
                shape: new ConeEmitter({radius: 0.2, angle: 0.6, thickness: 1}),
                aim: 'up',
            });
            hitFlash(
                fx,
                foe,
                P,
                swings.map((s) => s.time + 0.08),
                '#ffffff',
                0.7,
                0.12
            );
            fx.every((t) => {
                // Walking forward a step a stroke; each stroke a fast arc of the blade.
                let angle = 1.4;
                for (const s of swings) {
                    if (t >= s.time - 0.15) {
                        const k = span(t, s.time - 0.15, s.time + 0.1);
                        angle = s.from + (s.to - s.from) * easeOut(k);
                    }
                }
                blade.rotation.z = angle;
                const steps = span(t, 0.2, CLEAVE) * 1.4;
                me.root.position.x = LEFT + steps;
                const cleave = t > CLEAVE - 0.2 && t < CLEAVE + 0.3 ? 1 : 0;
                me.hand.position.set(0.42, 1.15 + cleave * 0.2, 0.15);
                me.body.rotation.z = -0.15 * cleave;
                reel(foe, t, [...CUTS.map((c) => [c + 0.08, 0.15] as [number, number]), [C, 0.6]], RIGHT);
            });
        },
    },
];
