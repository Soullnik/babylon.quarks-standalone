import type {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {CircleEmitter, ConeEmitter, HemisphereEmitter, RenderMode, SphereEmitter} from 'babylon.quarks';
import {
    curve,
    fadeOut,
    flicker,
    floorBounce,
    gravity,
    grow,
    lathe,
    popOut,
    quad,
    spin,
    tint,
    type Aim,
    type SysOptions,
} from './kit';
import {FLAT, GOLD, HOT, SPARK, clods, dust, hotSparks, light, star, wedges, type At} from './parts';
import {PALETTE, decal, shockwave, type Ramp} from './recipes';
import {shapes, type FxDef} from './stage';
import {image} from './textures';

/** pixelfx's impacts category, rebuilt as 3D particle effects (1 px ≈ 0.04 m). */
export const impacts: FxDef[] = [
    {
        id: 'impacts/blunt-hit',
        name: 'Blunt hit',
        loop: false,
        period: 1.4,
        build(fx) {
            // blunt-hit.js in 3D (height 22 px ≈ 0.9 m): a white-hot lumpy blob for a frame, cream and a
            // little bigger for the next, then gone into the dust; a warm pool of light round it and on the
            // floor; nine inked wedges jab out and snap back (to 0.2 s); a squashed ring of dust puffs flung
            // out level, slowing and lifting as they thin, and five billowing up off the top; clods drop,
            // bounce once and settle.
            const at: At = [0, 0.9, 0];
            star(fx, {
                at,
                tex: 'smoke',
                size: 1.5,
                life: 0.08,
                ramp: [
                    ['#ffffff', 0],
                    ['#f6ead2', 0.5],
                    ['#dccab4', 1],
                ],
                grows: [
                    [0, 0.85],
                    [0.4, 1.15],
                    [1, 1.2],
                ],
                order: 6,
            });
            star(fx, {at, tex: 'glow', size: 2.2, life: 0.12, ramp: [['#ffffff', 0]], order: 6});
            light(fx, {at, size: 4, color: '#ffc98a', life: 0.45});
            light(fx, {size: 3, color: '#ffc98a', alpha: 0.3, life: 0.5, floor: true});
            // The wedges: dark ink with cream ones over them, jabbing out round the blob.
            wedges(fx, {at, radius: 0.6, count: 9, size: [0.2, 0.26], color: '#1d1620', time: 0.015});
            wedges(fx, {at, radius: 0.62, count: 9, size: [0.13, 0.18], color: '#f6ead2', time: 0.02, order: 7});
            // The squash ring: level, wider than tall, warm-lit at first.
            dust(fx, {
                at,
                shape: new CircleEmitter({radius: 0.36, thickness: 0}),
                rotate: FLAT,
                burst: [[0.03, 30]],
                speed: [1.6, 5.6],
                size: [0.3, 0.6],
                life: [0.35, 0.85],
                color: '#b7a8a6',
                alpha: 0.65,
                drag: 4.5,
                lift: 0.4,
                warm: true,
            });
            dust(fx, {
                at: [0, 1, 0],
                shape: new ConeEmitter({radius: 0.2, angle: 0.6}),
                aim: 'up',
                burst: [[0.06, 5]],
                speed: [0.8, 1.8],
                size: [0.4, 0.55],
                life: [0.6, 0.85],
                color: '#b7a8a6',
                lift: 0.8,
                warm: true,
            });
            clods(fx, {
                at,
                count: 5,
                delay: 0.05,
                color: ['#5a4848', '#6e5a5a'],
                size: [0.08, 0.14],
                speed: [2.8, 5.6],
                shape: new ConeEmitter({radius: 0.2, angle: 1.2}),
                aim: 'up',
                bounce: 0.28,
            });
        },
    },
    {
        id: 'impacts/bullet-impact',
        name: 'Bullet impact',
        loop: false,
        period: 1.6,
        build(fx) {
            // bullet-impact.js in 3D: a wall on the right, its face looking left. The round hits at
            // 24 px ≈ 1 m: a hot half star and a half ring opening off the wall, sparks sprayed back in a
            // cone, chips that fall and bounce, a puff of grit and a wisp of smoke; the pock mark glows
            // white-hot, cools through the ramp to a dark rim and fades at the very end.
            fx.prop(shapes.box(fx.scene, 0.6, 3, 2), {at: [1.3, 1.5, 0], color: '#3a3644'});
            const at: At = [0.98, 1, 0];
            const face: [number, number, number] = [0, Math.PI / 2, 0];
            star(fx, {at, size: 1, life: 0.12});
            star(fx, {at, tex: 'burst', size: 0.7, life: 0.08, order: 6});
            light(fx, {at, size: 2.4, color: '#ff8a2a', life: 0.3});
            fx.sys({
                tex: 'ring',
                geo: quad(),
                loop: false,
                life: 0.28,
                size: 1,
                burst: 1,
                color: '#ffe26b',
                at: [0.97, 1, 0],
                rotate: face,
                order: 5,
                b: [tint(HOT, popOut(0.2)), grow([0, 0.2], [1, 1.2])],
            });
            hotSparks(fx, {
                at,
                count: 26,
                speed: [4, 9],
                aim: 'left',
                shape: new ConeEmitter({radius: 0.02, angle: 0.7}),
            });
            clods(fx, {
                at,
                mesh: 'cube',
                count: 7,
                size: [0.05, 0.09],
                speed: [1.5, 3],
                aim: 'left',
                color: ['#4a4066', '#5b5079'],
                shape: new ConeEmitter({radius: 0.05, angle: 0.8}),
                bounce: 0.3,
            });
            dust(fx, {
                at,
                aim: 'left',
                shape: new ConeEmitter({radius: 0.05, angle: 0.6}),
                burst: [[0, 6]],
                speed: [0.6, 1.4],
                size: [0.2, 0.35],
                life: [0.5, 0.8],
                color: '#8a8094',
                alpha: 0.55,
            });
            dust(fx, {
                at: [0.9, 1, 0],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.05, angle: 0.3}),
                burst: [[0.12, 3]],
                speed: [0.2, 0.4],
                size: [0.3, 0.4],
                life: [1, 1.3],
                color: '#6a6474',
                alpha: 0.35,
                drag: 1,
                lift: 0.2,
            });
            // The pock mark: a dark crack and hole on the wall, its rim glowing and cooling.
            for (const [tex, blend, size, color, life, order, ramp] of [
                ['crack', 'alpha', 0.7, '#1a1420', 1.5, 1, [['#ffffff', 0]]],
                ['glow', 'alpha', 0.32, '#0c080c', 1.5, 1, [['#ffffff', 0]]],
                ['glow', 'add', 0.3, '#ffffff', 0.9, 2, PALETTE.ember],
            ] as Array<[SysOptions['tex'], 'add' | 'alpha', number, string, number, number, Ramp]>) {
                fx.sys({
                    tex,
                    geo: quad(),
                    blend,
                    loop: false,
                    life,
                    size,
                    burst: 1,
                    color,
                    at: [0.995, 1, 0],
                    rotate: face,
                    order,
                    b: [tint(ramp, fadeOut(0.85, 0.02))],
                });
            }
        },
    },
    {
        id: 'impacts/crit-hit',
        name: 'Critical hit',
        loop: false,
        period: 1.3,
        build(fx) {
            // crit-hit.js in 3D (height 26 px ≈ 1 m): a jagged starburst slams in white, overshoots and
            // settles, then breaks up (0.3 s); a ring swells off it and breaks into flying arcs; a lens
            // flare blooms as the star collapses, a long level streak and a short upright one; sparks
            // sprayed on along the blow, a few kicked back; bright shards tumble to the floor and bounce;
            // embers drift up and glints pop round the ring.
            const at: At = [0, 1.05, 0];
            star(fx, {
                at,
                tex: 'burst',
                size: 1.8,
                life: 0.3,
                rot: 0.2,
                ramp: [
                    ['#ffffff', 0],
                    ['#fff09a', 0.25],
                    ['#ffc23d', 0.55],
                    ['#e0302c', 1],
                ],
                grows: [
                    [0, 0.5],
                    [0.12, 1.35],
                    [0.3, 1],
                    [1, 0.85],
                ],
            });
            light(fx, {at, size: 4.4, color: '#ffc23d', life: 0.4, alpha: 0.7});
            light(fx, {size: 3.4, color: '#ff7a2a', alpha: 0.35, life: 0.5, floor: true});
            // The flare, blooming as the star collapses.
            star(fx, {
                at,
                tex: 'streak',
                size: 5,
                life: 0.35,
                time: 0.06,
                ramp: GOLD,
                grows: [
                    [0, 0.6],
                    [0.3, 1],
                    [1, 1.1],
                ],
            });
            star(fx, {at, tex: 'streak', size: 1.8, life: 0.25, time: 0.06, rot: Math.PI / 2, ramp: GOLD});
            // The ring swells off the star, then breaks into arcs that fly on and cool.
            fx.sys({
                tex: 'ring',
                loop: false,
                life: 0.22,
                size: 2.2,
                burst: [[0.03, 1]],
                at,
                order: 6,
                b: [tint(HOT, popOut(0.4)), grow([0, 0.2], [1, 1])],
            });
            wedges(fx, {
                at,
                radius: 1.05,
                count: 10,
                size: [0.08, 0.12],
                color: '#ffc23d',
                blend: 'add',
                time: 0.12,
                life: [0.18, 0.3],
                reach: 4,
                tex: 'streak',
                fly: -4,
            });
            hotSparks(fx, {
                at,
                count: 30,
                speed: [5, 10],
                aim: 'right',
                rotate: [0, 0, -0.12],
                shape: new ConeEmitter({radius: 0.05, angle: 0.6}),
                palette: PALETTE.fire,
            });
            hotSparks(fx, {
                at,
                count: 6,
                speed: [3, 6],
                aim: 'left',
                shape: new ConeEmitter({radius: 0.05, angle: 0.5}),
            });
            clods(fx, {
                at,
                mesh: 'shard',
                count: 9,
                color: ['#ffc23d', '#fff09a'],
                size: [0.08, 0.14],
                speed: [2, 4.5],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.1, angle: 1.1}),
                life: [0.8, 1.1],
            });
            fx.sys({
                tex: 'dot',
                loop: false,
                life: [0.5, 0.8],
                speed: [0.4, 1],
                size: [0.04, 0.07],
                burst: [[0.1, 14]],
                shape: new SphereEmitter({radius: 0.6}),
                aim: 'up',
                at,
                order: 5,
                b: [tint(SPARK, flicker()), gravity(1.2, [0, 1, 0])],
            });
            fx.sys({
                tex: 'glint',
                loop: false,
                life: 0.25,
                size: [0.22, 0.36],
                burst: [[0.15, 8]],
                shape: new CircleEmitter({radius: 1.15, thickness: 0.2}),
                at,
                color: '#fff09a',
                order: 7,
                b: [tint([['#ffffff', 0]], popOut(0.3))],
            });
        },
    },
    {
        id: 'impacts/ground-slam',
        name: 'Ground slam',
        loop: false,
        period: 3.4,
        view: {height: 1.6, distance: 13},
        build(fx) {
            // ground-slam.js in 3D (reach 104 px ≈ 4 m): the floor flashes, a flat half star hugging it with
            // long rays along it; the dent glows while hot and cracks open with embers caught in them; two
            // crescent shock waves race out along the floor; sparks fly off and skitter; a dust wave rolls
            // out, a tall column shoots up and spreads at the top over a heavy bank at its foot, and fine
            // dust settles out of it; rocks erupt from the dent (three heavy ones barely clear it, the rest
            // thrown high), grit fans out, everything bounces and settles; the dust thins by 3 s.
            star(fx, {at: [0, 0.15, 0], tex: 'streak', size: 6.5, life: 0.25, ramp: HOT});
            star(fx, {at: [0, 0.25, 0], size: 2.2, life: 0.2});
            light(fx, {at: [0, 0.6, 0], size: 6, color: '#ffc764', life: 0.4, alpha: 0.8});
            light(fx, {size: 5, color: '#ffc764', alpha: 0.3, life: 0.4, floor: true});
            decal(fx, {size: 2.2, life: 3, alpha: 0.75, color: '#140c0a'});
            decal(fx, {
                tex: 'glow',
                blend: 'add',
                size: 1.6,
                life: 1.4,
                color: '#ffffff',
                alpha: 0.8,
                colors: PALETTE.ember,
                alphas: fadeOut(0.3, 0.02),
            });
            decal(fx, {tex: 'crack', size: 4.6, life: 3.2, alpha: 0.9, color: '#120c0a', rot: 0.4});
            decal(fx, {
                tex: 'crack',
                blend: 'add',
                size: 4.6,
                life: 1.6,
                rot: 0.4,
                color: '#ffffff',
                alpha: 0.9,
                colors: PALETTE.ember,
                alphas: fadeOut(0.2, 0.05),
            });
            // Embers caught in the cracks, flickering as they cool.
            fx.sys({
                tex: 'dot',
                mode: RenderMode.HorizontalBillBoard,
                loop: false,
                life: [0.8, 1.8],
                size: [0.05, 0.09],
                burst: [[0.05, 26]],
                shape: new CircleEmitter({radius: 1.8, thickness: 1}),
                rotate: FLAT,
                at: [0, 0.03, 0],
                order: 2,
                b: [tint(PALETTE.ember, flicker())],
            });
            shockwave(fx, {size: 8.5, life: 0.6, color: '#ffc764'});
            shockwave(fx, {tex: 'ring', size: 6.5, life: 0.8, color: '#fff0b4', delay: 0.1, alpha: 0.8});
            hotSparks(fx, {
                at: [0, 0.1, 0],
                count: 34,
                speed: [4, 8],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.3, angle: 1.35}),
                palette: PALETTE.fire,
                weight: 12,
            });
            // The dust wave rolling out along the floor.
            dust(fx, {
                at: [0, 0.25, 0],
                shape: new CircleEmitter({radius: 0.6, thickness: 0}),
                rotate: FLAT,
                burst: [[0.04, 36]],
                speed: [3, 6.5],
                size: [0.5, 0.9],
                life: [1.1, 1.7],
                color: ['#7e7488', '#968ca2'],
                drag: 2.5,
                lift: 0.15,
                warm: true,
            });
            // The column: shooting up, slowing, spreading at the top, over a heavy bank at its foot.
            dust(fx, {
                at: [0, 0.3, 0],
                shape: new ConeEmitter({radius: 0.45, angle: 0.22}),
                aim: 'up',
                burst: [[0.05, 34]],
                speed: [2, 5.5],
                size: [1, 1.5],
                life: [1.8, 2.6],
                alpha: 0.75,
                color: ['#958ba2', '#b6acc2'],
                drag: 1.6,
                lift: 0,
                grows: 2,
                warm: true,
            });
            dust(fx, {
                at: [0, 2.6, 0],
                shape: new CircleEmitter({radius: 0.4, thickness: 0}),
                rotate: FLAT,
                burst: [[0.45, 10]],
                speed: [0.8, 1.6],
                size: [1, 1.4],
                life: [1.6, 2.2],
                color: '#9a90a8',
                alpha: 0.5,
                drag: 1.2,
                lift: 0.1,
            });
            dust(fx, {
                at: [0, 0.35, 0],
                shape: new CircleEmitter({radius: 0.8, thickness: 0}),
                rotate: FLAT,
                burst: [[0.1, 12]],
                speed: [0.4, 1],
                size: [1, 1.4],
                life: [1.8, 2.4],
                color: '#6e6478',
                drag: 1,
                lift: 0.1,
            });
            // Fine dust settling out of the cloud while it hangs.
            const settling = fx.sys({
                tex: 'dot',
                blend: 'alpha',
                loop: false,
                life: [1, 1.4],
                speed: [0.1, 0.3],
                size: [0.025, 0.04],
                rate: 30,
                shape: new SphereEmitter({radius: 1.1}),
                aim: 'down',
                at: [0, 2.2, 0],
                color: '#a69cb2',
                order: 3,
                b: [tint([['#ffffff', 0]], fadeOut(0.6, 0.1)), gravity(0.6)],
            });
            settling.emissionOverTime = curve([0, 0], [0.15, 0], [0.2, 30], [0.55, 30], [0.6, 0], [1, 0]);
            clods(fx, {
                at: [0, 0.15, 0],
                count: 3,
                color: ['#3e3558', '#4a3f69'],
                size: [0.26, 0.36],
                speed: [1.8, 2.6],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.4, angle: 0.9}),
                weight: 12,
                life: [2.4, 2.8],
                bounce: 0.2,
            });
            clods(fx, {
                at: [0, 0.15, 0],
                count: 12,
                color: ['#3e3558', '#5b5079'],
                size: [0.1, 0.2],
                speed: [5, 9],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.3, angle: 0.55}),
                weight: 12,
                life: [2.2, 2.8],
            });
            clods(fx, {
                at: [0, 0.05, 0],
                mesh: 'cube',
                count: 22,
                color: ['#3e3558', '#4a3f69'],
                size: [0.035, 0.06],
                speed: [2, 4.5],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.5, angle: 1.3}),
                life: [1.4, 2],
            });
        },
    },
    {
        id: 'impacts/heavy-landing',
        name: 'Heavy landing',
        loop: false,
        period: 2.1,
        build(fx) {
            // heavy-landing.js in 3D: the character drops in and lands at 0.45 s, squashing and recovering;
            // a flat streak of light along the floor for a frame or two; the floor dents and cracks under
            // their feet; two rings of dust roll out one after the other, the first fast with a crisp lit
            // band at its front, the second slower, lumpier and later; a low cloud rises a little at the
            // feet and hangs; pebbles hop away along the floor.
            const land = 0.45;
            const hero = fx.node('hero', [0, 3, 0]);
            fx.character([0, 0, 0], 1.8).parent = hero;
            fx.every((t) => {
                const k = Math.min(1, t / land);
                hero.position.y = 3 * (1 - k * k);
                const squash = t > land && t < land + 0.25 ? 1 - 0.22 * Math.sin(((t - land) / 0.25) * Math.PI) : 1;
                hero.scaling.set(2 - squash, squash, 2 - squash);
            });
            star(fx, {
                at: [0, 0.06, 0.2],
                tex: 'streak',
                size: 3.4,
                life: 0.09,
                time: land,
                ramp: [
                    ['#ffffff', 0],
                    ['#e6e1ee', 1],
                ],
            });
            light(fx, {size: 3, color: '#e6e1ee', alpha: 0.35, life: 0.3, time: land, floor: true});
            decal(fx, {size: 1.6, life: 1.6, delay: land, alpha: 0.7, color: '#0c0a10'});
            decal(fx, {tex: 'crack', size: 2.6, life: 1.6, delay: land, alpha: 0.85, color: '#0c0a0e'});
            shockwave(fx, {size: 4.6, life: 0.45, color: '#bdb6cc', alpha: 0.75, delay: land});
            dust(fx, {
                at: [0, 0.15, 0],
                shape: new CircleEmitter({radius: 0.35, thickness: 0}),
                rotate: FLAT,
                burst: [[0, 20]],
                delay: land,
                speed: [3, 4.2],
                size: [0.35, 0.55],
                life: [0.6, 0.9],
                color: '#b8b0cc',
                alpha: 0.75,
                drag: 3,
                lift: 0.1,
            });
            dust(fx, {
                at: [0, 0.2, 0],
                shape: new CircleEmitter({radius: 0.35, thickness: 0}),
                rotate: FLAT,
                burst: [[0, 16]],
                delay: land + 0.15,
                speed: [1.6, 2.4],
                size: [0.5, 0.8],
                life: [0.8, 1.2],
                color: ['#9088a4', '#b0a8c4'],
                alpha: 0.7,
                drag: 2.5,
                lift: 0.15,
            });
            dust(fx, {
                at: [0, 0.2, 0.2],
                shape: new CircleEmitter({radius: 0.3, thickness: 0}),
                rotate: FLAT,
                burst: [[0, 6]],
                delay: land,
                speed: [0.2, 0.5],
                size: [0.7, 1],
                life: [1, 1.3],
                color: '#6b6280',
                alpha: 0.5,
                drag: 2,
                lift: 0.3,
            });
            clods(fx, {
                at: [0, 0.08, 0],
                count: 10,
                delay: land,
                color: ['#3e3558', '#4a3f69'],
                size: [0.05, 0.1],
                speed: [1.5, 3],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.4, angle: 1.3}),
                bounce: 0.45,
            });
        },
    },
    {
        id: 'impacts/hit-flash',
        name: 'Hit flash',
        loop: false,
        period: 1,
        build(fx) {
            // hit-flash.js in 3D, by its beats at 30 fps: two frames of white, two of red, a white rim, then
            // red cooling off by 0.5 s; comic hit lines, white with red edges, jab in at the body from the
            // top and sides; a small hot burst on the side the blow came from.
            const body = fx.character([0, 0, 0], 1.8, '#3a3d4c');
            // Its own material, so the flush colours this body only.
            const material = (body.material as StandardMaterial).clone('hit-flash-body');
            body.material = material;
            fx.every((t) => {
                const f = t * 30;
                const white = f < 2 ? 1 : f >= 4 && f < 5 ? 0.6 : 0;
                const red = f < 2 ? 0 : Math.max(0, 1 - (t - 0.067) / 0.45);
                material.emissiveColor.set(white + red * 0.83, white + red * 0.16, white + red * 0.19);
            });
            const at: At = [0, 1.05, 0];
            // Wedges round the top and sides, red edges under white cores.
            const arc = Math.PI * 1.25;
            const turn = -Math.PI * 0.125;
            wedges(fx, {
                at,
                radius: 0.8,
                count: 7,
                size: [0.2, 0.26],
                color: '#d42a30',
                arc,
                turn,
                reach: 3,
                time: 0.03,
            });
            wedges(fx, {
                at,
                radius: 1.38,
                count: 7,
                size: [0.12, 0.16],
                color: '#ffffff',
                arc,
                turn,
                reach: 2.6,
                time: 0.035,
                order: 7,
            });
            star(fx, {
                at: [0.42, 1.25, 0.1],
                size: 0.9,
                life: 0.12,
                ramp: [
                    ['#ffffff', 0],
                    ['#ff9a8a', 1],
                ],
            });
            light(fx, {at: [0.42, 1.25, 0.1], size: 1.8, color: '#ff5a50', life: 0.2});
        },
    },
    {
        id: 'impacts/hit-spark',
        name: 'Hit spark',
        loop: false,
        period: 0.9,
        build(fx) {
            // hit-spark.js in 3D (height 20 px ≈ 0.8 m): a sharp, lopsided cross round a white diamond: a long
            // thin ray on along the blow, a stub behind, two unequal arms across, reaching further and
            // thinning; only the long ray lingers; then a cone of sparks sprayed on along the blow that fall
            // and bounce, and hot chips that tick off the floor.
            const at: At = [0, 0.8, 0];
            const lean = -0.1;
            star(fx, {
                at: [0.55, 0.8 - 0.055, 0],
                tex: 'streak',
                size: 2.6,
                life: 0.22,
                rot: lean,
                grows: [
                    [0, 0.7],
                    [0.3, 1],
                    [1, 1.15],
                ],
            });
            star(fx, {at: [0, 0.86, 0], tex: 'streak', size: 1.1, life: 0.1, rot: Math.PI / 2 + lean});
            star(fx, {at: [0, 0.72, 0], tex: 'streak', size: 0.7, life: 0.08, rot: Math.PI / 2 + lean});
            star(fx, {at, tex: 'shard', size: 0.42, life: 0.12, rot: Math.PI / 2, ramp: [['#ffffff', 0]], order: 8});
            light(fx, {at, size: 1.8, color: '#ffe26b', life: 0.15});
            hotSparks(fx, {
                at,
                count: 22,
                speed: [4, 8],
                aim: 'right',
                rotate: [0, 0, lean],
                shape: new ConeEmitter({radius: 0.02, angle: 0.5}),
                time: 0.03,
            });
            fx.sys({
                tex: 'square',
                world: true,
                loop: false,
                life: [0.4, 0.6],
                speed: [1.5, 3],
                size: [0.04, 0.06],
                rot: true,
                burst: [[0.03, 6]],
                shape: new ConeEmitter({radius: 0.02, angle: 0.8}),
                aim: 'right',
                at,
                order: 4,
                b: [tint(SPARK, popOut(0.6)), gravity(10), floorBounce(0.4), spin([-12, 12])],
            });
        },
    },
    {
        id: 'impacts/impact-frame',
        name: 'Impact frame',
        loop: false,
        period: 0.9,
        build(fx) {
            // impact-frame.js in 3D: two frames of white paper with black burst lines rushing at the hit and
            // the character inked black, two frames inverted (black, white lines, the character white), then
            // the lines pull out past the edges and vanish (0.3 s). A jagged star at the hit.
            const at: At = [0, 1.2, 0];
            const body = fx.character([0.4, 0, 0], 1.8);
            const material = (body.material as StandardMaterial).clone('impact-frame-body');
            body.material = material;
            const base = material.diffuseColor.clone();
            fx.every((t) => {
                const f = t * 30;
                const lit = f >= 2 && f < 4 ? 1 : 0;
                material.emissiveColor.set(lit, lit, lit);
                if (f < 2) material.diffuseColor.set(0, 0, 0);
                else material.diffuseColor.copyFrom(base);
            });
            const frame = 1 / 30;
            for (const [time, color] of [
                [0, '#ffffff'],
                [2 * frame, '#000000'],
            ] as Array<[number, string]>) {
                fx.sys({
                    tex: 'square',
                    blend: 'alpha',
                    loop: false,
                    life: 2 * frame + 0.004,
                    size: 16,
                    burst: [[time + 0.001, 1]],
                    color,
                    at: [0, 1.2, -1.2],
                    order: 0,
                });
            }
            // Burst lines rushing in: ink on paper, then paper on ink.
            for (const [time, color] of [
                [0, '#000000'],
                [2 * frame, '#ffffff'],
            ] as Array<[number, string]>) {
                fx.sys({
                    tex: 'wedge',
                    mode: RenderMode.StretchedBillBoard,
                    stretch: {speed: 0.08, length: 6},
                    blend: 'alpha',
                    loop: false,
                    life: 2 * frame + 0.004,
                    speed: -8,
                    size: [0.12, 0.3],
                    burst: [[time + 0.001, 56]],
                    color,
                    shape: new CircleEmitter({radius: 4.2, thickness: 0.35}),
                    at,
                    order: 1,
                });
            }
            // Then paper lines pulling out over the scene and gone.
            fx.sys({
                tex: 'streak',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.12, length: 5},
                blend: 'alpha',
                loop: false,
                life: 4 * frame,
                speed: 26,
                size: [0.08, 0.22],
                burst: [[4 * frame, 48]],
                color: '#ffffff',
                shape: new CircleEmitter({radius: 2.4, thickness: 0.4}),
                at,
                order: 8,
                b: [tint([['#ffffff', 0]], fadeOut(0.6, 0))],
            });
            star(fx, {at, tex: 'burst', size: 0.9, life: 2 * frame + 0.004, ramp: [['#000000', 0]], order: 2});
            fx.sys({
                tex: 'burst',
                blend: 'alpha',
                loop: false,
                life: 2 * frame + 0.004,
                size: 0.9,
                rot: 0.5,
                burst: [[2 * frame + 0.001, 1]],
                at,
                order: 2,
            });
        },
    },
    {
        id: 'impacts/parry',
        name: 'Parry',
        loop: false,
        period: 1.3,
        build(fx) {
            // parry.js in 3D (height 30 px ≈ 1.2 m): two blades clash, their edges flashing in an X; a hard
            // four-point star rings out white, grows and turns gold as it thins, then is just a glint; a ring
            // breaks into arcs that fly on and cool; a fan of gold sparks sprays up and out to both sides,
            // arcs over and rains down to bounce on the floor.
            const at: At = [0, 1.2, 0];
            for (const side of [-1, 1]) {
                const blade = fx.prop(shapes.box(fx.scene, 0.06, 1.6, 0.16), {
                    at: [side * 0.5, 1.2 + 0.25, 0],
                    rotate: [0, 0, side * 0.75],
                    color: '#c8ccd8',
                });
                fx.every((t) => blade.setEnabled(t < 0.45));
            }
            for (const side of [-1, 1]) {
                star(fx, {
                    at,
                    tex: 'streak',
                    size: 2.2,
                    life: 0.14,
                    rot: Math.PI / 2 + side * 0.82,
                    ramp: GOLD,
                    order: 6,
                });
            }
            star(fx, {
                at,
                size: 1.8,
                life: 0.35,
                ramp: GOLD,
                grows: [
                    [0, 0.6],
                    [0.2, 1],
                    [1, 1.35],
                ],
            });
            star(fx, {
                at,
                size: 0.45,
                life: 0.5,
                time: 0.25,
                ramp: [
                    ['#ffffff', 0],
                    ['#ffe066', 1],
                ],
            });
            light(fx, {at, size: 3.4, color: '#ffe066', life: 0.35});
            fx.sys({
                tex: 'ring',
                loop: false,
                life: 0.25,
                size: 2.2,
                burst: [[0.04, 1]],
                at,
                color: '#ffe066',
                order: 6,
                b: [tint(GOLD, popOut(0.4)), grow([0, 0.15], [1, 1])],
            });
            wedges(fx, {
                at,
                radius: 1.05,
                count: 8,
                size: [0.07, 0.1],
                color: '#ffe066',
                blend: 'add',
                time: 0.12,
                life: [0.18, 0.28],
                reach: 4,
                tex: 'streak',
                fly: -4,
            });
            hotSparks(fx, {
                at,
                count: 44,
                speed: [3, 6.5],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.05, angle: 1.05}),
                palette: GOLD,
                weight: 7,
                life: [0.7, 1.1],
                streak: 0.35,
            });
        },
    },
    {
        id: 'impacts/ricochet',
        name: 'Ricochet',
        loop: false,
        period: 1.5,
        build(fx) {
            // ricochet.js in 3D: a tracer streaks down onto the floor (0.13 s), glances off with a white-hot
            // star leaning hard along the way out and skips away at a shallow angle; a thin half ring hugs
            // the floor, swelling and cooling; a glowing skid where the round dragged, cooling from its far
            // end; sparks skitter on along the floor, skipping, a few spray higher; grit and a scuff of dust.
            const hit = 0.13;
            const ground: At = [-0.4, 0.04, 0];
            const slug = fx.node('slug', [-3, 1.6, 0]);
            fx.every((t) => {
                if (t < hit) {
                    const k = t / hit;
                    slug.position.set(-3 + 2.6 * k, 1.6 - 1.56 * k, 0);
                } else {
                    const k = (t - hit) / 0.35;
                    slug.position.set(-0.4 + 4.6 * k, 0.04 + 0.9 * k, 0.3 * k);
                }
            });
            // The tracer: a white head over a hot body cooling to a dim tail.
            fx.sys({
                tex: 'glow',
                life: 0.05,
                size: 0.35,
                rate: 60,
                duration: hit + 0.35,
                loop: false,
                parent: slug,
                color: '#ffffff',
                order: 7,
            });
            fx.sys({
                tex: 'dot',
                life: 0.1,
                size: [0.07, 0.1],
                rateOverDistance: 40,
                duration: hit + 0.35,
                loop: false,
                world: true,
                parent: slug,
                order: 6,
                b: [tint(HOT, fadeOut(0.1, 0)), grow([0, 1], [1, 0.4])],
            });
            star(fx, {at: [ground[0], 0.12, 0], tex: 'streak', size: 1.8, life: 0.18, time: hit, rot: 0.2});
            star(fx, {at: [ground[0], 0.12, 0], size: 0.9, life: 0.14, time: hit});
            light(fx, {at: [ground[0], 0.3, 0], size: 2.2, color: '#ff8a2a', life: 0.3, time: hit});
            shockwave(fx, {at: ground, tex: 'ring', size: 1.6, life: 0.4, color: '#ffe26b', delay: hit});
            // The skid: a gouge along the floor that glows where the round dragged.
            fx.sys({
                tex: 'streak',
                mode: RenderMode.HorizontalBillBoard,
                loop: false,
                life: 0.9,
                size: 1.3,
                burst: [[hit, 1]],
                color: '#ff8a2a',
                at: [ground[0] + 0.5, 0.02, 0],
                order: 1,
                b: [tint(PALETTE.ember, fadeOut(0.35, 0.02))],
            });
            decal(fx, {tex: 'streak', size: 1.4, life: 1.2, delay: hit, alpha: 0.7, at: [ground[0] + 0.5, 0.015, 0]});
            hotSparks(fx, {
                at: ground,
                count: 24,
                time: hit,
                speed: [3, 6],
                aim: 'right',
                rotate: [0, 0, 0.3],
                shape: new ConeEmitter({radius: 0.05, angle: 0.35}),
                life: [0.4, 0.8],
            });
            hotSparks(fx, {
                at: ground,
                count: 6,
                time: hit,
                speed: [3, 5],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.05, angle: 0.6}),
            });
            dust(fx, {
                at: ground,
                aim: 'right',
                rotate: [0, 0, 0.5],
                shape: new ConeEmitter({radius: 0.05, angle: 0.5}),
                burst: [[hit, 5]],
                speed: [0.6, 1.4],
                size: [0.2, 0.32],
                life: [0.5, 0.8],
                color: '#7a7088',
                alpha: 0.5,
            });
        },
    },
    {
        id: 'impacts/shield-block',
        name: 'Shield block',
        loop: false,
        period: 1.5,
        build(fx) {
            // shield-block.js in 3D: a half dome of energy stands in front of the character, turned toward
            // the blow (and the camera). The blow lands at 0 s: a hot star and sparks glancing off; the
            // diamond lattice flashes and a ripple runs out over it from the hit; from 0.5 s it blinks out
            // cell by cell, little motes of light lifting off.
            fx.character([-0.5, 0, 0], 1.8);
            const shield = fx.node('shield', [-0.25, 0, 0]);
            shield.rotation.y = -0.7;
            shield.scaling.set(1.1, 1.8, 1.4);
            const profile: Array<[number, number]> = [];
            for (let i = 0; i <= 14; i++) {
                const lat = (i / 14) * (Math.PI / 2);
                profile.push([Math.max(0.001, Math.cos(lat)), Math.sin(lat)]);
            }
            const shell = {
                image: 'diamond-shell',
                geo: lathe(profile, 32, Math.PI, -Math.PI / 2),
                blend: 'add',
                size: 1,
                burst: 1,
                loop: false,
                parent: shield,
            } as const;
            const erosion = (edge: [number, number, number]) => ({
                mask: image(fx.scene, 'diamond-cells').texture,
                softness: 0.02,
                edgeWidth: 0.08,
                edgeColor: edge,
            });
            // The shell, its far side seen through it, then its face: whole until 0.5 s, then cells go.
            const blinkOut = tint(
                [['#ffffff', 0]],
                [
                    [1, 0],
                    [1, 0.5],
                    [0, 0.95],
                    [0, 1],
                ]
            );
            fx.sys({
                ...shell,
                life: 1,
                alpha: 0.6,
                order: 1,
                look: {renderFace: 'back', scalingMode: 'hierarchy', erosion: erosion([0.4, 0.9, 1.2])},
                b: [blinkOut],
            });
            fx.sys({
                ...shell,
                life: 1,
                order: 4,
                look: {
                    renderFace: 'front',
                    scalingMode: 'hierarchy',
                    rim: {color: [0.65, 0.93, 1], power: 2, strength: 0.6, mode: 'add'},
                    erosion: erosion([0.9, 1.6, 2]),
                },
                b: [blinkOut],
            });
            // The flash: the lattice white for a moment.
            fx.sys({
                ...shell,
                life: 0.3,
                color: '#ffffff',
                order: 5,
                look: {renderFace: 'front', scalingMode: 'hierarchy'},
                b: [tint([['#ffffff', 0]], popOut(0.1))],
            });
            // The ripple: a band of light running out over the shell from the hit, read off a radial mask.
            fx.sys({
                ...shell,
                image: 'diamond-shell',
                life: 0.5,
                color: '#000000',
                order: 6,
                look: {
                    renderFace: 'front',
                    scalingMode: 'hierarchy',
                    erosion: {
                        mask: image(fx.scene, 'radial').texture,
                        softness: 0.03,
                        edgeWidth: 0.12,
                        edgeColor: [1, 1.8, 2.2],
                    },
                },
                b: [
                    tint(
                        [['#000000', 0]],
                        [
                            [0, 0],
                            [1, 1],
                        ]
                    ),
                ],
            });
            // Where the blow lands: the front of the dome at half height, in the world.
            const hit: At = [-0.25 + 0.78 * Math.cos(0.7), 1.27, 0.78 * Math.sin(0.7)];
            star(fx, {at: hit, size: 1.1, life: 0.14, order: 8});
            light(fx, {at: hit, size: 2.6, color: '#ffe26b', life: 0.25});
            hotSparks(fx, {
                at: hit,
                count: 16,
                speed: [3, 7],
                shape: new HemisphereEmitter({radius: 0.05}),
                aim: 'up' as Aim,
                rotate: [0, 0, -0.7],
                time: 0.01,
            });
            // The blow coming in.
            fx.sys({
                tex: 'streak',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.06, length: 1},
                loop: false,
                life: 0.1,
                speed: -18,
                size: 0.16,
                burst: 1,
                at: [hit[0] + 1.8 * Math.cos(0.7), hit[1] + 0.2, hit[2] + 1.8 * Math.sin(0.7)],
                rotate: [0, -0.7, 0],
                aim: 'right',
                order: 4,
                b: [tint([['#ffffff', 0]], popOut(0.3))],
            });
            // As the cells blink out, motes of light lift off.
            const motes = fx.sys({
                tex: 'dot',
                loop: false,
                life: [0.4, 0.7],
                speed: [0.2, 0.5],
                size: [0.04, 0.07],
                rate: 45,
                shape: new HemisphereEmitter({radius: 1, thickness: 0}),
                aim: 'up',
                parent: shield,
                color: '#a6ecff',
                order: 6,
                b: [tint([['#ffffff', 0]], flicker()), gravity(0.8, [0, 1, 0])],
            });
            motes.emissionOverTime = curve([0, 0], [0.33, 0], [0.35, 45], [0.62, 45], [0.64, 0], [1, 0]);
        },
    },
];
