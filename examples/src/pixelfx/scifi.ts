import {DynamicTexture} from '@babylonjs/core/Materials/Textures/dynamicTexture';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Plane} from '@babylonjs/core/Maths/math.plane';
import type {Mesh} from '@babylonjs/core/Meshes/mesh';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {ParticleSystem} from 'babylon.quarks';
import {BoxEmitter, CircleEmitter, ConeEmitter, HemisphereEmitter, RenderMode, SphereEmitter} from 'babylon.quarks';
import {
    airDrag,
    c3,
    curve,
    domeProfile,
    drag,
    fadeOut,
    flicker,
    gravity,
    grow,
    lathe,
    lifeFrames,
    orbit,
    popOut,
    quad,
    spin,
    tint,
    wobble,
} from './kit';
import {FLAT, dust, gate, light, star, type At} from './parts';
import {PALETTE, arcs, heart, pool, smoke, sparks, type Ramp} from './recipes';
import {shapes, type FxBuilder, type FxDef} from './stage';
import {image, rampTexture} from './textures';

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
const CYAN: Ramp = [
    ['#ffffff', 0],
    ['#b4fbff', 0.3],
    ['#2ec8e8', 1],
];
const GREEN: Ramp = [
    ['#ffffff', 0],
    ['#b8ffc8', 0.25],
    ['#3ad06a', 1],
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

/** Emits `rate` per second only inside the `spans` (seconds) of a system's `period`, as a curve. */
function windows(system: ParticleSystem, period: number, spans: Array<[number, number]>, rate: number): void {
    const keys: Array<[number, number]> = [[0, 0]];
    for (const [a, b] of spans) {
        keys.push(
            [Math.max(0.001, a / period - 0.001), 0],
            [a / period, rate],
            [b / period, rate],
            [b / period + 0.001, 0]
        );
    }
    keys.push([1, 0]);
    system.emissionOverTime = curve(...keys);
}

/** A see-through shell of light: `geo` drawn twice, its far side dimmer, its near side lit at the rim. */
function shell(
    fx: FxBuilder,
    o: {
        geo: ReturnType<typeof lathe>;
        image?: 'scanlines' | 'light-column';
        tex?: 'white' | 'square';
        color: string;
        rim: [number, number, number];
        alpha?: [number, number];
        tiling?: [number, number];
        scroll?: [number, number];
        parent?: TransformNode;
        at?: At;
        size?: number;
        life?: number;
        order?: number;
    }
): ParticleSystem[] {
    const [back, front] = o.alpha ?? [0.3, 0.7];
    const mapUV = o.tiling || o.scroll ? {tiling: o.tiling ?? [1, 1], scroll: o.scroll ?? [0, 0]} : undefined;
    const base = {
        image: o.image,
        tex: o.image ? undefined : (o.tex ?? 'white'),
        geo: o.geo,
        blend: 'add' as const,
        life: o.life ?? 1e4,
        size: o.size ?? 1,
        burst: 1,
        loop: false,
        color: o.color,
        parent: o.parent,
        at: o.at,
    };
    return [
        fx.sys({
            ...base,
            alpha: back,
            order: o.order ?? 2,
            look: {mapUV, renderFace: 'back', scalingMode: 'hierarchy'},
        }),
        fx.sys({
            ...base,
            alpha: front,
            order: (o.order ?? 2) + 4,
            look: {
                mapUV,
                renderFace: 'front',
                scalingMode: 'hierarchy',
                rim: {color: o.rim, power: 2.4, strength: 1, mode: 'fade'},
            },
        }),
    ];
}

/** A held sprite riding a node: a fresh short-lived particle every frame, so it moves with it. */
function held(
    fx: FxBuilder,
    o: {
        parent: TransformNode;
        tex: 'glow' | 'streak' | 'glint' | 'ring' | 'dot';
        size: number | [number, number];
        color: string;
        alpha?: number;
        mode?: RenderMode;
        order?: number;
        rot?: number;
    }
) {
    return fx.sys({
        tex: o.tex,
        mode: o.mode,
        life: 0.05,
        size: o.size,
        rate: 60,
        rot: o.rot,
        color: o.color,
        alpha: o.alpha,
        parent: o.parent,
        order: o.order ?? 6,
    });
}

/** A hero that appears only above (`keep: 'above'`) or below a moving height, by a clip plane on its own material. */
function clipped(material: StandardMaterial, keep: 'above' | 'below'): (y: number) => void {
    // The material's own clip plane, so nothing else in the scene is cut. Babylon discards where
    // dot(normal, p) + d > 0.
    const plane = new Plane(0, keep === 'above' ? -1 : 1, 0, 0);
    material.clipPlane = plane;
    return (y) => {
        plane.d = keep === 'above' ? y : -y;
    };
}

/** A laser drawn between two nodes: a white core, a red body, a flickering haze. */
function laser(fx: FxBuilder, from: TransformNode, to: TransformNode, color: string) {
    const hold = [
        [1, 0],
        [1, 1],
    ] as Array<[number, number]>;
    fx.sys({parent: from, beam: to, tex: 'white', life: 0.05, size: 0.045, rate: 60, color: '#fff0ee', order: 7});
    fx.sys({
        parent: from,
        beam: to,
        tex: 'white',
        life: 0.05,
        size: 0.14,
        rate: 60,
        color,
        alpha: 0.5,
        order: 6,
        b: [tint([['#ffffff', 0]], hold)],
    });
    fx.sys({
        parent: from,
        beam: to,
        tex: 'white',
        life: [0.05, 0.1],
        size: [0.32, 0.45],
        rate: 14,
        color,
        alpha: 0.16,
        order: 5,
        b: [tint([['#ffffff', 0]], popOut(0.5))],
    });
}

/** pixelfx's sci-fi category, rebuilt as 3D particle effects. */
export const scifi: FxDef[] = [
    {
        id: 'scifi/emp-blast',
        name: 'EMP blast',
        loop: false,
        period: 3.2,
        view: {height: 1.2, distance: 10},
        build(fx) {
            // emp-blast.js in 3D: a disc charge ticks on the floor and pops white at 0.4 s; a bubble of
            // rolling scanlines swells out over it with arcs crawling its skin, strobes, tears and shorts
            // out at 1.4 s into dead pixels raining down, with a last few sparks of lightning.
            const POP = 0.4;
            const R = 2.6;
            fx.prop(shapes.cylinder(fx.scene, 0.12, 0.42, 0.48, 24), {at: [0, 0.06, 0], color: METAL});
            fx.prop(shapes.torus(fx.scene, 0.4, 0.05), {at: [0, 0.12, 0], color: '#1c2a6a', glow: '#3f55e8'});
            const lamp = fx.prop(shapes.sphere(fx.scene, 0.1), {at: [0, 0.16, 0], color: '#1c1658', glow: '#5a8eff'});
            const lampMat = own(lamp, 'emp-lamp');
            const blue = c3('#9cc4ff');
            const dead = c3('#14122a');
            for (const [i, t] of [0.08, 0.2, 0.29, 0.35].entries()) {
                star(fx, {at: [0, 0.2, 0], size: 0.35 + i * 0.12, life: 0.07, time: t, ramp: BLUE});
            }
            star(fx, {at: [0, 0.3, 0], size: 3, life: 0.25, time: POP, tex: 'glow', ramp: BLUE, order: 8});
            star(fx, {at: [0, 0.3, 0], size: 1.6, life: 0.18, time: POP, tex: 'burst', ramp: BLUE, order: 9});
            sparks(fx, {
                at: [0, 0.2, 0],
                count: 18,
                time: POP,
                palette: BLUE,
                speed: [3, 6],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.1, angle: 1.2}),
            });
            light(fx, {at: [0, 0.03, 0], size: 4, color: '#5a8eff', alpha: 0.8, life: 0.5, time: POP, floor: true});
            // The bubble: rolling scanlines with a blue rim, a magenta ghost a hair outside it for the RGB split.
            const bubble = fx.node('bubble');
            const dome = lathe(domeProfile(), 48);
            shell(fx, {
                geo: dome,
                image: 'scanlines',
                parent: bubble,
                color: '#7aa0ff',
                rim: [0.75, 0.88, 1],
                alpha: [0.35, 0.85],
                tiling: [1, 11],
                scroll: [0, 0.7],
                life: 3.2,
            });
            fx.sys({
                image: 'scanlines',
                geo: dome,
                blend: 'add',
                life: 3.2,
                size: 1.03,
                burst: 1,
                loop: false,
                color: '#ff5ad8',
                alpha: 0.35,
                parent: bubble,
                order: 5,
                look: {mapUV: {tiling: [1, 11], scroll: [0, 0.7]}, renderFace: 'front', scalingMode: 'hierarchy'},
            });
            fx.every((t) => {
                // Blinks faster as it charges; dead after the pop.
                lampMat.emissiveColor.copyFrom(t < POP && Math.sin(t * t * 160) > 0 ? blue : dead);
                const grown = 1 - Math.pow(1 - ramp(t, POP, POP + 0.35), 3);
                const step = Math.floor(t * 24);
                // Strobing from 0.85 s, torn sideways from 1.05 s, gone at 1.4 s.
                const strobe = t > 0.85 && hash(step) < -0.35 ? 0.001 : 1;
                const r = t < POP || t > 1.4 ? 0.001 : R * grown * strobe;
                bubble.scaling.set(r, r * (t > 1.05 && hash(step + 7) > 0.4 ? 0.92 : 1), r);
                bubble.position.x = t > 1.05 ? hash(step + 3) * 0.14 : 0;
            });
            // The bubble's foot on the floor, and the wave it throws out.
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 1.05,
                size: R * 2.1,
                burst: [[POP, 1]],
                color: '#9cc4ff',
                at: [0, 0.04, 0],
                order: 3,
                b: [tint([['#ffffff', 0]], popOut(0.85)), grow([0, 0.15], [0.33, 1], [1, 1])],
            });
            fx.sys({
                tex: 'shock',
                mode: RenderMode.HorizontalBillBoard,
                life: 0.5,
                size: 8,
                burst: [[POP, 1]],
                color: '#5a8eff',
                at: [0, 0.05, 0],
                order: 2,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.1], [1, 1])],
            });
            // Arcs crawling its skin: bolts between points that wander over the dome.
            const ends: Array<[TransformNode, TransformNode, number]> = [];
            for (let i = 0; i < 4; i++) {
                const a = fx.node(`crawl-a-${i}`);
                const b = fx.node(`crawl-b-${i}`);
                ends.push([a, b, i]);
                arcs(fx, {
                    parent: a,
                    to: b,
                    burst: [[0.75 + i * 0.05, 1, 6, 0.11]],
                    life: [0.06, 0.1],
                    width: [0.25, 0.35],
                    palette: BLUE,
                    loop: false,
                });
            }
            const onDome = (node: TransformNode, lon: number, lat: number) => {
                node.position.set(
                    Math.cos(lon) * Math.cos(lat) * R,
                    Math.sin(lat) * R,
                    Math.sin(lon) * Math.cos(lat) * R
                );
            };
            fx.every((t) => {
                for (const [a, b, i] of ends) {
                    const lon = i * 1.7 + t * (1 + i * 0.3);
                    const lat = 0.3 + 0.5 * Math.abs(Math.sin(t * 2 + i));
                    onDome(a, lon, lat);
                    onDome(b, lon + 0.5, lat + 0.25);
                }
            });
            // Shorting out: dead pixels raining off where the dome was, and stray lightning.
            fx.sys({
                tex: 'square',
                life: [0.6, 1.6],
                size: [0.06, 0.12],
                burst: [
                    [1.4, 90],
                    [1.5, 30],
                ],
                color: ['#7aa0ff', '#ff5ad8'],
                shape: new HemisphereEmitter({radius: R, thickness: 0.05}),
                aim: 'up',
                speed: [0, 0.4],
                order: 6,
                b: [tint([['#ffffff', 0]], flicker()), gravity(2.2)],
            });
            const hub = fx.node('hub', [0, 1.2, 0]);
            arcs(fx, {
                parent: hub,
                to: hub,
                shape: new SphereEmitter({radius: 1.8, thickness: 0}),
                burst: [
                    [1.42, 2],
                    [1.58, 2],
                    [1.8, 1],
                ],
                life: [0.08, 0.14],
                palette: BLUE,
                loop: false,
            });
            smoke(fx, {at: [0, 0.3, 0], burst: [[1.45, 6]], color: '#3c3a52', loop: false, life: [1.4, 2]});
            pool(fx, {color: '#3f55e8', size: 3, alpha: 0.25});
        },
    },
    {
        id: 'scifi/energy-core',
        name: 'Energy core',
        loop: true,
        period: 2.4,
        view: {height: 1.6, distance: 8},
        build(fx) {
            // energy-core.js in 3D: a plasma core beating in a steel cage behind glass. It swells and
            // throws a dotted shock ring on each beat (0 s and 1.3 s), two tilted rings orbit it, and arcs
            // jump from it to the glowing bars and spark where they land.
            const heartAt: At = [0, 1.62, 0];
            fx.prop(shapes.cylinder(fx.scene, 0.3, 1.2, 1.35, 32), {at: [0, 0.15, 0], color: METAL});
            fx.prop(shapes.cylinder(fx.scene, 0.14, 1.02, 1.1, 32), {at: [0, 0.37, 0], color: '#4a4658'});
            fx.prop(shapes.cylinder(fx.scene, 0.22, 1.08, 1.02, 32), {at: [0, 2.95, 0], color: METAL});
            fx.prop(shapes.cylinder(fx.scene, 0.3, 0.3, 0.75, 24), {at: [0, 3.2, 0], color: '#4a4658'});
            fx.prop(shapes.sphere(fx.scene, 0.08), {at: [0, 3.4, 0], color: '#701560', glow: '#ff86e6'});
            const glass: Array<[number, number]> = [
                [0.98, 0.44],
                [0.98, 2.84],
            ];
            shell(fx, {geo: lathe(glass, 48), color: '#b0228f', rim: [1, 0.55, 0.9], alpha: [0.12, 0.35]});
            const bars: At[] = [];
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2 + 0.3;
                const p: At = [Math.cos(a) * 0.96, 1.64, Math.sin(a) * 0.96];
                fx.prop(shapes.cylinder(fx.scene, 2.4, 0.035, 0.035, 8), {at: p, color: '#ff86e6', glow: '#c02aa0'});
                bars.push(p);
            }
            // Two rings orbiting the core on tilted axes.
            const tori = [0.7, -0.9].map((tilt, i) =>
                fx.prop(shapes.torus(fx.scene, 0.6 + i * 0.12, 0.035), {
                    at: heartAt,
                    rotate: [tilt, 0, 0],
                    color: '#ff86e6',
                    glow: '#d040b0',
                })
            );
            // The core: a ball of plasma that swells on each beat, swirling inside a hot glow.
            const core = fx.prop(shapes.sphere(fx.scene, 0.3, 16), {at: heartAt, color: '#ff9af0', glow: '#ff5ad8'});
            fx.every((t) => {
                tori[0].rotation.y = (t / 2.4) * Math.PI * 2;
                tori[1].rotation.z = -(t / 2.4) * Math.PI * 2;
                const since = Math.min(t % 1.3, (t + 2.4 - 1.3) % 2.4);
                const s = 1 + 0.45 * Math.exp(-since / 0.12) + 0.05 * Math.sin(t * 20);
                core.scaling.set(s, s, s);
            });
            fx.sys({
                tex: 'glow',
                life: 0.25,
                size: [1.4, 1.7],
                rate: 24,
                color: '#f53cd1',
                alpha: 0.7,
                at: heartAt,
                order: 5,
            });
            for (const [dir, size] of [
                [3, 1.3],
                [-2, 1.0],
            ]) {
                fx.sys({
                    tex: 'swirl',
                    life: 1e4,
                    size,
                    burst: 1,
                    loop: false,
                    color: '#ff86e6',
                    alpha: 0.8,
                    at: heartAt,
                    order: 6,
                    b: [spin(dir)],
                });
            }
            const beats: Array<[number, number]> = [
                [0, 1],
                [1.3, 1],
            ];
            fx.sys({
                tex: 'glow',
                life: 0.45,
                size: 2.8,
                burst: beats,
                color: '#ff86e6',
                at: heartAt,
                order: 6,
                b: [tint(MAGENTA, popOut(0.1)), grow([0, 0.4], [0.2, 1], [1, 1.1])],
            });
            fx.sys({
                tex: 'ring',
                life: 0.16,
                size: 1.9,
                burst: [[1.3, 1]],
                color: '#ffffff',
                at: heartAt,
                order: 8,
                b: [tint([['#ffffff', 0]], popOut(0.4)), grow([0, 0.6], [1, 1.1])],
            });
            // The dotted shock ring each beat throws, and its ring on the floor.
            fx.sys({
                tex: 'ring',
                life: 0.55,
                size: 5.2,
                burst: beats.map(([t]) => [t + 0.04, 1] as [number, number]),
                color: '#ff86e6',
                at: heartAt,
                order: 7,
                b: [tint(MAGENTA, popOut(0.3)), grow([0, 0.25], [1, 1])],
            });
            fx.sys({
                tex: 'shock',
                mode: RenderMode.HorizontalBillBoard,
                life: 0.6,
                size: 4.6,
                burst: beats,
                color: '#f53cd1',
                at: [0, 0.32, 0],
                order: 3,
                b: [tint([['#ffffff', 0]], popOut(0.2)), grow([0, 0.2], [1, 1])],
            });
            // Arcs from the core to the bars, sparking where they land.
            const hub = fx.node('hub', heartAt);
            for (const [i, p] of bars.entries()) {
                const y = p[1] + (i % 2 ? 0.45 : -0.35);
                const bar = fx.node(`bar-${i}`, [p[0] * 0.97, y, p[2] * 0.97]);
                const times: Array<[number, number]> = [
                    [0.05 + i * 0.37, 1],
                    [(1.35 + i * 0.29) % 2.4, 1],
                ];
                arcs(fx, {
                    parent: bar,
                    to: hub,
                    burst: times,
                    life: [0.1, 0.18],
                    width: [0.25, 0.35],
                    palette: MAGENTA,
                });
                sparks(fx, {
                    parent: bar,
                    count: 6,
                    time: times[0][0],
                    palette: MAGENTA,
                    speed: [1, 2.5],
                    size: [0.03, 0.05],
                    life: [0.2, 0.4],
                    shape: new SphereEmitter({radius: 0.05}),
                });
            }
            fx.sys({
                tex: 'dot',
                life: [0.6, 1],
                speed: 0.5,
                size: [0.04, 0.07],
                rate: 14,
                color: '#ff86e6',
                shape: new SphereEmitter({radius: 0.8, thickness: 0.4}),
                at: heartAt,
                order: 5,
                b: [tint(MAGENTA, fadeOut(0.5)), orbit(3, [0, 1, 0])],
            });
            light(fx, {at: [0, 0.32, 0], size: 3, color: '#f53cd1', alpha: 0.5, life: 1e4, floor: true});
            heart(fx, {at: heartAt, size: 4, color: '#b0228f', alpha: 0.12});
        },
    },
    {
        id: 'scifi/force-field',
        name: 'Force field',
        loop: true,
        period: 2.4,
        build(fx) {
            // Everything force-field.js draws, in 3D. The shell: a hemisphere mesh mapped by longitude and
            // latitude with hex plates, each plate's top-left edge lit; its far side dim through the glass;
            // a hard bright rim. Shots from the right at 0.42 s (heavy, high) and 1.5 s (light, low) each
            // set off a hot spot, a ripple racing over the shell, sparks, motes, stars and a puff of smoke;
            // the heavy one cracks the shell. In the quiet part of the loop one plate in five glints in turn,
            // and near its end a scan climbs the dome. Round its foot, a ring with ten lights chasing.
            const D = 2.4;
            fx.character();
            const R = 1.9;
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
            // An erosion layer over the shell whose only light is its edge band: as the alpha (the erosion
            // level) runs over the particle's life, the band sweeps through the mask's values in order.
            const band = (o: {
                image: 'hex-shell' | 'hex-plates';
                mask: 'hex-glint' | 'gradient';
                time: number;
                life: number;
                edge: number;
                color: [number, number, number];
                from?: number;
                to?: number;
            }) =>
                fx.sys({
                    ...shell,
                    image: o.image,
                    loop: undefined,
                    life: o.life,
                    burst: [[o.time, 1]],
                    color: '#000000',
                    order: 5,
                    b: [
                        tint(
                            [['#000000', 0]],
                            [
                                [o.from ?? 0, 0],
                                [o.to ?? 1, 1],
                            ]
                        ),
                    ],
                    look: {
                        renderFace: 'front',
                        erosion: {
                            mask: image(fx.scene, o.mask).texture,
                            softness: 0.03,
                            edgeWidth: o.edge,
                            edgeColor: o.color,
                        },
                    },
                });

            fx.sys({...shell, alpha: 0.25, order: 1, look: {renderFace: 'back'}});
            const near = fx.sys({
                ...shell,
                order: 4,
                look: {renderFace: 'front', rim: {color: [0.6, 0.95, 1], power: 4, strength: 0.75}},
            });
            near.tint = new Color4(1, 1, 1, 1);
            const flare = near.tint;
            // Glints: in the quiet stretch after the heavy hit, each chosen plate flares and dies in turn.
            band({
                image: 'hex-plates',
                mask: 'hex-glint',
                time: 0.95,
                life: 1.75,
                edge: 0.14,
                color: [1.4, 2, 2.3],
                from: 0.12,
                to: 0.78,
            });
            // The scan: a band of light climbing the dome from the foot to the top, once a loop.
            band({
                image: 'hex-shell',
                mask: 'gradient',
                time: 0.72 * D,
                life: 0.26 * D,
                edge: 0.12,
                color: [0.6, 1.4, 1.8],
            });
            // Stars twinkling where plates glint, on the side we see.
            fx.sys({
                tex: 'glint',
                life: 0.4,
                size: [0.18, 0.3],
                rate: 4,
                delay: 1,
                color: '#d4fbff',
                shape: new HemisphereEmitter({radius: R * 1.01, thickness: 0}),
                aim: 'up',
                order: 6,
                b: [tint(BLUE, popOut(0.3)), grow([0, 1], [1, 0.4])],
            });

            // The foot: a ring on the floor, ten lights round it with a pulse chasing round twice a loop.
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 1e4,
                size: 2 * R + 0.25,
                burst: 1,
                loop: false,
                color: '#36b9ee',
                alpha: 0.7,
                at: [0, 0.02, 0],
                order: 2,
            });
            const lights = Array.from({length: 10}, (_, i) => {
                const g = (i / 10) * Math.PI * 2 + 0.31;
                const light = fx.sys({
                    tex: 'glow',
                    life: 1e4,
                    size: 0.45,
                    burst: 1,
                    loop: false,
                    color: '#8ae8ff',
                    at: [Math.cos(g) * (R - 0.03), 0.06, Math.sin(g) * (R - 0.03)],
                    order: 3,
                });
                light.tint = new Color4(1, 1, 1, 1);
                return light.tint;
            });

            // Shots, as in the original: a heavy one high up at 0.42 s, a light one low at 1.5 s. Each comes
            // along its own lane, turned toward the camera so it strikes the face of the shell we see.
            const shots = [
                {hitAt: 0.42, lat: 0.62, heavy: true, turn: -0.55},
                {hitAt: 1.5, lat: 0.26, heavy: false, turn: -0.95},
            ];
            fx.every((t) => {
                let k = 0;
                for (const s of shots) {
                    const d = t - s.hitAt;
                    if (d > 0) k = Math.max(k, Math.exp(-d * 6) * (s.heavy ? 1 : 0.5));
                }
                flare.r = flare.g = flare.b = 1 + 1.2 * k;
                for (const [i, light] of lights.entries()) {
                    const pulse = 0.5 + 0.5 * Math.cos(Math.PI * 2 * ((2 * t) / D - i / 10));
                    light.a = 0.25 + 0.75 * pulse;
                    light.g = light.b = 1 + 0.6 * pulse;
                }
            });
            const START = 5;
            const travel = 0.12;
            for (const [i, s] of shots.entries()) {
                const y = R * Math.sin(s.lat);
                const hitX = R * Math.cos(s.lat);
                const n = s.heavy ? 1 : 0.6;
                const lane = fx.node(`lane-${i}`);
                lane.rotation.y = s.turn;
                // The tracer: a hot streak in from the right, a little above, its tail warm.
                fx.sys({
                    parent: lane,
                    tex: 'dot',
                    mode: RenderMode.StretchedBillBoard,
                    stretch: {speed: 0.03, length: 1},
                    life: travel,
                    speed: (START - hitX) / travel,
                    size: s.heavy ? 0.2 : 0.13,
                    burst: [[s.hitAt - travel, 1]],
                    color: '#fff3a6',
                    at: [START, y, 0],
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
                const hit = fx.node(`hit-${i}`, [hitX, y, 0], lane);
                const t0 = s.hitAt;
                // The ripple: a front racing over the shell from the hit, the plates behind it still
                // humming. Erosion does the spreading: a cone mask laid round the hit by tiling and offset,
                // cut back as the alpha rises, its edge band the bright front; the colour fades behind it.
                const reach = s.heavy ? 1.9 : 1.2; // radians over the shell
                const ru = reach / (Math.PI * 2 * Math.max(Math.cos(s.lat), 0.35));
                const rv = reach / (Math.PI / 2);
                fx.sys({
                    ...shell,
                    image: 'hex-plates',
                    parent: lane,
                    loop: undefined,
                    life: 0.85,
                    burst: [[t0, 1]],
                    color: '#a6ecff',
                    // The lathe's U is 0.5 at -x; turn it to face the shots from +x.
                    rotate: [0, Math.PI, 0],
                    order: 5,
                    b: [
                        tint(
                            [
                                ['#ffffff', 0],
                                ['#3a8bd8', 0.4],
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
                                offset: [0.5 - 0.5 / (2 * ru), 0.5 - s.lat / (Math.PI / 2) / (2 * rv)],
                            },
                            softness: 0.04,
                            edgeWidth: 0.1,
                            edgeColor: s.heavy ? [1.2, 2.2, 2.6] : [0.7, 1.4, 1.8],
                        },
                    },
                });
                // The hot spot: the struck plates go white, then cool.
                fx.sys({
                    parent: hit,
                    tex: 'glow',
                    life: 0.5,
                    size: 1.4 * n,
                    burst: [[t0, 1]],
                    color: '#ffffff',
                    order: 7,
                    b: [
                        tint(
                            [
                                ['#ffffff', 0],
                                ['#36b9ee', 0.5],
                            ],
                            popOut(0.1)
                        ),
                    ],
                });
                // The impact: a white star shrinking, and light that flares and dies.
                fx.sys({
                    parent: hit,
                    tex: 'glint',
                    life: 0.14,
                    size: 1.3 * n,
                    burst: [[t0, 1]],
                    color: '#d4fbff',
                    order: 8,
                    b: [grow([0, 1], [1, 0.2])],
                });
                fx.sys({
                    parent: hit,
                    tex: 'glow',
                    life: 0.45,
                    size: 4 * n,
                    burst: [[t0, 1]],
                    color: '#36b9ee',
                    alpha: 0.45,
                    order: 2,
                    b: [tint([['#ffffff', 0]], popOut(0.05))],
                });
                // What glances off the curve: sparks up and away to the right, cool motes, rising stars,
                // and a little smoke.
                sparks(fx, {
                    parent: hit,
                    count: Math.round(24 * n),
                    time: t0,
                    loop: true,
                    aim: 'right',
                    shape: new ConeEmitter({radius: 0.05, angle: 0.7}),
                    gravity: 5,
                    speed: [3, 7],
                });
                fx.sys({
                    parent: hit,
                    tex: 'dot',
                    life: [0.3, 0.6],
                    speed: [0.8, 2],
                    size: [0.06, 0.1],
                    burst: [[t0, Math.round(7 * n)]],
                    color: ['#8ae8ff', '#d4fbff'],
                    shape: new ConeEmitter({radius: 0.05, angle: 1.2}),
                    aim: 'right',
                    order: 7,
                    b: [tint([['#ffffff', 0]], popOut(0.5)), drag([0, 1], [1, 0.3])],
                });
                fx.sys({
                    parent: hit,
                    tex: 'glint',
                    life: [0.3, 0.5],
                    speed: 0.15,
                    size: [0.2, 0.32],
                    burst: [[t0 + 0.04, 1, Math.round(3 * n), 0.07]],
                    color: '#d4fbff',
                    shape: new SphereEmitter({radius: 0.2}),
                    order: 8,
                    b: [tint(BLUE, popOut(0.3))],
                });
                smoke(fx, {
                    parent: hit,
                    burst: [[t0 + 0.03, Math.round(3 * n)]],
                    life: [0.9, 1.3],
                    speed: [0.2, 0.5],
                    size: [0.2, 0.32],
                    color: '#5b5f78',
                    alpha: 0.6,
                    aim: 'right',
                    radius: 0.05,
                    spread: 0.8,
                });
                // The heavy shot cracks the shell: fractures race out from the hit white-hot, cool and fade.
                if (s.heavy) {
                    fx.sys({
                        parent: hit,
                        tex: 'crack',
                        geo: quad(),
                        life: 0.9,
                        size: 1.7,
                        burst: [[t0, 1]],
                        rotate: [-s.lat, Math.PI / 2, 0],
                        order: 7,
                        b: [
                            tint(
                                [
                                    ['#ffffff', 0],
                                    ['#d4fbff', 0.15],
                                    ['#8ae8ff', 0.35],
                                    ['#000000', 1],
                                ],
                                [
                                    [0, 0],
                                    [1, 0.1],
                                    [1, 1],
                                ]
                            ),
                        ],
                        look: {erosion: {mask: image(fx.scene, 'radial').texture, softness: 0.05}},
                    });
                }
            }
            // The dome's own light.
            heart(fx, {at: [0, R * 0.45, 0], size: R * 2.6, color: '#2582d2', alpha: 0.08});
            pool(fx, {color: '#2582d2', size: 4.2, alpha: 0.3});
        },
    },
    {
        id: 'scifi/glitch',
        name: 'Glitch',
        loop: true,
        period: 2.4,
        view: {height: 1.1, distance: 6},
        build(fx) {
            // glitch.js in 3D: the hero's signal holds steady, then breaks up in two bursts (0.45 s and
            // 1.75 s): an RGB split, the body torn sideways, rows smeared out, junk blocks and dead pixels,
            // then snaps back clean; between them a stray scan bar flicks across now and then.
            const BURSTS: Array<[number, number]> = [
                [0.45, 0.7],
                [1.72, 1.98],
            ];
            const FLICKS = [0.27, 0.82, 1.3, 2.12];
            const inBurst = (t: number) => BURSTS.some(([a, b]) => t >= a && t < b);
            const body = fx.character();
            const ghosts = ['#ff2e63', '#2ef2ff'].map((color, i) => {
                const g = fx.character([0, 0, 0], 1.8, color);
                const m = own(g, `glitch-ghost-${i}`);
                m.emissiveColor = c3(color);
                m.alpha = 0.55;
                return g;
            });
            const bar = fx.prop(shapes.box(fx.scene, 1.6, 0.05, 0.02), {
                at: [0, 1, 0.45],
                color: '#2ef2ff',
                glow: '#2ef2ff',
                alpha: 0.6,
            });
            fx.every((t) => {
                const step = Math.floor(t * 20);
                const on = inBurst(t);
                const k = on ? 1 : 0;
                const jx = hash(step) * 0.16 * k;
                ghosts[0].position.x = -0.12 * k + jx;
                ghosts[1].position.x = 0.12 * k - jx * 0.5;
                for (const g of ghosts) g.setEnabled(on);
                // Torn sideways and squashed a step at a time while it lasts.
                body.position.x = on ? hash(step + 99) * 0.18 : 0;
                body.scaling.set(on ? 1 + hash(step + 5) * 0.25 : 1, on ? 1 + hash(step + 9) * 0.06 : 1, 1);
                const flick = FLICKS.find((f) => t >= f && t < f + 0.07);
                bar.setEnabled(flick !== undefined || (on && hash(step + 2) > 0.2));
                bar.position.y = 0.3 + 1.5 * (0.5 + 0.5 * hash(step + 11));
            });
            // Slices torn out sideways, smeared rows, junk blocks, during the bursts.
            const slices = fx.sys({
                tex: 'white',
                life: [0.04, 0.1],
                size: [0.05, 0.12],
                rate: 1,
                color: ['#ff2e63', '#2ef2ff'],
                alpha: 0.85,
                shape: new BoxEmitter({width: 0.6, height: 1.8, depth: 0.1}),
                at: [0, 0.95, 0.3],
                order: 6,
            });
            windows(slices, 2.4, BURSTS, 60);
            const smear = fx.sys({
                tex: 'streak',
                life: [0.05, 0.12],
                size: [0.8, 1.8],
                rate: 1,
                color: ['#ff7aa8', '#b4fbff'],
                alpha: 0.8,
                shape: new BoxEmitter({width: 0.4, height: 1.8, depth: 0.1}),
                at: [0.3, 0.95, 0.35],
                order: 7,
            });
            windows(smear, 2.4, BURSTS, 40);
            const junk = fx.sys({
                tex: 'square',
                life: [0.06, 0.2],
                size: [0.08, 0.22],
                rate: 1,
                color: ['#ff2e63', '#2ef2ff'],
                shape: new BoxEmitter({width: 1.8, height: 2.2, depth: 0.4}),
                at: [0, 1, 0.3],
                order: 6,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            windows(junk, 2.4, BURSTS, 70);
            // Dead pixels that linger a little, any time.
            fx.sys({
                tex: 'square',
                life: [0.1, 0.4],
                size: [0.04, 0.07],
                rate: 5,
                color: ['#ff7aa8', '#b4fbff'],
                shape: new BoxEmitter({width: 1.6, height: 2, depth: 0.4}),
                at: [0, 1, 0.3],
                order: 6,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            const glow = light(fx, {at: [0, 1, 0.2], size: 3, color: '#ff2e63', alpha: 0.3, life: 0.25, loop: true});
            glow.emissionBursts.length = 0;
            windows(glow, 2.4, BURSTS, 12);
            pool(fx, {color: '#2ef2ff', size: 2.2, alpha: 0.12});
        },
    },
    {
        id: 'scifi/hologram',
        name: 'Hologram',
        loop: true,
        period: 4,
        view: {height: 1.5, distance: 7},
        build(fx) {
            // hologram.js in 3D: a floor projector throws a cone of light up holding a turning diamond,
            // drawn in scanlines and wireframe; a scan bar rolls through it, data rings circle it, and now
            // and then it flickers, tears and jitters.
            fx.prop(shapes.cylinder(fx.scene, 0.2, 0.55, 0.65, 24), {at: [0, 0.1, 0], color: METAL});
            fx.prop(shapes.torus(fx.scene, 0.42, 0.04), {at: [0, 0.21, 0], color: '#123b80', glow: '#2e98e8'});
            fx.prop(shapes.sphere(fx.scene, 0.13), {at: [0, 0.24, 0], color: '#bff0ff', glow: '#6cd0ff'});
            star(fx, {at: [0, 0.3, 0], size: 0.9, life: 1e4, tex: 'glow', color: '#bff0ff', alpha: 0.9});
            const MID = 1.95;
            // The cone of light from the lens to the model.
            const cone: Array<[number, number]> = [
                [0.1, 0.26],
                [0.45, 0.75],
                [0.85, 1.25],
            ];
            shell(fx, {
                geo: lathe(cone, 40),
                image: 'light-column',
                color: '#2e98e8',
                rim: [0.45, 0.85, 1],
                alpha: [0.3, 0.55],
                scroll: [0.1, 0],
            });
            // The model: a diamond in scanlines and a wireframe over it, turning and bobbing.
            const model = fx.node('model', [0, MID, 0]);
            const diamond: Array<[number, number]> = [
                [0.001, -0.75],
                [0.58, 0],
                [0.001, 0.75],
            ];
            shell(fx, {
                geo: lathe(diamond, 4),
                image: 'scanlines',
                color: '#6cd0ff',
                rim: [0.7, 0.95, 1],
                alpha: [0.35, 0.8],
                tiling: [1, 9],
                scroll: [0, -0.4],
                parent: model,
            });
            const wire = MeshBuilder.CreateCylinder(
                'pixelfx-holo-wire',
                {height: 1.5, diameterTop: 0, diameterBottom: 0, tessellation: 4, subdivisions: 2},
                fx.scene
            );
            // Pull the middle ring out to the diamond's girth.
            const pos = wire.getVerticesData('position');
            if (pos) {
                for (let i = 0; i < pos.length; i += 3) {
                    if (Math.abs(pos[i + 1]) < 0.01) {
                        const a = Math.atan2(pos[i + 2], pos[i]);
                        pos[i] = Math.cos(a) * 0.6;
                        pos[i + 2] = Math.sin(a) * 0.6;
                    }
                }
                wire.updateVerticesData('position', pos);
            }
            const wireMat = own(fx.prop(wire, {parent: model, color: '#bff0ff', glow: '#6cd0ff'}), 'holo-wire');
            wireMat.wireframe = true;
            wireMat.disableLighting = true;
            fx.every((t) => {
                model.rotation.y = (t / 4) * Math.PI * 2;
                const step = Math.floor(t * 30);
                // Now and then: a dropped frame, a jump sideways, a squash.
                const drop = step % 41 === 3 || step % 67 === 20;
                const tear = step % 53 === 10 || step % 53 === 11 || step % 79 === 40;
                const s = drop ? 0.001 : 1.35;
                model.scaling.set(s * (tear ? 1.15 : 1), s * (tear ? 0.9 : 1), s);
                model.position.set(tear ? 0.15 : 0, MID + 0.07 * Math.sin((t / 4) * Math.PI * 4), 0);
            });
            // The scan bar rolling up through it, twice a loop.
            const scan = fx.node('scan', [0, MID, 0]);
            held(fx, {parent: scan, tex: 'streak', size: 1.3, color: '#dff8ff', alpha: 0.45, order: 9});
            fx.every((t) => {
                const k = (t % 2) / 2;
                scan.position.y = MID - 0.85 + 1.7 * k;
            });
            // Data rings: dotted circles round its girth and under it, turning.
            for (const [y, r, n, w] of [
                [MID, 1.0, 28, 0.8],
                [MID - 0.95, 0.8, 22, -1.1],
                [MID + 0.95, 0.5, 16, 1.4],
            ]) {
                fx.sys({
                    tex: 'square',
                    life: 1e4,
                    size: 0.05,
                    burst: [[0, n]],
                    loop: false,
                    color: '#8fe0ff',
                    shape: new CircleEmitter({radius: r, thickness: 0, arc: Math.PI * 2}),
                    rotate: FLAT,
                    at: [0, y, 0],
                    order: 7,
                    b: [orbit(w, [0, 0, 1])],
                });
            }
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 1e4,
                size: 2.3,
                burst: 1,
                loop: false,
                color: '#2e98e8',
                alpha: 0.5,
                at: [0, MID, 0],
                order: 3,
            });
            fx.sys({
                tex: 'dot',
                life: [0.8, 1.2],
                speed: [0.4, 0.75],
                size: [0.03, 0.05],
                rate: 14,
                color: '#c8f0ff',
                shape: new ConeEmitter({radius: 0.1, angle: 0.55}),
                at: [0, 0.3, 0],
                aim: 'up',
                order: 5,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            fx.sys({
                tex: 'rune',
                mode: RenderMode.HorizontalBillBoard,
                life: 1e4,
                size: 2,
                burst: 1,
                loop: false,
                color: '#2e98e8',
                alpha: 0.6,
                at: [0, 0.03, 0],
                order: 2,
                b: [spin(0.5)],
            });
            light(fx, {at: [0, MID, 0], size: 3.4, color: '#2e98e8', alpha: 0.2, life: 1e4});
        },
    },
    {
        id: 'scifi/jetpack',
        name: 'Jetpack',
        loop: true,
        period: 2,
        view: {height: 1.7, distance: 7},
        build(fx) {
            // jetpack.js in 3D: twin thrusters hovering, firing straight down: white-hot cores with shock
            // diamonds inside ragged flames, puffs that cool into smoke billowing below, embers, and the
            // floor lit by the fire.
            const fireRamp = rampTexture(fx.scene, PALETTE.fire);
            const pack = fx.node('pack', [0, 2.6, 0]);
            fx.prop(shapes.box(fx.scene, 0.3, 0.95, 0.14), {parent: pack, at: [0, 0.05, -0.14], color: '#2e2c38'});
            fx.prop(shapes.box(fx.scene, 0.06, 0.6, 0.02), {
                parent: pack,
                at: [0, 0.1, -0.06],
                color: '#ff8a2a',
                glow: '#c05010',
            });
            const nozzles = [-0.3, 0.3].map((x, i) => {
                fx.prop(shapes.cylinder(fx.scene, 1.1, 0.2, 0.2, 16), {parent: pack, at: [x, 0, 0], color: '#5a5868'});
                fx.prop(shapes.sphere(fx.scene, 0.2, 12), {parent: pack, at: [x, 0.55, 0], color: '#5a5868'});
                fx.prop(shapes.cylinder(fx.scene, 0.06, 0.21, 0.21, 16), {
                    parent: pack,
                    at: [x, 0.3, 0],
                    color: '#2e2c38',
                });
                fx.prop(shapes.cylinder(fx.scene, 0.24, 0.11, 0.17, 12), {
                    parent: pack,
                    at: [x, -0.67, 0],
                    color: '#2e2c38',
                });
                return fx.node(`nozzle-${i}`, [x, -0.8, 0], pack);
            });
            fx.every((t) => {
                pack.position.y = 2.6 + 0.06 * Math.sin((t / 2) * Math.PI * 2);
                pack.rotation.z = 0.03 * Math.sin((t / 2) * Math.PI * 4);
            });
            for (const nozzle of nozzles) {
                // The white-hot core: a fast tight stream.
                fx.sys({
                    parent: nozzle,
                    tex: 'glow',
                    life: 0.16,
                    speed: 5,
                    size: [0.26, 0.34],
                    rate: 90,
                    color: '#ffffff',
                    aim: 'down',
                    shape: new ConeEmitter({radius: 0.02, angle: 0.03}),
                    order: 7,
                    b: [tint(PALETTE.fire.slice(0, 3), fadeOut(0.5, 0.05)), grow([0, 1], [1, 0.4])],
                });
                // Shock diamonds: bright knots held along the core, flickering.
                for (const [k, y] of [-0.18, -0.38, -0.56].entries()) {
                    const knot = fx.node(`knot-${k}`, [0, y, 0], nozzle);
                    fx.sys({
                        parent: knot,
                        tex: 'glint',
                        life: 0.05,
                        size: [0.16 - k * 0.03, 0.24 - k * 0.04],
                        rate: 50,
                        color: '#fff8d0',
                        order: 8,
                        b: [tint([['#ffffff', 0]], flicker())],
                    });
                }
                // The ragged flame round it, flipbook puffs in the fire ramp.
                fx.sys({
                    parent: nozzle,
                    image: 'fire-puff-heat',
                    randomTile: false,
                    blend: 'add',
                    life: [0.26, 0.4],
                    speed: [3.5, 5],
                    size: [0.4, 0.6],
                    rate: 55,
                    rot: true,
                    aim: 'down',
                    shape: new ConeEmitter({radius: 0.06, angle: 0.12}),
                    world: true,
                    order: 6,
                    look: {gradientMap: {ramp: fireRamp}},
                    b: [lifeFrames(16, 1.1), tint([['#ffffff', 0]], popOut(0.4)), grow([0, 0.7], [1, 1.5])],
                });
                // Puffs cooling into smoke and billowing out below.
                dust(fx, {
                    parent: nozzle,
                    aim: 'down',
                    shape: new ConeEmitter({radius: 0.08, angle: 0.18}),
                    rate: 12,
                    speed: [2.4, 3.4],
                    size: [0.45, 0.65],
                    life: [1, 1.5],
                    world: true,
                    color: '#8a8090',
                    alpha: 0.65,
                    warm: true,
                    drag: 2.5,
                    lift: 0.4,
                    grows: 2.6,
                    soft: false,
                });
                fx.sys({
                    parent: nozzle,
                    tex: 'dot',
                    mode: RenderMode.StretchedBillBoard,
                    stretch: {speed: 0.05, length: 1},
                    life: [0.4, 0.8],
                    speed: [2, 4],
                    size: [0.03, 0.05],
                    rate: 10,
                    aim: 'down',
                    shape: new ConeEmitter({radius: 0.05, angle: 0.5}),
                    world: true,
                    order: 6,
                    b: [tint(PALETTE.fire, fadeOut(0.5, 0.05)), gravity(3), airDrag(1)],
                });
                held(fx, {parent: nozzle, tex: 'glow', size: 0.7, color: '#ffc23d', alpha: 0.8, order: 5});
            }
            // Smoke rolling out along the floor, and the floor lit by the fire.
            dust(fx, {
                shape: new CircleEmitter({radius: 0.4}),
                rotate: FLAT,
                rate: 8,
                speed: [1.2, 2],
                size: [0.6, 0.9],
                life: [1.2, 1.6],
                color: '#4e4856',
                alpha: 0.45,
                at: [0, 0.2, 0],
                grows: 2.2,
                soft: false,
            });
            const glow = light(fx, {
                at: [0, 0.045, 0],
                size: 3.4,
                color: '#ff8a2a',
                alpha: 0.6,
                life: 0.1,
                floor: true,
                loop: true,
            });
            glow.emissionBursts.length = 0;
            glow.emissionOverTime = curve([0, 40], [1, 40]);
            light(fx, {at: [0, 1.6, 0], size: 3, color: '#ff8a2a', alpha: 0.2, life: 1e4});
        },
    },
    {
        id: 'scifi/laser-grid',
        name: 'Laser grid',
        loop: true,
        period: 3,
        view: {height: 1.3, distance: 9},
        build(fx) {
            // laser-grid.js in 3D: security lasers between two steel posts. Two beams slide up and down,
            // two sweep from the post tops across the floor, scissoring past each other and scorching it in
            // sparks; haze and dust light up only where the beams cut through.
            const X = 2.8;
            for (const x of [-X, X]) {
                fx.prop(shapes.box(fx.scene, 0.3, 2.7, 0.3), {at: [x, 1.35, 0], color: METAL});
                fx.prop(shapes.box(fx.scene, 0.06, 2.4, 0.06), {
                    at: [x - Math.sign(x) * 0.17, 1.35, 0],
                    color: '#8a1020',
                    glow: '#d01c2a',
                });
                fx.prop(shapes.box(fx.scene, 0.5, 0.1, 0.5), {at: [x, 0.05, 0], color: '#2a2834'});
            }
            const RED = '#ff2a2a';
            const H = 2.45;
            type Beam = {from: TransformNode; to: TransformNode; at: (t: number) => [number, number, number, number]};
            const s = (t: number, phase: number) => 0.5 + 0.5 * Math.sin((t / 3 + phase) * Math.PI * 2);
            const beams: Beam[] = [
                // [from y, to x, to y, unused]: the sliders.
                {
                    from: fx.node('h1a'),
                    to: fx.node('h1b'),
                    at: (t) => [0.5 + 0.5 * s(t, 0), X - 0.2, 0.5 + 0.5 * s(t, 0), 0],
                },
                {
                    from: fx.node('h2a'),
                    to: fx.node('h2b'),
                    at: (t) => [1.3 + 0.7 * s(t, 0.5), X - 0.2, 1.3 + 0.7 * s(t, 0.5), 0],
                },
                // The sweepers, from each post's top to a point running along the floor.
                {from: fx.node('s1a'), to: fx.node('s1b'), at: (t) => [H, -2 + 4 * s(t, 0.25), 0.02, 0]},
                {from: fx.node('s2a'), to: fx.node('s2b'), at: (t) => [H, 2 - 4 * s(t, 0.25), 0.02, 1]},
            ];
            const motes = beams.map((beam, i) => {
                laser(fx, beam.from, beam.to, RED);
                fx.sys({
                    parent: beam.from,
                    tex: 'glow',
                    life: 0.1,
                    size: [0.35, 0.5],
                    rate: 20,
                    color: '#ff4a4a',
                    order: 6,
                });
                // Dust and haze lit where this beam passes.
                const mote = fx.node(`mote-${i}`);
                fx.sys({
                    parent: mote,
                    tex: 'dot',
                    life: [0.25, 0.6],
                    size: [0.03, 0.06],
                    rate: 40,
                    color: '#ffb0a8',
                    world: true,
                    order: 6,
                    b: [tint([['#ffffff', 0]], flicker()), wobble(0.6, 0.2)],
                });
                fx.sys({
                    parent: mote,
                    tex: 'glow',
                    life: [0.3, 0.5],
                    size: [0.5, 0.8],
                    rate: 10,
                    color: RED,
                    alpha: 0.15,
                    world: true,
                    order: 4,
                });
                return mote;
            });
            // The sweepers' feet: sparks, a hot spot, and a scorch left on the floor.
            for (const beam of beams.slice(2)) {
                fx.sys({
                    parent: beam.to,
                    tex: 'dot',
                    mode: RenderMode.StretchedBillBoard,
                    stretch: {speed: 0.06, length: 1},
                    life: [0.25, 0.5],
                    speed: [1.5, 3.5],
                    size: [0.03, 0.05],
                    rate: 35,
                    aim: 'up',
                    shape: new ConeEmitter({radius: 0.03, angle: 0.8}),
                    world: true,
                    order: 7,
                    b: [
                        tint(
                            [
                                ['#ffffff', 0],
                                ['#ffb070', 0.3],
                                ['#ff3a2a', 1],
                            ],
                            fadeOut(0.5, 0.02)
                        ),
                        gravity(9),
                    ],
                });
                fx.sys({
                    parent: beam.to,
                    tex: 'glow',
                    mode: RenderMode.HorizontalBillBoard,
                    life: 0.6,
                    size: 0.35,
                    rate: 40,
                    color: '#ff6a3a',
                    world: true,
                    order: 3,
                    b: [
                        tint(
                            [
                                ['#ffffff', 0],
                                ['#ff3a1a', 0.3],
                                ['#401008', 1],
                            ],
                            fadeOut(0.3, 0.02)
                        ),
                    ],
                });
                fx.sys({
                    parent: beam.to,
                    tex: 'glow',
                    mode: RenderMode.HorizontalBillBoard,
                    blend: 'alpha',
                    life: 1.6,
                    size: 0.4,
                    rate: 30,
                    color: '#14080a',
                    alpha: 0.6,
                    world: true,
                    order: 1,
                    b: [tint([['#ffffff', 0]], fadeOut(0.5, 0.05))],
                });
                held(fx, {parent: beam.to, tex: 'glow', size: 0.6, color: '#ff5a3a', order: 7});
            }
            let seed = 0;
            fx.every((t) => {
                for (const [i, beam] of beams.entries()) {
                    const [fy, tx, ty, flip] = beam.at(t);
                    const side = flip ? 1 : -1;
                    beam.from.position.set(side * (X - 0.2), fy, 0);
                    beam.to.position.set(i < 2 ? X - 0.2 : tx, ty, 0);
                    const k = 0.5 + 0.5 * hash(++seed);
                    const a = beam.from.position;
                    const b = beam.to.position;
                    motes[i].position.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, 0);
                }
            });
            pool(fx, {color: '#d01c2a', size: 5, alpha: 0.18});
        },
    },
    {
        id: 'scifi/scanner',
        name: 'Scanner',
        loop: true,
        period: 3.2,
        view: {height: 1.1, distance: 6},
        build(fx) {
            // scanner.js in 3D: brackets snap onto the hero (0.33 s, a white frame flashes), a scan line
            // sweeps head to toe leaving a cooling outline, a readout counts up to OK, and at 2.8 s it all
            // lets go.
            const hero = fx.character();
            const heroMat = own(hero, 'scan-hero');
            const black = new Color3(0, 0, 0);
            const scanned = c3('#0a2412');
            const GREEN_HEX = '#5aff8a';
            const frame = fx.node('frame', [0, 0.95, 0.45]);
            const pieces: Array<[Mesh, number, number, boolean]> = [];
            for (const sx of [-1, 1]) {
                for (const sy of [-1, 1]) {
                    const across = fx.prop(shapes.box(fx.scene, 0.28, 0.045, 0.045), {
                        parent: frame,
                        color: GREEN_HEX,
                        glow: '#3ad06a',
                    });
                    const down = fx.prop(shapes.box(fx.scene, 0.045, 0.28, 0.045), {
                        parent: frame,
                        color: GREEN_HEX,
                        glow: '#3ad06a',
                    });
                    pieces.push([across, sx, sy, true], [down, sx, sy, false]);
                }
            }
            const bracketMat = own(pieces[0][0], 'scan-bracket');
            for (const [m] of pieces) m.material = bracketMat;
            // The white frame that flashes as they lock on.
            const flashBox = fx.node('flash', [0, 0, 0], frame);
            for (const [x, y, bw, bh] of [
                [0, 1.06, 1.06, 0.035],
                [0, -1.06, 1.06, 0.035],
                [-0.53, 0, 0.035, 2.12],
                [0.53, 0, 0.035, 2.12],
            ]) {
                fx.prop(shapes.box(fx.scene, bw, bh, 0.03), {
                    parent: flashBox,
                    at: [x, y, 0],
                    color: '#ffffff',
                    glow: '#ffffff',
                });
            }
            const green = c3('#3ad06a');
            const white = c3('#ffffff');
            // The readout: a panel beside the hero, drawn into a texture as it counts.
            const panel = MeshBuilder.CreatePlane('pixelfx-scan-readout', {width: 1.2, height: 0.6}, fx.scene);
            const text = new DynamicTexture('pixelfx-scan-text', {width: 256, height: 128}, fx.scene, true);
            text.hasAlpha = true;
            const panelMat = new StandardMaterial('pixelfx-scan-panel', fx.scene);
            panelMat.diffuseTexture = text;
            panelMat.emissiveTexture = text;
            panelMat.opacityTexture = text;
            panelMat.disableLighting = true;
            panelMat.backFaceCulling = false;
            fx.prop(panel, {at: [1.25, 1.55, 0.1]});
            panel.material = panelMat;
            let shown = '';
            const draw = (label: string, k: number) => {
                if (label === shown) return;
                shown = label;
                const ctx = text.getContext() as unknown as CanvasRenderingContext2D;
                ctx.clearRect(0, 0, 256, 128);
                if (label) {
                    ctx.fillStyle = '#7dff9a';
                    ctx.font = 'bold 64px monospace';
                    ctx.fillText(label, 10, 66);
                    for (let i = 0; i < 10; i++) {
                        ctx.globalAlpha = i < Math.round(k * 10) ? 1 : 0.25;
                        ctx.fillRect(12 + i * 22, 92, 14, 12);
                    }
                    ctx.globalAlpha = 1;
                }
                text.update(true);
            };
            const scan = fx.node('scan', [0, 2, 0]);
            const SCAN: [number, number] = [0.6, 1.5];
            fx.every((t) => {
                // Snapping in from wide with an overshoot, holding, then letting go.
                const k = ramp(t, 0, 0.33);
                const over = 1 + 0.12 * Math.sin(k * Math.PI);
                const w = (1.9 - 0.9 * k) * over * (t > 2.8 ? 1 + (t - 2.8) * 2 : 1);
                const h = (2.7 - 0.6 * k) * over * (t > 2.8 ? 1 + (t - 2.8) * 2 : 1);
                // Each corner is an L: a bar across and a bar down, meeting at the corner.
                for (const [m, sx, sy, across] of pieces) {
                    m.position.set(sx * w * 0.5 - (across ? sx * 0.12 : 0), sy * h * 0.5 - (across ? 0 : sy * 0.12), 0);
                }
                frame.setEnabled(t < 3.0);
                const flash = t >= 0.33 && t < 0.45;
                flashBox.setEnabled(flash);
                bracketMat.emissiveColor.copyFrom(flash ? white : green);
                const sk = (t - SCAN[0]) / (SCAN[1] - SCAN[0]);
                scan.position.y = 1.95 - 1.9 * Math.min(1, Math.max(0, sk));
                scan.setEnabled(sk >= 0 && sk <= 1);
                heroMat.emissiveColor.copyFrom(t > SCAN[0] && t < 2.8 ? scanned : black);
                const pct = Math.min(1, Math.max(0, (t - SCAN[0]) / 1.05));
                draw(t < SCAN[0] || t > 2.8 ? '' : pct < 1 ? `${Math.round(pct * 100)}%` : 'OK', pct);
            });
            // The scan line: a ring of light round the body and a bright bar across it.
            held(fx, {
                parent: scan,
                tex: 'ring',
                size: 0.9,
                color: '#b8ffc8',
                mode: RenderMode.HorizontalBillBoard,
                order: 8,
            });
            held(fx, {parent: scan, tex: 'streak', size: 1.5, color: '#b8ffc8', order: 9});
            // The outline it leaves: specks on the body's skin, white cooling to green.
            const trace = fx.sys({
                tex: 'dot',
                life: [1.3, 1.5],
                size: [0.05, 0.07],
                rate: 1,
                shape: new CircleEmitter({radius: 0.27, thickness: 0}),
                rotate: FLAT,
                parent: scan,
                world: true,
                order: 7,
                b: [tint(GREEN, fadeOut(0.85, 0.02))],
            });
            windows(trace, 3.2, [SCAN], 260);
            pool(fx, {color: '#3ad06a', size: 2.4, alpha: 0.2});
        },
    },
    {
        id: 'scifi/teleporter-pad',
        name: 'Teleporter pad',
        loop: true,
        period: 2.4,
        view: {height: 1.4, distance: 7},
        build(fx) {
            // teleporter-pad.js in 3D: a steel pad glows on the floor with rings rippling out over it; a
            // soft column of light rises off it, rings of light lift away up it, and sparkles drift up.
            fx.prop(shapes.cylinder(fx.scene, 0.18, 1.25, 1.35, 40), {at: [0, 0.09, 0], color: METAL});
            fx.prop(shapes.cylinder(fx.scene, 0.02, 1.05, 1.05, 40), {
                at: [0, 0.19, 0],
                color: '#2a1a5a',
                glow: '#5a3ad2',
            });
            for (const r of [1.15, 0.72, 0.36]) {
                fx.prop(shapes.torus(fx.scene, r, 0.04), {at: [0, 0.2, 0], color: '#b4a2ff', glow: '#7a5aff'});
            }
            star(fx, {at: [0, 0.25, 0], size: 2.4, life: 1e4, tex: 'glow', color: '#b4a2ff', alpha: 0.55});
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 0.8,
                size: 2.3,
                rate: 1 / 0.6,
                color: '#d8ccff',
                at: [0, 0.22, 0],
                order: 4,
                b: [tint(VIOLET, popOut(0.4)), grow([0, 0.1], [1, 1])],
            });
            const column: Array<[number, number]> = [
                [0.98, 0.2],
                [0.98, 3],
            ];
            shell(fx, {
                geo: lathe(column, 48),
                image: 'light-column',
                color: '#8a6aff',
                rim: [0.75, 0.65, 1],
                alpha: [0.35, 0.6],
                scroll: [0.06, 0],
            });
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 1.8,
                speed: 1.4,
                size: 1.96,
                rate: 1.25,
                color: '#c8b4ff',
                aim: 'up',
                at: [0, 0.25, 0],
                order: 7,
                b: [tint(VIOLET, fadeOut(0.45, 0.05)), grow([0, 1], [1, 0.9])],
            });
            fx.sys({
                tex: 'glint',
                life: [1, 1.6],
                speed: 0.05,
                size: [0.1, 0.2],
                rate: 16,
                shape: new CircleEmitter({radius: 0.85, thickness: 1}),
                rotate: FLAT,
                at: [0, 0.3, 0],
                order: 8,
                b: [tint([['#ffffff', 0]], flicker()), gravity(1.4, [0, 1, 0])],
            });
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.1, length: 1},
                life: [0.6, 1],
                speed: [1.5, 2.5],
                size: [0.03, 0.05],
                rate: 14,
                color: '#d8ccff',
                shape: new CircleEmitter({radius: 0.85, thickness: 1}),
                rotate: [-Math.PI / 2, 0, 0],
                aim: 'up',
                at: [0, 0.3, 0],
                order: 6,
                b: [tint(VIOLET, fadeOut(0.5, 0.1))],
            });
            light(fx, {at: [0, 0.045, 0], size: 4, color: '#7a5aff', alpha: 0.4, life: 1e4, floor: true});
        },
    },
    {
        id: 'scifi/tractor-beam',
        name: 'Tractor beam',
        loop: true,
        period: 3,
        view: {height: 1.9, distance: 9},
        build(fx) {
            // tractor-beam.js in 3D: a hovering pod projects a cone of light to the floor; rocks tear loose
            // in puffs of dust and spiral up spinning into the lens while rings of light climb the beam.
            const TOP = 3.5;
            const pod = fx.node('pod', [0, TOP, 0]);
            fx.prop(shapes.cylinder(fx.scene, 0.2, 1.25, 0.55, 32), {parent: pod, at: [0, 0.05, 0], color: '#5a5868'});
            fx.prop(shapes.cylinder(fx.scene, 0.12, 0.8, 1.25, 32), {parent: pod, at: [0, 0.21, 0], color: '#6a6878'});
            const dome = fx.prop(shapes.sphere(fx.scene, 0.5, 16), {
                parent: pod,
                at: [0, 0.3, 0],
                color: '#3ad0c0',
                glow: '#1a8a80',
            });
            dome.scaling.y = 0.65;
            for (let i = 0; i < 10; i++) {
                const a = (i / 10) * Math.PI * 2;
                fx.prop(shapes.sphere(fx.scene, 0.05, 6), {
                    parent: pod,
                    at: [Math.cos(a) * 1.18, 0.13, Math.sin(a) * 1.18],
                    color: '#bffff4',
                    glow: '#5af0d8',
                });
            }
            fx.every((t) => {
                pod.position.y = TOP + 0.07 * Math.sin((t / 3) * Math.PI * 2);
            });
            star(fx, {at: [0, TOP - 0.1, 0], size: 1.6, life: 1e4, tex: 'glow', color: '#dffffa', alpha: 0.9});
            const cone: Array<[number, number]> = [
                [1.55, 0.02],
                [0.95, 1.6],
                [0.4, TOP - 0.1],
            ];
            shell(fx, {
                geo: lathe(cone, 48),
                image: 'light-column',
                color: '#3ae0c8',
                rim: [0.6, 1, 0.92],
                alpha: [0.3, 0.55],
                scroll: [-0.08, 0],
            });
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 1e4,
                size: 3.15,
                burst: 1,
                loop: false,
                color: '#8affea',
                at: [0, 0.04, 0],
                order: 3,
            });
            // Rings climbing the beam, narrowing with it.
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 1.7,
                speed: (TOP - 0.3) / 1.7,
                size: 3.1,
                rate: 1.3,
                color: '#bffff4',
                aim: 'up',
                at: [0, 0.1, 0],
                order: 7,
                b: [tint(CYAN, fadeOut(0.7, 0.1)), grow([0, 1], [1, 0.26])],
            });
            // Rocks torn loose, spiralling up into the lens.
            fx.sys({
                mesh: 'rock',
                life: 2.1,
                speed: -0.32,
                size: [0.18, 0.3],
                rate: 3,
                color: '#9a96a8',
                shape: new CircleEmitter({radius: 1.15, thickness: 0.2}),
                rotate: FLAT,
                at: [0, 0.08, 0],
                tumble: 5,
                order: 5,
                b: [gravity(1.55, [0, 1, 0]), orbit(2.4, [0, 0, 1]), grow([0, 1], [0.8, 1], [1, 0.2])],
            });
            dust(fx, {
                shape: new CircleEmitter({radius: 1.15, thickness: 0.2}),
                rotate: FLAT,
                rate: 3,
                speed: [0.2, 0.5],
                size: [0.35, 0.55],
                life: [0.7, 1],
                color: '#8a8496',
                alpha: 0.5,
                at: [0, 0.1, 0],
                soft: false,
            });
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.12, length: 1},
                life: [0.8, 1.2],
                speed: [1.8, 2.8],
                size: [0.03, 0.05],
                rate: 18,
                color: '#bffff4',
                shape: new CircleEmitter({radius: 0.9, thickness: 1}),
                rotate: [-Math.PI / 2, 0, 0],
                aim: 'up',
                at: [0, 0.2, 0],
                order: 6,
                b: [tint(CYAN, fadeOut(0.6, 0.1))],
            });
            light(fx, {at: [0, 0.045, 0], size: 4, color: '#3ae0c8', alpha: 0.45, life: 1e4, floor: true});
        },
    },
    {
        id: 'scifi/warp-in',
        name: 'Warp in',
        loop: false,
        period: 3,
        view: {height: 1.6, distance: 9},
        build(fx) {
            // warp-in.js in 3D: a thin line drops from the sky and the beam slams down at 0.6 s, rings
            // running down it; from 1 s a scanline paints the hero in from head to toe, white-hot and
            // cooling to their own colours; at 1.9 s the beam pinches shut in sparks.
            const SLAM = 0.6;
            const hero = fx.character();
            const heroMat = own(hero, 'warp-in-hero');
            const cut = clipped(heroMat, 'above');
            const beam = fx.node('beam');
            const tube: Array<[number, number]> = [
                [0.6, 0],
                [0.6, 7],
            ];
            shell(fx, {
                geo: lathe(tube, 40),
                image: 'light-column',
                color: '#4ad8ff',
                rim: [0.6, 0.95, 1],
                alpha: [0.4, 0.8],
                parent: beam,
                life: 3,
            });
            const core: Array<[number, number]> = [
                [0.22, 0],
                [0.22, 7],
            ];
            shell(fx, {
                geo: lathe(core, 24),
                color: '#dffaff',
                rim: [1, 1, 1],
                alpha: [0.3, 0.6],
                parent: beam,
                life: 3,
            });
            const scan = fx.node('scan', [0, 2, 0]);
            const PAINT: [number, number] = [1.0, 1.75];
            const white = c3('#c8f8ff');
            const black = new Color3(0, 0, 0);
            fx.every((t) => {
                // A thread from the sky, the slam with an overshoot, the hold, the pinch.
                let w = 0.001;
                if (t >= 0.1 && t < SLAM) w = 0.04;
                else if (t >= SLAM && t < 2.1)
                    w =
                        Math.min(1.25, (t - SLAM) / 0.08) *
                        (t < 0.8 ? 1 + 0.25 * Math.sin(((t - SLAM) / 0.2) * Math.PI) : 1) *
                        (1 - ramp(t, 1.9, 2.08));
                w *= 1 + 0.04 * Math.sin(t * 40);
                const drop = ramp(t, 0.1, 0.35);
                beam.scaling.set(Math.max(0.001, w), Math.max(0.001, drop), Math.max(0.001, w));
                beam.position.y = 7 * (1 - drop);
                // The hero, painted in from the head down and cooling.
                const k = ramp(t, PAINT[0], PAINT[1]);
                const y = t < PAINT[0] ? 5 : 1.95 - 1.95 * k;
                cut(y);
                hero.setEnabled(t >= PAINT[0]);
                scan.position.y = y;
                scan.setEnabled(t >= PAINT[0] && t < PAINT[1] + 0.02);
                Color3.LerpToRef(white, black, ramp(t, 1.75, 2.4), heroMat.emissiveColor);
            });
            held(fx, {
                parent: scan,
                tex: 'ring',
                size: 1,
                color: '#dffaff',
                mode: RenderMode.HorizontalBillBoard,
                order: 9,
            });
            held(fx, {parent: scan, tex: 'streak', size: 1.4, color: '#dffaff', order: 9});
            // Rings running down the beam while it stands.
            const rings = fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 1.2,
                speed: 4.5,
                size: 1.5,
                rate: 1,
                color: '#bff4ff',
                aim: 'down',
                at: [0, 5.6, 0],
                order: 7,
                b: [tint(CYAN, fadeOut(0.8, 0.05))],
            });
            gate(rings, 3, SLAM + 0.05, 1.85, 4);
            // The slam: a flash, shock rings, dust thrown out along the floor, sparks.
            star(fx, {at: [0, 0.4, 0], size: 3, life: 0.25, time: SLAM, tex: 'glow', ramp: CYAN, order: 9});
            for (const [size, life] of [
                [7, 0.6],
                [4, 0.9],
            ]) {
                fx.sys({
                    tex: 'ring',
                    mode: RenderMode.HorizontalBillBoard,
                    life,
                    size,
                    burst: [[SLAM, 1]],
                    color: '#8fe8ff',
                    at: [0, 0.05, 0],
                    order: 4,
                    b: [tint(CYAN, popOut(0.3)), grow([0, 0.15], [1, 1])],
                });
            }
            dust(fx, {
                shape: new CircleEmitter({radius: 0.6}),
                rotate: FLAT,
                burst: [[SLAM, 12]],
                speed: [2.5, 4],
                size: [0.45, 0.7],
                life: [0.6, 0.9],
                color: '#5a6a7a',
                alpha: 0.5,
                at: [0, 0.15, 0],
                soft: false,
                loop: false,
            });
            sparks(fx, {
                at: [0, 0.15, 0],
                count: 18,
                time: SLAM,
                palette: CYAN,
                speed: [2, 4],
                aim: 'up',
                shape: new ConeEmitter({radius: 0.5, angle: 1.2}),
            });
            // The pinch: sparks off the hero, then sparkles drifting.
            sparks(fx, {
                at: [0, 1, 0],
                count: 20,
                time: 2.05,
                palette: CYAN,
                speed: [1.5, 3],
                shape: new SphereEmitter({radius: 0.3}),
            });
            const glints = fx.sys({
                tex: 'glint',
                life: [0.4, 0.7],
                size: [0.1, 0.2],
                rate: 1,
                shape: new BoxEmitter({width: 0.9, height: 1.9, depth: 0.5}),
                at: [0, 1, 0],
                speed: 0.2,
                aim: 'up',
                order: 9,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            gate(glints, 3, 1.95, 2.7, 22);
            light(fx, {at: [0, 0.045, 0], size: 3, color: '#2ec8e8', alpha: 0.6, life: 1.5, time: SLAM, floor: true});
        },
    },
    {
        id: 'scifi/warp-out',
        name: 'Warp out',
        loop: false,
        period: 2.6,
        view: {height: 1.6, distance: 9},
        build(fx) {
            // warp-out.js in 3D: the hero's outline flickers on, they flash white at 0.4 s and break into
            // light from the head down, streaming up a beam that lifts off the floor at 1.2 s and pinches
            // shut at 1.75 s, leaving sparkles.
            const hero = fx.character();
            const heroMat = own(hero, 'warp-out-hero');
            const cut = clipped(heroMat, 'below');
            const white = c3('#e8fcff');
            const black = new Color3(0, 0, 0);
            const outline = fx.prop(shapes.cylinder(fx.scene, 2, 0.34, 0.34, 20), {
                at: [0, 1, 0],
                color: '#6af0ff',
                glow: '#2ec8e8',
                alpha: 0.25,
            });
            outline.alphaIndex = 0;
            const beam = fx.node('beam');
            const tube: Array<[number, number]> = [
                [0.5, 0],
                [0.5, 7],
            ];
            shell(fx, {
                geo: lathe(tube, 40),
                image: 'light-column',
                color: '#4ad8ff',
                rim: [0.6, 0.95, 1],
                alpha: [0.4, 0.8],
                parent: beam,
                life: 2.6,
            });
            const line = fx.node('line', [0, 2, 0]);
            fx.every((t) => {
                const step = Math.floor(t * 20);
                outline.setEnabled(t < 0.45 && hash(step) > -0.3);
                Color3.LerpToRef(black, white, ramp(t, 0.25, 0.42), heroMat.emissiveColor);
                // Breaking up from the head down from 0.5 s to 0.95 s.
                const y = 1.95 - 1.95 * ramp(t, 0.5, 0.95);
                cut(t < 0.5 ? 5 : y);
                hero.setEnabled(t < 0.97);
                line.position.y = y;
                line.setEnabled(t >= 0.5 && t < 0.97);
                // The beam: up from 0.5 s, lifting off the floor from 1.2 s, pinched shut by 1.75 s.
                const w = t < 0.5 ? 0.001 : Math.min(1, (t - 0.5) / 0.08) * (1 - ramp(t, 1.55, 1.75));
                const lift = 7 * ramp(t, 1.2, 1.75);
                beam.scaling.set(Math.max(0.001, w), Math.max(0.001, 1 - lift / 7), Math.max(0.001, w));
                beam.position.y = lift;
            });
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 0.45,
                size: 1.5,
                burst: [[0, 1]],
                color: '#8fe8ff',
                at: [0, 0.04, 0],
                order: 4,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            star(fx, {at: [0, 1, 0.3], size: 3, life: 0.25, time: 0.42, tex: 'glow', ramp: CYAN, order: 9});
            // The body breaking into light at the line and streaming up the beam.
            held(fx, {parent: line, tex: 'streak', size: 1.3, color: '#ffffff', order: 9});
            const bits = fx.sys({
                tex: 'square',
                life: [0.5, 0.9],
                speed: [3, 6],
                size: [0.05, 0.1],
                rate: 1,
                color: ['#ffffff', '#8fe8ff'],
                shape: new CircleEmitter({radius: 0.28, thickness: 1}),
                rotate: FLAT,
                parent: line,
                world: true,
                order: 8,
                b: [tint(CYAN, fadeOut(0.6, 0.02)), gravity(4, [0, 1, 0])],
            });
            gate(bits, 2.6, 0.5, 0.97, 260);
            fx.sys({
                tex: 'ring',
                mode: RenderMode.HorizontalBillBoard,
                life: 0.9,
                speed: 5,
                size: 1.2,
                rate: 1,
                color: '#bff4ff',
                aim: 'up',
                at: [0, 0.1, 0],
                order: 7,
                b: [tint(CYAN, fadeOut(0.6, 0.05))],
            }).emissionOverTime = curve([0, 0], [0.19, 0], [0.2, 4], [0.6, 4], [0.61, 0], [1, 0]);
            const glints = fx.sys({
                tex: 'glint',
                life: [0.4, 0.7],
                size: [0.1, 0.2],
                rate: 1,
                shape: new BoxEmitter({width: 0.8, height: 2, depth: 0.5}),
                at: [0, 1.4, 0],
                speed: 0.3,
                aim: 'up',
                order: 9,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            gate(glints, 2.6, 1.7, 2.2, 20);
            light(fx, {at: [0, 0.045, 0], size: 3, color: '#2ec8e8', alpha: 0.6, life: 1.2, time: 0.45, floor: true});
        },
    },
];
