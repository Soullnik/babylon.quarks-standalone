import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {ParticleSystem} from 'babylon.quarks';
import {CircleEmitter, ConeEmitter, RenderMode, SphereEmitter} from 'babylon.quarks';
import {airDrag, c3, domeProfile, fadeOut, gravity, grow, lathe, popOut, quad, tint, wobble} from './kit';
import {clods, dust, gate, hotSparks, light, star, wedges, type At} from './parts';
import {decal, embers, shockwave, type Ramp} from './recipes';
import {shapes, type FxBuilder, type FxDef} from './stage';
import {image} from './textures';

/** Ease out, exponential: the snap of a blade that whips out and stops. */
function outExpo(k: number): number {
    return k >= 1 ? 1 : 1 - Math.pow(2, -10 * k);
}

function clamp01(k: number): number {
    return Math.min(1, Math.max(0, k));
}

/** Points `node`'s +z at a point in its parent's space (a cone emitter's axis, say). */
function aimAt(node: TransformNode, target: At): void {
    const from = node.position;
    const d = new BVector3(target[0] - from.x, target[1] - from.y, target[2] - from.z).normalize();
    node.rotation.set(-Math.asin(d.y), Math.atan2(d.x, d.z), 0);
}

/**
 * A swing: an arm turning in a tilted plane about `at`, from angle `from` to `to` (radians in the
 * plane, from its +x toward its +y, so a falling angle turns clockwise as seen from the front),
 * whipping out over `sweep` seconds from `t0` and stopping dead. Nodes ride the arm at any radius;
 * a trail on one with its side axis along the arm sweeps the surface the blade cut.
 */
interface Swing {
    plane: TransformNode;
    arm: TransformNode;
    from: number;
    to: number;
    t0: number;
    sweep: number;
    /** How far round the swing is, 0 to 1, `k` of the way through its sweep. */
    ease(k: number): number;
    /** A node on the arm at radius `r`, its +x along the arm. */
    on(r: number): TransformNode;
    /** A fixed point in the plane at radius `r` and angle `a`. */
    point(r: number, a: number): At;
}

function swing(
    fx: FxBuilder,
    o: {
        at: At;
        tilt: At;
        /** Where the swing turns about, in its tilted plane; the plane's origin by default. */
        centre?: At;
        from: number;
        to: number;
        t0?: number;
        sweep: number;
        ease?: (k: number) => number;
        parent?: TransformNode;
    }
): Swing {
    const ease = o.ease ?? outExpo;
    const tilted = fx.node('swing', o.at, o.parent);
    tilted.rotation.set(...o.tilt);
    const plane = fx.node('hub', o.centre ?? [0, 0, 0], tilted);
    const arm = fx.node('arm', [0, 0, 0], plane);
    const t0 = o.t0 ?? 0;
    const angle = (t: number) => o.from + (o.to - o.from) * ease(clamp01((t - t0) / o.sweep));
    arm.rotation.z = angle(0);
    fx.every((t) => {
        arm.rotation.z = angle(t);
    });
    return {
        plane,
        arm,
        from: o.from,
        to: o.to,
        t0,
        sweep: o.sweep,
        ease,
        on: (r) => fx.node('blade', [r, 0, 0], arm),
        point: (r, a) => [Math.cos(a) * r, Math.sin(a) * r, 0],
    };
}

/** The part of `ramp` from `a` to `b` of the way along it, stretched over 0 to 1. */
function subRamp(ramp: Ramp, a: number, b: number): Ramp {
    const at = (k: number): string => {
        let i = 0;
        while (i < ramp.length - 2 && ramp[i + 1][1] < k) i++;
        const [c0, t0] = ramp[i];
        const [c1, t1] = ramp[i + 1];
        const f = clamp01((k - t0) / Math.max(1e-6, t1 - t0));
        const x = c3(c0)
            .scale(1 - f)
            .add(c3(c1).scale(f));
        return x.toHexString();
    };
    const out: Ramp = [];
    for (let i = 0; i <= 4; i++) out.push([at(a + ((b - a) * i) / 4), i / 4]);
    return out;
}

/**
 * The smear a swing leaves: a crescent between radius `radius - width` and `radius` over the
 * swing's arc, thickest toward its head, its edge brightest, white at first and cooling down `ramp`
 * as it ages. Two erosion cuts along the arc (Unity and Unreal slash meshes do it with a dissolve
 * along U): the first uncovers it from the start as fast as the blade whips round, a hot edge on
 * the cut; after `hold` the second eats it away from the tail into the head over `trail`.
 */
function smear(
    fx: FxBuilder,
    sw: Swing,
    o: {
        radius: number;
        width: number;
        hold: number;
        trail: number;
        ramp: Ramp;
        t0?: number;
        alpha?: number;
        order?: number;
        edge?: [number, number, number];
        /** A crescent thickest toward the head (default), or a lens thickest in the middle. */
        shape?: 'crescent' | 'lens';
        /** Eaten from the tail into the head (default), or closed from both ends. */
        close?: 'tail' | 'ends';
        blend?: 'add' | 'alpha';
        /** Flashes white for a moment at this time. */
        flash?: number;
    }
): ParticleSystem[] {
    const t0 = o.t0 ?? sw.t0;
    const life = sw.sweep + o.hold + o.trail;
    const split = (sw.sweep + o.hold) / life;
    const span = Math.abs(sw.to - sw.from);
    const clockwise = sw.to < sw.from;
    // The ring lies in the lathe's x-z plane; turned onto the swing's plane, its U runs the same way
    // as the swing's angle.
    const ring = fx.node('smear', [0, 0, 0], sw.plane);
    ring.rotation.x = -Math.PI / 2;
    const geo = lathe(
        [
            [o.radius - o.width, 0],
            [o.radius, 0],
        ],
        48,
        span,
        Math.min(sw.from, sw.to)
    );
    // The smear map's head is at U 0, so flip it when the head is at the ring's U 1.
    const flip = {tiling: [-1, 1] as [number, number], offset: [1, 0] as [number, number]};
    const keep = {tiling: [1, 1] as [number, number]};
    const mapUV = clockwise ? keep : flip;
    // Red 1 at the swing's start: shown first, as alpha climbs; at its head: eaten last.
    const fromStart = clockwise ? keep : flip;
    const fromHead = clockwise ? flip : keep;
    const mask = image(fx.scene, 'sweep').texture;
    const ends = o.close === 'ends';
    const base = {
        tex: o.shape === 'lens' ? ('lens' as const) : ('smear' as const),
        blend: o.blend,
        geo,
        loop: false,
        size: 1,
        alpha: o.alpha,
        parent: ring,
        order: o.order ?? 5,
    };
    // Uncovered as the blade goes: the cut follows the swing's ease-out.
    const reveal: Array<[number, number]> = [[0, 0]];
    for (let i = 1; i <= 6; i++) {
        const k = i / 6;
        reveal.push([sw.ease(k), (k * sw.sweep) / (sw.sweep + o.hold)]);
    }
    reveal.push([1, 1]);
    const systems = [
        fx.sys({
            ...base,
            life: sw.sweep + o.hold,
            burst: [[t0, 1]],
            look: {
                mapUV,
                renderFace: 'both',
                erosion: {
                    mask,
                    maskUV: fromStart,
                    softness: 0.1,
                    edgeWidth: 0.08,
                    edgeColor: o.edge ?? [1.5, 1.5, 1.5],
                },
            },
            b: [tint(subRamp(o.ramp, 0, split), reveal)],
        }),
        fx.sys({
            ...base,
            life: o.trail,
            burst: [[t0 + sw.sweep + o.hold, 1]],
            look: {
                mapUV,
                renderFace: 'both',
                erosion: ends
                    ? {mask: image(fx.scene, 'tent').texture, softness: 0.2}
                    : {mask, maskUV: fromHead, softness: 0.25},
            },
            b: [
                tint(subRamp(o.ramp, split, 1), [
                    [1, 0],
                    [0.85, 0.25],
                    [0.5, 0.5],
                    [0.15, 0.75],
                    [0, 1],
                ]),
            ],
        }),
    ];
    if (o.flash !== undefined) {
        systems.push(
            fx.sys({
                ...base,
                blend: 'add',
                life: 0.08,
                color: '#ffffff',
                burst: [[o.flash, 1]],
                order: (o.order ?? 5) + 1,
                look: {mapUV, renderFace: 'both'},
                b: [tint([['#ffffff', 0]], popOut(0.5))],
            })
        );
    }
    return systems;
}

/** A dotted trace of the blade's path, left where the smear has gone and lingering a moment. */
function trace(
    fx: FxBuilder,
    sw: Swing,
    o: {radius: number; color: string; life: number; time: number; size?: number}
) {
    const span = Math.abs(sw.to - sw.from);
    return fx.sys({
        tex: 'dot',
        loop: false,
        life: o.life,
        size: o.size ?? 0.05,
        burst: [[o.time, Math.round(span * o.radius * 14)]],
        color: o.color,
        alpha: 0.8,
        shape: new CircleEmitter({radius: o.radius, thickness: 0, arc: span}),
        rotate: [0, 0, Math.min(sw.from, sw.to)],
        parent: sw.plane,
        order: 4,
        b: [tint([['#ffffff', 0]], fadeOut(0.2, 0.25))],
    });
}

/** Light riding the head of a swing, fading over `life`. */
function headGlow(fx: FxBuilder, sw: Swing, o: {radius: number; size: number; color: string; life: number}) {
    return fx.sys({
        tex: 'glow',
        loop: false,
        life: o.life,
        size: o.size,
        burst: [[sw.t0, 1]],
        color: o.color,
        alpha: 0.5,
        parent: sw.on(o.radius),
        order: 3,
        b: [tint([['#ffffff', 0]], popOut(0))],
    });
}

/**
 * Bright shavings flung outward off the edge, from `from` (a fraction of the swing) to its end, as
 * the swing stops.
 */
function shavings(
    fx: FxBuilder,
    sw: Swing,
    o: {radius: number; count: number; colors: [string, string]; from?: number; time?: number}
) {
    const span = sw.to - sw.from;
    const a = sw.from + span * (o.from ?? 0.3);
    const start = Math.min(a, sw.to);
    return fx.sys({
        tex: 'square',
        world: true,
        loop: false,
        life: [0.25, 0.55],
        speed: [1.2, 4],
        size: [0.05, 0.08],
        burst: [[o.time ?? sw.t0 + sw.sweep, o.count]],
        color: o.colors,
        shape: new CircleEmitter({radius: o.radius, thickness: 0, arc: Math.abs(sw.to - a)}),
        rotate: [0, 0, start],
        parent: sw.plane,
        order: 5,
        b: [tint([['#ffffff', 0]], popOut(0.4)), gravity(1.5), airDrag(3)],
    });
}

/** Sparks off the edge where a swing stops, thrown on along its travel. */
function edgeSparks(fx: FxBuilder, sw: Swing, o: {radius: number; count: number; palette?: Ramp; time?: number}) {
    const end = fx.node('edge', sw.point(o.radius, sw.to), sw.plane);
    const dir = Math.sign(sw.to - sw.from);
    const ahead = sw.point(o.radius, sw.to + dir * 0.3);
    aimAt(end, ahead);
    return hotSparks(fx, {
        parent: end,
        count: o.count,
        time: o.time ?? sw.t0 + sw.sweep,
        shape: new ConeEmitter({radius: 0.02, angle: 0.5}),
        speed: [5, 12],
        life: [0.12, 0.35],
        palette: o.palette,
    });
}

/** A palette from dark to white as a ramp over a smear's age: white, cooling down to its darkest but one. */
function cool(c: string[]): Ramp {
    const n = c.length;
    return [
        [c[n - 1], 0],
        [c[n - 2], 0.12],
        [c[n - 3], 0.32],
        [c[n - 4], 0.58],
        [c[1], 1],
    ];
}

/** Ease in: a heavy swing gathering speed. */
const inQuad = (k: number) => k * k;
/** Ease out, quadratic: a turn that keeps its speed to the end. */
const outQuad = (k: number) => 1 - (1 - k) * (1 - k);
/** Ease out, cubic: a slow reap that settles. */
const outCubic = (k: number) => 1 - Math.pow(1 - k, 3);

/**
 * A swing whose arc passes through `x` (in its plane, from `at`) heading along `heading` (radians,
 * from +x toward +y), `pass` of the way through a clockwise arc of `span` radians on radius `r`.
 */
function through(
    fx: FxBuilder,
    o: {
        at: At;
        tilt: At;
        x: [number, number];
        heading: number;
        r: number;
        span: number;
        pass?: number;
        t0?: number;
        sweep: number;
    }
): Swing {
    // Turning clockwise, the arc at angle a heads along a - pi/2.
    const a = o.heading + Math.PI / 2;
    const pass = o.pass ?? 0.55;
    return swing(fx, {
        at: o.at,
        tilt: o.tilt,
        centre: [o.x[0] - Math.cos(a) * o.r, o.x[1] - Math.sin(a) * o.r, 0],
        from: a + o.span * pass,
        to: a - o.span * (1 - pass),
        t0: o.t0,
        sweep: o.sweep,
    });
}

/** Twinkles left hanging in the air: small four-point stars that flash once at random. */
function twinkles(
    fx: FxBuilder,
    o: {at: At; count: number; time: number; radius: number; colors: [string, string]; parent?: TransformNode}
) {
    return fx.sys({
        tex: 'glint',
        loop: false,
        life: [0.2, 0.45],
        size: [0.12, 0.26],
        burst: [[o.time, o.count]],
        color: o.colors,
        shape: new SphereEmitter({radius: o.radius, thickness: 1}),
        at: o.at,
        parent: o.parent,
        order: 7,
        b: [tint([['#ffffff', 0]], fadeOut(0.3, 0.2)), gravity(0.4, [0, 1, 0])],
    });
}

const SPARK_GOLD: Ramp = [
    ['#fff3a6', 0],
    ['#ffe26b', 0.3],
    ['#ff8a2a', 0.65],
    ['#f2561d', 1],
];
const BLUE = cool(['#212f6b', '#2c58aa', '#3a8bd8', '#62c8f4', '#b8c9e8', '#e8f1ff', '#ffffff']);
const FIRE = ['#2a0808', '#5c0f12', '#a51d1d', '#e2401f', '#ff8a2a', '#ffd166', '#fff3c4', '#ffffff'];
const VIOLET = ['#1b1630', '#3a2f63', '#6150a3', '#9480d8', '#c7b8f5', '#efe9ff', '#ffffff'];
const ROSE = ['#2a0a22', '#5e1238', '#a01f4e', '#e0386a', '#ff86a6', '#ffd2dd', '#ffffff'];
const STEEL = ['#141834', '#242c5c', '#38479a', '#5a72d0', '#8fa8f0', '#c4d4ff', '#eef3ff', '#ffffff'];
const EMBER = ['#2a0c10', '#5c1414', '#a3241a', '#e0481c', '#ff8a2a', '#ffc23d', '#fff0a0', '#ffffff'];
const GHOST = ['#07040c', '#140a22', '#24113a', '#3b1d58', '#5a3a82', '#7fd6c0', '#d8fff2', '#ffffff'];
const JADE = ['#0f2a2a', '#18504a', '#22806e', '#3fb894', '#8fe6c0', '#dcfff0', '#ffffff'];
const ICE = ['#16224a', '#1f4a86', '#2a7fc0', '#48b8ec', '#9fe2ff', '#e2f7ff', '#ffffff'];
const GOLD = ['#2a1608', '#6b3c10', '#b8701a', '#f0b42e', '#ffe27a', '#fff6cf', '#ffffff'];
const AMBER = ['#3a1408', '#7a2a10', '#c4501a', '#f08a2a', '#ffc94a', '#fff2a8', '#ffffff'];
const LEATHER = ['#2a1a10', '#5c3a1e', '#9c6a34', '#d8a45a', '#ffd890', '#fff4d6', '#ffffff'];
const DUST = '#6e6478';

/** A ramp from a palette's top `k` entries, hot first. */
function hot(c: string[], k = 4): Ramp {
    const top = c.slice(-k).reverse();
    return top.map((h, i) => [h, i / (top.length - 1)]);
}

export const melee: FxDef[] = [
    {
        id: 'melee/claw-swipe',
        name: 'Claw swipe',
        loop: false,
        period: 1.4,
        build(fx) {
            fx.character([-0.7, 0, 0]);
            // Three marks raking down and a little back, each lower and further out than the last.
            for (let i = 0; i < 3; i++) {
                const t0 = i * 0.06;
                const R = 2.1;
                const sw = swing(fx, {
                    at: [0.1 + i * 0.36, 1.15 - i * 0.1, 0.35],
                    tilt: [0, -0.45, 0],
                    centre: [R, 0, 0],
                    from: Math.PI - 0.42,
                    to: Math.PI + 0.42,
                    t0,
                    sweep: 0.07,
                });
                smear(fx, sw, {
                    radius: R + 0.1 - i * 0.01,
                    width: 0.3 - i * 0.03,
                    hold: 0.1,
                    trail: 0.32,
                    ramp: cool(FIRE),
                    shape: 'lens',
                    close: 'ends',
                    edge: [1.6, 1.2, 0.6],
                });
                edgeSparks(fx, sw, {radius: R, count: 7, palette: SPARK_GOLD, time: t0 + 0.05});
                // Drips run off the wound and fall.
                fx.sys({
                    tex: 'dot',
                    world: true,
                    loop: false,
                    life: 1.2,
                    size: [0.05, 0.07],
                    burst: [[t0 + 0.08, 2]],
                    color: FIRE[3],
                    shape: new CircleEmitter({radius: R, thickness: 0, arc: 0.4}),
                    rotate: [0, 0, Math.PI - 0.15],
                    parent: sw.plane,
                    order: 5,
                    b: [tint([['#ffffff', 0]], fadeOut(0.7, 0.05)), gravity(2.5)],
                });
                trace(fx, sw, {radius: R + 0.05, color: FIRE[2], life: 0.5, time: t0 + 0.32});
                star(fx, {
                    at: [0, 0, 0],
                    size: 0.45,
                    life: 0.16,
                    time: t0 + 0.03,
                    ramp: hot(FIRE),
                    parent: fx.node('tip', sw.point(R + 0.05, sw.to), sw.plane),
                });
                light(fx, {
                    at: [0.4 + i * 0.3, 0.05, 0.5],
                    size: 2.4,
                    color: FIRE[4],
                    floor: true,
                    life: 0.3,
                    alpha: 0.35,
                    time: t0 + 0.05,
                });
            }
        },
    },
    {
        id: 'melee/dagger-flurry',
        name: 'Dagger flurry',
        loop: false,
        period: 1.6,
        build(fx) {
            fx.character([-0.8, 0, 0]);
            // Small quick crescents at every angle in front, one every 55 ms.
            const cuts: Array<[number, number, number, number]> = [
                [0.25, 1.3, 0.4, 1],
                [0.6, 0.95, -0.6, -1],
                [0.2, 0.8, 2.2, 1],
                [0.7, 1.5, -2.4, -1],
                [0.45, 1.15, 1.1, 1],
                [0.8, 1.1, -1.3, -1],
                [0.35, 1.55, 2.8, 1],
            ];
            cuts.forEach(([x, y, rot, dir], i) => {
                const sw = swing(fx, {
                    at: [x, y, 0.35],
                    tilt: [-0.5, -0.3 * dir, rot],
                    from: 2.4,
                    to: 2.4 - 2.5 * dir,
                    t0: i * 0.055,
                    sweep: 0.05,
                });
                smear(fx, sw, {radius: 0.55, width: 0.24, hold: 0.03, trail: 0.13, ramp: cool(VIOLET)});
                edgeSparks(fx, sw, {radius: 0.5, count: 3, palette: SPARK_GOLD});
            });
            // The finisher: one wide, flat cut right across the front, left to right.
            const t0 = cuts.length * 0.055 + 0.04;
            const big = swing(fx, {at: [0.1, 1.0, 0.1], tilt: [-1.2, 0, 0.12], from: 3.0, to: 5.85, t0, sweep: 0.08});
            smear(fx, big, {radius: 1.35, width: 0.45, hold: 0.06, trail: 0.26, ramp: cool(VIOLET)});
            headGlow(fx, big, {radius: 1.15, size: 2.2, color: VIOLET[3], life: 0.2});
            edgeSparks(fx, big, {radius: 1.2, count: 12, palette: SPARK_GOLD});
            shavings(fx, big, {radius: 1.35, count: 14, colors: [VIOLET[4], VIOLET[5]]});
            const end = fx.node('end', big.point(1.2, big.to), big.plane);
            star(fx, {at: [0, 0, 0], size: 1, life: 0.26, time: t0 + 0.05, ramp: hot(VIOLET), parent: end});
            wedges(fx, {
                at: [0, 0, 0],
                radius: 0.25,
                count: 4,
                size: [0.1, 0.16],
                color: VIOLET[5],
                time: t0 + 0.1,
                tex: 'streak',
                fly: 3,
                blend: 'add',
            });
            twinkles(fx, {at: [0.2, 1.0, 0.5], count: 5, time: t0 + 0.1, radius: 0.8, colors: [VIOLET[5], '#ffffff']});
            light(fx, {
                at: [0.3, 0.05, 0.6],
                size: 4,
                color: VIOLET[3],
                floor: true,
                life: 0.45,
                alpha: 0.45,
                time: t0 + 0.08,
            });
        },
    },
    {
        id: 'melee/double-slash',
        name: 'Double slash',
        loop: false,
        period: 1.3,
        build(fx) {
            fx.character([-0.8, 0, 0]);
            const X: At = [0.55, 1.1, 0.35];
            const UP = 0.16;
            const CLOSE = UP + 0.02;
            const tilt: At = [-0.3, -0.35, 0];
            const down = through(fx, {at: X, tilt, x: [0, 0], heading: -0.72, r: 2.4, span: 0.84, sweep: 0.07});
            const up = through(fx, {at: X, tilt, x: [0, 0], heading: 0.66, r: 2.4, span: 0.84, t0: UP, sweep: 0.07});
            for (const [sw, hold] of [
                [down, UP + 0.1],
                [up, 0.1],
            ] as Array<[Swing, number]>) {
                smear(fx, sw, {
                    radius: 2.45,
                    width: 0.42,
                    hold,
                    trail: 0.28,
                    ramp: cool(ROSE),
                    shape: 'lens',
                    flash: CLOSE,
                });
                edgeSparks(fx, sw, {radius: 2.3, count: 6, palette: SPARK_GOLD});
                shavings(fx, sw, {radius: 2.45, count: 10, colors: [ROSE[4], ROSE[5]]});
                trace(fx, sw, {radius: 2.25, color: ROSE[3], life: 0.5, time: sw.t0 + sw.sweep + hold + 0.1});
            }
            // The crossing: a flare, sparks, slivers flying off it, twinkles, light.
            const cross = fx.node('cross', X);
            star(fx, {at: [0, 0, 0], size: 1.6, life: 0.26, time: CLOSE, ramp: hot(ROSE), parent: cross});
            hotSparks(fx, {
                parent: cross,
                count: 18,
                time: CLOSE,
                speed: [4, 10],
                life: [0.14, 0.4],
                palette: SPARK_GOLD,
            });
            wedges(fx, {
                at: X,
                radius: 0.25,
                count: 4,
                size: [0.1, 0.18],
                color: ROSE[5],
                time: CLOSE + 0.03,
                tex: 'streak',
                fly: 3.5,
                blend: 'add',
            });
            twinkles(fx, {at: X, count: 5, time: CLOSE, radius: 0.5, colors: [ROSE[5], '#ffffff']});
            light(fx, {at: X, size: 3, color: ROSE[3], life: 0.4, alpha: 0.45, time: CLOSE});
            light(fx, {
                at: [X[0], 0.05, X[2]],
                size: 3.6,
                color: ROSE[3],
                floor: true,
                life: 0.4,
                alpha: 0.35,
                time: CLOSE,
            });
        },
    },
    {
        id: 'melee/hammer-smash',
        name: 'Hammer smash',
        loop: false,
        period: 2,
        build(fx) {
            fx.character([-0.7, 0, 0]);
            // The hammer comes over from behind and down in front, gathering speed.
            const DROP = 0.15;
            const sw = swing(fx, {
                at: [-0.35, 1.2, 0.3],
                tilt: [0, 0, 0],
                from: 2.2,
                to: -0.72,
                sweep: DROP,
                ease: inQuad,
            });
            fx.prop(shapes.cylinder(fx.scene, 1.5, 0.035), {
                at: [0.75, 0, 0],
                rotate: [0, 0, Math.PI / 2],
                color: '#5a4030',
                parent: sw.arm,
            });
            fx.prop(shapes.box(fx.scene, 0.3, 0.5, 0.3), {
                at: [1.5, 0, 0],
                color: '#6a6f86',
                parent: sw.arm,
            });
            // It rests on the floor, then lifts back over the shoulder for the next blow.
            fx.every((t) => {
                const k = clamp01((t - 1.55) / 0.4);
                sw.arm.rotation.z = t < 1.55 ? sw.arm.rotation.z : -0.72 + (2.2 + 0.72) * outQuad(k);
            });
            smear(fx, sw, {radius: 1.75, width: 0.6, hold: 0.04, trail: 0.2, ramp: cool(STEEL), alpha: 0.85});
            const hit: At = [0.8, 0.1, 0.3];
            const at = fx.node('hit', hit);
            // The slam: a white star with rays, a dome of force, a dent with cracks.
            star(fx, {at: [0, 0.2, 0], size: 1.5, life: 0.2, time: DROP, tex: 'burst', ramp: hot(STEEL), parent: at});
            hotSparks(fx, {
                parent: at,
                count: 16,
                time: DROP,
                speed: [6, 12],
                life: [0.12, 0.3],
                palette: hot(STEEL),
                shape: new ConeEmitter({radius: 0.05, angle: 1.2}),
                aim: 'up',
            });
            fx.sys({
                geo: lathe(domeProfile(), 40),
                tex: 'white',
                loop: false,
                life: 0.45,
                size: 1.4,
                burst: [[DROP, 1]],
                color: STEEL[5],
                parent: at,
                order: 4,
                look: {renderFace: 'both', rim: {color: [0.8, 0.9, 1.4], power: 2, strength: 1, mode: 'fade'}},
                b: [tint(hot(STEEL), popOut(0.1)), grow([0, 0.2], [0.5, 0.95], [1, 1.1])],
            });
            shockwave(fx, {at: [hit[0], 0.04, hit[2]], size: 3.4, life: 0.4, color: STEEL[5], delay: DROP});
            decal(fx, {
                at: [hit[0], 0.012, hit[2]],
                tex: 'crack',
                size: 1.8,
                color: '#05060c',
                alpha: 0.85,
                life: 1.7,
                delay: DROP,
                rot: 0.4,
            });
            decal(fx, {
                at: [hit[0], 0.014, hit[2]],
                tex: 'crack',
                size: 1.8,
                color: STEEL[4],
                blend: 'add',
                alpha: 0.9,
                life: 0.6,
                delay: DROP,
                rot: 0.4,
                alphas: popOut(0.1),
            });
            clods(fx, {
                at: [hit[0], 0.1, hit[2]],
                count: 10,
                color: ['#4a4560', '#6a6380'],
                delay: DROP,
                speed: [2.5, 5],
                shape: new ConeEmitter({radius: 0.2, angle: 0.8}),
                aim: 'up',
            });
            dust(fx, {
                at: [hit[0], 0.1, hit[2]],
                size: [0.35, 0.6],
                life: [0.7, 1.2],
                burst: [[DROP, 9]],
                speed: [1, 2.5],
                color: '#7a7088',
                shape: new ConeEmitter({radius: 0.2, angle: 1.35}),
                aim: 'up',
                drag: 3,
            });
            light(fx, {
                at: [hit[0], 0.05, hit[2]],
                size: 4.5,
                color: STEEL[4],
                floor: true,
                life: 0.5,
                alpha: 0.55,
                time: DROP,
            });
        },
    },
    {
        id: 'melee/heavy-cleave',
        name: 'Heavy cleave',
        loop: false,
        period: 1.9,
        build(fx) {
            fx.character([-0.7, 0, 0]);
            const RAISE = 0.2;
            const HIT = RAISE + 0.135;
            // The blade glints high over the head before it comes down.
            star(fx, {at: [-0.75, 2.35, 0.2], size: 0.7, life: 0.25, time: 0.04, ramp: hot(EMBER)});
            const sw = swing(fx, {
                at: [-0.45, 1.05, 0.3],
                tilt: [0, -0.2, 0],
                from: 2.0,
                to: -0.72,
                t0: RAISE,
                sweep: 0.135,
                ease: inQuad,
            });
            smear(fx, sw, {radius: 1.6, width: 0.7, hold: 0.05, trail: 0.24, ramp: cool(EMBER), edge: [1.6, 1.1, 0.5]});
            headGlow(fx, sw, {radius: 1.3, size: 2.4, color: EMBER[4], life: 0.2});
            const hit: At = [0.72, 0.08, 0.5];
            const at = fx.node('hit', hit);
            star(fx, {at: [0, 0.15, 0], size: 1.4, life: 0.18, time: HIT, tex: 'burst', ramp: hot(EMBER), parent: at});
            // Glowing cracks that cool, over a dark scar.
            decal(fx, {
                at: [hit[0], 0.012, hit[2]],
                tex: 'crack',
                size: 2,
                color: '#0a0406',
                alpha: 0.8,
                life: 1.5,
                delay: HIT,
                rot: 1.2,
            });
            decal(fx, {
                at: [hit[0], 0.014, hit[2]],
                tex: 'crack',
                size: 2,
                color: '#ffffff',
                blend: 'add',
                alpha: 1,
                life: 1.2,
                delay: HIT,
                rot: 1.2,
                colors: [
                    ['#fff0a0', 0],
                    ['#ff8a2a', 0.3],
                    ['#a3241a', 0.7],
                    ['#2a0c10', 1],
                ],
                alphas: popOut(0.4),
            });
            // Dust rolling both ways along the floor, grit, rising embers.
            for (const aim of ['left', 'right'] as const) {
                dust(fx, {
                    at: [hit[0], 0.1, hit[2]],
                    size: [0.3, 0.5],
                    life: [0.8, 1.3],
                    burst: [[HIT, 6]],
                    speed: [1.5, 3],
                    color: '#6a5a58',
                    aim,
                    shape: new ConeEmitter({radius: 0.1, angle: 0.5}),
                    drag: 2.5,
                });
            }
            clods(fx, {
                at: [hit[0], 0.1, hit[2]],
                count: 8,
                color: ['#3a2a28', '#5a4440'],
                size: [0.04, 0.08],
                delay: HIT,
                speed: [2, 4],
                shape: new ConeEmitter({radius: 0.15, angle: 0.9}),
                aim: 'up',
            });
            hotSparks(fx, {
                parent: at,
                count: 14,
                time: HIT,
                speed: [4, 9],
                palette: SPARK_GOLD,
                shape: new ConeEmitter({radius: 0.05, angle: 1}),
                aim: 'up',
            });
            embers(fx, {at: [hit[0], 0.1, hit[2]], burst: [[HIT, 18]], radius: 0.5, life: [0.8, 1.5], loop: false});
            light(fx, {
                at: [hit[0], 0.05, hit[2]],
                size: 4.5,
                color: EMBER[4],
                floor: true,
                life: 0.6,
                alpha: 0.6,
                time: HIT,
            });
        },
    },
    {
        id: 'melee/scythe-reap',
        name: 'Scythe reap',
        loop: false,
        period: 2.4,
        build(fx) {
            fx.character([0, 0, 0]);
            const T0 = 0.08;
            const SWEEP = 0.34;
            const HANG = 0.14;
            const TEAR = 0.55;
            // A slow, huge crescent round the front at the waist, from behind the right to the left.
            const sw = swing(fx, {
                at: [0, 0.95, 0],
                tilt: [-1.2, 0, 0.12],
                from: 0.3,
                to: -3.4,
                t0: T0,
                sweep: SWEEP,
                ease: outCubic,
            });
            const dark: Ramp = [
                [GHOST[4], 0],
                [GHOST[3], 0.4],
                [GHOST[2], 1],
            ];
            smear(fx, sw, {
                radius: 1.9,
                width: 0.8,
                hold: HANG,
                trail: TEAR,
                ramp: dark,
                blend: 'alpha',
                alpha: 0.9,
                order: 4,
                edge: [0.3, 0.9, 0.8],
            });
            // Its pale, ghostly edge.
            smear(fx, sw, {radius: 1.95, width: 0.16, hold: HANG, trail: TEAR * 0.8, ramp: cool(GHOST), order: 6});
            headGlow(fx, sw, {radius: 1.8, size: 1.8, color: GHOST[5], life: 0.4});
            // It tears away into curling wisps and cold vapour.
            const span = Math.abs(sw.to - sw.from);
            const tear = T0 + SWEEP + HANG;
            fx.sys({
                tex: 'dot',
                loop: false,
                life: [0.6, 1.1],
                speed: [0.2, 0.6],
                size: [0.05, 0.1],
                rate: 0,
                burst: [[tear, 40]],
                color: [GHOST[5], GHOST[6]],
                shape: new CircleEmitter({radius: 1.85, thickness: 0.1, arc: span}),
                rotate: [0, 0, sw.to],
                parent: sw.plane,
                order: 6,
                b: [tint([['#ffffff', 0]], fadeOut(0.4, 0.1)), wobble(2, 1.2), gravity(0.6, [0, 1, 0])],
            });
            dust(fx, {
                at: [0, 0, 0],
                parent: sw.plane,
                shape: new CircleEmitter({radius: 1.8, thickness: 0.2, arc: span}),
                rotate: [0, 0, sw.to],
                size: [0.3, 0.55],
                life: [0.8, 1.3],
                burst: [[tear, 12]],
                speed: [0.1, 0.4],
                color: GHOST[5],
                alpha: 0.3,
                lift: 0.5,
            });
            trace(fx, sw, {radius: 1.9, color: GHOST[5], life: 0.6, time: tear + 0.1});
            light(fx, {
                at: [0, 0.05, 0.4],
                size: 5,
                color: GHOST[4],
                floor: true,
                life: 0.9,
                alpha: 0.4,
                time: T0 + 0.1,
            });
        },
    },
    {
        id: 'melee/spear-sweep',
        name: 'Spear sweep',
        loop: false,
        period: 1.8,
        build(fx) {
            fx.character([0, 0, 0]);
            const T0 = 0.12;
            // The point gleams behind the legs before the sweep.
            star(fx, {at: [-1.6, 0.35, -0.6], size: 0.9, life: 0.2, ramp: hot(JADE), tex: 'glow'});
            // A long flat crescent at shin height, from behind the legs round the front.
            const sw = swing(fx, {
                at: [0, 0.32, 0],
                tilt: [-Math.PI / 2 + 0.06, 0, 0],
                from: 2.6,
                to: 6.2,
                t0: T0,
                sweep: 0.13,
            });
            smear(fx, sw, {radius: 2.2, width: 0.55, hold: 0.06, trail: 0.32, ramp: cool(JADE)});
            headGlow(fx, sw, {radius: 2, size: 1.6, color: JADE[3], life: 0.25});
            edgeSparks(fx, sw, {radius: 2.1, count: 6, palette: hot(JADE)});
            // The wind of it kicks a wake of dust and grit along the floor.
            dust(fx, {
                at: [0, 0, 0],
                parent: sw.plane,
                shape: new CircleEmitter({radius: 2, thickness: 0.15, arc: 3.2}),
                rotate: [0, 0, 2.9],
                size: [0.3, 0.55],
                life: [0.7, 1.2],
                burst: [[T0 + 0.08, 16]],
                speed: [0.4, 1.2],
                color: DUST,
                drag: 2,
            });
            fx.sys({
                tex: 'square',
                world: true,
                loop: false,
                life: [0.3, 0.6],
                speed: [1, 2.5],
                size: [0.03, 0.05],
                burst: [[T0 + 0.08, 14]],
                color: ['#8a7f90', '#5a5068'],
                shape: new CircleEmitter({radius: 2, thickness: 0.1, arc: 3.2}),
                rotate: [0, 0, 2.9],
                parent: sw.plane,
                order: 4,
                b: [tint([['#ffffff', 0]], popOut(0.5)), gravity(6)],
            });
            light(fx, {
                at: [0, 0.05, 0.8],
                size: 5,
                color: JADE[3],
                floor: true,
                life: 0.45,
                alpha: 0.4,
                time: T0 + 0.05,
            });
        },
    },
    {
        id: 'melee/spin-slash',
        name: 'Spin slash',
        loop: false,
        period: 1.4,
        build(fx) {
            fx.character([0, 0, 0]);
            const SW = 0.17;
            const R = 1.3;
            // Once round the waist on a tilted plane: from front right, behind the body, back across the front.
            const sw = swing(fx, {
                at: [0, 0.95, 0],
                tilt: [-1.3, 0, -0.1],
                from: -0.5,
                to: -0.5 + Math.PI * 2,
                sweep: SW,
                ease: outQuad,
            });
            smear(fx, sw, {radius: R, width: 0.38, hold: 0, trail: 0.14, ramp: cool(ICE)});
            smear(fx, sw, {radius: R * 0.8, width: 0.12, hold: 0, trail: 0.12, ramp: cool(ICE), t0: 0.025, alpha: 0.7});
            headGlow(fx, sw, {radius: R - 0.2, size: 1.8, color: ICE[3], life: SW + 0.05});
            // Closed, the ring flares white, swells a little, thins, cools and breaks into dots.
            const ring = fx.node('ring', [0, 0, 0], sw.plane);
            ring.rotation.x = -Math.PI / 2;
            fx.sys({
                geo: lathe(
                    [
                        [R - 0.12, 0],
                        [R + 0.02, 0],
                    ],
                    64
                ),
                tex: 'white',
                loop: false,
                life: 0.3,
                size: 1,
                burst: [[SW, 1]],
                parent: ring,
                order: 6,
                look: {renderFace: 'both'},
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            [ICE[4], 0.2],
                            [ICE[2], 1],
                        ],
                        popOut(0.15)
                    ),
                    grow([0, 1], [0.4, 1.12], [1, 1.16]),
                ],
            });
            fx.sys({
                tex: 'dot',
                loop: false,
                life: 0.45,
                size: 0.05,
                burst: [[SW + 0.06, 110]],
                color: ICE[4],
                shape: new CircleEmitter({radius: R * 1.1, thickness: 0}),
                parent: sw.plane,
                order: 5,
                b: [tint([['#ffffff', 0]], fadeOut(0.2, 0.2))],
            });
            edgeSparks(fx, sw, {radius: R, count: 9, palette: SPARK_GOLD, time: SW});
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.45, length: 1},
                world: true,
                loop: false,
                life: [0.12, 0.32],
                speed: [3, 6],
                size: [0.04, 0.06],
                burst: [[SW, 16]],
                shape: new CircleEmitter({radius: R, thickness: 0}),
                parent: sw.plane,
                order: 5,
                b: [tint(SPARK_GOLD, popOut(0.5)), gravity(8)],
            });
            twinkles(fx, {
                at: [0, 0, 0],
                parent: sw.plane,
                count: 6,
                time: SW,
                radius: R + 0.1,
                colors: [ICE[5], '#ffffff'],
            });
            star(fx, {
                at: [0, 0, 0],
                size: 0.9,
                life: 0.24,
                time: SW * 0.85,
                ramp: hot(ICE),
                parent: fx.node('tip', sw.point(R - 0.1, sw.to), sw.plane),
            });
            light(fx, {at: [0, 0.05, 0], size: 4.5, color: ICE[3], floor: true, life: 0.45, alpha: 0.4, time: SW});
        },
    },
    {
        id: 'melee/sword-slash',
        name: 'Sword slash',
        loop: false,
        period: 1.4,
        build(fx) {
            fx.character([-0.7, 0, 0]);
            // A tilted crescent: up behind the left shoulder, over, and down in front to the right.
            const sw = swing(fx, {
                at: [-0.45, 1.1, 0.25],
                tilt: [-1.05, 0.35, -0.38],
                from: 2.55,
                to: -0.95,
                sweep: 0.12,
            });
            const R = 1.7;
            smear(fx, sw, {radius: R, width: 0.5, hold: 0.06, trail: 0.26, ramp: BLUE});
            // A thinner echo just inside it, a beat behind.
            smear(fx, sw, {radius: R * 0.79, width: 0.2, hold: 0.03, trail: 0.2, ramp: BLUE, t0: 0.017, alpha: 0.8});
            trace(fx, sw, {radius: R - 0.03, color: '#2c58aa', life: 0.5, time: 0.2});
            headGlow(fx, sw, {radius: R - 0.2, size: 2.4, color: '#62c8f4', life: 0.3});
            edgeSparks(fx, sw, {radius: R - 0.15, count: 10, palette: SPARK_GOLD});
            shavings(fx, sw, {radius: R, count: 16, colors: ['#b8c9e8', '#e8f1ff']});
            star(fx, {
                at: [0, 0, 0],
                size: 0.9,
                life: 0.22,
                time: sw.sweep * 0.6,
                ramp: [
                    ['#ffffff', 0],
                    ['#e8f1ff', 0.4],
                    ['#62c8f4', 1],
                ],
                parent: fx.node('tip', sw.point(R - 0.15, sw.to), sw.plane),
            });
            // The step into the cut kicks dust from both feet.
            dust(fx, {
                at: [-0.3, 0.05, 0],
                size: [0.25, 0.4],
                life: [0.4, 0.7],
                burst: [[0.1, 7]],
                speed: [0.6, 1.4],
                color: '#6e6478',
                aim: 'right',
                shape: new ConeEmitter({radius: 0.1, angle: 1}),
            });
            dust(fx, {
                at: [-1.1, 0.05, 0],
                size: [0.2, 0.35],
                life: [0.4, 0.6],
                burst: [[0.1, 4]],
                speed: [0.5, 1],
                color: '#6e6478',
                aim: 'left',
                shape: new ConeEmitter({radius: 0.1, angle: 1}),
            });
            light(fx, {
                at: [0.6, 0.05, 0.4],
                size: 3.2,
                color: '#3a8bd8',
                floor: true,
                life: 0.4,
                alpha: 0.4,
                time: 0.05,
            });
        },
    },
    {
        id: 'melee/thrust',
        name: 'Thrust',
        loop: false,
        period: 1.3,
        build(fx) {
            fx.character([-1.3, 0, 0]);
            const OUT = 0.09;
            const HOLD = 0.06;
            const PULL = 0.2;
            const hand = fx.node('hand', [-0.85, 1.1, 0.25]);
            const point: At = [1.6, 1.1, 0.25];
            // The point shoots out from the hand, holds, and the streaks pull back after it.
            const tip = fx.node('tip', [-0.85, 1.1, 0.25]);
            fx.every((t) => {
                const k = t < OUT + HOLD ? outExpo(clamp01(t / OUT)) : 1 - clamp01((t - OUT - HOLD) / PULL) * 0.15;
                tip.position.x = -0.85 + (point[0] + 0.85) * k;
            });
            const beams: Array<[number, number, string, number]> = [
                [0, 0.05, '#ffffff', 8],
                [0.04, 0.16, GOLD[4], 7],
                [-0.05, 0.1, GOLD[3], 6],
            ];
            for (const [dy, width, color, order] of beams) {
                const from = fx.node('from', [0, dy, 0], hand);
                const sys = fx.sys({
                    parent: from,
                    beam: tip,
                    tex: 'white',
                    life: 0.05,
                    size: width,
                    rate: 60,
                    color,
                    alpha: 0.8,
                    order,
                });
                gate(sys, 1.3, 0, OUT + HOLD + PULL * 0.6, 60);
            }
            // A bundle of streaks racing out along it.
            fx.sys({
                tex: 'streak',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.04, length: 1},
                loop: false,
                life: [0.08, 0.16],
                speed: [20, 34],
                size: [0.05, 0.1],
                burst: [[0, 12]],
                color: [GOLD[5], '#ffffff'],
                shape: new ConeEmitter({radius: 0.12, angle: 0.03}),
                aim: 'right',
                parent: hand,
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.4))],
            });
            // A long four-point star at the point, and a pierce ring round the line of the thrust.
            const at = fx.node('point', point);
            star(fx, {at: [0, 0, 0], size: 1.4, life: 0.3, time: OUT, ramp: hot(GOLD), parent: at});
            star(fx, {at: [0, 0, 0], size: 3.2, life: 0.22, time: OUT, tex: 'streak', ramp: hot(GOLD), parent: at});
            fx.sys({
                geo: quad(),
                tex: 'ring',
                loop: false,
                life: 0.28,
                size: 0.9,
                burst: [[OUT, 1]],
                color: GOLD[4],
                parent: at,
                rotate: [0, Math.PI / 2, 0],
                order: 6,
                look: {renderFace: 'both'},
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.3], [0.5, 1], [1, 1.25])],
            });
            hotSparks(fx, {
                parent: at,
                count: 12,
                time: OUT,
                speed: [4, 9],
                palette: SPARK_GOLD,
                shape: new ConeEmitter({radius: 0.05, angle: 0.6}),
                aim: 'right',
            });
            // Speed lines in the air along the thrust.
            fx.sys({
                tex: 'streak',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.05, length: 1},
                loop: false,
                life: [0.12, 0.2],
                speed: [8, 14],
                size: [0.03, 0.05],
                burst: [[0.02, 10]],
                color: GOLD[5],
                alpha: 0.6,
                shape: new ConeEmitter({radius: 0.5, angle: 0}),
                aim: 'right',
                at: [-0.3, 1.1, 0.25],
                order: 4,
                b: [tint([['#ffffff', 0]], popOut(0.2))],
            });
            light(fx, {at: point, size: 2.4, color: GOLD[4], life: 0.3, alpha: 0.45, time: OUT});
            light(fx, {
                at: [point[0], 0.05, point[2]],
                size: 3,
                color: GOLD[3],
                floor: true,
                life: 0.35,
                alpha: 0.35,
                time: OUT,
            });
        },
    },
    {
        id: 'melee/uppercut',
        name: 'Uppercut',
        loop: false,
        period: 1.3,
        build(fx) {
            fx.character([-0.4, 0, 0]);
            // A crescent rising from the floor past the face, on the near side.
            const sw = swing(fx, {at: [-0.2, 0.9, 0.35], tilt: [0, -0.5, 0], from: -1.75, to: 1.2, sweep: 0.1});
            smear(fx, sw, {radius: 1.2, width: 0.42, hold: 0.05, trail: 0.24, ramp: cool(AMBER)});
            headGlow(fx, sw, {radius: 1.05, size: 1.8, color: AMBER[4], life: 0.2});
            // At the top a comic impact star: bold dark outline, hot body, white core.
            const top = fx.node('top', sw.point(1.1, sw.to), sw.plane);
            const T = 0.11;
            const pop = grow([0, 0.3], [0.25, 1.15], [0.4, 1], [1, 0.7]);
            fx.sys({
                tex: 'burst',
                blend: 'alpha',
                loop: false,
                life: 0.32,
                size: 1.5,
                burst: [[T, 1]],
                rot: 0.2,
                color: AMBER[0],
                parent: top,
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.6)), pop],
            });
            fx.sys({
                tex: 'burst',
                loop: false,
                life: 0.32,
                size: 1.25,
                burst: [[T, 1]],
                rot: 0.2,
                color: AMBER[4],
                parent: top,
                order: 7,
                b: [tint([['#ffffff', 0]], popOut(0.6)), pop],
            });
            fx.sys({
                tex: 'glow',
                loop: false,
                life: 0.25,
                size: 0.7,
                burst: [[T, 1]],
                color: '#ffffff',
                parent: top,
                order: 8,
                b: [tint([['#ffffff', 0]], popOut(0.3)), pop],
            });
            wedges(fx, {
                at: [0, 0, 0],
                radius: 0.7,
                count: 8,
                size: [0.08, 0.14],
                color: AMBER[5],
                time: T + 0.02,
                blend: 'add',
                reach: 3,
            });
            twinkles(fx, {
                at: [0, 0, 0],
                parent: top,
                count: 6,
                time: T + 0.05,
                radius: 0.7,
                colors: [AMBER[5], '#ffffff'],
            });
            hotSparks(fx, {parent: top, count: 12, time: T, speed: [3, 7], palette: SPARK_GOLD});
            light(fx, {at: [0.6, 2.0, 0.6], size: 3, color: AMBER[4], life: 0.35, alpha: 0.5, time: T});
            light(fx, {
                at: [0.3, 0.05, 0.6],
                size: 3.4,
                color: AMBER[3],
                floor: true,
                life: 0.35,
                alpha: 0.35,
                time: T,
            });
        },
    },
    {
        id: 'melee/whip-crack',
        name: 'Whip crack',
        loop: false,
        period: 1.3,
        build(fx) {
            fx.character([-1.3, 0, 0]);
            const ROLL0 = 0.02;
            const ROLL = 0.22;
            const CRACK = ROLL0 + ROLL;
            const hand: At = [-0.95, 1.2, 0.25];
            const reach = 3.2;
            // The tip runs out faster and faster, the line rolling in a wave behind it, then flips and cracks.
            const tip = fx.node('tip', hand);
            fx.every((t) => {
                const k = clamp01((t - ROLL0) / ROLL);
                const e = k * k;
                const back = clamp01((t - CRACK) / 0.18);
                const out = e * (1 - 0.5 * back);
                tip.position.set(
                    hand[0] + reach * out,
                    hand[1] + 0.22 * Math.sin(Math.PI * 3 * e) * (1 - back) - 0.4 * back * back,
                    hand[2]
                );
            });
            fx.sys({
                tex: 'white',
                mode: RenderMode.Trail,
                trail: 40,
                trailOpts: {followLocalOrigin: true, colorFromParticle: true, tessellation: 4, dieWithParticle: true},
                world: true,
                loop: false,
                life: CRACK + 0.2,
                size: 0.05,
                burst: [[0, 1]],
                color: LEATHER[3],
                parent: tip,
                order: 5,
                b: [tint([['#ffffff', 0]], fadeOut(0.75, 0.02))],
            });
            // The crack: a white pop, a ring of air, sparks and a puff of smoke.
            const at = fx.node('crack', [hand[0] + reach, hand[1], hand[2]]);
            star(fx, {at: [0, 0, 0], size: 1.1, life: 0.2, time: CRACK, ramp: hot(LEATHER), parent: at});
            shockwave(fx, {
                parent: at,
                size: 1.6,
                life: 0.28,
                color: LEATHER[5],
                tex: 'ring',
                facing: true,
                delay: CRACK,
            });
            hotSparks(fx, {parent: at, count: 12, time: CRACK, speed: [3, 7], life: [0.12, 0.3], palette: SPARK_GOLD});
            dust(fx, {
                at: [0, 0, 0],
                parent: at,
                size: [0.25, 0.4],
                life: [0.5, 0.8],
                burst: [[CRACK, 4]],
                speed: [0.3, 0.8],
                color: '#8a7a70',
                alpha: 0.45,
            });
            light(fx, {
                at: [hand[0] + reach, hand[1], hand[2]],
                size: 2.2,
                color: LEATHER[4],
                life: 0.25,
                alpha: 0.5,
                time: CRACK,
            });
        },
    },
];
