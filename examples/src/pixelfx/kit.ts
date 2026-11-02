import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {Constants} from '@babylonjs/core/Engines/constants';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import type {Mesh} from '@babylonjs/core/Meshes/mesh';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Scene} from '@babylonjs/core/scene';
import type {Behavior, ParticleSystemParameters, TrailSettings, ValueGenerator} from 'babylon.quarks';
import {
    ApplyCollision,
    ApplyForce,
    AxisAngleGenerator,
    Bezier,
    ColorOverLife,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    EmitSubParticleSystem,
    type EmitterShape,
    FrameOverLife,
    Gradient,
    IntervalValue,
    LimitSpeedOverLife,
    Noise,
    OrbitOverLife,
    ParticleEmitter,
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
import {image, type ImageName, sheet, type TextureName, type TextureSheet} from './textures';

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

/**
 * Air resistance: the velocity, forces included, loses `perSecond` of itself each second (as
 * `v -= v * k * dt`), so a falling particle settles at `gravity / perSecond`. Unlike {@link drag},
 * which scales the whole motion, it lets gravity take over once the throw has died.
 */
export function airDrag(perSecond: number): LimitSpeedOverLife {
    return new LimitSpeedOverLife(new ConstantValue(0), 3 * (1 - Math.exp(-perSecond / 60)));
}

/**
 * Bounce off the floor (y = `floor` in the system's space, so use it on world-space systems):
 * each hit keeps `bounce` of the speed, so chunks hop, skid and settle.
 */
export function floorBounce(bounce = 0.4, floor = 0.03): ApplyCollision {
    return new ApplyCollision(
        {
            resolve(position, normal) {
                if (position.y >= floor) return false;
                position.y = floor;
                normal.x = 0;
                normal.y = 1;
                normal.z = 0;
                return true;
            },
        },
        bounce
    );
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

/**
 * Turn a mesh particle about its own `axis` (up by default), radians per second: a ring or band
 * that spins in place. Use `upright` for a random start angle about y.
 */
export function turn(speed: Num, axis: [number, number, number] = [0, 1, 0]): Rotation3DOverLife {
    return new Rotation3DOverLife(new AxisAngleGenerator(new BVector3(...axis).normalize(), num(speed)));
}

/** Flip through the texture's tiles `frames` times a second, starting on a random one. */
export function frames(fps: number, count: number): FrameOverLife {
    return new FrameOverLife(new ConstantValue(0), {fps, frameCount: count, random: true});
}

/** Play a sheet's `count` tiles in order at `fps`, from the first, looping: a flipbook. */
export function flipbook(fps: number, count: number): FrameOverLife {
    return new FrameOverLife(new ConstantValue(0), {fps, frameCount: count});
}

/**
 * Play a sheet's `count` tiles once over each particle's life: a puff that billows and fades. A
 * `power` above 1 lingers on the early tiles, so a flame puff stays hot longer before it cools.
 */
export function lifeFrames(count: number, power = 1): FrameOverLife {
    const last = count - 0.01;
    if (power === 1) return new FrameOverLife(curve([0, 0], [1, last]));
    const keys: Array<[number, number]> = [];
    for (let i = 0; i <= 8; i++) keys.push([i / 8, last * Math.pow(i / 8, power)]);
    return new FrameOverLife(curve(...keys));
}

/** Hold one tile of a sheet for the whole life: a puff frozen at its fullest, for long-lived smoke. */
export function holdFrame(index: number): FrameOverLife {
    return new FrameOverLife(new ConstantValue(index));
}

// ---- systems ----

export type Blend = 'add' | 'alpha';
export type Aim = 'up' | 'down' | 'right' | 'left' | 'front' | 'back';

export interface SysOptions {
    /** Texture by name; `glow` by default. */
    tex?: TextureName;
    /** A loaded image texture instead of a painted one: a flipbook or a mesh's map. */
    image?: ImageName;
    /** Any other texture sheet, such as a {@link label}: wins over `tex` and `image`. */
    sheet?: TextureSheet;
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
    /**
     * More trail settings, passed through: `sideAxis` and `followLocalOrigin` for a weapon trail
     * swept along a blade, `tessellation`, `uvFromHead`, `colorFromParticle` and the like.
     */
    trailOpts?: Partial<Omit<TrailSettings, 'startLength'>>;
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
    /**
     * Draw a `geo` mesh in the opaque pass, writing depth, so it hides what is behind it pixel by
     * pixel instead of sorting as one see-through mesh. Alpha below 1% still cuts it (an erosion
     * mask still eats it), but alpha no longer fades it. By default a `geo` mesh blended `alpha`
     * at full alpha that no behaviour fades is drawn opaque.
     */
    opaque?: boolean;
    /**
     * Whether a see-through system writes depth. By default a `geo` mesh blended `alpha` at full
     * alpha does, so particles drawn after it are hidden behind it, while its clear texels (alpha
     * below 1%, discarded) let them through: a funnel of flame strands hides the embers circling
     * behind it.
     */
    depthWrite?: boolean;
    /** Render each particle as a small lit, opaque mesh instead of a sprite. */
    mesh?: MeshKind;
    /** Mesh particles tumble at up to this many radians per second. */
    tumble?: number;
    /** Mesh particles stand upright (their +y up) instead of starting at a random angle. */
    upright?: boolean;
    /** Draw each particle as a beam from itself to this node (Unity's Line Renderer, Niagara's Beam). */
    beam?: TransformNode;
    /**
     * Render each particle as this mesh, in the emitter's space, textured and blended like a sprite
     * (unlike `mesh`, which is opaque and lit): a funnel, a dome, a decal laid on a surface.
     */
    geo?: Geometry;
    /** The renderer's texture and mesh options, passed through as they are. */
    look?: Pick<
        ParticleSystemParameters,
        | 'mapUV'
        | 'uvDistortion'
        | 'erosion'
        | 'gradientMap'
        | 'rim'
        | 'lighting'
        | 'renderFace'
        | 'pivot'
        | 'scalingMode'
    >;
}

/** Low-poly shapes for mesh particles: rocks and clods, ice shards, cubes, planks. */
export type MeshKind = 'rock' | 'shard' | 'cube' | 'plank';

/** A mesh's vertex data, for mesh particles. */
export interface Geometry {
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

/**
 * A surface of revolution about +y: `profile` gives `[radius, height]` from the bottom up, and the
 * mesh goes once round in `segments`. U runs round it (0 to 1, the seam doubled so a map wraps
 * cleanly), V up it by the profile's index. Normals point outward. `arc` and `start` (radians, from +x
 * toward +z) sweep only part of the way round, for a half dome or an open shell.
 */
export function lathe(profile: Array<[number, number]>, segments = 48, arc = Math.PI * 2, start = 0): Geometry {
    const rows = profile.length;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let j = 0; j < rows; j++) {
        const [r, y] = profile[j];
        const [r0, y0] = profile[Math.max(0, j - 1)];
        const [r1, y1] = profile[Math.min(rows - 1, j + 1)];
        // The profile's outward normal in the (radius, height) plane.
        let nr = y1 - y0;
        let ny = -(r1 - r0);
        const len = Math.hypot(nr, ny) || 1;
        nr /= len;
        ny /= len;
        for (let i = 0; i <= segments; i++) {
            const a = start + (i / segments) * arc;
            const c = Math.cos(a);
            const s = Math.sin(a);
            positions.push(r * c, y, r * s);
            normals.push(nr * c, ny, nr * s);
            uvs.push(i / segments, j / (rows - 1));
        }
    }
    const ring = segments + 1;
    for (let j = 0; j < rows - 1; j++) {
        for (let i = 0; i < segments; i++) {
            const a = j * ring + i;
            const b = a + ring;
            indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
    }
    return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        uvs: new Float32Array(uvs),
        indices: new Uint32Array(indices),
    };
}

/** A hemisphere of radius 1 standing on y = 0, as a lathe profile. */
export function domeProfile(rows = 16): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let i = 0; i <= rows; i++) {
        const a = (i / rows) * (Math.PI / 2);
        out.push([Math.max(0.001, Math.cos(a)), Math.sin(a)]);
    }
    return out;
}

/**
 * A pool or mound lying on y = 0: a lens `height` tall in the middle whose outline wanders as
 * `edge(angle)` (a radius near 1, angle from +x toward +z), stretched `sx` along x and `sz` along z.
 * `power` shapes its crown: 0.5 a round lens, lower a flatter top with a steeper lip. UVs lie flat,
 * x and z across 0 to 1, so a map or decal sits on it from above.
 */
export function lens(
    edge: (angle: number) => number,
    height: number,
    o: {sx?: number; sz?: number; power?: number; rings?: number; segments?: number} = {}
): Geometry {
    const {sx = 1, sz = 1, power = 0.4, rings = 10, segments = 64} = o;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let reach = 0;
    for (let i = 0; i < segments; i++) reach = Math.max(reach, edge((i / segments) * Math.PI * 2));
    for (let j = 0; j <= rings; j++) {
        const s = j / rings;
        const lift = height * Math.pow(Math.max(0, 1 - s * s), power);
        // The slope outward, d(height)/d(s), clamped where the lip turns vertical.
        const slope = (height * power * 2 * Math.min(s, 0.97)) / Math.pow(1 - Math.min(s, 0.97) ** 2, 1 - power);
        for (let i = 0; i <= segments; i++) {
            const a = (i / segments) * Math.PI * 2;
            const r = edge(a);
            const x = Math.cos(a) * r * s * sx;
            const z = Math.sin(a) * r * s * sz;
            positions.push(x, lift, z);
            const nx = (Math.cos(a) * slope) / (r * sx);
            const nz = (Math.sin(a) * slope) / (r * sz);
            const len = Math.hypot(nx, 1, nz);
            normals.push(nx / len, 1 / len, nz / len);
            uvs.push(0.5 + x / (2 * reach * sx), 0.5 + z / (2 * reach * sz));
        }
    }
    const ring = segments + 1;
    for (let j = 0; j < rings; j++) {
        for (let i = 0; i < segments; i++) {
            const a = j * ring + i;
            const b = a + ring;
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

/**
 * A flat strip lying on y = 0 that follows the outline `edge(angle)` (as for {@link lens}) from
 * `inner` to `outer` times it: a glowing lip, a stain or a glow spilling round a pool. U runs round
 * it, V from the inner edge (0) to the outer (1).
 */
export function outlineBand(
    edge: (angle: number) => number,
    inner: number,
    outer: number,
    o: {sx?: number; sz?: number; segments?: number} = {}
): Geometry {
    const {sx = 1, sz = 1, segments = 96} = o;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (const [k, v] of [
        [inner, 0],
        [outer, 1],
    ]) {
        for (let i = 0; i <= segments; i++) {
            const a = (i / segments) * Math.PI * 2;
            const r = edge(a) * k;
            positions.push(Math.cos(a) * r * sx, 0, Math.sin(a) * r * sz);
            normals.push(0, 1, 0);
            uvs.push(i / segments, v);
        }
    }
    const ring = segments + 1;
    for (let i = 0; i < segments; i++) indices.push(i, i + ring, i + 1, i + 1, i + ring, i + ring + 1);
    return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        uvs: new Float32Array(uvs),
        indices: new Uint32Array(indices),
    };
}

/** A chunk of crystal: an octahedron one unit across on the origin, for `geo`. */
export function gem(): Geometry {
    return lathe(
        [
            [0, -0.5],
            [0.5, 0],
            [0, 0.5],
        ],
        4
    );
}

/** An ice blade or crystal point: a `sides`-sided spike one unit tall on the origin, for `geo`. */
export function spike(lean = 0, sides = 4): Geometry {
    const geo = lathe(
        [
            [0.14, 0],
            [0.1, 0.4],
            [0, 1],
        ],
        sides
    );
    // Sheared over by `lean` (x per unit of height), so a random turn about y tips it any way.
    for (let i = 0; i < geo.positions.length; i += 3) geo.positions[i] += lean * geo.positions[i + 1];
    return geo;
}

/**
 * A horn, thorn or claw: a tapering tube one unit tall on the origin whose tip curls `curl` units
 * over toward +x (the bend grows with the square of the height), `base` in radius at the foot,
 * `sides` round. For hooked thorns, tusks, talons.
 */
export function horn(curl = 0.4, sides = 6, base = 0.14, rows = 12): Geometry {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let j = 0; j <= rows; j++) {
        const t = j / rows;
        const cx = curl * t * t;
        // The centre line's tangent, and the side axis in the bend's plane square to it.
        const len = Math.hypot(2 * curl * t, 1);
        const tx = (2 * curl * t) / len;
        const ty = 1 / len;
        const r = Math.max(0.0005, base * Math.pow(1 - t, 0.9));
        for (let i = 0; i <= sides; i++) {
            const a = (i / sides) * Math.PI * 2;
            const c = Math.cos(a);
            const sn = Math.sin(a);
            // Side axis (ty, -tx, 0) and depth axis (0, 0, 1).
            const nx = c * ty;
            const ny = -c * tx;
            const nz = sn;
            positions.push(cx + r * nx, t + r * ny, r * nz);
            normals.push(nx, ny, nz);
            uvs.push(i / sides, t);
        }
    }
    const ring = sides + 1;
    for (let j = 0; j < rows; j++) {
        for (let i = 0; i < sides; i++) {
            const a = j * ring + i;
            const b = a + ring;
            indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
    }
    return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        uvs: new Float32Array(uvs),
        indices: new Uint32Array(indices),
    };
}

/**
 * A flat shape given thickness: `outline` (x, y points, either winding, no holes) cut into
 * triangles by ear clipping, capped front (+z) and back and walled round, `depth` thick and centred
 * on z = 0. UVs map the outline's bounds to 0 to 1 on the caps. For hearts, stars, birds, glyphs.
 */
export function extrude(outline: Array<[number, number]>, depth: number): Geometry {
    // Counter-clockwise, so the front cap faces +z.
    let area = 0;
    for (let i = 0; i < outline.length; i++) {
        const [x0, y0] = outline[i];
        const [x1, y1] = outline[(i + 1) % outline.length];
        area += x0 * y1 - x1 * y0;
    }
    const pts = area < 0 ? [...outline].reverse() : outline;
    const n = pts.length;
    const tris: number[] = [];
    const left = pts.map((_, i) => i);
    const cross = (a: number, b: number, c: number) =>
        (pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) - (pts[b][1] - pts[a][1]) * (pts[c][0] - pts[a][0]);
    const inside = (p: number, a: number, b: number, c: number) =>
        cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
    let guard = n * n;
    while (left.length > 3 && guard-- > 0) {
        for (let i = 0; i < left.length; i++) {
            const a = left[(i + left.length - 1) % left.length];
            const b = left[i];
            const c = left[(i + 1) % left.length];
            if (cross(a, b, c) <= 0) continue;
            if (left.some((p) => p !== a && p !== b && p !== c && inside(p, a, b, c))) continue;
            tris.push(a, b, c);
            left.splice(i, 1);
            break;
        }
    }
    if (left.length === 3) tris.push(left[0], left[1], left[2]);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of pts) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const h = depth / 2;
    for (const side of [1, -1]) {
        const base = positions.length / 3;
        for (const [x, y] of pts) {
            positions.push(x, y, side * h);
            normals.push(0, 0, side);
            uvs.push((x - minX) / (maxX - minX || 1), (y - minY) / (maxY - minY || 1));
        }
        for (let t = 0; t < tris.length; t += 3) {
            if (side > 0) indices.push(base + tris[t], base + tris[t + 2], base + tris[t + 1]);
            else indices.push(base + tris[t], base + tris[t + 1], base + tris[t + 2]);
        }
    }
    for (let i = 0; i < n; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % n];
        const len = Math.hypot(x1 - x0, y1 - y0) || 1;
        const nx = (y1 - y0) / len;
        const ny = -(x1 - x0) / len;
        const base = positions.length / 3;
        positions.push(x0, y0, h, x1, y1, h, x1, y1, -h, x0, y0, -h);
        for (let k = 0; k < 4; k++) normals.push(nx, ny, 0);
        uvs.push(0, 1, 1, 1, 1, 0, 0, 0);
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        uvs: new Float32Array(uvs),
        indices: new Uint32Array(indices),
    };
}

/**
 * A flat shape puffed up like a pillow: `outline` (x, y points round a point `center` they all see,
 * such as a heart, a star or a cloud) swells to `depth` thick at `center` and thins to an edge at the
 * outline, front (+z) and back. Smooth normals, so it shades round. UVs map the outline's bounds to
 * 0 to 1 on both faces. Where {@link extrude} gives a slab, this gives a plump, toy-like solid.
 */
export function pillow(
    outline: Array<[number, number]>,
    depth: number,
    o: {center?: [number, number]; rings?: number; power?: number} = {}
): Geometry {
    const {center = [0, 0], rings = 8, power = 0.5} = o;
    let area = 0;
    for (let i = 0; i < outline.length; i++) {
        const [x0, y0] = outline[i];
        const [x1, y1] = outline[(i + 1) % outline.length];
        area += x0 * y1 - x1 * y0;
    }
    const pts = area < 0 ? [...outline].reverse() : outline;
    const n = pts.length;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of pts) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const [cx, cy] = center;
    // How far a point lies inside the outline: its distance to the nearest edge.
    const inset = (x: number, y: number) => {
        let best = Infinity;
        for (let i = 0; i < n; i++) {
            const [ax, ay] = pts[i];
            const [bx, by] = pts[(i + 1) % n];
            const ex = bx - ax;
            const ey = by - ay;
            const k = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1)));
            best = Math.min(best, Math.hypot(x - ax - ex * k, y - ay - ey * k));
        }
        return best;
    };
    // The grid: ring 0 is the outline, ring `rings` collapses to the centre.
    const grid: Array<[number, number, number]> = [];
    for (let j = 0; j <= rings; j++) {
        const k = 1 - j / rings;
        for (const [px, py] of pts) {
            const x = cx + (px - cx) * k;
            const y = cy + (py - cy) * k;
            grid.push([x, y, inset(x, y)]);
        }
    }
    // Swell with the distance from the edge, not the ring, so a deep notch (a heart's cleft) dips
    // only where it is, and the thickest part sits where the shape is widest.
    const deepest = Math.max(...grid.map((g) => g[2])) || 1;
    for (const side of [1, -1]) {
        const base = positions.length / 3;
        for (let j = 0; j <= rings; j++) {
            for (let i = 0; i < n; i++) {
                const [x, y, d] = grid[j * n + i];
                const k = 1 - d / deepest;
                const z = side * (depth / 2) * Math.pow(Math.max(0, 1 - k * k), power);
                positions.push(x, y, z);
                uvs.push((x - minX) / (maxX - minX || 1), (y - minY) / (maxY - minY || 1));
            }
        }
        for (let j = 0; j < rings; j++) {
            for (let i = 0; i < n; i++) {
                const a = base + j * n + i;
                const b = base + j * n + ((i + 1) % n);
                const c = a + n;
                const d = b + n;
                // Clockwise seen from outside, as Babylon's front faces (and extrude's caps) are.
                if (side > 0) indices.push(a, d, b, a, c, d);
                else indices.push(a, b, d, a, d, c);
            }
        }
    }
    // Smooth normals: the area-weighted sum of the faces round each vertex (taken counter-clockwise,
    // so they point out of the clockwise faces).
    const normals = new Float32Array(positions.length);
    for (let t = 0; t < indices.length; t += 3) {
        const [a, c, b] = [indices[t] * 3, indices[t + 1] * 3, indices[t + 2] * 3];
        const ux = positions[b] - positions[a];
        const uy = positions[b + 1] - positions[a + 1];
        const uz = positions[b + 2] - positions[a + 2];
        const vx = positions[c] - positions[a];
        const vy = positions[c + 1] - positions[a + 1];
        const vz = positions[c + 2] - positions[a + 2];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        for (const v of [a, b, c]) {
            normals[v] += nx;
            normals[v + 1] += ny;
            normals[v + 2] += nz;
        }
    }
    for (let v = 0; v < normals.length; v += 3) {
        const len = Math.hypot(normals[v], normals[v + 1], normals[v + 2]) || 1;
        normals[v] /= len;
        normals[v + 1] /= len;
        normals[v + 2] /= len;
    }
    return {
        positions: new Float32Array(positions),
        normals,
        uvs: new Float32Array(uvs),
        indices: new Uint32Array(indices),
    };
}

/** A unit square in the x-y plane facing +z, UV 0 to 1: a decal to lay on a surface. */
export function quad(): Geometry {
    return {
        positions: new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]),
        normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
        uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
        indices: new Uint32Array([0, 2, 1, 0, 3, 2]),
    };
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
    const tex = o.sheet
        ? o.sheet
        : o.image
          ? image(scene, o.image)
          : sheet(scene, o.mesh ? 'white' : (o.tex ?? (o.beam ? 'bolt' : 'glow')));
    const geo = o.mesh ? geometry(scene, o.mesh) : o.geo;
    const tiles = tex.u * tex.v;
    const color = o.color ?? '#ffffff';
    const alpha = o.alpha ?? 1;
    // `mesh` particles are solid, lit rocks. A `geo` mesh blended `alpha` at full alpha is a solid
    // body too (opaque, writing depth) unless a behaviour fades it or a mask erodes it; then it
    // stays see-through but still writes depth, so what is drawn after it hides behind it.
    const fullAlpha = !!o.geo && o.blend === 'alpha' && alpha >= 1;
    const fades = (o.b ?? []).some((b) => b instanceof ColorOverLife) || !!o.look?.erosion;
    const solid = !!o.mesh || (o.opaque ?? (fullAlpha && !fades));
    const depthWrite = solid ? true : (o.depthWrite ?? (fullAlpha ? true : undefined));
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
            ? {startLength: new ConstantValue(o.trail ?? 20), followLocalOrigin: false, ...o.trailOpts}
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
        startRotation: o.geo
            ? o.upright
                ? new AxisAngleGenerator(new BVector3(0, 1, 0), new IntervalValue(0, Math.PI * 2))
                : o.tumble
                  ? new RandomQuatGenerator()
                  : undefined
            : geo
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
        // A point emits every way; with an `aim` and no shape, emit straight along the aim.
        shape: o.shape ?? (o.aim ? new ConeEmitter({radius: 0, angle: 0}) : new PointEmitter()),
        texture: tex.texture,
        uTileCount: tex.u,
        vTileCount: tex.v,
        startTileIndex:
            tiles > 1 && o.randomTile !== false ? new IntervalValue(0, tiles - 0.001) : new ConstantValue(0),
        blendMode: solid ? Constants.ALPHA_DISABLE : BLENDS[o.blend ?? 'add'],
        transparent: !solid,
        depthWrite,
        // Alpha-blended sprites overlap in the right order only drawn back to front; additive ones
        // add up the same in any order, so they skip the sort.
        sortMode: !solid && !geo && o.blend === 'alpha' ? 'distance' : undefined,
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
        ...(o.geo ? {lighting: 'unlit' as const} : {}),
        ...o.look,
    });
    if ((solid || o.geo) && o.tumble) {
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

/**
 * Tells the systems under `node` that it jumped rather than travelled, so emission over distance
 * does not fill the jump with particles. Call it after moving a looping flyer back to its start.
 */
export function teleported(node: TransformNode): void {
    for (const child of node.getDescendants(false)) {
        if (child instanceof ParticleEmitter && 'emissionState' in child.system) {
            const state = (child.system as ParticleSystem).emissionState;
            state.previousWorldPos = undefined;
            state.travelDistance = 0;
        }
    }
}
