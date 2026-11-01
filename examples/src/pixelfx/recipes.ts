import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {ConeEmitter, type ParticleSystem, RenderMode, SphereEmitter} from 'babylon.quarks';
import type {SysOptions} from './kit';
import {
    drag,
    fadeOut,
    flicker,
    frames,
    gravity,
    grow,
    type Hex,
    lifeFrames,
    type Num,
    popOut,
    spin,
    tint,
    wobble,
} from './kit';
import type {FxBuilder} from './stage';
import {rampTexture} from './textures';

/**
 * Building blocks shared by the gallery's effects: a fire, its smoke and embers, a flash, a
 * shockwave, debris. Each is one or two particle systems with sensible defaults, positioned with
 * `at` under `parent` (the effect's root by default).
 */

export type Ramp = Array<[Hex, number]>;
type V3 = [number, number, number];

/** Colour ramps, hot to cold. The fire and ember stops follow pixelfx's fire palette (MIT). */
export const PALETTE = {
    fire: [
        ['#fff3a6', 0],
        ['#ffc23d', 0.18],
        ['#f2561d', 0.45],
        ['#c9281f', 0.72],
        ['#4a1712', 1],
    ] as Ramp,
    spirit: [
        ['#e8ffff', 0],
        ['#7ff5ff', 0.2],
        ['#2bb5d6', 0.5],
        ['#1d4c8a', 0.8],
        ['#120f3a', 1],
    ] as Ramp,
    ember: [
        ['#fff3a6', 0],
        ['#ff8a2a', 0.3],
        ['#c9281f', 1],
    ] as Ramp,
    ice: [
        ['#ffffff', 0],
        ['#c8f4ff', 0.3],
        ['#6ac7f0', 0.7],
        ['#2a5fa8', 1],
    ] as Ramp,
    electric: [
        ['#ffffff', 0],
        ['#c7f1ff', 0.25],
        ['#5ab8ff', 0.6],
        ['#3a3dd6', 1],
    ] as Ramp,
    plasma: [
        ['#ffffff', 0],
        ['#e7c8ff', 0.2],
        ['#9a5cff', 0.55],
        ['#3a1f9c', 1],
    ] as Ramp,
};

interface Placed {
    at?: V3;
    parent?: TransformNode;
    delay?: Num;
    duration?: number;
    loop?: boolean;
    order?: number;
    world?: boolean;
}

export interface FlameOptions extends Placed {
    radius?: number;
    height?: number;
    size?: Num;
    rate?: Num;
    burst?: SysOptions['burst'];
    palette?: Ramp;
    /** Cone spread in radians. */
    spread?: number;
    aim?: SysOptions['aim'];
    speed?: Num;
    life?: Num;
    /** `puff` draws billowing fire instead of tongues, for jets, blasts and fast flames. */
    puff?: boolean;
}

function scaled(value: Num, k: number): Num {
    if (typeof value === 'number') return value * k;
    if (Array.isArray(value)) return [value[0] * k, value[1] * k];
    return value;
}

/** Tongues of flame rising from a disc: the core of every fire. */
export function flames(fx: FxBuilder, o: FlameOptions = {}): ParticleSystem {
    const height = o.height ?? 1.6;
    const life: Num = o.life ?? [0.45, 0.75];
    const meanLife = Array.isArray(life) ? (life[0] + life[1]) / 2 : typeof life === 'number' ? life : 0.6;
    // pixelfx's own flame tongue (or flame puff) as a heat flipbook, coloured through the ramp.
    return fx.sys({
        image: o.puff ? 'fire-puff-heat' : 'flame-heat',
        // Added, so where tongues overlap the heart of the fire burns toward white.
        blend: o.puff ? 'alpha' : 'add',
        alpha: o.puff ? 1 : 0.75,
        look: {
            gradientMap: {ramp: rampTexture(fx.scene, o.palette ?? PALETTE.fire)},
            // A tongue's sprite stands on its foot, so it grows up from where it is born.
            pivot: o.puff ? undefined : {x: 0, y: 0.45, z: 0},
        },
        rot: o.puff ? true : [-0.2, 0.2],
        life,
        // Tongues stay rooted and lick upward, rather than flying off: a flame, not a spray of them.
        speed:
            o.speed ??
            (o.puff
                ? [(height / meanLife) * 0.6, (height / meanLife) * 0.9]
                : [(height / meanLife) * 0.15, (height / meanLife) * 0.3]),
        size: scaled(o.size ?? [0.6, 1], o.puff ? 1 : 1.7),
        rate: o.burst ? undefined : (o.rate ?? 40),
        burst: o.burst,
        shape: new ConeEmitter({radius: o.radius ?? 0.35, angle: o.spread ?? 0.12, thickness: 1}),
        aim: o.aim ?? 'up',
        at: o.at,
        parent: o.parent,
        delay: o.delay,
        duration: o.duration,
        loop: o.loop,
        world: o.world,
        order: o.order ?? 3,
        b: [
            o.puff ? lifeFrames(16) : frames(12, 24),
            tint([['#ffffff', 0]], o.puff ? popOut(0.8) : fadeOut(0.45, 0.1)),
            grow(
                ...((o.puff
                    ? [
                          [0, 1],
                          [1, 1.3],
                      ]
                    : [
                          [0, 0.7],
                          [0.3, 1],
                          [1, 0.25],
                      ]) as Array<[number, number]>)
            ),
            wobble(2, 0.6),
            drag([0, 1], [1, 0.6]),
        ],
    });
}

/** A hot soft glow at the heart of a fire, flickering. */
export function heart(
    fx: FxBuilder,
    o: Placed & {size?: number; color?: Hex; alpha?: number; rate?: number} = {}
): ParticleSystem {
    const size = o.size ?? 1.6;
    return fx.sys({
        tex: 'glow',
        life: [0.3, 0.5],
        size: [size * 0.8, size * 1.2],
        rate: o.rate ?? 14,
        color: o.color ?? '#ff9a3a',
        alpha: o.alpha ?? 0.55,
        at: o.at,
        parent: o.parent,
        delay: o.delay,
        duration: o.duration,
        loop: o.loop,
        order: o.order ?? 2,
        b: [tint([[o.color ?? '#ffffff', 0]], flicker())],
    });
}

/** A warm pool of light on the floor under a fire or a glowing thing. */
export function pool(fx: FxBuilder, o: Placed & {size?: number; color?: Hex; alpha?: number} = {}): ParticleSystem {
    const size = o.size ?? 4;
    return fx.sys({
        tex: 'glow',
        mode: RenderMode.HorizontalBillBoard,
        life: [0.5, 0.8],
        size: [size * 0.9, size * 1.1],
        rate: 6,
        color: o.color ?? '#ff7a2a',
        alpha: o.alpha ?? 0.3,
        at: o.at ?? [0, 0.02, 0],
        parent: o.parent,
        delay: o.delay,
        duration: o.duration,
        loop: o.loop,
        order: o.order ?? 0,
        b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.3))],
    });
}

/** Sparks and embers drifting up and wandering. */
export function embers(
    fx: FxBuilder,
    o: Placed & {
        radius?: number;
        rate?: Num;
        burst?: SysOptions['burst'];
        speed?: Num;
        size?: Num;
        palette?: Ramp;
        life?: Num;
        spread?: number;
        aim?: SysOptions['aim'];
        rise?: number;
    } = {}
): ParticleSystem {
    return fx.sys({
        tex: 'dot',
        life: o.life ?? [0.8, 1.6],
        speed: o.speed ?? [1, 2.5],
        size: o.size ?? [0.05, 0.1],
        rate: o.burst ? undefined : (o.rate ?? 10),
        burst: o.burst,
        shape: new ConeEmitter({radius: o.radius ?? 0.3, angle: o.spread ?? 0.4, thickness: 1}),
        aim: o.aim ?? 'up',
        at: o.at,
        parent: o.parent,
        delay: o.delay,
        duration: o.duration,
        loop: o.loop,
        world: o.world,
        order: o.order ?? 4,
        b: [tint(o.palette ?? PALETTE.ember, fadeOut(0.6, 0.02)), wobble(1.5, 1.2), gravity(o.rise ?? -0.6)],
    });
}

/** Smoke puffs rising, swelling and thinning. */
export function smoke(
    fx: FxBuilder,
    o: Placed & {
        radius?: number;
        rate?: Num;
        burst?: SysOptions['burst'];
        speed?: Num;
        size?: Num;
        color?: Hex | [Hex, Hex];
        alpha?: number;
        life?: Num;
        spread?: number;
        aim?: SysOptions['aim'];
        shape?: SysOptions['shape'];
        grows?: number;
    } = {}
): ParticleSystem {
    // pixelfx's smoke puff as a flipbook played once over each puff's life.
    return fx.sys({
        image: 'smoke-puff',
        randomTile: false,
        blend: 'alpha',
        life: o.life ?? [1.4, 2.2],
        speed: o.speed ?? [0.6, 1.1],
        size: o.size ?? [0.6, 1],
        rot: true,
        color: o.color ?? '#3d3944',
        alpha: o.alpha ?? 0.55,
        rate: o.burst ? undefined : (o.rate ?? 6),
        burst: o.burst,
        shape: o.shape ?? new ConeEmitter({radius: o.radius ?? 0.3, angle: o.spread ?? 0.3, thickness: 1}),
        aim: o.aim ?? 'up',
        at: o.at,
        parent: o.parent,
        delay: o.delay,
        duration: o.duration,
        loop: o.loop,
        world: o.world,
        order: o.order ?? 1,
        soft: true,
        b: [
            lifeFrames(16),
            grow([0, 0.8], [1, 1 + ((o.grows ?? 2.2) - 1) * 0.5]),
            spin([-0.6, 0.6]),
            wobble(0.8, 0.5),
            drag([0, 1], [1, 0.35]),
        ],
    });
}

/** One bright flash, for an impact or a detonation. */
export function flash(
    fx: FxBuilder,
    o: Placed & {size?: number; color?: Hex; life?: number; time?: number} = {}
): ParticleSystem {
    return fx.sys({
        tex: 'glow',
        life: o.life ?? 0.22,
        size: o.size ?? 4,
        burst: [[o.time ?? 0, 1]],
        color: o.color ?? '#ffffff',
        at: o.at,
        parent: o.parent,
        delay: o.delay,
        duration: o.duration,
        loop: o.loop ?? false,
        order: o.order ?? 6,
        b: [tint([['#ffffff', 0]], popOut(0.15)), grow([0, 0.6], [0.3, 1], [1, 1.2])],
    });
}

/** A ring racing out along the floor (or facing the camera, with `facing`). */
export function shockwave(
    fx: FxBuilder,
    o: Placed & {
        size?: number;
        color?: Hex;
        life?: number;
        tex?: 'shock' | 'ring';
        facing?: boolean;
        alpha?: number;
    } = {}
): ParticleSystem {
    return fx.sys({
        tex: o.tex ?? 'shock',
        mode: o.facing ? RenderMode.BillBoard : RenderMode.HorizontalBillBoard,
        life: o.life ?? 0.5,
        size: o.size ?? 6,
        burst: 1,
        color: o.color ?? '#ffffff',
        alpha: o.alpha ?? 1,
        at: o.at ?? [0, 0.05, 0],
        parent: o.parent,
        delay: o.delay,
        duration: o.duration,
        loop: o.loop ?? false,
        order: o.order ?? 5,
        b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.1], [0.4, 0.8], [1, 1])],
    });
}

/** Sparks flung out from a point, stretched along their motion and falling. */
export function sparks(
    fx: FxBuilder,
    o: Placed & {
        count?: Num;
        rate?: Num;
        speed?: Num;
        size?: Num;
        palette?: Ramp;
        life?: Num;
        gravity?: number;
        shape?: SysOptions['shape'];
        aim?: SysOptions['aim'];
        stretch?: number;
        time?: number;
    } = {}
): ParticleSystem {
    return fx.sys({
        tex: 'dot',
        mode: RenderMode.StretchedBillBoard,
        stretch: {speed: o.stretch ?? 0.06, length: 1},
        life: o.life ?? [0.4, 0.9],
        speed: o.speed ?? [4, 9],
        size: o.size ?? [0.05, 0.09],
        burst: o.rate === undefined ? [[o.time ?? 0, o.count ?? 30]] : undefined,
        rate: o.rate,
        shape: o.shape ?? new SphereEmitter({radius: 0.1, thickness: 1}),
        aim: o.aim,
        at: o.at,
        parent: o.parent,
        delay: o.delay,
        duration: o.duration,
        loop: o.loop ?? (o.rate !== undefined ? undefined : false),
        world: o.world,
        order: o.order ?? 5,
        b: [tint(o.palette ?? PALETTE.ember, popOut(0.5)), gravity(o.gravity ?? 9), drag([0, 1], [1, 0.4])],
    });
}

/** Chunks of rock, ice, wood or metal thrown out as lit meshes that tumble and fall. */
export function debris(
    fx: FxBuilder,
    o: Placed & {
        count?: Num;
        speed?: Num;
        size?: Num;
        color?: Hex | [Hex, Hex];
        life?: Num;
        gravity?: number;
        mesh?: SysOptions['mesh'];
        shape?: SysOptions['shape'];
        aim?: SysOptions['aim'];
    } = {}
): ParticleSystem {
    return fx.sys({
        mesh: o.mesh ?? 'rock',
        tumble: 8,
        life: o.life ?? [1, 1.6],
        speed: o.speed ?? [4, 7],
        size: o.size ?? [0.15, 0.32],
        color: o.color ?? ['#3b3236', '#5e5152'],
        burst: [[0, o.count ?? 14]],
        shape: o.shape ?? new ConeEmitter({radius: 0.3, angle: 0.7, thickness: 1}),
        aim: o.aim ?? 'up',
        at: o.at,
        parent: o.parent,
        delay: o.delay,
        duration: o.duration,
        loop: o.loop ?? false,
        world: o.world,
        order: o.order ?? 2,
        b: [gravity(o.gravity ?? 12), grow([0, 1], [0.85, 1], [1, 0])],
    });
}

/** A decal on the floor: a scorch, a crack, a glow, a frost patch. */
export function decal(
    fx: FxBuilder,
    o: Placed & {
        tex?: SysOptions['tex'];
        size?: number;
        color?: Hex;
        alpha?: number;
        life?: number;
        blend?: SysOptions['blend'];
        alphas?: Array<[number, number]>;
        colors?: Ramp;
        rot?: Num | true;
    } = {}
): ParticleSystem {
    return fx.sys({
        tex: o.tex ?? 'glow',
        mode: RenderMode.HorizontalBillBoard,
        blend: o.blend ?? 'alpha',
        life: o.life ?? 2,
        size: o.size ?? 3,
        rot: o.rot,
        burst: 1,
        color: o.color ?? '#000000',
        alpha: o.alpha ?? 0.6,
        at: o.at ?? [0, 0.015, 0],
        parent: o.parent,
        delay: o.delay,
        duration: o.duration,
        loop: o.loop ?? false,
        order: o.order ?? 0,
        b: [tint(o.colors ?? [['#ffffff', 0]], o.alphas ?? fadeOut(0.6, 0.05))],
    });
}

/**
 * Lightning: flickering bolts from each particle to `to`. Each bolt lives a moment and is
 * replaced, flipping between the bolt sheet's rows, so the arc crackles.
 */
export function arcs(
    fx: FxBuilder,
    o: Placed & {
        to: TransformNode;
        rate?: Num;
        burst?: SysOptions['burst'];
        life?: Num;
        width?: Num;
        palette?: Ramp;
        color?: Hex;
        shape?: SysOptions['shape'];
        aim?: SysOptions['aim'];
    }
): ParticleSystem {
    return fx.sys({
        beam: o.to,
        life: o.life ?? [0.06, 0.12],
        size: o.width ?? [0.3, 0.45],
        rate: o.burst ? undefined : (o.rate ?? 30),
        burst: o.burst,
        color: o.color ?? '#bfe6ff',
        shape: o.shape,
        aim: o.aim,
        at: o.at,
        parent: o.parent,
        delay: o.delay,
        duration: o.duration,
        loop: o.loop,
        order: o.order ?? 5,
        b: [frames(30, 4), tint(o.palette ?? [['#ffffff', 0]], popOut(0.5))],
    });
}

export {drag, gravity, grow, spin, tint};
