/**
 * The serialisation contract of a whole ParticleSystem: every constructor parameter, set to a
 * non-default value, survives `toJSON` and `fromJSON` (through `JSON.stringify`), `clone()` and
 * `QuarksLoader`, and a clone shares nothing mutable with its source. `PARAMETERS` has to name
 * every key of `ParticleSystemParameters` (the type checker enforces it), so a new setting cannot
 * skip the contract.
 */
import {Constants} from '@babylonjs/core/Engines/constants';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Scene} from '@babylonjs/core/scene';
import {
    ApplyForce,
    Bezier,
    ColorOverLife,
    ConstantColor,
    ConstantValue,
    EulerGenerator,
    Gradient,
    IntervalValue,
    PiecewiseBezier,
    Quaternion,
    ShapeTransform,
    SizeOverLife,
    SphereEmitter,
    Vector2,
    Vector3,
    Vector3Function,
    Vector4,
} from 'quarks.core';
import {ParticleEmitter} from '../src/ParticleEmitter';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import {QuarksLoader} from '../src/QuarksLoader';
import {RenderMode} from '../src/VFXBatch';
import {emptyMeta} from './internals';

let engine: NullEngine;
let scene: Scene;
let texture: Texture;
let mask: Texture;

beforeAll(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    texture = new Texture('data:contract-texture', scene);
    mask = new Texture('data:contract-mask', scene);
});

afterAll(() => {
    scene.dispose();
    engine.dispose();
});

const curve = () =>
    new PiecewiseBezier([
        [new Bezier(0.1, 0.4, 0.7, 0.9), 0],
        [new Bezier(0.9, 0.6, 0.3, 0.2), 0.5],
    ]);

type Parameter<K extends keyof ParticleSystemParameters> = (() => ParticleSystemParameters[K]) | 'not-a-setting';

/**
 * A non-default value for every constructor parameter. `'not-a-setting'` marks the parameters that
 * are not part of an effect: the scene it is created in, and parameters that only shape another
 * one (covered there).
 */
const PARAMETERS: {[K in keyof Required<ParticleSystemParameters>]: Parameter<K>} = {
    stopAction: () => 'disable',
    // A deprecated alias of stopAction, covered there.
    autoDestroy: 'not-a-setting',
    looping: () => false,
    prewarm: () => true,
    prewarmTime: () => 0.5,
    duration: () => 3,
    startDelay: () => new IntervalValue(0.1, 0.3),
    shape: () =>
        new SphereEmitter({
            radius: 2,
            arc: 3,
            thickness: 0.5,
            transform: new ShapeTransform(new Vector3(1, 2, 3), new Quaternion(0, 0, 0.6, 0.8), new Vector3(2, 2, 2)),
        }),
    startLife: curve,
    startSpeed: () => new IntervalValue(1, 3),
    startRotation: () => new EulerGenerator(curve(), new ConstantValue(1), new IntervalValue(0, 2)),
    startSize: () => new Vector3Function(curve(), new ConstantValue(2), new IntervalValue(1, 3)),
    startColor: () => new ConstantColor(new Vector4(0.1, 0.2, 0.3, 0.4)),
    emissionOverTime: () => new IntervalValue(20, 30),
    emissionOverDistance: () => new ConstantValue(4),
    emissionBursts: () => [{time: 0.2, count: new IntervalValue(3, 6), cycle: 2, interval: 0.1, probability: 0.5}],
    maxParticles: () => 77,
    ringBufferMode: () => 'loopUntilReplaced',
    ringBufferLoopRange: () => new Vector2(0.2, 0.7),
    onlyUsedByOther: () => true,
    behaviors: () => [
        new ColorOverLife(new Gradient()),
        new SizeOverLife(curve()),
        new ApplyForce(new Vector3(0, 1, 0), new ConstantValue(2)),
    ],
    instancingGeometry: () => new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    instancingIndices: () => new Uint16Array([0, 1, 2]),
    instancingUVs: () => new Float32Array([0, 0, 1, 0, 0, 1]),
    instancingUVs2: () => new Float32Array([0, 0, 0.5, 0, 0, 0.5]),
    instancingNormals: () => new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    renderMode: () => RenderMode.Mesh,
    rendererEmitterSettings: 'not-a-setting',
    speedFactor: 'not-a-setting',
    material: 'not-a-setting',
    texture: () => texture,
    startTileIndex: () => new IntervalValue(1, 3),
    uTileCount: () => 4,
    vTileCount: () => 2,
    blendTiles: () => true,
    softParticles: () => true,
    softFarFade: () => 3,
    softNearFade: () => 0.5,
    renderOrder: () => 5,
    worldSpace: () => true,
    blendMode: () => Constants.ALPHA_ADD,
    transparent: () => true,
    depthTest: () => false,
    depthWrite: () => true,
    alphaTest: () => 0.3,
    layerMask: () => 6,
    pivot: () => new Vector3(0.1, 0.2, 0.3),
    flip: () => new Vector2(0.5, 1),
    lighting: () => 'scene',
    rim: () => ({color: [0.1, 0.2, 0.3], power: 3, strength: 0.5, mode: 'mix'}),
    mapUV: () => ({channel: 1, tiling: [2, 3], offset: [0.1, 0.2], scroll: [0.3, 0.4]}),
    gradientMap: () => ({ramp: mask, channel: 'g'}),
    erosion: () => ({mask, maskUV: {tiling: [2, 2]}, softness: 0.2, edgeWidth: 0.1, edgeColor: [1, 0.5, 0]}),
    uvDistortion: () => ({map: mask, mapUV: {scroll: [0.1, 0]}, strength: 0.3}),
    playbackSpeed: () => 1.5,
    cullingMode: () => 'pause',
    scalingMode: () => 'hierarchy',
    seed: () => 42,
    sortMode: () => 'distance',
    alignToDirection: () => true,
    minParticleSize: () => 0.01,
    maxParticleSize: () => 0.5,
    renderingGroupId: () => 2,
    applyFog: () => false,
    renderFace: () => 'front',
    scene: 'not-a-setting',
};

const parameters = (overrides: ParticleSystemParameters = {}): ParticleSystemParameters => {
    const out: Record<string, unknown> = {scene};
    for (const [key, make] of Object.entries(PARAMETERS)) {
        if (make !== 'not-a-setting') {
            out[key] = (make as () => unknown)();
        }
    }
    return {...out, ...overrides} as ParticleSystemParameters;
};

/** The render modes and the settings only they read. */
const VARIANTS: Array<[string, ParticleSystemParameters]> = [
    ['mesh', {}],
    ['billboard', {renderMode: RenderMode.BillBoard}],
    [
        'stretched billboard',
        {renderMode: RenderMode.StretchedBillBoard, rendererEmitterSettings: {speedFactor: 0.4, lengthFactor: 2}},
    ],
    [
        'trail',
        {
            renderMode: RenderMode.Trail,
            rendererEmitterSettings: {
                startLength: new IntervalValue(5, 9),
                followLocalOrigin: true,
                uvFromHead: true,
                colorFromParticle: true,
                dieWithParticle: true,
                recordWorldSpace: true,
                sideAxis: new Vector3(0, 0, 1),
                tessellation: 3,
                curveTension: 0.5,
            },
        },
    ],
    ['beam', {renderMode: RenderMode.Beam}],
];

/** Per-frame scratch any class may keep, and per-particle generator memory: not settings. */
const SCRATCH_FIELDS = new Set(['temp', 'temp2', 'temp3', 'tempQ', 'memory']);

/** Runtime state particular to one class, left out for that class only. */
const RUNTIME_FIELDS: Record<string, string[]> = {
    OrbitOverLife: ['rotation'],
    FrameOverLife: ['indexCount'],
};

const isRuntime = (owner: object, key: string) =>
    SCRATCH_FIELDS.has(key) || key === 'uuid' || (RUNTIME_FIELDS[owner.constructor?.name] ?? []).includes(key);

/** Babylon objects (textures, scenes, materials, nodes) are resources an effect refers to. */
const isBabylon = (value: object): value is {getClassName(): string; name?: string; url?: string} =>
    typeof (value as {getClassName?: unknown}).getClassName === 'function';

function state(value: unknown, seen = new Set<object>()): unknown {
    if (value === null || typeof value !== 'object') {
        return typeof value === 'function' ? undefined : value;
    }
    if (isBabylon(value)) {
        return {$babylon: value.getClassName(), name: value.name, url: value.url};
    }
    if (seen.has(value)) {
        return '[cycle]';
    }
    seen.add(value);
    if (ArrayBuffer.isView(value)) {
        return Array.from(value as unknown as ArrayLike<number>);
    }
    if (Array.isArray(value)) {
        return value.map((item) => state(item, seen));
    }
    const out: Record<string, unknown> = {$class: value.constructor?.name};
    for (const key of Object.keys(value).sort()) {
        if (!isRuntime(value, key) && !key.startsWith('_')) {
            out[key] = state((value as Record<string, unknown>)[key], seen);
        }
    }
    return out;
}

/** Everything a system's settings consist of, compared between two systems. */
function settings(ps: ParticleSystem): Record<string, unknown> {
    const out: Record<string, unknown> = {renderer: state(ps.getRendererSettings())};
    for (const [key, make] of Object.entries(PARAMETERS)) {
        if (make !== 'not-a-setting' && key in ps) {
            out[key] = state((ps as unknown as Record<string, unknown>)[key]);
        }
    }
    out.shape = state(ps.emitterShape);
    out.rendererEmitterSettings = state(ps.rendererEmitterSettings);
    out.tint = state(ps.tint);
    out.emissionMultiplier = ps.emissionMultiplier;
    return out;
}

/**
 * Mutable objects reachable from a system's settings. Babylon resources and the instancing
 * geometry arrays are left out: copies of an effect share them by design, as meshes share
 * vertex data.
 */
function reachable(value: unknown, out = new Set<object>()): Set<object> {
    if (
        value === null ||
        typeof value !== 'object' ||
        out.has(value) ||
        isBabylon(value) ||
        ArrayBuffer.isView(value) ||
        Object.isFrozen(value)
    ) {
        return out;
    }
    out.add(value);
    for (const [key, child] of Object.entries(value)) {
        if (!isRuntime(value, key)) {
            reachable(child, out);
        }
    }
    return out;
}

const settingObjects = (ps: ParticleSystem) =>
    reachable([
        ...Object.keys(PARAMETERS).map((key) => (ps as unknown as Record<string, unknown>)[key]),
        ps.getRendererSettings(),
        ps.emitterShape,
        ps.rendererEmitterSettings,
        ps.tint,
    ]);

const newMeta = emptyMeta;

describe('ParticleSystem serialisation contract', () => {
    describe.each(VARIANTS)('%s', (_name, overrides) => {
        const make = () => new ParticleSystem(parameters(overrides));

        it('survives toJSON and fromJSON', () => {
            const original = make();
            const meta = newMeta();
            const json = JSON.parse(JSON.stringify(original.toJSON(meta)));
            const loaded = ParticleSystem.fromJSON(json, meta, {}, scene);
            expect(settings(loaded)).toEqual(settings(original));
            original.dispose();
            loaded.dispose();
        });

        it('clones to an equal, independent copy', () => {
            const original = make();
            original.tint = new Vector4(1, 0.5, 0.25, 1);
            original.emissionMultiplier = 2;
            const copy = original.clone();
            expect(settings(copy)).toEqual(settings(original));
            const fromOriginal = settingObjects(original);
            const shared = [...settingObjects(copy)].filter((object) => fromOriginal.has(object));
            expect(shared.map((object) => object.constructor?.name)).toEqual([]);
            original.dispose();
            copy.dispose();
        });

        it('loads through QuarksLoader with the same settings', () => {
            const original = make();
            const meta = newMeta();
            const systemJSON = original.toJSON(meta);
            const images: unknown[] = [];
            const textures: unknown[] = [];
            for (const [uuid, tex] of Object.entries(meta.textures)) {
                images.push({uuid: `img-${uuid}`, url: tex instanceof Texture ? tex.url : undefined});
                textures.push({uuid, image: `img-${uuid}`});
            }
            const document = JSON.parse(
                JSON.stringify({
                    images,
                    textures,
                    geometries: Object.values(meta.geometries),
                    materials: Object.values(meta.materials),
                    object: {uuid: 'emitter', type: 'ParticleEmitter', name: 'fx', ps: systemJSON},
                })
            );
            const root = new QuarksLoader(scene).parse(document);
            const loaded = (root as ParticleEmitter).system as ParticleSystem;
            expect(loaded).toBeInstanceOf(ParticleSystem);
            // A loaded texture gets its name from the loader; its url says which image it is.
            const strip = (s: Record<string, unknown>) =>
                JSON.parse(JSON.stringify(s, (k, v) => (k === 'name' ? undefined : v)));
            expect(strip(settings(loaded))).toEqual(strip(settings(original)));
            original.dispose();
            root.dispose();
        });
    });

    it('sets every parameter in at least one variant', () => {
        const unset = Object.entries(PARAMETERS)
            .filter(
                ([key, make]) =>
                    make === 'not-a-setting' && !['scene', 'material', 'speedFactor', 'autoDestroy'].includes(key)
            )
            .map(([key]) => key)
            .filter((key) => !VARIANTS.some(([, overrides]) => key in overrides));
        expect(unset).toEqual([]);
    });
});
