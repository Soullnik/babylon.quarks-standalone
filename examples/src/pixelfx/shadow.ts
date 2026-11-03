import {Quaternion, Vector3} from '@babylonjs/core/Maths/math.vector';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {CircleEmitter, ConeEmitter, ConstantValue, RenderMode, SphereEmitter, Vector3Function} from 'babylon.quarks';
import {ballProfile, flatRing, held, window} from './arcane';
import {
    airDrag,
    fadeOut,
    flicker,
    gem,
    gravity,
    grow,
    lathe,
    lens,
    lifeFrames,
    orbit,
    outlineBand,
    popOut,
    spin,
    tint,
    wobble,
    type Geometry,
} from './kit';
import {clods, dust, hotSparks, light, star, type At} from './parts';
import {shockwave, type Ramp} from './recipes';
import {between, hero} from './spawn';
import {type FxBuilder, type FxDef} from './stage';
import {image, rampTexture} from './textures';

const VOID = ['#0a0612', '#1a0f2e', '#2f1a52', '#4e2a85', '#7a44c4', '#a873f0', '#d4b4ff', '#ffffff'];
const BONE = ['#170f26', '#4a3a6e', '#7f6ea6', '#b3a4d4', '#e2d8f6'];
const NECRO = ['#040e10', '#0a2228', '#0f3d44', '#16615f', '#23907f', '#45c4a0', '#9af0c8', '#e8fff4'];
const BLOOD = ['#14040a', '#3a0a14', '#6a101c', '#a01824', '#d42a30', '#ff5a50', '#ff9a8a', '#ffe6de'];
const SOULC = ['#2c3f66', '#7d9fd0', '#cfe6ff', '#ffffff'];
const PEARL = ['#5a4f8a', '#a99be0', '#e6defa', '#fffaf2'];

const COLD: Ramp = [
    ['#ffffff', 0],
    [VOID[6], 0.2],
    [VOID[5], 0.5],
    [VOID[3], 1],
];
const GHOST: Ramp = [
    ['#ffffff', 0],
    [NECRO[6], 0.25],
    [NECRO[5], 0.6],
    [NECRO[3], 1],
];

const BALL = lathe(ballProfile(10), 16);
const SPHERE = lathe(ballProfile(20), 40);
/** A capsule one unit long on y and one unit in radius, its ends rounded: a segment of a tube. */
const CAPSULE = lathe(
    [
        [0.001, -0.5],
        [0.55, -0.47],
        [0.85, -0.4],
        [1, -0.28],
        [1, 0.28],
        [0.85, 0.4],
        [0.55, 0.47],
        [0.001, 0.5],
    ],
    18
);
/** A skull as a lathe: a narrow jaw under a round cranium, about one unit tall. */
const SKULL = lathe(
    [
        // A wide jaw (about 0.6 of the cranium), as pixel skulls are drawn, so it never reads as a cap.
        [0.001, -0.62],
        [0.44, -0.6],
        [0.52, -0.42],
        [0.56, -0.24],
        [0.7, -0.1],
        [0.8, 0.15],
        [0.8, 0.42],
        [0.64, 0.66],
        [0.36, 0.8],
        [0.001, 0.82],
    ],
    20
);

const ease = (k: number) => k * k * (3 - 2 * k);
const outCubic = (k: number) => 1 - (1 - k) ** 3;
const inQuad = (k: number) => k * k;

/**
 * A flat ribbon along a polyline in the x-y plane, facing +z: U runs 0 to 1 along its length, so a
 * sweep erosion mask draws it on stroke by stroke. Each segment is its own quad.
 */
function ribbon(points: Array<[number, number]>, width: number): Geometry {
    const lengths = [0];
    for (let i = 1; i < points.length; i++) {
        lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    }
    const total = lengths[lengths.length - 1];
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[i + 1];
        const len = Math.hypot(x1 - x0, y1 - y0) || 1;
        // Lengthened a touch at each end so the joints overlap.
        const tx = ((x1 - x0) / len) * width * 0.5;
        const ty = ((y1 - y0) / len) * width * 0.5;
        const nx = -ty;
        const ny = tx;
        const u0 = lengths[i] / total;
        const u1 = lengths[i + 1] / total;
        const base = pos.length / 3;
        pos.push(x0 - tx + nx, y0 - ty + ny, 0, x0 - tx - nx, y0 - ty - ny, 0);
        pos.push(x1 + tx + nx, y1 + ty + ny, 0, x1 + tx - nx, y1 + ty - ny, 0);
        uv.push(u0, 1, u0, 0, u1, 1, u1, 0);
        idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    return {
        positions: new Float32Array(pos),
        normals: new Float32Array(pos.map((_, i) => (i % 3 === 2 ? 1 : 0))),
        uvs: new Float32Array(uv),
        indices: new Uint32Array(idx),
    };
}

/** The point a fraction `u` of the way along a polyline, by length. */
function along(points: Array<[number, number]>, u: number): [number, number] {
    const lengths = [0];
    for (let i = 1; i < points.length; i++) {
        lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    }
    const target = Math.min(1, Math.max(0, u)) * lengths[lengths.length - 1];
    for (let i = 1; i < points.length; i++) {
        if (lengths[i] >= target) {
            const k = (target - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1);
            return [
                points[i - 1][0] + (points[i][0] - points[i - 1][0]) * k,
                points[i - 1][1] + (points[i][1] - points[i - 1][1]) * k,
            ];
        }
    }
    return points[points.length - 1];
}

/**
 * A chain of lit balls, one per node: a tentacle, an arm, a finger. Move and scale the nodes each
 * frame; a node scaled to 0 hides its ball. With `tube`, each node is a capsule instead: pose the
 * nodes as points along the line, then call {@link tube} to join them into one smooth limb.
 */
export function chain(
    fx: FxBuilder,
    count: number,
    o: {
        color: string;
        rim: [number, number, number];
        time?: number;
        life: number;
        parent?: TransformNode;
        order?: number;
        loop?: boolean;
        tube?: boolean;
    }
): TransformNode[] {
    const nodes: TransformNode[] = [];
    for (let i = 0; i < count; i++) {
        const node = fx.node('seg', [0, 0, 0], o.parent);
        node.scaling.setAll(0);
        fx.sys({
            geo: o.tube ? CAPSULE : BALL,
            tex: 'white',
            blend: 'alpha',
            loop: o.loop ?? false,
            life: o.life,
            size: 1,
            burst: [[o.time ?? 0, 1]],
            color: o.color,
            parent: node,
            order: o.order ?? 3,
            look: {
                lighting: 'fixed',
                scalingMode: 'hierarchy',
                rim: {color: o.rim, power: 3, strength: 0.7, mode: 'add'},
            },
        });
        nodes.push(node);
    }
    return nodes;
}

/**
 * Joins a `tube` chain into one limb. The hook before it poses the chain as points: each node's
 * position a point on the line and its scale the radius there. This then stretches each capsule
 * from its point to the next and turns it along the gap, overlapping its neighbours so the joints
 * stay round, and caps the tip. Register it after the hook that poses the chain.
 */
export function tube(fx: FxBuilder, segs: TransformNode[]): void {
    const points = segs.map(() => new Vector3());
    const up = Vector3.Up();
    const dir = new Vector3();
    const axis = new Vector3();
    fx.every(() => {
        segs.forEach((seg, i) => points[i].copyFrom(seg.position));
        segs.forEach((seg, i) => {
            const r = seg.scaling.x;
            const here = points[i];
            const next = points[i + 1];
            let len: number;
            if (next) {
                next.subtractToRef(here, dir);
                len = dir.length();
                seg.position.copyFrom(here).addInPlace(next).scaleInPlace(0.5);
            } else {
                if (i > 0) here.subtractToRef(points[i - 1], dir);
                else dir.copyFrom(up);
                len = r;
            }
            if (dir.lengthSquared() < 1e-12) dir.copyFrom(up);
            dir.normalize();
            seg.rotationQuaternion ??= new Quaternion();
            // Turn +y onto the gap: about up × dir, by the angle between them.
            Vector3.CrossToRef(up, dir, axis);
            const sin = axis.length();
            if (sin < 1e-6) axis.set(1, 0, 0);
            Quaternion.RotationAxisToRef(axis.normalize(), Math.atan2(sin, dir.y), seg.rotationQuaternion);
            seg.scaling.set(r, len + r, r);
        });
    });
}

/**
 * A skull riding `parent`, `scale` metres to a unit, facing +z: bone with its face painted on, and
 * two eyes that can burn in the sockets.
 */
export function skull(
    fx: FxBuilder,
    parent: TransformNode,
    o: {
        scale: number;
        color: string;
        rim: [number, number, number];
        eye: string;
        time?: number;
        life: number;
        loop?: boolean;
        eyeAlpha?: Array<[number, number]>;
    }
): TransformNode {
    const loop = o.loop ?? false;
    const bone = fx.node('bone', [0, 0, 0], parent);
    bone.scaling.setAll(o.scale);
    // The face is at the lathe's +z; turned so it looks along the parent's +z.
    fx.sys({
        geo: SKULL,
        tex: 'skull',
        blend: 'alpha',
        loop,
        life: o.life,
        size: 1,
        burst: [[o.time ?? 0, 1]],
        color: o.color,
        parent: bone,
        order: 4,
        look: {
            lighting: 'fixed',
            scalingMode: 'hierarchy',
            rim: {color: o.rim, power: 2, strength: 1, mode: 'add'},
        },
    });
    for (const side of [-1, 1]) {
        const socket = fx.node('eye', [side * 0.24 * o.scale, 0.08 * o.scale, 0.85 * o.scale], parent);
        fx.sys({
            tex: 'glow',
            loop,
            life: o.life,
            size: 0.55 * o.scale,
            burst: [[o.time ?? 0, 1]],
            color: o.eye,
            parent: socket,
            order: 6,
            b: [tint([['#ffffff', 0]], o.eyeAlpha ?? [[1, 0]])],
        });
    }
    return bone;
}

/** An ink pool's outline: a radius near 1 that wanders round it. */
const INK_EDGE = (a: number) =>
    1 + 0.08 * Math.sin(3 * a + 1.9) + 0.06 * Math.sin(5 * a + 0.4) + 0.035 * Math.sin(8 * a + 3.1);

/** A dark pool on the floor that opens and closes, with a lit violet lip. */

function darkPool(fx: FxBuilder, o: {size: number; open: number; close: number; period: number; at?: At}) {
    const {open, close, period} = o;
    const keys: Array<[number, number]> = [
        [0, 0],
        [0, open / period],
        [1, (open + 0.25) / period],
        [1, close / period],
        [0, Math.min(1, (close + 0.3) / period)],
    ];
    const lip = fx.node('pool', o.at ?? [0, 0, 0]);
    fx.every((t) => {
        const k = ease(between(t, open, open + 0.3)) * (1 - ease(between(t, close, close + 0.3)));
        lip.scaling.setAll(Math.max(0.001, k));
    });
    // An ink puddle with a wandering edge: a low lens of void, a slow violet swirl over it, and a thin
    // glowing lip that follows the edge, not a perfect ring.
    const r = o.size * 0.42;
    const pool = {loop: false, life: period, size: 1, burst: [[0, 1]] as Array<[number, number]>, parent: lip};
    fx.sys({
        ...pool,
        geo: lens(INK_EDGE, 0.05, {sx: r, sz: r * 0.9, power: 0.3}),
        tex: 'white',
        blend: 'alpha',
        color: VOID[1],
        at: [0, 0.01, 0],
        order: 1,
        look: {scalingMode: 'hierarchy', rim: {color: [0.5, 0.25, 0.9], power: 3, strength: 1, mode: 'add'}},
        b: [tint([['#ffffff', 0]], keys)],
    });
    fx.sys({
        ...pool,
        geo: lens(INK_EDGE, 0.052, {sx: r * 0.97, sz: r * 0.87, power: 0.3}),
        image: 'noise',
        blend: 'add',
        color: VOID[3],
        alpha: 0.7,
        at: [0, 0.012, 0],
        order: 2,
        look: {scalingMode: 'hierarchy', mapUV: {tiling: [1.5, 1.5], scroll: [0.12, -0.18]}},
        b: [tint([['#ffffff', 0]], keys)],
    });
    fx.sys({
        ...pool,
        geo: outlineBand(INK_EDGE, 0.95, 1.02, {sx: r, sz: r * 0.9}),
        tex: 'white',
        blend: 'add',
        color: VOID[5],
        alpha: 0.75,
        at: [0, 0.014, 0],
        order: 3,
        look: {renderFace: 'both', scalingMode: 'hierarchy'},
        b: [tint([['#ffffff', 0]], keys)],
    });
    light(fx, {
        at: [0, 0.03, 0],
        size: o.size * 1.6,
        color: VOID[4],
        floor: true,
        life: close - open + 0.3,
        alpha: 0.45,
        time: open,
    });
}

/** Inky droplets thrown up out of a pool, falling back. */
export function splash(fx: FxBuilder, o: {at: At; time: number; count: number; radius?: number}) {
    return fx.sys({
        tex: 'dot',
        mode: RenderMode.StretchedBillBoard,
        stretch: {speed: 0.05, length: 1},
        loop: false,
        life: [0.5, 0.8],
        speed: [2.5, 4.5],
        size: [0.07, 0.12],
        burst: [[o.time, o.count]],
        color: [VOID[4], VOID[6]],
        shape: new ConeEmitter({radius: o.radius ?? 0.5, angle: 0.5, thickness: 1}),
        aim: 'up',
        at: o.at,
        world: true,
        order: 5,
        b: [tint([['#ffffff', 0]], popOut(0.6)), gravity(10)],
    });
}

export const shadow: FxDef[] = [
    {
        id: 'shadow/black-hole',
        name: 'Black hole',
        loop: true,
        period: 4,
        view: {height: 1.7},
        build(fx) {
            const hole = fx.node('hole', [0, 1.7, 0]);
            const tilt = fx.node('tilt', [0, 0, 0], hole);
            tilt.rotation.set(-0.12, 0, -0.18);
            // The disk: banded rings round the hole, turning. It is whole, and the opaque hole hides
            // whatever part of it is behind, so it reads right from every side.
            fx.sys({
                geo: lathe(
                    [
                        [0.85, 0],
                        [2.3, 0],
                    ],
                    72
                ),
                image: 'scanlines',
                blend: 'add',
                life: 1e4,
                size: 1,
                burst: [[0, 1]],
                color: VOID[5],
                alpha: 0.7,
                parent: tilt,
                order: 5,
                look: {renderFace: 'both', mapUV: {tiling: [2, 3], scroll: [0, -0.15]}},
            });
            fx.sys({
                geo: lathe(
                    [
                        [0.8, 0],
                        [2.0, 0],
                    ],
                    72
                ),
                image: 'whirl-band',
                blend: 'add',
                life: 1e4,
                size: 1,
                burst: [[0, 1]],
                color: VOID[6],
                alpha: 0.45,
                parent: tilt,
                order: 5,
                look: {renderFace: 'both', mapUV: {tiling: [6, 1], scroll: [0.35, 0]}},
            });
            // The photon ring: light bent round the hole, which faces the eye from any side, so it is
            // the one part drawn as a billboard. It hugs the hole's edge.
            fx.sys({
                tex: 'ring',
                life: 1e4,
                size: 1.9,
                burst: [[0, 1]],
                color: VOID[5],
                alpha: 0.75,
                parent: hole,
                order: 3,
            });
            fx.sys({
                tex: 'glow',
                life: 1e4,
                size: 4,
                burst: [[0, 1]],
                color: VOID[3],
                alpha: 0.35,
                parent: hole,
                order: 1,
            });
            // The hole itself: a black ball that swallows the light behind it.
            fx.sys({
                geo: SPHERE,
                tex: 'white',
                blend: 'alpha',
                life: 1e4,
                size: 0.7,
                burst: [[0, 1]],
                color: '#000000',
                parent: hole,
                order: 4,
                look: {rim: {color: [0.5, 0.3, 0.9], power: 4, strength: 1, mode: 'add'}},
            });
            // Debris spiralling in along the disk, stretched as it falls, swallowed at the edge.
            const plane = fx.node('plane', [0, 0, 0], tilt);
            plane.rotation.x = Math.PI / 2;
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.25, length: 1},
                life: [1.6, 2.2],
                speed: [-0.9, -0.6],
                size: [0.05, 0.09],
                rate: 18,
                color: [VOID[6], '#ffffff'],
                shape: new CircleEmitter({radius: 2.4, thickness: 0.2}),
                parent: plane,
                order: 7,
                b: [orbit(2.2, [0, 0, 1]), tint(COLD, popOut(0.8)), grow([0, 1], [0.8, 1], [1, 0])],
            });
            fx.sys({
                mesh: 'rock',
                life: [2, 2.6],
                speed: [-0.7, -0.5],
                size: [0.06, 0.12],
                rate: 3,
                tumble: 4,
                color: ['#2e2440', '#857399'],
                shape: new CircleEmitter({radius: 2.4, thickness: 0.1}),
                parent: plane,
                order: 5,
                b: [orbit(1.6, [0, 0, 1]), grow([0, 1], [0.85, 1], [1, 0])],
            });
            light(fx, {at: [0, 0.05, 0], size: 4, color: VOID[4], floor: true, life: 4, alpha: 0.3, loop: true});
        },
    },
    {
        id: 'shadow/curse',
        name: 'Curse',
        loop: false,
        period: 3.4,
        build(fx) {
            const P = 3.4;
            hero(fx, {period: P});
            // Wisps gather over the head.
            const gather = fx.sys({
                tex: 'smoke',
                life: 0.5,
                speed: -1.8,
                size: [0.2, 0.35],
                rot: true,
                color: [VOID[4], VOID[5]],
                shape: new SphereEmitter({radius: 0.9, thickness: 0.2}),
                at: [0, 2.5, 0],
                order: 4,
                b: [tint([['#ffffff', 0]], popOut(0.4)), grow([0, 1], [1, 0.3])],
            });
            window(gather, P, 0, 0.75, 24);
            // A skull stamps down onto the crown with a flash and a ring of dots.
            const head = fx.node('skull', [0, 3, 0]);
            head.rotation.x = -0.4;
            fx.every((t) => {
                const k = outCubic(between(t, 0.7, 0.85));
                const crack = between(t, 2.05, 2.15);
                head.position.y = 3.1 - 0.75 * k;
                bone.scaling.setAll(t < 0.7 || t > 2.15 ? 0.001 : 0.5 * (1 + Math.sin(crack * Math.PI) * 0.1));
            });
            const bone = skull(fx, head, {
                scale: 0.5,
                color: BONE[3],
                rim: [0.6, 0.4, 1],
                eye: VOID[5],
                time: 0.7,
                life: 1.45,
                eyeAlpha: [
                    [0, 0],
                    [0, 0.15],
                    [1, 0.25],
                    [1, 1],
                ],
            });
            star(fx, {at: [0, 2.35, 0.2], size: 2, life: 0.3, time: 0.85, tex: 'burst', ramp: COLD});
            fx.sys({
                tex: 'ring',
                loop: false,
                life: 0.6,
                size: 2.6,
                burst: [[0.85, 1]],
                color: VOID[5],
                at: [0, 2.35, 0],
                order: 6,
                b: [tint(COLD, popOut(0.3)), grow([0, 0.3], [0.4, 1], [1, 1.1])],
            });
            fx.sys({
                tex: 'dot',
                loop: false,
                life: 0.6,
                speed: 2,
                size: 0.1,
                burst: [[0.85, 16]],
                color: VOID[6],
                shape: new CircleEmitter({radius: 0.3, thickness: 0}),
                at: [0, 2.35, 0],
                order: 6,
                b: [tint(COLD, popOut(0.4)), airDrag(4)],
            });
            // Its eyes burn and the curse floods the body violet from the crown down.
            hero(fx, {
                period: P,
                blend: 'add',
                color: VOID[3],
                alpha: 0.45,
                lighting: 'unlit',
                order: 4,
                cut: [
                    [0, 0],
                    [0, 0.95 / P],
                    [1, 1.5 / P],
                    [1, 2.2 / P],
                    [0, 2.8 / P],
                ],
                edge: [1.2, 0.8, 2],
                edgeWidth: 0.08,
            });
            const seep = fx.sys({
                tex: 'smoke',
                life: [0.6, 0.9],
                speed: [0.3, 0.6],
                size: [0.25, 0.4],
                rot: true,
                color: [VOID[3], VOID[5]],
                shape: new ConeEmitter({radius: 0.35, angle: 0.2, thickness: 1}),
                aim: 'up',
                at: [0, 0.2, 0],
                alpha: 0.5,
                order: 5,
                b: [tint([['#ffffff', 0]], fadeOut(0.4, 0.2)), grow([0, 0.6], [1, 1.2]), wobble(1, 0.4)],
            });
            window(seep, P, 1.1, 2.3, 16);
            // Then the skull cracks and crumbles.
            clods(fx, {
                count: 14,
                color: [BONE[2], BONE[4]],
                mesh: 'shard',
                at: [0, 2.35, 0],
                shape: new SphereEmitter({radius: 0.2, thickness: 1}),
                speed: [0.5, 1.8],
                size: [0.05, 0.1],
                delay: 2.12,
            });
            fx.sys({
                tex: 'dot',
                loop: false,
                life: [0.5, 1],
                speed: [0.4, 1.2],
                size: [0.05, 0.08],
                burst: [[2.12, 24]],
                color: VOID[6],
                shape: new SphereEmitter({radius: 0.2, thickness: 1}),
                at: [0, 2.35, 0],
                order: 6,
                b: [tint(COLD, popOut(0.4)), gravity(2)],
            });
            light(fx, {at: [0, 0.05, 0], size: 3, color: VOID[4], floor: true, life: 1.6, alpha: 0.5, time: 0.9});
        },
    },
    {
        id: 'shadow/dark-explosion',
        name: 'Dark explosion',
        loop: false,
        period: 3.8,
        build(fx) {
            const P = 3.8;
            const at: At = [0, 1.4, 0];
            // Motes swirl into a pulsing core.
            const motes = fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.1, length: 1},
                life: 0.45,
                speed: -3.2,
                size: 0.07,
                color: [VOID[5], '#ffffff'],
                shape: new SphereEmitter({radius: 1.5, thickness: 0}),
                at,
                order: 6,
                b: [orbit(3, [0, 1, 0]), tint(COLD, popOut(0.9))],
            });
            window(motes, P, 0, 0.5, 60);
            const core = fx.node('core', at);
            fx.every((t) => {
                core.scaling.setAll(t < 0.55 ? 0.5 + t + Math.sin(t * 40) * 0.1 : 0.001);
            });
            window(held(fx, core, {size: 0.8, color: VOID[6]}), 3.8, 0, 0.55, 60);
            // A black star cuts across a violet-white flash.
            star(fx, {at, size: 6, life: 0.35, time: 0.55, tex: 'glow', ramp: COLD});
            fx.sys({
                tex: 'burst',
                blend: 'alpha',
                loop: false,
                life: 0.3,
                size: 4.2,
                burst: [[0.55, 1]],
                rot: 0.3,
                color: '#000000',
                at: [at[0], at[1], 0.3],
                order: 8,
                b: [tint([['#ffffff', 0]], popOut(0.4)), grow([0, 0.6], [1, 1.2])],
            });
            // A dome of light races out and a ring along the floor.
            fx.sys({
                tex: 'ring',
                loop: false,
                life: 0.5,
                size: 5,
                burst: [[0.6, 1]],
                color: VOID[6],
                at,
                order: 5,
                b: [tint(COLD, popOut(0.2)), grow([0, 0.3], [1, 1])],
            });
            shockwave(fx, {size: 6, color: VOID[5], life: 0.6, delay: 0.62});
            // A black sphere that burns at the rim, then collapses.
            const sphere = fx.node('sphere', at);
            fx.every((t) => {
                const k = outCubic(between(t, 0.55, 0.8)) * (1 - inQuad(between(t, 1.5, 1.75)));
                sphere.scaling.setAll(Math.max(0.001, k * (1 + Math.sin(t * 25) * 0.02)));
            });
            fx.sys({
                geo: SPHERE,
                tex: 'white',
                blend: 'alpha',
                loop: false,
                life: 1.25,
                size: 1.1,
                burst: [[0.55, 1]],
                color: '#000000',
                parent: sphere,
                order: 6,
                look: {scalingMode: 'hierarchy', rim: {color: [1.4, 0.8, 2.4], power: 2.5, strength: 1, mode: 'add'}},
            });
            fx.sys({
                tex: 'glow',
                loop: false,
                life: 1.25,
                size: 3.4,
                burst: [[0.55, 1]],
                color: VOID[4],
                alpha: 0.6,
                parent: sphere,
                order: 4,
                look: {scalingMode: 'hierarchy'},
                b: [tint([['#ffffff', 0]], flicker())],
            });
            // Lit shards and dark smoke thrown out.
            hotSparks(fx, {
                count: 30,
                time: 0.6,
                palette: COLD,
                at,
                shape: new SphereEmitter({radius: 0.5, thickness: 1}),
                speed: [4, 8],
                weight: 6,
            });
            clods(fx, {
                count: 12,
                color: [VOID[2], VOID[4]],
                mesh: 'shard',
                at,
                shape: new SphereEmitter({radius: 0.5, thickness: 1}),
                speed: [3, 6],
                delay: 0.6,
            });
            dust(fx, {
                at,
                size: [1.2, 1.8],
                life: [1.6, 2.4],
                burst: [[0.65, 14]],
                speed: [2, 4],
                shape: new SphereEmitter({radius: 0.6, thickness: 1}),
                color: [VOID[2], VOID[4]],
                alpha: 0.9,
                drag: 3,
                grows: 2,
                loop: false,
            });
            // The collapse: a last implosion flash.
            star(fx, {at, size: 2.4, life: 0.3, time: 1.72, tex: 'glint', ramp: COLD});
            light(fx, {at: [0, 0.05, 0], size: 6, color: VOID[5], floor: true, life: 1.4, alpha: 0.6, time: 0.55});
        },
    },
    {
        id: 'shadow/eclipse',
        name: 'Eclipse',
        loop: true,
        period: 4,
        view: {height: 1.8},
        build(fx) {
            const sky = fx.node('sky', [0, 1.8, 0]);
            fx.every((t) => {
                sky.scaling.setAll(1 + Math.sin((t / 4) * Math.PI * 2) * 0.05);
            });
            // A breathing pearl corona.
            fx.sys({
                tex: 'glow',
                life: 1e4,
                size: 3.6,
                burst: [[0, 1]],
                color: PEARL[1],
                alpha: 0.45,
                parent: sky,
                order: 1,
                look: {scalingMode: 'hierarchy'},
            });
            fx.sys({
                tex: 'glow',
                life: 1e4,
                size: 2.2,
                burst: [[0, 1]],
                color: PEARL[3],
                alpha: 0.7,
                parent: sky,
                order: 2,
                look: {scalingMode: 'hierarchy'},
            });
            // Long streamers, uneven, drifting round.
            for (let i = 0; i < 14; i++) {
                const len = 2.6 + ((i * 7) % 5) * 0.45;
                const ray = fx.sys({
                    tex: 'streak',
                    life: 1e4,
                    size: 1,
                    burst: [[0, 1]],
                    rot: (i / 14) * Math.PI + ((i * 3) % 4) * 0.05,
                    // Violet streamers, a white one now and then, as in the sprite.
                    color: i % 3 ? VOID[5] : PEARL[2],
                    alpha: 0.55,
                    parent: sky,
                    order: 3,
                    look: {scalingMode: 'hierarchy'},
                    b: [spin(0.05)],
                });
                ray.startSize = new Vector3Function(
                    new ConstantValue(len),
                    new ConstantValue(len * 0.07),
                    new ConstantValue(1)
                );
            }
            // The black moon with its thin white rim.
            fx.sys({
                geo: SPHERE,
                tex: 'white',
                blend: 'alpha',
                life: 1e4,
                size: 0.75,
                burst: [[0, 1]],
                color: '#000000',
                parent: sky,
                order: 5,
                look: {rim: {color: [1.6, 1.5, 1.7], power: 6, strength: 1, mode: 'add'}},
            });
            // One diamond bead blazing on its edge.
            const bead = fx.node('bead', [0.5, 0.5, 0.25], sky);
            fx.sys({
                tex: 'glint',
                life: 0.6,
                size: [1.4, 1.8],
                rate: 4,
                rot: [-0.1, 0.1],
                color: '#ffffff',
                parent: bead,
                order: 8,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            held(fx, bead, {size: 0.6, color: PEARL[3], order: 7});
            // Faint stars twinkling round it.
            fx.sys({
                tex: 'glint',
                life: [0.6, 1.2],
                size: [0.08, 0.16],
                rate: 8,
                color: PEARL[2],
                shape: new CircleEmitter({radius: 3, thickness: 0.6}),
                parent: sky,
                order: 0,
                b: [tint([['#ffffff', 0]], popOut(0.5))],
            });
        },
    },
    {
        id: 'shadow/grasping-hands',
        name: 'Grasping hands',
        loop: false,
        period: 3.1,
        build(fx) {
            const P = 3.1;
            darkPool(fx, {size: 3.6, open: 0.05, close: 2.55, period: P});
            splash(fx, {at: [0, 0.05, 0], time: 0.35, count: 24, radius: 1});
            const arms: Array<[number, number, number, number]> = [
                // x, z, lean, phase
                [-0.75, 0.2, -0.35, 0],
                [0.05, -0.15, 0.05, 1.3],
                [0.8, 0.25, 0.4, 2.4],
            ];
            const SEG = 22;
            arms.forEach(([x, z, lean, phase], a) => {
                const t0 = 0.3 + a * 0.08;
                const segs = chain(fx, SEG, {color: VOID[2], rim: [1.1, 0.6, 1.9], life: P, tube: true});
                const hand = fx.node('hand', [0, 0, 0]);
                const palm = chain(fx, 1, {color: VOID[2], rim: [1.1, 0.6, 1.9], life: P, parent: hand});
                palm[0].position.set(0, 0.05, 0);
                // Four claws and a thumb, each three joints that curl.
                const fingers: TransformNode[][] = [];
                const bases: TransformNode[] = [];
                for (let f = 0; f < 5; f++) {
                    const base = fx.node('finger', [0, 0, 0], hand);
                    const spread = f === 4 ? -1.1 : -0.45 + f * 0.3;
                    base.rotation.z = spread;
                    base.position.set(Math.sin(-spread) * 0.08, 0.1, f === 4 ? 0.05 : 0);
                    bases.push(base);
                    fingers.push(chain(fx, 3, {color: VOID[3], rim: [1.2, 0.7, 2], life: P, parent: base, tube: true}));
                }
                fx.every((t) => {
                    const up = outCubic(between(t, t0, t0 + 0.35));
                    const down = inQuad(between(t, 1.95 + a * 0.06, 2.45 + a * 0.06));
                    const h = 1.5 * up * (1 - down) + 0.001;
                    const strain = between(t, 0.9, 1.9) * (1 - down);
                    const shake = Math.sin(t * 38 + phase) * 0.02 * strain;
                    const bend = (s: number) => lean * s * s + Math.sin(t * 2.5 + phase + s * 2) * 0.12 * s + shake;
                    for (let i = 0; i < SEG; i++) {
                        const s = i / (SEG - 1);
                        segs[i].position.set(x + bend(s), s * h, z + Math.sin(phase + s * 1.5) * 0.08 * s);
                        segs[i].scaling.setAll(h > 0.05 ? 0.12 - s * 0.03 : 0.001);
                    }
                    hand.position.set(x + bend(1), h + 0.06, z);
                    hand.rotation.z = -lean * 0.8;
                    hand.scaling.setAll(h > 0.05 ? 1 : 0.001);
                    // Open as it rises, clenched into claws while it strains, clawing as it sinks.
                    const clench = ease(between(t, 0.75, 1.05)) * (1 - ease(between(t, 1.85, 2.05)));
                    const claw = clench + Math.max(0, Math.sin(t * 14 + phase)) * 0.4 * down;
                    fingers.forEach((joints, f) => {
                        let px = 0;
                        let py = 0;
                        let ang = 0;
                        joints.forEach((j, k) => {
                            ang += (0.15 + claw * 0.75) * (k === 0 ? 0.6 : 1) * (f === 4 ? -1 : 1);
                            const len = 0.13 - k * 0.02;
                            px += Math.sin(ang) * len * (f === 4 ? -1 : 1) * 0.6;
                            py += Math.cos(ang) * len;
                            j.position.set(0, py, px);
                            j.scaling.setAll(0.055 - k * 0.012);
                        });
                    });
                    palm[0].scaling.setAll(0.15);
                    bases.forEach((b) => b.scaling.setAll(1));
                });
                tube(fx, segs);
                fingers.forEach((joints) => tube(fx, joints));
            });
            // Violet smoke curling off the arms while they strain.
            const curl = fx.sys({
                tex: 'smoke',
                life: [0.6, 1],
                speed: [0.3, 0.6],
                size: [0.25, 0.4],
                rot: true,
                color: [VOID[3], VOID[5]],
                alpha: 0.4,
                shape: new ConeEmitter({radius: 1, angle: 0.3, thickness: 1}),
                aim: 'up',
                at: [0, 0.4, 0],
                order: 5,
                b: [tint([['#ffffff', 0]], fadeOut(0.4, 0.2)), grow([0, 0.6], [1, 1.3]), wobble(1, 0.4)],
            });
            window(curl, P, 0.6, 2.2, 10);
            splash(fx, {at: [0, 0.05, 0], time: 2.4, count: 16, radius: 0.9});
        },
    },
    {
        id: 'shadow/hex-sigil',
        name: 'Hex sigil',
        loop: false,
        period: 4.2,
        view: {height: 1.7},
        build(fx) {
            const P = 4.2;
            const board = fx.node('sigil', [0, 1.7, 0]);
            // The path the pen draws: a circle, then a seven-pointed star in one stroke.
            const R = 1.15;
            const path: Array<[number, number]> = [];
            for (let i = 0; i <= 64; i++) {
                const a = Math.PI / 2 - (i / 64) * Math.PI * 2;
                path.push([Math.cos(a) * R, Math.sin(a) * R]);
            }
            const tips: Array<[number, number]> = [];
            for (let k = 0; k <= 7; k++) {
                const a = Math.PI / 2 - ((k * 3) % 7) * ((Math.PI * 2) / 7);
                const p: [number, number] = [Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92];
                tips.push(p);
                path.push(p);
            }
            const DRAW0 = 0.25;
            const DRAW1 = 2.35;
            const END = 3.35;
            const life = END - DRAW0;
            const flip = {tiling: [-1, 1] as [number, number], offset: [1, 0] as [number, number]};
            const reveal: Array<[number, number]> = [
                [0, 0],
                [1, (DRAW1 - DRAW0) / life],
                [1, (3.05 - DRAW0) / life],
                [0, 1],
            ];
            const colors: Ramp = [
                [VOID[5], 0],
                [VOID[5], (2.65 - DRAW0) / life],
                ['#ffffff', (2.8 - DRAW0) / life],
                [VOID[6], (2.95 - DRAW0) / life],
            ];
            for (const [width, color, alpha, order] of [
                [0.22, VOID[4], 0.5, 3],
                [0.07, '#ffffff', 1, 4],
            ] as const) {
                fx.sys({
                    geo: ribbon(path, width),
                    tex: 'white',
                    blend: 'add',
                    loop: false,
                    life,
                    size: 1,
                    burst: [[DRAW0, 1]],
                    color,
                    alpha,
                    parent: board,
                    order,
                    look: {
                        renderFace: 'both',
                        erosion: {
                            mask: image(fx.scene, 'sweep').texture,
                            maskUV: flip,
                            softness: 0.01,
                            edgeWidth: 0.02,
                            edgeColor: [2, 1.6, 2.4],
                        },
                    },
                    b: [tint(colors, reveal)],
                });
            }
            // The burning pen, at the head of the stroke.
            const pen = fx.node('pen', [0, 0, 0], board);
            fx.every((t) => {
                const [x, y] = along(path, between(t, DRAW0, DRAW1));
                pen.position.set(x, y, 0.05);
                pen.scaling.setAll(t > DRAW0 && t < DRAW1 + 0.05 ? 1 : 0.001);
            });
            held(fx, pen, {tex: 'glint', size: 0.5, color: '#ffffff', order: 8});
            held(fx, pen, {size: 0.6, color: VOID[5], order: 7});
            const drips = fx.sys({
                tex: 'dot',
                world: true,
                life: [0.4, 0.7],
                speed: [0.2, 0.6],
                size: [0.04, 0.07],
                color: [VOID[6], '#ffffff'],
                shape: new SphereEmitter({radius: 0.05, thickness: 1}),
                parent: pen,
                order: 6,
                b: [tint(COLD, popOut(0.4)), gravity(3)],
            });
            window(drips, P, DRAW0, DRAW1, 40);
            // Glyphs pop in, one at each point of the star as the pen passes it.
            const circleShare = (2 * Math.PI * R) / (2 * Math.PI * R + 7 * 2 * R * 0.92 * Math.sin((3 * Math.PI) / 7));
            for (let k = 1; k <= 7; k++) {
                const when = DRAW0 + (DRAW1 - DRAW0) * (circleShare + ((1 - circleShare) * k) / 7);
                const [x, y] = tips[k];
                const out = 1.28;
                fx.sys({
                    tex: 'rune',
                    loop: false,
                    life: 3.1 - when,
                    size: 0.36,
                    burst: [[when, 1]],
                    color: VOID[6],
                    at: [x * out, y * out, 0],
                    parent: board,
                    order: 5,
                    b: [
                        tint(colors, [
                            [1, 0],
                            [1, 0.85],
                            [0, 1],
                        ]),
                        grow([0, 2], [0.06, 0.8], [0.12, 1]),
                    ],
                });
            }
            // It flares white and crumbles into falling embers.
            star(fx, {at: [0, 0, 0.1], size: 5, life: 0.35, time: 2.75, tex: 'glow', ramp: COLD, parent: board});
            fx.sys({
                tex: 'dot',
                world: true,
                loop: false,
                life: [0.8, 1.2],
                speed: [0.1, 0.5],
                size: [0.04, 0.08],
                burst: [[3.0, 140]],
                color: [VOID[5], VOID[6]],
                shape: new CircleEmitter({radius: R, thickness: 1}),
                parent: board,
                order: 6,
                b: [tint(COLD, popOut(0.5)), gravity(3), airDrag(1)],
            });
            light(fx, {at: [0, 0.05, 0], size: 4, color: VOID[4], floor: true, life: 3, alpha: 0.4, time: 0.3});
        },
    },
    {
        id: 'shadow/life-steal',
        name: 'Life steal',
        loop: false,
        period: 2.2,
        view: {distance: 12},
        build(fx) {
            const P = 2.2;
            const caster: At = [-1.8, 0, 0];
            const target: At = [1.8, 0, 0];
            hero(fx, {period: P, at: caster});
            hero(fx, {period: P, at: target, color: '#7a7088'});
            // The target is struck: a red flash on its chest.
            star(fx, {
                at: [target[0], 1.2, 0.4],
                size: 1.6,
                life: 0.25,
                time: 0.12,
                tex: 'burst',
                ramp: [
                    ['#ffffff', 0],
                    [BLOOD[6], 0.3],
                    [BLOOD[4], 1],
                ],
            });
            hero(fx, {
                period: P,
                at: target,
                blend: 'add',
                color: BLOOD[4],
                lighting: 'unlit',
                order: 4,
                fade: [
                    [0, 0],
                    [0, 0.12 / P],
                    [0.8, 0.16 / P],
                    [0, 0.5 / P],
                ],
            });
            // It bleeds red orbs that hang a moment, then whip home as comet streaks.
            const N = 6;
            for (let i = 0; i < N; i++) {
                const orb = fx.node('orb', [0, 0, 0]);
                const a = Math.PI * (0.25 + (i / (N - 1)) * 0.6);
                const hang: At = [target[0] + Math.cos(a) * 0.9 - 0.35, 1.2 + Math.sin(a) * 0.75, ((i % 3) - 1) * 0.35];
                const go = 0.75 + i * 0.05;
                const land = go + 0.42;
                fx.every((t) => {
                    const out = outCubic(between(t, 0.2, 0.45));
                    const home = inQuad(between(t, go, land));
                    const bob = Math.sin(t * 6 + i) * 0.04;
                    const sx = target[0] + (hang[0] - target[0]) * out;
                    const sy = 1.2 + (hang[1] - 1.2) * out + bob;
                    const sz = hang[2] * out;
                    orb.position.set(
                        sx + (caster[0] - sx) * home,
                        sy + (1.2 - sy) * home + Math.sin(home * Math.PI) * 0.6,
                        sz * (1 - home)
                    );
                    orb.scaling.setAll(t > 0.2 && t < land ? 1 : 0.001);
                });
                held(fx, orb, {size: 0.42, color: BLOOD[4], order: 6});
                held(fx, orb, {tex: 'dot', size: 0.14, color: BLOOD[7], order: 7});
                const tail = fx.sys({
                    tex: 'glow',
                    world: true,
                    life: 0.22,
                    size: 0.3,
                    color: BLOOD[5],
                    parent: orb,
                    order: 5,
                    b: [tint([['#ffffff', 0]], fadeOut(0.2, 0)), grow([0, 1], [1, 0.2])],
                });
                window(tail, P, go, land, 90);
            }
            // The caster floods crimson.
            hero(fx, {
                period: P,
                at: caster,
                blend: 'add',
                color: BLOOD[4],
                lighting: 'unlit',
                order: 4,
                fade: [
                    [0, 0],
                    [0, 1.05 / P],
                    [0.9, 1.3 / P],
                    [0.9, 1.5 / P],
                    [0, 2.1 / P],
                ],
            });
            const rise = fx.sys({
                tex: 'dot',
                life: [0.5, 0.8],
                speed: [0.8, 1.4],
                size: [0.05, 0.09],
                color: [BLOOD[5], BLOOD[6]],
                shape: new ConeEmitter({radius: 0.45, angle: 0.05, thickness: 1}),
                aim: 'up',
                at: [caster[0], 0.1, 0],
                order: 6,
                b: [tint([['#ffffff', 0]], popOut(0.5))],
            });
            window(rise, P, 1.15, 1.9, 30);
            light(fx, {
                at: [caster[0], 0.05, 0],
                size: 2.6,
                color: BLOOD[4],
                floor: true,
                life: 0.9,
                alpha: 0.5,
                time: 1.15,
            });
        },
    },
    {
        id: 'shadow/necro-skulls',
        name: 'Necro skulls',
        loop: true,
        period: 3,
        view: {height: 1.4, distance: 6},
        build(fx) {
            const flame: Ramp = [
                [NECRO[7], 0],
                [NECRO[6], 0.2],
                [NECRO[5], 0.45],
                [NECRO[3], 0.75],
                [NECRO[1], 1],
            ];
            // A cold green flame.
            fx.sys({
                image: 'flame-tongue-heat',
                blend: 'add',
                alpha: 0.8,
                look: {gradientMap: {ramp: rampTexture(fx.scene, flame)}, pivot: {x: 0, y: 0.45, z: 0}},
                rot: [-0.2, 0.2],
                life: [0.45, 0.7],
                speed: [0.3, 0.6],
                size: [0.9, 1.5],
                rate: 34,
                shape: new ConeEmitter({radius: 0.3, angle: 0.1, thickness: 1}),
                aim: 'up',
                at: [0, 0.6, 0],
                order: 3,
                b: [
                    lifeFrames(24),
                    tint([['#ffffff', 0]], fadeOut(0.45, 0.1)),
                    grow([0, 0.7], [0.3, 1], [1, 0.25]),
                    wobble(2, 0.6),
                ],
            });
            fx.sys({
                tex: 'glow',
                life: [0.3, 0.5],
                size: [1.6, 2],
                rate: 12,
                color: NECRO[5],
                alpha: 0.5,
                at: [0, 1.1, 0],
                order: 2,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            // A brazier for it to burn in.
            fx.sys({
                geo: lathe(
                    [
                        [0.001, 0],
                        [0.35, 0],
                        [0.5, 0.45],
                        [0.58, 0.6],
                        [0.5, 0.6],
                        [0.001, 0.55],
                    ],
                    20
                ),
                tex: 'white',
                blend: 'alpha',
                life: 1e4,
                size: 1,
                burst: [[0, 1]],
                color: NECRO[2],
                order: 3,
                look: {lighting: 'fixed', rim: {color: [0.2, 0.8, 0.6], power: 2, strength: 1, mode: 'add'}},
            });
            // Skulls circling it on a tilted orbit, passing behind and before it.
            const tilt = fx.node('tilt', [0, 1.5, 0]);
            tilt.rotation.set(0.25, 0, 0.2);
            const turn = fx.node('turn', [0, 0, 0], tilt);
            fx.every((t) => {
                turn.rotation.y = (t / 3) * Math.PI * 2;
            });
            // Six small skulls, as in the sprite: each about a quarter the flame's width.
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const head = fx.node('skull', [Math.cos(a) * 1.45, 0, Math.sin(a) * 1.45], turn);
                fx.every((t) => {
                    // Each faces the camera as it goes round.
                    head.rotation.y = -(t / 3) * Math.PI * 2;
                    head.rotation.x = -0.45;
                    head.position.y = Math.sin(t * 4 + i * 2) * 0.08;
                });
                skull(fx, head, {
                    scale: 0.2,
                    color: NECRO[5],
                    rim: [0.3, 1, 0.7],
                    eye: NECRO[6],
                    life: 1e4,
                    loop: true,
                });
                fx.sys({
                    tex: 'smoke',
                    world: true,
                    life: [0.6, 0.9],
                    size: [0.16, 0.26],
                    rot: true,
                    rate: 14,
                    color: [NECRO[4], NECRO[5]],
                    alpha: 0.35,
                    parent: head,
                    order: 2,
                    b: [tint(GHOST, fadeOut(0.3, 0.1)), grow([0, 0.6], [1, 1.4]), gravity(0.6, [0, 1, 0])],
                });
            }
            fx.sys({
                tex: 'dot',
                life: [0.6, 1],
                speed: [0.8, 1.4],
                size: [0.05, 0.08],
                rate: 12,
                color: [NECRO[5], NECRO[6]],
                shape: new ConeEmitter({radius: 0.35, angle: 0.15, thickness: 1}),
                aim: 'up',
                at: [0, 0.7, 0],
                order: 6,
                b: [tint(GHOST, popOut(0.5)), wobble(2, 0.6)],
            });
            light(fx, {at: [0, 0.05, 0], size: 4, color: NECRO[4], floor: true, life: 3, alpha: 0.5, loop: true});
        },
    },
    {
        id: 'shadow/shadow-flames',
        name: 'Shadow flames',
        loop: true,
        period: 2.4,
        build(fx) {
            // Inside-out fire: a black heart, violet flame, pale skin and tips. The heat map runs
            // white-hot at its heart, so a ramp that starts black turns it inside out.
            const inside: Ramp = [
                ['#05020a', 0],
                [VOID[1], 0.25],
                [VOID[4], 0.55],
                [VOID[6], 0.8],
                ['#f4ecff', 1],
            ];
            const glow: Ramp = [
                [VOID[6], 0],
                [VOID[5], 0.4],
                [VOID[3], 1],
            ];
            const base = {
                image: 'flame-tongue-heat' as const,
                rot: [-0.2, 0.2] as [number, number],
                shape: new ConeEmitter({radius: 0.35, angle: 0.12, thickness: 1}),
                aim: 'up' as const,
                at: [0, 0.05, 0] as At,
            };
            // A violet glow licking up behind.
            fx.sys({
                ...base,
                blend: 'add',
                alpha: 0.7,
                look: {gradientMap: {ramp: rampTexture(fx.scene, glow)}, pivot: {x: 0, y: 0.45, z: 0}},
                life: [0.5, 0.8],
                speed: [0.4, 0.7],
                size: [1.6, 2.4],
                rate: 26,
                order: 2,
                b: [
                    lifeFrames(24),
                    tint([['#ffffff', 0]], fadeOut(0.45, 0.1)),
                    grow([0, 0.7], [0.3, 1], [1, 0.3]),
                    wobble(2, 0.6),
                ],
            });
            // The dark tongues in front.
            fx.sys({
                ...base,
                blend: 'alpha',
                alpha: 1,
                look: {gradientMap: {ramp: rampTexture(fx.scene, inside)}, pivot: {x: 0, y: 0.45, z: 0}},
                life: [0.45, 0.7],
                speed: [0.3, 0.6],
                size: [1.1, 1.7],
                rate: 34,
                order: 4,
                b: [
                    lifeFrames(24),
                    tint([['#ffffff', 0]], fadeOut(0.5, 0.1)),
                    grow([0, 0.7], [0.3, 1], [1, 0.25]),
                    wobble(2, 0.6),
                ],
            });
            // Violet embers and dark smoke above.
            fx.sys({
                tex: 'dot',
                life: [0.7, 1.1],
                speed: [1, 1.8],
                size: [0.05, 0.09],
                rate: 14,
                color: [VOID[5], VOID[6]],
                shape: new ConeEmitter({radius: 0.35, angle: 0.2, thickness: 1}),
                aim: 'up',
                at: [0, 0.3, 0],
                order: 6,
                b: [tint(COLD, popOut(0.5)), wobble(2, 0.8)],
            });
            dust(fx, {
                at: [0, 1.5, 0],
                size: [0.5, 0.8],
                life: [1, 1.5],
                rate: 6,
                speed: [0.4, 0.7],
                shape: new ConeEmitter({radius: 0.25, angle: 0.2, thickness: 1}),
                aim: 'up',
                color: [VOID[0], VOID[2]],
                alpha: 0.6,
                lift: 0.6,
                loop: true,
            });
            light(fx, {at: [0, 0.05, 0], size: 3, color: VOID[4], floor: true, life: 2.4, alpha: 0.5, loop: true});
        },
    },
    {
        id: 'shadow/shadow-tendrils',
        name: 'Shadow tendrils',
        loop: false,
        period: 3.2,
        build(fx) {
            const P = 3.2;
            darkPool(fx, {size: 3.8, open: 0.05, close: 2.75, period: P});
            splash(fx, {at: [0, 0.05, 0], time: 0.32, count: 26, radius: 1.1});
            const SEG = 26;
            const roots: Array<[number, number, number]> = [
                [-0.9, 0.1, 0],
                [-0.35, -0.35, 1.7],
                [0.2, 0.3, 3.1],
                [0.75, -0.2, 4.4],
                [0.05, -0.6, 5.6],
            ];
            roots.forEach(([x, z, phase], r) => {
                const segs = chain(fx, SEG, {color: VOID[2], rim: [1.1, 0.6, 1.9], life: P, tube: true});
                const height = 1.6 + (r % 2) * 0.4;
                const t0 = 0.3 + r * 0.05;
                const dir = x < 0 ? -1 : 1;
                fx.every((t) => {
                    const up = outCubic(between(t, t0, t0 + 0.4));
                    const down = inQuad(between(t, 2.15 + r * 0.05, 2.75));
                    const h = height * up * (1 - down);
                    for (let i = 0; i < SEG; i++) {
                        const s = i / (SEG - 1);
                        // Writhing along its length, its tip hooked over.
                        const sway = Math.sin(t * 3.2 + phase - s * 3) * 0.3 * s;
                        const hook = s > 0.7 ? ((s - 0.7) / 0.3) ** 2 * 0.45 * dir : 0;
                        const y = s * h - (s > 0.7 ? ((s - 0.7) / 0.3) ** 2 * 0.2 * up : 0);
                        segs[i].position.set(
                            x + sway + hook + dir * s * 0.25,
                            y,
                            z + Math.cos(t * 2.4 + phase - s * 2.5) * 0.18 * s
                        );
                        segs[i].scaling.setAll(h > 0.05 ? 0.15 * (1 - s * 0.8) : 0.001);
                    }
                });
                tube(fx, segs);
            });
            const curl = fx.sys({
                tex: 'dot',
                life: [0.5, 0.8],
                speed: [0.6, 1.2],
                size: [0.05, 0.08],
                color: [VOID[5], VOID[6]],
                shape: new ConeEmitter({radius: 1.2, angle: 0.2, thickness: 1}),
                aim: 'up',
                at: [0, 0.1, 0],
                order: 6,
                b: [tint(COLD, popOut(0.5)), wobble(2, 0.6)],
            });
            window(curl, P, 0.4, 2.4, 20);
            splash(fx, {at: [0, 0.05, 0], time: 2.55, count: 18, radius: 1});
        },
    },
    {
        id: 'shadow/soul-drain',
        name: 'Soul drain',
        loop: true,
        period: 3.2,
        view: {distance: 12},
        build(fx) {
            const P = 3.2;
            const jar: At = [-1.7, 0.9, 0];
            // A black crystal vessel on the left.
            const vessel = fx.node('vessel', jar);
            fx.every((t) => {
                vessel.rotation.y = t * 0.6;
            });
            fx.sys({
                geo: gem(),
                tex: 'white',
                blend: 'alpha',
                life: 1e4,
                size: 1,
                burst: [[0, 1]],
                color: VOID[1],
                parent: vessel,
                order: 4,
                look: {lighting: 'fixed', rim: {color: [0.8, 0.4, 1.4], power: 1.6, strength: 1, mode: 'add'}},
            });
            vessel.scaling.set(0.9, 1.6, 0.9);
            // Souls torn loose on the right, dragged down a funnel of streaks into it.
            const funnel = fx.node('funnel', [2, 1.4, 0]);
            funnel.rotation.y = -Math.PI / 2;
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.12, length: 1},
                life: [0.8, 1],
                speed: [3.8, 4.4],
                size: [0.04, 0.07],
                rate: 30,
                color: [SOULC[1], SOULC[2]],
                shape: new ConeEmitter({radius: 0.6, angle: 0.04, thickness: 1}),
                parent: funnel,
                order: 5,
                b: [tint([['#ffffff', 0]], popOut(0.6)), gravity(1.2), grow([0, 1], [1, 0.4])],
            });
            const landings: number[] = [];
            for (let i = 0; i < 3; i++) {
                const t0 = (i * P) / 3;
                const t1 = t0 + 0.95;
                landings.push(t1);
                const soul = fx.node('soul', [0, 0, 0]);
                const from: At = [2.1, 1.1 + (i - 1) * 0.35, (i - 1) * 0.3];
                fx.every((t) => {
                    const local = (t - t0 + P) % P;
                    const k = local / 0.95;
                    const tear = Math.min(1, local / 0.2);
                    const m = inQuad(Math.min(1, k));
                    soul.position.set(
                        from[0] + (jar[0] - from[0]) * m,
                        from[1] + (jar[1] - from[1]) * m + Math.sin(m * Math.PI) * 0.35,
                        from[2] * (1 - m)
                    );
                    soul.scaling.setAll(k < 1 ? 0.5 + tear * 0.5 : 0.001);
                });
                held(fx, soul, {size: 0.55, color: SOULC[1], alpha: 0.8, order: 6});
                held(fx, soul, {tex: 'dot', size: 0.16, color: '#ffffff', order: 7});
                fx.sys({
                    tex: 'smoke',
                    world: true,
                    life: 0.4,
                    size: [0.2, 0.3],
                    rot: true,
                    rate: 40,
                    color: SOULC[1],
                    alpha: 0.5,
                    parent: soul,
                    order: 5,
                    b: [tint([['#ffffff', 0]], fadeOut(0.2, 0)), grow([0, 1], [1, 0.3])],
                });
            }
            // It flares violet as each one lands.
            for (const t1 of landings) {
                fx.sys({
                    tex: 'glow',
                    life: 0.5,
                    size: 2.4,
                    burst: [[t1 % P, 1]],
                    color: VOID[5],
                    at: jar,
                    order: 6,
                    b: [tint(COLD, popOut(0.15)), grow([0, 0.6], [0.3, 1], [1, 1.1])],
                });
                fx.sys({
                    tex: 'ring',
                    life: 0.45,
                    size: 2,
                    burst: [[t1 % P, 1]],
                    color: VOID[6],
                    at: jar,
                    order: 6,
                    b: [tint(COLD, popOut(0.2)), grow([0, 0.3], [1, 1])],
                });
            }
            fx.sys({
                tex: 'glow',
                life: 0.6,
                size: [1.1, 1.4],
                rate: 4,
                color: VOID[4],
                alpha: 0.4,
                at: jar,
                order: 2,
                b: [tint([['#ffffff', 0]], flicker())],
            });
            light(fx, {at: [jar[0], 0.05, 0], size: 3, color: VOID[4], floor: true, life: P, alpha: 0.4, loop: true});
        },
    },
    {
        id: 'shadow/void-orb',
        name: 'Void orb',
        loop: true,
        period: 3.2,
        view: {height: 1.6},
        build(fx) {
            const orb = fx.node('orb', [0, 1.6, 0]);
            fx.every((t) => {
                orb.position.y = 1.6 + Math.sin((t / 3.2) * Math.PI * 2) * 0.1;
            });
            // A dark vortex winding into it.
            fx.sys({
                geo: flatRing(0.55, 2, 64),
                image: 'whirl-band',
                blend: 'add',
                life: 1e4,
                size: 1,
                burst: [[0, 1]],
                color: VOID[4],
                alpha: 0.75,
                parent: orb,
                rotate: [Math.PI / 2, 0, 0],
                order: 2,
                look: {renderFace: 'both', mapUV: {tiling: [3, 1], scroll: [-0.3, 0.5]}},
            });
            fx.sys({
                tex: 'swirl',
                life: 1e4,
                size: 3.4,
                burst: [[0, 1]],
                color: VOID[2],
                blend: 'alpha',
                alpha: 0.8,
                parent: orb,
                order: 3,
                b: [spin(1.4)],
            });
            // Light bending round its edge.
            fx.sys({
                tex: 'ring',
                life: [0.8, 1.2],
                size: [2.2, 2.6],
                rate: 2,
                color: VOID[5],
                alpha: 0.35,
                parent: orb,
                order: 4,
                b: [tint([['#ffffff', 0]], popOut(0.5)), grow([0, 1.2], [1, 0.8])],
            });
            // The black orb with a pale rim crawling round it.
            fx.sys({
                geo: SPHERE,
                tex: 'white',
                blend: 'alpha',
                life: 1e4,
                size: 0.6,
                burst: [[0, 1]],
                color: '#000000',
                parent: orb,
                order: 5,
            });
            fx.sys({
                geo: flatRing(0.6, 0.66, 96),
                image: 'noise',
                blend: 'add',
                life: 1e4,
                size: 1,
                burst: [[0, 1]],
                color: VOID[6],
                alpha: 1,
                parent: orb,
                rotate: [Math.PI / 2, 0, 0],
                order: 6,
                look: {renderFace: 'both', mapUV: {tiling: [4, 1], scroll: [0.5, 0]}},
            });
            const crawl = fx.node('crawl', [0, 0, 0], orb);
            fx.every((t) => {
                crawl.rotation.z = -t * 2.2;
            });
            const rider = fx.node('rider', [0.63, 0, 0.05], crawl);
            held(fx, rider, {tex: 'glint', size: 0.4, color: '#ffffff', order: 8});
            // Motes and streaks pulled in.
            fx.sys({
                tex: 'dot',
                mode: RenderMode.StretchedBillBoard,
                stretch: {speed: 0.18, length: 1},
                life: [0.9, 1.2],
                speed: [-1.8, -1.4],
                size: [0.04, 0.08],
                rate: 26,
                color: [VOID[5], VOID[6]],
                shape: new CircleEmitter({radius: 2.2, thickness: 0.2}),
                parent: orb,
                order: 7,
                b: [orbit(2.4, [0, 0, 1]), tint(COLD, popOut(0.8)), grow([0, 1], [0.85, 1], [1, 0])],
            });
            light(fx, {at: [0, 0.05, 0], size: 3.6, color: VOID[4], floor: true, life: 3.2, alpha: 0.35, loop: true});
        },
    },
];
