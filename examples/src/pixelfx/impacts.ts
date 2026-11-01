import type {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {CircleEmitter, ConeEmitter, RenderMode, SphereEmitter} from 'babylon.quarks';
import {drag, fadeOut, flicker, grow, popOut, spin, tint} from './kit';
import {PALETTE, debris, decal, flash, shockwave, smoke, sparks, type Ramp} from './recipes';
import {shapes, type FxBuilder, type FxDef} from './stage';

const HOT: Ramp = [
    ['#ffffff', 0],
    ['#fff3c0', 0.3],
    ['#ffb84a', 1],
];
const DUST: [string, string] = ['#7a6a5c', '#9a8a78'];

/** A ring of dust rolling out along the floor. */
function dustRing(
    fx: FxBuilder,
    o: {delay?: number; radius?: number; speed?: [number, number]; count?: number; size?: [number, number]}
) {
    return smoke(fx, {
        shape: new CircleEmitter({radius: o.radius ?? 0.4, thickness: 0}),
        aim: 'up',
        burst: [[0, o.count ?? 18]],
        delay: o.delay,
        speed: o.speed ?? [3, 4],
        size: o.size ?? [0.5, 0.8],
        life: [0.8, 1.2],
        color: DUST,
        alpha: 0.55,
        loop: false,
    });
}

/** Comic hit lines: streaks rushing in at a point (or out from it, with `out`). */
function hitLines(
    fx: FxBuilder,
    o: {
        at: [number, number, number];
        count?: number;
        delay?: number;
        color?: string;
        out?: boolean;
        blend?: 'add' | 'alpha';
        radius?: number;
    }
) {
    const radius = o.radius ?? 2;
    return fx.sys({
        tex: 'streak',
        mode: RenderMode.StretchedBillBoard,
        stretch: {speed: 0.1, length: 1.5},
        blend: o.blend,
        life: 0.18,
        speed: o.out ? 10 : -radius / 0.18,
        size: [0.08, 0.14],
        burst: [[0, o.count ?? 12]],
        delay: o.delay,
        color: o.color ?? '#ffffff',
        shape: new SphereEmitter({radius: o.out ? 0.3 : radius, thickness: 0}),
        at: o.at,
        order: 6,
        b: [tint([['#ffffff', 0]], popOut(0.4))],
    });
}

/** pixelfx's impacts category, rebuilt as 3D particle effects. */
export const impacts: FxDef[] = [
    {
        id: 'impacts/blunt-hit',
        name: 'Blunt hit',
        loop: false,
        period: 1.6,
        build(fx) {
            const at: [number, number, number] = [0, 1.2, 0];
            fx.sys({
                tex: 'smoke',
                life: 0.45,
                size: [1.4, 1.8],
                rot: true,
                burst: [[0, 3]],
                at,
                order: 4,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            ['#fff0c8', 0.3],
                            ['#ffd28a', 1],
                        ],
                        popOut(0.3)
                    ),
                    grow([0, 0.6], [0.2, 1.1], [1, 0.8]),
                ],
            });
            fx.sys({
                tex: 'glow',
                life: 0.4,
                size: 3,
                burst: 1,
                color: '#ffb84a',
                alpha: 0.5,
                at,
                order: 2,
                b: [tint([['#ffffff', 0]], popOut(0.2))],
            });
            hitLines(fx, {at, out: true, blend: 'alpha', color: '#1a1420', count: 8});
            smoke(fx, {
                at,
                shape: new CircleEmitter({radius: 0.3, thickness: 0}),
                burst: [[0, 10]],
                speed: [1.5, 2.2],
                size: [0.4, 0.6],
                life: [0.7, 1],
                color: DUST,
                alpha: 0.5,
                loop: false,
                aim: 'up',
            });
            debris(fx, {
                at,
                count: 6,
                size: [0.08, 0.14],
                speed: [2, 3.5],
                color: ['#4a3a30', '#6a5040'],
                shape: new SphereEmitter({radius: 0.2}),
            });
        },
    },
    {
        id: 'impacts/bullet-impact',
        name: 'Bullet impact',
        loop: false,
        period: 1.6,
        build(fx) {
            fx.prop(shapes.box(fx.scene, 0.6, 3, 2), {at: [1.3, 1.5, 0], color: '#3a3644'});
            const at: [number, number, number] = [0.98, 1.4, 0];
            fx.sys({
                tex: 'glint',
                life: 0.12,
                size: 1.2,
                burst: 1,
                rot: [0, 0.8],
                at,
                order: 6,
                b: [tint(HOT, popOut(0.2))],
            });
            sparks(fx, {
                at,
                count: 24,
                aim: 'left',
                shape: new ConeEmitter({radius: 0.02, angle: 0.6}),
                speed: [4, 8],
                gravity: 6,
                palette: HOT,
            });
            smoke(fx, {
                at,
                aim: 'left',
                burst: [[0, 6]],
                speed: [0.8, 1.6],
                size: [0.25, 0.4],
                life: [0.6, 0.9],
                color: '#8a8090',
                alpha: 0.5,
                loop: false,
            });
            debris(fx, {
                at,
                mesh: 'cube',
                count: 6,
                size: [0.05, 0.09],
                speed: [2, 3],
                aim: 'left',
                color: ['#4a4656', '#5a5666'],
                shape: new ConeEmitter({radius: 0.05, angle: 0.7}),
            });
            // The pock mark on the wall, glowing hot and cooling to soot.
            fx.sys({
                tex: 'glow',
                blend: 'alpha',
                life: 1.4,
                size: 0.35,
                burst: 1,
                color: '#100c10',
                alpha: 0.9,
                at: [0.99, 1.4, 0],
                order: 1,
                b: [tint([['#ffffff', 0]], fadeOut(0.8, 0.02))],
            });
            fx.sys({
                tex: 'glow',
                life: 0.8,
                size: 0.25,
                burst: 1,
                color: '#ff8a2a',
                at: [0.97, 1.4, 0],
                order: 2,
                b: [tint(PALETTE.ember, popOut(0.1))],
            });
        },
    },
    {
        id: 'impacts/crit-hit',
        name: 'Critical hit',
        loop: false,
        period: 1.8,
        build(fx) {
            const at: [number, number, number] = [0, 1.4, 0];
            fx.sys({
                tex: 'burst',
                life: 0.5,
                size: 3,
                rot: [0, 0.4],
                burst: 1,
                at,
                order: 5,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            ['#ffe08a', 0.3],
                            ['#ff8a2a', 1],
                        ],
                        popOut(0.4)
                    ),
                    grow([0, 0.2], [0.15, 1.3], [0.3, 1], [1, 0.9]),
                ],
            });
            fx.sys({
                tex: 'glow',
                life: 0.35,
                size: 4.5,
                burst: 1,
                color: '#ffd27a',
                alpha: 0.6,
                at,
                order: 2,
                b: [tint([['#ffffff', 0]], popOut(0.2))],
            });
            fx.sys({
                tex: 'ring',
                life: 0.3,
                size: 3,
                burst: 1,
                at,
                color: '#fff3c0',
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.3], [1, 1.2])],
            });
            // The ring breaking into flying arcs.
            fx.sys({
                tex: 'streak',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.06, length: 1},
                life: 0.35,
                speed: [6, 8],
                size: [0.15, 0.2],
                burst: [[0.05, 10]],
                color: '#fff3c0',
                shape: new SphereEmitter({radius: 0.8, thickness: 0}),
                at,
                order: 5,
                b: [tint([['#ffffff', 0]], popOut(0.4)), drag([0, 1], [1, 0.3])],
            });
            sparks(fx, {at, count: 30, speed: [6, 11], palette: HOT});
            debris(fx, {
                at,
                mesh: 'shard',
                count: 8,
                size: [0.12, 0.22],
                speed: [3, 5],
                color: ['#ffd27a', '#ffffff'],
                shape: new SphereEmitter({radius: 0.3}),
            });
        },
    },
    {
        id: 'impacts/ground-slam',
        name: 'Ground slam',
        loop: false,
        period: 3.2,
        build(fx) {
            flash(fx, {at: [0, 0.2, 0], size: 3.5, color: '#fff3c0'});
            decal(fx, {tex: 'crack', size: 4, life: 2.8, alpha: 0.9, color: '#0c0a0e'});
            decal(fx, {tex: 'crack', blend: 'add', size: 4, life: 0.6, alpha: 1, color: '#ffd27a'});
            shockwave(fx, {size: 7, life: 0.45, color: '#fff3c0'});
            shockwave(fx, {size: 7.5, life: 0.6, delay: 0.15, color: '#d8c8a8', alpha: 0.7});
            dustRing(fx, {count: 24, speed: [3.5, 4.5], size: [0.7, 1]});
            smoke(fx, {
                at: [0, 0.4, 0],
                burst: [[0, 14]],
                speed: [1.5, 3],
                spread: 0.35,
                size: [1, 1.5],
                life: [1.6, 2.2],
                color: DUST,
                alpha: 0.55,
                loop: false,
            });
            debris(fx, {count: 14, speed: [4, 7], size: [0.18, 0.35], color: ['#3a3236', '#5e5152']});
        },
    },
    {
        id: 'impacts/heavy-landing',
        name: 'Heavy landing',
        loop: false,
        period: 2.2,
        build(fx) {
            const land = 0.45;
            const hero = fx.node('hero', [0, 3, 0]);
            fx.character([0, 0, 0], 1.8).parent = hero;
            fx.every((t) => {
                const k = Math.min(1, t / land);
                hero.position.y = 3 * (1 - k * k);
                // Squash on landing, then recover.
                const squash = t > land && t < land + 0.25 ? 1 - 0.25 * Math.sin(((t - land) / 0.25) * Math.PI) : 1;
                hero.scaling.set(2 - squash, squash, 2 - squash);
            });
            decal(fx, {tex: 'crack', size: 2.4, life: 1.4, delay: land, alpha: 0.85, color: '#0c0a0e'});
            dustRing(fx, {delay: land, count: 18, speed: [2.5, 3.2]});
            dustRing(fx, {delay: land + 0.18, count: 14, speed: [1.6, 2.2], size: [0.4, 0.6]});
            debris(fx, {
                delay: land,
                count: 10,
                size: [0.07, 0.13],
                speed: [2, 3.5],
                shape: new CircleEmitter({radius: 0.5, thickness: 0}),
            });
        },
    },
    {
        id: 'impacts/hit-flash',
        name: 'Hit flash',
        loop: false,
        period: 1.2,
        build(fx) {
            const body = fx.character([0, 0, 0], 1.8, '#3a3d4c');
            // Its own material, so the flush colours this body only.
            const material = (body.material as StandardMaterial).clone('hit-flash-body');
            body.material = material;
            fx.every((t) => {
                // A white frame, then red with white blinks, cooling off.
                const white = t < 0.06 || (t > 0.16 && t < 0.2) || (t > 0.3 && t < 0.33) ? 1 : 0;
                const red = Math.max(0, 1 - t / 0.6);
                material.emissiveColor.set(white + red * 0.9, white + red * 0.1, white + red * 0.1);
            });
            hitLines(fx, {at: [0, 1.1, 0], count: 10, radius: 2.2});
        },
    },
    {
        id: 'impacts/hit-spark',
        name: 'Hit spark',
        loop: false,
        period: 1,
        build(fx) {
            const at: [number, number, number] = [0, 1.3, 0];
            // A lopsided cross flare: one long ray along the blow.
            fx.sys({
                tex: 'streak',
                life: 0.18,
                size: 3.2,
                burst: 1,
                rot: 0.25,
                at,
                order: 5,
                b: [tint(HOT, popOut(0.2))],
            });
            fx.sys({
                tex: 'streak',
                life: 0.1,
                size: 1.4,
                burst: 1,
                rot: 0.25 + Math.PI / 2,
                at,
                order: 5,
                b: [tint(HOT, popOut(0.2))],
            });
            fx.sys({
                tex: 'shard',
                life: 0.12,
                size: 0.6,
                burst: 1,
                rot: Math.PI / 4,
                at,
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.3))],
            });
            sparks(fx, {
                at,
                count: 24,
                size: [0.07, 0.12],
                aim: 'right',
                shape: new ConeEmitter({radius: 0.02, angle: 0.7}),
                speed: [4, 7],
                palette: HOT,
            });
            debris(fx, {
                at,
                mesh: 'cube',
                count: 4,
                size: [0.05, 0.08],
                speed: [2, 3],
                aim: 'right',
                color: ['#ffb84a', '#ff8a2a'],
            });
        },
    },
    {
        id: 'impacts/impact-frame',
        name: 'Impact frame',
        loop: false,
        period: 1,
        build(fx) {
            const at: [number, number, number] = [0, 1.4, 0];
            fx.character([0.4, 0, 0], 1.8);
            // White frames, then black burst lines rushing at the hit, then pulling out.
            fx.sys({
                tex: 'glow',
                life: 0.12,
                size: 9,
                burst: 1,
                at,
                order: 1,
                b: [tint([['#ffffff', 0]], popOut(0.6))],
            });
            hitLines(fx, {at, count: 24, blend: 'alpha', color: '#000000', radius: 3.2});
            hitLines(fx, {at, count: 24, blend: 'alpha', color: '#000000', out: true, delay: 0.18});
            fx.sys({
                tex: 'glint',
                life: 0.15,
                size: 1.6,
                burst: [[0.1, 1]],
                at,
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.4))],
            });
        },
    },
    {
        id: 'impacts/parry',
        name: 'Parry',
        loop: false,
        period: 1.4,
        build(fx) {
            const at: [number, number, number] = [0, 1.6, 0];
            for (const side of [-1, 1]) {
                const blade = fx.prop(shapes.box(fx.scene, 0.06, 1.8, 0.16), {
                    at: [side * 0.55, 1.6, 0],
                    rotate: [0, 0, side * 0.7],
                    color: '#c8ccd8',
                });
                fx.every((t) => blade.setEnabled(t < 0.5));
            }
            fx.sys({
                tex: 'streak',
                life: 0.15,
                size: 2.4,
                burst: 1,
                rot: 0.85,
                at,
                order: 5,
                b: [tint(HOT, popOut(0.2))],
            });
            fx.sys({
                tex: 'streak',
                life: 0.15,
                size: 2.4,
                burst: 1,
                rot: -0.85,
                at,
                order: 5,
                b: [tint(HOT, popOut(0.2))],
            });
            fx.sys({
                tex: 'glint',
                life: 0.3,
                size: 1.8,
                burst: 1,
                at,
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.3)), spin(2)],
            });
            fx.sys({
                tex: 'ring',
                life: 0.3,
                size: 2.4,
                burst: 1,
                at,
                color: '#fff3c0',
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.2], [1, 1])],
            });
            // A fan of gold sparks spraying up and raining down.
            sparks(fx, {
                at,
                count: 30,
                aim: 'up',
                shape: new ConeEmitter({radius: 0.05, angle: 0.7}),
                speed: [4, 7],
                gravity: 9,
                life: [0.8, 1.1],
                palette: [
                    ['#ffffff', 0],
                    ['#ffe08a', 0.3],
                    ['#ffb03a', 1],
                ],
            });
        },
    },
    {
        id: 'impacts/ricochet',
        name: 'Ricochet',
        loop: false,
        period: 1.6,
        build(fx) {
            const hit = 0.25;
            const slug = fx.node('slug', [-3, 2.5, 0]);
            fx.every((t) => {
                if (t < hit) {
                    const k = t / hit;
                    slug.position.set(-3 + 2.8 * k, 2.5 - 2.45 * k, 0);
                } else {
                    const k = (t - hit) / 0.3;
                    slug.position.set(-0.2 + 3.2 * k, 0.05 + 1.4 * k, -0.6 * k);
                }
            });
            fx.sys({
                tex: 'dot',
                life: 0.12,
                size: [0.1, 0.14],
                rateOverDistance: 30,
                duration: hit + 0.3,
                loop: false,
                world: true,
                parent: slug,
                color: '#fff3c0',
                order: 5,
                b: [tint(HOT, popOut(0.1))],
            });
            fx.sys({
                tex: 'glint',
                life: 0.15,
                size: 1.4,
                burst: [[hit, 1]],
                at: [-0.2, 0.1, 0],
                order: 6,
                b: [tint(HOT, popOut(0.2))],
            });
            // A glowing skid on the floor.
            fx.sys({
                tex: 'streak',
                mode: RenderMode.HorizontalBillBoard,
                blend: 'add',
                life: 0.8,
                size: 1.2,
                burst: [[hit, 1]],
                color: '#ff8a2a',
                at: [0.2, 0.02, 0],
                order: 1,
                b: [tint(PALETTE.ember, popOut(0.3))],
            });
            sparks(fx, {
                at: [-0.2, 0.05, 0],
                count: 18,
                delay: hit,
                aim: 'right',
                shape: new ConeEmitter({radius: 0.05, angle: 0.4}),
                speed: [3, 6],
                gravity: 4,
                palette: HOT,
            });
        },
    },
    {
        id: 'impacts/shield-block',
        name: 'Shield block',
        loop: false,
        period: 1.6,
        build(fx) {
            fx.character([-0.6, 0, 0], 1.8);
            const dome = fx.prop(shapes.sphere(fx.scene, 1.2, 16), {
                at: [-0.4, 1, 0],
                color: '#3a8aff',
                glow: '#2a6ad8',
                alpha: 0.25,
            });
            dome.scaling.set(0.55, 1, 1);
            fx.every((t) => {
                // Up for the block, then it blinks out.
                dome.setEnabled(t < 0.75 && !(t > 0.5 && Math.floor(t * 30) % 2 === 0));
            });
            const at: [number, number, number] = [0.25, 1.2, 0];
            fx.sys({
                tex: 'glow',
                life: 0.2,
                size: 1.6,
                burst: [[0.1, 1]],
                color: '#9ad4ff',
                at,
                order: 5,
                b: [tint([['#ffffff', 0]], popOut(0.2))],
            });
            fx.sys({
                tex: 'ring',
                life: 0.4,
                size: 2.4,
                burst: [[0.1, 1]],
                color: '#9ad4ff',
                at,
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.1], [1, 1])],
            });
            fx.sys({
                tex: 'glint',
                life: [0.2, 0.4],
                size: [0.2, 0.35],
                rate: 30,
                duration: 0.6,
                loop: false,
                shape: new SphereEmitter({radius: 1.15, thickness: 0}),
                at: [-0.4, 1, 0],
                color: '#bfe6ff',
                order: 6,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            sparks(fx, {
                at,
                count: 16,
                delay: 0.1,
                aim: 'up',
                shape: new ConeEmitter({radius: 0.05, angle: 0.8}),
                speed: [3, 5],
                gravity: 6,
                palette: PALETTE.electric,
            });
            fx.sys({
                tex: 'streak',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.1, length: 1},
                life: 0.12,
                speed: -14,
                size: 0.15,
                burst: 1,
                at: [2, 1.2, 0],
                aim: 'right',
                order: 4,
                b: [tint([['#ffffff', 0]], popOut(0.3))],
            });
        },
    },
];
