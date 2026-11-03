import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {BoxEmitter, CircleEmitter, ConeEmitter, HemisphereEmitter, RenderMode, SphereEmitter} from 'babylon.quarks';
import {
    airDrag,
    crossQuad,
    fadeOut,
    flicker,
    floorBounce,
    gravity,
    grow,
    orbit,
    popOut,
    spin,
    teleported,
    tint,
    turn,
    wobble,
} from './kit';
import {GOLD, HOT, SPARK, clods, dust, gate, hotSparks, light, star, wedges, type At} from './parts';
import {PALETTE, arcs, decal, shockwave, sticker, type Ramp} from './recipes';
import {shapes, type FxBuilder, type FxDef} from './stage';

const BRASS: [string, string] = ['#c89a3a', '#e8c060'];
const RED: Ramp = [
    ['#ffffff', 0],
    ['#ffb0a0', 0.25],
    ['#ff3a2a', 0.6],
    ['#7a1018', 1],
];
const PLASMA: Ramp = [
    ['#ffffff', 0],
    ['#b8ffd0', 0.25],
    ['#3aff8a', 0.55],
    ['#0a6a3a', 1],
];
const ARCANE: Ramp = [
    ['#ffffff', 0],
    ['#e8c8ff', 0.25],
    ['#b06aff', 0.6],
    ['#4a1a8a', 1],
];
const SMOKE: [string, string] = ['#8e8a96', '#aca8b4'];

/** A node flying from `from` to `to` over the first `flight` seconds of every loop. */
function flyer(fx: FxBuilder, from: At, to: At, flight: number): TransformNode {
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

/** A gun on the left pointing right, its muzzle at `[x, height]`; returns the muzzle point. */
function gun(fx: FxBuilder, x: number, height: number, length: number, radius: number): At {
    fx.prop(shapes.cylinder(fx.scene, length, radius), {
        at: [x - length / 2, height, 0],
        rotate: [0, 0, Math.PI / 2],
        color: '#2a2a33',
    });
    fx.prop(shapes.box(fx.scene, Math.max(0.16, length * 0.3), 0.32, 0.12), {
        at: [x - length + 0.1, height - 0.2, 0],
        rotate: [0, 0, -0.25],
        color: '#24242c',
    });
    return [x, height, 0];
}

const STREAK = crossQuad('x');
const JET = crossQuad('y');

/** A sprite that always sits on `parent`: a burning core, a halo, a band of a bolt. */
function held(
    fx: FxBuilder,
    o: {
        parent: TransformNode;
        tex: 'glow' | 'streak' | 'glint' | 'burst' | 'swirl' | 'flame' | 'dot';
        size: number | [number, number];
        color: string;
        at?: At;
        alpha?: number;
        rot?: number | true;
        rate?: number;
        life?: number;
        ramp?: Ramp;
        flickers?: boolean;
        order?: number;
        blend?: 'add' | 'alpha';
    }
) {
    // A streak trailing a shot, or a flame jet turned to point back, has a direction: crossed quads
    // along it keep it there from every side, where a billboard would swing round with the camera.
    const along = o.tex === 'streak' ? STREAK : o.tex === 'flame' && typeof o.rot === 'number' ? JET : undefined;
    return fx.sys({
        tex: o.tex,
        blend: o.blend,
        life: o.life ?? 0.06,
        size: o.size,
        rate: o.rate ?? 50,
        ...(along
            ? {
                  geo: along,
                  rotate: [0, 0, typeof o.rot === 'number' ? o.rot : 0] as [number, number, number],
                  opaque: false,
                  depthWrite: false,
                  look: {renderFace: 'both' as const},
              }
            : {rot: o.rot}),
        color: o.color,
        alpha: o.alpha,
        parent: o.parent,
        at: o.at,
        order: o.order ?? 6,
        b: o.ramp || o.flickers ? [tint(o.ramp ?? [['#ffffff', 0]], o.flickers ? flicker() : popOut(0.5))] : [],
    });
}

/** pixelfx's projectiles category, rebuilt as 3D particle effects (1 px ≈ 0.04 m). */
export const projectiles: FxDef[] = [
    {
        id: 'projectiles/arrow',
        name: 'Arrow',
        loop: true,
        period: 1,
        build(fx) {
            // arrow.js in 3D: a steel broadhead catching the light, a wooden shaft, red and white fletching
            // fluttering in the wind; streaks of air peel off its head and wisps swirl off its feathers.
            const arrow = flyer(fx, [-3.8, 1.4, 0], [3.8, 1.4, 0], 1);
            fx.prop(shapes.cylinder(fx.scene, 1.3, 0.024), {
                parent: arrow,
                rotate: [0, 0, Math.PI / 2],
                color: '#9a6638',
            });
            fx.prop(shapes.cylinder(fx.scene, 0.24, 0, 0.08, 4), {
                parent: arrow,
                at: [0.76, 0, 0],
                rotate: [0, 0, -Math.PI / 2],
                color: '#dfe4ec',
            });
            const vanes = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((a, i) =>
                fx.prop(shapes.box(fx.scene, 0.3, 0.11, 0.012), {
                    parent: arrow,
                    at: [-0.5, Math.cos(a) * 0.065, Math.sin(a) * 0.065],
                    rotate: [a, 0, 0],
                    color: i === 0 ? '#c9281f' : '#f0e8dc',
                })
            );
            fx.every((t) => {
                for (const [i, vane] of vanes.entries()) vane.rotation.z = 0.12 * Math.sin(t * 60 + i * 2);
            });
            // The head catching the light.
            held(fx, {
                parent: arrow,
                tex: 'glint',
                size: [0.25, 0.4],
                color: '#ffffff',
                at: [0.82, 0.02, 0.05],
                flickers: true,
                rate: 20,
                life: 0.12,
            });
            // Streaks of air peeling off it, left hanging in the world.
            fx.sys({
                tex: 'streak',
                life: [0.15, 0.3],
                size: [0.5, 0.9],
                rate: 34,
                world: true,
                color: '#dfe8ff',
                alpha: 0.7,
                shape: new BoxEmitter({width: 0.4, height: 0.45, depth: 0.2}),
                parent: arrow,
                at: [0.2, 0, 0],
                order: 3,
                b: [tint([['#ffffff', 0]], fadeOut(0.3, 0.1)), grow([0, 0.6], [1, 1.2])],
            });
            fx.sys({
                tex: 'swirl',
                life: [0.3, 0.5],
                size: [0.18, 0.3],
                rate: 14,
                rot: true,
                world: true,
                color: '#dfe8ff',
                alpha: 0.35,
                parent: arrow,
                at: [-0.65, 0, 0],
                order: 2,
                b: [tint([['#ffffff', 0]], fadeOut(0.3, 0.2)), grow([0, 0.5], [1, 1.6]), spin([4, 8])],
            });
        },
    },
    {
        id: 'projectiles/bullet-tracer',
        name: 'Bullet tracer',
        loop: true,
        period: 0.6,
        build(fx) {
            // bullet-tracer.js in 3D: a white-hot slug tearing along, its tracer burning behind it in a long
            // streak that sputters and cools from white through gold to red, shedding sparks and a thread
            // of smoke.
            const slug = flyer(fx, [-3.8, 1.3, 0], [3.8, 1.3, 0], 0.6);
            held(fx, {parent: slug, tex: 'glow', size: 0.42, color: '#ffffff'});
            held(fx, {parent: slug, tex: 'glow', size: 1.2, color: '#ffb84a', alpha: 0.45});
            // The tracer burning behind it: white at the slug, gold, then a long red tail that sputters.
            held(fx, {
                parent: slug,
                tex: 'streak',
                size: 4,
                color: '#c9281f',
                at: [-2, 0, 0],
                alpha: 0.75,
                flickers: true,
                life: 0.05,
                order: 3,
            });
            held(fx, {parent: slug, tex: 'streak', size: 2.4, color: '#ffb84a', at: [-1.1, 0, 0], order: 4});
            held(fx, {parent: slug, tex: 'streak', size: 1.1, color: '#ffffff', at: [-0.45, 0, 0], order: 5});
            fx.sys({
                tex: 'smoke',
                blend: 'alpha',
                life: [0.5, 0.8],
                size: [0.1, 0.18],
                rate: 70,
                rot: true,
                world: true,
                color: '#8a8494',
                alpha: 0.22,
                parent: slug,
                order: 2,
                b: [tint([['#ffffff', 0]], fadeOut(0.2, 0.2)), grow([0, 0.6], [1, 1.8]), wobble(2, 0.3)],
            });
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.4, length: 1},
                life: [0.2, 0.4],
                speed: [0.8, 2],
                size: [0.03, 0.05],
                rate: 40,
                world: true,
                shape: new SphereEmitter({radius: 0.05}),
                parent: slug,
                order: 5,
                b: [tint(SPARK, popOut(0.5)), gravity(6)],
            });
        },
    },
    {
        id: 'projectiles/cannonball',
        name: 'Cannonball',
        loop: false,
        period: 3.8,
        build(fx) {
            // cannonball.js in 3D: a cannon fires from 0.8 m up: a white flash and a tongue of flame, the
            // ball arcing off trailing smoke, sparks, and a big cloud of gunsmoke rolling out, thinning by
            // 3.4 s.
            const lift = 0.3;
            const base: At = [-2.6, 0.7, 0];
            const barrel = fx.prop(shapes.cylinder(fx.scene, 1.4, 0.2, 0.28), {
                at: base,
                rotate: [0, 0, -Math.PI / 2 + lift],
                color: '#2a2a33',
            });
            barrel.position.x += 0.1;
            for (const z of [-0.32, 0.32]) {
                fx.prop(shapes.torus(fx.scene, 0.3, 0.08), {
                    at: [base[0] - 0.2, 0.32, z],
                    rotate: [Math.PI / 2, 0, 0],
                    color: '#4a3424',
                });
            }
            const muzzle: At = [base[0] + 0.1 + 0.7 * Math.cos(lift), base[1] + 0.7 * Math.sin(lift), 0];
            const ball = fx.node('ball', muzzle);
            const shot = fx.prop(shapes.sphere(fx.scene, 0.16, 10), {parent: ball, color: '#1c1c22'});
            fx.every((t) => {
                const k = Math.min(t, 1.6);
                ball.position.set(muzzle[0] + 5.2 * k, muzzle[1] + 2 * k - 0.5 * 6 * k * k, 0);
                shot.setEnabled(t < 1.6);
            });
            const aim: {aim: 'right'; rotate: [number, number, number]} = {aim: 'right', rotate: [0, 0, lift]};
            star(fx, {at: muzzle, tex: 'burst', size: 1.4, life: 0.1, rot: 0.3});
            star(fx, {at: muzzle, tex: 'glow', size: 1.8, life: 0.12, ramp: [['#ffffff', 0]]});
            light(fx, {at: muzzle, size: 4, color: '#ffb84a', life: 0.3});
            fx.sys({
                tex: 'flame',
                life: [0.1, 0.18],
                speed: [3, 6],
                size: [0.5, 0.8],
                rot: -Math.PI / 2 + lift,
                burst: [[0, 10]],
                loop: false,
                shape: new ConeEmitter({radius: 0.12, angle: 0.25}),
                ...aim,
                at: muzzle,
                order: 6,
                b: [tint(PALETTE.fire, popOut(0.5)), grow([0, 0.6], [1, 1.2])],
            });
            hotSparks(fx, {
                at: muzzle,
                count: 16,
                speed: [3, 7],
                shape: new ConeEmitter({radius: 0.1, angle: 0.5}),
                ...aim,
            });
            dust(fx, {
                at: muzzle,
                shape: new ConeEmitter({radius: 0.15, angle: 0.5}),
                ...aim,
                burst: [[0.02, 38]],
                speed: [1.2, 4.6],
                size: [0.6, 1],
                life: [2.2, 3.2],
                color: SMOKE,
                alpha: 0.75,
                drag: 2,
                lift: 0.25,
                grows: 2.2,
                warm: true,
            });
            dust(fx, {
                parent: ball,
                world: true,
                rate: 40,
                duration: 1.6,
                size: [0.15, 0.25],
                life: [0.7, 1.1],
                speed: [0, 0.2],
                color: SMOKE,
                alpha: 0.5,
                drag: 1,
                lift: 0.2,
                grows: 2,
            });
        },
    },
    {
        id: 'projectiles/energy-disc',
        name: 'Energy disc',
        loop: true,
        period: 1,
        build(fx) {
            // energy-disc.js in 3D: a sawblade of crackling energy spinning as it flies: hooked teeth bright
            // on their leading edges, spiral arms churning, a white hub, sparks flung off the teeth and
            // streaks of light left behind.
            const disc = flyer(fx, [-3.8, 1.3, 0], [3.8, 1.3, 0], 1);
            const blade = {parent: disc, life: 1, burst: [[0, 1]] as Array<[number, number]>, order: 6} as const;
            // The blade is a disc in its own plane (the one the sparks fly off), not a sprite turned to
            // the eye, so it goes edge-on from the side.
            sticker(fx, {...blade, tex: 'burst', size: 1.05, color: '#62c8f4', b: [turn(-16, [0, 0, 1])]});
            sticker(fx, {...blade, tex: 'swirl', size: 0.85, color: '#a6ecff', order: 7, b: [turn(-11, [0, 0, 1])]});
            held(fx, {parent: disc, tex: 'glow', size: 0.45, color: '#ffffff', order: 8});
            held(fx, {parent: disc, tex: 'glow', size: 1.8, color: '#3a8bd8', alpha: 0.5, order: 2});
            // Sparks flung off the teeth.
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.4, length: 1},
                life: [0.15, 0.3],
                speed: [2, 4],
                size: [0.04, 0.06],
                rate: 45,
                world: true,
                shape: new CircleEmitter({radius: 0.48, thickness: 0}),
                parent: disc,
                order: 5,
                b: [tint(PALETTE.electric, popOut(0.5))],
            });
            // Streaks of light left in its wake.
            fx.sys({
                tex: 'streak',
                life: [0.18, 0.3],
                size: [0.5, 0.9],
                rate: 30,
                world: true,
                color: '#62c8f4',
                alpha: 0.7,
                shape: new BoxEmitter({width: 0.3, height: 0.7, depth: 0.2}),
                parent: disc,
                at: [-0.4, 0, 0],
                order: 3,
                b: [tint([['#ffffff', 0]], fadeOut(0.2, 0.05))],
            });
            fx.sys({
                tex: 'glow',
                life: 0.14,
                size: 0.8,
                rate: 60,
                world: true,
                color: '#3a8bd8',
                alpha: 0.3,
                parent: disc,
                order: 1,
            });
        },
    },
    {
        id: 'projectiles/flare',
        name: 'Signal flare',
        loop: false,
        period: 5.2,
        view: {height: 2.4, distance: 13},
        build(fx) {
            // flare.js in 3D: a signal flare streaks up off the ground (to 1 s) trailing sparks and smoke,
            // bursts, and hangs as a pulsing red star drifting down, dripping sparks under its own red-lit
            // smoke, then gutters out (4.4 s).
            const P = 5.2;
            const rise = 1;
            const out = 4.4;
            const flare = fx.node('flare', [0, 0.1, 0]);
            fx.every((t) => {
                const k = Math.min(1, t / rise);
                flare.position.set(0.3 * k, 0.1 + 4 * (1 - (1 - k) * (1 - k)) - Math.max(0, t - rise) * 0.22, 0);
            });
            light(fx, {size: 2, color: '#ff3a2a', alpha: 0.6, life: 0.4, floor: true});
            // Rising: sparks and smoke behind it.
            gate(
                fx.sys({
                    tex: 'dot',
                    life: [0.3, 0.6],
                    speed: [0.3, 0.8],
                    size: [0.05, 0.08],
                    rate: 80,
                    loop: false,
                    world: true,
                    shape: new SphereEmitter({radius: 0.04}),
                    parent: flare,
                    order: 5,
                    b: [tint(RED, popOut(0.4)), gravity(3)],
                }),
                P,
                0,
                rise,
                80
            );
            gate(
                dust(fx, {
                    parent: flare,
                    world: true,
                    rate: 40,
                    size: [0.18, 0.28],
                    life: [1.4, 2],
                    speed: [0, 0.2],
                    color: SMOKE,
                    alpha: 0.5,
                    drag: 1,
                    lift: 0.1,
                    grows: 2.2,
                }),
                P,
                0,
                rise,
                40
            );
            // The burst.
            const burstAt: At = [0.3, 4.1, 0];
            star(fx, {at: burstAt, size: 3, life: 0.3, time: rise, ramp: RED});
            light(fx, {at: burstAt, size: 7, color: '#ff3a2a', life: 0.5, time: rise});
            hotSparks(fx, {
                at: burstAt,
                count: 44,
                time: rise,
                speed: [2, 5],
                shape: new SphereEmitter({radius: 0.1}),
                palette: RED,
                weight: 3,
                life: [0.6, 1.2],
            });
            // Hanging: the star pulsing, a red glow round it, sparks dripping, red-lit smoke rising off it.
            gate(
                held(fx, {
                    parent: flare,
                    tex: 'glint',
                    size: [0.8, 1.1],
                    color: '#ffffff',
                    ramp: RED,
                    flickers: true,
                    life: 0.15,
                    rate: 20,
                }),
                P,
                rise,
                out,
                20
            );
            gate(
                held(fx, {
                    parent: flare,
                    tex: 'glow',
                    size: [3, 4],
                    color: '#ff3a2a',
                    alpha: 0.5,
                    flickers: true,
                    life: 0.3,
                    rate: 10,
                    order: 2,
                }),
                P,
                rise,
                out,
                10
            );
            gate(
                held(fx, {parent: flare, tex: 'glow', size: 0.5, color: '#ffffff', life: 0.1, rate: 30, order: 7}),
                P,
                0,
                out,
                30
            );
            gate(
                fx.sys({
                    tex: 'dot',
                    mode: RenderMode.StretchedBillBoard,
                    stretch: {speed: 0.3, length: 1},
                    life: [0.6, 1],
                    speed: [0, 0.4],
                    size: [0.04, 0.07],
                    rate: 18,
                    loop: false,
                    world: true,
                    shape: new SphereEmitter({radius: 0.1}),
                    parent: flare,
                    order: 5,
                    b: [tint(RED, popOut(0.5)), gravity(4)],
                }),
                P,
                rise,
                out,
                18
            );
            gate(
                dust(fx, {
                    parent: flare,
                    world: true,
                    rate: 6,
                    at: [0, 0.2, 0],
                    size: [0.5, 0.8],
                    life: [1.6, 2.2],
                    speed: [0.1, 0.3],
                    aim: 'up',
                    color: ['#b08088', '#c8a0a8'],
                    alpha: 0.55,
                    drag: 1,
                    lift: 0.4,
                    grows: 2,
                }),
                P,
                rise + 0.1,
                out,
                6
            );
        },
    },
    {
        id: 'projectiles/homing-missile',
        name: 'Homing missile',
        loop: false,
        period: 3.8,
        view: {height: 2, distance: 13},
        build(fx) {
            // homing-missile.js in 3D: a missile kicks off, arcs up, rolls over and dives onto its target
            // (1.25 s), its smoke trail left hanging in the air; it hits in a fiery blast of flame, sparks
            // and rocks under a rolling column of smoke, a scorch left on the floor.
            const flight = 1.25;
            const target: At = [2.2, 0, 0];
            const missile = fx.node('missile', [-3, 0.4, 0]);
            const body = fx.node('body', [0, 0, 0]);
            body.parent = missile;
            fx.prop(shapes.cylinder(fx.scene, 0.5, 0.06), {parent: body, color: '#d8dce4'});
            fx.prop(shapes.cylinder(fx.scene, 0.16, 0, 0.06), {parent: body, at: [0, 0.33, 0], color: '#c9281f'});
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
            const P = 3.8;
            gate(
                held(fx, {
                    parent: missile,
                    tex: 'glow',
                    size: [0.5, 0.7],
                    color: '#fff3a6',
                    ramp: HOT,
                    flickers: true,
                    life: 0.08,
                }),
                P,
                0,
                flight,
                50
            );
            gate(
                dust(fx, {
                    parent: missile,
                    world: true,
                    rate: 70,
                    size: [0.32, 0.48],
                    life: [1.8, 2.4],
                    speed: [0, 0.2],
                    color: SMOKE,
                    alpha: 0.6,
                    drag: 1,
                    lift: 0.06,
                    grows: 2.4,
                    warm: true,
                }),
                P,
                0.03,
                flight,
                70
            );
            gate(
                fx.sys({
                    tex: 'dot',
                    life: [0.2, 0.4],
                    speed: [0.3, 1],
                    size: [0.04, 0.06],
                    rate: 30,
                    loop: false,
                    world: true,
                    shape: new SphereEmitter({radius: 0.05}),
                    parent: missile,
                    order: 5,
                    b: [tint(SPARK, popOut(0.5)), gravity(5)],
                }),
                P,
                0,
                flight,
                30
            );
            // The blast.
            const at: At = [target[0], 0.3, 0];
            star(fx, {at, tex: 'burst', size: 2.4, life: 0.2, time: flight});
            light(fx, {at: [target[0], 0.8, 0], size: 6, color: '#ffb84a', life: 0.5, time: flight, alpha: 0.8});
            fx.sys({
                tex: 'flame',
                life: [0.3, 0.55],
                speed: [1, 3.2],
                size: [0.7, 1.1],
                burst: [[flight, 18]],
                loop: false,
                shape: new HemisphereEmitter({radius: 0.4}),
                aim: 'up',
                at,
                order: 5,
                b: [tint(PALETTE.fire, popOut(0.4)), grow([0, 0.6], [1, 1.3]), airDrag(2)],
            });
            dust(fx, {
                at,
                shape: new ConeEmitter({radius: 0.4, angle: 0.4}),
                aim: 'up',
                burst: [[flight + 0.05, 16]],
                speed: [1, 2.6],
                size: [0.8, 1.2],
                life: [1.6, 2.2],
                color: ['#4a4450', '#6a6470'],
                alpha: 0.75,
                drag: 1.5,
                lift: 0.5,
                grows: 2,
                warm: true,
            });
            shockwave(fx, {at: [target[0], 0.05, 0], size: 5, life: 0.45, delay: flight, color: '#ffc764'});
            hotSparks(fx, {
                at,
                count: 30,
                time: flight,
                speed: [3, 7],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.3, angle: 1.1}),
                palette: PALETTE.fire,
            });
            clods(fx, {
                at,
                count: 10,
                delay: flight,
                color: ['#3e3558', '#4a3f69'],
                size: [0.08, 0.16],
                speed: [3, 6],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.3, angle: 0.8}),
            });
            decal(fx, {at: [target[0], 0.015, 0], size: 2.4, life: 2.4, delay: flight, alpha: 0.75});
        },
    },
    {
        id: 'projectiles/laser-bolt',
        name: 'Laser bolt',
        loop: true,
        period: 0.5,
        build(fx) {
            // laser-bolt.js in 3D: a red laser bolt: a white-hot core in a rounded head, red bands tapering
            // back, pulses racing down it, a tail that shimmers apart into wavering dashes.
            const bolt = flyer(fx, [-4, 1.3, 0], [4.4, 1.3, 0], 0.5);
            held(fx, {parent: bolt, tex: 'glow', size: 1.4, color: '#ff2a3a', alpha: 0.45, order: 2});
            held(fx, {parent: bolt, tex: 'streak', size: 2.8, color: '#c9142a', at: [-1, 0, 0], alpha: 0.9, order: 3});
            held(fx, {parent: bolt, tex: 'streak', size: 1.8, color: '#ff4a5a', at: [-0.6, 0, 0], order: 4});
            held(fx, {parent: bolt, tex: 'streak', size: 1, color: '#ffffff', at: [-0.3, 0, 0], order: 5});
            held(fx, {parent: bolt, tex: 'glow', size: 0.5, color: '#ffffff', order: 6});
            // Pulses racing back down it.
            fx.sys({
                tex: 'glow',
                life: 0.2,
                speed: 9,
                size: [0.25, 0.35],
                rate: 22,
                shape: new ConeEmitter({radius: 0.01, angle: 0}),
                aim: 'left',
                parent: bolt,
                order: 6,
                b: [tint(RED, popOut(0.3))],
            });
            // The tail shimmering apart into wavering dashes.
            fx.sys({
                tex: 'streak',
                life: [0.12, 0.25],
                size: [0.18, 0.34],
                rate: 60,
                world: true,
                color: '#ff3a4a',
                shape: new BoxEmitter({width: 0.8, height: 0.08, depth: 0.05}),
                parent: bolt,
                at: [-2.2, 0, 0],
                order: 3,
                b: [tint([['#ffffff', 0]], flicker()), wobble(6, 0.15)],
            });
        },
    },
    {
        id: 'projectiles/magic-missile',
        name: 'Magic missile',
        loop: false,
        period: 1.9,
        build(fx) {
            // magic-missile.js in 3D: motes gather into an arcane orb at the caster's hand (to 0.42 s); it
            // weaves to its target (0.83 s) trailing a twisting ribbon, and bursts into a star of light, a
            // ring and sparkles that drift down and wink out.
            const P = 1.9;
            const gather = 0.42;
            const hit = 0.83;
            const hand: At = [-2.3, 1.3, 0.2];
            const target: At = [2.4, 1.2, 0];
            fx.character([-2.8, 0, 0], 1.8);
            fx.character([2.8, 0, 0], 1.8, '#3a2d3a');
            const orb = fx.node('orb', hand);
            const strands = [fx.node('strand-a'), fx.node('strand-b')];
            for (const s of strands) s.parent = orb;
            fx.every((t) => {
                const k = Math.min(1, Math.max(0, (t - gather) / (hit - gather)));
                orb.position.set(
                    hand[0] + (target[0] - hand[0]) * k,
                    hand[1] + (target[1] - hand[1]) * k + Math.sin(k * Math.PI * 2) * 0.45 * (1 - k * 0.6),
                    hand[2] * (1 - k) + Math.sin(k * Math.PI) * 0.5
                );
                // Two strands twisting round the line of flight.
                const a = t * 26;
                strands[0].position.set(0, Math.cos(a) * 0.16, Math.sin(a) * 0.16);
                strands[1].position.set(0, -Math.cos(a) * 0.16, -Math.sin(a) * 0.16);
            });
            // Motes drawn in to the hand.
            gate(
                fx.sys({
                    tex: 'dot',
                    life: 0.35,
                    speed: -2.2,
                    size: [0.04, 0.07],
                    rate: 60,
                    loop: false,
                    shape: new SphereEmitter({radius: 0.75, thickness: 0}),
                    at: hand,
                    color: '#d8b0ff',
                    order: 5,
                    b: [tint(ARCANE, popOut(0.6))],
                }),
                P,
                0,
                gather,
                60
            );
            gate(
                held(fx, {
                    parent: orb,
                    tex: 'glow',
                    size: [0.8, 1],
                    color: '#b06aff',
                    flickers: true,
                    life: 0.1,
                    rate: 40,
                }),
                P,
                0.1,
                hit,
                40
            );
            gate(
                held(fx, {parent: orb, tex: 'glow', size: 0.32, color: '#ffffff', life: 0.08, rate: 40, order: 7}),
                P,
                0.15,
                hit,
                40
            );
            for (const s of strands) {
                gate(
                    fx.sys({
                        tex: 'dot',
                        life: 0.4,
                        size: [0.09, 0.12],
                        rate: 160,
                        color: '#c890ff',
                        loop: false,
                        world: true,
                        parent: s,
                        order: 5,
                        b: [tint(ARCANE, fadeOut(0.2, 0)), grow([0, 1], [1, 0.3])],
                    }),
                    P,
                    gather,
                    hit,
                    160
                );
            }
            // The burst.
            star(fx, {at: target, size: 2.4, life: 0.3, time: hit, ramp: ARCANE});
            light(fx, {at: target, size: 4, color: '#b06aff', life: 0.4, time: hit});
            fx.sys({
                tex: 'ring',
                life: 0.4,
                size: 2,
                burst: [[hit, 1]],
                loop: false,
                at: target,
                color: '#d8b0ff',
                order: 6,
                b: [tint(ARCANE, popOut(0.3)), grow([0, 0.2], [1, 1])],
            });
            wedges(fx, {
                at: target,
                radius: 0.5,
                count: 10,
                size: [0.05, 0.08],
                color: '#e8c8ff',
                blend: 'add',
                time: hit,
                life: [0.2, 0.3],
                reach: 4,
                tex: 'streak',
                fly: -3,
            });
            fx.sys({
                tex: 'glint',
                life: [0.5, 0.9],
                speed: [0.4, 1.4],
                size: [0.12, 0.2],
                burst: [[hit + 0.05, 18]],
                loop: false,
                shape: new SphereEmitter({radius: 0.3}),
                at: target,
                color: '#f0e0ff',
                order: 6,
                b: [tint([['#ffffff', 0]], flicker()), airDrag(2.5), gravity(0.8)],
            });
        },
    },
    {
        id: 'projectiles/muzzle-pistol',
        name: 'Pistol shot',
        loop: false,
        period: 1.8,
        view: {height: 1.1, distance: 6.5},
        build(fx) {
            // muzzle-pistol.js in 3D: one shot from a pistol 1.2 m up: a spiky white-cored flash, sparks, a
            // curl of smoke hooking up and back, a brass casing kicked out that bounces and settles.
            const muzzle = gun(fx, -0.6, 1.2, 0.45, 0.045);
            star(fx, {at: muzzle, tex: 'burst', size: 0.7, life: 0.06, rot: 0.6});
            star(fx, {at: [muzzle[0] + 0.32, muzzle[1], 0], tex: 'streak', size: 1, life: 0.06});
            star(fx, {at: muzzle, tex: 'glow', size: 0.6, life: 0.07, ramp: [['#ffffff', 0]]});
            light(fx, {at: muzzle, size: 2.4, color: '#ffb84a', life: 0.18});
            hotSparks(fx, {
                at: muzzle,
                count: 12,
                speed: [3, 6],
                aim: 'right',
                shape: new ConeEmitter({radius: 0.02, angle: 0.4}),
            });
            dust(fx, {
                at: muzzle,
                shape: new ConeEmitter({radius: 0.03, angle: 0.5}),
                aim: 'right',
                rotate: [0, 0, 0.5],
                burst: [[0.02, 6]],
                speed: [0.6, 1.4],
                size: [0.18, 0.3],
                life: [1.1, 1.6],
                color: SMOKE,
                alpha: 0.55,
                drag: 3,
                lift: 0.9,
                grows: 2.2,
            });
            clods(fx, {
                at: [muzzle[0] - 0.25, muzzle[1] + 0.05, 0],
                mesh: 'cube',
                count: 1,
                color: BRASS,
                size: [0.06, 0.06],
                speed: [2.2, 2.6],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.01, angle: 0.25}),
                life: [1.6, 1.7],
                bounce: 0.45,
            });
        },
    },
    {
        id: 'projectiles/muzzle-shotgun',
        name: 'Shotgun blast',
        loop: false,
        period: 3.2,
        view: {height: 1.1, distance: 6.5},
        build(fx) {
            // muzzle-shotgun.js in 3D: a blast from a shotgun 1.1 m up: a wide ragged fan of flame, pellet
            // streaks, a heavy rolling cloud of smoke, and a red shell kicked out on the pump (0.5 s).
            const muzzle = gun(fx, -1, 1.1, 1.1, 0.06);
            star(fx, {at: muzzle, tex: 'burst', size: 1, life: 0.08, rot: 0.4});
            light(fx, {at: muzzle, size: 3.4, color: '#ffb84a', life: 0.25});
            fx.sys({
                tex: 'flame',
                life: [0.08, 0.15],
                speed: [3, 7],
                size: [0.4, 0.75],
                rot: -Math.PI / 2,
                burst: [[0, 14]],
                loop: false,
                shape: new ConeEmitter({radius: 0.05, angle: 0.5}),
                aim: 'right',
                at: muzzle,
                order: 6,
                b: [tint(HOT, popOut(0.5)), grow([0, 0.6], [1, 1.3])],
            });
            hotSparks(fx, {
                at: muzzle,
                count: 14,
                speed: [14, 18],
                aim: 'right',
                shape: new ConeEmitter({radius: 0.02, angle: 0.12}),
                life: [0.2, 0.3],
                streak: 0.12,
                weight: 1,
                palette: GOLD,
            });
            dust(fx, {
                at: muzzle,
                shape: new ConeEmitter({radius: 0.05, angle: 0.45}),
                aim: 'right',
                burst: [[0.02, 26]],
                speed: [1.4, 3.6],
                size: [0.5, 0.85],
                life: [2, 2.8],
                color: SMOKE,
                alpha: 0.7,
                drag: 2.2,
                lift: 0.2,
                grows: 2.2,
                warm: true,
            });
            clods(fx, {
                at: [muzzle[0] - 0.6, muzzle[1] - 0.05, 0],
                mesh: 'cube',
                count: 1,
                delay: 0.5,
                color: '#c9281f',
                size: [0.1, 0.1],
                speed: [1.8, 2.2],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.01, angle: 0.3}),
                life: [2.4, 2.5],
                bounce: 0.4,
            });
        },
    },
    {
        id: 'projectiles/muzzle-smg',
        name: 'SMG fire',
        loop: true,
        period: 1,
        view: {height: 1.1, distance: 6.5},
        build(fx) {
            // muzzle-smg.js in 3D: sustained fire at twelve rounds a second: each shot its own spiky flash with
            // a white core and a pulse of light, sparks, smoke wisps piling up and drifting, brass casings
            // kicked out to bounce on the floor.
            const muzzle = gun(fx, -0.8, 1.2, 0.6, 0.05);
            const rounds: Array<[number, number, number, number]> = [[0, 1, 12, 1 / 12]];
            fx.sys({
                tex: 'burst',
                life: 0.05,
                size: [0.45, 0.65],
                rot: true,
                burst: rounds,
                at: muzzle,
                order: 7,
                b: [tint(HOT, popOut(0.4))],
            });
            fx.sys({
                tex: 'streak',
                life: 0.05,
                size: [0.6, 0.9],
                burst: rounds,
                at: [muzzle[0] + 0.3, muzzle[1], 0],
                order: 7,
                b: [tint(HOT, popOut(0.4))],
            });
            fx.sys({
                tex: 'glow',
                life: 0.07,
                size: 2,
                burst: rounds,
                color: '#ffb84a',
                alpha: 0.5,
                at: muzzle,
                order: 2,
                b: [tint([['#ffffff', 0]], popOut(0.2))],
            });
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.45, length: 1},
                life: [0.2, 0.4],
                speed: [3, 6],
                size: [0.035, 0.05],
                burst: [[0, 3, 12, 1 / 12]],
                world: true,
                shape: new ConeEmitter({radius: 0.02, angle: 0.6}),
                aim: 'right',
                at: muzzle,
                order: 5,
                b: [tint(SPARK, popOut(0.5)), gravity(8), floorBounce(0.35)],
            });
            dust(fx, {
                at: [muzzle[0] + 0.1, muzzle[1], 0],
                shape: new ConeEmitter({radius: 0.05, angle: 0.6}),
                aim: 'up',
                rate: 14,
                size: [0.25, 0.4],
                life: [1.2, 1.7],
                speed: [0.3, 0.7],
                color: SMOKE,
                alpha: 0.4,
                drag: 2,
                lift: 0.5,
                grows: 2,
                loop: true,
            });
            fx.sys({
                mesh: 'cube',
                tumble: 12,
                world: true,
                life: [1, 1.2],
                speed: [2, 3],
                size: 0.05,
                burst: rounds,
                color: BRASS,
                shape: new ConeEmitter({radius: 0.01, angle: 0.35}),
                aim: 'up',
                at: [muzzle[0] - 0.4, muzzle[1] + 0.05, 0.05],
                order: 3,
                b: [gravity(10), floorBounce(0.45), grow([0, 1], [0.9, 1], [1, 0])],
            });
        },
    },
    {
        id: 'projectiles/plasma-shot',
        name: 'Plasma shot',
        loop: true,
        period: 0.8,
        build(fx) {
            // plasma-shot.js in 3D: a glowing plasma blob: hot knots churning in its core, a corona crackling
            // over its skin, its tail necking into droplets that tear off, cool and wink out behind.
            const shot = flyer(fx, [-3.8, 1.3, 0], [3.8, 1.3, 0], 0.8);
            held(fx, {parent: shot, tex: 'glow', size: 1.3, color: '#3aff8a', alpha: 0.7, order: 3});
            held(fx, {parent: shot, tex: 'glow', size: 0.55, color: '#d8ffe8', order: 6});
            fx.sys({
                tex: 'glow',
                life: 0.15,
                speed: 0.4,
                size: [0.15, 0.3],
                rate: 60,
                shape: new SphereEmitter({radius: 0.18}),
                parent: shot,
                color: '#ffffff',
                order: 7,
                b: [tint(PLASMA, popOut(0.4)), orbit(8, [1, 0.3, 0.2])],
            });
            arcs(fx, {
                parent: shot,
                to: shot,
                shape: new SphereEmitter({radius: 0.42, thickness: 0}),
                rate: 30,
                width: [0.08, 0.12],
                color: '#b8ffd0',
                palette: PLASMA,
            });
            // The tail: a necking stream, and droplets tearing off it.
            held(fx, {
                parent: shot,
                tex: 'streak',
                size: 1.8,
                color: '#3aff8a',
                at: [-0.75, 0, 0],
                alpha: 0.8,
                order: 3,
            });
            fx.sys({
                tex: 'dot',
                life: [0.25, 0.4],
                speed: [0, 0.3],
                size: [0.1, 0.18],
                rate: 60,
                world: true,
                parent: shot,
                at: [-0.15, 0, 0],
                order: 4,
                b: [tint(PLASMA, fadeOut(0.3, 0)), grow([0, 1], [1, 0.15])],
            });
            fx.sys({
                tex: 'dot',
                life: [0.3, 0.55],
                speed: [0.4, 1],
                size: [0.07, 0.12],
                rate: 18,
                world: true,
                shape: new ConeEmitter({radius: 0.08, angle: 0.5}),
                aim: 'left',
                parent: shot,
                at: [-0.3, 0, 0],
                order: 4,
                b: [tint(PLASMA, popOut(0.6)), airDrag(3), grow([0, 1], [1, 0.4])],
            });
            fx.sys({
                tex: 'glow',
                life: 0.2,
                size: 0.6,
                rate: 50,
                world: true,
                color: '#3aff8a',
                alpha: 0.25,
                parent: shot,
                order: 1,
            });
        },
    },
    {
        id: 'projectiles/rocket',
        name: 'Rocket',
        loop: true,
        period: 1.2,
        build(fx) {
            // rocket.js in 3D: a steel rocket roars along: a flickering jet with shock diamonds and a white-hot
            // nozzle, a thick billowing smoke trail lit by the flame where it leaves the jet, sparks shed
            // behind.
            const rocket = flyer(fx, [-3.8, 1.4, 0], [4.4, 1.4, 0], 1.2);
            fx.prop(shapes.cylinder(fx.scene, 0.8, 0.085), {
                parent: rocket,
                rotate: [0, 0, Math.PI / 2],
                color: '#c8ccd8',
            });
            fx.prop(shapes.cylinder(fx.scene, 0.22, 0, 0.085), {
                parent: rocket,
                at: [0.51, 0, 0],
                rotate: [0, 0, -Math.PI / 2],
                color: '#c9281f',
            });
            for (const a of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
                fx.prop(shapes.box(fx.scene, 0.18, 0.12, 0.012), {
                    parent: rocket,
                    at: [-0.34, Math.cos(a) * 0.1, Math.sin(a) * 0.1],
                    rotate: [a, 0, 0],
                    color: '#8a8e98',
                });
            }
            // The jet: flame licking back, a white-hot nozzle, shock diamonds flickering down it.
            held(fx, {
                parent: rocket,
                tex: 'flame',
                size: [0.5, 0.75],
                color: '#ffffff',
                at: [-0.72, 0, 0],
                rot: Math.PI / 2,
                ramp: HOT,
                rate: 70,
            });
            held(fx, {parent: rocket, tex: 'glow', size: 0.35, color: '#ffffff', at: [-0.45, 0, 0], order: 7});
            for (const [i, x] of [-0.62, -0.8, -0.98].entries()) {
                held(fx, {
                    parent: rocket,
                    tex: 'glint',
                    size: 0.2 - i * 0.04,
                    color: '#fff3a6',
                    at: [x, 0, 0],
                    flickers: true,
                    life: 0.08,
                    rate: 30,
                    order: 7,
                });
            }
            held(fx, {
                parent: rocket,
                tex: 'glow',
                size: 1.8,
                color: '#ff8a2a',
                alpha: 0.4,
                at: [-0.7, 0, 0],
                flickers: true,
                life: 0.1,
                rate: 20,
                order: 2,
            });
            dust(fx, {
                parent: rocket,
                world: true,
                rate: 75,
                at: [-0.85, 0, 0],
                size: [0.4, 0.6],
                life: [1.3, 1.8],
                speed: [0.1, 0.4],
                shape: new SphereEmitter({radius: 0.06}),
                color: SMOKE,
                alpha: 0.6,
                drag: 1,
                lift: 0.12,
                grows: 3,
                warm: true,
                loop: true,
            });
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.4, length: 1},
                life: [0.2, 0.4],
                speed: [0.5, 1.5],
                size: [0.035, 0.05],
                rate: 30,
                world: true,
                shape: new SphereEmitter({radius: 0.06}),
                parent: rocket,
                at: [-0.8, 0, 0],
                order: 5,
                b: [tint(SPARK, popOut(0.5)), gravity(5)],
            });
        },
    },
];
