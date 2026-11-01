import type {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {CircleEmitter, ConeEmitter, RenderMode, SphereEmitter} from 'babylon.quarks';
import {drag, fadeOut, flicker, gravity, grow, orbit, popOut, spin, tint, wobble} from './kit';
import {PALETTE, debris, decal, flash, pool, shockwave, smoke} from './recipes';
import {type FxBuilder, type FxDef, shapes} from './stage';

const ICE_CHUNKS: [string, string] = ['#a8dcf5', '#e6f8ff'];
const FROST = '#bfeaff';

/** Glints flashing on and off over a surface: the shine of ice. */
function glints(
    fx: FxBuilder,
    o: {
        at?: [number, number, number];
        radius?: number;
        rate?: number;
        size?: [number, number];
        delay?: number;
        duration?: number;
        loop?: boolean;
        parent?: FxBuilder['root'];
    }
) {
    return fx.sys({
        tex: 'glint',
        life: [0.3, 0.5],
        size: o.size ?? [0.3, 0.55],
        rot: [-0.2, 0.2],
        rate: o.rate ?? 6,
        shape: new SphereEmitter({radius: o.radius ?? 0.6, thickness: 0.2}),
        at: o.at,
        parent: o.parent,
        delay: o.delay,
        duration: o.duration,
        loop: o.loop,
        order: 6,
        b: [tint([['#ffffff', 0]], flicker()), grow([0, 0.3], [0.5, 1], [1, 0.2])],
    });
}

/** Snowflakes spun out, drifting down as they slow. */
function flakes(
    fx: FxBuilder,
    o: {
        at?: [number, number, number];
        burst?: [number, number][];
        rate?: number;
        speed?: [number, number];
        size?: [number, number];
        delay?: number;
        duration?: number;
        loop?: boolean;
        shape?: SphereEmitter | ConeEmitter | CircleEmitter;
        aim?: 'up' | 'down';
        fall?: number;
        life?: [number, number];
    }
) {
    return fx.sys({
        tex: 'flake',
        life: o.life ?? [1.6, 2.4],
        speed: o.speed ?? [2, 4],
        size: o.size ?? [0.2, 0.35],
        rot: true,
        burst: o.burst,
        rate: o.burst ? undefined : o.rate,
        shape: o.shape ?? new SphereEmitter({radius: 0.2}),
        aim: o.aim,
        at: o.at,
        delay: o.delay,
        duration: o.duration,
        loop: o.loop,
        order: 4,
        b: [
            tint(PALETTE.ice.slice(0, 3), fadeOut(0.6, 0.05)),
            spin([-3, 3]),
            drag([0, 1], [0.3, 0.15], [1, 0.05]),
            gravity(o.fall ?? 0.8),
            wobble(1, 0.4),
        ],
    });
}

/** pixelfx's ice category, rebuilt as 3D particle effects. */
export const ice: FxDef[] = [
    {
        id: 'ice/blizzard-vortex',
        name: 'Blizzard vortex',
        loop: true,
        period: 2,
        build(fx) {
            fx.sys({
                tex: 'flake',
                life: [1.2, 1.6],
                speed: [2.5, 3.5],
                size: [0.12, 0.22],
                rot: true,
                rate: 90,
                shape: new ConeEmitter({radius: 0.35, angle: 0.55, thickness: 0.3}),
                aim: 'up',
                order: 4,
                b: [tint(PALETTE.ice.slice(0, 3), fadeOut(0.6, 0.1)), orbit(6, [0, 0, 1]), spin([-4, 4])],
            });
            // Wind bands: soft streaks orbiting the funnel.
            fx.sys({
                tex: 'smoke',
                life: [1, 1.4],
                speed: [2, 2.6],
                size: [0.8, 1.2],
                rot: true,
                rate: 40,
                color: '#dff4ff',
                alpha: 0.35,
                blend: 'alpha',
                shape: new ConeEmitter({radius: 0.25, angle: 0.35, thickness: 0.2}),
                aim: 'up',
                order: 3,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.2)), orbit(5, [0, 0, 1]), grow([0, 0.5], [1, 1.6])],
            });
            smoke(fx, {
                shape: new CircleEmitter({radius: 0.8, thickness: 1}),
                rate: 12,
                speed: [0.3, 0.7],
                color: '#e8f6ff',
                alpha: 0.5,
                size: [0.6, 0.9],
                life: [0.8, 1.2],
            });
            fx.sys({
                tex: 'glow',
                life: 0.5,
                size: [1.6, 2.2],
                rate: 8,
                color: '#9ad8ff',
                alpha: 0.4,
                at: [0, 1.6, 0],
                order: 2,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            pool(fx, {color: '#6ac7f0', size: 3.6, alpha: 0.25});
        },
    },
    {
        id: 'ice/freeze',
        name: 'Freeze',
        loop: false,
        period: 5.4,
        build(fx) {
            const body = fx.character([0, 0, 0], 1.8, '#2b2e3c');
            // Its own material, so the frost tints this body only.
            const bodyMat = (body.material as StandardMaterial).clone('frozen-body');
            body.material = bodyMat;
            const block = fx.prop(shapes.box(fx.scene, 1.2, 2.3, 1.2), {
                at: [0, 1.15, 0],
                color: '#9ad8ff',
                glow: '#3a7aa8',
                alpha: 0.45,
            });
            const burst = 2.7;
            fx.every((t) => {
                // Frost climbs the body, the block crystallizes round it, then bursts and it thaws.
                const frost = t < 1 ? t : t < burst ? 1 : Math.max(0, 1 - (t - burst) / 1);
                bodyMat.emissiveColor.set(0.25 * frost, 0.55 * frost, 0.75 * frost);
                const k = Math.min(1, Math.max(0, (t - 0.9) / 0.5));
                block.setEnabled(t > 0.9 && t < burst);
                block.scaling.set(1, k, 1);
                block.position.y = 1.15 * k;
                block.position.x = t > burst - 0.4 && t < burst ? 0.04 * Math.sin(t * 90) : 0;
            });
            decal(fx, {tex: 'glow', blend: 'add', size: 3, color: FROST, alpha: 0.7, life: 3.6});
            fx.sys({
                tex: 'dot',
                life: [0.6, 0.9],
                speed: [1.5, 2.2],
                size: [0.04, 0.07],
                rate: 50,
                duration: 1,
                loop: false,
                color: FROST,
                shape: new CircleEmitter({radius: 0.5, thickness: 0.3}),
                aim: 'up',
                order: 4,
                b: [tint([['#ffffff', 0]], fadeOut(0.5))],
            });
            glints(fx, {at: [0, 1.2, 0], radius: 0.8, rate: 10, delay: 1.3, duration: 1.4, loop: false});
            flash(fx, {at: [0, 1.2, 0], size: 3.5, delay: burst, color: '#e6f8ff'});
            debris(fx, {
                mesh: 'shard',
                count: 22,
                color: ICE_CHUNKS,
                delay: burst,
                at: [0, 1, 0],
                shape: new SphereEmitter({radius: 0.6}),
                speed: [3, 6],
                size: [0.2, 0.4],
            });
            flakes(fx, {at: [0, 1.2, 0], burst: [[0, 24]], delay: burst, loop: false});
            smoke(fx, {
                at: [0, 0.6, 0],
                burst: [[0, 10]],
                delay: burst,
                color: '#e8f6ff',
                alpha: 0.5,
                loop: false,
                spread: 1.2,
            });
        },
    },
    {
        id: 'ice/frost-breath',
        name: 'Frost breath',
        loop: true,
        period: 1.2,
        build(fx) {
            fx.character([-2.6, 0, 0], 1.8, '#2a3040');
            const mouth: [number, number, number] = [-2.2, 1.55, 0];
            fx.sys({
                tex: 'smoke',
                life: [0.7, 1],
                speed: [5, 6.5],
                size: [0.3, 0.45],
                rot: true,
                rate: 60,
                color: '#dff4ff',
                alpha: 0.55,
                shape: new ConeEmitter({radius: 0.08, angle: 0.22}),
                aim: 'right',
                at: mouth,
                order: 3,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            ['#a8dcf5', 1],
                        ],
                        fadeOut(0.5, 0.05)
                    ),
                    grow([0, 0.5], [1, 3.6]),
                    gravity(1.2),
                    drag([0, 1], [1, 0.35]),
                    spin([-1, 1]),
                ],
            });
            fx.sys({
                tex: 'streak',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.12, length: 1},
                life: [0.35, 0.5],
                speed: [9, 12],
                size: [0.08, 0.12],
                rate: 20,
                color: '#ffffff',
                shape: new ConeEmitter({radius: 0.15, angle: 0.15}),
                aim: 'right',
                at: mouth,
                order: 4,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.2))],
            });
            fx.sys({
                tex: 'glint',
                life: [0.5, 0.8],
                speed: [5, 7],
                size: [0.15, 0.25],
                rate: 14,
                shape: new ConeEmitter({radius: 0.1, angle: 0.3}),
                aim: 'right',
                at: mouth,
                order: 5,
                b: [tint([['#ffffff', 0]], flicker()), spin([-6, 6]), gravity(2), drag([0, 1], [1, 0.4])],
            });
            fx.sys({
                tex: 'glow',
                life: 0.2,
                size: [0.6, 0.8],
                rate: 20,
                color: '#e6f8ff',
                at: [mouth[0] + 0.15, mouth[1], 0],
                order: 6,
                b: [tint([['#ffffff', 0]], flicker())],
            });
        },
    },
    {
        id: 'ice/frost-nova',
        name: 'Frost nova',
        loop: false,
        period: 5,
        build(fx) {
            fx.character([0, 0, 0], 1.8, '#2a3040');
            // Frost spirals into a spinning snowflake under the caster.
            fx.sys({
                tex: 'flake',
                mode: RenderMode.HorizontalBillBoard,
                life: 0.9,
                size: 2.4,
                burst: 1,
                color: FROST,
                at: [0, 0.04, 0],
                order: 3,
                b: [tint([['#ffffff', 0]], fadeOut(0.7, 0.3)), grow([0, 0.1], [1, 1]), spin(5)],
            });
            fx.sys({
                tex: 'dot',
                life: 0.6,
                speed: -3,
                size: [0.05, 0.08],
                rate: 60,
                duration: 0.6,
                loop: false,
                color: FROST,
                shape: new CircleEmitter({radius: 2, thickness: 0}),
                aim: 'up',
                at: [0, 0.1, 0],
                order: 4,
                b: [orbit(3, [0, 0, 1])],
            });
            // The wave: three rings of ice crystals bursting up round the caster, melting back later.
            const melt = () => grow([0, 0], [0.08, 1.15], [0.15, 1], [0.75, 1], [1, 0]);
            shockwave(fx, {size: 8, delay: 0.75, color: '#bfeaff', life: 0.6});
            [1.4, 2.3, 3.2].forEach((radius, i) => {
                fx.sys({
                    mesh: 'shard',
                    upright: true,
                    life: 2.2 - i * 0.2,
                    size: [0.6 + i * 0.15, 1 + i * 0.2],
                    burst: [[0.8 + i * 0.12, 10 + i * 6]],
                    color: ICE_CHUNKS,
                    shape: new CircleEmitter({radius, thickness: 0}),
                    aim: 'up',
                    order: 2,
                    b: [melt()],
                });
            });
            glints(fx, {at: [0, 0.5, 0], radius: 3, rate: 8, delay: 1, duration: 1.4, loop: false});
            flakes(fx, {
                at: [0, 2.5, 0],
                rate: 12,
                delay: 0.9,
                duration: 1.6,
                loop: false,
                speed: [0.2, 0.6],
                fall: 0.6,
                shape: new SphereEmitter({radius: 2.5}),
            });
            decal(fx, {blend: 'add', size: 7, color: FROST, alpha: 0.45, life: 2.5, delay: 0.8});
        },
    },
    {
        id: 'ice/ice-crystal',
        name: 'Ice crystal',
        loop: true,
        period: 3,
        build(fx) {
            const crystal = fx.prop(shapes.poly(fx.scene, 1, 0.55), {
                at: [0, 1.7, 0],
                color: '#9ad8ff',
                glow: '#3a7aa8',
                alpha: 0.85,
            });
            crystal.scaling.y = 1.8;
            fx.every((t, dt) => {
                crystal.rotation.y += dt * 0.8;
                crystal.position.y = 1.7 + 0.12 * Math.sin((t / 3) * Math.PI * 2);
            });
            glints(fx, {at: [0, 1.7, 0], radius: 0.6, rate: 5});
            fx.sys({
                tex: 'dot',
                life: [2, 3],
                speed: [0.1, 0.3],
                size: [0.04, 0.06],
                rate: 10,
                color: FROST,
                shape: new SphereEmitter({radius: 1.3, thickness: 0.3}),
                at: [0, 1.7, 0],
                order: 4,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.3)), orbit(1.2)],
            });
            fx.sys({
                tex: 'glow',
                life: 0.8,
                size: [2.2, 2.6],
                rate: 4,
                color: '#6ac7f0',
                alpha: 0.35,
                at: [0, 1.7, 0],
                order: 1,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.4))],
            });
            pool(fx, {color: '#6ac7f0', size: 2.8, alpha: 0.3});
        },
    },
    {
        id: 'ice/ice-lance',
        name: 'Ice lance',
        loop: true,
        period: 1.4,
        build(fx) {
            const lance = fx.node('lance', [-3, 1.4, 0]);
            const spear = fx.prop(shapes.cylinder(fx.scene, 1.6, 0, 0.16, 6), {
                parent: lance,
                rotate: [0, 0, -Math.PI / 2],
                color: '#a8dcf5',
                glow: '#4a8ab8',
                alpha: 0.9,
            });
            fx.every((t, dt) => {
                lance.position.x = -3.4 + (t / 1.4) * 6.8;
                spear.rotation.x += dt * 4;
            });
            fx.sys({
                tex: 'glow',
                life: 0.2,
                size: [0.8, 1],
                rate: 20,
                color: '#bfeaff',
                parent: lance,
                at: [0.6, 0, 0],
                order: 5,
            });
            // Rings of cold air sheared off the tip, left behind in the world.
            fx.sys({
                tex: 'ring',
                life: 0.35,
                size: 0.7,
                rate: 10,
                world: true,
                color: '#e6f8ff',
                parent: lance,
                at: [0.6, 0, 0],
                rotate: [0, Math.PI / 2, 0],
                order: 4,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.6], [1, 1.6])],
            });
            smoke(fx, {
                parent: lance,
                at: [-0.6, 0, 0],
                world: true,
                rate: 30,
                life: [0.5, 0.8],
                speed: [0.1, 0.3],
                size: [0.3, 0.45],
                color: '#e8f6ff',
                alpha: 0.45,
            });
            fx.sys({
                tex: 'glint',
                life: [0.4, 0.7],
                speed: [0.2, 0.6],
                size: [0.15, 0.25],
                rate: 20,
                world: true,
                shape: new SphereEmitter({radius: 0.15}),
                parent: lance,
                order: 5,
                b: [tint([['#ffffff', 0]], flicker()), gravity(3)],
            });
        },
    },
    {
        id: 'ice/ice-shatter',
        name: 'Ice shatter',
        loop: false,
        period: 3.2,
        build(fx) {
            const hit = 0.8;
            const block = fx.prop(shapes.box(fx.scene, 1.4, 1.4, 1.4), {
                at: [0, 0.7, 0],
                color: '#9ad8ff',
                glow: '#2a6a98',
                alpha: 0.8,
            });
            fx.every((t) => {
                block.setEnabled(t < hit + 0.15 || t > 2.6);
                block.position.x = t > 0.4 && t < hit ? 0.06 * Math.sin(t * 70) : 0;
            });
            fx.sys({
                tex: 'streak',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.1, length: 1},
                life: 0.2,
                speed: 14,
                size: 0.2,
                burst: [[0.4, 1]],
                at: [-3, 0.8, 0],
                aim: 'right',
                order: 4,
                b: [tint([['#ffffff', 0]], popOut(0.3))],
            });
            flash(fx, {at: [0, 0.8, 0], size: 3, delay: hit, color: '#e6f8ff'});
            debris(fx, {
                mesh: 'cube',
                count: 14,
                color: ICE_CHUNKS,
                delay: hit + 0.1,
                at: [0, 0.7, 0],
                shape: new SphereEmitter({radius: 0.5}),
                speed: [3, 5],
                size: [0.25, 0.45],
                life: [1.2, 1.6],
            });
            debris(fx, {
                mesh: 'shard',
                count: 18,
                color: ICE_CHUNKS,
                delay: hit + 0.1,
                at: [0, 0.7, 0],
                shape: new SphereEmitter({radius: 0.5}),
                speed: [4, 7],
                size: [0.15, 0.3],
            });
            glints(fx, {at: [0, 0.8, 0], radius: 1.2, rate: 20, delay: hit, duration: 0.5, loop: false});
            smoke(fx, {
                at: [0, 0.4, 0],
                burst: [[0, 12]],
                delay: hit + 0.1,
                color: '#e8f6ff',
                alpha: 0.45,
                spread: 1.4,
                speed: [1, 2],
                loop: false,
            });
        },
    },
    {
        id: 'ice/ice-spikes',
        name: 'Ice spikes',
        loop: false,
        period: 3.4,
        build(fx) {
            const runner = fx.node('front', [-3.2, 0, 0]);
            fx.every((t) => {
                runner.position.x = -3.2 + Math.min(1, t / 0.9) * 6.4;
            });
            fx.sys({
                tex: 'glow',
                mode: RenderMode.HorizontalBillBoard,
                life: 1.6,
                size: [0.6, 0.9],
                rateOverDistance: 6,
                duration: 0.95,
                loop: false,
                world: true,
                color: FROST,
                alpha: 0.6,
                parent: runner,
                at: [0, 0.03, 0],
                order: 1,
                b: [tint([['#ffffff', 0]], fadeOut(0.6, 0.05))],
            });
            // Clusters of blades bursting up behind the frost line, then toppling into shards.
            fx.sys({
                mesh: 'shard',
                upright: true,
                life: [1.5, 1.8],
                size: [1, 1.8],
                rateOverDistance: 5,
                duration: 0.95,
                loop: false,
                world: true,
                color: ICE_CHUNKS,
                shape: new CircleEmitter({radius: 0.4, thickness: 1}),
                aim: 'up',
                parent: runner,
                order: 2,
                b: [grow([0, 0], [0.12, 1.1], [0.2, 1], [0.85, 1], [1, 0])],
            });
            flash(fx, {at: [0, 0.8, 0], size: 6, delay: 2, color: '#e6f8ff', life: 0.18});
            debris(fx, {
                mesh: 'shard',
                count: 30,
                color: ICE_CHUNKS,
                delay: 2.1,
                shape: new CircleEmitter({radius: 3.2, thickness: 1}),
                at: [0, 0.6, 0],
                speed: [2, 4],
                size: [0.15, 0.3],
                life: [0.7, 1],
            });
        },
    },
    {
        id: 'ice/icicle-fall',
        name: 'Icicle fall',
        loop: false,
        period: 3.8,
        build(fx) {
            const top = 4.2;
            fx.prop(shapes.box(fx.scene, 2.4, 0.3, 1.2), {at: [0, top + 0.15, 0], color: '#3a3f4f'});
            const icicle = fx.node('icicle', [0, top, 0]);
            fx.prop(shapes.cylinder(fx.scene, 1.1, 0.22, 0, 7), {
                parent: icicle,
                at: [0, -0.55, 0],
                color: '#a8dcf5',
                glow: '#3a6a98',
                alpha: 0.9,
            });
            const snap = 0.9;
            const land = 1.25;
            fx.every((t) => {
                icicle.setEnabled(t < land);
                const shake = t > 0.5 && t < snap ? 0.03 * Math.sin(t * 80) : 0;
                const k = Math.max(0, t - snap);
                icicle.position.set(shake, top - 0.5 * 18 * k * k, 0);
            });
            fx.sys({
                tex: 'dot',
                life: 0.5,
                speed: 0,
                size: 0.07,
                burst: [
                    [0.1, 1],
                    [0.45, 1],
                ],
                color: FROST,
                at: [0, top - 1.1, 0],
                order: 4,
                b: [gravity(14)],
            });
            const impact: [number, number, number] = [0, 0.2, 0];
            flash(fx, {at: impact, size: 2, delay: land, color: '#e6f8ff'});
            debris(fx, {
                mesh: 'shard',
                count: 18,
                color: ICE_CHUNKS,
                delay: land,
                at: impact,
                speed: [2, 4],
                size: [0.12, 0.26],
                shape: new ConeEmitter({radius: 0.1, angle: 1.3}),
            });
            smoke(fx, {
                at: impact,
                shape: new CircleEmitter({radius: 0.2, thickness: 1}),
                burst: [[0, 10]],
                delay: land,
                speed: [1.5, 2.5],
                color: '#e8f6ff',
                alpha: 0.5,
                size: [0.4, 0.6],
                loop: false,
                aim: 'up',
                spread: 0,
            });
            decal(fx, {tex: 'crack', blend: 'add', size: 1.8, color: FROST, alpha: 0.8, life: 1.3, delay: land});
        },
    },
    {
        id: 'ice/snowflake-burst',
        name: 'Snowflake burst',
        loop: false,
        period: 3.2,
        build(fx) {
            const at: [number, number, number] = [0, 1.6, 0];
            fx.sys({
                tex: 'dot',
                life: 0.45,
                speed: -4,
                size: [0.05, 0.08],
                rate: 70,
                duration: 0.45,
                loop: false,
                color: FROST,
                shape: new SphereEmitter({radius: 1.8, thickness: 0}),
                at,
                order: 3,
            });
            fx.sys({
                tex: 'glow',
                life: 0.5,
                size: 1.6,
                burst: 1,
                color: '#bfeaff',
                at,
                order: 2,
                b: [tint([['#ffffff', 0]], fadeOut(0.8, 0.1)), grow([0, 0.2], [1, 1])],
            });
            flash(fx, {at, size: 2.6, delay: 0.5, color: '#ffffff'});
            fx.sys({
                tex: 'ring',
                life: 0.4,
                size: 3.4,
                burst: [[0.5, 1]],
                color: FROST,
                at,
                order: 5,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.2], [1, 1])],
            });
            flakes(fx, {
                at,
                burst: [[0.5, 26]],
                loop: false,
                speed: [3, 5],
                size: [0.25, 0.45],
                life: [2, 2.6],
                fall: 0.7,
            });
            glints(fx, {at, radius: 2, rate: 10, delay: 0.7, duration: 1.4, loop: false, size: [0.2, 0.35]});
        },
    },
];
