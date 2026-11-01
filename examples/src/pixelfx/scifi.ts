import type {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color4} from '@babylonjs/core/Maths/math.color';
import type {Mesh} from '@babylonjs/core/Meshes/mesh';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {BoxEmitter, CircleEmitter, ConeEmitter, RenderMode, SphereEmitter} from 'babylon.quarks';
import {c3, drag, fadeOut, flicker, gravity, grow, lathe, orbit, popOut, spin, tint, wobble} from './kit';
import {PALETTE, arcs, flames, flash, pool, smoke, sparks, type Ramp} from './recipes';
import {shapes, type FxBuilder, type FxDef} from './stage';
import {image} from './textures';

const BLUE: Ramp = [
    ['#ffffff', 0],
    ['#9cc4ff', 0.3],
    ['#3f55e8', 1],
];
const MAGENTA: Ramp = [
    ['#ffffff', 0],
    ['#ff86e6', 0.3],
    ['#b0228f', 1],
];
const VIOLET: Ramp = [
    ['#ffffff', 0],
    ['#b4a2ff', 0.35],
    ['#5a3ad2', 1],
];
const METAL = '#3a3746';

/** A prop with its own copy of its material, so one effect can fade or flash it alone. */
function own(mesh: Mesh, name: string): StandardMaterial {
    const material = (mesh.material as StandardMaterial).clone(name);
    mesh.material = material;
    return material;
}

/** Smooth 0..1 between `a` and `b`. */
function ramp(t: number, a: number, b: number): number {
    const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
    return k * k * (3 - 2 * k);
}

/** Cheap repeatable noise in -1..1 for one step of a jitter. */
function hash(n: number): number {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
}

/** Rings of light rising around a body, shrinking as they go. */
function liftRings(
    fx: FxBuilder,
    o: {
        color: string;
        rate?: number;
        burst?: Array<[number, number]>;
        radius?: number;
        speed?: number;
        life?: number;
        at?: [number, number, number];
    }
) {
    return fx.sys({
        tex: 'ring',
        mode: RenderMode.HorizontalBillBoard,
        life: o.life ?? 1.2,
        speed: o.speed ?? 1.6,
        size: (o.radius ?? 0.9) * 2,
        rate: o.burst ? undefined : (o.rate ?? 2),
        burst: o.burst,
        color: o.color,
        aim: 'up',
        at: o.at ?? [0, 0.1, 0],
        order: 4,
        b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.1)), grow([0, 1], [1, 0.55])],
    });
}

/** Specks drawn in towards a point: the charge before a blast or a warp. */
function gather(
    fx: FxBuilder,
    o: {at: [number, number, number]; radius: number; time: number; span: number; color: Ramp; count?: number}
) {
    const life = 0.35;
    return fx.sys({
        tex: 'dot',
        mode: RenderMode.StretchedBillBoard,
        stretch: {speed: 0.04, length: 1},
        life,
        speed: -o.radius / life,
        size: [0.05, 0.09],
        // Waves of specks all through the charge.
        burst: [[o.time, Math.ceil((o.count ?? 60) / 10), 10, o.span / 10]],
        shape: new SphereEmitter({radius: o.radius, thickness: 0}),
        at: o.at,
        order: 5,
        b: [tint(o.color, fadeOut(0.9, 0.3))],
    });
}

/** pixelfx's sci-fi category, rebuilt as 3D particle effects. */
export const scifi: FxDef[] = [
    {
        id: 'scifi/emp-blast',
        name: 'EMP blast',
        loop: false,
        period: 3.8,
        build(fx) {
            const at: [number, number, number] = [0, 0.5, 0];
            const BLAST = 0.9;
            const device = fx.prop(shapes.cylinder(fx.scene, 0.3, 0.35), {at: [0, 0.15, 0], color: METAL});
            const lamp = fx.prop(shapes.sphere(fx.scene, 0.16), {at: [0, 0.34, 0], color: '#1c1658', glow: '#5a8eff'});
            const lampMat = own(lamp, 'emp-lamp');
            const blue = c3('#5a8eff');
            const dead = c3('#14122a');
            fx.every((t) => {
                // Blinks faster as it charges, then the pulse kills it.
                const blink = t < BLAST ? Math.sin(t * t * 60) > 0 : t > 2.8;
                lampMat.emissiveColor.copyFrom(blink ? blue : dead);
                device.scaling.y = t < BLAST ? 1 + 0.08 * Math.sin(t * 50) * (t / BLAST) : 1;
            });
            gather(fx, {at, radius: 2.2, time: 0, span: BLAST, color: BLUE, count: 50});
            fx.sys({
                tex: 'glow',
                life: BLAST,
                size: 1.6,
                burst: 1,
                color: '#9cc4ff',
                at,
                order: 5,
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [0, 0],
                            [1, 0.9],
                            [0, 1],
                        ]
                    ),
                    grow([0, 0.2], [1, 1]),
                ],
            });
            flash(fx, {at, size: 6, color: '#dceaff', time: BLAST});
            // The pulse: a bubble swelling out and a ring along the floor.
            fx.sys({
                tex: 'shock',
                life: 0.7,
                size: 8,
                burst: [[BLAST, 1]],
                color: '#5a8eff',
                at,
                order: 6,
                b: [tint(BLUE, popOut(0.1)), grow([0, 0.1], [0.5, 0.85], [1, 1])],
            });
            fx.sys({
                tex: 'shock',
                mode: RenderMode.HorizontalBillBoard,
                life: 0.6,
                size: 9,
                burst: [[BLAST, 1]],
                color: '#ff5ad8',
                at: [0, 0.05, 0],
                order: 5,
                b: [tint([['#ffffff', 0]], popOut(0.15)), grow([0, 0.1], [1, 1])],
            });
            // Arcs lashing out after it, and dead pixels hanging in the air.
            const hub = fx.node('hub', at);
            arcs(fx, {
                parent: hub,
                to: hub,
                shape: new SphereEmitter({radius: 2.6, thickness: 0}),
                burst: [
                    [BLAST, 5],
                    [BLAST + 0.2, 4],
                    [BLAST + 0.45, 3],
                ],
                life: [0.08, 0.16],
                palette: BLUE,
            });
            fx.sys({
                tex: 'square',
                life: [0.4, 1.4],
                size: [0.08, 0.16],
                burst: [[BLAST + 0.05, 40]],
                color: ['#5a8eff', '#ff5ad8'],
                shape: new SphereEmitter({radius: 2.4, thickness: 0.6}),
                at: [0, 1, 0],
                order: 6,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            sparks(fx, {
                at: [0, 0.4, 0],
                count: 16,
                time: BLAST,
                palette: BLUE,
                speed: [3, 6],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.2, angle: 0.8}),
            });
            smoke(fx, {at: [0, 0.3, 0], burst: [[BLAST + 0.1, 6]], color: '#3c3a52', loop: false, life: [1.6, 2.4]});
            pool(fx, {color: '#3f55e8', size: 3, alpha: 0.25});
        },
    },
    {
        id: 'scifi/energy-core',
        name: 'Energy core',
        loop: true,
        period: 2.4,
        build(fx) {
            const heartAt: [number, number, number] = [0, 1.5, 0];
            fx.prop(shapes.cylinder(fx.scene, 0.3, 1.3), {at: [0, 0.15, 0], color: METAL});
            fx.prop(shapes.cylinder(fx.scene, 0.25, 1.1), {at: [0, 2.9, 0], color: METAL});
            const bars: [number, number, number][] = [];
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
                const p: [number, number, number] = [Math.cos(a) * 1, 1.5, Math.sin(a) * 1];
                fx.prop(shapes.cylinder(fx.scene, 2.6, 0.06), {at: p, color: '#4b4759'});
                bars.push(p);
            }
            // Two tori orbiting the core on tilted axes.
            const tori = [0.7, -0.9].map((tilt, i) =>
                fx.prop(shapes.torus(fx.scene, 0.62 + i * 0.12, 0.05), {
                    at: heartAt,
                    rotate: [tilt, 0, 0],
                    color: '#701560',
                    glow: '#b0228f',
                })
            );
            fx.every((t) => {
                tori[0].rotation.y = (t / 2.4) * Math.PI * 2;
                tori[1].rotation.z = -(t / 2.4) * Math.PI * 2;
            });
            // The heart: a steady glow and two beats a loop, each a thump and an echo.
            fx.sys({
                tex: 'glow',
                life: 0.25,
                size: [0.9, 1.2],
                rate: 24,
                color: '#f53cd1',
                at: heartAt,
                order: 5,
                b: [tint(MAGENTA, fadeOut(0.3, 0.3))],
            });
            fx.sys({
                tex: 'dot',
                life: 0.25,
                size: 0.5,
                rate: 20,
                color: '#ffffff',
                at: heartAt,
                order: 6,
                b: [tint([['#ffffff', 0]], fadeOut(0.3, 0.3))],
            });
            const beats: Array<[number, number]> = [
                [0, 1],
                [0.25, 1],
                [1.2, 1],
                [1.45, 1],
            ];
            fx.sys({
                tex: 'glow',
                life: 0.5,
                size: 2.6,
                burst: beats,
                color: '#ff86e6',
                at: heartAt,
                order: 6,
                b: [tint(MAGENTA, popOut(0.1)), grow([0, 0.4], [0.2, 1], [1, 1.1])],
            });
            fx.sys({
                tex: 'shock',
                mode: RenderMode.HorizontalBillBoard,
                life: 0.6,
                size: 4.4,
                burst: [
                    [0, 1],
                    [1.2, 1],
                ],
                color: '#f53cd1',
                at: heartAt,
                order: 5,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.2], [1, 1])],
            });
            // Arcs from the heart to the bars of its cage.
            const hub = fx.node('hub', heartAt);
            for (const [i, p] of bars.entries()) {
                const bar = fx.node(`bar-${i}`, [p[0], p[1] + (i % 2 ? 0.4 : -0.3), p[2]]);
                arcs(fx, {
                    parent: bar,
                    to: hub,
                    burst: [
                        [0.05 + i * 0.3, 1],
                        [1.25 + i * 0.27, 1],
                    ],
                    life: [0.1, 0.18],
                    width: [0.2, 0.3],
                    palette: MAGENTA,
                });
            }
            fx.sys({
                tex: 'dot',
                life: [0.6, 1],
                speed: 0.6,
                size: [0.04, 0.07],
                rate: 14,
                color: '#ff86e6',
                shape: new SphereEmitter({radius: 0.9, thickness: 0.4}),
                at: heartAt,
                order: 5,
                b: [tint(MAGENTA, fadeOut(0.5)), orbit(3, [0, 1, 0])],
            });
            pool(fx, {color: '#f53cd1', size: 3.4, alpha: 0.25});
        },
    },
    {
        id: 'scifi/force-field',
        name: 'Force field',
        loop: true,
        period: 2.4,
        build(fx) {
            fx.character();
            const R = 1.9;
            // The shell: one hemisphere mesh mapped by longitude and latitude with hex plates (the grid of
            // Sprite Fusion's shield), its far side faint through the glass, its edge lit by a rim.
            const dome: Array<[number, number]> = [];
            for (let i = 0; i <= 16; i++) {
                const lat = (i / 16) * (Math.PI / 2);
                dome.push([R * Math.cos(lat), R * Math.sin(lat)]);
            }
            const shell = {
                image: 'hex-shell',
                geo: lathe(dome, 64),
                life: 1e4,
                size: 1,
                burst: 1,
                loop: false,
            } as const;
            fx.sys({...shell, alpha: 0.25, order: 1, look: {renderFace: 'back'}});
            const near = fx.sys({
                ...shell,
                order: 4,
                look: {renderFace: 'front', rim: {color: [0.33, 0.8, 1], power: 3, strength: 0.7}},
            });
            near.tint = new Color4(1, 1, 1, 1);
            const flare = near.tint;
            // Shots: a heavy one high up that makes the shell flare, a light one low that it shrugs off.
            const shots: Array<{time: number; y: number; heavy: boolean; turn: number}> = [
                {time: 0.5, y: 1.4, heavy: true, turn: -0.55},
                {time: 1.6, y: 0.7, heavy: false, turn: -0.95},
            ];
            fx.every((t) => {
                let k = 0;
                for (const s of shots) {
                    const d = t - s.time - 0.25;
                    if (d > 0) k = Math.max(k, Math.exp(-d * 6) * (s.heavy ? 1 : 0.5));
                }
                flare.r = flare.g = flare.b = 1 + 1.2 * k;
            });
            const START = 5;
            for (const [i, s] of shots.entries()) {
                const hitX = Math.sqrt(R * R - s.y * s.y);
                const travel = 0.25;
                // Each shot comes along its own lane, turned toward the camera so it strikes the face of
                // the shell we see rather than its silhouette.
                const lane = fx.node(`lane-${i}`);
                lane.rotation.y = s.turn;
                fx.sys({
                    parent: lane,
                    tex: 'dot',
                    mode: RenderMode.StretchedBillBoard,
                    stretch: {speed: 0.06, length: 1},
                    life: travel,
                    speed: (START - hitX) / travel,
                    size: s.heavy ? 0.2 : 0.12,
                    burst: [[s.time, 1]],
                    color: '#fff3a6',
                    at: [START, s.y, 0],
                    aim: 'left',
                    order: 6,
                    b: [
                        tint(
                            [['#ffffff', 0]],
                            [
                                [1, 0],
                                [1, 1],
                            ]
                        ),
                    ],
                });
                const hit = fx.node(`hit-${i}`, [hitX, s.y, 0], lane);
                const t0 = s.time + travel;
                // The ripple: a flash racing over the shell from where it was struck, lighting the plates
                // at its front and leaving them glowing behind it. Erosion does the spreading: a cone mask
                // laid round the hit by tiling and offset, cut back as the alpha rises over the ripple's
                // life, its edge band the bright front; the colour fades to nothing behind it.
                const lat = Math.asin(s.y / R);
                const reach = s.heavy ? 1.7 : 1.1; // radians over the shell
                const ru = reach / (Math.PI * 2 * Math.max(Math.cos(lat), 0.35));
                const rv = reach / (Math.PI / 2);
                fx.sys({
                    ...shell,
                    image: 'hex-plates',
                    parent: lane,
                    loop: undefined,
                    life: 0.75,
                    burst: [[t0, 1]],
                    color: '#a6ecff',
                    // The lathe's U is 0.5 at -x; turn it to face the shots from +x.
                    rotate: [0, Math.PI, 0],
                    order: 5,
                    b: [
                        tint(
                            [
                                ['#ffffff', 0],
                                ['#3a8bd8', 0.45],
                                ['#000000', 1],
                            ],
                            [
                                [0, 0],
                                [1, 1],
                            ]
                        ),
                    ],
                    look: {
                        renderFace: 'front',
                        erosion: {
                            mask: image(fx.scene, 'radial').texture,
                            maskUV: {
                                tiling: [1 / (2 * ru), 1 / (2 * rv)],
                                offset: [0.5 - 0.5 / (2 * ru), 0.5 - lat / (Math.PI / 2) / (2 * rv)],
                            },
                            softness: 0.04,
                            edgeWidth: 0.1,
                            edgeColor: s.heavy ? [1.2, 2.2, 2.6] : [0.7, 1.4, 1.8],
                        },
                    },
                });
                fx.sys({
                    parent: hit,
                    tex: 'ring',
                    mode: RenderMode.VerticalBillBoard,
                    life: 0.45,
                    size: s.heavy ? 2.2 : 1.4,
                    burst: [[t0, 1]],
                    color: '#8ae8ff',
                    order: 6,
                    b: [tint(BLUE, popOut(0.2)), grow([0, 0.2], [1, 1])],
                });
                fx.sys({
                    parent: hit,
                    tex: 'glow',
                    life: 0.2,
                    size: s.heavy ? 1.6 : 1,
                    burst: [[t0, 1]],
                    color: '#d4fbff',
                    order: 6,
                    b: [tint([['#ffffff', 0]], popOut(0.1))],
                });
                sparks(fx, {
                    parent: hit,
                    count: s.heavy ? 18 : 8,
                    time: t0,
                    loop: true,
                    aim: 'right',
                    shape: new ConeEmitter({radius: 0.05, angle: 0.9}),
                    speed: [3, 6],
                });
            }
            pool(fx, {color: '#2582d2', size: 4.2, alpha: 0.3});
        },
    },
    {
        id: 'scifi/glitch',
        name: 'Glitch',
        loop: true,
        period: 2.4,
        build(fx) {
            const body = fx.character();
            const ghosts = ['#ff2e63', '#2ef2ff'].map((color, i) => {
                const g = fx.character([0, 0, 0], 1.8, color);
                const m = own(g, `glitch-ghost-${i}`);
                m.emissiveColor = c3(color);
                m.alpha = 0.45;
                return g;
            });
            const scan = fx.prop(shapes.box(fx.scene, 1.1, 0.04, 0.9), {
                color: '#2ef2ff',
                glow: '#2ef2ff',
                alpha: 0.35,
            });
            fx.every((t) => {
                // The image tears at 15 steps a second, in fits: quiet spells, then bursts.
                const step = Math.floor(t * 15);
                const fit = Math.sin(t * 2.6) > -0.2 ? 1 : 0.15;
                const jx = hash(step) * 0.18 * fit;
                ghosts[0].position.x = -0.08 * fit + jx;
                ghosts[1].position.x = 0.08 * fit - jx;
                ghosts[0].setEnabled(fit > 0.5 || step % 5 === 0);
                ghosts[1].setEnabled(fit > 0.5 || step % 7 === 0);
                body.position.x = hash(step + 99) > 0.7 ? 0.12 * fit : 0;
                scan.position.y = ((t / 2.4) * 2 * 2.2) % 2.2;
            });
            const around = new BoxEmitter({width: 1.4, height: 2, depth: 0.2});
            // Torn slices and dead pixels around the body.
            fx.sys({
                tex: 'streak',
                life: [0.05, 0.12],
                size: [0.5, 1.2],
                rate: 14,
                color: ['#ff2e63', '#2ef2ff'],
                shape: around,
                at: [0, 1, 0.4],
                order: 6,
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [1, 0],
                            [1, 1],
                        ]
                    ),
                ],
            });
            fx.sys({
                tex: 'square',
                life: [0.06, 0.2],
                size: [0.06, 0.14],
                rate: 30,
                color: ['#ff7aa8', '#b4fbff'],
                shape: new BoxEmitter({width: 2.2, height: 2.6, depth: 0.6}),
                at: [0, 1, 0.4],
                order: 6,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            pool(fx, {color: '#ff2e63', size: 2.4, alpha: 0.15});
        },
    },
    {
        id: 'scifi/hologram',
        name: 'Hologram',
        loop: true,
        period: 4,
        build(fx) {
            fx.prop(shapes.cylinder(fx.scene, 0.25, 0.5, 0.6), {at: [0, 0.12, 0], color: METAL});
            fx.prop(shapes.sphere(fx.scene, 0.14), {at: [0, 0.27, 0], color: '#123b80', glow: '#6cd0ff'});
            const cone = fx.prop(shapes.cylinder(fx.scene, 2.2, 1.2, 0.12, 32), {
                at: [0, 1.4, 0],
                color: '#1d64b8',
                glow: '#1d64b8',
                alpha: 0.1,
            });
            const coneMat = own(cone, 'holo-cone');
            const model = fx.prop(shapes.ico(fx.scene, 0.6), {at: [0, 1.7, 0], color: '#6cd0ff', glow: '#2e98e8'});
            const modelMat = own(model, 'holo-model');
            modelMat.wireframe = true;
            fx.every((t) => {
                model.rotation.y = (t / 4) * Math.PI * 2;
                model.rotation.x = 0.3 * Math.sin((t / 4) * Math.PI * 2);
                model.position.y = 1.7 + 0.08 * Math.sin((t / 4) * Math.PI * 4);
                // A glitch now and then: the image drops out or jumps for a frame or two.
                const step = Math.floor(t * 30);
                const drop = step % 41 === 3 || step % 41 === 4 || step % 67 === 20;
                model.setEnabled(!drop);
                model.position.x = step % 53 === 10 ? 0.15 : 0;
                coneMat.alpha = 0.1 + 0.03 * Math.sin((t / 4) * Math.PI * 22);
            });
            // Scan rings climbing the beam, specks of light, and a rune turning on the base.
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 2,
                speed: 1.1,
                size: 0.3,
                rate: 1.5,
                color: '#6cd0ff',
                at: [0, 0.3, 0],
                aim: 'up',
                order: 5,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.1)), grow([0, 1], [1, 7.5])],
            });
            fx.sys({
                tex: 'dot',
                life: [1, 1.6],
                speed: [0.6, 1.2],
                size: [0.03, 0.06],
                rate: 16,
                color: '#c8f0ff',
                shape: new ConeEmitter({radius: 0.1, angle: 0.45}),
                at: [0, 0.3, 0],
                aim: 'up',
                order: 5,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            fx.sys({
                tex: 'rune',
                mode: RenderMode.HorizontalBillBoard,
                life: 4.05,
                size: 2.2,
                burst: [[0, 1]],
                color: '#2e98e8',
                alpha: 0.7,
                at: [0, 0.03, 0],
                order: 2,
                b: [
                    tint(
                        [['#ffffff', 0]],
                        [
                            [1, 0],
                            [1, 1],
                        ]
                    ),
                    spin(0.5),
                ],
            });
            pool(fx, {color: '#2e98e8', size: 3, alpha: 0.2});
        },
    },
    {
        id: 'scifi/jetpack',
        name: 'Jetpack',
        loop: true,
        period: 2,
        build(fx) {
            const hero = fx.character();
            const pack = fx.prop(shapes.box(fx.scene, 0.7, 0.6, 0.3), {
                parent: hero,
                at: [0, 0.15, -0.35],
                color: '#4b4759',
            });
            const nozzles = [-0.22, 0.22].map((x, i) => {
                fx.prop(shapes.cylinder(fx.scene, 0.25, 0.1, 0.13), {parent: pack, at: [x, -0.4, 0], color: '#312e3e'});
                return fx.node(`nozzle-${i}`, [x, -0.55, 0], pack);
            });
            fx.every((t) => {
                hero.position.y = 0.9 + 1.2 + 0.12 * Math.sin((t / 2) * Math.PI * 2);
                hero.rotation.z = 0.05 * Math.sin((t / 2) * Math.PI * 4);
            });
            for (const nozzle of nozzles) {
                flames(fx, {
                    parent: nozzle,
                    aim: 'down',
                    radius: 0.06,
                    spread: 0.08,
                    size: [0.35, 0.55],
                    height: 1.1,
                    life: [0.18, 0.28],
                    rate: 70,
                    puff: true,
                });
                fx.sys({
                    parent: nozzle,
                    tex: 'flame',
                    life: [0.08, 0.12],
                    speed: 6,
                    size: [0.3, 0.4],
                    rate: 40,
                    color: '#fff3a6',
                    aim: 'down',
                    order: 6,
                    b: [tint(PALETTE.fire, fadeOut(0.4, 0.1))],
                });
                fx.sys({
                    parent: nozzle,
                    tex: 'glow',
                    life: 0.1,
                    size: 0.5,
                    rate: 30,
                    color: '#ffc23d',
                    order: 6,
                    b: [tint([['#ffffff', 0]], fadeOut(0.3, 0.3))],
                });
            }
            // Exhaust hitting the floor: a ring of smoke rolling out and a hot spot.
            smoke(fx, {
                shape: new CircleEmitter({radius: 0.3, thickness: 0}),
                aim: 'up',
                rate: 8,
                speed: [1.2, 1.8],
                size: [0.4, 0.7],
                life: [0.9, 1.3],
                color: '#5a5462',
                alpha: 0.4,
                at: [0, 0.15, 0],
            });
            pool(fx, {color: '#ff8a2a', size: 1.8, alpha: 0.35});
        },
    },
    {
        id: 'scifi/laser-grid',
        name: 'Laser grid',
        loop: true,
        period: 3,
        build(fx) {
            const X = 2.8;
            for (const x of [-X, X]) {
                fx.prop(shapes.box(fx.scene, 0.3, 2.6, 0.3), {at: [x, 1.3, 0], color: METAL});
                fx.prop(shapes.box(fx.scene, 0.06, 2.3, 0.06), {
                    at: [x - Math.sign(x) * 0.17, 1.3, 0],
                    color: '#8a1020',
                    glow: '#d01c2a',
                });
            }
            // Beams sliding up and down between the posts: [middle height, swing, sweeps a loop, phase].
            const beams: Array<[number, number, number, number]> = [
                [0.5, 0.3, 1, 0],
                [1.3, 0.6, 1, 0.5],
                [2.0, 0.3, 2, 0.25],
            ];
            const ends = beams.map(([y], i) => {
                const from = fx.node(`from-${i}`, [-X + 0.2, y, 0]);
                const to = fx.node(`to-${i}`, [X - 0.2, y, 0]);
                fx.sys({
                    parent: from,
                    beam: to,
                    tex: 'white',
                    life: 3.05,
                    size: 0.05,
                    burst: [[0, 1]],
                    color: '#ffd0cc',
                    order: 6,
                    b: [
                        tint(
                            [['#ffffff', 0]],
                            [
                                [1, 0],
                                [1, 1],
                            ]
                        ),
                    ],
                });
                fx.sys({
                    parent: from,
                    beam: to,
                    tex: 'white',
                    life: 3.05,
                    size: 0.16,
                    burst: [[0, 1]],
                    color: '#ff2a2a',
                    alpha: 0.35,
                    order: 5,
                    b: [
                        tint(
                            [['#ffffff', 0]],
                            [
                                [1, 0],
                                [1, 1],
                            ]
                        ),
                    ],
                });
                fx.sys({
                    parent: from,
                    beam: to,
                    tex: 'white',
                    life: [0.05, 0.1],
                    size: [0.3, 0.4],
                    rate: 10,
                    color: '#d01c2a',
                    alpha: 0.18,
                    order: 4,
                    b: [tint([['#ffffff', 0]], popOut(0.5))],
                });
                for (const node of [from, to]) {
                    fx.sys({
                        parent: node,
                        tex: 'glow',
                        life: 0.12,
                        size: [0.35, 0.5],
                        rate: 20,
                        color: '#ff4a4a',
                        order: 6,
                        b: [tint([['#ffffff', 0]], fadeOut(0.3, 0.3))],
                    });
                }
                return [from, to];
            });
            fx.every((t) => {
                for (const [i, [y, swing, sweeps, phase]] of beams.entries()) {
                    const h = y + swing * Math.sin(((t / 3) * sweeps + phase) * Math.PI * 2);
                    ends[i][0].position.y = h;
                    ends[i][1].position.y = h;
                }
            });
            // Embers drifting through the beams.
            fx.sys({
                tex: 'dot',
                life: [1.5, 2.5],
                speed: [0.1, 0.3],
                size: [0.03, 0.05],
                rate: 6,
                color: '#ff9a90',
                shape: new BoxEmitter({width: 5, height: 2.4, depth: 0.6}),
                at: [0, 1.2, 0],
                order: 5,
                b: [tint([['#ffffff', 0]], flicker()), wobble(0.6, 0.4)],
            });
            pool(fx, {color: '#d01c2a', size: 5, alpha: 0.18});
        },
    },
    {
        id: 'scifi/scanner',
        name: 'Scanner',
        loop: true,
        period: 3.2,
        build(fx) {
            fx.character();
            const LOCK = 0.3;
            const SCAN0 = 0.42;
            const SCAN1 = 1.6;
            const DONE = 1.75;
            const LET = 2.5;
            const GREEN = '#2cc256';
            // Four corner brackets that snap in around the target.
            const brackets: Mesh[] = [];
            const corners: TransformNode[] = [];
            for (const sx of [-1, 1]) {
                for (const sy of [0, 1]) {
                    const corner = fx.node(`corner-${sx}-${sy}`, [sx * 0.75, sy * 2.1, 0.3]);
                    corners.push(corner);
                    const dy = sy ? -1 : 1;
                    brackets.push(
                        fx.prop(shapes.box(fx.scene, 0.3, 0.05, 0.05), {
                            parent: corner,
                            at: [-sx * 0.15, 0, 0],
                            color: GREEN,
                            glow: GREEN,
                        })
                    );
                    brackets.push(
                        fx.prop(shapes.box(fx.scene, 0.05, 0.3, 0.05), {
                            parent: corner,
                            at: [0, dy * 0.15, 0],
                            color: GREEN,
                            glow: GREEN,
                        })
                    );
                }
            }
            const band = fx.prop(shapes.torus(fx.scene, 0.62, 0.03), {color: '#7cf08c', glow: '#7cf08c'});
            const head = fx.node('scan-head');
            fx.every((t) => {
                const k = ramp(t, 0, LOCK) * (1 - ramp(t, LET, LET + 0.2));
                const s = 1 + 0.6 * (1 - ramp(t, 0, LOCK));
                const blink = t > DONE && t < DONE + 0.3 && Math.floor(t * 20) % 2 === 0;
                for (const b of brackets) b.setEnabled(k > 0.02 && !blink);
                for (const corner of corners) corner.scaling.setAll(s);
                const scanning = t >= SCAN0 && t <= SCAN1;
                band.setEnabled(scanning);
                const y = 2 - 1.95 * ramp(t, SCAN0, SCAN1);
                band.position.y = y;
                head.position.y = y;
            });
            // The band leaves a trail of light and lights up glints on the body as it passes.
            fx.sys({
                parent: head,
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 0.3,
                size: 1.3,
                // One ring every 40 ms down the body, left behind in the world as a trail.
                burst: [[SCAN0, 1, 30, (SCAN1 - SCAN0) / 30]],
                world: true,
                color: GREEN,
                order: 5,
                b: [tint([['#ffffff', 0]], fadeOut(0.3, 0.05))],
            });
            fx.sys({
                parent: head,
                tex: 'glint',
                life: [0.3, 0.6],
                size: [0.15, 0.25],
                burst: [[SCAN0, 2, 12, (SCAN1 - SCAN0) / 12]],
                world: true,
                color: '#d0ffd4',
                shape: new CircleEmitter({radius: 0.4, thickness: 0}),
                aim: 'up',
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.4)), gravity(-0.6)],
            });
            flash(fx, {at: [0, 1, 0.3], size: 3, color: '#7cf08c', time: DONE, loop: true});
            liftRings(fx, {
                color: GREEN,
                burst: [
                    [DONE, 1],
                    [DONE + 0.15, 1],
                ],
                radius: 0.8,
                speed: 1.2,
                life: 0.9,
            });
            pool(fx, {color: GREEN, size: 2.4, alpha: 0.2});
        },
    },
    {
        id: 'scifi/teleporter-pad',
        name: 'Teleporter pad',
        loop: true,
        period: 2.4,
        build(fx) {
            fx.prop(shapes.cylinder(fx.scene, 0.16, 1.3), {at: [0, 0.08, 0], color: METAL});
            fx.prop(shapes.cylinder(fx.scene, 0.02, 1.0), {at: [0, 0.17, 0], color: '#3c2296', glow: '#5a3ad2'});
            const column = fx.prop(shapes.cylinder(fx.scene, 3.4, 0.85, 0.95, 32), {
                at: [0, 1.88, 0],
                color: '#7f66f0',
                glow: '#7f66f0',
                alpha: 0.12,
            });
            const columnMat = own(column, 'teleporter-column');
            fx.every((t) => {
                columnMat.alpha = 0.1 + 0.06 * Math.sin((t / 2.4) * Math.PI * 4) ** 2;
            });
            // Rings closing in over the pad, then rings lifting off it.
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 0.8,
                size: 2.8,
                rate: 2.5,
                color: '#b4a2ff',
                at: [0, 0.2, 0],
                order: 4,
                b: [tint(VIOLET, fadeOut(0.5, 0.2)), grow([0, 1], [1, 0.6])],
            });
            liftRings(fx, {color: '#b4a2ff', rate: 2.5, radius: 0.85, speed: 2.2, life: 1.3, at: [0, 0.2, 0]});
            fx.sys({
                tex: 'glint',
                life: [0.8, 1.3],
                speed: [1.2, 2.4],
                size: [0.12, 0.22],
                rate: 18,
                color: '#e6deff',
                shape: new ConeEmitter({radius: 0.8, angle: 0.05, thickness: 0.6}),
                at: [0, 0.2, 0],
                aim: 'up',
                order: 5,
                b: [tint(VIOLET, fadeOut(0.4)), orbit(1.5, [0, 0, 1])],
            });
            fx.sys({
                tex: 'glow',
                life: 0.4,
                size: [1.8, 2.2],
                rate: 6,
                color: '#5a3ad2',
                at: [0, 0.3, 0],
                order: 3,
                b: [tint([['#ffffff', 0]], fadeOut(0.4, 0.4))],
            });
            pool(fx, {color: '#7f66f0', size: 3.6, alpha: 0.3});
        },
    },
    {
        id: 'scifi/tractor-beam',
        name: 'Tractor beam',
        loop: true,
        period: 3,
        build(fx) {
            const pod = fx.node('pod', [0, 4, 0]);
            const hull = fx.prop(shapes.sphere(fx.scene, 1, 20), {parent: pod, color: '#2e3448'});
            hull.scaling.set(1.2, 0.3, 1.2);
            fx.prop(shapes.sphere(fx.scene, 0.45, 16), {
                parent: pod,
                at: [0, 0.2, 0],
                color: '#1a7f84',
                glow: '#11505a',
            });
            fx.prop(shapes.torus(fx.scene, 0.35, 0.06), {
                parent: pod,
                at: [0, -0.28, 0],
                color: '#7ef0c8',
                glow: '#2bb5a8',
            });
            const cone = fx.prop(shapes.cylinder(fx.scene, 3.8, 0.3, 1.5, 32), {
                at: [0, 1.9, 0],
                color: '#2bb5a8',
                glow: '#2bb5a8',
                alpha: 0.12,
            });
            const coneMat = own(cone, 'tractor-cone');
            fx.every((t) => {
                pod.position.y = 4 + 0.1 * Math.sin((t / 3) * Math.PI * 2);
                pod.rotation.y = (t / 3) * Math.PI * 2;
                coneMat.alpha = 0.11 + 0.025 * Math.sin((t / 3) * Math.PI * 8);
            });
            // Stones lifted off the ground, spiralling up into the pod.
            fx.sys({
                mesh: 'rock',
                tumble: 3,
                life: 3,
                speed: 1.15,
                size: [0.12, 0.22],
                rate: 2.4,
                color: ['#4a4258', '#6d6480'],
                shape: new ConeEmitter({radius: 1.1, angle: 0, thickness: 0.5}),
                aim: 'up',
                at: [0, 0.1, 0],
                order: 2,
                b: [orbit(1.6, [0, 0, 1]), grow([0, 1], [0.85, 1], [1, 0])],
            });
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 1.6,
                speed: 2.2,
                size: 3,
                rate: 1.6,
                color: '#7ef0c8',
                at: [0, 0.1, 0],
                aim: 'up',
                order: 4,
                b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.1)), grow([0, 1], [1, 0.25])],
            });
            fx.sys({
                tex: 'dot',
                life: [1.2, 1.8],
                speed: [1.6, 2.4],
                size: [0.03, 0.06],
                rate: 18,
                color: '#d6fff0',
                shape: new ConeEmitter({radius: 1.3, angle: 0, thickness: 1}),
                aim: 'up',
                at: [0, 0.1, 0],
                order: 5,
                b: [tint([['#ffffff', 0]], fadeOut(0.6)), orbit(1.2, [0, 0, 1])],
            });
            smoke(fx, {
                shape: new ConeEmitter({radius: 1.2, angle: 0, thickness: 0.3}),
                aim: 'up',
                rate: 3,
                speed: [0.3, 0.6],
                size: [0.5, 0.8],
                color: '#4a4258',
                alpha: 0.35,
                at: [0, 0.1, 0],
            });
            pool(fx, {color: '#2bb5a8', size: 3.4, alpha: 0.3});
        },
    },
    {
        id: 'scifi/warp-in',
        name: 'Warp in',
        loop: false,
        period: 3.6,
        build(fx) {
            const ARRIVE = 0.9;
            const hero = fx.character();
            const column = fx.prop(shapes.cylinder(fx.scene, 6, 0.5, 0.5, 24), {
                at: [0, 3, 0],
                color: '#8ae8ff',
                glow: '#36b9ee',
                alpha: 0.5,
            });
            const columnMat = own(column, 'warp-in-column');
            fx.every((t) => {
                // A thin line of light drops, swells into a column, the body forms in it, and it fades.
                const open = ramp(t, 0, 0.35);
                const width = 0.08 + 0.92 * ramp(t, 0.35, ARRIVE) - 0.8 * ramp(t, ARRIVE + 0.1, ARRIVE + 0.8);
                column.scaling.set(width, open, width);
                column.position.y = 6 - 3 * open;
                columnMat.alpha = 0.5 * (1 - ramp(t, ARRIVE + 0.5, ARRIVE + 1.1));
                column.setEnabled(t < ARRIVE + 1.1);
                const grown = ramp(t, ARRIVE - 0.3, ARRIVE + 0.1);
                hero.setEnabled(grown > 0.01);
                hero.scaling.set(0.4 + 0.6 * grown, grown, 0.4 + 0.6 * grown);
                hero.position.y = 0.9 * grown;
            });
            gather(fx, {at: [0, 1, 0], radius: 2.2, time: 0.2, span: 0.8, color: BLUE, count: 60});
            flash(fx, {at: [0, 1, 0], size: 4.5, color: '#d4fbff', time: ARRIVE});
            fx.sys({
                tex: 'shock',
                mode: RenderMode.HorizontalBillBoard,
                life: 0.6,
                size: 5,
                burst: [[ARRIVE, 1]],
                color: '#36b9ee',
                at: [0, 0.05, 0],
                order: 5,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.1], [1, 1])],
            });
            liftRings(fx, {
                color: '#8ae8ff',
                burst: [
                    [ARRIVE, 1],
                    [ARRIVE + 0.15, 1],
                    [ARRIVE + 0.3, 1],
                ],
                radius: 0.7,
                speed: 2.4,
                life: 0.9,
            });
            fx.sys({
                tex: 'glint',
                life: [0.5, 0.9],
                speed: [1, 2.4],
                size: [0.15, 0.25],
                burst: [[ARRIVE, 24]],
                color: '#d4fbff',
                shape: new SphereEmitter({radius: 0.6, thickness: 1}),
                at: [0, 1, 0],
                order: 6,
                b: [tint(BLUE, popOut(0.4)), drag([0, 1], [1, 0.2])],
            });
            pool(fx, {color: '#2582d2', size: 2.6, alpha: 0.3});
        },
    },
    {
        id: 'scifi/warp-out',
        name: 'Warp out',
        loop: false,
        period: 3.2,
        build(fx) {
            const GO = 1;
            const hero = fx.character();
            const heroMat = own(hero, 'warp-out-body');
            const blue = c3('#36b9ee');
            fx.every((t) => {
                // Charged up, the body glows, stretches up into a needle of light and is gone.
                const charge = ramp(t, 0.1, GO);
                blue.scaleToRef(charge, heroMat.emissiveColor);
                const go = ramp(t, GO, GO + 0.25);
                hero.setEnabled(t < GO + 0.25);
                hero.scaling.set(1 - 0.9 * go, 1 + 1.5 * go, 1 - 0.9 * go);
                hero.position.y = 0.9 + 1.35 * go;
            });
            liftRings(fx, {
                color: '#8ae8ff',
                burst: [
                    [0.1, 1],
                    [0.4, 1],
                    [0.7, 1],
                ],
                radius: 0.7,
                speed: 1.6,
                life: 1,
            });
            fx.sys({
                tex: 'dot',
                life: [0.4, 0.7],
                speed: [0.6, 1.2],
                size: [0.04, 0.07],
                burst: [[0.1, 4, 10, 0.09]],
                color: '#d4fbff',
                shape: new ConeEmitter({radius: 0.5, angle: 0.1, thickness: 0}),
                at: [0, 0.1, 0],
                aim: 'up',
                order: 5,
                b: [tint(BLUE, fadeOut(0.5))],
            });
            fx.sys({
                tex: 'streak',
                mode: RenderMode.VerticalBillBoard,
                life: 0.35,
                size: 6,
                rot: Math.PI / 2,
                burst: [[GO + 0.2, 1]],
                color: '#8ae8ff',
                at: [0, 3, 0],
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.15)), grow([0, 1], [1, 0.2])],
            });
            flash(fx, {at: [0, 1.8, 0], size: 3.5, color: '#d4fbff', time: GO + 0.2});
            fx.sys({
                tex: 'glint',
                life: [0.6, 1.1],
                speed: [1.5, 3],
                size: [0.15, 0.25],
                burst: [[GO + 0.2, 20]],
                color: '#d4fbff',
                shape: new ConeEmitter({radius: 0.2, angle: 0.4}),
                at: [0, 2, 0],
                aim: 'up',
                order: 6,
                b: [tint(BLUE, popOut(0.4)), drag([0, 1], [1, 0.2])],
            });
            pool(fx, {color: '#2582d2', size: 2.6, alpha: 0.3});
        },
    },
];
