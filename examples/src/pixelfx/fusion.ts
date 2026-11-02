/**
 * The Sprite Fusion effects that pixelfx has no counterpart for: a blood hit, drifting embers, a
 * plasma orb, a speed power-up, a dash and a glint. Sprite Fusion's pixel art VFX are MIT
 * (https://www.spritefusion.com/pixel-art-vfx); the timings and palettes follow them, the 3D staging
 * is ours.
 */
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {BoxEmitter, CircleEmitter, ConeEmitter, RenderMode, SphereEmitter} from 'babylon.quarks';
import {airDrag, fadeOut, flicker, floorBounce, gem, gravity, grow, popOut, spin, subEmit, tint, wobble} from './kit';
import {SPHERE, actor, hitFlash, part, reel, solid} from './moves';
import {dust, gate, light, star, type At} from './parts';
import {PALETTE, arcs, decal, embers, flash, shockwave, smoke, type Ramp} from './recipes';
import {hero} from './spawn';
import {type FxBuilder, type FxDef} from './stage';

const BLOOD = ['#ff8a7a', '#f2384a', '#c71e33', '#931327', '#5e0c1b', '#350711'];
const DASH = ['#ffffff', '#ccf6ff', '#a3dcff', '#5eb0ff', '#5b6cff', '#773ae4', '#4c25ab'];
const SPEED = ['#ffffff', '#e0fcff', '#8ff0ff', '#3fd0ff', '#2290e6', '#1f4fab', '#172a68'];
const PLASMA = ['#ffffff', '#ffd6f6', '#ff86e6', '#e04ad0', '#b0228f', '#5e1060'];
const WARM = ['#ffffff', '#fffbe2', '#fff0a6', '#ffd862', '#f6aa3c', '#cf722b', '#7e3c1f'];
const COOL = ['#ffffff', '#dcfbff', '#a6ecff', '#62c8f4', '#3a8bd8', '#2c58aa'];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const easeInOut = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
const VIEW = {height: 1.1, distance: 6.5};

const ramp = (colors: string[]): Ramp => colors.map((c, i) => [c, i / (colors.length - 1)] as [string, number]);

/** A soft body overlay that holds `alpha` between `from` and `to` (seconds) of a `period`. */
function overlay(
    fx: FxBuilder,
    parent: TransformNode,
    period: number,
    color: string,
    alpha: number,
    from: number,
    to: number
) {
    hero(fx, {
        period,
        parent,
        blend: 'add',
        color,
        lighting: 'unlit',
        order: 4,
        fade: [
            [0, 0],
            [0, from / period],
            [alpha, (from + 0.08) / period],
            [alpha * 0.6, (to - 0.2) / period],
            [0, to / period],
            [0, 1],
        ],
    });
}

export const fusion: FxDef[] = [
    {
        id: 'fusion/blood-hit',
        name: 'Blood Hit',
        loop: false,
        period: 3,
        view: VIEW,
        build(fx) {
            const P = 3;
            const HIT = 0.25;
            const X = 0.8;
            const foe = actor(fx, P, X, -1, '#a88478');
            const wound: At = [X - 0.3, 1.25, 0.15];
            // Up and back, away from the blow that came from the right: the cone opens along -x.
            const aim: [number, number, number] = [-0.35, 0, 0];
            // The burst: a red pop and the first strands.
            fx.sys({
                tex: 'burst',
                blend: 'add',
                life: 0.1,
                size: 0.7,
                burst: [[HIT, 1]],
                color: BLOOD[1],
                at: wound,
                order: 8,
                b: [
                    tint(
                        [
                            ['#ffffff', 0],
                            [BLOOD[1], 0.5],
                        ],
                        popOut(0.3)
                    ),
                ],
            });
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.06, length: 1},
                life: [0.08, 0.14],
                speed: [8, 14],
                size: [0.05, 0.09],
                burst: [[HIT, 9]],
                color: [BLOOD[1], BLOOD[2]],
                shape: new ConeEmitter({radius: 0.02, angle: 0.55, thickness: 1}),
                aim: 'left',
                rotate: aim,
                at: wound,
                order: 7,
                b: [tint(ramp(BLOOD.slice(0, 4)), popOut(0.4))],
            });
            // Droplets: little lit beads that arc, land and leave a stain where they stop.
            const drops = fx.sys({
                geo: SPHERE,
                tex: 'white',
                world: true,
                life: [0.9, 1.2],
                speed: [2.5, 6.5],
                size: [0.035, 0.07],
                burst: [[HIT, 46]],
                color: [BLOOD[2], BLOOD[3]],
                shape: new ConeEmitter({radius: 0.05, angle: 0.6, thickness: 1}),
                aim: 'left',
                rotate: aim,
                at: wound,
                order: 6,
                look: {lighting: 'fixed'},
                b: [gravity(11), airDrag(1.2), floorBounce(0, 0.02)],
            });
            const splat = fx.sys({
                tex: 'dot',
                mode: RenderMode.HorizontalBillBoard,
                world: true,
                loop: false,
                life: [1.8, 2.4],
                size: [0.08, 0.2],
                burst: [[0, 1]],
                color: BLOOD[2],
                order: 1,
                b: [
                    tint(
                        [
                            [BLOOD[1], 0],
                            [BLOOD[3], 0.25],
                            [BLOOD[4], 1],
                        ],
                        fadeOut(0.75, 0.02)
                    ),
                    grow([0, 0.5], [0.12, 1.1], [1, 1.2]),
                ],
            });
            subEmit(drops, splat);
            // A red mist hanging where the strands broke.
            smoke(fx, {
                at: wound,
                burst: [[HIT, 6]],
                size: [0.3, 0.5],
                speed: [0.3, 0.9],
                color: BLOOD[3],
                alpha: 0.35,
                life: [0.4, 0.7],
                loop: false,
            });
            // Drips from the wound for a moment after.
            const drip = fx.sys({
                geo: SPHERE,
                tex: 'white',
                world: true,
                life: 1,
                speed: 0,
                size: [0.03, 0.045],
                rate: 3,
                color: BLOOD[3],
                parent: foe.root,
                at: [-0.3, 1.18, 0.15],
                order: 6,
                look: {lighting: 'fixed'},
                b: [gravity(9), floorBounce(0, 0.02)],
            });
            gate(drip, P, HIT + 0.3, HIT + 1.4, 3);
            const dripSplat = fx.sys({
                tex: 'dot',
                mode: RenderMode.HorizontalBillBoard,
                world: true,
                loop: false,
                life: 1.6,
                size: 0.12,
                burst: [[0, 1]],
                color: BLOOD[3],
                order: 1,
                b: [
                    tint(
                        [
                            [BLOOD[2], 0],
                            [BLOOD[4], 1],
                        ],
                        fadeOut(0.7, 0.02)
                    ),
                ],
            });
            subEmit(drip, dripSplat);
            hitFlash(fx, foe, P, [HIT], BLOOD[1], 0.4);
            fx.every((t) => {
                reel(foe, t, [[HIT, 0.45]], X);
            });
        },
    },
    {
        id: 'fusion/embers',
        name: 'Embers',
        loop: true,
        period: 4,
        view: {height: 1.2, distance: 7},
        build(fx) {
            const P = 4;
            hero(fx, {period: P, at: [0.6, 0, 0], color: '#6a6078', loop: true, life: P + 0.02, rim: [1, 0.45, 0.15]});
            // A band of heat along the ground: the source the embers rise from.
            for (let i = -5; i <= 5; i++) {
                decal(fx, {
                    tex: 'glow',
                    at: [i * 0.6, 0.02, 0],
                    size: 2.2,
                    color: '#ff7832',
                    alpha: 0.35,
                    life: P + 0.02,
                    blend: 'add',
                    loop: true,
                    alphas: [[1, 0]],
                });
            }
            light(fx, {
                at: [0, 0.05, 0],
                size: 9,
                color: '#ff8a2a',
                floor: true,
                life: P + 0.02,
                alpha: 0.25,
                loop: true,
            });
            const area = new BoxEmitter({width: 7, height: 2.5, depth: 0.1});
            // Hot sparks that rise fast and die young.
            embers(fx, {at: [0, 0.1, 0], rate: 34, speed: [0.8, 1.8], size: [0.04, 0.08], life: [1, 2.2], rise: -0.4});
            fx.sys({
                tex: 'dot',
                blend: 'add',
                life: [1.6, 3.2],
                speed: [0.2, 0.6],
                size: [0.03, 0.07],
                rate: 46,
                color: ['#fff3a6', '#ff8a2a'],
                shape: area,
                aim: 'up',
                order: 5,
                b: [
                    tint(
                        [
                            ['#fff3a6', 0],
                            ['#ff8a2a', 0.3],
                            ['#f2561d', 0.6],
                            ['#8a1f17', 1],
                        ],
                        flicker()
                    ),
                    wobble(1.2, 0.9),
                    gravity(-0.35),
                ],
            });
            // Bigger cinders tumbling up, and ash that has cooled.
            fx.sys({
                tex: 'square',
                life: [2.5, 4],
                speed: [0.2, 0.5],
                size: [0.05, 0.09],
                rot: true,
                rate: 8,
                color: ['#5a5160', '#3a3442'],
                shape: area,
                aim: 'up',
                order: 4,
                b: [
                    tint(
                        [
                            ['#c9281f', 0],
                            ['#5a5160', 0.3],
                            ['#3a3442', 1],
                        ],
                        fadeOut(0.7, 0.1)
                    ),
                    wobble(0.8, 0.8),
                    gravity(-0.25),
                    spin(2),
                ],
            });
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: [1, 1.6],
                speed: [0.1, 0.3],
                size: [0.25, 0.4],
                rate: 6,
                color: '#ff8a2a',
                alpha: 0.5,
                shape: area,
                aim: 'up',
                order: 3,
                b: [tint([['#ffffff', 0]], fadeOut(0.4, 0.3)), wobble(1, 0.5), gravity(-0.3)],
            });
        },
    },
    {
        id: 'fusion/plasma-orb',
        name: 'Plasma Orb',
        loop: true,
        period: 3,
        view: {height: 1.3, distance: 5},
        build(fx) {
            const P = 3;
            const ZAP = 2.1;
            const orb = fx.node('orb', [0, 1.7, 0]);
            // The shell: a glassy sphere with a hot rim, and the glow inside it.
            solid(fx, part(fx, orb, [0, 0, 0], [0.8, 0.8, 0.8]), SPHERE, PLASMA[5], {
                life: P + 0.02,
                blend: 'add',
                alpha: 0.12,
                lit: false,
                rim: [1, 0.6, 1],
            });
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: P + 0.02,
                size: 1.7,
                burst: [[0, 1]],
                color: PLASMA[4],
                alpha: 0.3,
                parent: orb,
                order: 4,
                b: [tint([['#ffffff', 0]], [[1, 0]])],
            });
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: P + 0.02,
                size: 0.45,
                burst: [[0, 1]],
                color: PLASMA[1],
                parent: orb,
                order: 7,
                b: [tint([['#ffffff', 0]], [[1, 0]])],
            });
            // Filaments from the core to points sliding over the shell.
            const tips: TransformNode[] = [];
            for (let i = 0; i < 3; i++) {
                const tip = fx.node('tip', [0, 0, 0], orb);
                tips.push(tip);
                arcs(fx, {
                    parent: orb,
                    to: tip,
                    rate: 22,
                    width: [0.16, 0.26],
                    palette: ramp(PLASMA.slice(0, 4)),
                    color: PLASMA[1],
                    order: 8,
                });
            }
            // Motes circling the orb.
            fx.sys({
                tex: 'dot',
                blend: 'add',
                life: [0.6, 1.1],
                speed: 0,
                size: [0.03, 0.06],
                rate: 24,
                color: [PLASMA[1], '#ffffff'],
                shape: new SphereEmitter({radius: 0.6, thickness: 0.2}),
                parent: orb,
                order: 6,
                b: [tint(ramp(PLASMA.slice(0, 5)), popOut(0.5)), wobble(2, 0.6)],
            });
            // The discharge to the ground, a pop of sparks and a scorch.
            const ground = fx.node('ground', [0.35, 0.02, 0.2]);
            const zap = arcs(fx, {
                parent: orb,
                to: ground,
                rate: 40,
                width: [0.2, 0.32],
                palette: ramp(PLASMA.slice(0, 4)),
                color: PLASMA[1],
                order: 7,
            });
            gate(zap, P, ZAP, ZAP + 0.22, 40);
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: 0.3,
                size: 1.4,
                burst: [[ZAP, 1]],
                color: PLASMA[2],
                at: [0.35, 0.1, 0.2],
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.2))],
            });
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.08, length: 1},
                blend: 'add',
                life: [0.25, 0.5],
                speed: [2, 4],
                size: [0.03, 0.05],
                burst: [[ZAP, 16]],
                color: PLASMA[1],
                shape: new ConeEmitter({radius: 0.05, angle: 1.1, thickness: 1}),
                aim: 'up',
                at: [0.35, 0.05, 0.2],
                order: 7,
                b: [tint(ramp(PLASMA.slice(0, 5)), popOut(0.4)), gravity(9)],
            });
            decal(fx, {
                tex: 'glow',
                at: [0.35, 0.014, 0.2],
                size: 0.8,
                color: '#2a0f28',
                alpha: 0.7,
                life: P - ZAP,
                delay: ZAP,
                loop: true,
            });
            light(fx, {
                at: [0, 0.05, 0],
                size: 4,
                color: PLASMA[3],
                floor: true,
                life: P + 0.02,
                alpha: 0.3,
                loop: true,
            });
            fx.every((t) => {
                const bob = Math.sin((t / P) * Math.PI * 2) * 0.06;
                orb.position.y = 1.7 + bob;
                const pulse = 1 + 0.04 * Math.sin(t * 13) + (t > ZAP && t < ZAP + 0.25 ? 0.12 : 0);
                orb.scaling.setAll(pulse);
                tips.forEach((tip, i) => {
                    const a = t * (1.7 + i * 0.6) + i * 2.1;
                    const b = Math.sin(t * (1.1 + i * 0.4) + i) * 1.2;
                    tip.position.set(
                        Math.cos(a) * Math.cos(b) * 0.38,
                        Math.sin(b) * 0.38,
                        Math.sin(a) * Math.cos(b) * 0.38
                    );
                });
            });
        },
    },
    {
        id: 'fusion/speed-up',
        name: 'Speed Power-Up',
        loop: false,
        period: 3.2,
        view: {height: 1.1, distance: 5},
        build(fx) {
            const P = 3.2;
            const BURST = 0.32;
            const HOLD = 1.75;
            const FADE = 2.35;
            const me = actor(fx, P, 0, 1);
            // Motes drawn in before the burst.
            fx.sys({
                tex: 'dot',
                blend: 'add',
                life: 0.3,
                speed: -3.5,
                size: [0.03, 0.05],
                burst: [[0, 18]],
                color: SPEED[2],
                shape: new SphereEmitter({radius: 1.2, thickness: 0.1}),
                at: [0, 1, 0],
                order: 6,
                b: [tint(ramp(SPEED.slice(0, 4)), popOut(0.3))],
            });
            flash(fx, {at: [0, 1, 0.3], size: 2.8, time: BURST, color: SPEED[1]});
            shockwave(fx, {at: [0, 0.04, 0], size: 2.6, life: 0.4, color: SPEED[3], delay: BURST});
            dust(fx, {
                at: [0, 0.05, 0],
                size: [0.3, 0.55],
                life: [0.5, 0.8],
                burst: [[BURST, 12]],
                speed: [1.5, 3],
                color: '#6a5e82',
                shape: new CircleEmitter({radius: 0.35, thickness: 1}),
                rotate: [Math.PI / 2, 0, 0],
            });
            // The aura: cold flames licking up the body, and streaks flying past it.
            const aura = fx.sys({
                tex: 'flame',
                blend: 'add',
                world: true,
                life: [0.3, 0.5],
                speed: [0.8, 1.6],
                size: [0.25, 0.45],
                rate: 50,
                color: SPEED[2],
                shape: new ConeEmitter({radius: 0.38, angle: 0.15, thickness: 0.2}),
                aim: 'up',
                parent: me.root,
                at: [0, 0.1, 0],
                order: 6,
                b: [tint(ramp(SPEED.slice(1, 6)), fadeOut(0.3, 0.1)), grow([0, 1], [1, 0.3])],
            });
            gate(aura, P, BURST, FADE, 50);
            const streaks = fx.sys({
                tex: 'streak',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.12, length: 1},
                blend: 'add',
                life: [0.18, 0.3],
                speed: [5, 8],
                size: [0.03, 0.05],
                rate: 22,
                color: SPEED[1],
                shape: new ConeEmitter({radius: 0.5, angle: 0.05, thickness: 0.3}),
                aim: 'up',
                parent: me.root,
                at: [0, 0.1, 0],
                order: 7,
                b: [tint(ramp(SPEED.slice(0, 4)), popOut(0.5))],
            });
            gate(streaks, P, BURST, HOLD, 22);
            // Crackle over the body while the boost holds.
            const top = fx.node('top', [0.15, 1.6, 0.25], me.root);
            const crackle = arcs(fx, {
                parent: me.root,
                at: [-0.2, 0.5, 0.25],
                to: top,
                rate: 9,
                width: [0.08, 0.14],
                palette: ramp(SPEED.slice(0, 4)),
                color: SPEED[2],
                order: 7,
            });
            gate(crackle, P, BURST, HOLD, 9);
            const glints = fx.sys({
                tex: 'glint',
                blend: 'add',
                life: 0.25,
                size: [0.15, 0.3],
                rate: 8,
                color: SPEED[1],
                shape: new SphereEmitter({radius: 0.6, thickness: 1}),
                parent: me.root,
                at: [0, 1, 0],
                order: 8,
                b: [tint(ramp(SPEED.slice(0, 3)), popOut(0.3))],
            });
            gate(glints, P, BURST, FADE, 8);
            overlay(fx, me.body, P, SPEED[4], 0.3, BURST, FADE);
            light(fx, {
                at: [0, 0.05, 0],
                size: 3.5,
                color: SPEED[3],
                floor: true,
                life: FADE - BURST,
                alpha: 0.4,
                time: BURST,
            });
            fx.every((t) => {
                // A crouch, the pop, then an eager bounce on the toes while the boost holds.
                const crouch = Math.sin(span(t, 0, BURST) * Math.PI) * 0.1;
                const bounce = t > BURST && t < FADE ? Math.abs(Math.sin((t - BURST) * 9)) * 0.06 : 0;
                me.body.scaling.set(1 + crouch * 0.6, 1 - crouch, 1 + crouch * 0.6);
                me.root.position.y = bounce;
            });
        },
    },
    {
        id: 'fusion/dash',
        name: 'Dash',
        loop: false,
        period: 2.4,
        view: {height: 1.1, distance: 7},
        build(fx) {
            const P = 2.4;
            const GO = 0.45;
            const STOP = 0.62;
            const FROM = -2;
            const TO = 2;
            const me = actor(fx, P, FROM, 1);
            // After-images, cold at the start and turning violet towards the end.
            const N = 5;
            for (let i = 0; i < N; i++) {
                const k = (i + 0.5) / N;
                const ghost = fx.node('ghost', [FROM + (TO - FROM) * k, 0, 0]);
                ghost.rotation.z = -0.12;
                const at = GO + (STOP - GO) * k;
                hero(fx, {
                    period: P,
                    parent: ghost,
                    blend: 'add',
                    color: DASH[Math.min(DASH.length - 1, 2 + Math.floor(k * 4))],
                    lighting: 'unlit',
                    order: 3,
                    fade: [
                        [0, 0],
                        [0, at / P],
                        [0.22, (at + 0.02) / P],
                        [0, (at + 0.45) / P],
                        [0, 1],
                    ],
                });
            }
            // Speed lines along the path, and a dust kick at both ends.
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.5, length: 1},
                blend: 'add',
                life: 0.3,
                speed: [9, 14],
                size: [0.02, 0.035],
                burst: [[GO, 22]],
                color: DASH[1],
                shape: new BoxEmitter({width: 0.1, height: 1.6, depth: 0.6}),
                aim: 'right',
                at: [FROM, 0.9, 0],
                order: 6,
                b: [tint(ramp(DASH.slice(0, 5)), popOut(0.4))],
            });
            dust(fx, {
                at: [FROM, 0.05, 0],
                size: [0.35, 0.6],
                life: [0.5, 0.8],
                burst: [[GO, 10]],
                speed: [1, 2.5],
                color: '#605470',
                shape: new ConeEmitter({radius: 0.2, angle: 0.5, thickness: 1}),
                aim: 'left',
                rotate: [-0.4, 0, 0],
            });
            dust(fx, {
                at: [TO + 0.2, 0.05, 0],
                size: [0.3, 0.55],
                life: [0.5, 0.9],
                burst: [[STOP, 12]],
                speed: [1.5, 3],
                color: '#605470',
                shape: new ConeEmitter({radius: 0.2, angle: 0.6, thickness: 1}),
                aim: 'right',
                rotate: [-0.4, 0, 0],
            });
            // Skid: hot sparks off the heel and a scuff along the floor.
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.1, length: 1},
                blend: 'add',
                life: [0.2, 0.4],
                speed: [2, 4],
                size: [0.03, 0.05],
                burst: [[STOP, 14]],
                color: '#ffe26b',
                shape: new ConeEmitter({radius: 0.05, angle: 0.7, thickness: 1}),
                aim: 'right',
                rotate: [-0.5, 0, 0],
                at: [TO, 0.05, 0],
                order: 7,
                b: [tint(PALETTE.fire, popOut(0.4)), gravity(9)],
            });
            fx.sys({
                tex: 'glow',
                mode: RenderMode.HorizontalBillBoard,
                life: 1.2,
                size: 0.9,
                burst: [[STOP, 1]],
                color: '#221a33',
                alpha: 0.6,
                at: [TO - 0.3, 0.014, 0],
                order: 1,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.05))],
            });
            overlay(fx, me.body, P, DASH[4], 0.3, GO - 0.05, STOP + 0.3);
            fx.every((t) => {
                const k = easeInOut(span(t, GO, STOP));
                me.root.position.x = FROM + (TO - FROM) * k;
                // Lean into the dash, rock back on the stop.
                const lean = t < STOP ? -0.25 * Math.sin(span(t, GO - 0.1, STOP) * Math.PI) : 0;
                const rock = t >= STOP ? 0.2 * Math.exp(-(t - STOP) * 6) * Math.sin((t - STOP) * 18) : 0;
                me.body.rotation.z = lean + rock;
            });
        },
    },
    {
        id: 'fusion/glint',
        name: 'Glint',
        loop: true,
        period: 2.6,
        view: {height: 1.3, distance: 4.5},
        build(fx) {
            const P = 2.6;
            const C: At = [0, 1.3, 0];
            // A cut gem turning slowly, the light catching it.
            const holder = fx.node('gem', C);
            solid(fx, part(fx, holder, [0, 0, 0], [0.45, 0.7, 0.45]), gem(), '#ffc23d', {
                life: P + 0.02,
                rim: [1, 0.9, 0.5],
                alpha: 0.95,
            });
            // The main glint: a four-point star that flares and spins.
            star(fx, {
                at: [0.12, 1.55, 0.3],
                size: 1.6,
                life: 0.6,
                time: 0.1,
                ramp: ramp(WARM.slice(0, 5)),
                grows: [
                    [0, 0.2],
                    [0.25, 1],
                    [1, 0.3],
                ],
                loop: true,
                order: 8,
            });
            star(fx, {
                at: [0.12, 1.55, 0.3],
                size: 0.8,
                life: 0.45,
                time: 1.4,
                ramp: ramp(COOL.slice(0, 4)),
                rot: Math.PI / 4,
                grows: [
                    [0, 0.2],
                    [0.3, 1],
                    [1, 0.2],
                ],
                loop: true,
                order: 8,
            });
            fx.sys({
                tex: 'glow',
                blend: 'add',
                life: 0.6,
                size: 1.8,
                burst: [[0.1, 1]],
                color: WARM[3],
                alpha: 0.6,
                at: [0.12, 1.55, 0.25],
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.15))],
            });
            // Satellite flares around it, warm and cold, each in its own moment.
            for (let i = 0; i < 9; i++) {
                const a = (i / 9) * Math.PI * 2 + 0.4;
                const d = 0.45 + (i % 3) * 0.22;
                star(fx, {
                    at: [Math.cos(a) * d, 1.3 + Math.sin(a) * d * 0.85, 0.2 + (i % 2) * 0.2],
                    size: 0.25 + (i % 3) * 0.08,
                    life: 0.45,
                    time: 0.15 + i * 0.25,
                    ramp: ramp((i % 3 === 0 ? COOL : WARM).slice(0, 5)),
                    grows: [
                        [0, 0.2],
                        [0.3, 1],
                        [1, 0],
                    ],
                    loop: true,
                    order: 8,
                });
            }
            // Dust motes drifting in the light.
            fx.sys({
                tex: 'dot',
                blend: 'add',
                life: [0.5, 0.9],
                speed: [0.05, 0.2],
                size: [0.02, 0.05],
                rate: 14,
                color: [WARM[1], COOL[2]],
                shape: new SphereEmitter({radius: 0.9, thickness: 1}),
                at: C,
                order: 7,
                b: [tint([['#ffffff', 0]], popOut(0.5)), gravity(-0.2)],
            });
            light(fx, {
                at: [0, 0.05, 0],
                size: 3,
                color: WARM[3],
                floor: true,
                life: P + 0.02,
                alpha: 0.25,
                loop: true,
            });
            fx.every((t) => {
                holder.rotation.y = (t / P) * Math.PI * 2;
                holder.position.y = C[1] + Math.sin((t / P) * Math.PI * 2) * 0.05;
            });
        },
    },
];
