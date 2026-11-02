import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {ParticleSystem} from 'babylon.quarks';
import {CircleEmitter, ConeEmitter, RenderMode, SphereEmitter} from 'babylon.quarks';
import {
    airDrag,
    curve,
    domeProfile,
    fadeOut,
    floorBounce,
    gravity,
    grow,
    lathe,
    popOut,
    spin,
    tint,
    wobble,
    type Geometry,
} from './kit';
import {FLAT, clods, dust, light, star, wedges, type At} from './parts';
import {PALETTE, decal, embers, flames, shockwave, smoke, type Ramp} from './recipes';
import {shapes, type FxBuilder, type FxDef} from './stage';
import {image} from './textures';

function clamp01(k: number): number {
    return Math.min(1, Math.max(0, k));
}

/** A ramp from a palette's top `k` entries, hot first. */
export function hot(c: string[], k = 4): Ramp {
    const top = c.slice(-k).reverse();
    return top.map((h, i) => [h, i / (top.length - 1)]);
}

/**
 * A standing body as a lathe profile: a capsule `height` tall and `radius` round, its rows evenly
 * spaced in height so the lathe's V is the height up it, 0 at the feet and 1 at the crown. A
 * gradient erosion mask laid on V then cuts it at a height.
 */
export function bodyProfile(height = 1.8, radius = 0.36, rows = 24): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let i = 0; i <= rows; i++) {
        const y = (height * i) / rows;
        const fromEnd = Math.min(y, height - y);
        const r = fromEnd < radius ? Math.sqrt(Math.max(0, radius * radius - (radius - fromEnd) ** 2)) : radius;
        out.push([Math.max(0.001, r), y]);
    }
    return out;
}

/** The stand-in hero's body, 1.8 m tall: V runs 0 at the feet to 1 at the crown. */
export const BODY = lathe(bodyProfile(), 32);
const SHELL = lathe(bodyProfile(1.9, 0.42), 32);

/** Keys `[t, alpha]` straight from `a` at `t0` to `b` at `t1`, held either side; `t` in seconds over `period`. */
export function ramp(period: number, t0: number, a: number, t1: number, b: number): Array<[number, number]> {
    return [
        [a, 0],
        [a, t0 / period],
        [b, t1 / period],
        [b, 1],
    ];
}

/**
 * The hero as one mesh particle, lit and solid, living the whole `period`: unlike a prop, it can
 * be eroded away (or written back in) by a gradient up its height, a hot band on the cut. `cut`
 * gives its alpha over time as `[alpha, t]` keys, which the erosion reads as how much of it is
 * left: from the feet up with `from: 'feet'`, from the crown down by default.
 */
export function hero(
    fx: FxBuilder,
    o: {
        period: number;
        cut?: Array<[number, number]>;
        from?: 'feet' | 'crown';
        edge?: [number, number, number];
        edgeWidth?: number;
        colors?: Ramp;
        geo?: Geometry;
        blend?: 'add' | 'alpha';
        lighting?: 'fixed' | 'unlit';
        alpha?: number;
        color?: string;
        at?: At;
        parent?: TransformNode;
        order?: number;
        rim?: [number, number, number];
        time?: number;
        life?: number;
        /** Plain alpha keys `[alpha, t]` (a fade, not a cut) when there is no `cut`. */
        fade?: Array<[number, number]>;
        /** Respawns every `period`, for a looping effect; once by default. */
        loop?: boolean;
    }
): ParticleSystem {
    // Red 1 at the feet: the crown goes first as alpha falls. Flipped, the feet go first.
    const maskUV =
        o.from === 'feet' ? {tiling: [1, -1] as [number, number], offset: [0, 1] as [number, number]} : undefined;
    return fx.sys({
        geo: o.geo ?? BODY,
        tex: 'white',
        blend: o.blend ?? 'alpha',
        loop: o.loop ?? false,
        life: o.life ?? o.period,
        size: 1,
        burst: [[o.time ?? 0, 1]],
        color: o.color ?? '#8a8fa8',
        alpha: o.alpha,
        at: o.at ?? [0, 0, 0],
        parent: o.parent,
        order: o.order ?? 3,
        look: {
            lighting: o.lighting ?? 'fixed',
            scalingMode: 'hierarchy',
            rim: o.rim ? {color: o.rim, power: 2.2, strength: 1, mode: 'add'} : undefined,
            erosion: o.cut
                ? {
                      mask: image(fx.scene, 'gradient').texture,
                      maskUV,
                      softness: 0.02,
                      edgeWidth: o.edgeWidth ?? 0.04,
                      edgeColor: o.edge ?? [2, 2, 2],
                  }
                : undefined,
        },
        b: [tint(o.colors ?? [['#ffffff', 0]], o.cut ?? o.fade ?? [[1, 0]])],
    });
}

/** A node that rides the cut of {@link hero}: at height `height * level(t)`. */
export function cutNode(fx: FxBuilder, level: (t: number) => number, height = 1.8): TransformNode {
    const node = fx.node('cut', [0, 0, 0]);
    fx.every((t) => {
        node.position.y = height * level(t);
    });
    return node;
}

/** Straight from 0 at `t0` to 1 at `t1`. */
export function between(t: number, t0: number, t1: number): number {
    return clamp01((t - t0) / (t1 - t0));
}

const GOLD = ['#2a1606', '#5c3208', '#9a5a0c', '#d48c14', '#f5b82a', '#ffe066', '#fff6c4', '#ffffff'];
const ARC = ['#120a26', '#2a1658', '#3d2f9c', '#3f68d4', '#3fa8ec', '#86e0ff', '#d6f8ff', '#ffffff'];
const BURN = ['#2a0e08', '#5a1a0c', '#a8320f', '#e8601a', '#ff9a2e', '#ffd25a', '#fff3c0', '#ffffff'];
const SHELLC = ['#1e1826', '#4a3e52', '#857684', '#c4b4ac', '#ece0d2', '#fffaf0'];
const PUFF = ['#2a2440', '#5e5878', '#9a94b4', '#cdc8e0', '#f2f0fa', '#ffffff'];
const BEAM = ['#061e1b', '#0c3e36', '#136a5a', '#1f9c80', '#45d1a8', '#a8f5d8', '#ffffff'];
const FROST = ['#0e1636', '#1a2f66', '#2557a3', '#3488d6', '#5fc0f0', '#a2e6ff', '#dcf8ff', '#ffffff'];
const SOUL = ['#101a33', '#1f3563', '#35609e', '#5c96d4', '#94c8f0', '#d2f0ff', '#ffffff'];
const RIFT = ['#12081f', '#2a0f4d', '#481b8c', '#7330d0', '#a35cff', '#cf9bff', '#f1dcff', '#ffffff'];
const RUNE = ['#1a0608', '#3d0c0c', '#7a1a10', '#c0381a', '#f06a1e', '#ffae3a', '#ffe08a', '#ffffff'];

/** A coin: a thin disc with a rim, for a mesh particle. */
const COIN = lathe(
    [
        [0.001, -0.022],
        [0.13, -0.022],
        [0.14, 0],
        [0.13, 0.022],
        [0.001, 0.022],
    ],
    20
);

/** Soft round cartoon smoke balls. */
export function puffs(
    fx: FxBuilder,
    o: {
        at: At;
        count: number;
        time: number;
        speed: [number, number];
        size: [number, number];
        life: [number, number];
        color: [string, string];
        shape?: ParticleSystem['emitterShape'];
        lift?: number;
    }
) {
    return fx.sys({
        tex: 'smoke',
        blend: 'alpha',
        loop: false,
        life: o.life,
        speed: o.speed,
        size: o.size,
        rot: true,
        burst: [[o.time, o.count]],
        color: o.color,
        shape: o.shape ?? new SphereEmitter({radius: 0.2, thickness: 1}),
        at: o.at,
        order: 3,
        b: [
            tint([['#ffffff', 0]], fadeOut(0.55, 0.03)),
            grow([0, 0.5], [0.2, 1], [1, 1.25]),
            airDrag(5),
            gravity(o.lift ?? 0.4, [0, 1, 0]),
        ],
    });
}

export const spawn: FxDef[] = [
    {
        id: 'spawn/coin-drop',
        name: 'Coin drop',
        loop: false,
        period: 3,
        build(fx) {
            // The enemy goes up in a soft poof.
            star(fx, {at: [0, 1, 0], size: 1.4, life: 0.25, tex: 'glow', ramp: hot(GOLD)});
            puffs(fx, {
                at: [0, 1, 0],
                count: 8,
                time: 0.05,
                speed: [0.6, 1.4],
                size: [0.4, 0.7],
                life: [0.6, 0.9],
                color: [PUFF[4], PUFF[3]],
            });
            // Gold coins spin out, bounce, settle and wink out one by one.
            fx.sys({
                geo: COIN,
                tex: 'white',
                blend: 'alpha',
                world: true,
                loop: false,
                life: [1.8, 2.7],
                speed: [2.5, 4.5],
                size: 1,
                burst: [[0.08, 9]],
                color: [GOLD[4], GOLD[5]],
                shape: new ConeEmitter({radius: 0.15, angle: 0.75}),
                aim: 'up',
                at: [0, 1, 0],
                tumble: 9,
                order: 4,
                look: {lighting: 'fixed', rim: {color: [1, 0.85, 0.4], power: 2, strength: 0.6, mode: 'add'}},
                b: [gravity(11), airDrag(0.4), floorBounce(0.45, 0.03), grow([0, 1], [0.9, 1], [1, 0])],
            });
            // Glints on the hits, then twinkles on the settled coins.
            fx.sys({
                tex: 'glint',
                loop: false,
                life: [0.15, 0.3],
                size: [0.2, 0.4],
                burst: [
                    [0.55, 4],
                    [0.8, 3],
                    [1.1, 3],
                    [1.6, 2],
                    [2.0, 2],
                ],
                color: GOLD[6],
                shape: new CircleEmitter({radius: 1.6, thickness: 1}),
                rotate: FLAT,
                at: [0, 0.08, 0],
                order: 6,
                b: [tint(hot(GOLD), popOut(0.3)), spin(2)],
            });
            light(fx, {at: [0, 0.05, 0], size: 3.6, color: GOLD[4], floor: true, life: 1.2, alpha: 0.35, time: 0.1});
        },
    },
    {
        id: 'spawn/disintegrate',
        name: 'Disintegrate',
        loop: false,
        period: 3.6,
        build(fx) {
            const P = 3.6;
            // It crackles with light, flashes white, then peels away from the head down.
            const PEEL0 = 0.85;
            const PEEL1 = 2.6;
            const level = (t: number) => 1 - between(t, PEEL0, PEEL1);
            hero(fx, {
                period: P,
                cut: ramp(P, PEEL0, 1, PEEL1, 0),
                edge: [1.2, 2.4, 3],
                edgeWidth: 0.06,
                colors: [
                    ['#ffffff', 0],
                    ['#ffffff', 0.18],
                    [ARC[7], 0.21],
                    ['#ffffff', 0.24],
                    ['#ffffff', 1],
                ],
                rim: [0.3, 0.6, 1],
            });
            // The flash: the body lit white for a moment.
            hero(fx, {
                period: P,
                blend: 'add',
                lighting: 'unlit',
                color: ARC[6],
                time: 0.7,
                life: 0.25,
                fade: popOut(0.2),
                order: 4,
            });
            // Crackle: small sparks crawling over the body.
            fx.sys({
                tex: 'glint',
                loop: false,
                life: [0.06, 0.14],
                size: [0.15, 0.3],
                rate: 0,
                color: ARC[6],
                shape: new CircleEmitter({radius: 0.38, thickness: 0}),
                rotate: FLAT,
                at: [0, 0.9, 0],
                order: 6,
                b: [tint(hot(ARC), popOut(0.2))],
            }).emissionOverTime = curve([0, 0], [0.05, 30], [0.22, 30], [0.25, 0], [1, 0]);
            shockwave(fx, {at: [0, 0.04, 0], size: 2.4, life: 0.5, color: ARC[5], tex: 'ring', delay: 0.75});
            // Each pixel flares white-hot at the cut and streams off on the wind, cooling.
            const cut = cutNode(fx, level);
            const motes = fx.sys({
                tex: 'square',
                world: true,
                loop: false,
                life: [0.8, 1.6],
                speed: [0.2, 0.6],
                size: [0.04, 0.07],
                rate: 0,
                shape: new CircleEmitter({radius: 0.37, thickness: 0.2}),
                rotate: FLAT,
                parent: cut,
                order: 5,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            [ARC[5], 0.2],
                            [ARC[4], 0.5],
                            [ARC[2], 1],
                        ],
                        fadeOut(0.6, 0.02)
                    ),
                    gravity(1.6, [1, 0.35, 0]),
                    wobble(1.5, 0.6),
                ],
            });
            motes.emissionOverTime = curve(
                [0, 0],
                [PEEL0 / P, 0],
                [PEEL0 / P + 0.01, 160],
                [PEEL1 / P, 160],
                [PEEL1 / P + 0.01, 0],
                [1, 0]
            );
            light(fx, {at: [0, 0.05, 0], size: 3, color: ARC[4], floor: true, life: 2.2, alpha: 0.3, time: 0.7});
        },
    },
    {
        id: 'spawn/dissolve-burn',
        name: 'Dissolve burn',
        loop: false,
        period: 3.8,
        build(fx) {
            const P = 3.8;
            const T0 = 0.3;
            const T1 = 2.5;
            // An ember seam lights at the feet and climbs: above it the body scorches, below it nothing.
            hero(fx, {
                period: P,
                from: 'feet',
                cut: ramp(P, T0, 1, T1, 0),
                edge: [3, 1.2, 0.3],
                edgeWidth: 0.07,
                colors: [
                    ['#ffffff', 0],
                    ['#ffffff', T0 / P],
                    ['#7a5a50', 0.35],
                    ['#3a2420', 0.65],
                    ['#3a2420', 1],
                ],
            });
            const seam = cutNode(fx, (t) => between(t, T0, T1));
            // Flames lick up at the seam.
            const fire = flames(fx, {
                parent: seam,
                radius: 0.38,
                height: 0.7,
                size: [0.4, 0.65],
                rate: 30,
                palette: PALETTE.fire,
                loop: false,
                duration: P,
            });
            fire.emissionOverTime = curve(
                [0, 0],
                [T0 / P, 0],
                [T0 / P + 0.01, 30],
                [T1 / P, 30],
                [T1 / P + 0.02, 0],
                [1, 0]
            );
            const glow = fx.sys({
                tex: 'glow',
                loop: false,
                life: 0.05,
                size: 1.8,
                rate: 0,
                color: BURN[4],
                alpha: 0.5,
                parent: seam,
                order: 2,
            });
            glow.emissionOverTime = curve(
                [0, 0],
                [T0 / P, 0],
                [T0 / P + 0.01, 60],
                [T1 / P, 60],
                [T1 / P + 0.01, 0],
                [1, 0]
            );
            // Below it only falling ash and embers; above, smoke.
            const ash = fx.sys({
                tex: 'square',
                world: true,
                loop: false,
                life: [0.8, 1.4],
                speed: [0.1, 0.4],
                size: [0.03, 0.06],
                rate: 0,
                color: ['#4a3a36', '#2a201e'],
                blend: 'alpha',
                shape: new CircleEmitter({radius: 0.36, thickness: 0.3}),
                rotate: FLAT,
                parent: seam,
                order: 3,
                b: [tint([['#ffffff', 0]], fadeOut(0.6)), gravity(1.4), wobble(1, 0.4)],
            });
            ash.emissionOverTime = curve(
                [0, 0],
                [T0 / P, 0],
                [T0 / P + 0.01, 40],
                [T1 / P, 40],
                [T1 / P + 0.01, 0],
                [1, 0]
            );
            const em = embers(fx, {
                parent: seam,
                radius: 0.36,
                rate: 0,
                life: [0.6, 1.2],
                loop: false,
                duration: P,
                world: true,
            });
            em.emissionOverTime = curve(
                [0, 0],
                [T0 / P, 0],
                [T0 / P + 0.01, 25],
                [T1 / P, 25],
                [T1 / P + 0.01, 0],
                [1, 0]
            );
            const fumes = smoke(fx, {parent: seam, rate: 0, loop: false, duration: P, world: true, size: [0.5, 0.8]});
            fumes.emissionOverTime = curve(
                [0, 0],
                [T0 / P, 0],
                [T0 / P + 0.01, 6],
                [(T1 + 0.3) / P, 6],
                [(T1 + 0.3) / P + 0.01, 0],
                [1, 0]
            );
            light(fx, {at: [0, 0.05, 0], size: 3.4, color: BURN[4], floor: true, life: 2.4, alpha: 0.45, time: T0});
            decal(fx, {at: [0, 0.012, 0], size: 1.6, color: '#0a0606', alpha: 0.7, life: 3.2, delay: T0});
        },
    },
    {
        id: 'spawn/egg-hatch',
        name: 'Egg hatch',
        loop: false,
        period: 3.4,
        build(fx) {
            const POP = 2.05;
            // A speckled egg rocks three times, each rock cracking it further, light leaking out.
            const pivot = fx.node('egg', [0, 0, 0]);
            const egg = fx.prop(shapes.sphere(fx.scene, 0.36, 20), {at: [0, 0.46, 0], color: SHELLC[4], parent: pivot});
            egg.scaling.y = 1.28;
            const rocks = [0.35, 0.95, 1.55];
            fx.every((t) => {
                let r = 0;
                for (const r0 of rocks) {
                    const k = (t - r0) / 0.35;
                    if (k > 0 && k < 1) r = Math.sin(k * Math.PI * 3) * 0.28 * (1 - k);
                }
                pivot.rotation.z = r;
                egg.isVisible = t < POP;
            });
            rocks.forEach((r0, i) => {
                // Light leaking through the cracks, brighter each time.
                fx.sys({
                    tex: 'crack',
                    loop: false,
                    life: POP - r0 - 0.15,
                    size: 0.5 + i * 0.15,
                    burst: [[r0 + 0.15, 1]],
                    rot: i * 1.7,
                    color: GOLD[5],
                    alpha: 0.5 + i * 0.25,
                    at: [0.04 * i, 0.5 + 0.1 * i, 0.38],
                    parent: pivot,
                    order: 6,
                    b: [tint([['#ffffff', 0]], fadeOut(0.95, 0.05))],
                });
                star(fx, {
                    at: [0.04 * i, 0.5 + 0.1 * i, 0.4],
                    size: 0.4 + i * 0.15,
                    life: 0.2,
                    time: r0 + 0.15,
                    ramp: hot(GOLD),
                    parent: pivot,
                });
            });
            const leak = fx.sys({
                tex: 'glow',
                loop: false,
                life: 0.05,
                size: 1.4,
                rate: 0,
                color: GOLD[4],
                alpha: 0.3,
                at: [0, 0.5, 0.2],
                order: 2,
            });
            leak.emissionOverTime = curve(
                [0, 0],
                [rocks[0] / 3.4, 0],
                [rocks[0] / 3.4 + 0.01, 60],
                [POP / 3.4, 60],
                [POP / 3.4 + 0.01, 0],
                [1, 0]
            );
            // It pops: light pours out of the opening and lit shell halves tumble away.
            star(fx, {at: [0, 0.6, 0], size: 2.6, life: 0.35, time: POP, tex: 'burst', ramp: hot(GOLD)});
            wedges(fx, {
                at: [0, 0.7, 0],
                radius: 0.3,
                count: 9,
                size: [0.14, 0.24],
                color: GOLD[6],
                time: POP,
                tex: 'streak',
                fly: 4,
                blend: 'add',
                life: [0.25, 0.4],
                arc: Math.PI,
                turn: 0,
            });
            fx.sys({
                geo: lathe(domeProfile(10), 20, Math.PI),
                tex: 'white',
                blend: 'alpha',
                world: true,
                loop: false,
                life: [1, 1.3],
                speed: [2, 3.5],
                size: 0.36,
                burst: [[POP, 2]],
                color: SHELLC[4],
                shape: new ConeEmitter({radius: 0.1, angle: 0.7}),
                aim: 'up',
                at: [0, 0.5, 0],
                tumble: 6,
                order: 4,
                look: {lighting: 'fixed', renderFace: 'both'},
                b: [gravity(9), floorBounce(0.3, 0.05), grow([0, 1], [0.85, 1], [1, 0])],
            });
            clods(fx, {
                at: [0, 0.5, 0],
                count: 8,
                color: [SHELLC[4], SHELLC[3]],
                mesh: 'shard',
                size: [0.05, 0.09],
                delay: POP,
                speed: [1.5, 3.5],
                shape: new ConeEmitter({radius: 0.1, angle: 1}),
                aim: 'up',
            });
            fx.sys({
                tex: 'glint',
                loop: false,
                life: [0.3, 0.6],
                speed: [0.6, 1.5],
                size: [0.12, 0.25],
                burst: [[POP + 0.05, 10]],
                color: [GOLD[6], '#ffffff'],
                shape: new SphereEmitter({radius: 0.3, thickness: 1}),
                at: [0, 0.8, 0],
                order: 7,
                b: [tint(hot(GOLD), fadeOut(0.4, 0.1)), airDrag(2)],
            });
            // And something small and bright is left sitting in the nest.
            const chick = fx.prop(shapes.sphere(fx.scene, 0.22, 16), {
                at: [0, 0.24, 0],
                color: '#ffd54a',
                glow: '#5a3a00',
            });
            fx.every((t) => {
                const k = between(t, POP, POP + 0.3);
                chick.scaling.setAll(k < 1 ? k * (1.2 - 0.2 * k) : 1 + 0.04 * Math.sin(t * 9));
                chick.isVisible = t >= POP;
            });
            light(fx, {at: [0, 0.05, 0], size: 3.6, color: GOLD[4], floor: true, life: 0.9, alpha: 0.55, time: POP});
        },
    },
    {
        id: 'spawn/poof',
        name: 'Poof',
        loop: false,
        period: 1.8,
        build(fx) {
            const at: At = [0, 0.9, 0];
            // A white pop.
            star(fx, {
                at,
                size: 2,
                life: 0.2,
                tex: 'glow',
                ramp: [
                    ['#ffffff', 0],
                    [PUFF[4], 1],
                ],
            });
            star(fx, {
                at,
                size: 1.6,
                life: 0.16,
                tex: 'burst',
                ramp: [
                    ['#ffffff', 0],
                    [PUFF[4], 1],
                ],
            });
            // A ring of soft round smoke balls bursting out between speed lines.
            puffs(fx, {
                at,
                count: 14,
                time: 0.08,
                speed: [1.6, 2.6],
                size: [0.45, 0.8],
                life: [0.9, 1.3],
                color: [PUFF[4], PUFF[5]],
                shape: new CircleEmitter({radius: 0.2, thickness: 1}),
                lift: 0.7,
            });
            puffs(fx, {
                at,
                count: 6,
                time: 0.1,
                speed: [0.3, 0.8],
                size: [0.6, 0.9],
                life: [1, 1.4],
                color: [PUFF[3], PUFF[4]],
                lift: 0.9,
            });
            wedges(fx, {
                at,
                radius: 0.5,
                count: 10,
                size: [0.08, 0.14],
                color: '#ffffff',
                time: 0.06,
                tex: 'streak',
                fly: 5,
                blend: 'add',
                life: [0.15, 0.25],
            });
            // Little stars spinning off.
            fx.sys({
                tex: 'glint',
                loop: false,
                life: [0.6, 0.9],
                speed: [1.5, 3],
                size: [0.15, 0.25],
                burst: [[0.12, 7]],
                color: ['#fff3a6', '#ffffff'],
                shape: new SphereEmitter({radius: 0.3, thickness: 1}),
                at,
                order: 7,
                b: [tint([['#ffffff', 0]], fadeOut(0.6, 0.05)), spin([-8, 8]), gravity(2), airDrag(2)],
            });
            light(fx, {at: [0, 0.05, 0], size: 3, color: PUFF[4], floor: true, life: 0.4, alpha: 0.4});
        },
    },
    {
        id: 'spawn/respawn-beam',
        name: 'Respawn beam',
        loop: false,
        period: 2.8,
        view: {height: 2},
        build(fx) {
            const P = 2.8;
            const DROP = 0.27;
            const SLAM = 0.45;
            const S0 = 0.65;
            const S1 = 1.65;
            // A guide line drops from the sky.
            const sky = fx.node('sky', [0, 6, 0]);
            const foot = fx.node('foot', [0, 6, 0]);
            fx.every((t) => {
                foot.position.y = 6 - 6 * between(t, 0.05, DROP);
            });
            const guide = fx.sys({
                parent: sky,
                beam: foot,
                tex: 'white',
                life: 0.05,
                size: 0.04,
                rate: 0,
                color: BEAM[5],
                order: 6,
            });
            guide.emissionOverTime = curve([0, 0], [0.05 / P, 60], [SLAM / P, 60], [SLAM / P + 0.01, 0], [1, 0]);
            // A pillar of light slams down onto the spot: its foot races down from the sky.
            const colNode = fx.node('column', [0, 6, 0]);
            fx.every((t) => {
                const k = between(t, DROP, SLAM);
                colNode.position.y = 6 * (1 - k);
                colNode.scaling.y = Math.max(0.001, 6 * k);
            });
            const column = lathe(
                [
                    [0.6, 0],
                    [0.6, 1],
                ],
                40
            );
            for (const [face, alpha] of [
                ['back', 0.35],
                ['front', 0.6],
            ] as const) {
                fx.sys({
                    image: 'light-column',
                    geo: column,
                    blend: 'add',
                    loop: false,
                    life: S1 + 0.4 - SLAM,
                    size: 1,
                    burst: [[SLAM, 1]],
                    color: BEAM[4],
                    alpha,
                    order: face === 'back' ? 2 : 6,
                    look: {
                        renderFace: face,
                        scalingMode: 'hierarchy',
                        rim: {color: [0.4, 1, 0.8], power: 2.4, strength: 1, mode: 'fade'},
                    },
                    b: [
                        tint(
                            [
                                ['#ffffff', 0],
                                [BEAM[4], 0.2],
                                [BEAM[3], 1],
                            ],
                            [
                                [1, 0],
                                [0.8, 0.7],
                                [0, 1],
                            ]
                        ),
                    ],
                    parent: colNode,
                });
            }
            shockwave(fx, {at: [0, 0.04, 0], size: 3, life: 0.45, color: BEAM[5], delay: SLAM});
            star(fx, {at: [0, 0.3, 0], size: 2.2, life: 0.25, time: SLAM, tex: 'glow', ramp: hot(BEAM)});
            dust(fx, {
                at: [0, 0.08, 0],
                size: [0.25, 0.4],
                life: [0.5, 0.8],
                burst: [[SLAM, 8]],
                speed: [1, 2],
                color: BEAM[2],
                shape: new CircleEmitter({radius: 0.5, thickness: 0.2}),
                rotate: FLAT,
                alpha: 0.4,
            });
            // A scan bar climbs from the feet writing the character back in, row by row.
            hero(fx, {
                period: P,
                cut: ramp(P, S0, 0, S1, 1),
                edge: [1.5, 3, 2.4],
                edgeWidth: 0.08,
                colors: [['#ffffff', 0]],
            });
            const bar = cutNode(fx, (t) => between(t, S0, S1));
            const barSys = fx.sys({
                geo: lathe(
                    [
                        [0.45, 0],
                        [0.75, 0],
                    ],
                    40
                ),
                tex: 'glow',
                blend: 'add',
                loop: false,
                life: 0.05,
                size: 1,
                rate: 0,
                color: BEAM[5],
                parent: bar,
                order: 7,
                look: {renderFace: 'both'},
            });
            barSys.emissionOverTime = curve(
                [0, 0],
                [S0 / P, 0],
                [S0 / P + 0.01, 60],
                [S1 / P, 60],
                [S1 / P + 0.01, 0],
                [1, 0]
            );
            const sparkle = fx.sys({
                tex: 'square',
                world: true,
                loop: false,
                life: [0.4, 0.8],
                speed: [0.2, 0.6],
                size: [0.03, 0.06],
                rate: 0,
                color: [BEAM[5], '#ffffff'],
                shape: new CircleEmitter({radius: 0.5, thickness: 0.4}),
                rotate: FLAT,
                parent: bar,
                order: 6,
                b: [tint(hot(BEAM), fadeOut(0.5, 0.02)), gravity(0.8, [0, 1, 0])],
            });
            sparkle.emissionOverTime = curve(
                [0, 0],
                [S0 / P, 0],
                [S0 / P + 0.01, 70],
                [S1 / P, 70],
                [S1 / P + 0.01, 0],
                [1, 0]
            );
            light(fx, {at: [0, 0.05, 0], size: 3.4, color: BEAM[4], floor: true, life: 1.5, alpha: 0.5, time: SLAM});
        },
    },
    {
        id: 'spawn/shatter-death',
        name: 'Shatter death',
        loop: false,
        period: 3.4,
        build(fx) {
            const P = 3.4;
            const F0 = 0.2;
            const F1 = 0.9;
            const GLINT = 1.0;
            const BURST = 1.5;
            hero(fx, {period: P, life: BURST});
            // Frost races up the body and seals it in faceted ice.
            hero(fx, {
                period: P,
                geo: SHELL,
                life: BURST,
                blend: 'alpha',
                lighting: 'fixed',
                color: FROST[5],
                alpha: 0.75,
                order: 4,
                cut: ramp(BURST, F0, 0, F1, 1),
                edge: [1.5, 2.5, 3],
                edgeWidth: 0.05,
                rim: [0.6, 0.9, 1.2],
            });
            // A glint sweeps up it.
            hero(fx, {
                period: P,
                geo: SHELL,
                time: GLINT,
                life: 0.4,
                blend: 'add',
                lighting: 'unlit',
                color: '#000000',
                order: 5,
                from: 'feet',
                cut: [
                    [1, 0],
                    [0, 1],
                ],
                edge: [2, 2.6, 3],
                edgeWidth: 0.12,
            });
            // Cracks spread from the chest.
            fx.sys({
                tex: 'crack',
                loop: false,
                life: BURST - 1.15,
                size: 0.6,
                burst: [[1.15, 1]],
                color: '#ffffff',
                at: [0, 1.15, 0.43],
                order: 6,
                b: [tint([['#ffffff', 0]], fadeOut(0.9, 0.1)), grow([0, 0.3], [1, 1.4])],
            });
            // It bursts into its own facets that tumble, bounce and melt.
            clods(fx, {
                at: [0, 0.9, 0],
                count: 26,
                color: [FROST[5], FROST[4]],
                mesh: 'shard',
                size: [0.08, 0.16],
                life: [1.3, 1.8],
                delay: BURST,
                speed: [1.5, 4],
                shape: new SphereEmitter({radius: 0.4, thickness: 1}),
                bounce: 0.35,
            });
            star(fx, {at: [0, 1, 0], size: 2.2, life: 0.25, time: BURST, tex: 'burst', ramp: hot(FROST)});
            dust(fx, {
                at: [0, 0.8, 0],
                size: [0.4, 0.7],
                life: [0.8, 1.3],
                burst: [[BURST, 10]],
                speed: [0.6, 1.6],
                color: FROST[6],
                alpha: 0.35,
                shape: new SphereEmitter({radius: 0.4, thickness: 1}),
            });
            decal(fx, {
                at: [0, 0.012, 0],
                tex: 'flake',
                size: 1.8,
                color: FROST[4],
                blend: 'add',
                alpha: 0.22,
                life: 2.6,
                delay: F0,
            });
            light(fx, {at: [0, 0.05, 0], size: 3.4, color: FROST[4], floor: true, life: 0.6, alpha: 0.5, time: BURST});
        },
    },
    {
        id: 'spawn/soul-rise',
        name: 'Soul rise',
        loop: false,
        period: 3.4,
        view: {height: 2.2, distance: 12},
        build(fx) {
            const P = 3.4;
            const OUT = 0.6;
            // The body stays; its outline flares and dims.
            hero(fx, {period: P});
            hero(fx, {
                period: P,
                geo: SHELL,
                blend: 'add',
                lighting: 'unlit',
                color: SOUL[4],
                alpha: 0.9,
                order: 4,
                rim: [0.6, 0.9, 1.4],
                cut: undefined,
                life: 0.7,
                time: 0.05,
            });
            // A pale glowing copy lifts out, stretching as its legs melt into a wisp.
            const ghost = fx.node('ghost', [0, 0, 0]);
            fx.every((t) => {
                const k = between(t, OUT, P - 0.4);
                ghost.position.y = 2.2 * k * k + 0.4 * k;
                ghost.scaling.y = 1 + 0.35 * k;
            });
            hero(fx, {
                period: P,
                parent: ghost,
                time: OUT,
                life: P - OUT,
                blend: 'add',
                lighting: 'unlit',
                color: SOUL[3],
                alpha: 0.7,
                order: 5,
                from: 'feet',
                rim: [0.8, 1, 1.4],
                cut: [
                    [1, 0],
                    [0.75, 0.3],
                    [0.4, 0.8],
                    [0, 1],
                ],
                edge: [0.5, 0.9, 1.4],
                edgeWidth: 0.2,
            });
            // Shedding motes.
            fx.sys({
                tex: 'square',
                world: true,
                loop: false,
                life: [0.6, 1.2],
                speed: [0.1, 0.4],
                size: [0.03, 0.06],
                rate: 0,
                color: [SOUL[5], '#ffffff'],
                shape: new CircleEmitter({radius: 0.35, thickness: 1}),
                rotate: FLAT,
                at: [0, 0.6, 0],
                parent: ghost,
                order: 6,
                b: [tint(hot(SOUL), fadeOut(0.5, 0.05)), gravity(0.4, [0, 1, 0]), wobble(1.5, 0.5)],
            }).emissionOverTime = curve([0, 0], [OUT / P, 0], [OUT / P + 0.01, 50], [0.95, 50], [0.96, 0], [1, 0]);
            shockwave(fx, {at: [0, 0.04, 0], size: 2.6, life: 0.5, color: SOUL[5], tex: 'ring', delay: OUT});
            light(fx, {at: [0, 0.05, 0], size: 3, color: SOUL[4], floor: true, life: 1.5, alpha: 0.4, time: OUT});
        },
    },
    {
        id: 'spawn/spawn-portal',
        name: 'Spawn portal',
        loop: false,
        period: 3.8,
        build(fx) {
            const P = 3.8;
            const OPEN = 0.3;
            const SPIT = 1.2;
            const SHUT = 2.7;
            // A rift tears open on the floor and swirls.
            const rift = fx.node('rift', [0, 0.03, 0]);
            fx.every((t) => {
                const k = t < SHUT ? between(t, OPEN, OPEN + 0.4) : 1 - between(t, SHUT, SHUT + 0.2);
                rift.scaling.set(k, 1, k);
                rift.rotation.y = -t * (t > SHUT ? 9 : 2.5);
            });
            for (const [tex, size, color, order] of [
                ['swirl', 2.8, RIFT[4], 2],
                ['swirl', 1.9, RIFT[6], 3],
                ['glow', 1.6, RIFT[2], 1],
            ] as const) {
                fx.sys({
                    tex,
                    mode: RenderMode.HorizontalBillBoard,
                    loop: false,
                    life: SHUT + 0.2,
                    size,
                    burst: [[0, 1]],
                    color,
                    parent: rift,
                    order,
                    look: {scalingMode: 'hierarchy'},
                    b: [
                        tint(
                            [['#ffffff', 0]],
                            [
                                [1, 0],
                                [1, 1],
                            ]
                        ),
                        spin(order === 3 ? -3 : -1.5),
                    ],
                });
            }
            decal(fx, {at: [0, 0.012, 0], size: 2.6, color: '#05020a', alpha: 0.9, life: SHUT, delay: OPEN});
            // Violet smoke and sparks belch out of it.
            const fumes = dust(fx, {
                at: [0, 0.1, 0],
                size: [0.4, 0.7],
                life: [1, 1.6],
                rate: 0,
                speed: [0.4, 1],
                color: RIFT[3],
                alpha: 0.45,
                shape: new CircleEmitter({radius: 0.9, thickness: 0.5}),
                rotate: FLAT,
                lift: 0.6,
                duration: P,
            });
            fumes.emissionOverTime = curve(
                [0, 0],
                [OPEN / P, 0],
                [OPEN / P + 0.01, 10],
                [SHUT / P, 10],
                [SHUT / P + 0.01, 0],
                [1, 0]
            );
            const sparks = fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.2, length: 1},
                world: true,
                loop: false,
                life: [0.3, 0.6],
                speed: [2, 4],
                size: [0.03, 0.05],
                rate: 0,
                color: [RIFT[6], '#ffffff'],
                shape: new ConeEmitter({radius: 0.9, angle: 0.5}),
                rotate: [-Math.PI / 2, 0, 0],
                at: [0, 0.05, 0],
                order: 5,
                b: [tint(hot(RIFT), popOut(0.5)), gravity(5)],
            });
            sparks.emissionOverTime = curve(
                [0, 0],
                [OPEN / P, 0],
                [OPEN / P + 0.01, 20],
                [SHUT / P, 20],
                [SHUT / P + 0.01, 0],
                [1, 0]
            );
            // It spits a fountain of wisps up out of itself.
            fx.sys({
                tex: 'dot',
                mode: RenderMode.Trail,
                trail: 14,
                world: true,
                loop: false,
                life: [0.9, 1.3],
                speed: [4, 6],
                size: [0.06, 0.1],
                burst: [[SPIT, 22]],
                color: [RIFT[5], RIFT[6]],
                shape: new ConeEmitter({radius: 0.3, angle: 0.35}),
                rotate: [-Math.PI / 2, 0, 0],
                at: [0, 0.05, 0],
                order: 6,
                b: [tint(hot(RIFT), fadeOut(0.6, 0.02)), gravity(7), wobble(1, 0.4)],
            });
            star(fx, {at: [0, 1.2, 0], size: 1.6, life: 0.3, time: SPIT, tex: 'glow', ramp: hot(RIFT)});
            fx.sys({
                tex: 'streak',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.06, length: 1},
                loop: false,
                life: [0.2, 0.35],
                speed: [8, 12],
                size: [0.1, 0.16],
                burst: [[SPIT, 6]],
                color: RIFT[6],
                shape: new ConeEmitter({radius: 0.15, angle: 0.08}),
                rotate: [-Math.PI / 2, 0, 0],
                order: 7,
                b: [tint([['#ffffff', 0]], popOut(0.3))],
            });
            // Then twists shut with a pop.
            star(fx, {at: [0, 0.2, 0], size: 1.4, life: 0.2, time: SHUT + 0.2, tex: 'burst', ramp: hot(RIFT)});
            puffs(fx, {
                at: [0, 0.3, 0],
                count: 5,
                time: SHUT + 0.2,
                speed: [0.4, 1],
                size: [0.4, 0.6],
                life: [0.8, 1.2],
                color: [RIFT[3], RIFT[2]],
            });
            light(fx, {at: [0, 0.05, 0], size: 4, color: RIFT[4], floor: true, life: SHUT, alpha: 0.4, time: OPEN});
        },
    },
    {
        id: 'spawn/summon-rise',
        name: 'Summon rise',
        loop: false,
        period: 4.8,
        build(fx) {
            const P = 4.8;
            const BURST = 1.1;
            const UP0 = 1.2;
            const UP1 = 3.2;
            // A rune circle burns into the floor.
            fx.sys({
                tex: 'rune',
                mode: RenderMode.HorizontalBillBoard,
                loop: false,
                life: P - 0.3,
                size: 3.6,
                burst: [[0.1, 1]],
                at: [0, 0.02, 0],
                order: 2,
                look: {
                    erosion: {
                        mask: image(fx.scene, 'radial').texture,
                        softness: 0.05,
                        edgeWidth: 0.08,
                        edgeColor: [2, 1.2, 0.4],
                    },
                },
                b: [
                    tint(
                        [
                            [RUNE[6], 0],
                            [RUNE[5], 0.2],
                            [RUNE[4], 0.8],
                            [RUNE[3], 1],
                        ],
                        [
                            [0, 0],
                            [1, 0.15],
                            [1, 0.85],
                            [0, 1],
                        ]
                    ),
                    spin(0.3),
                ],
            });
            light(fx, {
                at: [0, 0.05, 0],
                size: 4.5,
                color: RUNE[4],
                floor: true,
                life: P - 0.4,
                alpha: 0.45,
                time: 0.2,
            });
            // The ground bursts.
            clods(fx, {
                at: [0, 0.1, 0],
                count: 16,
                color: ['#3a2a28', '#5a4440'],
                delay: BURST,
                speed: [2, 4.5],
                shape: new ConeEmitter({radius: 0.6, angle: 0.7}),
                aim: 'up',
            });
            dust(fx, {
                at: [0, 0.1, 0],
                size: [0.5, 0.9],
                life: [1.2, 2],
                burst: [[BURST, 14]],
                speed: [0.8, 2],
                color: '#5a4a48',
                shape: new CircleEmitter({radius: 0.6, thickness: 0.5}),
                rotate: FLAT,
                drag: 2,
                lift: 0.4,
            });
            star(fx, {at: [0, 0.3, 0], size: 2.4, life: 0.25, time: BURST, tex: 'burst', ramp: hot(RUNE)});
            embers(fx, {
                at: [0, 0.1, 0],
                burst: [[BURST, 24]],
                radius: 0.8,
                life: [1, 2],
                loop: false,
                palette: hot(RUNE),
            });
            // A horned brute heaves up out of it, lit from below, until its eyes flare.
            const brute = fx.node('brute', [0, -2.6, 0]);
            fx.every((t) => {
                const k = between(t, UP0, UP1);
                const e = 1 - Math.pow(1 - k, 2.4);
                brute.position.y = -2.6 + 2.6 * e + (k > 0 && k < 1 ? Math.sin(t * 22) * 0.025 : 0);
                brute.rotation.z = k > 0 && k < 1 ? Math.sin(t * 7) * 0.05 : 0;
            });
            const skin = '#4a2a26';
            fx.prop(shapes.box(fx.scene, 1.1, 1.1, 0.7), {at: [0, 1.1, 0], color: skin, parent: brute});
            fx.prop(shapes.box(fx.scene, 0.6, 0.55, 0.55), {at: [0, 1.95, 0.05], color: skin, parent: brute});
            fx.prop(shapes.box(fx.scene, 0.3, 0.9, 0.3), {
                at: [-0.7, 1.05, 0],
                rotate: [0, 0, 0.2],
                color: skin,
                parent: brute,
            });
            fx.prop(shapes.box(fx.scene, 0.3, 0.9, 0.3), {
                at: [0.7, 1.05, 0],
                rotate: [0, 0, -0.2],
                color: skin,
                parent: brute,
            });
            fx.prop(shapes.box(fx.scene, 0.35, 0.6, 0.35), {at: [-0.25, 0.3, 0], color: skin, parent: brute});
            fx.prop(shapes.box(fx.scene, 0.35, 0.6, 0.35), {at: [0.25, 0.3, 0], color: skin, parent: brute});
            for (const side of [-1, 1]) {
                fx.prop(shapes.cylinder(fx.scene, 0.45, 0.01, 0.09, 8), {
                    at: [side * 0.3, 2.35, 0.05],
                    rotate: [0, 0, -side * 0.6],
                    color: '#d8ccb0',
                    parent: brute,
                });
                star(fx, {
                    at: [side * 0.13, 2.0, 0.33],
                    size: 0.35,
                    life: 1.2,
                    time: UP1 - 0.1,
                    tex: 'glow',
                    ramp: [
                        ['#ffffff', 0],
                        [RUNE[5], 0.3],
                        [RUNE[4], 1],
                    ],
                    parent: brute,
                });
                star(fx, {
                    at: [side * 0.13, 2.0, 0.34],
                    size: 0.5,
                    life: 0.35,
                    time: UP1 - 0.1,
                    ramp: hot(RUNE),
                    parent: brute,
                });
            }
            const rubble = dust(fx, {
                at: [0, 0.1, 0],
                size: [0.4, 0.7],
                life: [0.8, 1.3],
                rate: 0,
                speed: [0.4, 1.2],
                color: '#5a4a48',
                shape: new CircleEmitter({radius: 0.7, thickness: 0.3}),
                rotate: FLAT,
                duration: P,
            });
            rubble.emissionOverTime = curve(
                [0, 0],
                [UP0 / P, 0],
                [UP0 / P + 0.01, 10],
                [UP1 / P, 10],
                [UP1 / P + 0.01, 0],
                [1, 0]
            );
            fx.sys({
                tex: 'glow',
                loop: false,
                life: 0.05,
                size: 3,
                rate: 0,
                color: RUNE[4],
                alpha: 0.25,
                at: [0, 0.4, 0.5],
                order: 2,
            }).emissionOverTime = curve([0, 0], [BURST / P, 0], [BURST / P + 0.01, 60], [0.92, 60], [0.93, 0], [1, 0]);
        },
    },
];
