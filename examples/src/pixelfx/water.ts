import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import type {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {ParticleSystem} from 'babylon.quarks';
import {BoxEmitter, CircleEmitter, ConeEmitter, HemisphereEmitter, RenderMode, SphereEmitter} from 'babylon.quarks';
import type {Geometry, SysOptions} from './kit';
import {airDrag, fadeOut, gravity, grow, lathe, lens, orbit, popOut, spin, subEmit, tint, wobble} from './kit';
import {FLAT, dust, gate, light, star, type At} from './parts';
import type {Ramp} from './recipes';
import {shapes, type FxBuilder, type FxDef} from './stage';
import {image} from './textures';

/** Water cooling from a white fleck to the body's blue. */
const WATER: Ramp = [
    ['#ffffff', 0],
    ['#c8eeff', 0.3],
    ['#6ab8f0', 1],
];
const FOAM = '#eef8ff';

/** A still dark pool lying on the floor (or at `at`), the stage for splashes and rings. */
function pool(fx: FxBuilder, radius: number, at: At = [0, 0, 0], squash = 1) {
    // A shallow lens of water with a wandering edge, as a puddle lies, rather than a cut disc.
    return fx.sys({
        geo: lens(PUDDLE_EDGE, 0.02, {sx: radius, sz: radius * squash, power: 0.15}),
        tex: 'white',
        blend: 'alpha',
        loop: false,
        life: 1e4,
        size: 1,
        burst: 1,
        color: '#071a30',
        at,
        order: 1,
    });
}

/** A puddle's edge: a radius near 1 that wanders gently round it. */
const PUDDLE_EDGE = (a: number) =>
    1 + 0.05 * Math.sin(3 * a + 1) + 0.04 * Math.sin(5 * a + 2.5) + 0.025 * Math.sin(8 * a);

/** Rings spreading over the water from where drops land. */
function rings(
    fx: FxBuilder,
    o: Partial<
        Pick<
            SysOptions,
            'at' | 'burst' | 'rate' | 'shape' | 'delay' | 'loop' | 'world' | 'parent' | 'duration' | 'rotate'
        >
    > & {
        size?: number;
        life?: number;
        alpha?: number;
        color?: string;
    }
) {
    return fx.sys({
        tex: 'ring',
        mode: RenderMode.HorizontalBillBoard,
        life: o.life ?? 0.9,
        size: o.size ?? 1.6,
        color: o.color ?? '#bfe6ff',
        alpha: o.alpha,
        order: 2,
        ...o,
        at: o.at ?? [0, 0.05, 0],
        b: [tint([['#ffffff', 0]], popOut(0.1)), grow([0, 0.05], [0.4, 0.75], [1, 1])],
    });
}

/** Beads of water thrown out and falling, stretched along their flight. */
function beads(
    fx: FxBuilder,
    o: Partial<
        Pick<
            SysOptions,
            | 'at'
            | 'shape'
            | 'aim'
            | 'rotate'
            | 'burst'
            | 'rate'
            | 'delay'
            | 'duration'
            | 'loop'
            | 'world'
            | 'parent'
            | 'speed'
            | 'size'
            | 'life'
            | 'order'
        >
    > & {fall?: number; streak?: number; bounce?: boolean}
) {
    return fx.sys({
        tex: 'dot',
        mode: RenderMode.StretchedBillBoard,
        stretch: {speed: o.streak ?? 0.06, length: 1},
        life: [0.5, 0.8],
        speed: [2, 4],
        size: [0.05, 0.09],
        shape: new ConeEmitter({radius: 0.1, angle: 0.6}),
        aim: 'up',
        order: 4,
        ...o,
        b: [tint(WATER, fadeOut(0.75, 0.02)), gravity(o.fall ?? 10), airDrag(0.4)],
    });
}

/** Soft white foam or mist: pixelfx's smoke puff in white, swelling and thinning. */
function foam(fx: FxBuilder, o: Parameters<typeof dust>[1]) {
    return dust(fx, {alpha: 0.45, drag: 3, lift: 0.4, soft: false, ...o});
}

/**
 * Running water as a mesh: `geo` drawn twice with the water band, its far side translucent and its near
 * side added in light, the band scrolled along V so it flows.
 */
function flow(
    fx: FxBuilder,
    o: {
        geo: Geometry;
        tiling: [number, number];
        scroll: [number, number];
        parent?: TransformNode;
        at?: At;
        rotate?: [number, number, number];
        size?: number;
        life?: number;
        time?: number;
        color?: string;
        alpha?: [number, number];
        order?: number;
        band?: 'water-band' | 'whirl-band';
        ramp?: Array<[number, number]>;
        rim?: boolean;
    }
): ParticleSystem[] {
    const one = o.life !== undefined;
    const base = {
        image: o.band ?? 'water-band',
        geo: o.geo,
        life: o.life ?? 1e4,
        size: o.size ?? 1,
        burst: [[o.time ?? 0, 1]] as Array<[number, number]>,
        loop: false,
        parent: o.parent,
        at: o.at,
        rotate: o.rotate,
        b: one ? [tint([['#ffffff', 0]], o.ramp ?? fadeOut(0.6, 0.05))] : [],
    };
    const mapUV = {tiling: o.tiling, scroll: o.scroll};
    const [back, front] = o.alpha ?? [0.45, 0.85];
    return [
        fx.sys({
            ...base,
            blend: 'alpha',
            color: '#5a8ec8',
            alpha: back,
            order: o.order ?? 3,
            look: {mapUV, renderFace: 'back', scalingMode: 'hierarchy'},
        }),
        fx.sys({
            ...base,
            blend: 'add',
            color: o.color ?? '#9fd4ff',
            alpha: front,
            order: (o.order ?? 3) + 1,
            look: {
                mapUV,
                renderFace: 'front',
                scalingMode: 'hierarchy',
                rim: o.rim ? {color: [0.85, 0.97, 1], power: 2.2, strength: 0.8, mode: 'fade'} : undefined,
            },
        }),
    ];
}

/** A ring of rocks lying round a pool or a vent. */
function rocks(fx: FxBuilder, count: number, radius: number, size: number, y = 0.05, color = '#3e3c4a') {
    for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + Math.sin(i * 7.1) * 0.2;
        const r = size * (0.75 + 0.35 * Math.abs(Math.sin(i * 3.7)));
        const rock = fx.prop(shapes.ico(fx.scene, r), {
            at: [Math.cos(a) * radius, y + r * 0.3, Math.sin(a) * radius],
            rotate: [i, i * 2.3, 0],
            color,
        });
        rock.scaling.y = 0.7;
    }
}

/** A smooth bump: 0 at 0 and 1, 1 at the middle. */
function bump(k: number) {
    return k <= 0 || k >= 1 ? 0 : Math.sin(k * Math.PI);
}

function clamp01(k: number) {
    return Math.max(0, Math.min(1, k));
}

/** A sheet falling from a lip: U across (`width`), V down from the lip (0) to the pool (1), facing +z. */
function sheet(width: number, top: number, bottom: number, bulge: number, spread: number): Geometry {
    const cols = 10;
    const rows = 28;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let j = 0; j <= rows; j++) {
        const v = j / rows;
        // Thrown forward off the lip, then falling nearly straight.
        const y = top + (bottom - top) * v;
        const z = bulge * Math.sqrt(v) * (1 - 0.3 * v);
        const w = width * (1 + spread * v * v);
        for (let i = 0; i <= cols; i++) {
            const u = i / cols;
            positions.push((u - 0.5) * w, y, z + 0.08 * Math.sin(u * 9 + v * 2));
            normals.push(0, 0, 1);
            uvs.push(u, v);
        }
    }
    for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
            const a = j * (cols + 1) + i;
            const b = a + cols + 1;
            indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
    }
    return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        uvs: new Float32Array(uvs),
        indices: new Uint32Array(indices),
    };
}

/** A sphere of radius 1 as a lathe profile. */
function globe(rows = 20): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let i = 0; i <= rows; i++) {
        const lat = -Math.PI / 2 + (i / rows) * Math.PI;
        out.push([Math.max(0.001, Math.cos(lat)), Math.sin(lat)]);
    }
    return out;
}

/** Catmull-Rom through `points`, `steps` per span, ends held. */
function smoothPath(points: Array<[number, number]>, steps: number): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    const n = points.length;
    for (let i = 0; i < n - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(n - 1, i + 2)];
        for (let s = 0; s < steps; s++) {
            const t = s / steps;
            const t2 = t * t;
            const t3 = t2 * t;
            const f = (a: number, b: number, c: number, d: number) =>
                0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
            out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
        }
    }
    out.push(points[n - 1]);
    return out;
}

/** The wave's cross-section at keyframes: from the back foot over the crest to the face's foot. */
const WAVE_KEYS: Array<[number, Array<[number, number]>]> = [
    [
        0,
        [
            [-4.4, 0],
            [-3.8, 0.04],
            [-3.4, 0.12],
            [-3.0, 0.2],
            [-2.7, 0.24],
            [-2.4, 0.2],
            [-2.1, 0.12],
            [-1.8, 0.04],
            [-1.5, 0],
        ],
    ],
    [
        0.55,
        [
            [-4.2, 0],
            [-3.4, 0.25],
            [-2.6, 0.6],
            [-2.0, 0.9],
            [-1.5, 1.05],
            [-1.1, 0.9],
            [-0.8, 0.55],
            [-0.5, 0.2],
            [-0.2, 0],
        ],
    ],
    [
        1.07,
        [
            [-3.8, 0],
            [-2.6, 0.6],
            [-1.6, 1.3],
            [-0.8, 1.85],
            [-0.2, 2.05],
            [0.45, 1.85],
            [0.62, 1.35],
            [0.2, 0.85],
            [0.35, 0],
        ],
    ],
    [
        1.43,
        [
            [-3.4, 0],
            [-2.4, 0.4],
            [-1.5, 0.9],
            [-0.7, 1.25],
            [-0.1, 1.35],
            [0.6, 1.1],
            [1.1, 0.45],
            [1.2, 0.08],
            [1.3, 0],
        ],
    ],
    [
        1.85,
        [
            [-3.0, 0],
            [-2.2, 0.1],
            [-1.4, 0.25],
            [-0.6, 0.38],
            [0, 0.42],
            [0.6, 0.34],
            [1.1, 0.18],
            [1.4, 0.05],
            [1.6, 0],
        ],
    ],
    [
        2.5,
        [
            [-3.0, 0],
            [-2.2, 0],
            [-1.4, 0.01],
            [-0.6, 0.02],
            [0, 0.02],
            [0.6, 0.02],
            [1.1, 0.01],
            [1.4, 0],
            [1.6, 0],
        ],
    ],
];

/** The wave's cross-section at time `t`, eased between keyframes. */
function waveAt(t: number): Array<[number, number]> {
    let i = 0;
    while (i < WAVE_KEYS.length - 2 && t > WAVE_KEYS[i + 1][0]) i++;
    const [t0, a] = WAVE_KEYS[i];
    const [t1, b] = WAVE_KEYS[i + 1];
    const k = clamp01((t - t0) / (t1 - t0));
    const e = k * k * (3 - 2 * k);
    return a.map(([x, y], j) => [x + (b[j][0] - x) * e, y + (b[j][1] - y) * e]);
}

/** pixelfx's water category, rebuilt as 3D particle effects. */
export const water: FxDef[] = [
    {
        id: 'water/bubbles',
        name: 'Bubbles',
        loop: true,
        period: 4,
        view: {height: 2.1, distance: 9},
        build(fx) {
            // bubbles.js in 3D: a tank of dark water with a pebble vent on its bed; bubbles wobble up in
            // trains, swelling as they rise, and pop at a bright surface; shafts of light slant down
            // through it and motes hang in the water.
            const surface = 4.2;
            const R = 1.8;
            // See-through props draw before the particles (a lower alpha index), so they never cover them.
            fx.prop(shapes.cylinder(fx.scene, surface, R, R, 48), {
                at: [0, surface / 2, 0],
                color: '#0a2440',
                glow: '#061a30',
                alpha: 0.32,
            }).alphaIndex = 0;
            fx.prop(shapes.cylinder(fx.scene, 0.12, R, R, 48), {at: [0, 0.06, 0], color: '#2a2836'});
            for (let i = 0; i < 9; i++) {
                const a = (i / 9) * Math.PI * 2;
                const r = 0.1 + (0.25 * ((i * 37) % 10)) / 10;
                fx.prop(shapes.ico(fx.scene, 0.1 + 0.05 * (i % 3)), {
                    at: [Math.cos(a) * r, 0.15, Math.sin(a) * r],
                    rotate: [i, i * 1.3, 0],
                    color: '#4a4652',
                });
            }
            // The surface: a lit sheet with a bright edge, glinting.
            fx.prop(shapes.cylinder(fx.scene, 0.02, R, R, 48), {
                at: [0, surface, 0],
                color: '#3a7ab8',
                glow: '#1a5a98',
                alpha: 0.35,
            }).alphaIndex = 0;
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 1e4,
                size: R * 2.08,
                burst: 1,
                loop: false,
                color: '#8fd8ff',
                alpha: 0.8,
                at: [0, surface, 0],
                order: 6,
            });
            fx.sys({
                tex: 'glint',
                life: 0.4,
                size: [0.12, 0.22],
                rate: 10,
                shape: new CircleEmitter({radius: R * 0.95, thickness: 0.8}),
                rotate: FLAT,
                at: [0, surface + 0.02, 0],
                order: 7,
                b: [tint([['#ffffff', 0]], popOut(0.4))],
            });
            // Shafts of light slanting down from the surface, drifting and breathing.
            fx.sys({
                tex: 'streak',
                mode: RenderMode.VerticalBillBoard,
                life: 2.4,
                size: [3.2, 4.2],
                rate: 1.6,
                rot: [Math.PI / 2 + 0.25, Math.PI / 2 + 0.35],
                color: '#7ac4ff',
                alpha: 0.13,
                shape: new BoxEmitter({width: 2.6, height: 0.1, depth: 1.4}),
                at: [0.3, 2.3, 0],
                speed: 0.15,
                aim: 'left',
                order: 1,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.4))],
            });
            // Motes hanging in the water, drifting.
            fx.sys({
                tex: 'dot',
                life: [2, 3.5],
                size: [0.03, 0.05],
                rate: 10,
                color: '#8ac8f0',
                alpha: 0.6,
                shape: new BoxEmitter({width: R * 1.8, height: surface - 0.4, depth: R * 1.2}),
                at: [0, surface / 2, 0],
                speed: 0.05,
                order: 2,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.3)), wobble(0.5, 0.15)],
            });
            // Bubbles in trains: a ring with a highlight, swelling as they rise and wobbling.
            const rise = surface - 0.25;
            const life = 2.3;
            const trains: Array<[number, number]> = [
                [0, 3],
                [0.35, 2],
                [0.9, 4],
                [1.5, 2],
                [2.1, 3],
                [2.6, 2],
                [3.2, 4],
            ];
            const bubbles = fx.sys({
                tex: 'ring',
                life,
                speed: rise / life,
                size: [0.1, 0.24],
                burst: trains,
                color: '#c8eeff',
                shape: new ConeEmitter({radius: 0.12, angle: 0.06}),
                aim: 'up',
                at: [0, 0.2, 0],
                world: true,
                order: 4,
                b: [tint([['#ffffff', 0]], fadeOut(0.97, 0.05)), grow([0, 0.5], [1, 1.5]), wobble(2.2, 0.5)],
            });
            fx.sys({
                tex: 'dot',
                life: life * 0.8,
                speed: rise / (life * 0.8),
                size: [0.03, 0.06],
                rate: 9,
                color: '#e8f8ff',
                shape: new ConeEmitter({radius: 0.15, angle: 0.08}),
                aim: 'up',
                at: [0, 0.2, 0],
                order: 5,
                b: [tint([['#ffffff', 0]], fadeOut(0.95, 0.05)), wobble(3, 0.35)],
            });
            const pop = fx.sys({
                tex: 'ring',
                life: 0.25,
                size: 0.45,
                burst: [[0, 1]],
                loop: false,
                world: true,
                color: '#ffffff',
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.1)), grow([0, 0.3], [1, 1.5])],
            });
            const flecks = fx.sys({
                tex: 'dot',
                life: [0.25, 0.4],
                speed: [0.6, 1.2],
                size: 0.04,
                burst: [[0, 4]],
                loop: false,
                world: true,
                color: '#ffffff',
                shape: new ConeEmitter({radius: 0.02, angle: 0.8}),
                aim: 'up',
                order: 6,
                b: [gravity(5), tint([['#ffffff', 0]], popOut(0.4))],
            });
            subEmit(bubbles, pop);
            subEmit(bubbles, flecks);
            light(fx, {at: [0, surface, 0], size: 4.5, color: '#4aa0e8', alpha: 0.25, life: 1e4});
        },
    },
    {
        id: 'water/drip',
        name: 'Drip',
        loop: true,
        period: 1.6,
        view: {height: 1.5, distance: 7},
        build(fx) {
            // drip.js in 3D: a bead swells under a stalactite's tip, catches the light, pinches off at
            // 0.8 s and falls, drawn long by its speed, into a still pool: a crown, a rebound bead, rings.
            const tip = 2.7;
            fx.prop(shapes.box(fx.scene, 2.6, 0.3, 1.4), {at: [0, tip + 0.75, 0], color: '#34323e'});
            fx.prop(shapes.cylinder(fx.scene, 0.6, 0.45, 0.04, 8), {at: [0, tip + 0.3, 0], color: '#3e3c48'});
            fx.prop(shapes.cylinder(fx.scene, 0.4, 0.25, 0.02, 7), {at: [0.7, tip + 0.4, 0.2], color: '#3a3844'});
            pool(fx, 1.4, [0, 0, 0], 0.8);
            light(fx, {at: [0, 0.045, 0], size: 3.2, color: '#2a7ad0', alpha: 0.35, life: 1e4, floor: true});
            const PINCH = 0.8;
            const G = 12;
            const LAND = PINCH + Math.sqrt((2 * (tip - 0.1)) / G);
            const bead = fx.node('bead', [0, tip, 0]);
            const drop = fx.prop(shapes.sphere(fx.scene, 1, 12), {parent: bead, color: '#7cc8ff', glow: '#3a8ad8'});
            fx.sys({
                tex: 'glow',
                life: 0.08,
                size: 0.35,
                rate: 40,
                color: '#bfe6ff',
                alpha: 0.6,
                parent: bead,
                order: 6,
            });
            fx.every((t) => {
                const tt = t % 1.6;
                if (tt < PINCH) {
                    // Swelling, sagging as it grows heavy.
                    const k = tt / PINCH;
                    const r = 0.03 + 0.1 * k;
                    bead.position.y = tip - r * (1 + 0.6 * k * k);
                    drop.scaling.set(r, r * (1 + 0.35 * k * k), r);
                    drop.setEnabled(true);
                } else if (tt < LAND) {
                    const f = tt - PINCH;
                    const v = G * f;
                    bead.position.y = tip - 0.16 - 0.5 * G * f * f;
                    drop.scaling.set(0.11, 0.11 + v * 0.025, 0.11);
                    drop.setEnabled(true);
                } else {
                    drop.setEnabled(false);
                    bead.position.y = -5;
                }
            });
            star(fx, {at: [0.04, tip - 0.2, 0.1], size: 0.4, life: 0.25, time: PINCH - 0.15, order: 8, loop: true});
            // The landing: a white fleck and a flash, a crown of beads, a rebound bead, rings.
            star(fx, {at: [0, 0.12, 0], size: 0.6, life: 0.2, time: LAND, tex: 'burst', ramp: WATER, loop: true});
            light(fx, {
                at: [0, 0.045, 0],
                size: 1.6,
                color: '#8fd8ff',
                alpha: 0.7,
                life: 0.3,
                time: LAND,
                floor: true,
                loop: true,
            });
            beads(fx, {
                at: [0, 0.05, 0],
                burst: [[LAND, 12]],
                speed: [1.4, 2.4],
                size: [0.04, 0.07],
                life: [0.3, 0.45],
                shape: new ConeEmitter({radius: 0.12, angle: 0.55, thickness: 0.1}),
                fall: 9,
            });
            beads(fx, {
                at: [0, 0.05, 0],
                burst: [[LAND + 0.08, 1]],
                speed: 2.6,
                size: 0.1,
                life: 0.5,
                shape: new ConeEmitter({radius: 0, angle: 0}),
                fall: 11,
                streak: 0.12,
            });
            rings(fx, {
                burst: [
                    [LAND, 1],
                    [LAND + 0.1, 1],
                ],
                size: 2.4,
                life: 0.9,
                at: [0, 0.04, 0],
            });
        },
    },
    {
        id: 'water/fountain',
        name: 'Fountain',
        loop: true,
        period: 2,
        view: {height: 1.4, distance: 8},
        build(fx) {
            // fountain.js in 3D: a round stone basin; a jet rises from its centre and opens into a bell of
            // glassy arcs that run down and break into beads on the water, ringing it and glinting.
            fx.prop(shapes.cylinder(fx.scene, 0.14, 1.85, 1.9, 48), {at: [0, 0.07, 0], color: '#34323f'});
            fx.prop(shapes.cylinder(fx.scene, 0.42, 1.6, 1.68, 48), {at: [0, 0.35, 0], color: '#4a4858'});
            fx.prop(shapes.torus(fx.scene, 1.6, 0.18), {at: [0, 0.56, 0], color: '#5c5a6c'});
            fx.prop(shapes.cylinder(fx.scene, 0.02, 1.5, 1.5, 48), {
                at: [0, 0.5, 0],
                color: '#103e70',
                glow: '#0a3262',
            });
            fx.prop(shapes.cylinder(fx.scene, 0.9, 0.12, 0.22, 12), {at: [0, 0.95, 0], color: '#4a4858'});
            fx.prop(shapes.cylinder(fx.scene, 0.14, 0.3, 0.16, 12), {at: [0, 1.45, 0], color: '#56546a'});
            // The bell: arcs leaving the jet's head, rising a little and falling to the basin's edge.
            const TOP = 2.55;
            const bell: Array<[number, number]> = [];
            for (let i = 0; i <= 20; i++) {
                const s = i / 20;
                bell.push([0.07 + 1.3 * s, TOP + 0.35 * s - 2.4 * s * s]);
            }
            flow(fx, {geo: lathe(bell, 40), tiling: [7, 1], scroll: [0, -1.4], alpha: [0.3, 0.75], order: 3});
            // The jet: a narrow glassy rod from the spout to the head.
            const jet: Array<[number, number]> = [
                [0.09, 1.5],
                [0.07, 2.0],
                [0.06, TOP - 0.05],
                [0.09, TOP + 0.05],
            ];
            flow(fx, {geo: lathe(jet, 16), tiling: [2, 2], scroll: [0, -3.2], alpha: [0.5, 1], order: 5});
            star(fx, {at: [0, TOP + 0.05, 0], size: 0.7, life: 1e4, tex: 'glow', color: '#e8f8ff', alpha: 0.8});
            fx.sys({
                tex: 'glint',
                life: 0.3,
                size: [0.15, 0.3],
                rate: 4,
                at: [0, TOP + 0.05, 0],
                order: 8,
                b: [tint([['#ffffff', 0]], popOut(0.3))],
            });
            // Beads breaking from the arcs' ends, and the rain they make on the water.
            beads(fx, {
                at: [0, 1.0, 0],
                shape: new CircleEmitter({radius: 1.15, thickness: 0.1}),
                rotate: FLAT,
                rate: 45,
                speed: [0.6, 1.2],
                size: [0.04, 0.07],
                life: [0.2, 0.3],
                fall: 9,
                streak: 0.1,
            });
            beads(fx, {
                at: [0, 0.52, 0],
                shape: new CircleEmitter({radius: 1.3, thickness: 0.15}),
                rotate: [-Math.PI / 2, 0, 0],
                rate: 30,
                speed: [0.6, 1.1],
                size: [0.03, 0.05],
                life: [0.15, 0.25],
                fall: 9,
            });
            rings(fx, {
                shape: new CircleEmitter({radius: 1.25, thickness: 0.2}),
                rotate: FLAT,
                rate: 7,
                size: 0.6,
                life: 0.6,
                at: [0, 0.52, 0],
            });
            fx.sys({
                tex: 'glint',
                life: 0.25,
                size: [0.12, 0.22],
                rate: 10,
                shape: new HemisphereEmitter({radius: 1.1, thickness: 0.2}),
                aim: 'up',
                at: [0, 0.9, 0],
                order: 8,
                b: [tint([['#ffffff', 0]], popOut(0.3))],
            });
            foam(fx, {
                at: [0, 0.6, 0],
                shape: new CircleEmitter({radius: 1.25, thickness: 0.1}),
                rotate: FLAT,
                rate: 5,
                size: [0.4, 0.6],
                life: [0.8, 1.2],
                speed: 0.2,
                color: FOAM,
                alpha: 0.18,
            });
            light(fx, {at: [0, 0.54, 0], size: 3.4, color: '#2a8ae0', alpha: 0.45, life: 1e4, floor: true});
            light(fx, {at: [0, 1.8, 0], size: 3, color: '#4aa0e8', alpha: 0.18, life: 1e4});
        },
    },
    {
        id: 'water/geyser',
        name: 'Geyser',
        loop: false,
        period: 5,
        view: {height: 2.6, distance: 12},
        build(fx) {
            // geyser.js in 3D: a pool in a ring of stones heaves and bubbles, then at 1.2 s a column blasts
            // up five metres with a foam head, rains back in beads and mist, sinks and sputters out by 3.9 s.
            const P = 5;
            rocks(fx, 11, 1.25, 0.28);
            pool(fx, 1.15);
            const heave = fx.node('heave', [0, 0.02, 0]);
            const dome: Array<[number, number]> = [];
            for (let i = 0; i <= 10; i++) {
                const a = (i / 10) * (Math.PI / 2);
                dome.push([Math.max(0.001, Math.cos(a)) * 0.7, Math.sin(a)]);
            }
            flow(fx, {
                geo: lathe(dome, 32),
                parent: heave,
                tiling: [3, 1],
                scroll: [0.3, -1],
                life: P,
                alpha: [0.6, 1],
                color: '#cfeeff',
                rim: true,
                order: 3,
            });
            const column = fx.node('column', [0, 0, 0]);
            const shaft: Array<[number, number]> = [
                [0.6, 0],
                [0.5, 0.08],
                [0.42, 0.4],
                [0.46, 0.75],
                [0.62, 0.92],
                [0.4, 1],
            ];
            flow(fx, {
                geo: lathe(shaft, 32),
                parent: column,
                tiling: [3, 3],
                scroll: [0.15, -4.5],
                life: P,
                alpha: [0.55, 1],
                color: '#bfe6ff',
                rim: true,
                order: 4,
            });
            const head = fx.node('head', [0, 0, 0]);
            const H = 5;
            const BLAST = 1.2;
            fx.every((t) => {
                // The pool heaves in pulses, faster as the blast nears, then sinks.
                const pulse = t < BLAST ? 0.2 + 0.8 * (t / BLAST) * Math.abs(Math.sin(t * (4 + t * 5))) : 0;
                heave.scaling.set(1 + pulse * 0.4, Math.max(0.01, pulse), 1 + pulse * 0.4);
                // The column: up in 0.3 s, standing and surging, sinking from 2.9 s, sputtering to 3.9 s.
                let h = 0;
                if (t >= BLAST && t < 3.9) {
                    const up = clamp01((t - BLAST) / 0.3);
                    const surge = 1 + 0.06 * Math.sin(t * 13);
                    const sink = t < 2.9 ? 1 : t < 3.4 ? 1 - 0.8 * ((t - 2.9) / 0.5) : 0.2 * Math.abs(Math.sin(t * 22));
                    h = H * (1 - (1 - up) * (1 - up)) * surge * sink;
                }
                const w = h > 0 ? 1 + 0.12 * Math.sin(t * 17) : 0.01;
                column.scaling.set(w, Math.max(0.01, h), w);
                head.position.y = h * 0.95;
            });
            star(fx, {at: [0, 0.5, 0], size: 2.4, life: 0.35, time: BLAST, tex: 'glow', ramp: WATER, order: 8});
            rings(fx, {burst: [[BLAST, 1]], size: 5, life: 0.8});
            // Bubbles bursting on the heaving pool, and steam.
            beads(fx, {
                at: [0, 0.1, 0],
                shape: new CircleEmitter({radius: 0.6}),
                rotate: [-Math.PI / 2, 0, 0],
                burst: [
                    [0.2, 3],
                    [0.45, 4],
                    [0.7, 5],
                    [0.9, 6],
                    [1.05, 8],
                ],
                speed: [0.8, 1.6],
                size: [0.04, 0.07],
                life: [0.25, 0.4],
                loop: false,
            });
            rings(fx, {
                shape: new CircleEmitter({radius: 0.5}),
                rotate: FLAT,
                burst: [
                    [0.25, 1],
                    [0.55, 1],
                    [0.8, 2],
                    [1.0, 2],
                ],
                size: 1.3,
                life: 0.6,
                loop: false,
            });
            const steam = foam(fx, {
                at: [0, 0.3, 0],
                shape: new CircleEmitter({radius: 0.6}),
                rotate: FLAT,
                rate: 1,
                size: [0.6, 1],
                life: [1.4, 2],
                speed: 0.4,
                aim: 'up',
                lift: 1.2,
                color: '#c8dce8',
                alpha: 0.25,
                loop: false,
                duration: P,
            });
            gate(steam, P, 0.1, 4.6, 6);
            // The foam head boiling over at the top.
            const crown = foam(fx, {
                parent: head,
                shape: new SphereEmitter({radius: 0.35}),
                rate: 1,
                size: [0.7, 1.1],
                life: [0.5, 0.8],
                speed: [0.6, 1.4],
                lift: -2,
                color: FOAM,
                alpha: 0.6,
                world: true,
                loop: false,
                duration: P,
                order: 6,
            });
            gate(crown, P, BLAST + 0.15, 3.3, 40);
            // Beads raining back round it, and mist rolling out over the stones.
            const rain = beads(fx, {
                parent: head,
                shape: new ConeEmitter({radius: 0.3, angle: 1.1}),
                aim: 'up',
                rate: 1,
                speed: [2, 4.2],
                size: [0.05, 0.1],
                life: [1.1, 1.6],
                world: true,
                loop: false,
                duration: P,
                fall: 7,
                streak: 0.08,
            });
            gate(rain, P, BLAST + 0.2, 3.5, 90);
            const mist = foam(fx, {
                at: [0, 0.3, 0],
                shape: new CircleEmitter({radius: 0.8}),
                rotate: FLAT,
                rate: 1,
                size: [1, 1.6],
                life: [1.2, 1.8],
                speed: [0.8, 1.6],
                lift: 0.3,
                color: FOAM,
                alpha: 0.3,
                loop: false,
                duration: P,
            });
            gate(mist, P, BLAST, 3.6, 14);
            const splashes = rings(fx, {
                shape: new CircleEmitter({radius: 2.4, thickness: 0.7}),
                rotate: FLAT,
                rate: 1,
                size: 0.6,
                life: 0.5,
                loop: false,
                duration: P,
            });
            gate(splashes, P, BLAST + 0.8, 4.2, 22);
            // Sputters as it dies, then the pool rings out.
            beads(fx, {
                at: [0, 0.1, 0],
                shape: new ConeEmitter({radius: 0.2, angle: 0.3}),
                burst: [
                    [3.45, 10],
                    [3.65, 8],
                    [3.85, 5],
                ],
                speed: [2, 3.5],
                life: [0.4, 0.6],
                loop: false,
            });
            rings(fx, {
                burst: [
                    [3.9, 1],
                    [4.15, 1],
                ],
                size: 3,
                life: 0.9,
                loop: false,
            });
            light(fx, {at: [0, 0.045, 0], size: 3.6, color: '#2a8ae0', alpha: 0.4, life: P, floor: true});
            light(fx, {at: [0, 2.4, 0], size: 5, color: '#5ab0f0', alpha: 0.3, life: 2.6, time: BLAST});
        },
    },
    {
        id: 'water/rain-splash',
        name: 'Rain splash',
        loop: true,
        period: 2.4,
        view: {height: 0.9, distance: 6.5},
        build(fx) {
            // rain-splash.js in 3D: a low look at a puddle in the rain. Big drops land in crowns that throw
            // beads and a rebound jet, rings spread and cross, finer rain dimples the water, and a street
            // lamp's light wobbles on it.
            pool(fx, 3.2, [0, 0, 0], 0.62);
            // The lamp, back right, and its reflection running toward us on the water.
            fx.prop(shapes.cylinder(fx.scene, 2.5, 0.06, 0.08, 8), {at: [2.6, 1.25, -2.6], color: '#2a2a34'});
            fx.prop(shapes.box(fx.scene, 0.36, 0.2, 0.36), {at: [2.6, 2.55, -2.6], color: '#2a2a34'});
            fx.prop(shapes.sphere(fx.scene, 0.14, 10), {at: [2.6, 2.4, -2.6], color: '#ffe8b0', glow: '#ffd890'});
            light(fx, {at: [2.6, 2.35, -2.6], size: 2.2, color: '#ffd890', alpha: 0.5, life: 1e4});
            fx.sys({
                tex: 'streak',
                mode: RenderMode.HorizontalBillBoard,
                life: [0.12, 0.22],
                size: [0.45, 0.8],
                rate: 90,
                rot: Math.PI / 2 - 0.35,
                color: '#ffe8b8',
                alpha: 0.35,
                shape: new BoxEmitter({width: 0.25, height: 0.01, depth: 3.4}),
                at: [1.9, 0.045, -0.4],
                rotate: [0, -0.35, 0],
                order: 3,
                b: [tint([['#ffffff', 0]], popOut(0.4))],
            });
            // Big drops falling in.
            const fallH = 3.6;
            const fallV = 10;
            const drops = fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.14, length: 1},
                life: (fallH - 0.04) / fallV,
                speed: fallV,
                size: 0.09,
                burst: [
                    [0, 1],
                    [0.35, 1],
                    [0.7, 2],
                    [1.1, 1],
                    [1.45, 1],
                    [1.8, 2],
                    [2.1, 1],
                ],
                color: '#cfeaff',
                shape: new BoxEmitter({width: 4.4, height: 2.6, depth: 0.01}),
                aim: 'down',
                at: [-0.3, fallH, 0],
                world: true,
                order: 5,
            });
            const crown = fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.08, length: 1},
                life: [0.3, 0.45],
                speed: [1.6, 2.6],
                size: [0.07, 0.1],
                burst: [[0, 16]],
                loop: false,
                world: true,
                shape: new ConeEmitter({radius: 0.12, angle: 0.5, thickness: 0.1}),
                aim: 'up',
                order: 5,
                b: [tint(WATER, fadeOut(0.7, 0.02)), gravity(9)],
            });
            const jet = fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.14, length: 1},
                life: 0.5,
                speed: 2.4,
                size: 0.12,
                burst: [[0.12, 1]],
                loop: false,
                world: true,
                shape: new ConeEmitter({radius: 0, angle: 0}),
                aim: 'up',
                order: 5,
                b: [tint(WATER, fadeOut(0.8, 0.05)), gravity(10)],
            });
            const fleck = fx.sys({
                tex: 'burst',
                life: 0.14,
                size: 0.45,
                burst: [[0, 1]],
                loop: false,
                world: true,
                color: '#e8f8ff',
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.2))],
            });
            const ring = rings(fx, {burst: [[0, 1]], loop: false, world: true, size: 2.2, life: 1.2});
            const ring2 = rings(fx, {burst: [[0.15, 1]], loop: false, world: true, size: 1.4, life: 0.9, alpha: 0.6});
            for (const child of [crown, jet, fleck, ring, ring2]) subEmit(drops, child);
            // Finer rain dimpling the water and streaking past.
            const fine = fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.04, length: 1},
                life: (fallH - 0.04) / 12,
                speed: 12,
                size: 0.03,
                rate: 45,
                color: '#9ac8e8',
                alpha: 0.6,
                shape: new BoxEmitter({width: 6, height: 3.6, depth: 0.01}),
                aim: 'down',
                at: [0, fallH, 0],
                world: true,
                order: 4,
            });
            const dimple = rings(fx, {burst: [[0, 1]], loop: false, world: true, size: 0.45, life: 0.45, alpha: 0.6});
            subEmit(fine, dimple, 'death', 0.6);
            light(fx, {at: [0, 0.045, 0], size: 6, color: '#1a5a98', alpha: 0.35, life: 1e4, floor: true});
        },
    },
    {
        id: 'water/ripples',
        name: 'Ripples',
        loop: true,
        period: 2,
        view: {height: 0.6, distance: 7},
        build(fx) {
            // ripples.js in 3D: drops plink on dark water every half second and rings spread across it,
            // fast then slowing, each with a soft swell behind it, crests glinting as they pass.
            pool(fx, 3.4);
            const jitter = (k: number): At => [Math.sin(k * 3.1) * 0.5, 0, Math.cos(k * 2.3) * 0.4];
            for (let i = 0; i < 4; i++) {
                const t = i * 0.5;
                const [x, , z] = jitter(i);
                // The drop falling in, its fleck, and the bead it throws up.
                fx.sys({
                    tex: 'dot',
                    mode: RenderMode.StretchedBillBoard,
                    stretch: {speed: 0.05, length: 1},
                    life: 0.16,
                    speed: 5,
                    size: 0.06,
                    burst: [[(t + 1.84) % 2, 1]],
                    color: '#dff4ff',
                    shape: new ConeEmitter({radius: 0, angle: 0}),
                    aim: 'down',
                    at: [x, 0.85, z],
                    order: 5,
                });
                star(fx, {at: [x, 0.1, z], size: 0.45, life: 0.16, time: t, tex: 'burst', ramp: WATER, loop: true});
                beads(fx, {
                    at: [x, 0.05, z],
                    burst: [[t + 0.02, 1]],
                    speed: 1.5,
                    size: 0.06,
                    life: 0.3,
                    shape: new ConeEmitter({radius: 0, angle: 0}),
                    fall: 10,
                });
                rings(fx, {burst: [[t, 1]], size: 6.2, life: 1.9, at: [x, 0.04, z]});
                rings(fx, {burst: [[t + 0.12, 1]], size: 4.6, life: 1.6, at: [x, 0.04, z], alpha: 0.5});
                // The swell behind the ring: a broad soft band.
                fx.sys({
                    tex: 'shock',
                    mode: RenderMode.HorizontalBillBoard,
                    life: 1.9,
                    size: 6,
                    burst: [[t, 1]],
                    color: '#3a8ad0',
                    alpha: 0.35,
                    at: [x, 0.035, z],
                    order: 1,
                    b: [tint([['#ffffff', 0]], fadeOut(0.3, 0.1)), grow([0, 0.05], [0.4, 0.75], [1, 1])],
                });
            }
            // Crests glinting as they pass.
            fx.sys({
                tex: 'glint',
                life: 0.2,
                size: [0.12, 0.22],
                rate: 22,
                shape: new CircleEmitter({radius: 2, thickness: 0.8}),
                rotate: FLAT,
                at: [0, 0.06, 0],
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.3))],
            });
            light(fx, {at: [0, 0.045, 0], size: 4, color: '#3a90e0', alpha: 0.4, life: 1e4, floor: true});
        },
    },
    {
        id: 'water/splash',
        name: 'Splash',
        loop: false,
        period: 2.5,
        view: {height: 1.2, distance: 8},
        build(fx) {
            // splash.js in 3D: a stone drops into still water; a crown stands up round the hole and tears
            // into beads, a rebound jet rises and throws its bead, foam and mist spread, rings run out.
            pool(fx, 2.6);
            const HIT = 0.35;
            const stone = fx.node('stone', [0, 2.6, 0]);
            const rock = fx.prop(shapes.ico(fx.scene, 0.2), {parent: stone, color: '#4a4652'});
            fx.every((t) => {
                const k = Math.min(1, t / HIT);
                stone.position.y = 2.6 - 2.55 * k * k;
                stone.rotation.set(t * 4, t * 3, 0);
                rock.setEnabled(t < HIT);
            });
            star(fx, {at: [0, 0.15, 0], size: 1.2, life: 0.2, time: HIT, tex: 'burst', ramp: WATER});
            light(fx, {at: [0, 0.045, 0], size: 2.4, color: '#8fd8ff', alpha: 0.7, life: 0.4, time: HIT, floor: true});
            // The crown: a thin flared wall standing up round the hole, swelling out and sinking.
            const crown: Array<[number, number]> = [
                [0.3, 0],
                [0.33, 0.2],
                [0.42, 0.42],
                [0.58, 0.62],
            ];
            const wall = fx.node('crown');
            flow(fx, {
                geo: lathe(crown, 32),
                parent: wall,
                tiling: [5, 1],
                scroll: [0, -1.5],
                life: 2.5,
                alpha: [0.5, 0.95],
                color: '#cfeeff',
                ramp: [
                    [1, 0],
                    [1, 0.36],
                    [0, 0.5],
                ],
                rim: true,
            });
            fx.every((t) => {
                const k = clamp01((t - HIT) / 0.75);
                const r = 0.6 + 2.2 * Math.sqrt(k);
                const h = t < HIT ? 0 : bump(Math.min(1, k * 1.3));
                wall.scaling.set(r, Math.max(0.01, 1.4 * h), r);
            });
            // Beads torn off its rim, the rebound jet and its bead.
            beads(fx, {
                at: [0, 0.3, 0],
                shape: new ConeEmitter({radius: 0.5, angle: 0.75, thickness: 0.1}),
                burst: [
                    [HIT + 0.08, 18],
                    [HIT + 0.2, 14],
                ],
                speed: [2.4, 3.8],
                size: [0.05, 0.09],
                life: [0.6, 0.9],
                world: true,
                loop: false,
            });
            beads(fx, {
                at: [0, 0.05, 0],
                shape: new ConeEmitter({radius: 0, angle: 0}),
                burst: [[HIT + 0.3, 1]],
                speed: 4.4,
                size: 0.2,
                life: 0.8,
                streak: 0.32,
                fall: 11,
                loop: false,
            });
            beads(fx, {
                at: [0, 0.05, 0],
                shape: new ConeEmitter({radius: 0, angle: 0.05}),
                burst: [[HIT + 0.34, 1]],
                speed: 5,
                size: 0.13,
                life: 0.95,
                streak: 0.02,
                fall: 11,
                loop: false,
            });
            foam(fx, {
                at: [0, 0.1, 0],
                shape: new CircleEmitter({radius: 0.5}),
                rotate: FLAT,
                burst: [[HIT + 0.05, 12]],
                speed: [1, 2],
                size: [0.5, 0.8],
                life: [0.8, 1.3],
                color: FOAM,
                alpha: 0.5,
                lift: 0.1,
                loop: false,
            });
            foam(fx, {
                at: [0, 0.4, 0],
                shape: new SphereEmitter({radius: 0.5}),
                burst: [[HIT + 0.1, 6]],
                speed: [0.3, 0.8],
                size: [1, 1.6],
                life: [1, 1.5],
                color: FOAM,
                alpha: 0.2,
                loop: false,
            });
            rings(fx, {
                burst: [
                    [HIT, 1],
                    [HIT + 0.15, 1],
                    [HIT + 0.38, 1],
                ],
                size: 5,
                life: 1.5,
                loop: false,
            });
            const lace = rings(fx, {
                shape: new CircleEmitter({radius: 1.8, thickness: 0.6}),
                rotate: FLAT,
                rate: 1,
                size: 0.5,
                life: 0.5,
                loop: false,
            });
            gate(lace, 2.5, HIT + 0.55, 1.5, 18);
        },
    },
    {
        id: 'water/water-jet',
        name: 'Water jet',
        loop: true,
        period: 1,
        view: {height: 1.3, distance: 9},
        build(fx) {
            // water-jet.js in 3D: a glassy rod of water from a nozzle, surging twice a second, breaking at
            // its end into chunks, spray and mist.
            const Y = 1.4;
            const X0 = -2.5;
            const L = 3.6;
            fx.prop(shapes.cylinder(fx.scene, 0.5, 0.12, 0.2, 12), {
                at: [X0 - 0.25, Y, 0],
                rotate: [0, 0, Math.PI / 2],
                color: '#8a7a50',
                glow: '#2a2010',
            });
            fx.prop(shapes.cylinder(fx.scene, 0.6, 0.24, 0.24, 12), {
                at: [X0 - 0.75, Y, 0],
                rotate: [0, 0, Math.PI / 2],
                color: '#4a4858',
            });
            const rod = fx.node('rod', [X0, Y, 0]);
            rod.rotation.z = -Math.PI / 2 - 0.05;
            const profile: Array<[number, number]> = [
                [0.12, 0],
                [0.15, 0.1],
                [0.13, 0.35],
                [0.15, 0.6],
                [0.17, 0.8],
                [0.1, 0.95],
                [0.03, 1],
            ];
            flow(fx, {
                geo: lathe(profile, 24),
                parent: rod,
                tiling: [2, 2.5],
                scroll: [0.3, -6],
                alpha: [0.5, 1],
                color: '#bfe6ff',
                rim: true,
            });
            fx.every((t) => {
                const s = 1 + 0.35 * Math.max(0, Math.sin(t * Math.PI * 4));
                rod.scaling.set(1.7 * s, L, 1.7 * s);
            });
            star(fx, {at: [X0 + 0.1, Y, 0], size: 0.9, life: 1e4, tex: 'glow', color: '#dff4ff', alpha: 0.7});
            const end: At = [X0 + L - 0.2, Y - 0.2, 0];
            // Chunks and beads breaking off the end, spray and mist.
            beads(fx, {
                at: end,
                shape: new ConeEmitter({radius: 0.12, angle: 0.25}),
                aim: 'right',
                rate: 50,
                speed: [4, 6],
                size: [0.08, 0.15],
                life: [0.35, 0.6],
                world: true,
                fall: 8,
                streak: 0.05,
            });
            beads(fx, {
                at: end,
                shape: new ConeEmitter({radius: 0.15, angle: 0.55}),
                aim: 'right',
                rate: 90,
                speed: [2.5, 5],
                size: [0.03, 0.05],
                life: [0.3, 0.6],
                world: true,
                fall: 6,
            });
            foam(fx, {
                at: [end[0] + 0.6, end[1], 0],
                shape: new SphereEmitter({radius: 0.3}),
                rate: 14,
                speed: [1, 2],
                aim: 'right',
                size: [0.5, 0.9],
                life: [0.6, 1],
                color: FOAM,
                alpha: 0.22,
                world: true,
            });
            fx.sys({
                tex: 'glint',
                life: 0.15,
                size: [0.12, 0.2],
                rate: 14,
                shape: new BoxEmitter({width: L * 0.9, height: 0.2, depth: 0.2}),
                at: [X0 + L / 2, Y + 0.1, 0],
                order: 8,
                b: [tint([['#ffffff', 0]], popOut(0.3))],
            });
            light(fx, {at: [0, Y, 0], size: 5, color: '#4aa0e8', alpha: 0.18, life: 1e4});
        },
    },
    {
        id: 'water/water-orb',
        name: 'Water orb',
        loop: true,
        period: 3,
        view: {height: 1.8, distance: 7},
        build(fx) {
            // water-orb.js in 3D: a sphere of water floats and wobbles, a current circling inside it,
            // shining, motes of spray on tilted orbits round it; light gathers on the floor under it and a
            // drip sags from its belly and falls with a plink and a ring.
            const C: At = [0, 2.1, 0];
            const orb = fx.node('orb', C);
            flow(fx, {
                geo: lathe(globe(), 40),
                parent: orb,
                size: 0.85,
                tiling: [2, 1],
                scroll: [0.25, 0.15],
                alpha: [0.5, 0.75],
                rim: true,
            });
            fx.every((t) => {
                const a = t * Math.PI * 2;
                const sag = Math.pow(Math.max(0, Math.sin(((t % 1.5) / 1.5) * Math.PI)), 6) * 0.08;
                orb.scaling.set(
                    1 + 0.04 * Math.sin(a * 1.3),
                    1 - 0.04 * Math.sin(a * 1.3) + sag,
                    1 + 0.03 * Math.cos(a)
                );
                orb.position.y = C[1] + 0.08 * Math.sin(a / 1.5) - sag * 0.8;
            });
            // The current: a swirl turning inside, and flecks circling with it.
            fx.sys({
                tex: 'swirl',
                life: 1e4,
                size: 1.2,
                burst: 1,
                loop: false,
                color: '#8fd8ff',
                alpha: 0.5,
                parent: orb,
                order: 4,
                b: [spin(-2)],
            });
            fx.sys({
                tex: 'dot',
                life: [0.8, 1.4],
                size: [0.03, 0.06],
                rate: 20,
                color: '#e8f8ff',
                shape: new SphereEmitter({radius: 0.6, thickness: 0.4}),
                parent: orb,
                order: 5,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.2)), orbit(3, [0.3, 1, 0.25])],
            });
            fx.sys({
                tex: 'ring',
                life: 1.2,
                size: [0.05, 0.1],
                rate: 3,
                speed: 0.4,
                color: '#c8eeff',
                shape: new SphereEmitter({radius: 0.4}),
                aim: 'up',
                parent: orb,
                order: 5,
                b: [tint([['#ffffff', 0]], fadeOut(0.6, 0.2)), gravity(0.6, [0, 1, 0])],
            });
            // The shine: a crescent up on the left and a glint low on the right, in front.
            fx.sys({
                tex: 'glint',
                life: 1e4,
                size: 0.45,
                burst: 1,
                loop: false,
                parent: orb,
                at: [-0.38, 0.38, 0.75],
                order: 8,
            });
            fx.sys({
                tex: 'glow',
                life: 0.5,
                size: [0.18, 0.28],
                rate: 4,
                color: '#ffffff',
                parent: orb,
                at: [0.3, -0.45, 0.65],
                order: 8,
                b: [tint([['#ffffff', 0]], popOut(0.4))],
            });
            // Motes of spray on tilted orbits round it.
            fx.sys({
                tex: 'dot',
                life: [1.5, 2.5],
                size: [0.04, 0.07],
                rate: 6,
                color: '#bfe6ff',
                shape: new SphereEmitter({radius: 1.15, thickness: 0}),
                parent: orb,
                order: 6,
                b: [tint([['#ffffff', 0]], fadeOut(0.6, 0.2)), orbit(1.8, [0.4, 1, -0.2])],
            });
            // Light gathering on the floor under it, and the drip.
            light(fx, {at: [0, 0.045, 0], size: 2, color: '#8fd8ff', alpha: 0.65, life: 1e4, floor: true});
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 1.5,
                size: 1.3,
                rate: 1,
                color: '#8fd8ff',
                alpha: 0.4,
                at: [0, 0.03, 0],
                order: 2,
                b: [tint([['#ffffff', 0]], fadeOut(0.4, 0.3)), grow([0, 0.8], [1, 1.1])],
            });
            light(fx, {at: C, size: 4, color: '#3a90e0', alpha: 0.25, life: 1e4});
            const drip = fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.05, length: 1},
                life: 0.52,
                size: 0.09,
                burst: [
                    [0.72, 1],
                    [2.22, 1],
                ],
                color: '#cfeeff',
                at: [0, C[1] - 0.92, 0],
                world: true,
                order: 6,
                b: [gravity(9.8)],
            });
            const plink = beads(fx, {
                burst: [[0, 5]],
                speed: [0.8, 1.4],
                size: 0.04,
                life: [0.2, 0.3],
                shape: new ConeEmitter({radius: 0.02, angle: 0.5}),
                world: true,
                loop: false,
            });
            const ring = rings(fx, {burst: [[0, 1]], world: true, loop: false, size: 1.4, life: 0.7});
            subEmit(drip, plink);
            subEmit(drip, ring);
        },
    },
    {
        id: 'water/waterfall',
        name: 'Waterfall',
        loop: true,
        period: 2,
        view: {height: 2.2, distance: 10},
        build(fx) {
            // waterfall.js in 3D: water pours over a rock lip as a sheet streaked with strands, crashes
            // into a pool in churning foam, throws spray and mist, and rings run out over the pool.
            const TOP = 4.3;
            fx.prop(shapes.box(fx.scene, 3.2, 0.5, 1.6), {at: [0, TOP + 0.05, -0.75], color: '#34323e'});
            fx.prop(shapes.box(fx.scene, 3.4, TOP, 0.6), {at: [0, TOP / 2, -1.4], color: '#26252e'});
            for (const [x, s] of [
                [-1.35, 0.55],
                [1.4, 0.6],
                [-1.75, 0.4],
                [1.85, 0.42],
            ]) {
                fx.prop(shapes.ico(fx.scene, s), {at: [x, TOP + 0.3, -0.2], rotate: [x, 1, 0], color: '#4a4652'});
            }
            pool(fx, 2.6, [0, 0, 0.4], 0.75);
            rocks(fx, 9, 2.4, 0.25, 0.03);
            // The sheet: a far layer of deep water, a near one of pale strands racing down.
            flow(fx, {
                geo: sheet(2.2, TOP, 0.05, 0.5, 0.25),
                tiling: [2.5, 1.2],
                scroll: [0, -1.8],
                alpha: [0.75, 0.9],
                order: 3,
            });
            flow(fx, {
                geo: sheet(2.24, TOP, 0.05, 0.53, 0.25),
                tiling: [4, 0.8],
                scroll: [0.05, -2.8],
                alpha: [0, 0.6],
                color: '#dff4ff',
                order: 5,
            });
            fx.sys({
                tex: 'glow',
                mode: RenderMode.HorizontalBillBoard,
                life: 1e4,
                size: 2.4,
                burst: 1,
                loop: false,
                color: '#bfe6ff',
                alpha: 0.4,
                at: [0, TOP + 0.02, 0.05],
                order: 2,
            });
            // Strands spilling off the edges.
            beads(fx, {
                shape: new BoxEmitter({width: 2.4, height: 0.1, depth: 0.1}),
                at: [0, TOP - 0.1, 0.3],
                aim: 'front',
                rate: 24,
                speed: [0.3, 0.6],
                size: [0.04, 0.07],
                life: 0.9,
                fall: 10,
                streak: 0.08,
            });
            // The plunge: foam churning, spray thrown out, mist rising, rings.
            const base: At = [0, 0.2, 0.55];
            foam(fx, {
                at: base,
                shape: new BoxEmitter({width: 2.4, height: 0.2, depth: 0.4}),
                aim: 'up',
                rate: 40,
                speed: [0.5, 1.4],
                size: [0.7, 1.2],
                life: [0.5, 0.8],
                color: FOAM,
                alpha: 0.65,
                lift: -0.5,
                order: 6,
            });
            foam(fx, {
                at: [0, 0.8, 0.8],
                shape: new BoxEmitter({width: 3, height: 0.4, depth: 0.6}),
                aim: 'up',
                rate: 6,
                speed: [0.3, 0.8],
                size: [1.2, 2],
                life: [1.4, 2],
                color: FOAM,
                alpha: 0.2,
                lift: 0.6,
                order: 7,
            });
            beads(fx, {
                at: base,
                shape: new ConeEmitter({radius: 0.9, angle: 0.9}),
                aim: 'up',
                rate: 50,
                speed: [1.5, 3],
                size: [0.04, 0.07],
                life: [0.4, 0.7],
                world: true,
            });
            rings(fx, {
                shape: new CircleEmitter({radius: 1.6, thickness: 0.6}),
                rotate: FLAT,
                rate: 5,
                size: 1.2,
                life: 1,
                at: [0, 0.04, 1],
            });
            light(fx, {at: [0, 0.045, 0.6], size: 4.5, color: '#3a90e0', alpha: 0.5, life: 1e4, floor: true});
            light(fx, {at: [0, 2.2, 0.4], size: 5, color: '#4aa0e8', alpha: 0.15, life: 1e4});
        },
    },
    {
        id: 'water/wave-crash',
        name: 'Wave crash',
        loop: false,
        period: 3.2,
        view: {height: 1.1, distance: 11},
        build(fx) {
            // wave-crash.js in 3D: on a flat sea a swell rises and rolls in, steepens, its lip curls over at
            // 1.07 s and crashes at 1.43 s into foam and spray, then fades to lace. The swell is one mesh
            // whose cross-section is eased between keyframes and swept along its length, peeling a little
            // later toward the back so it breaks along its line.
            const sea = fx.prop(shapes.box(fx.scene, 11, 0.04, 4.4), {
                at: [0, 0.01, 0],
                color: '#0a1e34',
                glow: '#05121f',
            });
            sea.isPickable = false;
            const DEPTH = 3;
            const ROWS = 12;
            const steps = 8;
            const across = (WAVE_KEYS[0][1].length - 1) * steps + 1;
            const positions = new Float32Array(across * (ROWS + 1) * 3);
            const uvs = new Float32Array(across * (ROWS + 1) * 2);
            const indices: number[] = [];
            for (let r = 0; r < ROWS; r++) {
                for (let i = 0; i < across - 1; i++) {
                    const a = r * across + i;
                    const b = a + across;
                    indices.push(a, b, a + 1, a + 1, b, b + 1);
                }
            }
            for (let r = 0; r <= ROWS; r++) {
                for (let i = 0; i < across; i++) {
                    uvs[(r * across + i) * 2] = (r / ROWS) * 2;
                    uvs[(r * across + i) * 2 + 1] = (i / (across - 1)) * 2.5;
                }
            }
            const mesh = new Mesh('pixelfx-wave', fx.scene);
            const data = new VertexData();
            data.positions = positions;
            data.uvs = uvs;
            data.indices = indices;
            data.normals = new Float32Array(positions.length);
            data.applyToMesh(mesh, true);
            fx.prop(mesh, {at: [0, 0.02, 0]});
            const band = (image(fx.scene, 'water-band').texture as Texture).clone();
            const material = new StandardMaterial('pixelfx-wave-mat', fx.scene);
            material.diffuseColor = new Color3(0.05, 0.16, 0.32);
            material.emissiveTexture = band;
            material.emissiveColor = new Color3(0.02, 0.06, 0.12);
            band.level = 0.7;
            material.opacityTexture = band;
            material.specularColor = new Color3(0.3, 0.35, 0.4);
            material.backFaceCulling = false;
            material.alpha = 0.95;
            mesh.material = material;
            mesh.alphaIndex = 0;
            const normals = new Float32Array(positions.length);
            const crest = fx.node('crest');
            fx.every((t) => {
                for (let r = 0; r <= ROWS; r++) {
                    const z = (r / ROWS - 0.5) * DEPTH;
                    // Peeling: the far end breaks a little later, and the line bows.
                    const path = smoothPath(waveAt(t - (r / ROWS) * 0.12), steps);
                    const fade = 1 - Math.pow(Math.abs(r / ROWS - 0.5) * 2, 3) * 0.6;
                    for (let i = 0; i < across; i++) {
                        const [x, y] = path[i];
                        const k = (r * across + i) * 3;
                        positions[k] = x + 0.15 * Math.sin(z * 1.3);
                        positions[k + 1] = y * fade;
                        positions[k + 2] = z;
                    }
                }
                VertexData.ComputeNormals(positions, indices, normals);
                mesh.updateVerticesData('position', positions);
                mesh.updateVerticesData('normal', normals);
                band.vOffset = -t * 0.6;
                const top = smoothPath(waveAt(t), steps).reduce((a, b) => (b[1] > a[1] ? b : a));
                crest.position.set(top[0], top[1] + 0.05, 0);
            });
            // Spray flung back off the crest as it steepens and curls.
            const spray = beads(fx, {
                parent: crest,
                shape: new BoxEmitter({width: 0.2, height: 0.2, depth: DEPTH * 0.9}),
                aim: 'up',
                rotate: [0, 0, 0.6],
                rate: 1,
                speed: [1, 2.2],
                size: [0.03, 0.05],
                life: [0.4, 0.6],
                world: true,
                loop: false,
                duration: 3.2,
                fall: 4,
            });
            gate(spray, 3.2, 0.6, 1.4, 70);
            const lip = foam(fx, {
                parent: crest,
                shape: new BoxEmitter({width: 0.2, height: 0.1, depth: DEPTH * 0.9}),
                rate: 1,
                size: [0.3, 0.5],
                life: [0.3, 0.5],
                speed: 0.2,
                color: FOAM,
                alpha: 0.6,
                world: true,
                loop: false,
                duration: 3.2,
                order: 6,
            });
            gate(lip, 3.2, 0.85, 1.45, 50);
            // The crash: foam bursting up along the line, spray, a flash, then lace spreading on the water.
            const CRASH = 1.43;
            const line = new BoxEmitter({width: 0.5, height: 0.2, depth: DEPTH});
            foam(fx, {
                at: [1, 0.3, 0],
                shape: line,
                aim: 'up',
                burst: [
                    [CRASH, 40],
                    [CRASH + 0.12, 24],
                ],
                speed: [1.4, 3],
                size: [1, 1.7],
                life: [0.9, 1.4],
                color: FOAM,
                alpha: 0.9,
                lift: -1.5,
                drag: 2,
                loop: false,
                order: 6,
            });
            beads(fx, {
                at: [1, 0.3, 0],
                shape: line,
                aim: 'up',
                rotate: [0, 0, -0.3],
                burst: [[CRASH, 60]],
                speed: [2.5, 5.5],
                size: [0.05, 0.1],
                life: [0.6, 1],
                world: true,
                loop: false,
            });
            star(fx, {at: [1, 0.6, 0], size: 2.6, life: 0.3, time: CRASH, tex: 'glow', ramp: WATER, order: 8});
            fx.sys({
                image: 'smoke-puff',
                randomTile: true,
                mode: RenderMode.HorizontalBillBoard,
                blend: 'alpha',
                life: [1, 1.5],
                speed: [0.3, 0.9],
                size: [0.6, 1],
                burst: [
                    [CRASH + 0.25, 16],
                    [CRASH + 0.5, 10],
                ],
                loop: false,
                color: FOAM,
                alpha: 0.4,
                shape: new BoxEmitter({width: 2.4, height: 0.01, depth: DEPTH}),
                at: [1, 0.05, 0],
                aim: 'right',
                order: 2,
                b: [tint([['#ffffff', 0]], fadeOut(0.3, 0.2)), grow([0, 0.6], [1, 1.4])],
            });
            const after = rings(fx, {
                shape: new BoxEmitter({width: 3, height: DEPTH, depth: 0.01}),
                rotate: FLAT,
                rate: 1,
                size: 0.7,
                life: 0.6,
                at: [1.2, 0.05, 0],
                loop: false,
            });
            gate(after, 3.2, CRASH + 0.2, 2.6, 18);
            light(fx, {at: [0.5, 0.06, 0], size: 6, color: '#2a7ad0', alpha: 0.35, life: 3, floor: true});
        },
    },
    {
        id: 'water/whirlpool',
        name: 'Whirlpool',
        loop: true,
        period: 3,
        view: {height: 0.6, distance: 8},
        build(fx) {
            // whirlpool.js in 3D: water in a stone well winds into a vortex: foam arms spiral in down a
            // funnel to a dark eye with a lit rim, flecks and bits of driftwood circling in after them.
            const LEVEL = 0.9;
            const R = 3;
            // An open wall, so the funnel shows inside it.
            const wall = MeshBuilder.CreateCylinder(
                'pixelfx-well',
                {
                    height: LEVEL + 0.1,
                    diameter: (R + 0.2) * 2,
                    tessellation: 48,
                    cap: Mesh.NO_CAP,
                    sideOrientation: Mesh.DOUBLESIDE,
                },
                fx.scene
            );
            fx.prop(wall, {at: [0, (LEVEL + 0.1) / 2, 0], color: '#2c2a36'});
            fx.prop(shapes.torus(fx.scene, R + 0.15, 0.3), {at: [0, LEVEL + 0.08, 0], color: '#4a4858'});
            const funnel: Array<[number, number]> = [
                [0.22, LEVEL - 0.85],
                [0.3, LEVEL - 0.6],
                [0.45, LEVEL - 0.38],
                [0.7, LEVEL - 0.22],
                [1.1, LEVEL - 0.12],
                [1.7, LEVEL - 0.05],
                [2.4, LEVEL - 0.015],
                [R, LEVEL],
            ];
            flow(fx, {
                geo: lathe(funnel, 64),
                band: 'whirl-band',
                tiling: [3, 1],
                scroll: [0.33, 0.4],
                alpha: [0.85, 0.85],
                order: 3,
            });
            // The eye: dark below, its rim lit, foam racing round its lip.
            fx.prop(shapes.cylinder(fx.scene, 0.02, 0.24, 0.24, 24), {at: [0, LEVEL - 0.86, 0], color: '#02060c'});
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 1e4,
                size: 0.75,
                burst: 1,
                loop: false,
                color: '#cfeeff',
                at: [0, LEVEL - 0.55, 0],
                order: 6,
                b: [spin(6)],
            });
            fx.sys({
                tex: 'glow',
                life: 1e4,
                size: 1.4,
                burst: 1,
                loop: false,
                color: '#4ab0ff',
                alpha: 0.5,
                at: [0, LEVEL - 0.5, 0],
                order: 2,
            });
            // Flecks of foam circling in, and driftwood.
            fx.sys({
                tex: 'dot',
                life: [2, 3],
                size: [0.04, 0.07],
                rate: 30,
                speed: -0.7,
                color: '#e8f8ff',
                shape: new CircleEmitter({radius: R * 0.85, thickness: 0.5}),
                rotate: FLAT,
                at: [0, LEVEL + 0.03, 0],
                order: 6,
                b: [tint([['#ffffff', 0]], fadeOut(0.6, 0.2)), orbit(1.6, [0, 0, 1])],
            });
            fx.sys({
                mesh: 'plank',
                life: 3,
                size: [0.18, 0.26],
                rate: 1,
                speed: -0.6,
                color: '#6a4a2a',
                shape: new CircleEmitter({radius: R * 0.8, thickness: 0.1}),
                rotate: FLAT,
                at: [0, LEVEL + 0.04, 0],
                tumble: 0.6,
                order: 5,
                b: [orbit(1.2, [0, 0, 1]), grow([0, 1], [0.85, 1], [1, 0])],
            });
            fx.sys({
                tex: 'glint',
                life: 0.25,
                size: [0.12, 0.2],
                rate: 10,
                shape: new CircleEmitter({radius: 2, thickness: 0.8}),
                rotate: FLAT,
                at: [0, LEVEL + 0.04, 0],
                order: 7,
                b: [tint([['#ffffff', 0]], popOut(0.3))],
            });
            light(fx, {at: [0, LEVEL + 0.02, 0], size: 6, color: '#2a7ad0', alpha: 0.3, life: 1e4, floor: true});
        },
    },
];
