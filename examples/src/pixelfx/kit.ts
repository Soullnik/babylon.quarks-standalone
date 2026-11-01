import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {Constants} from '@babylonjs/core/Engines/constants';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import type {Mesh} from '@babylonjs/core/Meshes/mesh';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Scene} from '@babylonjs/core/scene';
import type {Behavior, ValueGenerator} from 'babylon.quarks';
import {
    ApplyForce,
    AxisAngleGenerator,
    Bezier,
    ColorOverLife,
    ConstantColor,
    ConstantValue,
    EmitSubParticleSystem,
    type EmitterShape,
    FrameOverLife,
    Gradient,
    IntervalValue,
    Noise,
    OrbitOverLife,
    ParticleSystem,
    PiecewiseBezier,
    PointEmitter,
    RandomColor,
    RandomQuatGenerator,
    RenderMode,
    Rotation3DOverLife,
    RotationOverLife,
    SizeOverLife,
    SpeedOverLife,
    SubParticleEmitMode,
} from 'babylon.quarks';
import {sheet, type TextureName} from './textures';

/** A number, a `[min, max]` range rolled per particle, or any quarks value generator. */
export type Num = number | [number, number] | ValueGenerator;
/** A colour as `#rrggbb`, with an optional alpha. */
export type Hex = string;
/** A start colour: one hex, or `[a, b]` to pick at random between two. */
export type Col = Hex | [Hex, Hex];

/** `#rrggbb` to a Color3. */
export function c3(hex: Hex): Color3 {
    return Color3.FromHexString(hex.slice(0, 7));
}

/** `#rrggbb` (and an alpha) to a Color4. */
export function c4(hex: Hex, alpha = 1): Color4 {
    const c = c3(hex);
    return new Color4(c.r, c.g, c.b, alpha);
}

export function num(value: Num): ValueGenerator {
    if (typeof value === 'number') return new ConstantValue(value);
    if (Array.isArray(value)) return new IntervalValue(value[0], value[1]);
    return value;
}

/**
 * A curve through `[t, value]` keys with straight segments between them, as a PiecewiseBezier:
 * `curve([0, 0], [0.2, 1], [1, 0])` rises fast and falls slowly.
 */
export function curve(...keys: Array<[number, number]>): PiecewiseBezier {
    if (keys.length === 1)
        keys = [
            [0, keys[0][1]],
            [1, keys[0][1]],
        ];
    const segments: Array<[Bezier, number]> = [];
    for (let i = 0; i < keys.length - 1; i++) {
        const [t0, a] = keys[i];
        const b = keys[i + 1][1];
        segments.push([new Bezier(a, a + (b - a) / 3, a + ((b - a) * 2) / 3, b), t0]);
    }
    return new PiecewiseBezier(segments);
}

// ---- behaviours, named for what they do to the look ----

/**
 * Colour over life through `colors` keys `[hex, t]`, and alpha through `alphas` keys `[alpha, t]`
 * (by default: in fast, hold, out at the end). Multiplies the start colour.
 */
export function tint(colors: Array<[Hex, number]>, alphas: Array<[number, number]> = fadeOut()): ColorOverLife {
    const colorKeys = colors.length === 1 ? [colors[0], [colors[0][0], 1] as [Hex, number]] : colors;
    return new ColorOverLife(
        new Gradient(
            colorKeys.map(([h, t]) => [c3(h), t]),
            alphas
        )
    );
}

/** Alpha keys: fade in over `fadeIn` of the life, hold, fade out from `from`. */
export function fadeOut(from = 0.6, fadeIn = 0.06): Array<[number, number]> {
    return [
        [0, 0],
        [1, fadeIn],
        [1, from],
        [0, 1],
    ];
}

/** Alpha keys: fully on at birth, fading out from `from`. */
export function popOut(from = 0.3): Array<[number, number]> {
    return [
        [1, 0],
        [1, from],
        [0, 1],
    ];
}

/** Alpha keys for a light that flickers: on, dips, on, out. */
export function flicker(): Array<[number, number]> {
    return [
        [0, 0],
        [1, 0.05],
        [0.4, 0.2],
        [1, 0.35],
        [0.5, 0.55],
        [0.9, 0.7],
        [0, 1],
    ];
}

/** Size over life through `[t, scale]` keys. */
export function grow(...keys: Array<[number, number]>): SizeOverLife {
    return new SizeOverLife(curve(...keys));
}

/** A constant pull: gravity down by default. */
export function gravity(strength: Num, direction: [number, number, number] = [0, -1, 0]): ApplyForce {
    return new ApplyForce(new BVector3(...direction), num(strength));
}

/** Speed multiplier over life through `[t, factor]` keys: drag, surges and stops. */
export function drag(...keys: Array<[number, number]>): SpeedOverLife {
    return new SpeedOverLife(curve(...keys));
}

/** Curl-like noise on the position. */
export function wobble(frequency: Num, power: Num): Noise {
    return new Noise(num(frequency), num(power));
}

/** Spin in radians per second. */
export function spin(speed: Num): RotationOverLife {
    return new RotationOverLife(num(speed));
}

/** Orbit about the emitter's local axis, radians per second. */
export function orbit(speed: Num, axis: [number, number, number] = [0, 1, 0]): OrbitOverLife {
    return new OrbitOverLife(num(speed), new BVector3(...axis));
}

/** Flip through the texture's tiles `frames` times a second, starting on a random one. */
export function frames(fps: number, count: number): FrameOverLife {
    return new FrameOverLife(new ConstantValue(0), {fps, frameCount: count, random: true});
}

// ---- systems ----

export type Blend = 'add' | 'alpha';
export type Aim = 'up' | 'down' | 'right' | 'left' | 'front' | 'back';

export interface SysOptions {
    /** Texture by name; `glow` by default. */
    tex?: TextureName;
    /** Pick a random tile of a sheet texture at birth (true by default for sheets). */
    randomTile?: boolean;
    life: Num;
    speed?: Num;
    size: Num;
    /** Start rotation; `true` rolls a random one. */
    rot?: Num | true;
    color?: Col;
    alpha?: number;
    /** Particles per second. */
    rate?: Num;
    /** Particles per metre the emitter travels. */
    rateOverDistance?: Num;
    /** Bursts: a count at time 0, or `[time, count]` pairs, with an optional `cycles, interval`. */
    burst?: number | Array<[number, Num] | [number, Num, number, number]>;
    shape?: EmitterShape;
    /** System duration; the stage's period by default. */
    duration?: number;
    /** Overrides whether the system loops; the effect's own setting by default. */
    loop?: boolean;
    delay?: Num;
    blend?: Blend;
    mode?: RenderMode;
    /** Trail length in samples, for `RenderMode.Trail`. */
    trail?: number;
    /** Stretched billboard factors. */
    stretch?: {speed?: number; length?: number};
    /** Simulate in world space, so particles stay behind a moving emitter. */
    world?: boolean;
    order?: number;
    /** Local position of the emitter. */
    at?: [number, number, number];
    /** Which way the emitter's +z (a cone's axis, a circle's normal) points. */
    aim?: Aim;
    /** Extra emitter rotation in radians, applied after `aim`. */
    rotate?: [number, number, number];
    /** Parent node; the effect's root by default. */
    parent?: TransformNode;
    /** Behaviours, in order. */
    b?: Behavior[];
    /** Soft particles fading where they meet the floor. */
    soft?: boolean;
    /** Render each particle as a small lit, opaque mesh instead of a sprite. */
    mesh?: MeshKind;
    /** Mesh particles tumble at up to this many radians per second. */
    tumble?: number;
    /** Mesh particles stand upright (their +y up) instead of starting at a random angle. */
    upright?: boolean;
    /** Draw each particle as a beam from itself to this node (Unity's Line Renderer, Niagara's Beam). */
    beam?: TransformNode;
}

/** Low-poly shapes for mesh particles: rocks and clods, ice shards, cubes, planks. */
export type MeshKind = 'rock' | 'shard' | 'cube' | 'plank';

interface Geometry {
    positions: Float32Array;
    normals: Float32Array;
    uvs: Float32Array;
    indices: Uint32Array;
}

const geometries = new WeakMap<Scene, Map<MeshKind, Geometry>>();

function geometry(scene: Scene, kind: MeshKind): Geometry {
    let map = geometries.get(scene);
    if (!map) {
        map = new Map();
        geometries.set(scene, map);
    }
    const found = map.get(kind);
    if (found) return found;
    let mesh: Mesh;
    switch (kind) {
        case 'rock':
            mesh = MeshBuilder.CreateIcoSphere('pixelfx-geo-rock', {radius: 0.5, subdivisions: 1, flat: true}, scene);
            mesh.scaling.set(1, 0.75, 0.9);
            break;
        case 'shard':
            mesh = MeshBuilder.CreateCylinder(
                'pixelfx-geo-shard',
                {height: 1, diameterTop: 0, diameterBottom: 0.45, tessellation: 5},
                scene
            );
            break;
        case 'plank':
            mesh = MeshBuilder.CreateBox('pixelfx-geo-plank', {width: 1, height: 0.2, depth: 0.35}, scene);
            break;
        default:
            mesh = MeshBuilder.CreateBox('pixelfx-geo-cube', {size: 0.7}, scene);
    }
    mesh.bakeCurrentTransformIntoVertices();
    const result: Geometry = {
        positions: new Float32Array(mesh.getVerticesData(VertexBuffer.PositionKind) ?? []),
        normals: new Float32Array(mesh.getVerticesData(VertexBuffer.NormalKind) ?? []),
        uvs: new Float32Array(mesh.getVerticesData(VertexBuffer.UVKind) ?? []),
        indices: new Uint32Array(mesh.getIndices() ?? []),
    };
    mesh.dispose();
    map.set(kind, result);
    return result;
}

const AIMS: Record<Aim, [number, number, number]> = {
    up: [-Math.PI / 2, 0, 0],
    down: [Math.PI / 2, 0, 0],
    right: [0, Math.PI / 2, 0],
    left: [0, -Math.PI / 2, 0],
    front: [0, 0, 0],
    back: [0, Math.PI, 0],
};

const BLENDS: Record<Blend, number> = {
    add: Constants.ALPHA_ADD,
    alpha: Constants.ALPHA_COMBINE,
};

/** Builds one quarks ParticleSystem from the short options above. */
export function makeSystem(scene: Scene, o: SysOptions, defaults: {loop: boolean; duration: number}): ParticleSystem {
    const tex = sheet(scene, o.mesh ? 'white' : (o.tex ?? (o.beam ? 'bolt' : 'glow')));
    const geo = o.mesh ? geometry(scene, o.mesh) : undefined;
    const tiles = tex.u * tex.v;
    const color = o.color ?? '#ffffff';
    const alpha = o.alpha ?? 1;
    const startColor = Array.isArray(color)
        ? new RandomColor(c4(color[0], alpha), c4(color[1], alpha))
        : new ConstantColor(c4(color, alpha));
    const bursts =
        o.burst === undefined
            ? []
            : typeof o.burst === 'number'
              ? [{time: 0, count: new ConstantValue(o.burst), cycle: 1, interval: 0, probability: 1}]
              : o.burst.map(([time, count, cycle = 1, interval = 0]) => ({
                    time,
                    count: num(count),
                    cycle,
                    interval,
                    probability: 1,
                }));
    const mode = geo ? RenderMode.Mesh : o.beam ? RenderMode.Beam : (o.mode ?? RenderMode.BillBoard);
    const rendererEmitterSettings =
        mode === RenderMode.Trail
            ? {startLength: new ConstantValue(o.trail ?? 20), followLocalOrigin: false}
            : mode === RenderMode.StretchedBillBoard
              ? {speedFactor: o.stretch?.speed ?? 0.12, lengthFactor: o.stretch?.length ?? 1}
              : undefined;
    const system = new ParticleSystem({
        scene,
        duration: o.duration ?? defaults.duration,
        looping: o.loop ?? defaults.loop,
        startDelay: o.delay === undefined ? undefined : num(o.delay),
        startLife: num(o.life),
        startSpeed: num(o.speed ?? 0),
        startSize: num(o.size),
        startRotation: geo
            ? o.upright
                ? new AxisAngleGenerator(new BVector3(0, 1, 0), new IntervalValue(0, Math.PI * 2))
                : new RandomQuatGenerator()
            : o.rot === true
              ? new IntervalValue(-Math.PI, Math.PI)
              : o.rot === undefined
                ? undefined
                : num(o.rot),
        startColor,
        emissionOverTime: num(o.rate ?? 0),
        emissionOverDistance: o.rateOverDistance === undefined ? undefined : num(o.rateOverDistance),
        emissionBursts: bursts,
        shape: o.shape ?? new PointEmitter(),
        texture: tex.texture,
        uTileCount: tex.u,
        vTileCount: tex.v,
        startTileIndex:
            tiles > 1 && o.randomTile !== false ? new IntervalValue(0, tiles - 0.001) : new ConstantValue(0),
        blendMode: geo ? Constants.ALPHA_DISABLE : BLENDS[o.blend ?? 'add'],
        transparent: !geo,
        depthWrite: geo ? true : undefined,
        instancingGeometry: geo?.positions,
        instancingNormals: geo?.normals,
        instancingUVs: geo?.uvs,
        instancingIndices: geo?.indices,
        renderMode: mode,
        rendererEmitterSettings,
        worldSpace: o.world ?? false,
        renderOrder: o.order ?? 0,
        softParticles: o.soft,
        softNearFade: o.soft ? 0 : undefined,
        softFarFade: o.soft ? 0.8 : undefined,
    });
    if (geo && o.tumble) {
        system.addBehavior(
            new Rotation3DOverLife(
                new AxisAngleGenerator(new BVector3(1, 0.6, 0.3).normalize(), new IntervalValue(-o.tumble, o.tumble))
            )
        );
    }
    for (const behavior of o.b ?? []) system.addBehavior(behavior);
    if (o.beam) system.beamEnd = o.beam;
    const emitter = system.emitter;
    if (o.parent) emitter.parent = o.parent;
    if (o.at) emitter.position.set(...o.at);
    const [rx, ry, rz] = o.aim ? AIMS[o.aim] : [0, 0, 0];
    const [ex, ey, ez] = o.rotate ?? [0, 0, 0];
    emitter.rotation.set(rx + ex, ry + ey, rz + ez);
    return system;
}

/** Makes `child` spawn from `parent`'s particles: on death (default), birth, or every frame. */
export function subEmit(
    parent: ParticleSystem,
    child: ParticleSystem,
    mode: 'death' | 'birth' | 'frame' = 'death',
    probability = 1
): void {
    const m =
        mode === 'death'
            ? SubParticleEmitMode.Death
            : mode === 'birth'
              ? SubParticleEmitMode.Birth
              : SubParticleEmitMode.Frame;
    parent.addBehavior(new EmitSubParticleSystem(parent, true, child.emitter, m, probability));
}
