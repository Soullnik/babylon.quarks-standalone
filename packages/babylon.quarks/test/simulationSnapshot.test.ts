import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {
    ApplyForce,
    Bezier,
    ColorOverLife,
    ColorRange,
    ConeEmitter,
    ConstantValue,
    Gradient,
    IntervalValue,
    PiecewiseBezier,
    Quaternion,
    RotationOverLife,
    SizeOverLife,
    SphereEmitter,
    Vector3,
    Vector4,
} from 'quarks.core';
import {BabylonMetaData, ParticleSystem} from '../src/ParticleSystem';
import {RenderMode} from '../src/VFXBatch';

// Characterisation test: a seeded system of each render mode, stepped for a while, must keep
// producing the same particles and the same JSON. It pins behaviour while ParticleSystem is split
// into modules; a change that is meant to alter the simulation updates the snapshot on purpose.
// Materials, textures and texture effects are left at their defaults here; their own suites cover them.

let engine: NullEngine;
let scene: Scene;

beforeAll(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
});

afterAll(() => {
    scene.dispose();
    engine.dispose();
});

const STEP = 1 / 60;

function round(value: unknown): unknown {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? Math.round(value * 1e5) / 1e5 : value;
    }
    if (value instanceof Quaternion) {
        return [value.x, value.y, value.z, value.w].map(round);
    }
    if (value instanceof Vector4) {
        return [value.x, value.y, value.z, value.w].map(round);
    }
    if (value instanceof Vector3) {
        return [value.x, value.y, value.z].map(round);
    }
    if (Array.isArray(value)) {
        return value.map(round);
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, round(v)]));
    }
    return value;
}

function makeSystem(renderMode: RenderMode, worldSpace: boolean): ParticleSystem {
    const ps = new ParticleSystem({
        scene,
        seed: 1234,
        duration: 2,
        looping: true,
        worldSpace,
        renderMode,
        startLife: new IntervalValue(0.6, 1.4),
        startSpeed: new IntervalValue(1, 4),
        startSize: new IntervalValue(0.2, 0.6),
        startColor: new ColorRange(new Vector4(1, 0.5, 0.2, 1), new Vector4(0.2, 0.6, 1, 0.8)),
        startRotation: renderMode === RenderMode.Mesh ? undefined : new IntervalValue(0, Math.PI),
        emissionOverTime: new ConstantValue(30),
        emissionOverDistance: new ConstantValue(2),
        emissionBursts: [{time: 0.25, count: new IntervalValue(4, 9), cycle: 2, interval: 0.3, probability: 0.8}],
        shape: renderMode === RenderMode.Trail ? new ConeEmitter({radius: 0.5, angle: 0.4}) : new SphereEmitter(),
        rendererEmitterSettings:
            renderMode === RenderMode.Trail
                ? {startLength: new ConstantValue(12), followLocalOrigin: false}
                : renderMode === RenderMode.StretchedBillBoard
                  ? {speedFactor: 0.2, lengthFactor: 1}
                  : undefined,
        behaviors: [
            new ApplyForce(new Vector3(0, -1, 0), new ConstantValue(3)),
            new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.8, 0.4, 0), 0]])),
            new ColorOverLife(
                new Gradient(
                    [
                        [new Vector3(1, 1, 1), 0],
                        [new Vector3(1, 0.2, 0), 1],
                    ],
                    [
                        [1, 0],
                        [0, 1],
                    ]
                )
            ),
            ...(renderMode === RenderMode.Mesh ? [] : [new RotationOverLife(new IntervalValue(-2, 2))]),
        ],
    });
    return ps;
}

/** Sums over every live particle, so a change to any one of them shows. */
function checksum(ps: ParticleSystem) {
    const sum = {position: new Vector3(), velocity: new Vector3(), size: new Vector3(), color: new Vector4(), age: 0};
    for (const p of ps.particles.slice(0, ps.particleNum)) {
        sum.position.add(p.position);
        sum.velocity.add(p.velocity);
        sum.size.add(p.size);
        sum.color.add(p.color);
        sum.age += p.age;
    }
    return round(sum);
}

/** Sum of a trail particle's recorded history, so the ribbon's points are pinned too. */
function trailHistory(p: unknown) {
    const trail = p as {historyCount?: number; historyPositions?: Float32Array; historySizes?: Float32Array};
    if (!trail.historyCount) {
        return {};
    }
    let positions = 0;
    let sizes = 0;
    for (const v of trail.historyPositions ?? []) positions += v;
    for (const v of trail.historySizes ?? []) sizes += v;
    return {historyCount: trail.historyCount, historyPositions: positions, historySizes: sizes};
}

/** The first few live particles in full. */
function particleState(ps: ParticleSystem) {
    return ps.particles.slice(0, Math.min(ps.particleNum, 6)).map((p) =>
        round({
            position: p.position,
            velocity: p.velocity,
            size: p.size,
            color: p.color,
            rotation: p.rotation,
            age: p.age,
            life: p.life,
            ...trailHistory(p),
        })
    );
}

const modes: Array<[string, RenderMode, boolean]> = [
    ['billboard, world space', RenderMode.BillBoard, true],
    ['billboard, local space', RenderMode.BillBoard, false],
    ['stretched billboard', RenderMode.StretchedBillBoard, true],
    ['mesh', RenderMode.Mesh, true],
    ['trail', RenderMode.Trail, true],
    ['beam', RenderMode.Beam, false],
];

/** Steps `ps` for 90 uneven frames with a moving emitter, recording it every 30. */
function simulate(ps: ParticleSystem, worldSpace: boolean): unknown[] {
    // A local-space system is also turned and scaled unevenly, so its bounds go through the
    // emitter's full matrix.
    if (!worldSpace) {
        ps.emitter.rotation.set(0.3, 0.7, 0);
        ps.emitter.scaling.set(1.5, 0.8, 1);
    }
    const frames: unknown[] = [];
    for (let frame = 1; frame <= 90; frame++) {
        // A moving emitter, so emission over distance and world/local space both matter.
        ps.emitter.position.set(Math.sin(frame * 0.05) * 2, frame * 0.01, 0);
        ps.emitter.computeWorldMatrix(true);
        // Uneven frames, so the fixed-step accumulator is exercised.
        ps.update(frame % 3 === 0 ? STEP * 1.7 : STEP * 0.8);
        if (frame % 30 === 0) {
            frames.push({frame, particleNum: ps.particleNum, checksum: checksum(ps), particles: particleState(ps)});
        }
    }
    return frames;
}

describe('seeded simulation snapshot', () => {
    it.each(modes)('%s keeps its particles, bounds and JSON', (_name, renderMode, worldSpace) => {
        const ps = makeSystem(renderMode, worldSpace);
        if (renderMode === RenderMode.Beam) {
            ps.beamEnd = {x: 3, y: 1, z: 0};
        }
        const frames = simulate(ps, worldSpace);
        const min = new Vector3();
        const max = new Vector3();
        const hasBounds = ps.getWorldBounds(min, max);
        const meta: BabylonMetaData = {geometries: {}, materials: {}, textures: {}};
        const json = ps.toJSON(meta);

        // Loaded back, the system writes the same JSON and, seeded the same, plays the same.
        const loaded = ParticleSystem.fromJSON(json, meta, {}, scene);
        const reloadMeta: BabylonMetaData = {geometries: {}, materials: {}, textures: {}};
        expect(round(loaded.toJSON(reloadMeta))).toEqual(round(json));
        expect(round(reloadMeta.geometries)).toEqual(round(meta.geometries));
        expect(simulate(loaded, worldSpace)).toEqual(frames);

        expect({
            frames,
            bounds: hasBounds ? round({min, max}) : null,
            json: round(json),
            meta: round({geometries: meta.geometries, materials: meta.materials}),
        }).toMatchSnapshot();
        loaded.dispose();
        ps.dispose();
    });
});
