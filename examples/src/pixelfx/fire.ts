import {CircleEmitter, ConeEmitter, RenderMode, SphereEmitter} from 'babylon.quarks';
import {drag, fadeOut, flicker, flipbook, frames, gravity, grow, lathe, orbit, spin, tint, wobble} from './kit';
import {PALETTE, debris, decal, embers, flames, flash, heart, pool, shockwave, smoke, sparks} from './recipes';
import {type FxDef, shapes} from './stage';
import {image} from './textures';

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
            embers(fx, {at: [0, 1.6, 0], radius: 0.5, rate: 18, speed: [1.5, 3.5]});
            sparks(fx, {
                at: [0, 1.6, 0],
                rate: 6,
                speed: [3, 5],
                gravity: 3,
                shape: new ConeEmitter({radius: 0.4, angle: 0.5}),
                aim: 'up',
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
            embers(fx, {at: [0, 0.5, 0], radius: 0.4, rate: 12});
            sparks(fx, {
                at: [0, 0.4, 0],
                rate: 3,
                speed: [2.5, 4],
                gravity: 4,
                aim: 'up',
                shape: new ConeEmitter({radius: 0.3, angle: 0.6}),
            });
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
            // A calm teardrop flame: one steady sprite at a time, overlapping as they fade.
            fx.sys({
                tex: 'flame',
                life: [0.25, 0.35],
                size: [0.32, 0.38],
                rate: 18,
                at: [0, 1.42, 0],
                order: 3,
                b: [tint(PALETTE.fire.slice(0, 3), fadeOut(0.5, 0.25)), wobble(1, 0.03)],
            });
            fx.sys({
                tex: 'glow',
                life: 0.3,
                size: 0.18,
                rate: 10,
                color: '#4a7bff',
                alpha: 0.8,
                at: [0, 1.31, 0],
                order: 4,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.3))],
            });
            heart(fx, {at: [0, 1.45, 0], size: 1.2, color: '#ffb24a', alpha: 0.3, rate: 8});
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
            fx.character([-2.6, 0, 0], 1.8, '#3a2a2a');
            const mouth: [number, number, number] = [-2.2, 1.55, 0];
            fx.sys({
                tex: 'smoke',
                life: [0.5, 0.75],
                speed: [6, 8],
                size: [0.35, 0.5],
                rot: true,
                rate: 80,
                shape: new ConeEmitter({radius: 0.08, angle: 0.2, thickness: 1}),
                aim: 'right',
                at: mouth,
                order: 3,
                b: [
                    tint(PALETTE.fire, fadeOut(0.5, 0.05)),
                    grow([0, 0.4], [1, 3.4]),
                    wobble(2.5, 1.2),
                    gravity(-2),
                    spin([-1, 1]),
                ],
            });
            fx.sys({
                tex: 'glow',
                life: 0.2,
                size: [0.6, 0.8],
                rate: 20,
                color: '#fff3c0',
                at: [mouth[0] + 0.15, mouth[1], 0],
                order: 4,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            smoke(fx, {
                at: [mouth[0] + 2.4, mouth[1] + 0.2, 0],
                aim: 'right',
                speed: [2.5, 3.5],
                rate: 10,
                alpha: 0.35,
                spread: 0.4,
            });
            sparks(fx, {
                at: mouth,
                rate: 20,
                speed: [7, 10],
                gravity: 4,
                aim: 'right',
                shape: new ConeEmitter({radius: 0.1, angle: 0.3}),
            });
        },
    },
    {
        id: 'fire/fire-ring',
        name: 'Fire ring',
        loop: false,
        period: 5.2,
        build(fx) {
            fx.character([0, 0, 0], 1.8);
            flash(fx, {at: [0, 0.3, 0], size: 3});
            shockwave(fx, {size: 7, life: 0.6, color: '#ffd27a'});
            // The burning front: flames thrown out along the floor, slowing to a stop on a ring.
            fx.sys({
                tex: 'flame',
                life: [0.9, 1.3],
                speed: [5.5, 6.5],
                size: [0.7, 1.1],
                burst: [[0.05, 90]],
                shape: new CircleEmitter({radius: 0.3, thickness: 0}),
                aim: 'up',
                at: [0, 0.35, 0],
                order: 3,
                b: [
                    tint(PALETTE.fire, fadeOut(0.3, 0.05)),
                    grow([0, 0.4], [0.25, 1.3], [1, 0.3]),
                    drag([0, 1], [0.35, 0.12], [1, 0]),
                ],
            });
            // Embers left smouldering along the ring.
            fx.sys({
                tex: 'flame',
                life: [0.5, 0.8],
                speed: [0.6, 1.2],
                size: [0.3, 0.5],
                rate: 60,
                delay: 0.5,
                duration: 1.8,
                loop: false,
                shape: new CircleEmitter({radius: 3, thickness: 0.15}),
                aim: 'up',
                order: 3,
                b: [tint(PALETTE.fire.slice(1), fadeOut(0.5, 0.1)), drag([0, 1], [1, 0.5])],
            });
            decal(fx, {tex: 'shock', size: 7, life: 3.2, delay: 0.4, color: '#120806', alpha: 0.85});
            smoke(fx, {
                shape: new CircleEmitter({radius: 3, thickness: 0.2}),
                rate: 18,
                delay: 1.2,
                duration: 1.6,
                loop: false,
                alpha: 0.35,
            });
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
                at: [0, 0.3, 0],
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
            const ball = fx.node('ball', [-3, 1.4, 0]);
            fx.every((t) => {
                ball.position.x = -3.2 + (t / 1.6) * 6.4;
            });
            fx.sys({
                tex: 'glow',
                life: 0.2,
                size: [1.1, 1.3],
                rate: 25,
                color: '#fff3c0',
                parent: ball,
                order: 5,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            fx.sys({
                tex: 'smoke',
                life: [0.35, 0.55],
                speed: [0.2, 0.6],
                size: [0.6, 0.9],
                rot: true,
                rate: 70,
                world: true,
                shape: new SphereEmitter({radius: 0.25}),
                parent: ball,
                order: 3,
                b: [tint(PALETTE.fire, fadeOut(0.4, 0.05)), grow([0, 1], [1, 0.3]), spin([-2, 2])],
            });
            smoke(fx, {
                parent: ball,
                world: true,
                rate: 22,
                life: [0.6, 0.9],
                size: [0.35, 0.5],
                speed: [0.2, 0.4],
                alpha: 0.4,
            });
            embers(fx, {parent: ball, world: true, rate: 20, speed: [0.3, 0.8], life: [0.5, 0.9]});
        },
    },
    {
        id: 'fire/flame-pillar',
        name: 'Flame pillar',
        loop: false,
        period: 5.6,
        build(fx) {
            decal(fx, {
                tex: 'crack',
                size: 3,
                life: 4.6,
                color: '#ff8a2a',
                blend: 'add',
                alpha: 1,
                alphas: [
                    [0, 0],
                    [1, 0.15],
                    [1, 0.7],
                    [0, 1],
                ],
                colors: [
                    ['#ffd27a', 0],
                    ['#ff5a1a', 0.4],
                    ['#5a1008', 1],
                ],
            });
            pool(fx, {size: 3, delay: 0.2, duration: 0.6, loop: false, alpha: 0.5});
            flash(fx, {at: [0, 0.5, 0], size: 3.5, delay: 0.8});
            flames(fx, {
                puff: true,
                radius: 0.55,
                height: 6,
                life: [0.6, 0.9],
                speed: [6, 8.5],
                size: [1.2, 1.8],
                rate: 110,
                delay: 0.85,
                duration: 2.2,
                loop: false,
            });
            heart(fx, {at: [0, 2.5, 0], size: 3, delay: 0.85, duration: 2.2, loop: false, alpha: 0.4});
            embers(fx, {radius: 0.6, rate: 30, speed: [4, 7], delay: 0.9, duration: 2.2, loop: false, life: [1, 1.8]});
            smoke(fx, {
                at: [0, 2.5, 0],
                shape: new SphereEmitter({radius: 1.2}),
                burst: [[3, 18]],
                speed: [0.3, 0.8],
                size: [1.4, 2],
                alpha: 0.5,
                life: [1.6, 2.2],
                loop: false,
            });
            pool(fx, {size: 5, delay: 0.85, duration: 2.2, loop: false, alpha: 0.4});
        },
    },
    {
        id: 'fire/flamethrower',
        name: 'Flamethrower',
        loop: true,
        period: 1.6,
        build(fx) {
            const {scene} = fx;
            const nozzle: [number, number, number] = [-2.6, 1.1, 0];
            fx.prop(shapes.cylinder(scene, 1, 0.12), {
                at: [nozzle[0] - 0.5, nozzle[1], 0],
                rotate: [0, 0, Math.PI / 2],
                color: '#4a4f5a',
            });
            fx.sys({tex: 'glow', life: 0.15, size: [0.3, 0.4], rate: 30, color: '#5a8cff', at: nozzle, order: 5});
            fx.sys({
                tex: 'smoke',
                life: [0.55, 0.7],
                speed: [9, 10],
                size: [0.25, 0.35],
                rot: true,
                rate: 120,
                shape: new ConeEmitter({radius: 0.04, angle: 0.06, thickness: 1}),
                aim: 'right',
                at: nozzle,
                order: 3,
                b: [
                    tint(
                        [
                            ['#cfe0ff', 0],
                            ['#fff3a6', 0.08],
                            ['#ffc23d', 0.3],
                            ['#f2561d', 0.6],
                            ['#4a1712', 1],
                        ],
                        fadeOut(0.55, 0.05)
                    ),
                    grow([0, 0.4], [1, 4]),
                    gravity(-2.5),
                    wobble(2, 0.6),
                    spin([-1, 1]),
                ],
            });
            // Burning drops falling off the stream.
            fx.sys({
                tex: 'dot',
                life: [0.6, 0.9],
                speed: [5, 7],
                size: [0.08, 0.12],
                rate: 14,
                shape: new ConeEmitter({radius: 0.05, angle: 0.15}),
                aim: 'right',
                at: [nozzle[0] + 1, nozzle[1], 0],
                order: 4,
                b: [tint(PALETTE.ember, fadeOut(0.7, 0.02)), gravity(9)],
            });
            smoke(fx, {at: [nozzle[0] + 5, nozzle[1] + 0.4, 0], rate: 8, alpha: 0.35, size: [0.6, 0.9]});
        },
    },
    {
        id: 'fire/meteor',
        name: 'Meteor',
        loop: false,
        period: 5,
        build(fx) {
            const {scene} = fx;
            const fall = 0.9;
            const start: [number, number, number] = [-3.5, 7, 0];
            const rock = fx.node('rock', start);
            const mesh = fx.prop(shapes.ico(scene, 0.35), {parent: rock, color: '#3a2420', glow: '#7a2a0a'});
            fx.every((t) => {
                const k = Math.min(1, t / fall);
                rock.position.set(start[0] * (1 - k), start[1] * (1 - k) + 0.2 * k, 0);
                mesh.setEnabled(t < fall);
                mesh.rotation.z = t * 6;
            });
            fx.sys({
                tex: 'glow',
                life: 0.15,
                size: 1.4,
                rate: 30,
                duration: fall,
                loop: false,
                parent: rock,
                color: '#ffe2a0',
                order: 5,
            });
            fx.sys({
                tex: 'smoke',
                life: [0.3, 0.5],
                speed: [0.2, 0.5],
                size: [0.7, 1],
                rot: true,
                rate: 90,
                duration: fall,
                loop: false,
                world: true,
                shape: new SphereEmitter({radius: 0.3}),
                parent: rock,
                order: 3,
                b: [tint(PALETTE.fire, fadeOut(0.3, 0.05)), grow([0, 1], [1, 0.3])],
            });
            smoke(fx, {
                parent: rock,
                world: true,
                rate: 30,
                duration: fall,
                loop: false,
                life: [0.8, 1.2],
                speed: [0.1, 0.3],
                alpha: 0.4,
                size: [0.4, 0.6],
            });
            flash(fx, {at: [0, 0.5, 0], size: 5, delay: fall});
            shockwave(fx, {size: 8, delay: fall, color: '#ffc06a'});
            flames(fx, {
                puff: true,
                radius: 0.6,
                height: 2.2,
                burst: [[0, 40]],
                size: [1.4, 2],
                speed: [2, 4],
                spread: 0.9,
                delay: fall,
                loop: false,
            });
            debris(fx, {count: 16, delay: fall, color: ['#2a1a16', '#5a2a18']});
            sparks(fx, {
                at: [0, 0.3, 0],
                count: 40,
                delay: fall,
                aim: 'up',
                shape: new ConeEmitter({radius: 0.2, angle: 0.9}),
            });
            decal(fx, {
                tex: 'crack',
                size: 3.4,
                life: 3.6,
                delay: fall,
                blend: 'add',
                color: '#ff7a2a',
                alpha: 1,
                colors: [
                    ['#ffd27a', 0],
                    ['#ff5a1a', 0.3],
                    ['#3a0804', 1],
                ],
            });
            decal(fx, {size: 4, life: 3.8, delay: fall, alpha: 0.7});
            smoke(fx, {
                at: [0, 0.6, 0],
                burst: [[0, 10]],
                delay: fall + 0.2,
                speed: [0.6, 1.4],
                spread: 0.8,
                size: [1.2, 1.6],
                alpha: 0.45,
                loop: false,
            });
        },
    },
    {
        id: 'fire/spirit-flame',
        name: 'Spirit flame',
        loop: true,
        period: 3,
        build(fx) {
            const base: [number, number, number] = [0, 1, 0];
            flames(fx, {at: base, radius: 0.3, height: 1.8, rate: 40, palette: PALETTE.spirit, size: [0.6, 0.9]});
            heart(fx, {at: [0, 1.3, 0], size: 1.8, color: '#4ae0ff', alpha: 0.35});
            embers(fx, {
                at: base,
                rate: 8,
                palette: [
                    ['#e8ffff', 0],
                    ['#4ae0ff', 0.4],
                    ['#2a3a9a', 1],
                ],
                speed: [0.6, 1.4],
            });
            // Wisps peeling off and curling away.
            fx.sys({
                tex: 'smoke',
                life: [1, 1.4],
                speed: [0.5, 1],
                size: [0.4, 0.6],
                rot: true,
                rate: 6,
                color: '#4ae0ff',
                alpha: 0.25,
                shape: new ConeEmitter({radius: 0.3, angle: 0.5}),
                aim: 'up',
                at: [0, 1.8, 0],
                b: [tint([['#ffffff', 0]], fadeOut(0.3, 0.2)), wobble(1, 1), spin([-1, 1]), grow([0, 0.5], [1, 1.6])],
            });
            pool(fx, {size: 2.6, color: '#2bb5d6', alpha: 0.25});
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
