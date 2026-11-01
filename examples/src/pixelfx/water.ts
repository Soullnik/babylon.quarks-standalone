import {BoxEmitter, CircleEmitter, ConeEmitter, RenderMode, SphereEmitter} from 'babylon.quarks';
import type {SysOptions} from './kit';
import {drag, fadeOut, gravity, grow, orbit, popOut, spin, subEmit, tint, wobble} from './kit';
import {flash, pool, smoke, type Ramp} from './recipes';
import {shapes, type FxBuilder, type FxDef} from './stage';

const WATER: Ramp = [
    ['#ffffff', 0],
    ['#c8eeff', 0.3],
    ['#6ab8f0', 1],
];
const FOAM = '#eef8ff';

/** A still dark pool on the floor, the stage for splashes and rings. */
function waterSurface(fx: FxBuilder, radius: number, at: [number, number, number] = [0, 0.02, 0]) {
    const disc = fx.prop(shapes.cylinder(fx.scene, 0.02, radius, radius, 40), {
        at,
        color: '#0c2236',
        glow: '#06182a',
        alpha: 0.85,
    });
    return disc;
}

/** Rings spreading over the water from where drops land. */
function ripples(
    fx: FxBuilder,
    o: {
        at?: [number, number, number];
        burst?: SysOptions['burst'];
        rate?: number;
        size?: number;
        shape?: SysOptions['shape'];
        delay?: number;
        life?: number;
        loop?: boolean;
        world?: boolean;
        parent?: FxBuilder['root'];
    }
) {
    return fx.sys({
        tex: 'ring',
        mode: RenderMode.HorizontalBillBoard,
        life: o.life ?? 0.9,
        size: o.size ?? 1.6,
        burst: o.burst,
        rate: o.burst ? undefined : o.rate,
        color: '#bfe6ff',
        shape: o.shape,
        aim: o.shape ? 'up' : undefined,
        at: o.at ?? [0, 0.05, 0],
        delay: o.delay,
        loop: o.loop,
        world: o.world,
        parent: o.parent,
        order: 2,
        b: [tint([['#ffffff', 0]], popOut(0.1)), grow([0, 0.05], [1, 1])],
    });
}

/** Droplets thrown out and falling, stretched by their speed. */
function droplets(
    fx: FxBuilder,
    o: {
        at?: [number, number, number];
        count?: number;
        rate?: number;
        speed?: [number, number];
        size?: [number, number];
        shape?: SysOptions['shape'];
        aim?: SysOptions['aim'];
        rotate?: SysOptions['rotate'];
        delay?: number;
        duration?: number;
        loop?: boolean;
        world?: boolean;
        parent?: FxBuilder['root'];
        life?: [number, number];
        fall?: number;
    }
) {
    return fx.sys({
        tex: 'dot',
        mode: RenderMode.StretchedBillBoard,
        stretch: {speed: 0.05, length: 1},
        life: o.life ?? [0.5, 0.8],
        speed: o.speed ?? [3, 5],
        size: o.size ?? [0.06, 0.1],
        burst: o.rate === undefined ? [[0, o.count ?? 20]] : undefined,
        rate: o.rate,
        shape: o.shape ?? new ConeEmitter({radius: 0.1, angle: 0.6}),
        aim: o.aim ?? 'up',
        rotate: o.rotate,
        at: o.at,
        delay: o.delay,
        duration: o.duration,
        loop: o.loop,
        world: o.world,
        parent: o.parent,
        order: 4,
        b: [tint(WATER, fadeOut(0.7, 0.02)), gravity(o.fall ?? 12)],
    });
}

/** Soft white mist drifting off splashes and falls. */
function mist(fx: FxBuilder, o: Parameters<typeof smoke>[1]) {
    return smoke(fx, {color: FOAM, alpha: 0.35, ...o});
}

/** pixelfx's water category, rebuilt as 3D particle effects. */
export const water: FxDef[] = [
    {
        id: 'water/bubbles',
        name: 'Bubbles',
        loop: true,
        period: 4,
        build(fx) {
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                fx.prop(shapes.ico(fx.scene, 0.14), {
                    at: [Math.cos(a) * 0.3, 0.06, Math.sin(a) * 0.3],
                    color: '#3a4a52',
                });
            }
            const surface = 3.4;
            // Bubbles wobbling and swelling as they rise, popping at the surface.
            const bubbles = fx.sys({
                tex: 'ring',
                life: 2.2,
                speed: surface / 2.2,
                size: [0.12, 0.22],
                rate: 6,
                color: '#bfe6ff',
                shape: new ConeEmitter({radius: 0.15, angle: 0.05}),
                aim: 'up',
                at: [0, 0.1, 0],
                world: true,
                order: 4,
                b: [tint([['#ffffff', 0]], fadeOut(0.95, 0.05)), grow([0, 0.6], [1, 1.6]), wobble(2, 0.6)],
            });
            fx.sys({
                tex: 'dot',
                life: 2.2,
                speed: surface / 2.2,
                size: [0.03, 0.05],
                rate: 6,
                color: '#ffffff',
                shape: new ConeEmitter({radius: 0.15, angle: 0.05}),
                aim: 'up',
                at: [0.04, 0.14, 0],
                order: 5,
                b: [wobble(2, 0.6)],
            });
            const pop = fx.sys({
                tex: 'ring',
                life: 0.2,
                size: 0.4,
                burst: [[0, 1]],
                world: true,
                color: '#ffffff',
                order: 5,
                b: [tint([['#ffffff', 0]], popOut(0.1)), grow([0, 0.4], [1, 1.4])],
            });
            subEmit(bubbles, pop);
            // Shafts of light from the surface.
            fx.sys({
                tex: 'streak',
                mode: RenderMode.VerticalBillBoard,
                life: 2,
                size: [2.5, 3.5],
                rate: 1.5,
                rot: Math.PI / 2 + 0.2,
                color: '#6ab8f0',
                alpha: 0.12,
                shape: new BoxEmitter({width: 2.4, height: 0.1, depth: 1}),
                at: [0, 1.8, 0],
                order: 1,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.4))],
            });
            fx.prop(shapes.cylinder(fx.scene, 0.02, 1.4, 1.4, 32), {
                at: [0, surface, 0],
                color: '#3a7ab8',
                glow: '#1a4a78',
                alpha: 0.25,
            });
        },
    },
    {
        id: 'water/drip',
        name: 'Drip',
        loop: false,
        period: 2.8,
        build(fx) {
            const tip = 3.6;
            fx.prop(shapes.cylinder(fx.scene, 0.8, 0.05, 0.4, 6), {at: [0, tip + 0.4, 0], color: '#3a3842'});
            waterSurface(fx, 1.2);
            const drop = 0.75;
            // The bead swells under the tip, catches the light, pinches off and falls.
            fx.sys({
                tex: 'dot',
                life: drop,
                size: 0.16,
                burst: 1,
                color: '#c8eeff',
                at: [0, tip - 0.08, 0],
                order: 4,
                b: [grow([0, 0.2], [1, 1])],
            });
            fx.sys({
                tex: 'glint',
                life: 0.2,
                size: 0.25,
                burst: [[drop - 0.2, 1]],
                at: [0.03, tip - 0.06, 0.05],
                order: 5,
                b: [tint([['#ffffff', 0]], popOut(0.3))],
            });
            const fall = Math.sqrt((2 * (tip - 0.1)) / 14);
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.03, length: 1},
                life: fall,
                size: 0.14,
                burst: [[drop, 1]],
                color: '#c8eeff',
                at: [0, tip - 0.1, 0],
                order: 4,
                b: [gravity(14)],
            });
            const land = drop + fall;
            droplets(fx, {
                at: [0, 0.05, 0],
                count: 10,
                delay: land,
                speed: [1.6, 2.4],
                size: [0.04, 0.07],
                shape: new ConeEmitter({radius: 0.08, angle: 0.5, thickness: 0}),
                aim: 'up',
                life: [0.3, 0.45],
            });
            droplets(fx, {
                at: [0, 0.05, 0],
                count: 1,
                delay: land + 0.1,
                speed: [2.2, 2.4],
                shape: new ConeEmitter({radius: 0, angle: 0.02}),
                size: [0.08, 0.08],
                life: [0.3, 0.3],
            });
            ripples(fx, {
                burst: [
                    [0, 1],
                    [0.15, 1],
                ],
                delay: land,
                size: 1.8,
            });
        },
    },
    {
        id: 'water/fountain',
        name: 'Fountain',
        loop: true,
        period: 2,
        build(fx) {
            fx.prop(shapes.torus(fx.scene, 1.5, 0.3), {at: [0, 0.2, 0], color: '#5a5868'});
            waterSurface(fx, 1.45, [0, 0.25, 0]);
            fx.prop(shapes.cylinder(fx.scene, 0.6, 0.12), {at: [0, 0.5, 0], color: '#5a5868'});
            // The jet blooming into glassy arcs that break into beads and fall back.
            droplets(fx, {
                at: [0, 0.8, 0],
                rate: 120,
                speed: [5.5, 6.5],
                shape: new ConeEmitter({radius: 0.05, angle: 0.22}),
                life: [1, 1.2],
                size: [0.07, 0.11],
                fall: 10,
                world: true,
            });
            fx.sys({
                tex: 'glow',
                life: [0.3, 0.5],
                speed: [5.5, 6.2],
                size: [0.25, 0.35],
                rate: 40,
                color: '#bfe6ff',
                alpha: 0.5,
                shape: new ConeEmitter({radius: 0.04, angle: 0.06}),
                aim: 'up',
                at: [0, 0.8, 0],
                order: 3,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.05)), gravity(10)],
            });
            ripples(fx, {
                rate: 8,
                size: 0.8,
                life: 0.6,
                shape: new CircleEmitter({radius: 1.2, thickness: 0.6}),
                at: [0, 0.28, 0],
            });
            mist(fx, {
                at: [0, 0.4, 0],
                shape: new CircleEmitter({radius: 1.1, thickness: 0.4}),
                rate: 4,
                speed: [0.1, 0.3],
                size: [0.5, 0.8],
            });
        },
    },
    {
        id: 'water/geyser',
        name: 'Geyser',
        loop: false,
        period: 6.2,
        build(fx) {
            waterSurface(fx, 1.6);
            const blast = 1.8;
            // The pool heaves and burbles before it blows.
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 0.4,
                size: [0.3, 0.6],
                burst: [[0, 2, 9, 0.2]],
                color: '#bfe6ff',
                shape: new CircleEmitter({radius: 0.6, thickness: 1}),
                aim: 'up',
                at: [0, 0.05, 0],
                order: 2,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.2], [1, 1])],
            });
            droplets(fx, {
                at: [0, 0.05, 0],
                rate: 20,
                duration: blast,
                loop: false,
                speed: [1, 2],
                size: [0.05, 0.08],
                shape: new ConeEmitter({radius: 0.4, angle: 0.4, thickness: 1}),
                life: [0.25, 0.35],
            });
            // The column: white water blasted skyward with a churning foam head.
            fx.sys({
                tex: 'smoke',
                life: [0.8, 1.1],
                speed: [8, 10],
                size: [0.6, 0.9],
                rot: true,
                rate: 70,
                delay: blast,
                duration: 1.4,
                loop: false,
                color: FOAM,
                shape: new ConeEmitter({radius: 0.3, angle: 0.06}),
                aim: 'up',
                order: 3,
                b: [tint(WATER, fadeOut(0.5, 0.05)), grow([0, 0.6], [1, 1.6]), gravity(9), spin([-1, 1])],
            });
            droplets(fx, {
                rate: 60,
                delay: blast,
                duration: 1.6,
                loop: false,
                speed: [7, 10],
                shape: new ConeEmitter({radius: 0.3, angle: 0.18}),
                life: [1.4, 1.8],
                fall: 9,
                world: true,
            });
            mist(fx, {
                at: [0, 2.5, 0],
                shape: new SphereEmitter({radius: 1.2}),
                rate: 12,
                delay: blast + 0.3,
                duration: 1.8,
                loop: false,
                speed: [0.2, 0.6],
                size: [1, 1.5],
                life: [1.4, 2],
            });
            ripples(fx, {burst: [[0, 2, 4, 0.3]], delay: blast, size: 3.2, life: 1});
        },
    },
    {
        id: 'water/rain-splash',
        name: 'Rain splash',
        loop: true,
        period: 2.4,
        build(fx) {
            waterSurface(fx, 2.2);
            // Raindrops dying at the surface, each feeding a crown and a ring there.
            const height = 4.5;
            const rain = fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.04, length: 1},
                life: height / 11,
                speed: 11,
                size: 0.08,
                rate: 16,
                color: '#bfe6ff',
                alpha: 0.9,
                shape: new BoxEmitter({width: 3.4, height: 0.1, depth: 3}),
                aim: 'down',
                at: [0, height + 0.05, 0],
                world: true,
                order: 3,
            });
            const crown = fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.05, length: 1},
                life: [0.25, 0.35],
                // A sub emitter faces along the falling drop: a negative speed throws the crown back up.
                speed: [-2, -1.4],
                size: [0.05, 0.07],
                burst: [[0, 6]],
                world: true,
                shape: new ConeEmitter({radius: 0.05, angle: 0.6, thickness: 0}),
                order: 4,
                b: [tint(WATER, popOut(0.5)), gravity(10)],
            });
            const ring = fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 0.7,
                size: 1,
                burst: [[0, 1]],
                world: true,
                color: '#bfe6ff',
                order: 2,
                b: [tint([['#ffffff', 0]], popOut(0.1)), grow([0, 0.05], [1, 1])],
            });
            subEmit(rain, crown);
            subEmit(rain, ring);
            // A lamp's reflection wobbling on the water.
            fx.sys({
                tex: 'glow',
                mode: RenderMode.HorizontalBillBoard,
                life: 0.6,
                size: [0.8, 1.1],
                rate: 5,
                color: '#ffd27a',
                alpha: 0.35,
                at: [0.8, 0.04, -0.6],
                order: 1,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.3)), wobble(2, 0.2)],
            });
        },
    },
    {
        id: 'water/ripples',
        name: 'Ripples',
        loop: false,
        period: 2.2,
        build(fx) {
            waterSurface(fx, 3);
            fx.sys({
                tex: 'dot',
                life: 0.12,
                size: 0.12,
                burst: 1,
                color: '#c8eeff',
                at: [0, 0.3, 0],
                speed: 2,
                aim: 'down',
                shape: new ConeEmitter({radius: 0, angle: 0}),
                order: 4,
            });
            ripples(fx, {
                burst: [
                    [0.12, 1],
                    [0.32, 1],
                    [0.55, 1],
                    [0.8, 1],
                ],
                size: 5,
                life: 1.3,
            });
            // Crests glinting as they pass.
            fx.sys({
                tex: 'glint',
                life: 0.2,
                size: [0.15, 0.25],
                rate: 20,
                delay: 0.3,
                duration: 1.2,
                loop: false,
                shape: new CircleEmitter({radius: 1.6, thickness: 0.6}),
                aim: 'up',
                at: [0, 0.06, 0],
                order: 5,
                b: [tint([['#ffffff', 0]], popOut(0.3))],
            });
        },
    },
    {
        id: 'water/splash',
        name: 'Splash',
        loop: false,
        period: 3,
        build(fx) {
            waterSurface(fx, 2.4);
            const hit = 0.5;
            const stone = fx.node('stone', [0, 3, 0]);
            const mesh = fx.prop(shapes.ico(fx.scene, 0.2), {parent: stone, color: '#4a4652'});
            fx.every((t) => {
                const k = Math.min(1, t / hit);
                stone.position.y = 3 - 2.9 * k * k;
                mesh.setEnabled(t < hit);
            });
            flash(fx, {at: [0, 0.1, 0], size: 1.4, delay: hit, color: '#e8f8ff'});
            // A crown tearing into droplets that arc out and plink down.
            droplets(fx, {
                at: [0, 0.05, 0],
                count: 40,
                delay: hit,
                speed: [3, 4.5],
                shape: new ConeEmitter({radius: 0.3, angle: 0.5, thickness: 0}),
                life: [0.6, 0.8],
            });
            droplets(fx, {
                at: [0, 0.05, 0],
                count: 3,
                delay: hit + 0.35,
                speed: [3.5, 4],
                shape: new ConeEmitter({radius: 0, angle: 0.05}),
                size: [0.1, 0.14],
                life: [0.6, 0.65],
            });
            fx.sys({
                tex: 'smoke',
                life: [0.5, 0.8],
                speed: [0.5, 1.2],
                size: [0.4, 0.6],
                rot: true,
                burst: [[hit, 10]],
                color: FOAM,
                alpha: 0.8,
                blend: 'alpha',
                shape: new ConeEmitter({radius: 0.3, angle: 0.4, thickness: 0}),
                aim: 'up',
                at: [0, 0.1, 0],
                order: 3,
                b: [tint([['#ffffff', 0]], fadeOut(0.4, 0.05)), grow([0, 0.6], [1, 1.4])],
            });
            ripples(fx, {
                burst: [
                    [0, 1],
                    [0.2, 1],
                    [0.45, 1],
                ],
                delay: hit,
                size: 3.6,
                life: 1.2,
            });
            mist(fx, {
                at: [0, 0.4, 0],
                burst: [[0, 6]],
                delay: hit + 0.1,
                speed: [0.3, 0.6],
                size: [0.6, 0.9],
                loop: false,
            });
        },
    },
    {
        id: 'water/water-jet',
        name: 'Water jet',
        loop: true,
        period: 1,
        build(fx) {
            const nozzle: [number, number, number] = [-2.8, 1.4, 0];
            fx.prop(shapes.cylinder(fx.scene, 0.6, 0.1, 0.14), {
                at: [nozzle[0] - 0.3, nozzle[1], 0],
                rotate: [0, 0, Math.PI / 2],
                color: '#5a5868',
            });
            // A tight glassy rod with surges running down it, bending under its weight.
            fx.sys({
                tex: 'glow',
                life: [0.55, 0.65],
                speed: [9, 10],
                size: [0.28, 0.36],
                rate: 160,
                color: '#9ad8ff',
                alpha: 0.6,
                shape: new ConeEmitter({radius: 0.03, angle: 0.015}),
                aim: 'right',
                at: nozzle,
                order: 3,
                b: [tint(WATER, fadeOut(0.6, 0.02)), gravity(3), grow([0, 0.8], [1, 1.6])],
            });
            // Breaking into chunks, spray and mist toward its end.
            droplets(fx, {
                at: [nozzle[0] + 3.5, nozzle[1] - 0.4, 0],
                rate: 50,
                aim: 'right',
                speed: [3, 5],
                shape: new ConeEmitter({radius: 0.15, angle: 0.5}),
                fall: 9,
                life: [0.5, 0.7],
            });
            mist(fx, {
                at: [nozzle[0] + 4.5, nozzle[1] - 0.5, 0],
                aim: 'right',
                rate: 8,
                speed: [1, 2],
                size: [0.4, 0.7],
                life: [0.8, 1.2],
            });
        },
    },
    {
        id: 'water/water-orb',
        name: 'Water orb',
        loop: true,
        period: 3,
        build(fx) {
            const center: [number, number, number] = [0, 1.9, 0];
            const orb = fx.prop(shapes.sphere(fx.scene, 0.9, 24), {
                at: center,
                color: '#3a8ad8',
                glow: '#123a6a',
                alpha: 0.45,
            });
            fx.every((t) => {
                // A gentle wobble.
                const w = Math.sin((t / 3) * Math.PI * 6) * 0.05;
                orb.scaling.set(1 + w, 1 - w, 1 + w);
                orb.position.y = center[1] + Math.sin((t / 3) * Math.PI * 2) * 0.12;
            });
            // A current circling inside.
            fx.sys({
                tex: 'dot',
                life: [1, 1.5],
                size: [0.05, 0.09],
                rate: 30,
                color: '#c8eeff',
                shape: new SphereEmitter({radius: 0.6, thickness: 0.3}),
                at: center,
                order: 4,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.3)), orbit(3)],
            });
            fx.sys({
                tex: 'glint',
                life: 0.4,
                size: [0.3, 0.45],
                rate: 3,
                at: [0.35, center[1] + 0.4, 0.5],
                order: 5,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.3))],
            });
            // Drips falling from the bottom and plinking on the floor.
            const drips = droplets(fx, {
                at: [0, center[1] - 0.85, 0],
                rate: 1.5,
                speed: [0, 0.2],
                shape: new ConeEmitter({radius: 0.2, angle: 0}),
                aim: 'down',
                // Long enough to fall the 1.05 m to the floor: sqrt(2 * 1.05 / 9).
                life: [0.48, 0.48],
                fall: 9,
                world: true,
            });
            const ring = fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 0.6,
                size: 0.9,
                burst: [[0, 1]],
                world: true,
                color: '#bfe6ff',
                order: 2,
                b: [tint([['#ffffff', 0]], popOut(0.1)), grow([0, 0.05], [1, 1])],
            });
            subEmit(drips, ring);
            pool(fx, {color: '#3a8ad8', size: 3, alpha: 0.3});
        },
    },
    {
        id: 'water/waterfall',
        name: 'Waterfall',
        loop: true,
        period: 2,
        build(fx) {
            const top = 3.8;
            fx.prop(shapes.box(fx.scene, 3.2, 0.8, 1.6), {at: [0, top - 0.2, -0.9], color: '#3a3842'});
            fx.prop(shapes.box(fx.scene, 3.2, top - 0.6, 0.6), {at: [0, (top - 0.6) / 2, -1.4], color: '#2e2c36'});
            waterSurface(fx, 2.4, [0, 0.02, 0.4]);
            // The sheet pouring over the lip and splitting into strands.
            fx.sys({
                tex: 'streak',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.06, length: 1},
                life: [0.85, 0.95],
                speed: [1, 1.4],
                size: [0.18, 0.26],
                rate: 160,
                color: '#9ad8ff',
                alpha: 0.7,
                shape: new BoxEmitter({width: 1.6, height: 0.05, depth: 0.05}),
                aim: 'front',
                at: [0, top + 0.15, -0.15],
                order: 3,
                b: [tint(WATER, fadeOut(0.85, 0.05)), gravity(9)],
            });
            // Churning foam, spray and drifting mist at its foot.
            fx.sys({
                tex: 'smoke',
                blend: 'alpha',
                life: [0.6, 0.9],
                speed: [0.4, 1],
                size: [0.5, 0.8],
                rot: true,
                rate: 30,
                color: FOAM,
                alpha: 0.75,
                shape: new BoxEmitter({width: 1.8, height: 0.1, depth: 0.3}),
                aim: 'up',
                at: [0, 0.2, 0.3],
                order: 4,
                b: [tint([['#ffffff', 0]], fadeOut(0.4, 0.1)), grow([0, 0.6], [1, 1.5]), spin([-1, 1])],
            });
            droplets(fx, {
                at: [0, 0.2, 0.3],
                rate: 40,
                speed: [2, 3.5],
                shape: new BoxEmitter({width: 1.6, height: 0.1, depth: 0.2}),
                life: [0.4, 0.6],
            });
            mist(fx, {
                at: [0, 0.6, 0.5],
                shape: new BoxEmitter({width: 2.4, height: 0.4, depth: 0.6}),
                rate: 6,
                speed: [0.2, 0.5],
                size: [1, 1.4],
                life: [1.6, 2.2],
            });
            ripples(fx, {
                rate: 5,
                size: 1.2,
                shape: new CircleEmitter({radius: 1.6, thickness: 0.5}),
                at: [0, 0.05, 0.6],
            });
        },
    },
    {
        id: 'water/wave-crash',
        name: 'Wave crash',
        loop: false,
        period: 3.8,
        build(fx) {
            const crash = 1.2;
            const swell = fx.node('swell', [-3.4, 0.2, 0]);
            fx.every((t) => {
                const k = Math.min(1, t / crash);
                swell.position.set(-3.4 + 3.6 * k, 0.2 + 1.4 * Math.sin(k * Math.PI * 0.6), 0);
            });
            // The swell: water thrown forward and up off its crest, curling over as it falls.
            fx.sys({
                tex: 'smoke',
                life: [0.5, 0.7],
                speed: [2.5, 3.5],
                size: [0.5, 0.8],
                rot: true,
                rate: 80,
                duration: crash,
                loop: false,
                world: true,
                color: '#3a8ad8',
                alpha: 0.75,
                blend: 'alpha',
                shape: new BoxEmitter({width: 0.3, height: 0.3, depth: 2.4}),
                aim: 'right',
                rotate: [0, 0, 0.6],
                parent: swell,
                order: 3,
                b: [
                    tint(
                        [
                            ['#9ad8ff', 0],
                            ['#3a7ab8', 1],
                        ],
                        fadeOut(0.5, 0.05)
                    ),
                    gravity(7),
                ],
            });
            droplets(fx, {
                parent: swell,
                rate: 40,
                duration: crash,
                loop: false,
                world: true,
                aim: 'right',
                speed: [2.5, 4],
                shape: new BoxEmitter({width: 0.2, height: 0.2, depth: 2.4}),
            });
            // The crash: a burst of white foam and spray that surges on and fades to lace.
            fx.sys({
                tex: 'smoke',
                blend: 'alpha',
                life: [1, 1.6],
                speed: [1.5, 3.5],
                size: [0.8, 1.2],
                rot: true,
                burst: [[crash, 40]],
                color: FOAM,
                alpha: 0.85,
                shape: new BoxEmitter({width: 0.6, height: 0.3, depth: 2.4}),
                aim: 'up',
                rotate: [0, 0, -0.5],
                at: [0.3, 0.4, 0],
                order: 4,
                b: [
                    tint([['#ffffff', 0]], fadeOut(0.4, 0.05)),
                    grow([0, 0.6], [1, 1.6]),
                    gravity(2),
                    drag([0, 1], [1, 0.3]),
                    spin([-1, 1]),
                ],
            });
            droplets(fx, {
                at: [0.3, 0.4, 0],
                count: 60,
                delay: crash,
                speed: [4, 7],
                shape: new BoxEmitter({width: 0.5, height: 0.2, depth: 2.4}),
                aim: 'up',
                rotate: [0, 0, -0.4],
                life: [0.8, 1.1],
            });
            mist(fx, {
                at: [1, 0.6, 0],
                shape: new BoxEmitter({width: 2, height: 0.5, depth: 2.4}),
                burst: [[0, 10]],
                delay: crash + 0.2,
                speed: [0.3, 0.8],
                size: [1.2, 1.6],
                loop: false,
            });
        },
    },
    {
        id: 'water/whirlpool',
        name: 'Whirlpool',
        loop: true,
        period: 3,
        build(fx) {
            waterSurface(fx, 3);
            // Foam arms winding into the vortex, darkening as they're drawn down.
            fx.sys({
                tex: 'swirl',
                mode: RenderMode.HorizontalBillBoard,
                life: 1.2,
                size: 5,
                rate: 2.5,
                color: '#bfe6ff',
                alpha: 0.55,
                at: [0, 0.05, 0],
                order: 2,
                b: [tint([['#ffffff', 0]], fadeOut(0.6, 0.3)), spin(2.5), grow([0, 1.1], [1, 0.9])],
            });
            fx.sys({
                tex: 'swirl',
                mode: RenderMode.HorizontalBillBoard,
                life: 1,
                size: 3,
                rate: 3,
                color: '#6ab8f0',
                alpha: 0.6,
                at: [0, 0.06, 0],
                order: 3,
                b: [tint([['#ffffff', 0]], fadeOut(0.6, 0.3)), spin(4)],
            });
            // The deep eye.
            fx.sys({
                tex: 'glow',
                mode: RenderMode.HorizontalBillBoard,
                blend: 'alpha',
                life: 1,
                size: 1.6,
                rate: 2,
                color: '#02060c',
                alpha: 0.9,
                at: [0, 0.07, 0],
                order: 4,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.4))],
            });
            // Flecks of foam circling in after them.
            fx.sys({
                tex: 'dot',
                life: 1.5,
                speed: -1.6,
                size: [0.05, 0.09],
                rate: 40,
                color: FOAM,
                shape: new CircleEmitter({radius: 2.6, thickness: 0.2}),
                aim: 'up',
                at: [0, 0.08, 0],
                order: 5,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            ['#3a7ab8', 1],
                        ],
                        fadeOut(0.7, 0.1)
                    ),
                    orbit(2.4, [0, 0, 1]),
                ],
            });
        },
    },
];
