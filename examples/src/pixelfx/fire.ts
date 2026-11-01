import {
    CircleEmitter,
    ConeEmitter,
    ConstantValue,
    type ParticleSystem,
    RenderMode,
    SphereEmitter,
} from 'babylon.quarks';
import {
    curve,
    drag,
    fadeOut,
    flicker,
    flipbook,
    frames,
    gravity,
    grow,
    lathe,
    lifeFrames,
    orbit,
    popOut,
    spin,
    tint,
    wobble,
} from './kit';
import {PALETTE, debris, decal, embers, flames, flash, heart, pool, shockwave, smoke, sparks} from './recipes';
import {type FxBuilder, type FxDef, shapes} from './stage';
import {image, rampTexture} from './textures';

/** Licks torn off a fire's tips, rising and shrinking, and flame puffs burning out above it. */
function licks(fx: FxBuilder, at: [number, number, number], radius: number, rate: number): void {
    const fireRamp = rampTexture(fx.scene, PALETTE.fire);
    fx.sys({
        image: 'flame-heat',
        blend: 'add',
        mode: RenderMode.VerticalBillBoard,
        life: [0.25, 0.45],
        speed: [1.2, 2.2],
        size: [0.35, 0.55],
        rot: [-0.25, 0.25],
        rate,
        shape: new ConeEmitter({radius, angle: 0.2}),
        aim: 'up',
        at,
        order: 4,
        look: {gradientMap: {ramp: fireRamp}, pivot: {x: 0, y: 0.45, z: 0}},
        b: [frames(12, 24), tint([['#ffffff', 0]], fadeOut(0.4, 0.1)), grow([0, 1], [1, 0.3])],
    });
    fx.sys({
        image: 'fire-puff-heat',
        randomTile: false,
        blend: 'alpha',
        life: [0.3, 0.55],
        speed: [0.8, 1.6],
        size: [0.3, 0.5],
        rot: true,
        rate: rate * 0.6,
        shape: new ConeEmitter({radius: radius * 0.8, angle: 0.3}),
        aim: 'up',
        at: [at[0], at[1] + 0.2, at[2]],
        order: 3,
        look: {gradientMap: {ramp: fireRamp}},
        b: [lifeFrames(16, 1.2), tint([['#ffffff', 0]], popOut(0.4))],
    });
}

/** pixelfx's fire category, rebuilt as 3D particle effects. */
export const fire: FxDef[] = [
    {
        id: 'fire/brazier',
        name: 'Brazier',
        loop: true,
        period: 3,
        build(fx) {
            const {scene} = fx;
            fx.prop(shapes.cylinder(scene, 0.45, 0.85, 0.45), {at: [0, 1.25, 0], color: '#2b2523'});
            for (let i = 0; i < 3; i++) {
                const a = (i / 3) * Math.PI * 2;
                fx.prop(shapes.cylinder(scene, 1.15, 0.05), {
                    at: [Math.cos(a) * 0.45, 0.55, Math.sin(a) * 0.45],
                    rotate: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35],
                    color: '#221d1c',
                });
            }
            fx.prop(shapes.sphere(scene, 0.72, 10), {at: [0, 1.42, 0], color: '#3a1208', glow: '#a8320f'}).scaling.y =
                0.25;
            heart(fx, {at: [0, 1.8, 0], size: 2.2});
            flames(fx, {at: [0, 1.45, 0], radius: 0.55, height: 2.4, size: [0.8, 1.3], rate: 55});
            // Licks torn off the tips, rising and shrinking; puffs burning out above the fire.
            licks(fx, [0, 2.6, 0], 0.4, 14);
            embers(fx, {at: [0, 1.6, 0], radius: 0.5, rate: 18, speed: [1.5, 3.5]});
            // Sparks streaming up in the draught: fast streaks that slow, wander and cool high above.
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.05, length: 1},
                life: [0.9, 1.6],
                speed: [4, 7],
                size: [0.04, 0.07],
                rate: 22,
                shape: new ConeEmitter({radius: 0.4, angle: 0.25}),
                aim: 'up',
                at: [0, 1.7, 0],
                order: 6,
                b: [
                    tint(
                        [
                            ['#fff3a6', 0],
                            ['#ffc23d', 0.3],
                            ['#f2561d', 0.7],
                            ['#8a1f17', 1],
                        ],
                        fadeOut(0.7, 0.02)
                    ),
                    drag([0, 1], [0.4, 0.3], [1, 0.1]),
                    wobble(1.5, 1.2),
                ],
            });
            smoke(fx, {at: [0, 3.2, 0], rate: 5, alpha: 0.35, size: [0.8, 1.2]});
            pool(fx, {size: 5.5, alpha: 0.35});
        },
    },
    {
        id: 'fire/campfire',
        name: 'Campfire',
        loop: true,
        period: 3,
        build(fx) {
            const {scene} = fx;
            for (const a of [0.6, -0.6, Math.PI / 2]) {
                fx.prop(shapes.cylinder(scene, 1.9, 0.13), {
                    at: [0, 0.15, 0],
                    rotate: [Math.PI / 2, a, 0],
                    color: '#3b2216',
                });
            }
            for (let i = 0; i < 9; i++) {
                const a = (i / 9) * Math.PI * 2;
                fx.prop(shapes.ico(scene, 0.2), {at: [Math.cos(a) * 1.15, 0.08, Math.sin(a) * 1.15], color: '#3a3842'});
            }
            fx.prop(shapes.sphere(scene, 0.55, 10), {at: [0, 0.02, 0], color: '#2a0d06', glow: '#902a0a'}).scaling.y =
                0.22;
            heart(fx, {at: [0, 0.6, 0], size: 1.8});
            flames(fx, {at: [0, 0.2, 0], radius: 0.45, height: 1.9, rate: 45});
            licks(fx, [0, 1.3, 0], 0.35, 10);
            embers(fx, {at: [0, 0.5, 0], radius: 0.4, rate: 12});
            sparks(fx, {
                at: [0, 0.4, 0],
                rate: 3,
                speed: [2.5, 4],
                gravity: 4,
                aim: 'up',
                shape: new ConeEmitter({radius: 0.3, angle: 0.6}),
            });
            // Pops: a crack, a flash, and a fistful of sparks thrown up out of the wood.
            for (const [time, x] of [
                [0.8, 0.25],
                [2.1, -0.3],
            ]) {
                flash(fx, {at: [x, 0.35, 0.1], size: 0.7, time, color: '#fff3a6'});
                sparks(fx, {
                    at: [x, 0.35, 0.1],
                    time,
                    count: 14,
                    speed: [3, 6],
                    life: [0.4, 0.8],
                    gravity: 9,
                    aim: 'up',
                    shape: new ConeEmitter({radius: 0.05, angle: 0.7}),
                });
            }
            smoke(fx, {at: [0, 2, 0], rate: 4, alpha: 0.4});
            pool(fx, {size: 5, alpha: 0.32});
        },
    },
    {
        id: 'fire/candle',
        name: 'Candle',
        loop: true,
        period: 4,
        build(fx) {
            const {scene} = fx;
            fx.prop(shapes.cylinder(scene, 0.12, 0.6), {at: [0, 0.06, 0], color: '#6b5222'});
            fx.prop(shapes.cylinder(scene, 1.1, 0.22), {at: [0, 0.65, 0], color: '#d9cdb4'});
            fx.prop(shapes.cylinder(scene, 0.1, 0.012), {at: [0, 1.25, 0], color: '#111'});
            // candle.js: a calm flame with a blue root that sways and now and then stretches tall, a
            // thread of smoke off its tip now and then, a halo, motes drifting in the light, a bead of
            // wax that swells at the rim, runs down a drip and sets into its bulb.
            const flame = fx.node('flame', [0, 1.3, 0]);
            fx.every((t) => {
                const a = (t / 4) * Math.PI * 2;
                flame.rotation.z = 0.06 * Math.sin(a * 2) + 0.03 * Math.sin(a * 5 + 1);
                const stretch = Math.max(0, Math.sin(a - 1.2)) ** 6;
                flame.scaling.set(1 - 0.15 * stretch, 1 + 0.45 * stretch, 1 - 0.15 * stretch);
            });
            // The flame: one steady teardrop at a time, overlapping as they fade, its root blue.
            fx.sys({
                tex: 'flame',
                life: [0.25, 0.35],
                size: [0.32, 0.38],
                rate: 18,
                at: [0, 0.12, 0],
                parent: flame,
                order: 3,
                look: {scalingMode: 'hierarchy', pivot: {x: 0, y: 0.35, z: 0}},
                b: [tint(PALETTE.fire.slice(0, 3), fadeOut(0.5, 0.25)), wobble(1, 0.03)],
            });
            fx.sys({
                tex: 'glow',
                life: 0.3,
                size: 0.18,
                rate: 10,
                color: '#4a7bff',
                alpha: 0.8,
                at: [0, 0.01, 0],
                parent: flame,
                order: 4,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.3))],
            });
            // A thread of smoke off the tip now and then.
            smoke(fx, {
                at: [0, 1.75, 0],
                burst: [[2.6, 6, 1, 0.6]],
                speed: [0.4, 0.6],
                life: [1.2, 1.6],
                size: [0.08, 0.14],
                color: '#8a8290',
                alpha: 0.4,
                radius: 0.02,
                spread: 0.1,
            });
            // The drip down the right side, and the bead of wax running down it.
            fx.prop(shapes.cylinder(scene, 0.55, 0.035), {at: [0.2, 0.9, 0.06], color: '#e6dcc6'});
            fx.prop(shapes.sphere(scene, 0.09, 8), {at: [0.2, 0.62, 0.06], color: '#e6dcc6'});
            const bead = fx.prop(shapes.sphere(scene, 0.05, 8), {at: [0.2, 1.18, 0.06], color: '#f4ecd8'});
            fx.every((t) => {
                const u = (t % 4) / 4;
                const run = Math.min(1, Math.max(0, (u - 0.35) / 0.45));
                bead.position.y = 1.18 - 0.52 * run * run;
                const swell = Math.min(1, u / 0.35);
                bead.scaling.setAll(0.5 + 0.5 * swell);
                bead.setEnabled(u < 0.85);
            });
            heart(fx, {at: [0, 1.45, 0], size: 1.7, color: '#ffb24a', alpha: 0.4, rate: 8});
            fx.sys({
                tex: 'dot',
                life: [2, 3],
                speed: [0.05, 0.15],
                size: [0.025, 0.04],
                rate: 3,
                color: '#ffe2a0',
                shape: new SphereEmitter({radius: 0.5}),
                at: [0, 1.5, 0],
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.3)), wobble(0.6, 0.3)],
            });
            pool(fx, {size: 2.6, alpha: 0.25, color: '#ffae4a'});
        },
    },
    {
        id: 'fire/fire-breath',
        name: 'Fire breath',
        loop: true,
        period: 1.5,
        build(fx) {
            // fire-breath.js in 3D (1 px ≈ 0.04 m, the stream 320 px/s ≈ 13 m/s): a cone of flame puffs
            // blown from the mouth that slow, swell, rise and cool, the edges first, tearing into tongues
            // and rolling into smoke; licks curling off its edges; bright streaks racing through its
            // heart; a white-hot jet fluttering at the lips; sparks flung ahead, embers lifting off the
            // far end; light at the lips, along the cone and a broad halo, and here a pool on the floor.
            fx.character([-2.6, 0, 0], 1.8, '#3a2a2a');
            const mouth: [number, number, number] = [-2.2, 1.55, 0];
            const along = (d: number, up = 0): [number, number, number] => [mouth[0] + d, mouth[1] + up, 0];
            const SPREAD = 0.2;
            const fireRamp = rampTexture(fx.scene, PALETTE.fire);
            // The cone of billows: pixelfx's flame puff, cooling over its life, swelling as it slows.
            fx.sys({
                image: 'fire-puff-heat',
                randomTile: false,
                blend: 'alpha',
                life: [0.42, 0.8],
                speed: [9.5, 14],
                size: [0.42, 0.7],
                rot: true,
                rate: 170,
                shape: new ConeEmitter({radius: 0.06, angle: SPREAD, thickness: 1}),
                aim: 'right',
                at: along(0.25),
                world: true,
                order: 3,
                look: {gradientMap: {ramp: fireRamp}},
                b: [
                    lifeFrames(16, 1.6),
                    tint([['#ffffff', 0]], popOut(0.3)),
                    grow([0, 0.75], [1, 2]),
                    drag([0, 1], [0.5, 0.5], [1, 0.3]),
                    gravity(-2),
                    wobble(2, 0.8),
                ],
            });
            // Past a third of the way, each billow tears into a tongue licking up and back.
            fx.sys({
                image: 'flame-heat',
                blend: 'add',
                life: [0.45, 0.7],
                speed: [8, 12],
                size: [0.6, 1],
                rot: [-0.5, 0.2],
                rate: 60,
                shape: new ConeEmitter({radius: 0.06, angle: SPREAD * 0.9, thickness: 1}),
                aim: 'right',
                at: along(0.25),
                world: true,
                order: 4,
                look: {
                    gradientMap: {
                        ramp: rampTexture(fx.scene, [
                            ['#ffc23d', 0],
                            ['#f2561d', 0.4],
                            ['#c9281f', 0.7],
                            ['#4a1712', 1],
                        ]),
                    },
                    pivot: {x: 0, y: 0.45, z: 0},
                },
                b: [
                    frames(12, 24),
                    tint(
                        [['#ffffff', 0]],
                        [
                            [0, 0],
                            [0, 0.3],
                            [0.8, 0.45],
                            [0, 1],
                        ]
                    ),
                    grow([0, 0.6], [1, 1.3]),
                    drag([0, 1], [0.5, 0.3], [1, 0.12]),
                    gravity(-5),
                ],
            });
            // Rolling smoke off the far end and the edges.
            smoke(fx, {
                at: along(3.4, 0.35),
                aim: 'right',
                speed: [0.8, 1.6],
                life: [0.5, 0.85],
                rate: 26,
                size: [0.3, 0.5],
                color: '#7a5e5c',
                alpha: 0.6,
                radius: 0.7,
                spread: 0.9,
            });
            // Licks curling off the cone's edges, three a side, rooted on its surface.
            for (let i = 0; i < 6; i++) {
                const side = i % 2 ? 1 : -1;
                const d = (18 + (i >> 1) * 16) * 0.04;
                fx.sys({
                    image: 'flame-heat',
                    blend: 'add',
                    mode: RenderMode.VerticalBillBoard,
                    life: 1e4,
                    size: 0.55 * (1 - d / 5),
                    burst: 1,
                    loop: false,
                    rot: -side * 0.5 - 0.3,
                    at: along(d, side * d * SPREAD * 0.85),
                    order: 4,
                    look: {gradientMap: {ramp: fireRamp}, pivot: {x: 0, y: 0.45, z: 0}},
                    b: [frames(12, 24)],
                });
            }
            // The roar: bright streaks racing out through the heart of the cone.
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.02, length: 1},
                life: [0.12, 0.26],
                speed: [13, 19],
                size: [0.05, 0.08],
                rate: 47,
                color: '#fff3a6',
                shape: new ConeEmitter({radius: 0.05, angle: SPREAD * 0.6}),
                aim: 'right',
                at: along(0.24),
                order: 6,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            ['#ffc23d', 0.6],
                        ],
                        popOut(0.5)
                    ),
                ],
            });
            // The jet at the lips: white-hot overlapping blades fluttering as the breath roars.
            fx.sys({
                image: 'flame-heat',
                blend: 'add',
                life: [0.1, 0.18],
                size: [1, 1.7],
                rot: [-Math.PI / 2 - 0.08, -Math.PI / 2 + 0.08],
                rate: 45,
                at: along(0.05),
                order: 5,
                look: {
                    gradientMap: {
                        ramp: rampTexture(fx.scene, [
                            ['#ffffff', 0],
                            ['#fff3a6', 0.35],
                            ['#ffc23d', 0.7],
                            ['#ff8a2a', 1],
                        ]),
                    },
                    pivot: {x: 0, y: 0.45, z: 0},
                },
                b: [frames(12, 24), tint([['#ffffff', 0]], popOut(0.6))],
            });
            sparks(fx, {
                at: along(1),
                rate: 27,
                speed: [5.5, 11],
                life: [0.25, 0.55],
                gravity: 7.5,
                aim: 'right',
                shape: new ConeEmitter({radius: 0.6, angle: SPREAD * 1.8}),
            });
            embers(fx, {at: along(3, 0), radius: 0.8, rate: 12, life: [0.8, 1.4], speed: [0.8, 2], spread: 0.6});
            // Light: a flare at the lips, the cone's own light, and the floor lit along it.
            heart(fx, {at: along(0.15), size: 1.4, color: '#fff3a6', alpha: 0.75});
            heart(fx, {at: along(1.8, 0.1), size: 3.4, alpha: 0.35});
            heart(fx, {at: along(3.4, 0.3), size: 3.2, alpha: 0.25});
            pool(fx, {at: [0.4, 0, 0], size: 6, alpha: 0.35});
        },
    },
    {
        id: 'fire/fire-ring',
        name: 'Fire ring',
        loop: false,
        period: 3.9,
        build(fx) {
            // fire-ring.js in 3D (1 px ≈ 0.04 m: reach 92 px ≈ 3.7 m). The charge (0-0.32 s): streaks of
            // fire spiral in to the feet and heat builds there. The slam: a white flash at the feet and
            // sparks; then the front races out over 0.75 s (ease-out), a bright band riding it, lighting
            // rings of tongues on the floor as it reaches them: they leap up white-hot, cool as they burn
            // down, gone in 0.3 s near the middle while the rim burns on for 1.3 s. Puffs and embers rise
            // off the burning rings; a soot scorch with sparse cooling embers is left where it crossed.
            const CHARGE = 0.32;
            const SPREAD = 0.75;
            const REACH = 3.7;
            const reachedAt = (d: number) => CHARGE + SPREAD * (1 - Math.cbrt(1 - Math.min(1, d / REACH)));
            fx.character([0, 0, 0], 1.8);
            const fireRamp = rampTexture(fx.scene, PALETTE.fire);
            // The charge: streaks spiralling in to the feet, little flames and a glow building there.
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.05, length: 1},
                life: [0.18, 0.26],
                speed: [-9, -6],
                size: [0.06, 0.09],
                rate: 54,
                duration: CHARGE - 0.05,
                loop: false,
                shape: new CircleEmitter({radius: 1.6, thickness: 0.5}),
                aim: 'up',
                at: [0, 0.2, 0],
                order: 6,
                b: [
                    tint(
                        [
                            ['#ff8a2a', 0],
                            ['#ffe26b', 1],
                        ],
                        popOut(0.6)
                    ),
                    orbit(4, [0, 0, 1]),
                ],
            });
            flames(fx, {
                radius: 0.2,
                height: 0.5,
                size: [0.3, 0.5],
                rate: 30,
                life: [0.12, 0.24],
                duration: CHARGE,
                loop: false,
            });
            fx.sys({
                tex: 'glow',
                life: CHARGE,
                burst: 1,
                loop: false,
                size: 2,
                at: [0, 0.25, 0],
                color: '#ffc06a',
                order: 5,
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [0, 0],
                            [0.8, 1],
                        ]
                    ),
                    grow([0, 0.3], [1, 1]),
                ],
            });
            // The slam: a white flash at the feet, sparks thrown out low.
            flash(fx, {at: [0, 0.15, 0], size: 1.8, time: CHARGE, color: '#ffffff'});
            heart(fx, {at: [0, 1.9, 0], size: 3.6, alpha: 0.5, delay: CHARGE, duration: SPREAD + 0.9, loop: false});
            sparks(fx, {
                at: [0, 0.1, 0],
                time: CHARGE,
                count: 40,
                speed: [3.2, 8.8],
                life: [0.2, 0.5],
                gravity: 6,
                aim: 'up',
                shape: new ConeEmitter({radius: 0.12, angle: 1.3}),
            });
            // The front: a bright band racing out over the floor, fading as it slows to a stop.
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                blend: 'add',
                life: SPREAD + 0.1,
                burst: [[CHARGE, 1]],
                loop: false,
                size: REACH * 2.15,
                at: [0, 0.03, 0],
                color: '#ff8a2a',
                order: 2,
                b: [
                    tint(
                        [
                            ['#fff3a6', 0],
                            ['#ff8a2a', 0.5],
                            ['#c9281f', 1],
                        ],
                        [
                            [1, 0],
                            [1, 0.75],
                            [0, 1],
                        ]
                    ),
                    grow([0, 0.05], [0.25, 0.6], [0.5, 0.88], [1, 1]),
                ],
            });
            // The rings of tongues, each lit as the front reaches it.
            for (let r = 0.4; r <= REACH + 0.01; r += 0.36) {
                const q = Math.min(1, r / REACH);
                const life = 0.3 + 1.0 * q * q;
                const count = Math.max(5, Math.round((Math.PI * 2 * r) / 0.34));
                fx.sys({
                    image: 'flame-heat',
                    blend: 'add',
                    mode: RenderMode.VerticalBillBoard,
                    life: [life * 0.85, life * 1.2],
                    size: [0.9 * (0.6 + 0.55 * q), 1.4 * (0.6 + 0.55 * q)],
                    burst: [[reachedAt(r), count]],
                    loop: false,
                    shape: new CircleEmitter({radius: r, thickness: 0.15}),
                    aim: 'up',
                    order: 4,
                    look: {gradientMap: {ramp: fireRamp}, pivot: {x: 0, y: 0.45, z: 0}},
                    b: [
                        frames(12, 24),
                        tint(
                            [
                                ['#ffffff', 0],
                                ['#ffffff', 0.3],
                                ['#ffb070', 0.65],
                                ['#c05030', 1],
                            ],
                            [
                                [1, 0],
                                [1, 0.1],
                                [0, 1],
                            ]
                        ),
                        grow([0, 0], [0.08, 1.15], [0.15, 1], [1, 0.25]),
                    ],
                });
            }
            // Puffs and embers rising off the burning rings, some rolling into smoke.
            // Their rate: on as the slam lands, easing off as the rings burn down.
            const burning = (from: number, peak: number, tail: number) =>
                curve(
                    [0, 0],
                    [from / 3.9, 0],
                    [(from + 0.05) / 3.9, peak],
                    [(CHARGE + SPREAD + 1.2) / 3.9, tail],
                    [(CHARGE + SPREAD + 1.25) / 3.9, 0],
                    [1, 0]
                );
            const puffs = fx.sys({
                image: 'fire-puff-heat',
                randomTile: false,
                blend: 'alpha',
                life: [0.2, 0.4],
                speed: [0.8, 1.6],
                size: [0.3, 0.55],
                rot: true,
                shape: new CircleEmitter({radius: REACH * 0.75, thickness: 0.6}),
                aim: 'up',
                at: [0, 0.35, 0],
                order: 5,
                look: {gradientMap: {ramp: fireRamp}},
                b: [lifeFrames(16, 1.2), tint([['#ffffff', 0]], popOut(0.3))],
            });
            puffs.emissionOverTime = burning(CHARGE, 60, 30);
            const rising = embers(fx, {radius: REACH * 0.8, speed: [1.2, 2.8], life: [0.6, 1.3]});
            rising.emissionOverTime = burning(CHARGE, 18, 10);
            const fumes = smoke(fx, {
                shape: new CircleEmitter({radius: REACH * 0.8, thickness: 0.5}),
                at: [0, 0.6, 0],
                speed: [0.4, 0.9],
                life: [1, 1.6],
                size: [0.5, 0.8],
                color: '#4a4048',
                alpha: 0.4,
            });
            fumes.emissionOverTime = burning(CHARGE + 0.3, 14, 8);
            // The scorch: a stain of soot where the fire crossed, sparse embers cooling in it.
            decal(fx, {
                tex: 'glow',
                size: REACH * 2.1,
                life: 3.9 - CHARGE - 0.1,
                delay: CHARGE + 0.1,
                color: '#0d0a12',
                alpha: 0.6,
                alphas: [
                    [0, 0],
                    [1, 0.2],
                    [1, 0.7],
                    [0, 1],
                ],
            });
            fx.sys({
                tex: 'dot',
                life: [0.8, 2],
                size: [0.05, 0.08],
                burst: [[CHARGE + 0.3, 40]],
                loop: false,
                shape: new CircleEmitter({radius: REACH * 0.9, thickness: 1}),
                aim: 'up',
                at: [0, 0.03, 0],
                order: 2,
                b: [tint(PALETTE.ember, fadeOut(0.3, 0.05))],
            });
            pool(fx, {size: REACH * 2.3, alpha: 0.4, delay: CHARGE, duration: SPREAD + 1.2, loop: false});
        },
    },
    {
        id: 'fire/fire-tornado',
        name: 'Fire tornado',
        loop: true,
        period: 2,
        build(fx) {
            // The funnel: one mesh, narrow at the foot and flaring at the top, its surface a spiral band
            // of fire (pixelfx's own formula, drawn at full resolution) scrolled round it to spin it.
            const HT = 3.4;
            const profile: Array<[number, number]> = [];
            for (let i = 0; i <= 24; i++) {
                const v = (i / 24) * 1.2;
                profile.push([
                    ((3.5 + 15 * Math.pow(Math.min(v, 1), 1.35) + 6 * Math.max(0, v - 1)) / 80) * HT,
                    v * HT,
                ]);
            }
            const funnel = fx.node('funnel');
            const spinning = {
                image: 'tornado-band',
                geo: lathe(profile, 48),
                blend: 'alpha',
                life: 1e4,
                size: 1,
                burst: 1,
                loop: false,
                parent: funnel,
            } as const;
            // Three turns of the surface a loop, twisted up the column; noise licks at the band.
            const surface = {
                mapUV: {scroll: [1.5, 0] as [number, number]},
                uvDistortion: {
                    map: image(fx.scene, 'noise').texture,
                    strength: 0.035,
                    mapUV: {tiling: [3, 2] as [number, number], scroll: [0.4, -1.2] as [number, number]},
                },
            };
            // The far side, seen through the strands, dimmer; then the near side, darker at its edges.
            fx.sys({
                ...spinning,
                color: '#c08070',
                order: 2,
                look: {...surface, renderFace: 'back'},
            });
            fx.sys({
                ...spinning,
                order: 3,
                look: {
                    ...surface,
                    renderFace: 'front',
                    rim: {color: [0.42, 0.06, 0.04], power: 2, strength: 0.6, mode: 'mix'},
                },
            });
            // Its spine snakes as it turns.
            fx.every((t) => {
                const a = (t / 2) * Math.PI * 2;
                funnel.rotation.z = 0.07 * Math.sin(a * 2) + 0.05 * Math.sin(a);
                funnel.rotation.x = 0.05 * Math.cos(a * 2);
            });
            // The ring of flame whirling at its foot: the torch's flipbook, two turns a loop.
            fx.sys({
                image: 'torch-flame',
                mode: RenderMode.VerticalBillBoard,
                blend: 'alpha',
                life: [0.5, 0.8],
                size: [0.7, 1],
                rate: 30,
                shape: new CircleEmitter({radius: 0.65, thickness: 0.15}),
                aim: 'up',
                look: {pivot: {x: 0, y: 0.45, z: 0}},
                order: 4,
                b: [
                    frames(12, 24),
                    orbit(Math.PI * 2, [0, 0, 1]),
                    tint([['#ffffff', 0]], fadeOut(0.6, 0.15)),
                    grow([0, 0.6], [0.3, 1], [1, 0.7]),
                ],
            });
            // Flame flung off the spinning sides, cooling as it flies.
            fx.sys({
                image: 'torch-flame',
                mode: RenderMode.VerticalBillBoard,
                blend: 'alpha',
                life: [0.3, 0.5],
                speed: [1.5, 3],
                size: [0.45, 0.7],
                rate: 40,
                shape: new ConeEmitter({radius: 0.45, angle: 0.75, thickness: 0.3}),
                aim: 'up',
                at: [0, 0.4, 0],
                world: true,
                order: 5,
                b: [
                    frames(12, 24),
                    orbit(5, [0, 0, 1]),
                    tint(
                        [
                            ['#ffffff', 0],
                            ['#ff8a2a', 1],
                        ],
                        fadeOut(0.4, 0.1)
                    ),
                    grow([0, 1], [1, 0.4]),
                ],
            });
            // Smoke spiralling off the top.
            smoke(fx, {
                at: [0, HT * 1.15, 0],
                rate: 14,
                life: [1.2, 2],
                speed: [0.6, 1.2],
                size: [0.2, 0.35],
                color: '#9a8c94',
                alpha: 0.3,
                radius: 0.8,
                spread: 0.6,
            });
            // Embers orbiting in and out of view.
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.05, length: 1},
                life: [1.2, 2.4],
                speed: [0.6, 1.2],
                size: [0.05, 0.09],
                rate: 18,
                shape: new ConeEmitter({radius: 1.1, angle: 0.3, thickness: 0.3}),
                aim: 'up',
                order: 6,
                b: [tint(PALETTE.ember, fadeOut(0.6, 0.02)), orbit(4.5, [0, 0, 1])],
            });
            heart(fx, {at: [0, 1.6, 0], size: 3.4, alpha: 0.3});
            pool(fx, {size: 4.5});
        },
    },
    {
        id: 'fire/fireball',
        name: 'Fireball',
        loop: true,
        period: 1.6,
        build(fx) {
            // fireball.js in 3D, at twice its scale (head 0.4 m across): a churning white-hot head swept
            // back, four tongues rooted in it streaming back and a corona of six licks peeling off it; a
            // long torn tail of flame puffs it leaves behind that cool, swell, rise and half burn out into
            // smoke; motes flicked off its skin; sparks and embers shed behind; a hot heart, a warm halo,
            // light running down the tail, and here its light passing over the floor.
            const ball = fx.node('ball', [-3, 1.4, 0]);
            const floor = fx.node('ball-floor', [-3, 0, 0]);
            fx.every((t) => {
                ball.position.x = -3.2 + (t / 1.6) * 6.4;
                ball.position.y = 1.4 + 0.03 * Math.sin(t * 13);
                floor.position.x = ball.position.x;
            });
            const fireRamp = rampTexture(fx.scene, PALETTE.fire);
            const hotRamp = rampTexture(fx.scene, [
                ['#ffffff', 0],
                ['#fff3a6', 0.3],
                ['#ffc23d', 0.6],
                ['#f2561d', 1],
            ]);
            // The tail: puffs thrown off the back, left behind in the world, cooling into smoke.
            fx.sys({
                image: 'fire-puff-heat',
                randomTile: false,
                blend: 'alpha',
                life: [0.22, 0.55],
                speed: [0.4, 1.2],
                size: [0.25, 0.45],
                rot: true,
                rate: 110,
                shape: new SphereEmitter({radius: 0.2}),
                parent: ball,
                world: true,
                order: 3,
                look: {gradientMap: {ramp: fireRamp}},
                b: [lifeFrames(16, 1.3), tint([['#ffffff', 0]], popOut(0.35)), grow([0, 1], [1, 2]), gravity(-2.5)],
            });
            smoke(fx, {
                parent: ball,
                at: [-0.6, 0, 0],
                world: true,
                rate: 40,
                life: [0.45, 0.8],
                size: [0.22, 0.38],
                speed: [0.2, 0.5],
                color: '#7a5e5c',
                alpha: 0.55,
                radius: 0.25,
            });
            // The body: tongues rooted in the head streaming back, the longest behind.
            for (const [length, dy] of [
                [1.2, 0],
                [0.92, -0.06],
                [0.88, 0.06],
                [0.6, 0],
            ] as const) {
                fx.sys({
                    image: 'flame-heat',
                    blend: 'add',
                    life: 1e4,
                    size: length,
                    burst: 1,
                    loop: false,
                    rot: Math.PI / 2 - dy * 2,
                    parent: ball,
                    at: [0.06, dy, 0.01],
                    order: 4,
                    look: {gradientMap: {ramp: fireRamp}, pivot: {x: 0, y: 0.45, z: 0}},
                    b: [frames(12, 24)],
                });
            }
            // The corona: thin licks peeling back off the head, three above and three below.
            for (const a of [-1.3, -1.8, -2.3, 1.3, 1.8, 2.3]) {
                fx.sys({
                    image: 'flame-heat',
                    blend: 'add',
                    life: 1e4,
                    size: 0.3 + 0.08 * (2.3 - Math.abs(Math.abs(a) - 1.8) * 2),
                    burst: 1,
                    loop: false,
                    // Pointing back and out: the head's normal at `a` (0 is the nose) swung toward the tail.
                    rot: -Math.atan2(Math.cos(a) * 0.55 - 1, Math.sin(a) * 0.55) - Math.PI / 2,
                    parent: ball,
                    at: [Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0.02],
                    order: 4,
                    look: {gradientMap: {ramp: fireRamp}, pivot: {x: 0, y: 0.45, z: 0}},
                    b: [frames(12, 24)],
                });
            }
            // The head: hot billows churning on the spot, spinning, swept back by the corona and body.
            fx.sys({
                image: 'fire-puff-heat',
                randomTile: false,
                blend: 'add',
                life: [0.12, 0.2],
                size: [0.5, 0.65],
                rot: true,
                rate: 60,
                shape: new SphereEmitter({radius: 0.05}),
                parent: ball,
                order: 5,
                look: {gradientMap: {ramp: hotRamp}},
                b: [lifeFrames(5), spin([-6, 6]), tint([['#ffffff', 0]], popOut(0.5))],
            });
            // Motes flicked off its skin: short hot streaks that die at once.
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.05, length: 1},
                life: [0.08, 0.18],
                speed: [1.2, 2.8],
                size: [0.04, 0.06],
                rate: 22,
                color: '#fff3a6',
                shape: new SphereEmitter({radius: 0.18, thickness: 0}),
                parent: ball,
                world: true,
                order: 6,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            ['#ffc23d', 1],
                        ],
                        popOut(0.5)
                    ),
                ],
            });
            // Shed behind: sparks falling as they cool, and a few big embers.
            sparks(fx, {
                parent: ball,
                world: true,
                rate: 19,
                life: [0.25, 0.55],
                speed: [0.4, 1.4],
                gravity: 2,
                shape: new SphereEmitter({radius: 0.2}),
            });
            embers(fx, {parent: ball, world: true, rate: 6, speed: [0.2, 0.6], life: [0.4, 0.7], size: [0.08, 0.12]});
            // Light: a hot heart, a warm halo, light left down the tail, and on the floor below.
            heart(fx, {parent: ball, size: 0.8, color: '#fff3a6', alpha: 0.6});
            heart(fx, {parent: ball, size: 2.6, alpha: 0.35});
            fx.sys({
                tex: 'glow',
                life: 0.3,
                size: [1, 1.4],
                rate: 30,
                color: '#ff9a3a',
                alpha: 0.18,
                parent: ball,
                world: true,
                order: 2,
                b: [tint([['#ffffff', 0]], popOut(0.2))],
            });
            pool(fx, {parent: floor, size: 3.2, alpha: 0.4});
        },
    },
    {
        id: 'fire/flame-pillar',
        name: 'Flame pillar',
        loop: false,
        period: 5,
        build(fx) {
            // flame-pillar.js in 3D (1 px ≈ 0.04 m: the column 140 px ≈ 5.6 m tall, 24 px ≈ 1 m across).
            // The charge (0-0.55 s): cracks race out over the floor and heat, little flames lick out of
            // the middle, embers leak up the cracks. The eruption: a white flash at the foot, the column
            // shoots up in 0.12 s, a ring of broken floor rolls out, sparks, rocks, grit and dust fly.
            // The roar (to 1.95 s): a white-hot column with hot strands and pulses racing up it, flared
            // at the foot, a crown of tongues at its top, flame shed off its sides, a billowing cap,
            // embers spewed high. The collapse (to 2.45 s): the top falls, breaking into puffs that roll
            // off as smoke; the cracks cool to soot and fade.
            const {scene} = fx;
            const ERUPT = 0.55;
            const RISE = 0.12;
            const FALL = 1.95;
            const GONE = 2.45;
            const HT = 5.6;
            const R0 = 0.48;
            const clamp = (x: number) => Math.min(1, Math.max(0, x));
            const smoothstep = (a: number, b: number, x: number) => {
                const k = clamp((x - a) / (b - a));
                return k * k * (3 - 2 * k);
            };
            const wave = (x: number) => Math.sin(x) * 0.6 + Math.sin(x * 2.3 + 1) * 0.4;
            const height = (t: number) =>
                t < ERUPT
                    ? 0
                    : t < ERUPT + RISE
                      ? 1 - (1 - (t - ERUPT) / RISE) ** 3
                      : t < FALL
                        ? 1 + 0.05 * wave(t * 3)
                        : 1 - clamp((t - FALL) / (GONE - FALL)) ** 2;
            const width = (t: number) =>
                t < ERUPT
                    ? 0
                    : t < FALL
                      ? (1 + 0.45 * Math.exp(-(t - ERUPT) * 7)) * (0.94 + 0.06 * wave(t * 9))
                      : 1 - smoothstep(FALL, GONE, t) + 0.12 * (1 - smoothstep(GONE - 0.1, GONE, t));
            const fireRamp = rampTexture(scene, PALETTE.fire);
            // The cracks: racing out over the floor, glowing white-hot, then cooling and fading.
            decal(fx, {
                tex: 'crack',
                size: 3.4,
                life: 4.4,
                color: '#ffffff',
                blend: 'add',
                alpha: 1,
                alphas: [
                    [0, 0],
                    [1, 0.08],
                    [1, 0.5],
                    [0, 1],
                ],
                colors: [
                    ['#ffe26b', 0],
                    ['#ffffff', 0.12],
                    ['#ff8a2a', 0.45],
                    ['#8a1f17', 0.7],
                    ['#2a1010', 1],
                ],
            });
            // The column: one mesh, flared at the foot and thinning at the top, white-hot with
            // strands and pulses scrolled up it, its silhouette reddened by the rim.
            const profile: Array<[number, number]> = [];
            for (let i = 0; i <= 28; i++) {
                const v = i / 28;
                const foot = 1 + 1.2 * Math.max(0, 1 - (v * 140) / 16) ** 2;
                const top = 1 - smoothstep(0.82, 1, v) * 0.7;
                profile.push([R0 * foot * top, v * HT]);
            }
            const column = fx.node('column');
            const body = {
                image: 'pillar-band',
                geo: lathe(profile, 40),
                blend: 'alpha',
                life: 1e4,
                size: 1,
                burst: 1,
                loop: false,
                parent: column,
            } as const;
            const surface = {
                mapUV: {tiling: [1, 4.5] as [number, number], scroll: [0.05, -3.6] as [number, number]},
                uvDistortion: {
                    map: image(scene, 'noise').texture,
                    strength: 0.05,
                    mapUV: {tiling: [2, 3] as [number, number], scroll: [0.2, -2] as [number, number]},
                },
            };
            fx.sys({
                ...body,
                color: '#ff9a60',
                order: 2,
                look: {...surface, renderFace: 'back', scalingMode: 'hierarchy'},
            });
            fx.sys({
                ...body,
                order: 3,
                look: {
                    ...surface,
                    renderFace: 'front',
                    scalingMode: 'hierarchy',
                    rim: {color: [0.79, 0.16, 0.12], power: 1, strength: 1, mode: 'mix'},
                },
            });
            // The crown: tongues where the column breaks into the air, riding its top.
            const crown = fx.node('crown');
            for (let i = 0; i < 5; i++) {
                const dx = (i - 2) * R0 * 0.4;
                const k = i === 2 ? 1.2 : i % 4 === 0 ? 0.6 : 0.9;
                fx.sys({
                    image: 'flame-heat',
                    blend: 'add',
                    mode: RenderMode.VerticalBillBoard,
                    life: 1e4,
                    burst: 1,
                    loop: false,
                    size: 1.9 * k,
                    rot: -dx * 0.5,
                    at: [dx, -0.5, (i % 2 ? 1 : -1) * 0.15],
                    parent: crown,
                    order: 4,
                    look: {gradientMap: {ramp: fireRamp}, pivot: {x: 0, y: 0.45, z: 0}, scalingMode: 'hierarchy'},
                    b: [frames(12, 24)],
                });
            }
            heart(fx, {
                at: [0, HT * 0.45, 0],
                size: 4.8,
                alpha: 0.4,
                delay: ERUPT,
                duration: FALL - ERUPT + 0.3,
                loop: false,
            });
            // Layers whose rate follows the timeline: `[seconds, rate]` keys over the one-shot, held
            // flat between keys and stepping at each, as a curve over the system's duration.
            const PERIOD = 5;
            const gate = (system: ParticleSystem, ...keys: Array<[number, number]>) => {
                const pts: Array<[number, number]> = [[0, 0]];
                for (const [sec, rate] of keys) {
                    pts.push([sec / PERIOD, pts[pts.length - 1][1]], [sec / PERIOD + 1e-3, rate]);
                }
                pts.push([1, pts[pts.length - 1][1]]);
                system.emissionOverTime = curve(...pts);
            };
            // The charge: little flames licking out of the middle, embers leaking up the cracks.
            const charge = flames(fx, {radius: 0.2, height: 0.7, size: [0.4, 0.6], rate: 0, life: [0.25, 0.4]});
            gate(charge, [0.15, 10], [0.3, 25], [0.42, 40], [ERUPT, 0]);
            gate(
                embers(fx, {radius: 1.3, rate: 0, speed: [1.2, 2.8], life: [0.5, 1]}),
                [0.1, 12],
                [0.3, 30],
                [ERUPT, 0]
            );
            // Licks running up the column's sides, raggedening its silhouette.
            gate(
                fx.sys({
                    image: 'flame-heat',
                    blend: 'add',
                    mode: RenderMode.VerticalBillBoard,
                    life: [0.7, 1],
                    speed: [5, 7],
                    size: [0.7, 1.1],
                    rate: 0,
                    shape: new ConeEmitter({radius: R0, angle: 0.02, thickness: 0.05}),
                    aim: 'up',
                    parent: column,
                    world: true,
                    order: 4,
                    look: {gradientMap: {ramp: fireRamp}, pivot: {x: 0, y: 0.45, z: 0}},
                    b: [frames(12, 24), tint([['#ffffff', 0]], fadeOut(0.7, 0.1)), grow([0, 1], [1, 0.6])],
                }),
                [ERUPT, 45],
                [FALL, 0]
            );
            // Flame shed off the column's sides, some rolling into smoke, at three heights.
            for (const v of [0.2, 0.5, 0.8]) {
                gate(
                    fx.sys({
                        image: 'fire-puff-heat',
                        randomTile: false,
                        blend: 'alpha',
                        life: [0.25, 0.5],
                        speed: [0.6, 1.6],
                        size: [0.5, 0.9],
                        rot: true,
                        rate: 0,
                        shape: new ConeEmitter({radius: R0 * 0.9, angle: 1.1, thickness: 0.1}),
                        aim: 'up',
                        at: [0, v * HT, 0],
                        parent: column,
                        world: true,
                        order: 4,
                        look: {gradientMap: {ramp: fireRamp}},
                        b: [
                            lifeFrames(16, 1.2),
                            tint([['#ffffff', 0]], popOut(0.3)),
                            grow([0, 0.8], [1, 1.6]),
                            gravity(-2.5),
                        ],
                    }),
                    [ERUPT, 18],
                    [GONE, 0]
                );
            }
            // The billowing cap: big puffs boiling off the top, heaviest as it collapses.
            gate(
                fx.sys({
                    image: 'fire-puff-heat',
                    randomTile: false,
                    blend: 'alpha',
                    life: [0.4, 0.75],
                    speed: [0.8, 2.4],
                    size: [1, 1.7],
                    rot: true,
                    rate: 0,
                    shape: new ConeEmitter({radius: R0 * 1.2, angle: 0.6, thickness: 1}),
                    aim: 'up',
                    at: [0, -0.2, 0],
                    parent: crown,
                    world: true,
                    order: 3,
                    look: {gradientMap: {ramp: fireRamp}},
                    b: [
                        lifeFrames(16, 1.1),
                        tint([['#ffffff', 0]], popOut(0.3)),
                        grow([0, 0.7], [1, 1.5]),
                        gravity(-2),
                    ],
                }),
                [ERUPT, 40],
                [FALL, 95],
                [GONE - 0.1, 0]
            );
            gate(
                smoke(fx, {
                    at: [0, 0.4, 0],
                    parent: crown,
                    rate: 0,
                    speed: [0.6, 1.4],
                    life: [1, 1.8],
                    size: [1, 1.6],
                    color: '#4a4048',
                    alpha: 0.55,
                    radius: 0.6,
                    spread: 0.7,
                }),
                [ERUPT + 0.2, 8],
                [FALL, 30],
                [GONE, 0]
            );
            gate(
                embers(fx, {
                    at: [0, -0.3, 0],
                    parent: crown,
                    radius: 0.3,
                    rate: 0,
                    speed: [2, 4.4],
                    life: [0.7, 1.3],
                    spread: 0.8,
                }),
                [ERUPT, 30],
                [FALL, 0]
            );
            // The eruption: a flash at the foot, sparks, rocks, grit, dust and a ring of broken floor.
            flash(fx, {at: [0, 0.2, 0], size: 2.2, time: ERUPT, color: '#ffffff'});
            heart(fx, {at: [0, 2, 0], size: 3.8, alpha: 0.7, delay: ERUPT, duration: 0.6, loop: false});
            sparks(fx, {
                time: ERUPT,
                count: 70,
                speed: [4, 10.4],
                life: [0.25, 0.7],
                gravity: 9,
                aim: 'up',
                shape: new ConeEmitter({radius: 0.16, angle: 1.1}),
            });
            debris(fx, {
                count: 18,
                delay: ERUPT,
                speed: [6, 13],
                color: ['#4a3f69', '#6a5c90'],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.25, angle: 0.6}),
            });
            debris(fx, {
                count: 40,
                delay: ERUPT,
                speed: [3, 10],
                size: [0.04, 0.08],
                life: [1, 1.8],
                color: ['#4a3f69', '#8a7cb0'],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.2, angle: 0.9}),
            });
            smoke(fx, {
                burst: [[ERUPT, 14]],
                shape: new CircleEmitter({radius: 0.3, thickness: 1}),
                at: [0, 0.1, 0],
                speed: [1.6, 4.4],
                life: [1, 1.8],
                size: [0.6, 1],
                color: '#6a6078',
                alpha: 0.6,
                loop: false,
            });
            shockwave(fx, {tex: 'ring', delay: ERUPT, size: 6.8, life: 0.45, color: '#ff8a2a', alpha: 0.9});
            // The floor glows from beneath while it's hot.
            pool(fx, {size: 4.5, alpha: 0.45, delay: 0.1, duration: 2.3, loop: false});
            // The timeline: the column's height and width, the crown riding its top.
            fx.every((t) => {
                const h = height(t);
                const w = width(t);
                const on = h > 0.01 && w > 0.02;
                column.scaling.set(on ? w : 1e-3, on ? h : 1e-3, on ? w : 1e-3);
                const crowned = on && t < FALL + 0.25;
                crown.position.y = h * HT;
                const c = crowned ? clamp(w) : 1e-3;
                crown.scaling.set(c, c, c);
            });
        },
    },
    {
        id: 'fire/flamethrower',
        name: 'Flamethrower',
        loop: true,
        period: 1.6,
        build(fx) {
            // flamethrower.js in 3D (1 px ≈ 0.04 m: reach 112 px ≈ 4.5 m, the fuel 280 px/s ≈ 11 m/s): a
            // blue pilot cone at the nozzle; a sagging stream of burning fuel, white at the core with a
            // ragged red skin, hot strands and surges racing down it; tongues licking up off it, swept
            // back; at the tip the fuel curls forward, up and back over itself and turns to smoke;
            // burning drops arc off it. Once a loop the jet coughs (0.55 s): the flow cuts out, the gap
            // runs down the stream, the nozzle spits sparks, blobs and a puff of smoke, then it surges.
            const {scene} = fx;
            const nozzle: [number, number, number] = [-2.4, 1.2, 0];
            const along = (d: number, up = 0): [number, number, number] => [nozzle[0] + d, nozzle[1] + up, 0];
            const REACH = 4.5;
            const V = 11.2;
            const RIDE = REACH / V;
            const COUGH = 0.55;
            const smoothstep = (a: number, b: number, x: number) => {
                const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
                return k * k * (3 - 2 * k);
            };
            const flow = (u: number) =>
                1 -
                smoothstep(COUGH, COUGH + 0.04, u) * (1 - smoothstep(COUGH + 0.1, COUGH + 0.16, u)) +
                0.25 * Math.exp(-(((u - COUGH - 0.2) / 0.05) ** 2));
            // The weapon: a barrel and a tank.
            fx.prop(shapes.cylinder(scene, 1.1, 0.13), {
                at: [nozzle[0] - 0.55, nozzle[1], 0],
                rotate: [0, 0, Math.PI / 2],
                color: '#4a4f5a',
            });
            fx.prop(shapes.cylinder(scene, 0.7, 0.26), {at: [nozzle[0] - 1.2, nozzle[1] - 0.25, 0], color: '#5a3a34'});
            const hot = rampTexture(scene, [
                ['#ffffff', 0],
                ['#fff3a6', 0.3],
                ['#ffc23d', 0.6],
                ['#ff8a2a', 1],
            ]);
            const fireRamp = rampTexture(scene, PALETTE.fire);
            const gated: Array<[ParticleSystem, number]> = [];
            const gate = (system: ParticleSystem, rate: number) => {
                gated.push([system, rate]);
                return system;
            };
            // The stream's red skin: billows cooling from orange to soot red as they swell.
            gate(
                fx.sys({
                    image: 'fire-puff-heat',
                    randomTile: false,
                    blend: 'alpha',
                    life: [RIDE * 0.9, RIDE * 1.1],
                    speed: [V * 0.95, V * 1.05],
                    size: [0.5, 0.6],
                    rot: true,
                    rate: 0,
                    shape: new ConeEmitter({radius: 0.04, angle: 0.035, thickness: 1}),
                    aim: 'right',
                    at: along(0.15),
                    world: true,
                    order: 3,
                    look: {gradientMap: {ramp: fireRamp}},
                    b: [
                        lifeFrames(13, 0.8),
                        tint([['#ffffff', 0]], popOut(0.2)),
                        grow([0, 0.8], [1, 2.5]),
                        gravity(2.5),
                        wobble(3, 0.25),
                    ],
                }),
                220
            );
            // Its white-hot core, cooling to yellow down the stream.
            gate(
                fx.sys({
                    image: 'fire-puff-heat',
                    randomTile: false,
                    blend: 'add',
                    alpha: 0.9,
                    life: [RIDE * 0.8, RIDE * 0.95],
                    speed: [V * 0.97, V * 1.03],
                    size: [0.45, 0.55],
                    rot: true,
                    rate: 0,
                    shape: new ConeEmitter({radius: 0.02, angle: 0.02, thickness: 1}),
                    aim: 'right',
                    at: along(0.1),
                    world: true,
                    order: 4,
                    look: {gradientMap: {ramp: hot}},
                    b: [
                        lifeFrames(9),
                        tint([['#ffffff', 0]], fadeOut(0.5, 0.05)),
                        grow([0, 0.8], [1, 2]),
                        gravity(2.5),
                    ],
                }),
                200
            );
            // A solid white-hot spine: long overlapping glow streaks, so the stream reads unbroken.
            gate(
                fx.sys({
                    tex: 'glow',
                    mode: RenderMode.StretchedBillBoard,
                    stretch: {speed: 0.045, length: 1},
                    life: [RIDE * 0.8, RIDE * 0.95],
                    speed: [V * 0.98, V * 1.02],
                    size: [0.22, 0.26],
                    rate: 0,
                    shape: new ConeEmitter({radius: 0.01, angle: 0.015}),
                    aim: 'right',
                    at: along(0.1),
                    world: true,
                    order: 5,
                    b: [
                        tint(
                            [
                                ['#ffffff', 0],
                                ['#fff3a6', 0.4],
                                ['#ffc23d', 1],
                            ],
                            fadeOut(0.6, 0.02)
                        ),
                        grow([0, 0.8], [1, 2.2]),
                        gravity(2.5),
                    ],
                }),
                90
            );
            // Hot strands and surges racing down the stream, faster than the fuel around them.
            gate(
                fx.sys({
                    tex: 'dot',
                    mode: RenderMode.StretchedBillBoard,
                    stretch: {speed: 0.03, length: 1},
                    life: [RIDE * 0.5, RIDE * 0.8],
                    speed: [V * 1.05, V * 1.25],
                    size: [0.05, 0.08],
                    rate: 0,
                    color: '#ffffff',
                    shape: new ConeEmitter({radius: 0.04, angle: 0.03}),
                    aim: 'right',
                    at: along(0.15),
                    order: 6,
                    b: [
                        tint(
                            [
                                ['#ffffff', 0],
                                ['#ffe26b', 0.7],
                            ],
                            popOut(0.4)
                        ),
                        gravity(2.5),
                    ],
                }),
                40
            );
            // Tongues licking up off the burning fuel, riding along it, swept back by the wind of it.
            gate(
                fx.sys({
                    image: 'flame-heat',
                    blend: 'add',
                    mode: RenderMode.VerticalBillBoard,
                    life: [RIDE * 0.8, RIDE],
                    speed: [V * 0.9, V],
                    size: [0.25, 0.35],
                    rot: [0.4, 0.7],
                    rate: 0,
                    shape: new ConeEmitter({radius: 0.05, angle: 0.03, thickness: 1}),
                    aim: 'right',
                    at: along(0.4, 0.06),
                    world: true,
                    order: 5,
                    look: {gradientMap: {ramp: fireRamp}, pivot: {x: 0, y: 0.45, z: 0}},
                    b: [
                        frames(12, 24),
                        tint(
                            [['#ffffff', 0]],
                            [
                                [0, 0],
                                [0.9, 0.15],
                                [0.8, 0.8],
                                [0, 1],
                            ]
                        ),
                        grow([0, 0.5], [1, 3]),
                        gravity(2.5),
                    ],
                }),
                32
            );
            // The curl: where the stream runs out of push the fuel rolls forward, up and back over itself.
            const tip = along(REACH - 0.1, -0.15);
            gate(
                fx.sys({
                    image: 'fire-puff-heat',
                    randomTile: false,
                    blend: 'alpha',
                    life: [0.38, 0.62],
                    speed: [2.5, 4],
                    size: [0.6, 0.8],
                    rot: true,
                    rate: 0,
                    shape: new ConeEmitter({radius: 0.08, angle: 0.3, thickness: 1}),
                    aim: 'up',
                    rotate: [0, 0, 0.35],
                    at: tip,
                    world: true,
                    order: 3,
                    look: {gradientMap: {ramp: fireRamp}},
                    b: [
                        lifeFrames(16, 1.3),
                        tint([['#ffffff', 0]], popOut(0.35)),
                        grow([0, 0.8], [1, 1.9]),
                        gravity(-6),
                        drag([0, 1], [1, 0.3]),
                    ],
                }),
                70
            );
            // ...and turns to smoke, rising and drifting back.
            smoke(fx, {
                at: along(REACH - 0.1, 0.35),
                aim: 'up',
                speed: [0.6, 1.2],
                life: [0.6, 1],
                rate: 20,
                size: [0.9, 1.2],
                color: '#8a7a82',
                alpha: 0.75,
                radius: 0.45,
                spread: 0.6,
            });
            // The pilot at the nozzle: a blue cone of gas where it lights, a white point at its heart.
            fx.sys({
                image: 'flame-heat',
                blend: 'add',
                life: [0.1, 0.16],
                size: [0.32, 0.4],
                rot: [-Math.PI / 2 - 0.05, -Math.PI / 2 + 0.05],
                rate: 40,
                at: along(0.02),
                order: 6,
                look: {
                    gradientMap: {
                        ramp: rampTexture(scene, [
                            ['#a8d4ff', 0],
                            ['#3a62e0', 0.5],
                            ['#1b2a8a', 1],
                        ]),
                    },
                    pivot: {x: 0, y: 0.45, z: 0},
                },
                b: [frames(12, 24), tint([['#ffffff', 0]], popOut(0.5))],
            });
            heart(fx, {at: along(0.04), size: 0.25, color: '#ffffff', alpha: 0.9});
            heart(fx, {at: along(0.08), size: 0.6, color: '#a8d4ff', alpha: 0.45});
            // Burning drops shaken off the stream, arcing down trailing flame.
            gate(
                fx.sys({
                    tex: 'dot',
                    trail: 8,
                    mode: RenderMode.Trail,
                    life: [0.35, 0.6],
                    speed: [V * 0.3, V * 0.6],
                    size: [0.07, 0.1],
                    rate: 0,
                    shape: new ConeEmitter({radius: 0.05, angle: 0.25}),
                    aim: 'right',
                    at: along(1.6),
                    world: true,
                    order: 4,
                    b: [tint(PALETTE.ember, fadeOut(0.6, 0.02)), gravity(10)],
                }),
                6
            );
            // The cough: sparks, blobs of burning fuel that fall short, and a puff of smoke.
            sparks(fx, {
                at: along(0.15),
                time: COUGH,
                count: 12,
                speed: [4.8, 9.6],
                life: [0.2, 0.45],
                gravity: 12,
                aim: 'right',
                shape: new ConeEmitter({radius: 0.05, angle: 0.8}),
            });
            fx.sys({
                image: 'fire-puff-heat',
                randomTile: false,
                blend: 'alpha',
                life: [0.25, 0.4],
                speed: [3.6, 6.8],
                size: [0.2, 0.3],
                rot: true,
                burst: [[COUGH + 0.02, 5]],
                shape: new ConeEmitter({radius: 0.05, angle: 0.35}),
                aim: 'right',
                at: along(0.15),
                world: true,
                order: 4,
                look: {gradientMap: {ramp: fireRamp}},
                b: [lifeFrames(16), gravity(8), drag([0, 1], [1, 0.4])],
            });
            smoke(fx, {
                at: along(0.35, 0.1),
                burst: [[COUGH, 3]],
                speed: [0.8, 1.2],
                life: [0.6, 0.75],
                size: [0.3, 0.45],
                color: '#5a4a52',
                alpha: 0.6,
            });
            // The flow: cut by the cough, and surging back; the gap runs down the stream by itself.
            fx.every((t) => {
                const k = flow(t);
                for (const [system, rate] of gated) system.emissionOverTime = new ConstantValue(rate * k);
            });
            // Light: the pilot, along the stream and the burning tip; the floor lit beneath.
            heart(fx, {at: along(0.1), size: 1.4, color: '#ffe2a0', alpha: 0.6});
            heart(fx, {at: along(2.2, -0.1), size: 3, alpha: 0.3});
            heart(fx, {at: along(REACH, 0.2), size: 2.6, alpha: 0.35});
            pool(fx, {at: [nozzle[0] + 2.5, 0, 0], size: 6, alpha: 0.3});
        },
    },
    {
        id: 'fire/meteor',
        name: 'Meteor',
        loop: false,
        period: 5,
        build(fx) {
            // meteor.js in 3D (1 px ≈ 0.04 m): a burning rock streaks in from the upper left over 0.62 s,
            // speeding up, white-hot on its leading face, four blades of flame streaming back off it,
            // shedding fire puffs that roll into smoke, sparks and embers, the floor lighting up below.
            // The hit: a white flash and a flare of rays, a fireball thrown up and forward with the rock's
            // momentum, a rising column, smoke and dust, sparks, embers, burning brands that land and
            // keep burning, rocks and grit, a ring of broken floor rolling out; then a glowing crater that
            // cools to soot, the rock half-buried in it, cooling, and everything fading by the end.
            const {scene} = fx;
            const HIT = 0.62;
            const FROM: [number, number, number] = [-4.5, 5.7, -0.6];
            // The tongues trail back up the path: a billboard turned to point up-left.
            const back = Math.atan2(-FROM[0], FROM[1]);
            const rock = fx.node('rock', FROM);
            const stone = fx.prop(shapes.ico(scene, 0.26), {parent: rock, color: '#3a2420', glow: '#c2401a'});
            fx.every((t) => {
                const u = Math.min(1, t / HIT);
                const k = u * u * 0.35 + u * 0.65;
                rock.position.set(FROM[0] * (1 - k), 0.15 + (FROM[1] - 0.15) * (1 - k), FROM[2] * (1 - k));
                rock.rotation.z = t * 5;
                stone.setEnabled(t < HIT);
            });
            const fireRamp = rampTexture(scene, PALETTE.fire);
            const hot = rampTexture(scene, [
                ['#ffffff', 0],
                ['#fff3a6', 0.3],
                ['#ffc23d', 0.6],
                ['#f2561d', 1],
            ]);
            // The comet: blades of flame streaming back off the rock, fluttering, white at the root.
            fx.sys({
                image: 'flame-heat',
                blend: 'add',
                life: [0.08, 0.14],
                size: [0.9, 1.7],
                rot: [back - 0.12, back + 0.12],
                rate: 60,
                duration: HIT,
                loop: false,
                shape: new SphereEmitter({radius: 0.08}),
                parent: rock,
                order: 6,
                look: {gradientMap: {ramp: fireRamp}, pivot: {x: 0, y: 0.42, z: 0}},
                b: [frames(14, 24), tint([['#ffffff', 0]], popOut(0.6))],
            });
            fx.sys({
                image: 'flame-heat',
                blend: 'add',
                life: [0.08, 0.14],
                size: [0.6, 0.9],
                rot: [back - 0.08, back + 0.08],
                rate: 40,
                duration: HIT,
                loop: false,
                parent: rock,
                order: 7,
                look: {gradientMap: {ramp: hot}, pivot: {x: 0, y: 0.42, z: 0}},
                b: [frames(14, 24), tint([['#ffffff', 0]], popOut(0.6))],
            });
            // Fire puffs shed behind it, rolling into smoke, sparks and embers flung off it.
            fx.sys({
                image: 'fire-puff-heat',
                randomTile: false,
                blend: 'alpha',
                life: [0.3, 0.6],
                speed: [0.3, 0.9],
                size: [0.6, 1.1],
                rot: true,
                rate: 140,
                duration: HIT,
                loop: false,
                shape: new SphereEmitter({radius: 0.2}),
                parent: rock,
                world: true,
                order: 4,
                look: {gradientMap: {ramp: fireRamp}},
                b: [lifeFrames(16, 1.2), tint([['#ffffff', 0]], popOut(0.35)), grow([0, 0.8], [1, 1.6]), gravity(-1.5)],
            });
            smoke(fx, {
                parent: rock,
                world: true,
                rate: 40,
                duration: HIT,
                loop: false,
                life: [0.6, 1],
                speed: [0.1, 0.4],
                color: '#4a4048',
                alpha: 0.5,
                size: [0.6, 0.9],
            });
            sparks(fx, {
                parent: rock,
                rate: 36,
                duration: HIT,
                loop: false,
                speed: [1, 3],
                life: [0.2, 0.5],
                gravity: 4,
            });
            embers(fx, {
                parent: rock,
                rate: 18,
                duration: HIT,
                loop: false,
                radius: 0.2,
                speed: [0.4, 1.2],
                life: [0.8, 1.6],
            });
            heart(fx, {parent: rock, size: 2.6, color: '#ffe2a0', alpha: 0.65, duration: HIT, loop: false});
            heart(fx, {parent: rock, size: 0.7, color: '#ffffff', alpha: 0.8, duration: HIT, loop: false});
            // The floor lights up as it comes in.
            fx.sys({
                tex: 'glow',
                mode: RenderMode.HorizontalBillBoard,
                life: HIT,
                burst: 1,
                loop: false,
                size: 4,
                at: [0, 0.02, 0],
                color: '#ff9a3a',
                order: 1,
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [0, 0],
                            [0.5, 1],
                        ]
                    ),
                    grow([0, 0.4], [1, 1]),
                ],
            });
            // The hit: a white flash and a flare of rays.
            flash(fx, {at: [0, 0.25, 0], size: 2.4, time: HIT, color: '#ffffff'});
            flash(fx, {at: [0, 0.25, 0], size: 5, time: HIT, life: 0.25});
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.12, length: 1},
                life: [0.12, 0.24],
                speed: [10, 16],
                size: [0.06, 0.1],
                burst: [[HIT, 16]],
                loop: false,
                shape: new SphereEmitter({radius: 0.1, thickness: 1}),
                at: [0, 0.25, 0],
                order: 8,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            ['#ffc23d', 1],
                        ],
                        popOut(0.3)
                    ),
                    drag([0, 1], [1, 0.2]),
                ],
            });
            heart(fx, {at: [0, 2.2, 0], size: 4.2, alpha: 0.6, delay: HIT, duration: 0.9, loop: false});
            // The fireball, thrown up and forward with the rock's momentum, and a rising column.
            fx.sys({
                image: 'fire-puff-heat',
                randomTile: false,
                blend: 'alpha',
                life: [0.5, 1.1],
                speed: [2, 8.4],
                size: [1, 1.8],
                rot: true,
                burst: [[HIT, 34]],
                loop: false,
                shape: new ConeEmitter({radius: 0.25, angle: 1.3}),
                aim: 'up',
                rotate: [0, 0, -0.25],
                at: [0, 0.2, 0],
                world: true,
                order: 4,
                look: {gradientMap: {ramp: fireRamp}},
                b: [
                    lifeFrames(16, 1.3),
                    tint([['#ffffff', 0]], popOut(0.4)),
                    grow([0, 0.7], [1, 1.8]),
                    drag([0, 1], [1, 0.15]),
                    gravity(-2),
                ],
            });
            fx.sys({
                image: 'fire-puff-heat',
                randomTile: false,
                blend: 'alpha',
                life: [0.8, 1.2],
                speed: [5.2, 8.8],
                size: [1.3, 1.7],
                rot: true,
                burst: [[HIT, 9]],
                loop: false,
                shape: new ConeEmitter({radius: 0.25, angle: 0.12}),
                aim: 'up',
                at: [0, 0.2, 0],
                world: true,
                order: 4,
                look: {gradientMap: {ramp: fireRamp}},
                b: [
                    lifeFrames(16, 1.2),
                    tint([['#ffffff', 0]], popOut(0.4)),
                    grow([0, 0.6], [1, 1.9]),
                    drag([0, 1], [1, 0.2]),
                ],
            });
            smoke(fx, {
                at: [0, 0.6, 0],
                burst: [[HIT + 0.15, 20]],
                speed: [1.2, 4.4],
                life: [1.8, 2.8],
                size: [1.4, 2.2],
                color: '#3a3240',
                alpha: 0.6,
                radius: 0.6,
                spread: 0.7,
                loop: false,
            });
            smoke(fx, {
                burst: [[HIT, 16]],
                shape: new CircleEmitter({radius: 0.5, thickness: 1}),
                at: [0, 0.1, 0],
                speed: [2.4, 5.2],
                life: [1.2, 2],
                size: [0.8, 1.2],
                color: '#6a6078',
                alpha: 0.55,
                loop: false,
            });
            sparks(fx, {
                at: [0, 0.16, 0],
                time: HIT,
                count: 90,
                speed: [4, 12],
                life: [0.2, 0.7],
                gravity: 9,
                aim: 'up',
                shape: new ConeEmitter({radius: 0.1, angle: 1.3}),
            });
            embers(fx, {
                at: [0, 0.3, 0],
                burst: [[HIT, 36]],
                radius: 0.35,
                speed: [1.6, 6],
                life: [1.2, 2.6],
                loop: false,
            });
            // Burning brands: they land around the crater and keep burning down.
            debris(fx, {
                count: 10,
                delay: HIT,
                speed: [5, 9.6],
                size: [0.08, 0.12],
                color: ['#ffc23d', '#ff5a1a'],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.2, angle: 1}),
            });
            flames(fx, {
                radius: 1.9,
                height: 0.6,
                size: [0.35, 0.55],
                rate: 22,
                life: [0.3, 0.5],
                delay: HIT + 0.6,
                duration: 2.6,
                loop: false,
            });
            debris(fx, {
                count: 28,
                delay: HIT,
                speed: [5.6, 13.6],
                color: ['#4a3f69', '#2a1a16'],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.3, angle: 0.8}),
            });
            debris(fx, {
                count: 80,
                delay: HIT,
                speed: [3.6, 10.8],
                size: [0.04, 0.08],
                life: [1.2, 2.2],
                color: ['#4a3f69', '#8a7cb0'],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.24, angle: 0.75}),
            });
            shockwave(fx, {tex: 'ring', delay: HIT, size: 8.8, life: 0.5, color: '#ff8a2a', alpha: 0.9});
            // The crater: hot rock pooled in the dent cooling to soot, its cracks, the rock half-buried.
            decal(fx, {size: 3.2, life: 4.3, delay: HIT, alpha: 0.85});
            decal(fx, {
                size: 3,
                life: 2.8,
                delay: HIT,
                color: '#ffffff',
                blend: 'add',
                alpha: 1,
                colors: [
                    ['#ffffff', 0],
                    ['#ffc23d', 0.15],
                    ['#f2561d', 0.45],
                    ['#8a1f17', 0.75],
                    ['#2a0a08', 1],
                ],
            });
            decal(fx, {
                tex: 'crack',
                size: 4,
                life: 3.4,
                delay: HIT,
                color: '#ffffff',
                blend: 'add',
                alpha: 1,
                colors: [
                    ['#ffe26b', 0],
                    ['#ff5a1a', 0.35],
                    ['#3a0804', 1],
                ],
            });
            const core = fx.prop(shapes.ico(scene, 0.22), {at: [0.1, 0.05, 0], color: '#2a1a16', glow: '#5a1a08'});
            fx.every((t) => core.setEnabled(t >= HIT && t < 4.6));
            heart(fx, {at: [0.1, 0.2, 0], size: 1.2, alpha: 0.5, delay: HIT, duration: 2.8, loop: false});
            pool(fx, {size: 5, delay: HIT, duration: 2.6, loop: false, alpha: 0.4});
        },
    },
    {
        id: 'fire/spirit-flame',
        name: 'Spirit flame',
        loop: true,
        period: 3,
        build(fx) {
            // spirit-flame.js in 3D: a cold ghost fire floating in the air and bobbing. Its body (a bright
            // rim round a hollow dark heart, a pale core low down, a wave climbing it twice a loop, side
            // wisps flickering out, bright strands drifting up the heart) is pixelfx's own, as a flipbook.
            // Round it: curls breaking off the tips and drifting up, cold sparks rising and twinkling, a
            // slow cold glow, light along the body, the pale heart breathing, and its light on the floor.
            const spirit = fx.node('spirit', [0, 0.9, 0]);
            fx.every((t) => {
                spirit.position.y = 0.9 + 0.06 * Math.sin((t / 3) * Math.PI * 2);
            });
            const SIZE = 2.5;
            fx.sys({
                image: 'spirit-flame',
                randomTile: false,
                blend: 'alpha',
                mode: RenderMode.VerticalBillBoard,
                life: 1e4,
                size: SIZE,
                burst: 1,
                loop: false,
                parent: spirit,
                order: 4,
                look: {pivot: {x: 0, y: 0.47, z: 0}},
                b: [flipbook(12, 36)],
            });
            // Curls breaking off the tips, swirling up and thinning out.
            fx.sys({
                image: 'smoke-puff',
                randomTile: false,
                blend: 'add',
                life: [1, 1.9],
                speed: [0.4, 0.9],
                size: [0.25, 0.45],
                rate: 13,
                color: '#2cc4b4',
                alpha: 0.7,
                shape: new ConeEmitter({radius: 0.15, angle: 0.3}),
                aim: 'up',
                parent: spirit,
                at: [0, 1.6, 0],
                world: true,
                order: 5,
                b: [lifeFrames(16), wobble(1.2, 0.8), grow([0, 0.8], [1, 1.6])],
            });
            // Cold sparks rising off it, twinkling.
            fx.sys({
                tex: 'glint',
                life: [0.9, 1.8],
                speed: [0.5, 1.3],
                size: [0.1, 0.18],
                rate: 11,
                color: ['#c8fff2', '#7ef0dc'],
                shape: new ConeEmitter({radius: 0.3, angle: 0.4, thickness: 1}),
                aim: 'up',
                parent: spirit,
                at: [0, 0.6, 0],
                world: true,
                order: 6,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            ['#2cc4b4', 1],
                        ],
                        [
                            [0, 0],
                            [1, 0.1],
                            [0.3, 0.2],
                            [1, 0.3],
                            [0.4, 0.45],
                            [1, 0.6],
                            [0.2, 0.8],
                            [0, 1],
                        ]
                    ),
                    wobble(1.5, 0.6),
                ],
            });
            // Light: the cold glow it casts, the body's own, and the pale heart breathing low in it.
            heart(fx, {parent: spirit, at: [0, 0.9, 0], size: 4.5, color: '#2cc4b4', alpha: 0.28});
            heart(fx, {parent: spirit, at: [0, 0.9, 0], size: 1.6, color: '#0f5e6e', alpha: 0.4});
            heart(fx, {parent: spirit, at: [0, 0.2, 0], size: 0.9, color: '#c8fff2', alpha: 0.45});
            pool(fx, {size: 2.8, color: '#16908e', alpha: 0.3});
        },
    },
    {
        id: 'fire/torch',
        name: 'Torch',
        loop: true,
        period: 2,
        build(fx) {
            const {scene} = fx;
            fx.prop(shapes.box(scene, 2.6, 3.4, 0.3), {at: [0, 1.7, -1.2], color: '#2a2833'});
            fx.prop(shapes.cylinder(scene, 1.2, 0.07, 0.05), {
                at: [0, 2.1, -0.75],
                rotate: [-0.5, 0, 0],
                color: '#3b2216',
            });
            fx.prop(shapes.cylinder(scene, 0.3, 0.11), {at: [0, 2.65, -0.47], rotate: [-0.5, 0, 0], color: '#2a1a12'});
            // The flame: pixelfx's own torch flame as a 24-frame flipbook, one long-lived upright sprite.
            const FLAME = 1.9;
            fx.sys({
                image: 'torch-flame',
                randomTile: false,
                mode: RenderMode.VerticalBillBoard,
                blend: 'alpha',
                life: 1e4,
                size: FLAME,
                burst: 1,
                loop: false,
                at: [0, 2.72 + FLAME / 2, -0.42],
                order: 4,
                b: [flipbook(12, 24)],
            });
            heart(fx, {at: [0, 3.2, -0.42], size: 1.6, alpha: 0.35});
            embers(fx, {at: [0, 3.3, -0.42], rate: 6, radius: 0.12});
            smoke(fx, {at: [0, 3.9, -0.42], rate: 5, alpha: 0.4, size: [0.25, 0.4], color: '#5b5566'});
            // Flickering light on the wall behind.
            fx.sys({
                tex: 'glow',
                life: [0.3, 0.5],
                size: [3, 3.6],
                rate: 10,
                color: '#ff8a2a',
                alpha: 0.18,
                at: [0, 2.9, -0.98],
                order: 0,
                b: [tint([['#ffffff', 0]], flicker())],
            });
        },
    },
];
