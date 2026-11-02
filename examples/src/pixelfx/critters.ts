import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {CircleEmitter, ConeEmitter, RenderMode, SphereEmitter} from 'babylon.quarks';
import {
    airDrag,
    extrude,
    fadeOut,
    floorBounce,
    gravity,
    grow,
    lathe,
    pillow,
    popOut,
    tint,
    wobble,
    type Geometry,
} from './kit';
import {type At} from './parts';
import {decal, flames} from './recipes';
import {skull} from './shadow';
import {type FxBuilder, type FxDef} from './stage';

const BAT = ['#0c0912', '#1f1629', '#382645', '#5b3f66', '#866089', '#b88fb0', '#e8cfe0'];
const BIRD = ['#0a0e1e', '#18244a', '#24407a', '#3466aa', '#5a94d4', '#9cc8f0', '#eaf6ff'];
const FLESH = ['#2a1420', '#6a3040', '#b07078', '#dcbcb4', '#f4e9de', '#ffffff'];
const SEA = ['#0a1a2a', '#123552', '#1d5a7e', '#2f8aa8', '#62bccc', '#bfe8e6', '#f4fff8'];
const FIRE = ['#4a1712', '#8a1f17', '#c9281f', '#f2561d', '#ff8a2a', '#ffc23d', '#ffe26b', '#fff3a6', '#ffffff'];
const FROG = ['#0a160c', '#173a18', '#256024', '#3a8a2e', '#62b440', '#a8e070', '#e8ffc0'];
const SPOOK = ['#10142a', '#232c52', '#3e4f86', '#6b84bb', '#a3b8e2', '#d8e4ff', '#ffffff'];
const JELLY = ['#140b2b', '#2a1650', '#4b2386', '#7a3cb8', '#b066e0', '#e09cf5', '#ffd6ff', '#ffffff'];
const SLIME = ['#061412', '#0b2f2b', '#12594a', '#1f8f4f', '#47c752', '#a6f06a', '#f0ffd2'];
const WISP = ['#0a1f2e', '#0f3d52', '#14707e', '#1fa8a8', '#4fe0c8', '#a8fff0', '#ffffff'];
const BONE = ['#2a2420', '#5a4e44', '#9a8c7c', '#d8ccb8', '#f4ecdc'];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const TAU = Math.PI * 2;

/** A sphere of radius 0.5. */
const SPHERE = lathe(
    Array.from({length: 13}, (_, i) => {
        const a = -Math.PI / 2 + (i / 12) * Math.PI;
        return [Math.max(0.001, Math.cos(a) * 0.5), Math.sin(a) * 0.5] as [number, number];
    }),
    20
);
/** A cylinder of radius 0.5 from y 0 to 1, for limbs and tentacle segments. */
const ROD = lathe(
    [
        [0.001, 0],
        [0.5, 0],
        [0.5, 1],
        [0.001, 1],
    ],
    12
);
/** A cone from radius 0.5 at y 0 to a point at y 1: beaks, ears, horns. */
const CONE = lathe(
    [
        [0.001, 0],
        [0.5, 0],
        [0.001, 1],
    ],
    12
);
/** A flat disc facing +z: eyes, spots, pupils. */
const DISC = extrude(
    Array.from(
        {length: 20},
        (_, i) => [Math.cos((i / 20) * TAU) * 0.5, Math.sin((i / 20) * TAU) * 0.5] as [number, number]
    ),
    0.04
);

/** `pts` mirrored across x = 0, for the left of a pair of wings. */
const mirror = (pts: Array<[number, number]>) => pts.map(([x, y]) => [-x, y] as [number, number]);

/** A solid, lit shape riding `parent`, born again every `life` seconds. */
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
        alphas?: Array<[number, number]>;
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
        b: o.alphas ? [tint([['#ffffff', 0]], o.alphas)] : [],
    });
}

/** A node at `at` under `parent` scaled to `s` (a size per axis), for a squashed ball or a limb. */
function part(
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

/** A soft shadow on the floor under `follow`, shrinking as it rises. */
function shadow(fx: FxBuilder, follow: TransformNode, size: number, life: number, base = 0) {
    const node = fx.node('shadow', [0, 0.012, 0]);
    fx.sys({
        tex: 'glow',
        mode: RenderMode.HorizontalBillBoard,
        life,
        size,
        burst: [[0, 1]],
        color: '#000000',
        alpha: 0.55,
        parent: node,
        order: 1,
        look: {scalingMode: 'hierarchy'},
    });
    fx.every(() => {
        // The shadow node lives under the cell's root, so take the root's own offset back out.
        const p = follow.getAbsolutePosition();
        const o = fx.root.getAbsolutePosition();
        node.position.set(p.x - o.x, 0.012, p.z - o.z);
        const k = Math.max(0.3, 1 - (p.y - o.y - base) * 0.25);
        node.scaling.set(k, 1, k);
    });
    return node;
}

/** Two glowing eyes on `parent`, `gap` apart at `at`. */
function glowEyes(
    fx: FxBuilder,
    parent: TransformNode,
    o: {at: At; gap: number; color: string; size: number; life: number}
) {
    for (const side of [-1, 1]) {
        fx.sys({
            tex: 'glow',
            blend: 'add',
            life: o.life,
            size: o.size,
            burst: [[0, 1]],
            color: o.color,
            at: [o.at[0] + side * o.gap * 0.5, o.at[1], o.at[2]],
            parent,
            order: 8,
        });
    }
}

/**
 * A chain of `n` rigid segments, each a child of the one before, for tentacles, tails and nerves:
 * turning each a little behind the last sends a wave down it. Returns the joints, root first.
 */
function chain(
    fx: FxBuilder,
    parent: TransformNode,
    o: {
        n: number;
        length: number;
        radius: number;
        taper: number;
        color: string;
        life: number;
        blend?: 'add' | 'alpha';
        alpha?: number;
        rim?: [number, number, number];
        down?: boolean;
    }
): TransformNode[] {
    const joints: TransformNode[] = [];
    let p = parent;
    for (let i = 0; i < o.n; i++) {
        const joint = fx.node('joint', [0, i === 0 ? 0 : (o.down ? -1 : 1) * o.length, 0], p);
        const r = o.radius * (1 - (i / o.n) * o.taper);
        const seg = part(fx, joint, [0, o.down ? -o.length : 0, 0], [r * 2, o.length, r * 2]);
        solid(fx, seg, ROD, o.color, {
            life: o.life,
            blend: o.blend,
            alpha: o.alpha,
            rim: o.rim,
            lit: o.blend !== 'add',
        });
        joints.push(joint);
        p = joint;
    }
    return joints;
}

/** Twinkling dust left in the air behind `parent` as it moves. */
function dustTrail(fx: FxBuilder, parent: TransformNode, color: string, perMetre = 10) {
    fx.sys({
        tex: 'glint',
        world: true,
        life: [0.4, 0.8],
        speed: [0.05, 0.2],
        size: [0.06, 0.12],
        rateOverDistance: perMetre,
        color: ['#ffffff', color],
        shape: new SphereEmitter({radius: 0.1, thickness: 1}),
        parent,
        order: 8,
        b: [gravity(0.5), tint([['#ffffff', 0]], popOut(0.5))],
    });
}

const BAT_WING: Array<[number, number]> = [
    [0, 0.08],
    [0.3, 0.24],
    [0.62, 0.34],
    [1.0, 0.3],
    [0.86, 0.06],
    [0.74, -0.1],
    [0.58, 0.0],
    [0.44, -0.16],
    [0.3, -0.02],
    [0.14, -0.12],
    [0, -0.06],
];
const BIRD_WING: Array<[number, number]> = [
    [0, 0.08],
    [0.35, 0.14],
    [0.7, 0.12],
    [1, 0.02],
    [0.9, -0.04],
    [0.78, -0.02],
    [0.66, -0.08],
    [0.52, -0.06],
    [0.4, -0.12],
    [0, -0.1],
];
const FORE_WING: Array<[number, number]> = [
    [0, 0],
    [0.2, 0.3],
    [0.55, 0.55],
    [0.85, 0.55],
    [0.95, 0.35],
    [0.6, 0.05],
];
const HIND_WING: Array<[number, number]> = [
    [0, 0],
    [0.55, -0.05],
    [0.7, -0.3],
    [0.55, -0.55],
    [0.3, -0.55],
    [0.1, -0.25],
];
/** A fish in profile, nose at +x. */
const FISH_BODY: Array<[number, number]> = Array.from({length: 24}, (_, i) => {
    const a = (i / 24) * TAU;
    const x = Math.cos(a) * 0.5;
    const y = Math.sin(a) * (0.2 - 0.06 * Math.cos(a)) * (1 + 0.15 * Math.cos(a));
    return [x, y];
});
/** A forked tail fin, as tall as the body, so the fish reads as a fish and not a pill. */
const FISH_TAIL: Array<[number, number]> = [
    [0.06, 0],
    [-0.32, 0.27],
    [-0.2, 0],
    [-0.32, -0.27],
];

export const critters: FxDef[] = [
    {
        id: 'critters/bat',
        name: 'Bat',
        loop: true,
        period: 2.4,
        view: {height: 1.8, distance: 5},
        build(fx) {
            const P = 2.4;
            const L = P + 0.02;
            const bat = fx.node('bat', [0, 1.8, 0]);
            const body = part(fx, bat, [0, 0, 0], [0.32, 0.42, 0.28]);
            solid(fx, body, SPHERE, BAT[2], {life: L, rim: [0.7, 0.5, 0.9]});
            const head = part(fx, bat, [0, 0.27, 0.04], [0.26, 0.24, 0.24]);
            solid(fx, head, SPHERE, BAT[2], {life: L, rim: [0.7, 0.5, 0.9]});
            for (const side of [-1, 1]) {
                const ear = part(fx, bat, [side * 0.08, 0.36, 0], [0.09, 0.16, 0.06], [0, 0, -side * 0.3]);
                solid(fx, ear, CONE, BAT[3], {life: L, rim: [0.7, 0.5, 0.9]});
            }
            glowEyes(fx, bat, {at: [0, 0.29, 0.15], gap: 0.1, color: '#ff3b30', size: 0.12, life: L});
            fx.sys({
                tex: 'glint',
                life: 0.2,
                size: 0.16,
                burst: [
                    [0.3, 1],
                    [1.5, 1],
                ],
                color: '#fff0c0',
                at: [0.05, 0.31, 0.16],
                parent: bat,
                order: 9,
                b: [tint([['#ffffff', 0]], popOut(0.4))],
            });
            // The wings: membranes on shoulder pivots, moonlight catching their rims.
            const wings = ([-1, 1] as const).map((side) => {
                const pivot = fx.node('wing', [side * 0.1, 0.08, 0], bat);
                solid(fx, pivot, extrude(side > 0 ? BAT_WING : mirror(BAT_WING), 0.02), BAT[1], {
                    life: L,
                    size: 1.1,
                    rim: [0.7, 0.6, 0.95],
                });
                return {pivot, side};
            });
            fx.every((t) => {
                // Snappy beats: the wing angle hard-eased; the body lifts on each downstroke.
                const beat = (t * 4) % 1;
                const flap = Math.sin(beat * TAU);
                const snap = Math.sign(flap) * Math.abs(flap) ** 0.5;
                for (const w of wings) {
                    w.pivot.rotation.z = w.side * snap * 0.9;
                    w.pivot.rotation.y = -w.side * 0.25;
                }
                const a = (t / P) * TAU;
                bat.position.set(Math.sin(a) * 1.2, 1.8 + Math.sin(a * 2) * 0.25 - snap * 0.06, Math.sin(a * 2) * 0.4);
                bat.rotation.z = -Math.cos(a) * 0.25;
                bat.rotation.y = Math.cos(a) * 0.4;
            });
            shadow(fx, bat, 0.9, L);
        },
    },
    {
        id: 'critters/bird',
        name: 'Bird',
        loop: true,
        period: 2.4,
        view: {height: 1.6, distance: 4.5},
        build(fx) {
            const P = 2.4;
            const L = P + 0.02;
            const bird = fx.node('bird', [0, 1.6, 0]);
            bird.rotation.y = -0.35;
            // Facing +x: a round blue body, an orange breast, a head, a beak and a fanned tail.
            const body = part(fx, bird, [0, 0, 0], [0.5, 0.3, 0.3]);
            solid(fx, body, SPHERE, BIRD[3], {life: L, rim: [0.6, 0.8, 1]});
            const breast = part(fx, bird, [0.08, -0.04, 0], [0.34, 0.24, 0.26]);
            solid(fx, breast, SPHERE, '#f08a3a', {life: L, rim: [1, 0.8, 0.5]});
            const head = part(fx, bird, [0.24, 0.12, 0], [0.22, 0.22, 0.22]);
            solid(fx, head, SPHERE, BIRD[3], {life: L, rim: [0.6, 0.8, 1]});
            const beak = part(fx, bird, [0.34, 0.11, 0], [0.06, 0.12, 0.06], [0, 0, -Math.PI / 2]);
            solid(fx, beak, CONE, '#ffb43a', {life: L});
            for (const side of [-1, 1]) {
                const eye = part(fx, bird, [0.3, 0.15, side * 0.1], [0.05, 0.05, 0.05], [0, side > 0 ? 0 : Math.PI, 0]);
                solid(fx, eye, SPHERE, '#05060a', {life: L, lit: false});
            }
            const tail = fx.node('tail', [-0.22, 0.02, 0], bird);
            solid(
                fx,
                tail,
                extrude(
                    [
                        [0, 0.04],
                        [-0.35, 0.14],
                        [-0.38, 0.02],
                        [-0.35, -0.1],
                        [0, -0.04],
                    ],
                    0.08
                ),
                BIRD[2],
                {life: L, rim: [0.6, 0.8, 1]}
            );
            // Wings: laid flat on the back and flapped round the body's long axis.
            const wings = ([-1, 1] as const).map((side) => {
                const pivot = fx.node('wing', [0, 0.08, side * 0.08], bird);
                const lay = fx.node('lay', [0, 0, 0], pivot);
                lay.rotation.x = Math.PI / 2;
                solid(
                    fx,
                    lay,
                    extrude(
                        BIRD_WING.map(([x, y]) => [y, side * x] as [number, number]),
                        0.02
                    ),
                    BIRD[4],
                    {life: L, size: 0.75, rim: [0.7, 0.9, 1]}
                );
                return {pivot, side};
            });
            // A loose feather drifting away now and then.
            fx.sys({
                geo: extrude(
                    [
                        [0, 0.5],
                        [0.15, 0.2],
                        [0.1, -0.5],
                        [-0.1, -0.5],
                        [-0.15, 0.2],
                    ],
                    0.02
                ),
                tex: 'white',
                blend: 'alpha',
                world: true,
                tumble: 3,
                life: 2,
                speed: [0.2, 0.4],
                size: 0.14,
                burst: [[0.9, 1]],
                color: BIRD[5],
                parent: bird,
                order: 6,
                look: {lighting: 'fixed', renderFace: 'both'},
                b: [gravity(0.5), wobble(1.2, 0.6), tint([['#ffffff', 0]], fadeOut(0.7, 0.05))],
            });
            fx.every((t) => {
                // Bursts of wingbeats, then a glide on spread wings.
                const flapping = t % P < 1.4;
                const beat = Math.sin(t * 6 * TAU);
                const angle = flapping ? beat * 0.9 : -0.15 + Math.sin(t * 2) * 0.05;
                for (const w of wings) w.pivot.rotation.x = w.side * angle;
                bird.position.y = 1.6 + (flapping ? -beat * 0.05 : 0) + Math.sin((t / P) * TAU) * 0.08;
                tail.rotation.z = flapping ? 0 : 0.2 * Math.sin(t * 3);
                tail.scaling.set(1, flapping ? 1 : 1.3, 1);
            });
            shadow(fx, bird, 0.8, L);
        },
    },
    {
        id: 'critters/butterfly',
        name: 'Butterfly',
        loop: true,
        period: 3.2,
        view: {height: 1.3, distance: 4.5},
        build(fx) {
            const P = 3.2;
            const L = P + 0.02;
            const fly = fx.node('butterfly', [0, 1.3, 0]);
            const body = part(fx, fly, [0, 0, -0.15], [0.06, 0.06, 0.32], [Math.PI / 2, 0, 0]);
            solid(fx, body, ROD, '#1a1430', {life: L, rim: [0.5, 0.7, 1]});
            const wings = ([-1, 1] as const).map((side) => {
                const pivot = fx.node('wing', [0, 0, 0], fly);
                const lay = fx.node('lay', [0, 0, 0], pivot);
                lay.rotation.x = Math.PI / 2;
                for (const [shape, c] of [
                    [FORE_WING, BIRD[4]],
                    [HIND_WING, BIRD[3]],
                ] as Array<[Array<[number, number]>, string]>) {
                    solid(fx, lay, extrude(side > 0 ? shape : mirror(shape), 0.015), c, {
                        life: L,
                        size: 0.55,
                        rim: [0.4, 1, 1],
                    });
                }
                // Spots, glowing.
                for (const [x, y] of [
                    [0.6, 0.38],
                    [0.38, -0.3],
                ]) {
                    const spot = part(fx, lay, [side * x * 0.55, y * 0.55, 0.012], [0.08, 0.08, 1]);
                    solid(fx, spot, DISC, '#ffffff', {life: L, lit: false, blend: 'add', alpha: 0.8});
                }
                return {pivot, side};
            });
            dustTrail(fx, fly, BIRD[5], 8);
            fx.every((t) => {
                // Bursts of quick beats, then open-winged glides.
                const phase = (t / P) * 4;
                const gliding = phase % 1 > 0.6;
                const beat = Math.sin(t * 9 * TAU);
                const angle = gliding ? 0.2 : 0.2 + (beat * 0.5 + 0.5) * 1.1;
                for (const w of wings) w.pivot.rotation.z = w.side * angle;
                const a = (t / P) * TAU;
                const x = Math.sin(a) * 1.2;
                const z = Math.sin(a * 2) * 0.5;
                fly.position.set(x, 1.3 + Math.sin(a * 3) * 0.2 + (gliding ? 0 : beat * 0.03), z);
                fly.rotation.y = Math.atan2(Math.cos(a) * 1.2, Math.cos(a * 2) * 1.0);
                fly.rotation.x = -0.3;
            });
            shadow(fx, fly, 0.6, L);
        },
    },
    {
        id: 'critters/eyeball',
        name: 'Eyeball',
        loop: true,
        period: 3.2,
        view: {height: 1.6, distance: 4.2},
        build(fx) {
            const P = 3.2;
            const L = P + 0.02;
            const eye = fx.node('eye', [0, 1.6, 0]);
            const ball = fx.node('ball', [0, 0, 0], eye);
            solid(fx, ball, SPHERE, FLESH[4], {life: L, size: 0.7, rim: [1, 0.6, 0.6]});
            // Bloodshot veins: thin red bands wrapped round it.
            for (let i = 0; i < 6; i++) {
                const vein = fx.node('vein', [0, 0, 0], ball);
                vein.rotation.set(0.4 + i * 0.5, i * 1.1, 0);
                solid(
                    fx,
                    part(fx, vein, [0, 0, 0], [0.71, 0.71, 0.71]),
                    lathe(
                        [
                            [0.45, -0.01],
                            [0.5, 0],
                            [0.45, 0.01],
                        ],
                        24,
                        Math.PI * 0.6,
                        -0.3
                    ),
                    '#c02030',
                    {
                        life: L,
                        lit: false,
                        alpha: 0.7,
                    }
                );
            }
            // The iris and pupil, glowing, on a node that snaps to look about.
            const look = fx.node('look', [0, 0, 0], ball);
            const iris = part(fx, look, [0, 0, 0.33], [0.3, 0.3, 1]);
            solid(fx, iris, DISC, '#3ac850', {life: L, lit: false, order: 6});
            const pupil = part(fx, look, [0, 0, 0.345], [0.13, 0.13, 1]);
            solid(fx, pupil, DISC, '#05060a', {life: L, lit: false, order: 7});
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: L,
                size: 0.6,
                burst: [[0, 1]],
                color: '#3ac850',
                alpha: 0.6,
                at: [0, 0, 0.4],
                parent: look,
                order: 8,
            });
            // Fleshy lids: two half shells closing over it.
            const lids = ([1, -1] as const).map((side) => {
                const node = fx.node('lid', [0, 0, 0], eye);
                const shell = part(fx, node, [0, 0, 0], [0.74, 0.74 * side, 0.74]);
                solid(
                    fx,
                    shell,
                    lathe(
                        Array.from({length: 7}, (_, i) => {
                            const a = (i / 6) * (Math.PI / 2);
                            return [Math.max(0.001, Math.cos(a) * 0.5), Math.sin(a) * 0.5] as [number, number];
                        }),
                        20
                    ),
                    FLESH[2],
                    {life: L, rim: [1, 0.6, 0.6]}
                );
                return {node, side};
            });
            // The nerve trailing behind, swaying.
            const root = fx.node('nerve', [0, -0.2, -0.2], eye);
            root.rotation.x = 0.5;
            const nerve = chain(fx, root, {
                n: 6,
                length: 0.14,
                radius: 0.05,
                taper: 0.6,
                color: '#b03040',
                life: L,
                rim: [1, 0.5, 0.5],
                down: true,
            });
            const looks: Array<[number, number]> = [
                [0, 0],
                [0.5, 0.1],
                [-0.5, 0.2],
                [0.2, -0.35],
                [0, 0],
            ];
            fx.every((t) => {
                // Snaps from look to look, blinking once.
                const k = Math.min(looks.length - 1, Math.floor((t / P) * looks.length));
                const [yaw, pitch] = looks[k];
                look.rotation.y += (yaw - look.rotation.y) * 0.4;
                look.rotation.x += (pitch - look.rotation.x) * 0.4;
                const blink = Math.max(0, 1 - Math.abs(t - 1.75) / 0.08);
                for (const l of lids) l.node.rotation.x = -l.side * (1.45 - blink * 1.45) + (l.side > 0 ? -0.1 : 0.1);
                eye.position.y = 1.6 + Math.sin((t / P) * TAU * 2) * 0.08;
                eye.rotation.z = Math.sin((t / P) * TAU) * 0.1;
                nerve.forEach((j, i) => {
                    j.rotation.z = Math.sin((t / P) * TAU * 2 - i * 0.6) * 0.3;
                    j.rotation.x = Math.sin((t / P) * TAU - i * 0.5) * 0.15;
                });
            });
            decal(fx, {
                at: [0, 0.012, 0],
                size: 1.4,
                color: '#3ac850',
                alpha: 0.25,
                life: L,
                loop: true,
                blend: 'add',
                alphas: [[1, 0]],
            });
        },
    },
    {
        id: 'critters/fish-school',
        name: 'Fish School',
        loop: true,
        period: 4.8,
        view: {height: 1.4, distance: 5},
        build(fx) {
            const P = 4.8;
            const L = P + 0.02;
            const BODY = pillow(FISH_BODY, 0.26);
            const TAIL = extrude(FISH_TAIL, 0.05);
            const fish = Array.from({length: 10}, (_, i) => {
                const row = i % 2;
                const at: At = [
                    -1.2 + (Math.floor(i / 2) * 0.6 + row * 0.3),
                    1.1 + row * 0.5 + (i % 3) * 0.08,
                    row ? -0.5 : 0.3,
                ];
                const node = fx.node('fish', at);
                const s = 0.5 + (i % 3) * 0.08;
                node.scaling.setAll(s);
                solid(fx, node, BODY, row ? SEA[3] : SEA[4], {life: L, rim: [0.6, 1, 1]});
                const eye = part(fx, node, [0.3, 0.04, 0.09], [0.06, 0.06, 1]);
                solid(fx, eye, DISC, '#05080c', {life: L, lit: false, order: 6});
                const tail = fx.node('tail', [-0.44, 0, 0], node);
                solid(fx, tail, TAIL, row ? SEA[3] : SEA[4], {life: L, rim: [0.6, 1, 1]});
                return {node, tail, at, i, dart: (i * 1.7) % P};
            });
            // Bubbles rising.
            fx.sys({
                tex: 'ring',
                life: [1.2, 2],
                speed: [0.4, 0.8],
                size: [0.05, 0.12],
                rate: 6,
                color: SEA[6],
                alpha: 0.7,
                shape: new ConeEmitter({radius: 1.6, angle: 0.1, thickness: 1}),
                aim: 'up',
                at: [0, 0.3, 0],
                order: 7,
                b: [wobble(2, 0.1), tint([['#ffffff', 0]], fadeOut(0.8, 0.1))],
            });
            // Caustic light rippling over the floor.
            for (let i = 0; i < 7; i++) {
                const node = fx.node('caustic', [(i - 3) * 0.6, 0.013, Math.sin(i * 2.1) * 0.6]);
                fx.sys({
                    tex: 'ring',
                    mode: RenderMode.HorizontalBillBoard,
                    blend: 'add',
                    life: L,
                    size: 0.9,
                    burst: [[0, 1]],
                    color: SEA[5],
                    alpha: 0.35,
                    parent: node,
                    order: 1,
                    look: {scalingMode: 'hierarchy'},
                });
                fx.every((t) => {
                    node.position.x = (i - 3) * 0.6 + Math.sin(t * 1.3 + i) * 0.2;
                    node.scaling.setAll(0.8 + Math.sin(t * 2 + i * 1.7) * 0.3);
                });
            }
            fx.every((t) => {
                for (const f of fish) {
                    // Holding station, wagging; now and then one darts ahead and drifts back.
                    const d = (t - f.dart + P) % P;
                    const dart = d < 0.25 ? easeOut(d / 0.25) : d < 1.5 ? 1 - span(d, 0.25, 1.5) : 0;
                    f.node.position.set(f.at[0] + dart * 0.8, f.at[1] + Math.sin(t * 2 + f.i) * 0.05, f.at[2]);
                    const wag = Math.sin(t * (8 + dart * 10) + f.i);
                    f.tail.rotation.y = wag * 0.6;
                    f.node.rotation.y = -wag * 0.08;
                }
            });
            decal(fx, {
                at: [0, 0.012, 0],
                size: 4,
                color: SEA[2],
                alpha: 0.4,
                life: L,
                loop: true,
                blend: 'add',
                alphas: [[1, 0]],
            });
        },
    },
    {
        id: 'critters/flying-skull',
        name: 'Flying Skull',
        loop: true,
        period: 2.4,
        view: {height: 1.8, distance: 4.5},
        build(fx) {
            const P = 2.4;
            const L = P + 0.02;
            const head = fx.node('skull', [0, 1.5, 0]);
            // Tipped back so its face meets a camera above it, not the floor.
            head.rotation.x = -0.35;
            const bone = skull(fx, head, {
                scale: 0.55,
                color: BONE[3],
                rim: [1, 0.6, 0.3],
                eye: FIRE[5],
                life: L,
                loop: true,
            });
            // Fire roaring off the crown.
            const crown = fx.node('crown', [0, 0.5, 0], head);
            // One blaze, not scattered tongues: big overlapping flames over a hot core.
            flames(fx, {parent: crown, radius: 0.2, height: 0.9, size: [0.45, 0.7], rate: 30, loop: true, order: 6});
            flames(fx, {parent: crown, radius: 0.1, height: 0.5, size: [0.3, 0.45], rate: 22, loop: true, order: 7});
            fx.sys({
                tex: 'flame',
                blend: 'add',
                world: true,
                life: [0.5, 0.8],
                speed: [0.6, 1.2],
                size: [0.2, 0.32],
                rate: 4,
                color: [FIRE[4], FIRE[6]],
                shape: new SphereEmitter({radius: 0.2, thickness: 1}),
                parent: crown,
                order: 6,
                b: [gravity(-2), grow([0, 1], [1, 0.2]), tint([['#ffffff', 0]], popOut(0.4))],
            });
            fx.sys({
                tex: 'dot',
                world: true,
                life: [0.6, 1.1],
                speed: [0.8, 1.6],
                size: [0.03, 0.05],
                rate: 18,
                color: [FIRE[5], FIRE[7]],
                shape: new ConeEmitter({radius: 0.2, angle: 0.5, thickness: 1}),
                aim: 'up',
                parent: crown,
                order: 8,
                b: [gravity(-1), wobble(2, 0.4), tint([['#ffffff', 0]], popOut(0.5))],
            });
            fx.sys({
                tex: 'smoke',
                world: true,
                life: [0.9, 1.4],
                speed: [0.8, 1.2],
                size: [0.3, 0.5],
                rate: 6,
                color: '#2a2024',
                alpha: 0.6,
                aim: 'up',
                at: [0, 0.9, 0],
                parent: crown,
                order: 4,
                b: [grow([0, 0.6], [1, 1.6]), tint([['#ffffff', 0]], fadeOut(0.3))],
            });
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: L,
                size: 2.4,
                burst: [[0, 1]],
                color: FIRE[4],
                alpha: 0.4,
                parent: head,
                order: 2,
            });
            decal(fx, {
                at: [0, 0.012, 0],
                size: 2.6,
                color: FIRE[4],
                alpha: 0.45,
                life: L,
                loop: true,
                blend: 'add',
                alphas: [[1, 0]],
            });
            fx.every((t) => {
                head.position.y = 1.5 + Math.sin((t / P) * TAU) * 0.12;
                head.rotation.y = Math.sin((t / P) * TAU) * 0.4;
                head.rotation.z = Math.sin((t / P) * TAU * 2) * 0.06;
                // The jaw chatters: the skull judders as it does.
                bone.position.y = Math.abs(Math.sin(t * 22)) * 0.02;
            });
            shadow(fx, head, 0.9, L);
        },
    },
    {
        id: 'critters/frog',
        name: 'Frog',
        loop: true,
        period: 2.6,
        view: {height: 1.0, distance: 4.5},
        build(fx) {
            const P = 2.6;
            const L = P + 0.02;
            const LEAP = 1.2;
            const LAND = 1.6;
            const frog = fx.node('frog', [-0.8, 0, 0]);
            frog.rotation.y = -0.6;
            frog.scaling.setAll(1.6);
            const squash = fx.node('squash', [0, 0, 0], frog);
            const body = part(fx, squash, [0, 0.22, 0], [0.62, 0.36, 0.5]);
            solid(fx, body, SPHERE, FROG[3], {life: L, rim: [0.7, 1, 0.5]});
            const belly = part(fx, squash, [0.06, 0.16, 0], [0.5, 0.26, 0.42]);
            solid(fx, belly, SPHERE, FROG[5], {life: L, rim: [0.8, 1, 0.6]});
            const throat = part(fx, squash, [0.22, 0.14, 0], [0.2, 0.18, 0.22]);
            solid(fx, throat, SPHERE, '#f4f0b0', {life: L, rim: [1, 1, 0.8]});
            const lids: TransformNode[] = [];
            for (const side of [-1, 1]) {
                const eye = part(fx, squash, [0.14, 0.42, side * 0.14], [0.16, 0.16, 0.16]);
                solid(fx, eye, SPHERE, FROG[4], {life: L, rim: [0.7, 1, 0.5]});
                const ball = part(fx, squash, [0.2, 0.44, side * 0.14], [0.1, 0.1, 0.1]);
                solid(fx, ball, SPHERE, '#0a0a08', {life: L, lit: false});
                const lid = part(fx, squash, [0.15, 0.44, side * 0.14], [0.17, 0.02, 0.17]);
                solid(fx, lid, SPHERE, FROG[3], {life: L});
                lids.push(lid);
                const leg = part(fx, squash, [-0.2, 0.1, side * 0.24], [0.3, 0.16, 0.16]);
                solid(fx, leg, SPHERE, FROG[3], {life: L, rim: [0.7, 1, 0.5]});
            }
            // The fly, buzzing about until the tongue gets it.
            const fly = fx.node('fly', [0, 1.4, 0]);
            const flyBody = part(fx, fly, [0, 0, 0], [0.1, 0.07, 0.07]);
            solid(fx, flyBody, SPHERE, '#14141a', {life: L, lit: false});
            fx.sys({
                tex: 'glint',
                life: L,
                look: {scalingMode: 'hierarchy'},
                size: 0.12,
                burst: [[0, 1]],
                color: '#c8e0ff',
                alpha: 0.7,
                parent: fly,
                order: 8,
            });
            // The tongue: a pink rod from the mouth to the fly and back.
            const mouth = fx.node('mouth', [0.3, 0.26, 0], squash);
            const tongue = part(fx, mouth, [0, 0, 0], [0.04, 0.001, 0.04]);
            solid(fx, tongue, ROD, '#ff6a8a', {life: L, rim: [1, 0.7, 0.8]});
            // Dust where it lands.
            fx.sys({
                tex: 'smoke',
                life: [0.4, 0.7],
                speed: [0.6, 1.2],
                size: [0.2, 0.35],
                burst: [[LAND, 10]],
                color: '#6a5a50',
                alpha: 0.6,
                shape: new CircleEmitter({radius: 0.3, thickness: 1}),
                rotate: [Math.PI / 2, 0, 0],
                at: [0.9, 0.05, 0],
                order: 4,
                b: [airDrag(4), grow([0, 0.6], [1, 1.4]), tint([['#ffffff', 0]], fadeOut(0.3))],
            });
            fx.every((t) => {
                // Puffing, blinking, crouching, leaping, snapping, landing, gulping.
                const puff =
                    t < 0.9
                        ? Math.max(0, Math.sin(t * 9))
                        : t > 2.0 && t < 2.3
                          ? Math.sin(span(t, 2.0, 2.3) * Math.PI)
                          : 0;
                throat.scaling.set(0.2 + puff * 0.18, 0.18 + puff * 0.16, 0.22 + puff * 0.18);
                const blink = Math.max(0, 1 - Math.abs(t - 0.6) / 0.06) + Math.max(0, 1 - Math.abs(t - 2.2) / 0.06);
                for (const lid of lids) lid.scaling.set(0.17, 0.02 + blink * 0.15, 0.17);
                const crouch = Math.sin(span(t, 0.95, LEAP) * Math.PI * 0.5) * (t < LEAP ? 1 : 0);
                const air = span(t, LEAP, LAND);
                const land = t > LAND ? Math.max(0, 1 - (t - LAND) / 0.25) : 0;
                const sy = 1 - crouch * 0.3 - land * 0.3 + (t > LEAP && t < LAND ? 0.2 : 0);
                squash.scaling.set(1 + (1 - sy) * 0.6, sy, 1 + (1 - sy) * 0.4);
                // Out and back: x from -0.8 to 0.9 and home again before the next cycle.
                const home = span(t, 2.3, P);
                const x = -0.8 + 1.7 * air - 1.7 * home;
                frog.position.set(x, Math.sin(air * Math.PI) * 0.9 * (air < 1 ? 1 : 0), 0);
                frog.rotation.y = home > 0 ? -0.6 + Math.PI * Math.sin(home * Math.PI) * 0 : -0.6;
                // The fly zigzags until snapped at the top of the leap.
                const caught = t > LEAP + 0.2 && t < P - 0.1;
                const fx0 = 0.1 + Math.sin(t * 7) * 0.25;
                fly.position.set(fx0, 1.25 + Math.sin(t * 11) * 0.12, Math.cos(t * 5) * 0.2);
                fly.scaling.setAll(caught ? 1e-4 : 1);
                const lick = Math.max(0, 1 - Math.abs(t - (LEAP + 0.18)) / 0.08);
                tongue.scaling.set(0.04, 0.001 + lick * 0.6, 0.04);
                tongue.rotation.z = -Math.PI / 2 + 0.6;
            });
            shadow(fx, squash, 0.9, L);
        },
    },
    {
        id: 'critters/ghost',
        name: 'Ghost',
        loop: true,
        period: 2.4,
        view: {height: 1.3, distance: 4.2},
        build(fx) {
            const P = 2.4;
            const L = P + 0.02;
            const ghost = fx.node('ghost', [0, 1.1, 0]);
            const sheet = fx.node('sheet', [0, 0, 0], ghost);
            // A dome over a skirt with a scalloped hem; the sheet turns, so the hem ripples.
            const SHEET = lathe(
                [
                    [0.001, 0.62],
                    [0.2, 0.6],
                    [0.36, 0.48],
                    [0.42, 0.3],
                    [0.44, 0.0],
                    [0.48, -0.3],
                    [0.5, -0.42],
                ],
                40
            );
            const scallop = {
                ...SHEET,
                positions: (() => {
                    const p = new Float32Array(SHEET.positions);
                    for (let i = 0; i < p.length; i += 3) {
                        if (p[i + 1] < -0.4) p[i + 1] += Math.abs(Math.sin(Math.atan2(p[i + 2], p[i]) * 4)) * 0.12;
                    }
                    return p;
                })(),
            };
            solid(fx, sheet, scallop, SPOOK[5], {life: L, rim: [0.6, 0.75, 1]});
            fx.sys({
                geo: scallop,
                tex: 'white',
                blend: 'add',
                life: L,
                size: 1.06,
                burst: [[0, 1]],
                color: SPOOK[3],
                alpha: 0.25,
                parent: sheet,
                order: 6,
                look: {scalingMode: 'hierarchy', rim: {color: [0.6, 0.75, 1], power: 1.5, strength: 1, mode: 'add'}},
            });
            const face = fx.node('face', [0, 0.3, 0.42], ghost);
            const eyes = [-1, 1].map((side) => {
                const e = part(fx, face, [side * 0.12, 0, 0], [0.09, 0.14, 1]);
                solid(fx, e, DISC, '#141828', {life: L, lit: false, order: 7});
                return e;
            });
            const mouth = part(fx, face, [0, -0.15, 0], [0.08, 0.06, 1]);
            solid(fx, mouth, DISC, '#141828', {life: L, lit: false, order: 7});
            const arms = ([-1, 1] as const).map((side) => {
                const pivot = fx.node('arm', [side * 0.42, 0.05, 0.05], ghost);
                const nub = part(fx, pivot, [side * 0.1, 0, 0], [0.22, 0.12, 0.12]);
                solid(fx, nub, SPHERE, SPOOK[5], {life: L, rim: [0.6, 0.75, 1]});
                return {pivot, side};
            });
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: L,
                size: 2,
                burst: [[0, 1]],
                color: SPOOK[4],
                alpha: 0.35,
                parent: ghost,
                order: 2,
            });
            // Motes trickling off the hem.
            fx.sys({
                tex: 'glow',
                world: true,
                life: [0.6, 1],
                speed: [0.1, 0.3],
                size: [0.05, 0.1],
                rate: 14,
                color: [SPOOK[5], '#ffffff'],
                shape: new CircleEmitter({radius: 0.45, thickness: 0.2}),
                aim: 'down',
                at: [0, -0.4, 0],
                parent: ghost,
                order: 7,
                b: [gravity(0.6), tint([['#ffffff', 0]], popOut(0.5))],
            });
            fx.every((t) => {
                const a = (t / P) * TAU;
                ghost.position.set(Math.sin(a) * 0.3, 1.1 + Math.sin(a * 2) * 0.12, 0);
                ghost.rotation.z = -Math.cos(a) * 0.12;
                sheet.rotation.y = t * 1.5;
                // Glancing about and blinking.
                face.position.x = Math.sin(a * 1.5) * 0.08;
                face.rotation.y = Math.sin(a * 1.5) * 0.3;
                const blink = Math.max(0, 1 - Math.abs((t % 1.2) - 0.9) / 0.06);
                for (const e of eyes) e.scaling.set(0.09, 0.14 * (1 - blink * 0.9), 1);
                for (const arm of arms) arm.pivot.rotation.z = arm.side * Math.sin(t * 12 + arm.side) * 0.4;
            });
            shadow(fx, ghost, 0.9, L);
        },
    },
    {
        id: 'critters/jellyfish',
        name: 'Jellyfish',
        loop: true,
        period: 3.2,
        view: {height: 1.6, distance: 4.5},
        build(fx) {
            const P = 3.2;
            const L = P + 0.02;
            const jelly = fx.node('jelly', [0, 1.8, 0]);
            const bell = fx.node('bell', [0, 0, 0], jelly);
            const BELL = lathe(
                [
                    [0.001, 0.4],
                    [0.25, 0.36],
                    [0.42, 0.2],
                    [0.5, 0.0],
                    [0.46, -0.04],
                ],
                32
            );
            fx.sys({
                geo: BELL,
                tex: 'white',
                blend: 'add',
                life: L,
                size: 1,
                burst: [[0, 1]],
                color: JELLY[3],
                alpha: 0.5,
                parent: bell,
                order: 6,
                look: {
                    scalingMode: 'hierarchy',
                    renderFace: 'both',
                    rim: {color: [1, 0.7, 1], power: 1.6, strength: 1.4, mode: 'add'},
                },
            });
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: L,
                size: 0.8,
                burst: [[0, 1]],
                color: JELLY[5],
                at: [0, 0.15, 0],
                parent: bell,
                order: 7,
            });
            // Frilled arms and long tentacles: chains swaying a beat behind the bell.
            const tentacles: Array<{joints: TransformNode[]; k: number}> = [];
            for (let k = 0; k < 8; k++) {
                const a = (k / 8) * TAU;
                const long = k % 2 === 0;
                const root = fx.node(
                    'root',
                    [Math.cos(a) * (long ? 0.4 : 0.15), -0.03, Math.sin(a) * (long ? 0.4 : 0.15)],
                    jelly
                );
                const joints = chain(fx, root, {
                    n: long ? 7 : 4,
                    length: long ? 0.17 : 0.14,
                    radius: long ? 0.018 : 0.05,
                    taper: 0.7,
                    color: long ? JELLY[5] : JELLY[4],
                    life: L,
                    blend: 'add',
                    alpha: 0.7,
                    down: true,
                });
                tentacles.push({joints, k});
            }
            fx.sys({
                tex: 'ring',
                life: [1.2, 2],
                speed: [0.2, 0.5],
                size: [0.05, 0.1],
                rate: 4,
                color: JELLY[6],
                alpha: 0.6,
                shape: new SphereEmitter({radius: 1, thickness: 1}),
                aim: 'up',
                at: [0, 1.5, 0],
                order: 8,
                b: [wobble(2, 0.1), tint([['#ffffff', 0]], fadeOut(0.7, 0.1))],
            });
            fx.every((t) => {
                // Squeeze shoves it up; it relaxes and sinks.
                const ph = (t / P) * 2;
                const k = ph % 1;
                const squeeze = k < 0.25 ? Math.sin((k / 0.25) * Math.PI * 0.5) : 1 - span(k, 0.25, 0.6);
                bell.scaling.set(1 - squeeze * 0.25, 1 + squeeze * 0.15, 1 - squeeze * 0.25);
                const rise = k < 0.4 ? easeOut(k / 0.4) : 1 - span(k, 0.4, 1);
                jelly.position.y = 1.7 + rise * 0.3;
                for (const tt of tentacles) {
                    tt.joints.forEach((j, i) => {
                        j.rotation.x =
                            Math.sin(t * 3 - i * 0.7 + tt.k) * 0.18 +
                            (i === 0 ? squeeze * 0.4 * Math.cos((tt.k / 8) * TAU) : 0);
                        j.rotation.z =
                            Math.cos(t * 2.4 - i * 0.6 + tt.k) * 0.15 +
                            (i === 0 ? -squeeze * 0.4 * Math.sin((tt.k / 8) * TAU) : 0);
                    });
                }
            });
            decal(fx, {
                at: [0, 0.012, 0],
                size: 2,
                color: JELLY[4],
                alpha: 0.3,
                life: L,
                loop: true,
                blend: 'add',
                alphas: [[1, 0]],
            });
        },
    },
    {
        id: 'critters/slime',
        name: 'Slime',
        loop: true,
        period: 1.8,
        view: {height: 0.8, distance: 4},
        build(fx) {
            const P = 1.8;
            const L = P + 0.02;
            const slime = fx.node('slime', [0, 0, 0]);
            const squash = fx.node('squash', [0, 0, 0], slime);
            const BLOB = lathe(
                [
                    [0.001, 0],
                    [0.42, 0.02],
                    [0.5, 0.12],
                    [0.46, 0.3],
                    [0.32, 0.48],
                    [0.14, 0.56],
                    [0.001, 0.58],
                ],
                28
            );
            solid(fx, squash, BLOB, SLIME[4], {life: L, rim: [0.7, 1, 0.6], alpha: 0.9});
            fx.sys({
                geo: BLOB,
                tex: 'white',
                blend: 'add',
                life: L,
                size: 0.7,
                burst: [[0, 1]],
                color: SLIME[5],
                alpha: 0.3,
                at: [0, 0.05, 0],
                parent: squash,
                order: 6,
                look: {scalingMode: 'hierarchy'},
            });
            // A highlight, eyes that blink.
            const shine = part(fx, squash, [-0.15, 0.42, 0.22], [0.12, 0.07, 0.07], [0, 0, 0.5]);
            solid(fx, shine, SPHERE, '#ffffff', {life: L, lit: false, alpha: 0.8, order: 7});
            const eyes = [-1, 1].map((side) => {
                const e = part(fx, squash, [side * 0.12, 0.32, 0.41], [0.07, 0.11, 1]);
                solid(fx, e, DISC, '#061412', {life: L, lit: false, order: 7});
                return e;
            });
            // Droplets flung out on the splat, landing and creeping back.
            fx.sys({
                geo: SPHERE,
                tex: 'white',
                blend: 'alpha',
                life: [0.6, 0.8],
                speed: [1.5, 2.5],
                size: [0.06, 0.1],
                burst: [[1.22, 10]],
                world: true,
                color: SLIME[4],
                shape: new ConeEmitter({radius: 0.3, angle: 1.2, thickness: 1}),
                aim: 'up',
                at: [0, 0.05, 0],
                order: 6,
                look: {lighting: 'fixed', rim: {color: [0.7, 1, 0.6], power: 2, strength: 1, mode: 'add'}},
                b: [gravity(9), floorBounce(0, 0.03), tint([['#ffffff', 0]], fadeOut(0.8, 0))],
            });
            decal(fx, {
                at: [0, 0.013, 0],
                size: 1.3,
                color: SLIME[3],
                alpha: 0.5,
                life: 0.6,
                delay: 1.22,
                blend: 'add',
                loop: true,
            });
            fx.every((t) => {
                // Wind-up squash, stretch into the jump, round in the air, splat, wobble.
                let sx: number;
                let sy: number;
                let y = 0;
                if (t < 0.4) {
                    const k = Math.sin(span(t, 0.1, 0.4) * Math.PI * 0.5);
                    sy = 1 - k * 0.35;
                    sx = 1 + k * 0.25;
                } else if (t < 1.2) {
                    const k = span(t, 0.4, 1.2);
                    y = Math.sin(k * Math.PI) * 1.0;
                    const s = Math.max(0, 1 - k * 4);
                    sy = 1 + s * 0.35;
                    sx = 1 - s * 0.2;
                } else {
                    const k = t - 1.2;
                    const w = Math.exp(-k * 6) * Math.cos(k * 22);
                    sy = 1 - w * 0.4;
                    sx = 1 + w * 0.3;
                }
                slime.position.y = y;
                squash.scaling.set(sx, sy, sx);
                const blink = Math.max(0, 1 - Math.abs(t - 1.6) / 0.05);
                for (const e of eyes) e.scaling.set(0.07, 0.11 * (1 - blink * 0.9), 1);
            });
            shadow(fx, slime, 1, L);
        },
    },
    {
        id: 'critters/snake',
        name: 'Snake',
        loop: true,
        period: 2.4,
        view: {height: 0.6, distance: 4.5},
        build(fx) {
            const P = 2.4;
            const L = P + 0.02;
            // Twice as many, half as far apart, so the body reads as one smooth tube, not a string of beads.
            const N = 36;
            const segs = Array.from({length: N}, (_, i) => {
                const node = fx.node('seg', [0, 0, 0]);
                const r = 0.15 * (1 - (i / N) * 0.75);
                node.scaling.setAll(r * 2);
                const band = Math.floor(i / 2);
                solid(fx, node, SPHERE, band % 3 === 0 ? '#c8a030' : band % 2 ? FROG[3] : FROG[4], {
                    life: L,
                    rim: [0.7, 1, 0.5],
                });
                return {node, i, r};
            });
            const head = fx.node('head', [0, 0, 0]);
            const skullNode = part(fx, head, [0, 0, 0], [0.34, 0.22, 0.26]);
            solid(fx, skullNode, SPHERE, FROG[4], {life: L, rim: [0.7, 1, 0.5]});
            for (const side of [-1, 1]) {
                const eye = part(fx, head, [0.08, 0.07, side * 0.1], [0.07, 0.07, 0.07]);
                solid(fx, eye, SPHERE, '#ffd040', {life: L, lit: false});
            }
            const tongue = fx.node('tongue', [0.17, -0.02, 0], head);
            const tg = part(fx, tongue, [0, 0, 0], [0.02, 0.001, 0.02], [0, 0, -Math.PI / 2]);
            solid(fx, tg, ROD, '#e03050', {life: L, lit: false});
            for (const side of [-1, 1]) {
                const fork = fx.node('fork', [0, 0, 0], tongue);
                const f = part(fx, fork, [0, 0, 0], [0.015, 0.001, 0.015], [0, side * 0.5, -Math.PI / 2]);
                solid(fx, f, ROD, '#e03050', {life: L, lit: false});
            }
            const dust = fx.sys({
                tex: 'smoke',
                world: true,
                life: [0.4, 0.6],
                speed: [0.2, 0.5],
                size: [0.12, 0.2],
                rate: 8,
                color: '#6a5a50',
                alpha: 0.5,
                shape: new SphereEmitter({radius: 0.1, thickness: 1}),
                order: 3,
                b: [grow([0, 0.6], [1, 1.3]), tint([['#ffffff', 0]], fadeOut(0.3))],
            });
            fx.every((t) => {
                // Humps rise and roll back down the body; the head stays raised, tongue flicking.
                const w = (t / P) * TAU;
                const spacing = 0.07;
                let touchX = 0;
                for (const s of segs) {
                    const x = 0.9 - s.i * spacing;
                    const hump = Math.max(0, Math.sin(s.i * 0.35 + w * 2));
                    s.node.position.set(x, s.r + hump * 0.16, Math.sin(s.i * 0.225 - w) * 0.12);
                    if (hump < 0.02) touchX = x;
                }
                dust.emitter.position.set(touchX, 0.05, 0);
                head.position.set(1.08, 0.36 + Math.sin(w * 2) * 0.03, Math.sin(-w) * 0.08);
                head.rotation.y = Math.sin(w) * 0.2;
                const flick = Math.max(0, Math.sin(t * 9)) * (Math.sin(w) > 0 ? 1 : 0);
                tongue.scaling.set(Math.max(1e-4, flick), 1, 1);
                tg.scaling.set(0.02, 0.18, 0.02);
            });
        },
    },
    {
        id: 'critters/wisp',
        name: 'Wisp',
        loop: true,
        period: 3.2,
        view: {height: 1.3, distance: 4.8},
        build(fx) {
            const P = 3.2;
            const L = P + 0.02;
            const wisp = fx.node('wisp', [0, 1.3, 0]);
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: L,
                size: 0.9,
                burst: [[0, 1]],
                color: WISP[4],
                parent: wisp,
                order: 6,
            });
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: L,
                size: 0.45,
                burst: [[0, 1]],
                color: WISP[6],
                parent: wisp,
                order: 7,
            });
            // A little face: two eyes and a mouth on the flame's core.
            for (const [x, y, sx, sy] of [
                [-0.07, 0.03, 0.05, 0.08],
                [0.07, 0.03, 0.05, 0.08],
                [0, -0.07, 0.07, 0.04],
            ]) {
                const node = part(fx, wisp, [x, y, 0.2], [sx, sy, 1]);
                solid(fx, node, DISC, '#0a2a30', {life: L, lit: false, order: 8});
            }
            // The flame tail, licking up and streaming behind.
            fx.sys({
                tex: 'flame',
                blend: 'add',
                world: true,
                life: [0.4, 0.7],
                speed: [0.2, 0.5],
                size: [0.3, 0.5],
                rate: 45,
                color: [WISP[4], WISP[5]],
                shape: new SphereEmitter({radius: 0.12, thickness: 1}),
                parent: wisp,
                order: 5,
                b: [
                    gravity(-2.5),
                    grow([0, 1], [1, 0.1]),
                    tint(
                        [
                            [WISP[6], 0],
                            [WISP[3], 1],
                        ],
                        fadeOut(0.3, 0.1)
                    ),
                ],
            });
            fx.sys({
                tex: 'glow',
                world: true,
                life: [0.6, 1],
                speed: [0.1, 0.3],
                size: [0.12, 0.2],
                rate: 6,
                color: WISP[4],
                alpha: 0.6,
                parent: wisp,
                order: 4,
                b: [gravity(-0.5), grow([0, 1], [1, 1.6]), tint([['#ffffff', 0]], fadeOut(0.3))],
            });
            fx.sys({
                tex: 'dot',
                world: true,
                life: [0.5, 0.9],
                speed: [0.5, 1.2],
                size: [0.03, 0.05],
                rate: 14,
                color: [WISP[5], '#ffffff'],
                shape: new SphereEmitter({radius: 0.1, thickness: 1}),
                parent: wisp,
                order: 8,
                b: [gravity(-1), wobble(2, 0.3), tint([['#ffffff', 0]], popOut(0.5))],
            });
            const pool = fx.node('pool', [0, 0.013, 0]);
            fx.sys({
                tex: 'glow',
                mode: RenderMode.HorizontalBillBoard,
                blend: 'add',
                life: L,
                size: 1.6,
                burst: [[0, 1]],
                color: WISP[3],
                alpha: 0.5,
                parent: pool,
                order: 1,
            });
            fx.every((t) => {
                const a = (t / P) * TAU;
                const x = Math.sin(a) * 1.3;
                const z = Math.sin(a * 2) * 0.5;
                wisp.position.set(x, 1.3 + Math.sin(a * 2 + 1) * 0.2, z);
                pool.position.set(x, 0.013, z);
            });
        },
    },
];
