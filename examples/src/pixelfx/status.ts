import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {CircleEmitter, ConeEmitter, RenderMode, SphereEmitter} from 'babylon.quarks';
import {held, window} from './arcane';
import {
    airDrag,
    extrude,
    fadeOut,
    floorBounce,
    gravity,
    grow,
    lathe,
    popOut,
    quad,
    turn as roll,
    spike,
    spin,
    tint,
    wobble,
} from './kit';
import {clods, dust, light, wedges, type At} from './parts';
import {PALETTE, decal, flames, sticker} from './recipes';
import {skull} from './shadow';
import {BODY, between, cutNode, hero} from './spawn';
import {type FxBuilder, type FxDef} from './stage';

const BLOOD = ['#350711', '#5e0c1b', '#931327', '#c71e33', '#f2384a', '#ff8a7a'];
const LOVE = ['#3a0a1e', '#7a1238', '#c4245a', '#f04e86', '#ff8ab0', '#ffc8da', '#ffffff'];
const DAZE = ['#1e0f2e', '#4b2070', '#8a3ab0', '#c66ae0', '#f0a8ff', '#ffffff'];
const HEX = ['#0c0612', '#1f0f2e', '#3a1a55', '#5e2a85', '#8a3fc0', '#b86ef0', '#e0b0ff', '#ffffff'];
const ICE = ['#151a3d', '#212f6b', '#2c58aa', '#3a8bd8', '#62c8f4', '#a6ecff', '#dcfbff', '#ffffff'];
const SPEED = ['#4c25ab', '#773ae4', '#5b6cff', '#5eb0ff', '#a3dcff', '#ccf6ff', '#ffffff'];
const STONE = ['#16141c', '#2a2733', '#433f4d', '#5f5a6a', '#7d7889', '#a29dab', '#cdc8d2', '#f0edf3'];
const TOXIC = ['#0e1d14', '#173320', '#23552e', '#318232', '#55b92f', '#8eea3f', '#cfff63', '#f6ffc2'];
const RAGE = ['#1a0208', '#4a0612', '#8a0c1c', '#c81828', '#ff3040', '#ff7a7a', '#ffc8c8', '#ffffff'];
const DREAM = ['#1a1636', '#3c3a7a', '#6f78c8', '#a9b8f0', '#dfe6ff', '#ffffff'];
const TIME = ['#081a24', '#0e3446', '#165a6e', '#2a8a9a', '#52bcc4', '#9ee6e0', '#e2fff8', '#ffffff'];
const STAR = ['#3a1e0c', '#8a4a12', '#d88a1c', '#f5c030', '#ffe36e', '#fff6c8', '#ffffff'];

/** The point on the stand-in body's skin at height `y`, `turn` radians round from the front. */
function skin(y: number, turn = 0, out = 0.02): At {
    const r = 0.36 + out;
    return [Math.sin(turn) * r, y, Math.cos(turn) * r];
}

/** A heart outline about one unit across, for {@link extrude}. */
function heartOutline(): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let i = 0; i < 48; i++) {
        const t = (i / 48) * Math.PI * 2;
        const x = 16 * Math.sin(t) ** 3;
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        out.push([x / 32, (y + 2) / 32]);
    }
    return out;
}

/** A five-pointed star, its points `outer` from the centre. */
function starOutline(outer = 0.5, inner = 0.22): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
        const r = i % 2 === 0 ? outer : inner;
        out.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return out;
}

/** A little bird in profile, facing +x, wing up. */
const BIRD_OUTLINE: Array<[number, number]> = [
    [0.5, 0.06],
    [0.36, 0.14],
    [0.28, 0.24],
    [0.12, 0.24],
    [0.02, 0.12],
    [-0.12, 0.42],
    [-0.2, 0.36],
    [-0.14, 0.1],
    [-0.5, 0.18],
    [-0.36, -0.02],
    [-0.12, -0.14],
    [0.18, -0.14],
    [0.34, -0.02],
];

const HEART = extrude(heartOutline(), 0.28);
const STAR5 = extrude(starOutline(), 0.18);
const BIRD = extrude(BIRD_OUTLINE, 0.12);
const BALL = lathe(
    Array.from({length: 11}, (_, i) => {
        const a = -Math.PI / 2 + (i / 10) * Math.PI;
        return [Math.max(0.001, Math.cos(a)), Math.sin(a)] as [number, number];
    }),
    16
);

/** A solid, lit, glossy shape riding `parent`: a heart, a star, a bird, an icicle. */
function solid(
    fx: FxBuilder,
    parent: TransformNode,
    o: {
        geo: ReturnType<typeof extrude>;
        color: string;
        rim?: [number, number, number];
        size?: number;
        time?: number;
        life?: number;
        loop?: boolean;
        order?: number;
        alpha?: Array<[number, number]>;
    }
) {
    return fx.sys({
        geo: o.geo,
        tex: 'white',
        blend: 'alpha',
        loop: o.loop ?? true,
        life: o.life ?? 1e4,
        size: o.size ?? 1,
        burst: [[o.time ?? 0, 1]],
        color: o.color,
        parent,
        order: o.order ?? 5,
        look: {
            lighting: 'fixed',
            scalingMode: 'hierarchy',
            rim: o.rim ? {color: o.rim, power: 2, strength: 1, mode: 'add'} : undefined,
        },
        b: o.alpha ? [tint([['#ffffff', 0]], o.alpha)] : [],
    });
}

/** A body flash: the hero's shape added over it in `color`, pulsing on `beats` (seconds). */
function flush(
    fx: FxBuilder,
    o: {period: number; color: string; beats: number[]; peak?: number; hold?: number; parent?: TransformNode}
) {
    const keys: Array<[number, number]> = [[0, 0]];
    for (const b of o.beats) {
        const t0 = b / o.period;
        const t1 = (b + 0.05) / o.period;
        const t2 = (b + (o.hold ?? 0.3)) / o.period;
        keys.push([0, Math.max(0, t0 - 0.001)], [o.peak ?? 0.7, t1], [0, Math.min(1, t2)]);
    }
    keys.push([0, 1]);
    keys.sort((a, b) => a[1] - b[1]);
    return hero(fx, {
        period: o.period,
        loop: true,
        blend: 'add',
        color: o.color,
        lighting: 'unlit',
        order: 4,
        parent: o.parent,
        fade: keys,
    });
}

/** Two eyes on the hero's face. */
function eyes(fx: FxBuilder, o: {color: string; size?: number; parent?: TransformNode; alpha?: number}) {
    return [-1, 1].map((side) =>
        fx.sys({
            tex: 'glow',
            life: 1e4,
            size: o.size ?? 0.16,
            burst: [[0, 1]],
            color: o.color,
            alpha: o.alpha,
            at: skin(1.6, side * 0.32, 0.03),
            parent: o.parent,
            order: 7,
            loop: true,
        })
    );
}

/** A node that judders sideways for `length` seconds after each beat. */
function shaker(fx: FxBuilder, beats: number[], amount: number, length = 0.2, period = 0): TransformNode {
    const node = fx.node('shake', [0, 0, 0]);
    fx.every((t) => {
        let k = 0;
        for (const b of beats) {
            const d = period ? (t - b + period) % period : t - b;
            if (d >= 0 && d < length) k = Math.max(k, 1 - d / length);
        }
        node.position.x = Math.sin(t * 70) * amount * k;
    });
    return node;
}

export const status: FxDef[] = [
    {
        id: 'status/bleeding',
        name: 'Bleeding',
        loop: true,
        period: 2.4,
        view: {height: 1.3, distance: 6.5},
        build(fx) {
            const P = 2.4;
            hero(fx, {period: P, loop: true});
            flush(fx, {period: P, color: BLOOD[3], beats: [0, 1.2], peak: 0.3, hold: 0.2});
            const wounds: At[] = [skin(1.3, 0.35), skin(1.0, -0.4), skin(0.75, 0.5)];
            wounds.forEach((w, i) => {
                // A bead swelling at the wound.
                fx.sys({
                    geo: BALL,
                    tex: 'white',
                    blend: 'alpha',
                    life: 0.8,
                    size: 0.06,
                    rate: 1.25,
                    delay: i * 0.25,
                    color: BLOOD[4],
                    at: w,
                    order: 5,
                    look: {lighting: 'fixed', rim: {color: [1, 0.5, 0.5], power: 2, strength: 0.6, mode: 'add'}},
                    b: [grow([0, 0.3], [0.8, 1.2], [1, 0.4])],
                });
                // It runs, lets go and falls, settling on the floor.
                fx.sys({
                    tex: 'dot',
                    mode: RenderMode.StretchedBillBoard,
                    stretch: {speed: 0.04, length: 1},
                    world: true,
                    life: [1.2, 1.5],
                    speed: [0.1, 0.3],
                    size: [0.06, 0.09],
                    rate: 1.25,
                    delay: i * 0.25 + 0.6,
                    color: [BLOOD[3], BLOOD[4]],
                    shape: new SphereEmitter({radius: 0.01, thickness: 1}),
                    at: w,
                    order: 6,
                    b: [gravity(9), floorBounce(0.05), tint([['#ffffff', 0]], fadeOut(0.85, 0))],
                });
                // A heartbeat spurt.
                fx.sys({
                    tex: 'dot',
                    world: true,
                    life: [0.5, 0.8],
                    speed: [1.2, 2],
                    size: [0.04, 0.07],
                    burst: [
                        [0.02, 4],
                        [1.22, 4],
                    ],
                    color: [BLOOD[3], BLOOD[5]],
                    shape: new ConeEmitter({radius: 0.02, angle: 0.5, thickness: 1}),
                    at: w,
                    rotate: [0, Math.atan2(w[0], w[2]), 0],
                    order: 6,
                    b: [gravity(9), floorBounce(0.05), tint([['#ffffff', 0]], fadeOut(0.8, 0))],
                });
            });
            // A glossy pool that ripples.
            decal(fx, {
                at: [0.1, 0.016, 0.45],
                size: 1.3,
                color: BLOOD[2],
                alpha: 0.9,
                life: 1e4,
                loop: true,
                alphas: [[1, 0]],
            });
            fx.sys({
                tex: 'glint',
                mode: RenderMode.HorizontalBillBoard,
                life: 1e4,
                size: 0.35,
                burst: [[0, 1]],
                color: BLOOD[5],
                alpha: 0.6,
                at: [0.25, 0.02, 0.55],
                order: 1,
            });
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 0.7,
                size: 0.7,
                rate: 2.5,
                color: BLOOD[5],
                alpha: 0.6,
                shape: new CircleEmitter({radius: 0.3, thickness: 1}),
                rotate: [Math.PI / 2, 0, 0],
                at: [0.1, 0.02, 0.45],
                order: 1,
                b: [tint([['#ffffff', 0]], popOut(0.3)), grow([0, 0.1], [1, 1])],
            });
        },
    },
    {
        id: 'status/burning',
        name: 'Burning',
        loop: true,
        period: 1.2,
        view: {height: 1.3, distance: 6.5},
        build(fx) {
            const P = 1.2;
            hero(fx, {period: P, loop: true, color: '#6e6470'});
            flush(fx, {period: P, color: '#fff3a6', beats: [0, 0.6], peak: 0.4, hold: 0.2});
            const spots: At[] = [skin(1.45, 0.4), skin(1.05, -0.5), skin(0.6, 0.6), skin(1.7, -0.2, -0.08)];
            for (const at of spots) {
                flames(fx, {at, radius: 0.06, height: 0.35, size: [0.14, 0.22], rate: 12, order: 5});
                flames(fx, {
                    at,
                    radius: 0.12,
                    height: 0.6,
                    size: [0.22, 0.34],
                    burst: [
                        [0, 5],
                        [0.6, 5],
                    ],
                    order: 5,
                });
                fx.sys({
                    tex: 'dot',
                    mode: RenderMode.StretchedBillBoard,
                    stretch: {speed: 0.06, length: 1},
                    world: true,
                    life: [0.4, 0.8],
                    speed: [1, 2],
                    size: [0.03, 0.05],
                    rate: 6,
                    color: '#ffc23d',
                    shape: new ConeEmitter({radius: 0.05, angle: 0.5, thickness: 1}),
                    aim: 'up',
                    at,
                    order: 6,
                    b: [tint(PALETTE.ember, popOut(0.5)), wobble(2, 1), gravity(-1)],
                });
                // A scorch mark on the skin.
                fx.sys({
                    tex: 'glow',
                    blend: 'alpha',
                    life: 1e4,
                    size: 0.3,
                    burst: [[0, 1]],
                    color: '#1a0e0a',
                    alpha: 0.7,
                    at: [at[0] * 1.04, at[1], at[2] * 1.04],
                    order: 4,
                });
            }
            dust(fx, {
                at: [0, 1.9, 0],
                size: [0.3, 0.5],
                life: [0.9, 1.3],
                rate: 5,
                speed: [0.5, 0.9],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.3, angle: 0.2, thickness: 1}),
                color: ['#3a3236', '#5e5458'],
                alpha: 0.35,
                lift: 0.5,
                loop: true,
            });
            light(fx, {at: [0, 0.05, 0], size: 2.6, color: '#ff8a2a', floor: true, life: P, alpha: 0.45, loop: true});
        },
    },
    {
        id: 'status/charmed',
        name: 'Charmed',
        loop: true,
        period: 2.4,
        view: {height: 1.3, distance: 6.5},
        build(fx) {
            const P = 2.4;
            hero(fx, {period: P, loop: true});
            flush(fx, {period: P, color: LOVE[3], beats: [0, 1.2], peak: 0.25, hold: 0.3});
            // A big heart beating over the head.
            const big = fx.node('heart', [0, 2.45, 0]);
            fx.every((t) => {
                const d = t % 1.2;
                const beat = d < 0.12 ? d / 0.12 : d < 0.4 ? 1 - (d - 0.12) / 0.28 : 0;
                big.scaling.setAll(0.75 * (1 + beat * 0.25));
                big.rotation.y = Math.sin(t * 1.3) * 0.4;
            });
            solid(fx, big, {geo: HEART, color: LOVE[3], rim: [1, 0.6, 0.8]});
            // A ring and a flush of light on every beat.
            for (const kind of ['ring', 'glow'] as const) {
                fx.sys({
                    tex: kind,
                    life: kind === 'ring' ? 0.6 : 0.4,
                    size: kind === 'ring' ? 1.8 : 1.6,
                    burst: [
                        [0, 1],
                        [1.2, 1],
                    ],
                    color: LOVE[4],
                    alpha: kind === 'ring' ? 0.9 : 0.5,
                    at: [0, 2.45, 0],
                    order: 6,
                    b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.4], [1, 1.1])],
                });
            }
            // Little hearts float up and sway.
            fx.sys({
                geo: HEART,
                tex: 'white',
                blend: 'alpha',
                life: [1.2, 1.6],
                speed: [0.5, 0.8],
                size: [0.26, 0.36],
                rate: 5,
                color: [LOVE[4], LOVE[5]],
                shape: new ConeEmitter({radius: 0.6, angle: 0.3, thickness: 1}),
                aim: 'up',
                at: [0, 1.7, 0],
                upright: true,
                order: 6,
                look: {lighting: 'fixed', rim: {color: [1, 0.6, 0.8], power: 2, strength: 1, mode: 'add'}},
                b: [grow([0, 0], [0.15, 1], [0.8, 1], [1, 0]), wobble(1.5, 0.5)],
            });
            // Pink eyes and blushing cheeks.
            eyes(fx, {color: LOVE[4], size: 0.2});
            for (const side of [-1, 1]) {
                fx.sys({
                    tex: 'glow',
                    life: 1e4,
                    size: 0.22,
                    burst: [[0, 1]],
                    color: LOVE[3],
                    alpha: 0.6,
                    at: skin(1.5, side * 0.6, 0.03),
                    order: 7,
                });
            }
        },
    },
    {
        id: 'status/confused',
        name: 'Confused',
        loop: true,
        period: 2.4,
        view: {height: 1.3, distance: 6.5},
        build(fx) {
            hero(fx, {period: 2.4, loop: true});
            // A glowing spiral whirling over the head, lying flat like a halo.
            sticker(fx, {
                tex: 'swirl',
                life: 1e4,
                size: 0.75,
                burst: [[0, 1]],
                color: DAZE[4],
                at: [0, 2.25, 0],
                aim: 'up',
                order: 6,
                b: [roll(-5, [0, 0, 1])],
            });
            fx.sys({
                tex: 'glow',
                life: 1e4,
                size: 0.9,
                burst: [[0, 1]],
                color: DAZE[3],
                alpha: 0.5,
                at: [0, 2.25, 0],
                order: 5,
            });
            // Question marks pop up round it and bob.
            fx.sys({
                tex: 'question',
                life: [0.9, 1.2],
                speed: [0.15, 0.3],
                size: [0.32, 0.42],
                rot: [-0.3, 0.3],
                rate: 2.5,
                color: '#ffd65a',
                shape: new CircleEmitter({radius: 0.55, thickness: 0.2}),
                rotate: [Math.PI / 2, 0, 0],
                at: [0, 2.15, 0],
                order: 7,
                b: [tint([['#ffffff', 0]], popOut(0.7)), grow([0, 0], [0.12, 1.25], [0.25, 1]), wobble(2, 0.3)],
            });
            // The eyes dart left and right.
            const pupils = fx.node('pupils', [0, 0, 0]);
            fx.every((t) => {
                pupils.position.x = Math.sign(Math.sin(t * 5.2)) * 0.035;
            });
            for (const side of [-1, 1]) {
                const at = skin(1.6, side * 0.3, 0.02);
                fx.sys({tex: 'dot', life: 1e4, size: 0.13, burst: [[0, 1]], color: '#ffffff', at, order: 7});
                fx.sys({
                    tex: 'dot',
                    blend: 'alpha',
                    life: 1e4,
                    size: 0.07,
                    burst: [[0, 1]],
                    color: '#1e0f2e',
                    at: [at[0], at[1], at[2] + 0.01],
                    parent: pupils,
                    order: 8,
                });
            }
        },
    },
    {
        id: 'status/cursed',
        name: 'Cursed',
        loop: true,
        period: 2.4,
        view: {height: 1.3, distance: 6.5},
        build(fx) {
            const P = 2.4;
            hero(fx, {period: P, loop: true});
            // A dark stain creeps up from the feet, its edge glowing.
            hero(fx, {
                period: P,
                loop: true,
                color: HEX[1],
                order: 4,
                cut: [
                    [0, 0],
                    [0.75, 0.75],
                    [0.75, 0.9],
                    [0, 1],
                ],
                edge: [1.4, 0.7, 2.2],
                edgeWidth: 0.06,
            });
            // Violet smoke rising off it in winding trails.
            fx.sys({
                tex: 'smoke',
                life: [1, 1.4],
                speed: [0.6, 1],
                size: [0.25, 0.4],
                rot: true,
                rate: 18,
                color: [HEX[3], HEX[5]],
                alpha: 0.55,
                shape: new ConeEmitter({radius: 0.4, angle: 0.1, thickness: 1}),
                aim: 'up',
                at: [0, 0.6, 0],
                order: 5,
                b: [tint([['#ffffff', 0]], fadeOut(0.4, 0.15)), grow([0, 0.6], [1, 1.4]), wobble(1.2, 1.2)],
            });
            eyes(fx, {color: HEX[5], size: 0.2});
            // A skull glitching in overhead.
            const head = fx.node('skull', [0, 2.35, 0]);
            // Tipped back a little so its face, not its crown, meets a camera above it.
            head.rotation.x = -0.3;
            const bone = skull(fx, head, {
                scale: 0.36,
                color: HEX[4],
                rim: [1, 0.5, 1.6],
                eye: HEX[6],
                life: 1e4,
                loop: true,
            });
            fx.every((t) => {
                const glitch = Math.sin(t * 37) > 0.75 || (t % 1.2 < 0.25 && Math.sin(t * 90) > 0);
                head.position.x = glitch ? Math.sin(t * 131) * 0.08 : 0;
                bone.scaling.set(0.36 * (glitch ? 1.15 : 1), 0.36 * (glitch ? 0.85 : 1), 0.36);
                bone.scaling.scaleInPlace(Math.min(1, (t % 2.4) / 0.15) + 0.001);
            });
        },
    },
    {
        id: 'status/frozen',
        name: 'Frozen',
        loop: true,
        period: 2,
        view: {height: 1.3, distance: 6.5},
        build(fx) {
            const P = 2;
            const body = shaker(fx, [0, 1], 0.025, 0.25, P);
            hero(fx, {period: P, loop: true, parent: body, color: '#8fa8c8'});
            // A frost shell over it.
            fx.sys({
                geo: BODY,
                image: 'diamond-shell',
                blend: 'add',
                life: P,
                size: 1,
                burst: [[0, 1]],
                color: ICE[5],
                alpha: 0.5,
                parent: body,
                order: 4,
                look: {
                    mapUV: {tiling: [3, 4]},
                    rim: {color: [0.6, 0.9, 1.4], power: 2, strength: 1, mode: 'add'},
                },
            });
            // Icicles at the chin and hands, dripping.
            const ICICLE = spike(0, 6);
            const tips: At[] = [skin(1.42, 0, -0.04), [-0.42, 0.95, 0.05], [0.42, 0.95, 0.05]];
            tips.forEach((at, i) => {
                const node = fx.node('icicle', at, body);
                node.rotation.z = Math.PI;
                node.scaling.set(0.35, i === 0 ? 0.28 : 0.22, 0.35);
                fx.sys({
                    geo: ICICLE,
                    tex: 'white',
                    blend: 'alpha',
                    life: 1e4,
                    size: 1,
                    burst: [[0, 1]],
                    color: ICE[6],
                    parent: node,
                    order: 5,
                    look: {
                        lighting: 'fixed',
                        scalingMode: 'hierarchy',
                        rim: {color: [0.6, 0.9, 1.3], power: 1.5, strength: 1, mode: 'add'},
                    },
                });
                fx.sys({
                    tex: 'dot',
                    world: true,
                    life: 0.6,
                    size: 0.05,
                    rate: 1.5,
                    delay: i * 0.3,
                    color: ICE[6],
                    at: [at[0], at[1] - (i === 0 ? 0.28 : 0.22), at[2]],
                    order: 6,
                    b: [gravity(9), floorBounce(0)],
                });
            });
            // Breath steaming.
            fx.sys({
                tex: 'smoke',
                life: [0.7, 1],
                speed: [0.4, 0.6],
                size: [0.12, 0.2],
                rot: true,
                burst: [
                    [0.2, 3],
                    [1.2, 3],
                ],
                color: ICE[6],
                alpha: 0.5,
                shape: new ConeEmitter({radius: 0.02, angle: 0.3, thickness: 1}),
                at: skin(1.5, 0, 0.02),
                order: 6,
                b: [tint([['#ffffff', 0]], fadeOut(0.3, 0.1)), grow([0, 0.5], [1, 2]), gravity(0.3, [0, 1, 0])],
            });
            // Snow settling.
            fx.sys({
                tex: 'flake',
                life: [1.6, 2],
                speed: [0.4, 0.6],
                size: [0.06, 0.1],
                rot: true,
                rate: 10,
                color: '#ffffff',
                shape: new ConeEmitter({radius: 1, angle: 0.1, thickness: 1}),
                aim: 'down',
                at: [0, 2.8, 0],
                order: 6,
                b: [tint([['#ffffff', 0]], fadeOut(0.8, 0.1)), wobble(1, 0.4), spin([-1, 1])],
            });
            // Frost spreading underfoot.
            decal(fx, {size: 2.4, color: ICE[5], alpha: 0.35, life: 1e4, loop: true, blend: 'add', alphas: [[1, 0]]});
            decal(fx, {
                tex: 'crack',
                size: 2,
                color: ICE[6],
                alpha: 0.5,
                life: 1e4,
                loop: true,
                blend: 'add',
                alphas: [[1, 0]],
            });
            fx.sys({
                tex: 'glint',
                life: [0.3, 0.5],
                size: [0.1, 0.18],
                rate: 10,
                color: '#ffffff',
                shape: new ConeEmitter({radius: 0.42, angle: 0, thickness: 0.3}),
                aim: 'up',
                at: [0, 0.2, 0],
                parent: body,
                order: 8,
                b: [tint([['#ffffff', 0]], popOut(0.3))],
            });
        },
    },
    {
        id: 'status/haste',
        name: 'Haste',
        loop: true,
        period: 1.2,
        view: {height: 1.3, distance: 6.5},
        build(fx) {
            const P = 1.2;
            const body = fx.node('body', [0.4, 0, 0]);
            fx.every((t) => {
                body.position.y = Math.abs(Math.sin((t / P) * Math.PI * 4)) * 0.05;
                body.rotation.z = -0.08;
            });
            hero(fx, {period: P, loop: true, parent: body});
            // Striped after-images streaming out behind.
            [0.65, 1.25, 1.8].forEach((dx, i) => {
                const ghost = fx.node('ghost', [-dx, 0, -0.05 * i], body);
                fx.sys({
                    geo: BODY,
                    image: 'scanlines',
                    blend: 'add',
                    life: P,
                    size: 1,
                    burst: [[0, 1]],
                    color: SPEED[2 + i],
                    alpha: 0.5 - i * 0.13,
                    parent: ghost,
                    order: 3 - i,
                    look: {mapUV: {tiling: [1, 10], scroll: [0, 1.5]}, renderFace: 'front'},
                });
            });
            // Speed lines whipping past.
            fx.sys({
                tex: 'streak',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.12, length: 1},
                life: [0.2, 0.3],
                speed: [9, 12],
                size: [0.05, 0.08],
                rate: 24,
                color: [SPEED[4], SPEED[6]],
                shape: new ConeEmitter({radius: 1.1, angle: 0, thickness: 1}),
                aim: 'left',
                at: [2.2, 1, 0],
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.5))],
            });
            // Dust off the heels.
            dust(fx, {
                at: [0.2, 0.08, 0],
                size: [0.25, 0.4],
                life: [0.4, 0.6],
                rate: 12,
                speed: [1.5, 2.5],
                aim: 'left',
                shape: new ConeEmitter({radius: 0.15, angle: 0.4, thickness: 1}),
                color: ['#8a8090', '#a89ea8'],
                alpha: 0.5,
                loop: true,
            });
        },
    },
    {
        id: 'status/petrified',
        name: 'Petrified',
        loop: false,
        period: 3.8,
        view: {height: 1.3, distance: 6.5},
        build(fx) {
            const P = 3.8;
            const BURST = 2.8;
            hero(fx, {period: P, life: BURST, color: '#a07e6c'});
            // Grey creeps up from the feet behind a crackling edge that spits grit.
            const cut = (t: number) => 0.05 + 0.95 * between(t, 0.1, 1.3);
            hero(fx, {
                period: P,
                life: BURST,
                color: STONE[5],
                order: 4,
                cut: [
                    [0.02, 0],
                    [0.02, 0.1 / BURST],
                    [1, 1.3 / BURST],
                    [1, 1],
                ],
                edge: [1.6, 1.5, 1.4],
                edgeWidth: 0.05,
            });
            const edge = cutNode(fx, cut);
            const grit = fx.sys({
                tex: 'dot',
                world: true,
                life: [0.4, 0.7],
                speed: [0.8, 1.6],
                size: [0.03, 0.05],
                color: [STONE[5], STONE[7]],
                shape: new CircleEmitter({radius: 0.38, thickness: 0}),
                rotate: [Math.PI / 2, 0, 0],
                parent: edge,
                order: 6,
                b: [gravity(6), floorBounce(0.2)],
            });
            window(grit, P, 0.1, 1.3, 50);
            // Cracks run through the statue.
            [
                [1.4, 0.2, 2.0],
                [1.0, -0.4, 2.15],
                [0.6, 0.5, 2.3],
                [1.65, -0.2, 2.45],
            ].forEach(([y, turn, at]) => {
                sticker(fx, {
                    rotate: [0, turn, 0],
                    tex: 'crack',
                    blend: 'alpha',
                    loop: false,
                    life: BURST - at,
                    size: 0.5,
                    turn: at * 2.7,
                    burst: [[at, 1]],
                    color: STONE[0],
                    at: skin(y, turn, 0.03),
                    order: 5,
                    b: [grow([0, 0.3], [0.15, 1])],
                });
            });
            // It bursts into tumbling chunks and dust.
            clods(fx, {
                count: 40,
                color: [STONE[3], STONE[5]],
                shape: new ConeEmitter({radius: 0.35, angle: 0.4, thickness: 1}),
                aim: 'up',
                at: [0, 0.1, 0],
                speed: [1.5, 4],
                size: [0.1, 0.22],
                delay: BURST,
                life: [1, 1.4],
            });
            clods(fx, {
                count: 20,
                color: [STONE[4], STONE[6]],
                shape: new SphereEmitter({radius: 0.4, thickness: 1}),
                at: [0, 1.4, 0],
                speed: [1, 3],
                size: [0.08, 0.16],
                delay: BURST,
                life: [1, 1.4],
            });
            dust(fx, {
                at: [0, 0.9, 0],
                size: [0.8, 1.2],
                life: [1, 1.4],
                burst: [[BURST, 14]],
                speed: [1, 2.2],
                shape: new SphereEmitter({radius: 0.5, thickness: 1}),
                color: [STONE[4], STONE[6]],
                alpha: 0.6,
                loop: false,
            });
        },
    },
    {
        id: 'status/poisoned',
        name: 'Poisoned',
        loop: true,
        period: 1.6,
        view: {height: 1.3, distance: 6.5},
        build(fx) {
            const P = 1.6;
            const body = fx.node('body', [0, 0, 0]);
            fx.every((t) => {
                const d = t % 0.8;
                const w = d < 0.3 ? Math.sin((d / 0.3) * Math.PI * 2) * (1 - d / 0.3) : 0;
                body.scaling.set(1 + w * 0.06, 1 - w * 0.06, 1 + w * 0.06);
            });
            hero(fx, {period: P, loop: true, parent: body, color: '#7f8a84'});
            // Green rolling up the body in waves.
            hero(fx, {
                period: P,
                loop: true,
                parent: body,
                blend: 'add',
                color: TOXIC[3],
                lighting: 'unlit',
                order: 4,
                cut: [
                    [0, 0],
                    [0.55, 0.45],
                    [0, 0.5],
                    [0.55, 0.95],
                    [0, 1],
                ],
                edge: [0.8, 1.6, 0.4],
                edgeWidth: 0.1,
            });
            // Dark veins creeping from a wound.
            sticker(fx, {
                rotate: [0, 0.25, 0],
                tex: 'crack',
                blend: 'alpha',
                life: 1e4,
                size: 0.7,
                burst: [[0, 1]],
                turn: 0.4,
                color: '#2c1a3a',
                alpha: 0.85,
                at: skin(1.15, 0.25, 0.03),
                parent: body,
                order: 5,
                look: {scalingMode: 'hierarchy'},
            });
            // Toxic sweat dripping and hissing.
            fx.sys({
                tex: 'dot',
                world: true,
                life: [0.6, 0.9],
                speed: [0.1, 0.3],
                size: [0.04, 0.07],
                rate: 8,
                color: [TOXIC[5], TOXIC[6]],
                shape: new ConeEmitter({radius: 0.4, angle: 0, thickness: 0.1}),
                aim: 'down',
                at: [0, 1.5, 0],
                order: 6,
                b: [gravity(6), floorBounce(0)],
            });
            // Blisters popping and a ring pulsing out every wobble.
            fx.sys({
                tex: 'dot',
                life: [0.3, 0.5],
                speed: [0.6, 1.2],
                size: [0.05, 0.09],
                burst: [
                    [0, 10],
                    [0.8, 10],
                ],
                color: [TOXIC[5], TOXIC[7]],
                shape: new SphereEmitter({radius: 0.42, thickness: 0.1}),
                at: [0, 1.1, 0],
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.3)), gravity(3)],
            });
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 0.6,
                size: 2.4,
                burst: [
                    [0, 1],
                    [0.8, 1],
                ],
                color: TOXIC[5],
                at: [0, 0.04, 0],
                order: 1,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.3], [1, 1])],
            });
            fx.sys({
                tex: 'smoke',
                life: [0.8, 1.1],
                speed: [0.3, 0.5],
                size: [0.25, 0.35],
                rot: true,
                rate: 6,
                color: TOXIC[3],
                alpha: 0.35,
                shape: new ConeEmitter({radius: 0.4, angle: 0.2, thickness: 1}),
                aim: 'up',
                at: [0, 1, 0],
                order: 5,
                b: [tint([['#ffffff', 0]], fadeOut(0.4, 0.2)), grow([0, 0.6], [1, 1.3])],
            });
            light(fx, {at: [0, 0.05, 0], size: 2.6, color: TOXIC[4], floor: true, life: P, alpha: 0.4, loop: true});
        },
    },
    {
        id: 'status/rage',
        name: 'Rage',
        loop: true,
        period: 1.2,
        view: {height: 1.3, distance: 6.5},
        build(fx) {
            const P = 1.2;
            const body = shaker(fx, [0, 0.6], 0.04, 0.2, P);
            hero(fx, {period: P, loop: true, parent: body});
            flush(fx, {period: P, color: RAGE[3], beats: [0, 0.6], peak: 0.45, hold: 0.3, parent: body});
            eyes(fx, {color: RAGE[4], size: 0.2, parent: body});
            // An anger mark throbbing at the temple.
            const mark = fx.node('mark', skin(1.72, 0.7, 0.08), body);
            fx.every((t) => {
                const d = t % 0.6;
                mark.scaling.setAll(1 + (d < 0.1 ? d / 0.1 : Math.max(0, 1 - (d - 0.1) / 0.3)) * 0.35);
            });
            fx.sys({
                tex: 'anger',
                life: 1e4,
                size: 0.38,
                burst: [[0, 1]],
                color: RAGE[4],
                parent: mark,
                order: 8,
                look: {scalingMode: 'hierarchy'},
            });
            // Steam jetting off the head.
            fx.sys({
                tex: 'smoke',
                life: [0.4, 0.6],
                speed: [2, 3],
                size: [0.18, 0.28],
                rot: true,
                burst: [
                    [0, 5],
                    [0.6, 5],
                ],
                color: '#e8e0e0',
                alpha: 0.6,
                shape: new ConeEmitter({radius: 0.15, angle: 0.35, thickness: 1}),
                aim: 'up',
                at: [0, 1.85, 0],
                order: 6,
                b: [tint([['#ffffff', 0]], fadeOut(0.3, 0.05)), grow([0, 0.6], [1, 2]), airDrag(3)],
            });
            // Stress lines flashing out.
            for (const time of [0, 0.6]) {
                wedges(fx, {
                    at: [0, 1.6, 0.3],
                    radius: 0.75,
                    count: 8,
                    size: [0.06, 0.09],
                    color: RAGE[5],
                    time,
                    blend: 'add',
                    reach: 3,
                });
            }
            // The floor cracking hot underfoot.
            decal(fx, {
                tex: 'crack',
                size: 2.2,
                color: RAGE[4],
                alpha: 0.9,
                life: P,
                loop: true,
                blend: 'add',
                alphas: [
                    [1, 0],
                    [0.4, 0.4],
                    [1, 0.5],
                    [0.4, 0.9],
                    [1, 1],
                ],
            });
            light(fx, {at: [0, 0.05, 0], size: 2.6, color: RAGE[3], floor: true, life: P, alpha: 0.4, loop: true});
        },
    },
    {
        id: 'status/sleep',
        name: 'Sleep',
        loop: true,
        period: 2.4,
        view: {height: 1.3, distance: 6.5},
        build(fx) {
            const P = 2.4;
            const body = fx.node('body', [0, 0, 0]);
            fx.every((t) => {
                body.scaling.set(1 + Math.sin((t / P) * Math.PI * 2) * 0.015, 1, 1);
            });
            hero(fx, {period: P, loop: true, parent: body});
            // Eyes shut: two dark lines.
            for (const side of [-1, 1]) {
                fx.sys({
                    tex: 'streak',
                    blend: 'alpha',
                    life: 1e4,
                    size: 0.16,
                    burst: [[0, 1]],
                    color: DREAM[0],
                    at: skin(1.58, side * 0.3, 0.03),
                    order: 7,
                });
            }
            // Zs float up one after another, swaying and growing.
            fx.sys({
                tex: 'zee',
                life: 2.2,
                speed: 0.45,
                size: 0.42,
                rot: [-0.25, 0.1],
                burst: [
                    [0, 1],
                    [0.8, 1],
                    [1.6, 1],
                ],
                color: DREAM[4],
                shape: new ConeEmitter({radius: 0, angle: 0.15, thickness: 1}),
                aim: 'up',
                at: [0.2, 1.95, 0.1],
                order: 7,
                b: [tint([['#ffffff', 0]], fadeOut(0.6, 0.1)), grow([0, 0.5], [1, 2]), wobble(0.8, 0.6)],
            });
            // Dream motes drifting, a slow breathing glow.
            fx.sys({
                tex: 'glint',
                life: [1.2, 1.8],
                speed: [0.1, 0.25],
                size: [0.08, 0.14],
                rate: 5,
                color: [DREAM[3], DREAM[5]],
                shape: new SphereEmitter({radius: 0.8, thickness: 1}),
                at: [0, 1.6, 0],
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.5)), wobble(0.6, 0.4)],
            });
            fx.sys({
                tex: 'glow',
                life: P,
                size: 2.6,
                burst: [[0, 1]],
                color: DREAM[2],
                at: [0, 1, 0],
                order: 1,
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [0.15, 0],
                            [0.35, 0.5],
                            [0.15, 1],
                        ]
                    ),
                ],
            });
        },
    },
    {
        id: 'status/slowed',
        name: 'Slowed',
        loop: true,
        period: 2.4,
        view: {height: 1.3, distance: 6.5},
        build(fx) {
            const P = 2.4;
            hero(fx, {period: P, loop: true});
            // A glassy clock dial behind the head.
            const dial = fx.node('dial', [0, 1.75, -0.45]);
            // The face is a sticker in the dial's plane, so it turns with the hands drawn on it.
            sticker(fx, {
                tex: 'dial',
                life: 1e4,
                size: 1.5,
                burst: [[0, 1]],
                color: TIME[5],
                alpha: 0.9,
                parent: dial,
                order: 2,
            });
            fx.sys({
                tex: 'glow',
                life: 1e4,
                size: 1.7,
                burst: [[0, 1]],
                color: TIME[3],
                alpha: 0.35,
                parent: dial,
                order: 1,
            });
            // Its hands tick round in heavy steps, flashing with each.
            const hands: Array<[number, number, number]> = [
                // length, width, steps per period
                [0.55, 0.05, 4],
                [0.36, 0.07, 1],
            ];
            hands.forEach(([len, width, steps]) => {
                const pivot = fx.node('hand', [0, 0, 0.02], dial);
                fx.every((t) => {
                    const step = (P / steps) * 1;
                    const n = Math.floor(t / step);
                    const k = Math.min(1, ((t % step) / step) * 6);
                    const settle = k < 1 ? 1 - (1 - k) ** 3 + Math.sin(k * Math.PI) * 0.15 : 1;
                    pivot.rotation.z = -((n + settle) * Math.PI * 2) / 12 / (steps === 1 ? 1 : 1);
                });
                const arm = fx.node('arm', [0, len / 2, 0], pivot);
                arm.scaling.set(width, len, 1);
                fx.sys({
                    geo: quad(),
                    tex: 'white',
                    blend: 'add',
                    life: 1e4,
                    size: 1,
                    burst: [[0, 1]],
                    color: TIME[6],
                    parent: arm,
                    order: 3,
                    look: {renderFace: 'both', scalingMode: 'hierarchy'},
                });
            });
            fx.sys({
                tex: 'glow',
                life: 0.3,
                size: 1.9,
                burst: [
                    [0, 1],
                    [0.6, 1],
                    [1.2, 1],
                    [1.8, 1],
                ],
                color: TIME[5],
                alpha: 0.5,
                parent: dial,
                order: 2,
                b: [tint([['#ffffff', 0]], popOut(0.1))],
            });
            // Drops sinking in slow motion and spreading slow rings.
            fx.sys({
                tex: 'dot',
                world: true,
                life: 2.4,
                size: [0.06, 0.09],
                rate: 1.6,
                color: TIME[6],
                shape: new ConeEmitter({radius: 0.9, angle: 0, thickness: 1}),
                aim: 'down',
                at: [0, 2.2, 0.2],
                order: 6,
                b: [gravity(0.75), floorBounce(0), tint([['#ffffff', 0]], fadeOut(0.85, 0.05))],
            });
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 1.6,
                size: 1.1,
                rate: 1.6,
                color: TIME[5],
                alpha: 0.7,
                shape: new CircleEmitter({radius: 0.9, thickness: 1}),
                rotate: [Math.PI / 2, 0, 0],
                at: [0, 0.03, 0.2],
                order: 1,
                b: [tint([['#ffffff', 0]], popOut(0.3)), grow([0, 0.1], [1, 1])],
            });
            light(fx, {at: [0, 0.05, 0], size: 2.6, color: TIME[4], floor: true, life: P, alpha: 0.35, loop: true});
        },
    },
    {
        id: 'status/stunned',
        name: 'Stunned',
        loop: true,
        period: 2,
        view: {height: 1.3, distance: 6.5},
        build(fx) {
            hero(fx, {period: 2, loop: true});
            // Three stars and two little birds round the head on a tilted ring.
            const tilt = fx.node('tilt', [0, 2.05, 0]);
            tilt.rotation.set(0.2, 0, 0.15);
            const turn = fx.node('turn', [0, 0, 0], tilt);
            fx.every((t) => {
                turn.rotation.y = -t * Math.PI;
            });
            const R = 0.55;
            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * Math.PI * 2;
                const rider = fx.node('rider', [Math.cos(a) * R, 0, Math.sin(a) * R], turn);
                const bird = i % 2 === 1 && i < 4;
                fx.every((t) => {
                    if (bird) {
                        // Flying round, facing along the ring.
                        rider.rotation.y = -a + Math.PI;
                        rider.position.y = Math.sin(t * 9 + i) * 0.04;
                    } else {
                        rider.rotation.z = t * 4;
                        rider.rotation.y = t * Math.PI;
                    }
                });
                rider.scaling.setAll(bird ? 0.42 : 0.32);
                solid(fx, rider, {
                    geo: bird ? BIRD : STAR5,
                    color: bird ? '#f4f0ff' : STAR[4],
                    rim: bird ? [0.6, 0.6, 0.8] : [1, 0.8, 0.3],
                });
                if (!bird) {
                    fx.sys({
                        tex: 'glint',
                        world: true,
                        life: [0.3, 0.5],
                        size: [0.06, 0.1],
                        rate: 16,
                        color: [STAR[5], '#ffffff'],
                        parent: rider,
                        order: 7,
                        b: [tint([['#ffffff', 0]], popOut(0.3)), gravity(0.6)],
                    });
                    held(fx, rider, {size: 0.4, color: STAR[4], alpha: 0.5});
                }
            }
        },
    },
];
