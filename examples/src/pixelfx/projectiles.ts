import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {ConeEmitter, RenderMode, SphereEmitter} from 'babylon.quarks';
import {drag, fadeOut, flicker, gravity, grow, popOut, spin, teleported, tint, wobble} from './kit';
import {PALETTE, debris, flash, shockwave, smoke, sparks, type Ramp} from './recipes';
import {shapes, type FxBuilder, type FxDef} from './stage';

const TRACER: Ramp = [
    ['#ffffff', 0],
    ['#fff3a6', 0.2],
    ['#ffb84a', 0.5],
    ['#c9281f', 1],
];
const BRASS: [string, string] = ['#c89a3a', '#e8c060'];
const HOT_FLASH: Ramp = [
    ['#ffffff', 0],
    ['#fff3a6', 0.4],
    ['#ff8a2a', 1],
];

/** A node flying from `from` to `to` over the first `flight` seconds of every `period`. */
function flyer(
    fx: FxBuilder,
    from: [number, number, number],
    to: [number, number, number],
    flight: number
): TransformNode {
    const node = fx.node('flyer', from);
    let last = 0;
    fx.every((t) => {
        const k = Math.min(1, t / flight);
        node.position.set(
            from[0] + (to[0] - from[0]) * k,
            from[1] + (to[1] - from[1]) * k,
            from[2] + (to[2] - from[2]) * k
        );
        // Back at the start for the next shot: a jump, not a flight.
        if (t < last) teleported(node);
        last = t;
    });
    return node;
}

/** A gun muzzle on the left, pointing right, at `height`; returns the muzzle point. */
function gun(fx: FxBuilder, height: number, length = 0.9, radius = 0.09): [number, number, number] {
    const x = -2.4;
    fx.prop(shapes.cylinder(fx.scene, length, radius), {
        at: [x - length / 2, height, 0],
        rotate: [0, 0, Math.PI / 2],
        color: '#2a2a33',
    });
    fx.prop(shapes.box(fx.scene, 0.3, 0.5, 0.18), {
        at: [x - length + 0.15, height - 0.3, 0],
        rotate: [0, 0, -0.2],
        color: '#2a2a33',
    });
    return [x, height, 0];
}

/** pixelfx's projectiles category, rebuilt as 3D particle effects. */
export const projectiles: FxDef[] = [
    {
        id: 'projectiles/arrow',
        name: 'Arrow',
        loop: true,
        period: 1.2,
        build(fx) {
            const arrow = flyer(fx, [-3.4, 1.4, 0], [3.4, 1.4, 0], 1.2);
            fx.prop(shapes.cylinder(fx.scene, 1.2, 0.025), {
                parent: arrow,
                rotate: [0, 0, Math.PI / 2],
                color: '#8a5a34',
            });
            fx.prop(shapes.cylinder(fx.scene, 0.22, 0, 0.07, 4), {
                parent: arrow,
                at: [0.7, 0, 0],
                rotate: [0, 0, -Math.PI / 2],
                color: '#c8ccd8',
            });
            for (const a of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
                fx.prop(shapes.box(fx.scene, 0.25, 0.1, 0.01), {
                    parent: arrow,
                    at: [-0.5, Math.cos(a) * 0.06, Math.sin(a) * 0.06],
                    rotate: [a, 0, 0],
                    color: '#d8d0c0',
                });
            }
            // Streaks of air peeling off the head and swirling off the feathers.
            fx.sys({
                tex: 'streak',
                life: [0.2, 0.35],
                size: [0.35, 0.5],
                rate: 30,
                world: true,
                color: '#dfe8ff',
                alpha: 0.45,
                shape: new SphereEmitter({radius: 0.1}),
                parent: arrow,
                at: [0.6, 0, 0],
                order: 3,
                b: [tint([['#ffffff', 0]], fadeOut(0.3, 0.2))],
            });
            fx.sys({
                tex: 'smoke',
                life: [0.3, 0.5],
                size: [0.15, 0.25],
                rate: 20,
                world: true,
                color: '#dfe8ff',
                alpha: 0.2,
                blend: 'alpha',
                parent: arrow,
                at: [-0.6, 0, 0],
                order: 2,
                b: [tint([['#ffffff', 0]], fadeOut(0.3, 0.2)), grow([0, 0.5], [1, 1.5]), wobble(3, 0.6)],
            });
        },
    },
    {
        id: 'projectiles/bullet-tracer',
        name: 'Bullet tracer',
        loop: true,
        period: 0.8,
        build(fx) {
            const slug = flyer(fx, [-3.4, 1.3, 0], [3.4, 1.3, 0], 0.8);
            fx.sys({tex: 'glow', life: 0.08, size: 0.35, rate: 40, parent: slug, color: '#ffffff', order: 6});
            // The tracer: a long streak of glow left behind, cooling from white through gold to red.
            fx.sys({
                tex: 'dot',
                life: [0.15, 0.25],
                size: [0.08, 0.12],
                rateOverDistance: 40,
                world: true,
                parent: slug,
                order: 5,
                b: [tint(TRACER, popOut(0.2)), grow([0, 1], [1, 0.4])],
            });
            sparks(fx, {
                parent: slug,
                rate: 25,
                speed: [0.5, 1.5],
                gravity: 6,
                palette: TRACER,
                world: true,
                life: [0.2, 0.4],
            });
            smoke(fx, {
                parent: slug,
                world: true,
                rate: 30,
                life: [0.4, 0.7],
                speed: [0, 0.1],
                size: [0.08, 0.14],
                alpha: 0.3,
                color: '#8a8090',
                grows: 3,
            });
        },
    },
    {
        id: 'projectiles/cannonball',
        name: 'Cannonball',
        loop: false,
        period: 3.8,
        build(fx) {
            const muzzle = gun(fx, 0.9, 1.4, 0.3);
            const ball = fx.node('ball', muzzle);
            const mesh = fx.prop(shapes.sphere(fx.scene, 0.18, 10), {parent: ball, color: '#1c1c22'});
            fx.every((t) => {
                // Arcing off under gravity.
                const k = Math.min(t, 1.1);
                ball.position.set(muzzle[0] + 5.5 * k, muzzle[1] + 3.2 * k - 0.5 * 7 * k * k, 0);
                mesh.setEnabled(t < 1.1);
            });
            flash(fx, {at: muzzle, size: 2.6, color: '#fff3c0'});
            fx.sys({
                tex: 'smoke',
                life: [0.15, 0.25],
                speed: [3, 5],
                size: [0.5, 0.8],
                rot: true,
                burst: [[0, 12]],
                shape: new ConeEmitter({radius: 0.1, angle: 0.25}),
                aim: 'right',
                at: muzzle,
                order: 4,
                b: [tint(PALETTE.fire, popOut(0.3)), grow([0, 0.6], [1, 1.4])],
            });
            smoke(fx, {
                parent: ball,
                world: true,
                rate: 30,
                duration: 1.1,
                loop: false,
                life: [0.6, 1],
                speed: [0, 0.2],
                size: [0.2, 0.3],
                alpha: 0.45,
                color: '#9a94a0',
            });
            smoke(fx, {
                at: muzzle,
                aim: 'right',
                burst: [[0.02, 16]],
                speed: [1.5, 3.5],
                spread: 0.6,
                size: [0.8, 1.2],
                life: [2, 2.8],
                color: ['#a8a4b0', '#d0ccd8'],
                alpha: 0.6,
                loop: false,
            });
        },
    },
    {
        id: 'projectiles/energy-disc',
        name: 'Energy disc',
        loop: true,
        period: 1.2,
        build(fx) {
            const disc = flyer(fx, [-3.4, 1.2, 0], [3.4, 1.2, 0], 1.2);
            fx.sys({
                tex: 'swirl',
                mode: RenderMode.HorizontalBillBoard,
                life: 0.25,
                size: 1.4,
                rate: 16,
                parent: disc,
                color: '#5ae8ff',
                order: 4,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.2)), spin(-20)],
            });
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 0.1,
                size: 1.3,
                rate: 30,
                parent: disc,
                color: '#bff6ff',
                order: 5,
            });
            fx.sys({tex: 'glow', life: 0.1, size: 0.5, rate: 30, parent: disc, color: '#ffffff', order: 6});
            // Sparks flung off the teeth.
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.05, length: 1},
                life: [0.2, 0.35],
                speed: [3, 5],
                size: [0.04, 0.07],
                rate: 40,
                world: true,
                shape: new SphereEmitter({radius: 0.65, thickness: 0}),
                parent: disc,
                order: 5,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            ['#5ae8ff', 0.4],
                            ['#2a5aff', 1],
                        ],
                        popOut(0.4)
                    ),
                    gravity(4),
                ],
            });
        },
    },
    {
        id: 'projectiles/flare',
        name: 'Signal flare',
        loop: false,
        period: 6.4,
        build(fx) {
            const rise = 0.9;
            const flare = fx.node('flare', [0, 0, 0]);
            fx.every((t) => {
                const k = Math.min(1, t / rise);
                // Up fast, then hanging and drifting down slowly.
                flare.position.set(0.3 * k, 4.2 * (1 - (1 - k) * (1 - k)) - Math.max(0, t - rise) * 0.25, 0);
            });
            fx.sys({
                tex: 'dot',
                life: [0.3, 0.6],
                speed: [0.3, 0.8],
                size: [0.05, 0.08],
                rate: 60,
                duration: rise,
                loop: false,
                world: true,
                parent: flare,
                order: 5,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            ['#ffb0a0', 0.3],
                            ['#ff3a2a', 1],
                        ],
                        fadeOut(0.5, 0.02)
                    ),
                    gravity(3),
                ],
            });
            smoke(fx, {
                parent: flare,
                world: true,
                rate: 25,
                duration: rise,
                loop: false,
                life: [1.2, 1.8],
                speed: [0, 0.2],
                size: [0.2, 0.35],
                alpha: 0.4,
                color: '#a8a0a8',
            });
            // The burst, then a pulsing red star dripping sparks under its own red-lit smoke.
            flash(fx, {parent: flare, size: 2.4, delay: rise, color: '#ffb0a0'});
            fx.sys({
                tex: 'glow',
                life: 0.3,
                size: [1.2, 1.8],
                rate: 12,
                delay: rise,
                duration: 3.2,
                loop: false,
                parent: flare,
                color: '#ff3a2a',
                order: 4,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            fx.sys({
                tex: 'glint',
                life: 0.25,
                size: [0.5, 0.7],
                rate: 10,
                delay: rise,
                duration: 3.2,
                loop: false,
                parent: flare,
                color: '#ffd0c0',
                order: 6,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            fx.sys({
                tex: 'dot',
                life: [0.6, 1],
                speed: [0.2, 0.6],
                size: [0.04, 0.07],
                rate: 20,
                delay: rise,
                duration: 3,
                loop: false,
                world: true,
                parent: flare,
                order: 5,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            ['#ff6a4a', 0.3],
                            ['#8a1a10', 1],
                        ],
                        fadeOut(0.6, 0.02)
                    ),
                    gravity(5),
                ],
            });
            smoke(fx, {
                parent: flare,
                at: [0, 0.4, 0],
                world: true,
                rate: 6,
                delay: rise,
                duration: 3,
                loop: false,
                life: [1.6, 2.2],
                speed: [0.1, 0.3],
                size: [0.6, 0.9],
                alpha: 0.35,
                color: '#8a3a3a',
            });
        },
    },
    {
        id: 'projectiles/homing-missile',
        name: 'Homing missile',
        loop: false,
        period: 3.8,
        build(fx) {
            const flight = 1.6;
            const missile = fx.node('missile', [-3, 0.4, 0]);
            const body = fx.prop(shapes.cylinder(fx.scene, 0.5, 0.06, 0.08), {parent: missile, color: '#d8dce4'});
            const target: [number, number, number] = [2.2, 0, 0];
            fx.every((t) => {
                // A cubic Bézier: kick off, arc up, roll over and dive onto the target.
                const k = Math.min(1, t / flight);
                const p0 = [-3, 0.4];
                const p1 = [-2.6, 4.5];
                const p2 = [3.2, 5];
                const p3 = [target[0], target[1] + 0.1];
                const u = 1 - k;
                const x = u * u * u * p0[0] + 3 * u * u * k * p1[0] + 3 * u * k * k * p2[0] + k * k * k * p3[0];
                const y = u * u * u * p0[1] + 3 * u * u * k * p1[1] + 3 * u * k * k * p2[1] + k * k * k * p3[1];
                const dx = 3 * u * u * (p1[0] - p0[0]) + 6 * u * k * (p2[0] - p1[0]) + 3 * k * k * (p3[0] - p2[0]);
                const dy = 3 * u * u * (p1[1] - p0[1]) + 6 * u * k * (p2[1] - p1[1]) + 3 * k * k * (p3[1] - p2[1]);
                missile.position.set(x, y, 0);
                body.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
                body.setEnabled(t < flight);
            });
            fx.sys({
                tex: 'glow',
                life: 0.08,
                size: [0.4, 0.55],
                rate: 40,
                duration: flight,
                loop: false,
                parent: missile,
                color: '#ffd27a',
                order: 5,
            });
            smoke(fx, {
                parent: missile,
                world: true,
                rate: 50,
                duration: flight,
                loop: false,
                life: [1.4, 2],
                speed: [0, 0.15],
                size: [0.25, 0.35],
                alpha: 0.45,
                color: '#b0acb8',
            });
            fx.sys({
                tex: 'smoke',
                life: 0.6,
                size: 2,
                rot: true,
                burst: [[flight, 14]],
                speed: [1.5, 3],
                shape: new SphereEmitter({radius: 0.3}),
                at: target,
                order: 4,
                b: [tint(PALETTE.fire, popOut(0.4)), grow([0, 0.5], [1, 1.3]), drag([0, 1], [1, 0.1])],
            });
            flash(fx, {at: [target[0], 0.5, 0], size: 3.5, delay: flight});
            shockwave(fx, {at: [target[0], 0.05, 0], size: 5, delay: flight});
            sparks(fx, {
                at: [target[0], 0.3, 0],
                count: 30,
                delay: flight,
                aim: 'up',
                shape: new ConeEmitter({radius: 0.2, angle: 1}),
            });
            debris(fx, {at: target, count: 10, delay: flight});
        },
    },
    {
        id: 'projectiles/laser-bolt',
        name: 'Laser bolt',
        loop: true,
        period: 0.8,
        build(fx) {
            // The bolt is one trail particle shot across the cell: its trail is the tapering body.
            fx.sys({
                tex: 'glow',
                mode: RenderMode.Trail,
                trail: 10,
                life: 0.7,
                speed: 11,
                size: 0.3,
                burst: 1,
                color: '#ff3a3a',
                aim: 'right',
                at: [-3.6, 1.3, 0],
                world: true,
                order: 4,
                b: [
                    tint([
                        ['#ffffff', 0],
                        ['#ff6a6a', 1],
                    ]),
                ],
            });
            const head = flyer(fx, [-3.6, 1.3, 0], [4.1, 1.3, 0], 0.7);
            fx.sys({
                tex: 'glow',
                life: 0.06,
                size: [0.6, 0.8],
                rate: 40,
                parent: head,
                color: '#ffffff',
                order: 6,
            });
            // A tail shimmering apart into wavering dashes.
            fx.sys({
                tex: 'streak',
                life: [0.15, 0.3],
                size: [0.2, 0.35],
                rateOverDistance: 6,
                world: true,
                parent: head,
                at: [-1.2, 0, 0],
                color: '#ff4a4a',
                order: 3,
                b: [tint([['#ffffff', 0]], fadeOut(0.3, 0.1)), wobble(6, 0.4)],
            });
        },
    },
    {
        id: 'projectiles/magic-missile',
        name: 'Magic missile',
        loop: false,
        period: 2.4,
        build(fx) {
            const gather = 0.6;
            const flight = 0.9;
            fx.character([-3, 0, 0], 1.8);
            const orb = fx.node('orb', [-2.5, 1.4, 0]);
            fx.every((t) => {
                const k = Math.min(1, Math.max(0, (t - gather) / flight));
                // Weaving to its target.
                orb.position.set(
                    -2.5 + 5 * k,
                    1.4 + Math.sin(k * Math.PI * 3) * 0.5 * (1 - k),
                    Math.cos(k * Math.PI * 2) * 0.6 * Math.sin(k * Math.PI)
                );
            });
            fx.sys({
                tex: 'dot',
                life: 0.4,
                speed: -2.5,
                size: [0.05, 0.08],
                rate: 50,
                duration: gather,
                loop: false,
                color: '#c8a0ff',
                shape: new SphereEmitter({radius: 1, thickness: 0}),
                parent: orb,
                order: 4,
            });
            fx.sys({
                tex: 'glow',
                life: 0.1,
                size: [0.7, 0.9],
                rate: 30,
                duration: gather + flight,
                loop: false,
                parent: orb,
                color: '#b07aff',
                order: 5,
                b: [tint(PALETTE.plasma, flicker())],
            });
            // A wake of fading motes, dropped along the orb's path and left behind in the world.
            fx.sys({
                tex: 'dot',
                life: [0.3, 0.5],
                size: [0.1, 0.16],
                rateOverDistance: 20,
                delay: gather,
                duration: flight,
                loop: false,
                world: true,
                shape: new SphereEmitter({radius: 0.15, thickness: 0}),
                parent: orb,
                order: 4,
                b: [tint(PALETTE.plasma, popOut(0.3)), grow([0, 1], [1, 0.2])],
            });
            const hit: [number, number, number] = [2.5, 1.4, 0];
            fx.character([3, 0, 0], 1.6, '#35303a');
            fx.sys({
                tex: 'glint',
                life: 0.35,
                size: 2.2,
                burst: [[gather + flight, 1]],
                at: hit,
                order: 6,
                b: [tint(PALETTE.plasma, popOut(0.3)), spin(3)],
            });
            fx.sys({
                tex: 'ring',
                life: 0.3,
                size: 2,
                burst: [[gather + flight, 1]],
                at: hit,
                color: '#d8b8ff',
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.2], [1, 1])],
            });
            sparks(fx, {
                at: hit,
                count: 20,
                delay: gather + flight,
                gravity: 2,
                palette: PALETTE.plasma,
                speed: [3, 6],
            });
        },
    },
    {
        id: 'projectiles/muzzle-pistol',
        name: 'Pistol shot',
        loop: false,
        period: 1.8,
        build(fx) {
            const muzzle = gun(fx, 1.3);
            fx.sys({
                tex: 'burst',
                life: 0.06,
                size: 0.9,
                rot: true,
                burst: 1,
                at: [muzzle[0] + 0.3, muzzle[1], 0],
                order: 5,
                b: [tint(HOT_FLASH, popOut(0.3))],
            });
            fx.sys({tex: 'glow', life: 0.08, size: 1.4, burst: 1, color: '#ffd27a', at: muzzle, order: 4});
            sparks(fx, {
                at: muzzle,
                count: 10,
                aim: 'right',
                shape: new ConeEmitter({radius: 0.02, angle: 0.3}),
                speed: [5, 9],
                gravity: 4,
                life: [0.15, 0.3],
            });
            // A curl of smoke hooking up and back.
            smoke(fx, {
                at: muzzle,
                aim: 'right',
                burst: [[0.02, 5]],
                speed: [0.6, 1.2],
                spread: 0.3,
                size: [0.2, 0.3],
                life: [1, 1.4],
                alpha: 0.4,
                color: '#c0bcc8',
                loop: false,
            });
            debris(fx, {
                mesh: 'cube',
                count: 1,
                at: [muzzle[0] - 0.4, muzzle[1] + 0.1, 0],
                size: 0.08,
                color: BRASS,
                speed: [2.5, 3],
                aim: 'up',
                shape: new ConeEmitter({radius: 0, angle: 0.4}),
            });
        },
    },
    {
        id: 'projectiles/muzzle-shotgun',
        name: 'Shotgun blast',
        loop: false,
        period: 3.2,
        build(fx) {
            const muzzle = gun(fx, 1.2, 1.4, 0.12);
            fx.sys({
                tex: 'smoke',
                life: [0.1, 0.18],
                speed: [3, 6],
                size: [0.6, 1],
                rot: true,
                burst: [[0, 14]],
                shape: new ConeEmitter({radius: 0.1, angle: 0.5}),
                aim: 'right',
                at: muzzle,
                order: 4,
                b: [tint(PALETTE.fire, popOut(0.3)), grow([0, 0.6], [1, 1.4])],
            });
            flash(fx, {at: muzzle, size: 2.2, color: '#fff3c0'});
            // Pellet streaks.
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.04, length: 1},
                life: 0.3,
                speed: [16, 20],
                size: [0.04, 0.06],
                burst: [[0, 14]],
                shape: new ConeEmitter({radius: 0.05, angle: 0.12}),
                aim: 'right',
                at: muzzle,
                order: 5,
                b: [tint(TRACER, popOut(0.5))],
            });
            smoke(fx, {
                at: [muzzle[0] + 0.4, muzzle[1], 0],
                aim: 'right',
                burst: [[0.02, 18]],
                speed: [1.5, 3],
                spread: 0.5,
                size: [0.6, 1],
                life: [1.8, 2.6],
                alpha: 0.55,
                color: ['#a8a4b0', '#d0ccd8'],
                loop: false,
            });
            debris(fx, {
                mesh: 'cube',
                count: 1,
                delay: 0.5,
                at: [muzzle[0] - 0.6, muzzle[1] - 0.1, 0],
                size: 0.14,
                color: ['#a82a2a', '#c83a3a'],
                speed: [2, 2.5],
                shape: new ConeEmitter({radius: 0, angle: 0.4}),
            });
        },
    },
    {
        id: 'projectiles/muzzle-smg',
        name: 'SMG fire',
        loop: true,
        period: 1,
        build(fx) {
            const muzzle = gun(fx, 1.3, 0.7, 0.07);
            // Twelve rounds a second: bursts cycling through the loop.
            const round: [number, number, number, number] = [0, 1, 12, 1 / 12];
            fx.sys({
                tex: 'burst',
                life: 0.04,
                size: [0.6, 0.9],
                rot: true,
                burst: [round],
                at: [muzzle[0] + 0.25, muzzle[1], 0],
                order: 5,
                b: [tint(HOT_FLASH, popOut(0.4))],
            });
            fx.sys({tex: 'glow', life: 0.05, size: 1.1, burst: [round], color: '#ffd27a', at: muzzle, order: 4});
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.04, length: 1},
                life: 0.3,
                speed: 18,
                size: 0.05,
                burst: [round],
                aim: 'right',
                shape: new ConeEmitter({radius: 0, angle: 0.03}),
                at: muzzle,
                order: 5,
                b: [tint(TRACER, popOut(0.5))],
            });
            sparks(fx, {
                at: muzzle,
                rate: 40,
                aim: 'right',
                shape: new ConeEmitter({radius: 0.02, angle: 0.4}),
                speed: [4, 7],
                gravity: 4,
                life: [0.1, 0.2],
            });
            smoke(fx, {
                at: [muzzle[0] + 0.3, muzzle[1] + 0.1, 0],
                rate: 10,
                speed: [0.3, 0.6],
                size: [0.25, 0.4],
                life: [1.2, 1.6],
                alpha: 0.3,
                color: '#c0bcc8',
            });
            fx.sys({
                mesh: 'cube',
                tumble: 10,
                life: 0.7,
                speed: [2.5, 3],
                size: 0.07,
                burst: [round],
                color: BRASS[0],
                shape: new ConeEmitter({radius: 0, angle: 0.3}),
                aim: 'up',
                rotate: [0.6, 0, 0],
                at: [muzzle[0] - 0.3, muzzle[1] + 0.1, 0],
                order: 2,
                b: [gravity(12)],
            });
        },
    },
    {
        id: 'projectiles/plasma-shot',
        name: 'Plasma shot',
        loop: true,
        period: 1,
        build(fx) {
            const shot = flyer(fx, [-3.4, 1.3, 0], [3.4, 1.3, 0], 1);
            const GREEN: Ramp = [
                ['#ffffff', 0],
                ['#c8ffd0', 0.3],
                ['#3aff8a', 0.7],
                ['#0a6a3a', 1],
            ];
            fx.sys({
                tex: 'glow',
                life: 0.12,
                size: [0.9, 1.1],
                rate: 30,
                parent: shot,
                color: '#6affa0',
                order: 5,
                b: [tint(GREEN, flicker())],
            });
            fx.sys({tex: 'glow', life: 0.1, size: 0.4, rate: 30, parent: shot, order: 6});
            fx.sys({
                tex: 'dot',
                life: [0.1, 0.2],
                size: [0.05, 0.09],
                rate: 50,
                shape: new SphereEmitter({radius: 0.4, thickness: 0}),
                parent: shot,
                color: '#c8ffd0',
                order: 6,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            // The tail necking into droplets that tear off, cool and wink out.
            fx.sys({
                tex: 'glow',
                life: [0.3, 0.5],
                size: [0.2, 0.35],
                rateOverDistance: 8,
                world: true,
                parent: shot,
                order: 4,
                b: [tint(GREEN, popOut(0.3)), grow([0, 1], [1, 0.2])],
            });
        },
    },
    {
        id: 'projectiles/rocket',
        name: 'Rocket',
        loop: true,
        period: 1.6,
        build(fx) {
            const rocket = flyer(fx, [-3.6, 1.4, 0], [4, 1.4, 0], 1.6);
            fx.prop(shapes.cylinder(fx.scene, 0.8, 0.1), {
                parent: rocket,
                rotate: [0, 0, Math.PI / 2],
                color: '#c8ccd8',
            });
            fx.prop(shapes.cylinder(fx.scene, 0.25, 0, 0.1), {
                parent: rocket,
                at: [0.52, 0, 0],
                rotate: [0, 0, -Math.PI / 2],
                color: '#a83a2a',
            });
            // The jet: white-hot at the nozzle, flickering back into flame.
            fx.sys({
                tex: 'glow',
                life: 0.06,
                size: [0.35, 0.45],
                rate: 40,
                parent: rocket,
                at: [-0.45, 0, 0],
                color: '#ffffff',
                order: 6,
            });
            fx.sys({
                tex: 'smoke',
                life: [0.1, 0.18],
                speed: [3, 4],
                size: [0.25, 0.4],
                rot: true,
                rate: 80,
                shape: new ConeEmitter({radius: 0.04, angle: 0.08}),
                aim: 'left',
                parent: rocket,
                at: [-0.45, 0, 0],
                order: 5,
                b: [tint(PALETTE.fire, popOut(0.4)), grow([0, 0.6], [1, 1.4])],
            });
            smoke(fx, {
                parent: rocket,
                at: [-0.8, 0, 0],
                world: true,
                rate: 40,
                life: [1, 1.4],
                speed: [0.1, 0.3],
                size: [0.3, 0.45],
                alpha: 0.5,
                color: '#a8a4b0',
            });
            sparks(fx, {
                parent: rocket,
                at: [-0.6, 0, 0],
                rate: 20,
                world: true,
                speed: [0.5, 1.5],
                gravity: 5,
                life: [0.3, 0.5],
            });
        },
    },
];
