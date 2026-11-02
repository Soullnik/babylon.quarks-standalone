import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {CircleEmitter, ConeEmitter, RenderMode, SphereEmitter} from 'babylon.quarks';
import {
    airDrag,
    curve,
    fadeOut,
    flicker,
    frames,
    gravity,
    grow,
    lathe,
    orbit,
    popOut,
    quad,
    spin,
    subEmit,
    tint,
    wobble,
} from './kit';
import {FLAT, clods, hotSparks, light, star, type At} from './parts';
import {shockwave, type Ramp} from './recipes';
import {between, hero} from './spawn';
import {shapes, type FxBuilder, type FxDef} from './stage';
import {image} from './textures';

const ARC = ['#140a26', '#2b1252', '#481c88', '#6b2cc0', '#9a48ec', '#c684ff', '#ecc8ff', '#ffffff'];
const COOL: Ramp = [
    ['#ffffff', 0],
    [ARC[6], 0.2],
    [ARC[5], 0.45],
    [ARC[3], 1],
];

/** A full sphere of radius 1 as a lathe profile. */
function ballProfile(rows = 16): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let i = 0; i <= rows; i++) {
        const a = -Math.PI / 2 + (i / rows) * Math.PI;
        out.push([Math.max(0.001, Math.cos(a)), Math.sin(a)]);
    }
    return out;
}

/** A flat ring between `inner` and `outer` on the lathe's x-z plane, its U round it. */
function flatRing(inner: number, outer: number, segments = 64) {
    return lathe(
        [
            [inner, 0],
            [outer, 0],
        ],
        segments
    );
}

/** Emits only between `from` and `to` seconds of a `period`, at `rate`, as a curve. */
function window(system: {emissionOverTime: unknown}, period: number, from: number, to: number, rate: number) {
    const a = Math.max(0.0005, from / period);
    const b = Math.min(0.998, to / period);
    system.emissionOverTime = curve([0, 0], [a - 0.0005, 0], [a, rate], [b, rate], [b + 0.001, 0], [1, 0]);
}

/** A held glow riding a node: a fresh short-lived sprite every frame. */
function held(
    fx: FxBuilder,
    parent: TransformNode,
    o: {tex?: 'glow' | 'glint' | 'dot'; size: number; color: string; alpha?: number; order?: number}
) {
    return fx.sys({
        tex: o.tex ?? 'glow',
        life: 0.05,
        size: o.size,
        rate: 60,
        color: o.color,
        alpha: o.alpha,
        parent,
        order: o.order ?? 6,
    });
}

export const arcane: FxDef[] = [
    {
        id: 'arcane/arcane-beam',
        name: 'Arcane beam',
        loop: true,
        period: 1.2,
        build(fx) {
            fx.character([-1.9, 0, 0]);
            const hand = fx.node('hand', [-1.45, 1.05, 0.25]);
            const end = fx.node('end', [2.4, 1.05, 0.25]);
            // A white core, a violet body and a haze.
            fx.sys({
                parent: hand,
                beam: end,
                tex: 'white',
                life: 0.05,
                size: 0.06,
                rate: 60,
                color: '#ffffff',
                order: 8,
            });
            fx.sys({
                parent: hand,
                beam: end,
                tex: 'white',
                life: 0.05,
                size: 0.22,
                rate: 60,
                color: ARC[4],
                alpha: 0.6,
                order: 7,
            });
            fx.sys({
                parent: hand,
                beam: end,
                tex: 'white',
                life: [0.05, 0.1],
                size: [0.45, 0.6],
                rate: 12,
                color: ARC[3],
                alpha: 0.18,
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.5))],
            });
            // Strands twisting round it: lightning sheets flickering through their frames.
            fx.sys({
                parent: hand,
                beam: end,
                tex: 'bolt',
                life: [0.08, 0.14],
                size: [0.3, 0.4],
                rate: 26,
                color: ARC[5],
                alpha: 0.8,
                order: 7,
                b: [frames(30, 4), tint([['#ffffff', 0]], popOut(0.5))],
            });
            // Pulses running down it.
            fx.sys({
                tex: 'glow',
                life: 0.42,
                speed: 9,
                size: 0.45,
                rate: 5,
                color: ARC[6],
                aim: 'right',
                parent: hand,
                order: 8,
                b: [tint([['#ffffff', 0]], fadeOut(0.85, 0.05)), grow([0, 0.6], [0.5, 1], [1, 0.7])],
            });
            // A flaring source, and an end that sprays sparks back and up.
            held(fx, hand, {size: 0.9, color: ARC[5], alpha: 0.8});
            fx.sys({
                tex: 'glint',
                life: 0.15,
                size: [0.5, 0.8],
                rate: 14,
                rot: true,
                color: '#ffffff',
                parent: hand,
                order: 9,
                b: [tint(COOL, popOut(0.3))],
            });
            held(fx, end, {size: 1.1, color: ARC[5], alpha: 0.8});
            fx.sys({
                tex: 'ring',
                life: 0.3,
                size: 0.6,
                rate: 5,
                color: ARC[6],
                parent: end,
                order: 8,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.4], [1, 1.3])],
            });
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.3, length: 1},
                world: true,
                life: [0.2, 0.45],
                speed: [2.5, 5],
                size: [0.03, 0.05],
                rate: 40,
                color: [ARC[6], '#ffffff'],
                shape: new ConeEmitter({radius: 0.05, angle: 0.9}),
                aim: 'left',
                parent: end,
                order: 7,
                b: [tint(COOL, popOut(0.5)), gravity(6)],
            });
            light(fx, {
                at: [0.5, 0.05, 0.4],
                size: 5.5,
                color: ARC[4],
                floor: true,
                life: 1.2,
                alpha: 0.35,
                loop: true,
            });
        },
    },
    {
        id: 'arcane/arcane-missiles',
        name: 'Arcane missiles',
        loop: false,
        period: 2,
        build(fx) {
            fx.character([-1.8, 0, 0]);
            const hand: At = [-1.4, 1.1, 0.25];
            const target: At = [2.2, 1.1, 0.25];
            // The mark they home on.
            const mark = fx.node('mark', target);
            fx.sys({
                tex: 'ring',
                loop: false,
                life: 1.4,
                size: 0.5,
                burst: [[0.1, 1]],
                color: ARC[5],
                alpha: 0.6,
                parent: mark,
                order: 5,
                b: [tint([['#ffffff', 0]], fadeOut(0.85, 0.1)), spin(2)],
            });
            // A volley fans out of the hand and curls round on twisting ribbons.
            const fan: Array<[number, number]> = [
                [1.4, 0.6],
                [-0.9, -0.8],
                [2, -0.2],
                [-0.4, 1.1],
                [1.0, -1.1],
            ];
            const FLY = 0.62;
            fan.forEach(([up, side], i) => {
                const t0 = 0.12 + i * 0.13;
                const bolt = fx.node('bolt', hand);
                fx.every((t) => {
                    const k = between(t, t0, t0 + FLY);
                    const e = k * k * (3 - 2 * k);
                    const c: At = [(hand[0] + target[0]) / 2 - 0.4, hand[1] + up, hand[2] + side];
                    const m = 1 - e;
                    const twist = Math.sin(k * Math.PI * 4 + i) * 0.12 * Math.sin(Math.PI * k);
                    bolt.position.set(
                        m * m * hand[0] + 2 * m * e * c[0] + e * e * target[0],
                        m * m * hand[1] + 2 * m * e * c[1] + e * e * target[1] + twist,
                        m * m * hand[2] +
                            2 * m * e * c[2] +
                            e * e * target[2] +
                            Math.cos(k * Math.PI * 4 + i) * 0.12 * Math.sin(Math.PI * k)
                    );
                });
                fx.sys({
                    tex: 'glow',
                    mode: RenderMode.Trail,
                    trail: 26,
                    trailOpts: {followLocalOrigin: true, tessellation: 3, uvFromHead: true},
                    world: true,
                    loop: false,
                    life: FLY,
                    size: 0.16,
                    burst: [[t0, 1]],
                    color: ARC[5],
                    parent: bolt,
                    order: 6,
                    b: [tint(COOL, fadeOut(0.95, 0.05))],
                });
                const head = fx.sys({
                    tex: 'glow',
                    loop: false,
                    life: 0.05,
                    size: 0.5,
                    rate: 0,
                    color: ARC[6],
                    parent: bolt,
                    order: 7,
                });
                window(head, 2, t0, t0 + FLY, 60);
                // Each pops on the target one after another.
                star(fx, {at: [0, 0, 0], size: 1.1, life: 0.22, time: t0 + FLY, ramp: COOL, parent: mark});
                fx.sys({
                    tex: 'ring',
                    loop: false,
                    life: 0.3,
                    size: 1,
                    burst: [[t0 + FLY, 1]],
                    color: ARC[6],
                    parent: mark,
                    order: 7,
                    b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.2], [1, 1.2])],
                });
                hotSparks(fx, {parent: mark, count: 8, time: t0 + FLY, speed: [2, 5], palette: COOL, weight: 4});
            });
            light(fx, {at: target, size: 3, color: ARC[4], life: 0.9, alpha: 0.45, time: 0.74});
            light(fx, {at: [0.4, 0.05, 0.4], size: 5, color: ARC[4], floor: true, life: 1.4, alpha: 0.3, time: 0.12});
        },
    },
    {
        id: 'arcane/arcane-orb',
        name: 'Arcane orb',
        loop: true,
        period: 2.4,
        build(fx) {
            const orb = fx.node('orb', [0, 1.6, 0]);
            fx.every((t) => {
                orb.position.y = 1.6 + Math.sin((t / 2.4) * Math.PI * 2) * 0.12;
            });
            const R = 0.7;
            // Smoky violet glass, its far side dim, its near side lit at the rim.
            const ball = lathe(ballProfile(), 40);
            for (const [face, alpha, order] of [
                ['back', 0.35, 2],
                ['front', 0.5, 6],
            ] as const) {
                fx.sys({
                    image: 'noise',
                    geo: ball,
                    blend: 'add',
                    life: 1e4,
                    size: R,
                    burst: [[0, 1]],
                    color: ARC[4],
                    alpha: alpha * 1.6,
                    parent: orb,
                    order,
                    look: {
                        mapUV: {tiling: [2, 1], scroll: [0.05, 0.02]},
                        renderFace: face,
                        scalingMode: 'hierarchy',
                        rim: {color: [0.7, 0.4, 1.2], power: 2, strength: 1, mode: 'fade'},
                    },
                });
            }
            // A swirl turning round a white-hot heart.
            fx.sys({
                tex: 'swirl',
                life: 1e4,
                size: 1.2,
                burst: [[0, 1]],
                color: ARC[5],
                alpha: 0.8,
                parent: orb,
                order: 4,
                b: [spin(-2.6)],
            });
            fx.sys({tex: 'glow', life: 0.05, size: 0.7, rate: 60, color: '#ffffff', parent: orb, order: 5});
            fx.sys({
                tex: 'glow',
                life: 0.6,
                size: [0.8, 1.1],
                rate: 4,
                color: ARC[6],
                alpha: 0.6,
                parent: orb,
                order: 5,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            // Two tilted rings of light orbiting through it, with a glint riding each.
            [
                [0.9, 0.3, 1.6],
                [-0.7, -0.5, -1.2],
            ].forEach(([rx, rz, speed]) => {
                const tilt = fx.node('tilt', [0, 0, 0], orb);
                tilt.rotation.set(rx, 0, rz);
                const turn = fx.node('turn', [0, 0, 0], tilt);
                fx.every((t) => {
                    turn.rotation.y = t * speed;
                });
                fx.sys({
                    geo: flatRing(1.0, 1.06),
                    tex: 'white',
                    blend: 'add',
                    life: 1e4,
                    size: 1,
                    burst: [[0, 1]],
                    color: ARC[5],
                    alpha: 0.8,
                    parent: turn,
                    order: 6,
                    look: {renderFace: 'both', scalingMode: 'hierarchy'},
                });
                const rider = fx.node('rider', [1.03, 0, 0], turn);
                fx.sys({tex: 'glint', life: 0.05, size: 0.35, rate: 60, color: '#ffffff', parent: rider, order: 8});
                fx.sys({
                    tex: 'dot',
                    world: true,
                    life: 0.35,
                    size: 0.06,
                    rate: 30,
                    color: ARC[6],
                    parent: rider,
                    order: 7,
                    b: [tint([['#ffffff', 0]], popOut(0.1))],
                });
            });
            light(fx, {at: [0, 0.05, 0], size: 3.6, color: ARC[4], floor: true, life: 2.4, alpha: 0.4, loop: true});
        },
    },
    {
        id: 'arcane/blink-in',
        name: 'Blink in',
        loop: false,
        period: 1.8,
        build(fx) {
            const P = 1.8;
            // Glittering bits spiral in to a point of light.
            fx.sys({
                tex: 'glint',
                loop: false,
                life: 0.4,
                speed: -2.5,
                size: [0.08, 0.16],
                burst: [[0, 26]],
                color: [ARC[6], '#ffffff'],
                shape: new SphereEmitter({radius: 1, thickness: 0}),
                at: [0, 0.9, 0],
                order: 7,
                b: [tint(COOL, fadeOut(0.8, 0.2)), orbit(5)],
            });
            star(fx, {at: [0, 0.9, 0], size: 0.7, life: 0.2, time: 0.3, ramp: COOL});
            // It opens into a line, then into a white silhouette that cools into the caster.
            fx.sys({
                tex: 'streak',
                loop: false,
                life: 0.3,
                size: 2.4,
                burst: [[0.32, 1]],
                rot: Math.PI / 2,
                color: '#ffffff',
                at: [0, 0.9, 0],
                order: 7,
                b: [tint(COOL, popOut(0.3)), grow([0, 0.2], [0.5, 1], [1, 0.8])],
            });
            hero(fx, {period: P, time: 0.45, life: P - 0.45, cut: [[1, 0]], colors: [['#ffffff', 0]]});
            hero(fx, {
                period: P,
                time: 0.45,
                life: 0.7,
                blend: 'add',
                lighting: 'unlit',
                color: ARC[7],
                fade: [
                    [1, 0],
                    [1, 0.2],
                    [0, 1],
                ],
                order: 4,
                rim: [0.8, 0.5, 1.4],
            });
            shockwave(fx, {at: [0, 0.04, 0], size: 2.6, life: 0.45, color: ARC[5], tex: 'ring', delay: 0.5});
            fx.sys({
                tex: 'dot',
                loop: false,
                life: [0.4, 0.8],
                speed: [0.3, 0.9],
                size: [0.04, 0.07],
                burst: [[0.5, 16]],
                color: ARC[6],
                shape: new CircleEmitter({radius: 0.4, thickness: 1}),
                rotate: FLAT,
                at: [0, 0.1, 0],
                order: 6,
                b: [tint(COOL, fadeOut(0.5)), gravity(0.6, [0, 1, 0])],
            });
            light(fx, {at: [0, 0.05, 0], size: 3, color: ARC[4], floor: true, life: 0.7, alpha: 0.45, time: 0.35});
        },
    },
    {
        id: 'arcane/blink-out',
        name: 'Blink out',
        loop: false,
        period: 2,
        build(fx) {
            const P = 2;
            const FLASH = 0.38;
            const SQUEEZE = 0.55;
            // The caster crackles with gathering light, flashes white, squeezes into a line.
            const body = fx.node('body', [0, 0, 0]);
            fx.every((t) => {
                const k = between(t, SQUEEZE, SQUEEZE + 0.18);
                body.scaling.set(Math.max(0.02, 1 - k), 1 + 0.25 * k, Math.max(0.02, 1 - k));
            });
            hero(fx, {period: P, parent: body, life: SQUEEZE + 0.2});
            hero(fx, {
                period: P,
                parent: body,
                time: 0.05,
                life: SQUEEZE + 0.15,
                blend: 'add',
                lighting: 'unlit',
                color: ARC[6],
                fade: [
                    [0, 0],
                    [0.4, 0.5],
                    [1, 0.75],
                    [1, 1],
                ],
                order: 4,
            });
            fx.sys({
                tex: 'glint',
                loop: false,
                life: [0.06, 0.12],
                size: [0.2, 0.35],
                rate: 0,
                rot: true,
                color: ARC[6],
                shape: new CircleEmitter({radius: 0.4, thickness: 0}),
                rotate: FLAT,
                at: [0, 0.9, 0],
                order: 7,
                b: [tint(COOL, popOut(0.2))],
            }).emissionOverTime = curve([0, 0], [0.02, 30], [FLASH / P, 30], [FLASH / P + 0.01, 0], [1, 0]);
            fx.sys({
                tex: 'dot',
                loop: false,
                life: 0.3,
                speed: -2,
                size: 0.05,
                rate: 0,
                color: '#ffffff',
                shape: new SphereEmitter({radius: 0.9, thickness: 0}),
                at: [0, 0.9, 0],
                order: 6,
                b: [tint(COOL, popOut(0.4))],
            }).emissionOverTime = curve([0, 0], [0.02, 40], [FLASH / P, 40], [FLASH / P + 0.01, 0], [1, 0]);
            light(fx, {at: [0, 0.9, 0.3], size: 3, color: ARC[6], life: 0.4, alpha: 0.6, time: FLASH});
            // The line of light collapses and pops away in sparks.
            fx.sys({
                tex: 'streak',
                loop: false,
                life: 0.25,
                size: 2.6,
                burst: [[SQUEEZE + 0.15, 1]],
                rot: Math.PI / 2,
                color: '#ffffff',
                at: [0, 0.9, 0],
                order: 8,
                b: [tint(COOL, popOut(0.4)), grow([0, 1], [1, 0.05])],
            });
            star(fx, {at: [0, 0.9, 0], size: 1, life: 0.2, time: SQUEEZE + 0.38, ramp: COOL});
            fx.sys({
                tex: 'square',
                loop: false,
                life: [0.5, 1],
                speed: [1, 3],
                size: [0.04, 0.07],
                burst: [[SQUEEZE + 0.38, 30]],
                color: [ARC[5], '#ffffff'],
                shape: new SphereEmitter({radius: 0.1, thickness: 1}),
                at: [0, 0.9, 0],
                order: 7,
                b: [tint(COOL, fadeOut(0.5, 0.02)), airDrag(2), gravity(1.5), spin([-6, 6])],
            });
            shockwave(fx, {at: [0, 0.04, 0], size: 2.4, life: 0.4, color: ARC[5], tex: 'ring', delay: SQUEEZE + 0.38});
        },
    },
    {
        id: 'arcane/magic-circle-cast',
        name: 'Magic circle cast',
        loop: false,
        period: 4,
        view: {height: 2.4, distance: 13},
        build(fx) {
            const DRAW1 = 0.8;
            const FLASH = 1.6;
            // A circle draws itself on the floor: two rings uncovered round their length.
            const flat = fx.node('flat', [0, 0.025, 0]);
            const mask = image(fx.scene, 'sweep').texture;
            for (const [inner, outer, delay] of [
                [1.75, 1.85, 0],
                [1.4, 1.46, 0.15],
            ]) {
                fx.sys({
                    geo: flatRing(inner, outer),
                    tex: 'white',
                    blend: 'add',
                    loop: false,
                    life: 3.4 - delay,
                    size: 1,
                    burst: [[delay, 1]],
                    color: ARC[5],
                    parent: flat,
                    order: 3,
                    look: {
                        renderFace: 'both',
                        erosion: {mask, softness: 0.02, edgeWidth: 0.03, edgeColor: [2, 1.6, 2.4]},
                    },
                    b: [
                        tint(
                            [['#ffffff', 0]],
                            [
                                [0, 0],
                                [1, (DRAW1 - delay) / (3.4 - delay)],
                                [1, 0.8],
                                [0, 1],
                            ]
                        ),
                    ],
                });
            }
            // The rune band between them fades in, and the runes ignite one by one.
            fx.sys({
                tex: 'rune',
                mode: RenderMode.HorizontalBillBoard,
                loop: false,
                life: 3.2,
                size: 3.6,
                burst: [[0.3, 1]],
                color: ARC[4],
                at: [0, 0.02, 0],
                order: 2,
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [0, 0],
                            [0.8, 0.2],
                            [0.8, 0.85],
                            [0, 1],
                        ]
                    ),
                    spin(0.25),
                ],
            });
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                star(fx, {
                    at: [Math.cos(a) * 1.6, 0.06, Math.sin(a) * 1.6],
                    size: 0.5,
                    life: 2.4 - i * 0.08,
                    time: 0.85 + i * 0.08,
                    tex: 'glow',
                    ramp: [
                        ['#ffffff', 0],
                        [ARC[6], 0.1],
                        [ARC[5], 1],
                    ],
                });
            }
            // It flashes, and a column of light fires up and breaks apart into glints.
            star(fx, {at: [0, 0.3, 0], size: 3.5, life: 0.3, time: FLASH, tex: 'glow', ramp: COOL});
            shockwave(fx, {at: [0, 0.04, 0], size: 5, life: 0.5, color: ARC[6], delay: FLASH});
            const column = fx.node('column', [0, 0, 0]);
            fx.every((t) => {
                const k = between(t, FLASH, FLASH + 0.15);
                const thin = 1 - between(t, FLASH + 0.6, FLASH + 1.4) * 0.8;
                column.scaling.set(thin, Math.max(0.001, 8 * k), thin);
            });
            for (const [face, alpha] of [
                ['back', 0.4],
                ['front', 0.7],
            ] as const) {
                fx.sys({
                    image: 'light-column',
                    geo: lathe(
                        [
                            [0.85, 0],
                            [0.85, 1],
                        ],
                        40
                    ),
                    blend: 'add',
                    loop: false,
                    life: 1.5,
                    size: 1,
                    burst: [[FLASH, 1]],
                    color: ARC[5],
                    alpha,
                    parent: column,
                    order: face === 'back' ? 2 : 6,
                    look: {
                        renderFace: face,
                        scalingMode: 'hierarchy',
                        rim: {color: [0.8, 0.5, 1.2], power: 2, strength: 1, mode: 'fade'},
                    },
                    b: [
                        tint(COOL, [
                            [1, 0],
                            [0.9, 0.5],
                            [0, 1],
                        ]),
                    ],
                });
            }
            fx.sys({
                tex: 'glint',
                loop: false,
                life: [0.6, 1.2],
                speed: [1.5, 4],
                size: [0.12, 0.25],
                rate: 0,
                color: [ARC[6], '#ffffff'],
                shape: new CircleEmitter({radius: 0.6, thickness: 1}),
                rotate: [-Math.PI / 2, 0, 0],
                at: [0, 0.3, 0],
                order: 7,
                b: [tint(COOL, fadeOut(0.5, 0.05)), wobble(1, 0.5), airDrag(0.8)],
            }).emissionOverTime = curve(
                [0, 0],
                [(FLASH + 0.3) / 4, 0],
                [(FLASH + 0.31) / 4, 50],
                [(FLASH + 1.4) / 4, 50],
                [(FLASH + 1.41) / 4, 0],
                [1, 0]
            );
            light(fx, {at: [0, 0.05, 0], size: 5.5, color: ARC[4], floor: true, life: 3, alpha: 0.4, time: 0.4});
        },
    },
    {
        id: 'arcane/mana-burst',
        name: 'Mana burst',
        loop: false,
        period: 2,
        view: {height: 1.6},
        build(fx) {
            const at: At = [0, 1.4, 0];
            const BLOW = 0.38;
            // Energy rushes into a point.
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.15, length: 1},
                loop: false,
                life: 0.3,
                speed: -5,
                size: [0.04, 0.06],
                rate: 0,
                color: [ARC[6], '#ffffff'],
                shape: new SphereEmitter({radius: 1.5, thickness: 0}),
                at,
                order: 6,
                b: [tint(COOL, fadeOut(0.8, 0.3))],
            }).emissionOverTime = curve([0, 60], [0.17, 60], [0.18, 0], [1, 0]);
            fx.sys({
                tex: 'glow',
                loop: false,
                life: BLOW,
                size: 1,
                burst: [[0, 1]],
                color: ARC[5],
                at,
                order: 5,
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [0.2, 0],
                            [1, 1],
                        ]
                    ),
                    grow([0, 0.2], [1, 1]),
                ],
            });
            // It blows out in a white flash and rings.
            star(fx, {at, size: 3.4, life: 0.3, time: BLOW, tex: 'glow', ramp: COOL});
            star(fx, {at, size: 2.4, life: 0.25, time: BLOW, ramp: COOL});
            shockwave(fx, {at, size: 4.2, life: 0.5, color: ARC[6], tex: 'ring', facing: true, delay: BLOW});
            shockwave(fx, {at, size: 3, life: 0.4, color: '#ffffff', tex: 'shock', facing: true, delay: BLOW + 0.05});
            shockwave(fx, {at: [0, 0.04, 0], size: 4.5, life: 0.5, color: ARC[5], delay: BLOW + 0.05});
            // Flinging glowing runes that flare and pop into sparks one after another.
            const runes = fx.sys({
                tex: 'rune',
                loop: false,
                life: [0.45, 1],
                speed: [3, 5],
                size: [0.3, 0.42],
                burst: [[BLOW, 10]],
                rot: true,
                color: ARC[6],
                shape: new SphereEmitter({radius: 0.2, thickness: 1}),
                at,
                world: true,
                order: 7,
                b: [
                    tint(COOL, [
                        [1, 0],
                        [1, 0.8],
                        [0.4, 1],
                    ]),
                    airDrag(4),
                    spin([-3, 3]),
                ],
            });
            const pop = fx.sys({
                tex: 'dot',
                loop: false,
                life: [0.2, 0.4],
                speed: [1.5, 3],
                size: [0.04, 0.06],
                burst: [[0, 10]],
                color: [ARC[6], '#ffffff'],
                shape: new SphereEmitter({radius: 0.05, thickness: 1}),
                world: true,
                order: 7,
                b: [tint(COOL, popOut(0.4)), airDrag(2)],
            });
            const flare = fx.sys({
                tex: 'glint',
                loop: false,
                life: 0.18,
                size: 0.5,
                burst: [[0, 1]],
                color: '#ffffff',
                world: true,
                order: 8,
                b: [tint(COOL, popOut(0.2))],
            });
            subEmit(runes, pop);
            subEmit(runes, flare);
            light(fx, {at, size: 4, color: ARC[5], life: 0.5, alpha: 0.6, time: BLOW});
            light(fx, {at: [0, 0.05, 0], size: 5, color: ARC[4], floor: true, life: 0.7, alpha: 0.45, time: BLOW});
        },
    },
    {
        id: 'arcane/portal',
        name: 'Portal',
        loop: true,
        period: 2.4,
        view: {height: 1.6},
        build(fx) {
            const rift = fx.node('rift', [0, 1.6, 0]);
            rift.scaling.set(0.62, 1, 1);
            // An upright rift: fibrous spiral arms winding down into the dark.
            fx.sys({
                tex: 'glow',
                life: 1e4,
                size: 3,
                burst: [[0, 1]],
                color: ARC[1],
                blend: 'alpha',
                alpha: 0.9,
                parent: rift,
                order: 2,
                look: {scalingMode: 'hierarchy'},
            });
            fx.sys({
                geo: flatRing(0.001, 1.35),
                image: 'whirl-band',
                blend: 'add',
                life: 1e4,
                size: 1,
                burst: [[0, 1]],
                color: ARC[4],
                alpha: 0.6,
                parent: rift,
                rotate: [Math.PI / 2, 0, 0],
                order: 3,
                look: {renderFace: 'both', scalingMode: 'hierarchy', mapUV: {tiling: [2, 1], scroll: [0.25, 0.6]}},
            });
            fx.sys({
                tex: 'swirl',
                life: 1e4,
                size: 2.4,
                burst: [[0, 1]],
                color: ARC[6],
                alpha: 0.7,
                parent: rift,
                order: 4,
                look: {scalingMode: 'hierarchy'},
                b: [spin(-1.8)],
            });
            fx.sys({
                tex: 'glow',
                life: 1e4,
                size: 0.9,
                burst: [[0, 1]],
                color: ARC[0],
                blend: 'alpha',
                parent: rift,
                order: 5,
                look: {scalingMode: 'hierarchy'},
            });
            // A lit rim that wobbles.
            const rim = fx.node('rim', [0, 0, 0], rift);
            fx.every((t) => {
                rim.scaling.set(1 + Math.sin(t * 7.9) * 0.03, 1 + Math.sin(t * 5.2 + 1) * 0.04, 1);
            });
            fx.sys({
                geo: flatRing(1.32, 1.42),
                tex: 'white',
                blend: 'add',
                life: 1e4,
                size: 1,
                burst: [[0, 1]],
                color: ARC[6],
                parent: rim,
                rotate: [Math.PI / 2, 0, 0],
                order: 6,
                look: {renderFace: 'both', scalingMode: 'hierarchy'},
            });
            fx.sys({
                tex: 'glow',
                life: 0.6,
                size: [0.5, 0.8],
                rate: 30,
                color: ARC[5],
                alpha: 0.4,
                shape: new CircleEmitter({radius: 1.38, thickness: 0}),
                parent: rim,
                order: 5,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            // Motes and streaks pulled in.
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.2, length: 1},
                life: 0.6,
                speed: -3.2,
                size: [0.03, 0.06],
                rate: 30,
                color: [ARC[6], '#ffffff'],
                shape: new CircleEmitter({radius: 2.2, thickness: 0.2}),
                parent: rift,
                order: 7,
                b: [tint(COOL, fadeOut(0.6, 0.2)), orbit(1.6, [0, 0, 1])],
            });
            light(fx, {at: [0, 0.05, 0.5], size: 4, color: ARC[4], floor: true, life: 2.4, alpha: 0.5, loop: true});
        },
    },
    {
        id: 'arcane/rune-circle',
        name: 'Rune circle',
        loop: true,
        period: 4,
        build(fx) {
            const turn = fx.node('turn', [0, 0.02, 0]);
            fx.every((t) => {
                turn.rotation.y = (t / 4) * Math.PI * 2 * 0.25;
            });
            // A carousel of runes lit by chasing light.
            fx.sys({
                tex: 'rune',
                mode: RenderMode.HorizontalBillBoard,
                life: 1e4,
                size: 3.8,
                burst: [[0, 1]],
                color: ARC[4],
                alpha: 0.85,
                parent: turn,
                order: 2,
                b: [spin(0.4)],
            });
            fx.sys({
                geo: flatRing(1.82, 1.9),
                tex: 'white',
                blend: 'add',
                life: 1e4,
                size: 1,
                burst: [[0, 1]],
                color: ARC[5],
                parent: turn,
                order: 3,
                look: {renderFace: 'both'},
            });
            fx.sys({
                geo: flatRing(1.2, 1.25),
                tex: 'white',
                blend: 'add',
                life: 1e4,
                size: 1,
                burst: [[0, 1]],
                color: ARC[5],
                alpha: 0.7,
                parent: turn,
                order: 3,
                look: {renderFace: 'both'},
            });
            // Chasing light round the outer ring.
            const chase = fx.node('chase', [0, 0, 0], turn);
            fx.every((t) => {
                chase.rotation.y = -t * 2.4;
            });
            for (let i = 0; i < 3; i++) {
                const a = (i / 3) * Math.PI * 2;
                const rider = fx.node('rider', [Math.cos(a) * 1.86, 0.03, Math.sin(a) * 1.86], chase);
                fx.sys({tex: 'glow', life: 0.05, size: 0.8, rate: 60, color: ARC[6], parent: rider, order: 5});
                fx.sys({
                    tex: 'dot',
                    world: true,
                    life: 0.45,
                    size: 0.12,
                    rate: 40,
                    color: ARC[6],
                    mode: RenderMode.HorizontalBillBoard,
                    parent: rider,
                    order: 4,
                    b: [tint([['#ffffff', 0]], popOut(0.1))],
                });
            }
            // A turning square inside, its corners on the inner ring.
            const square = fx.node('square', [0, 0.03, 0]);
            fx.every((t) => {
                square.rotation.y = -t * 0.6;
            });
            fx.sys({
                geo: quad(),
                tex: 'square',
                blend: 'add',
                life: 1e4,
                size: 1.7,
                burst: [[0, 1]],
                color: ARC[5],
                alpha: 0.2,
                parent: square,
                rotate: [Math.PI / 2, 0, 0],
                order: 3,
                look: {renderFace: 'both'},
            });
            // Motes rising off it.
            fx.sys({
                tex: 'dot',
                life: [1, 1.8],
                speed: [0.4, 0.9],
                size: [0.04, 0.07],
                rate: 22,
                color: [ARC[6], ARC[5]],
                shape: new CircleEmitter({radius: 1.8, thickness: 0.6}),
                rotate: [-Math.PI / 2, 0, 0],
                order: 6,
                b: [tint(COOL, fadeOut(0.5, 0.2)), wobble(1, 0.3)],
            });
            light(fx, {at: [0, 0.05, 0], size: 5, color: ARC[4], floor: true, life: 4, alpha: 0.35, loop: true});
        },
    },
    {
        id: 'arcane/spell-charge',
        name: 'Spell charge',
        loop: true,
        period: 1.6,
        build(fx) {
            fx.character([-0.6, 0, 0]);
            const hand = fx.node('hand', [-0.15, 1.1, 0.35]);
            // Streaks and motes spiral in.
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.12, length: 1},
                life: 0.45,
                speed: -3,
                size: [0.03, 0.05],
                rate: 40,
                color: [ARC[6], '#ffffff'],
                shape: new SphereEmitter({radius: 1.4, thickness: 0}),
                parent: hand,
                order: 6,
                b: [tint(COOL, fadeOut(0.8, 0.3)), orbit(3)],
            });
            // Rings collapse into the orb, one after another.
            fx.sys({
                tex: 'ring',
                life: 0.5,
                size: 2.2,
                rate: 2.5,
                color: ARC[5],
                parent: hand,
                order: 5,
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [0, 0],
                            [0.8, 0.3],
                            [0.6, 1],
                        ]
                    ),
                    grow([0, 1], [1, 0.1]),
                ],
            });
            // A swelling orb that crackles with arcs.
            fx.sys({tex: 'glow', life: 0.05, size: 0.8, rate: 60, color: '#ffffff', parent: hand, order: 7});
            fx.sys({
                tex: 'glow',
                life: 0.4,
                size: [1, 1.4],
                rate: 8,
                color: ARC[5],
                alpha: 0.6,
                parent: hand,
                order: 5,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            fx.sys({
                tex: 'bolt',
                life: [0.06, 0.1],
                size: [0.5, 0.8],
                rate: 14,
                rot: true,
                color: ARC[6],
                parent: hand,
                order: 8,
                b: [frames(30, 4), tint([['#ffffff', 0]], popOut(0.5))],
            });
            light(fx, {at: [-0.15, 1.1, 0.6], size: 2.6, color: ARC[5], life: 1.6, alpha: 0.4, loop: true});
            light(fx, {
                at: [-0.3, 0.05, 0.4],
                size: 3.2,
                color: ARC[4],
                floor: true,
                life: 1.6,
                alpha: 0.35,
                loop: true,
            });
        },
    },
    {
        id: 'arcane/star-fall',
        name: 'Star fall',
        loop: false,
        period: 2.8,
        view: {height: 2, distance: 13},
        build(fx) {
            // Stars streak down on long trails across an area.
            const fall = fx.sys({
                tex: 'glow',
                mode: RenderMode.Trail,
                trail: 18,
                trailOpts: {uvFromHead: true},
                world: true,
                loop: false,
                life: 0.55,
                speed: 11,
                size: 0.4,
                burst: [
                    [0.2, 1],
                    [0.38, 1],
                    [0.5, 1],
                    [0.66, 1],
                    [0.8, 1],
                    [0.95, 1],
                    [1.1, 1],
                ],
                color: '#ffffff',
                shape: new ConeEmitter({radius: 2.4, angle: 0, thickness: 1}),
                aim: 'down',
                at: [-0.6, 6.05, 0],
                order: 6,
                b: [
                    tint(COOL, [
                        [1, 0],
                        [1, 1],
                    ]),
                    gravity(7, [1, 0, 0]),
                ],
            });
            const head = fx.sys({
                tex: 'glint',
                loop: false,
                life: 0.2,
                size: 0.5,
                burst: [[0, 1]],
                color: '#ffffff',
                world: true,
                order: 8,
                b: [tint(COOL, popOut(0.2))],
            });
            const ring = fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                loop: false,
                life: 0.45,
                size: 1.6,
                burst: [[0, 1]],
                color: ARC[6],
                world: true,
                order: 5,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.2], [1, 1])],
            });
            const kick = fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.2, length: 1},
                loop: false,
                life: [0.2, 0.4],
                speed: [2, 4],
                size: [0.03, 0.05],
                burst: [[0, 8]],
                color: [ARC[6], '#ffffff'],
                shape: new ConeEmitter({radius: 0.05, angle: 1}),
                rotate: [-Math.PI / 2, 0, 0],
                world: true,
                order: 6,
                b: [tint(COOL, popOut(0.5)), gravity(8)],
            });
            const flash = fx.sys({
                tex: 'glow',
                loop: false,
                life: 0.25,
                size: 1.6,
                burst: [[0, 1]],
                color: ARC[5],
                world: true,
                order: 4,
                b: [tint([['#ffffff', 0]], popOut(0.1))],
            });
            for (const s of [head, ring, kick, flash]) subEmit(fall, s);
            light(fx, {at: [0, 0.05, 0], size: 6, color: ARC[4], floor: true, life: 1.4, alpha: 0.35, time: 0.6});
        },
    },
    {
        id: 'arcane/time-stop',
        name: 'Time stop',
        loop: false,
        period: 3.8,
        view: {height: 1.6},
        build(fx) {
            const OPEN = 0.3;
            const FREEZE = 2.0;
            const CRACK = 2.45;
            const SHATTER = 2.8;
            const clock = fx.node('clock', [0, 1.6, 0]);
            fx.every((t) => {
                const k = between(t, 0, OPEN);
                const s = k < 1 ? k * (1.25 - 0.25 * k) : 1;
                clock.scaling.setAll(Math.max(0.01, s));
                clock.setEnabled(t < SHATTER);
            });
            const drain = (alive: number): Array<[string, number]> => [
                [ARC[5], 0],
                [ARC[5], FREEZE / alive - 0.06],
                ['#c8c8d0', FREEZE / alive],
                ['#c8c8d0', 1],
            ];
            // A clock face springs open: a dial, a rim, twelve ticks.
            const face = (o: {tex: 'ring' | 'glow' | 'rune'; size: number; alpha: number; order: number}) =>
                fx.sys({
                    tex: o.tex,
                    loop: false,
                    life: SHATTER,
                    size: o.size,
                    burst: [[0, 1]],
                    color: '#ffffff',
                    alpha: o.alpha,
                    parent: clock,
                    order: o.order,
                    look: {scalingMode: 'hierarchy'},
                    b: [
                        tint(drain(SHATTER), [
                            [1, 0],
                            [1, 1],
                        ]),
                    ],
                });
            face({tex: 'glow', size: 3.6, alpha: 0.35, order: 2});
            face({tex: 'ring', size: 2.6, alpha: 1, order: 4});
            face({tex: 'rune', size: 2.4, alpha: 0.55, order: 3});
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2;
                fx.sys({
                    tex: 'square',
                    loop: false,
                    life: SHATTER,
                    size: i % 3 === 0 ? 0.13 : 0.07,
                    burst: [[0, 1]],
                    color: '#ffffff',
                    at: [Math.cos(a) * 1.02, Math.sin(a) * 1.02, 0],
                    parent: clock,
                    order: 5,
                    look: {scalingMode: 'hierarchy'},
                    b: [
                        tint(drain(SHATTER), [
                            [1, 0],
                            [1, 1],
                        ]),
                    ],
                });
            }
            // Its hands tick slower and slower, and freeze.
            const hands: Array<[number, number, number]> = [
                [0.85, 0.05, 14],
                [0.6, 0.08, 3],
            ];
            for (const [len, width, speed] of hands) {
                const pivot = fx.node('hand', [0, 0, 0.05], clock);
                fx.every((t) => {
                    const k = between(t, 0, FREEZE);
                    // Ticking: each step shorter as the clock runs down.
                    const run = speed * (k - (k * k) / 2) * FREEZE;
                    const step = Math.floor(run * 2) / 2 + Math.pow((run * 2) % 1, 8) / 2;
                    pivot.rotation.z = -step;
                });
                fx.prop(shapes.box(fx.scene, width, len, 0.02), {
                    at: [0, len / 2, 0],
                    color: '#ffffff',
                    glow: ARC[6],
                    parent: pivot,
                });
            }
            fx.sys({
                tex: 'glow',
                loop: false,
                life: SHATTER,
                size: 0.4,
                burst: [[0, 1]],
                color: '#ffffff',
                parent: clock,
                order: 6,
                look: {scalingMode: 'hierarchy'},
            });
            // Drained of colour it cracks, then shatters into falling shards.
            fx.sys({
                tex: 'crack',
                loop: false,
                life: SHATTER - CRACK,
                size: 2.2,
                burst: [[CRACK, 1]],
                color: '#ffffff',
                at: [0, 0, 0.08],
                parent: clock,
                order: 7,
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [1, 0],
                            [1, 1],
                        ]
                    ),
                    grow([0, 0.4], [0.5, 1], [1, 1]),
                ],
            });
            star(fx, {
                at: [0, 1.6, 0.1],
                size: 2.6,
                life: 0.25,
                time: SHATTER,
                ramp: [
                    ['#ffffff', 0],
                    ['#c8c8d0', 1],
                ],
            });
            clods(fx, {
                at: [0, 1.6, 0],
                count: 26,
                color: ['#d8d8e0', ARC[5]],
                mesh: 'shard',
                size: [0.08, 0.16],
                life: [1, 1.4],
                delay: SHATTER,
                speed: [1, 3],
                shape: new SphereEmitter({radius: 0.8, thickness: 1}),
            });
            light(fx, {at: [0, 0.05, 0], size: 4.5, color: ARC[4], floor: true, life: 2.6, alpha: 0.35, time: 0.1});
        },
    },
];
