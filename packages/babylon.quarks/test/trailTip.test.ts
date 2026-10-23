import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Scene} from '@babylonjs/core/scene';
import {
    Bezier,
    ConstantColor,
    ConstantValue,
    PiecewiseBezier,
    PointEmitter,
    TrailParticle,
    TrailSettings,
    Vector3,
    Vector4,
    WidthOverLength,
} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import trailVertGLSL from '../src/shaders/trail_vert.glsl';
import trailVertWGSL from '../src/shaders/trail_vert.wgsl';
import {RenderMode} from '../src/VFXBatch';
import {shaderOptions} from './internals';

let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
});

afterEach(() => {
    scene.dispose();
    engine.dispose();
});

const SPEED = 10;

/** One trail particle flying along +Z in world space. */
function trail(overrides: Partial<ParticleSystemParameters> = {}) {
    const system = new ParticleSystem({
        scene,
        duration: 100,
        looping: true,
        worldSpace: true,
        startLife: new ConstantValue(50),
        startSpeed: new ConstantValue(SPEED),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
        shape: new PointEmitter(),
        renderMode: RenderMode.Trail,
        rendererEmitterSettings: {startLength: new ConstantValue(30), followLocalOrigin: false},
        ...overrides,
    });
    const renderer = new BatchedRenderer('trail', scene);
    renderer.addSystem(system);
    system.play();
    renderer.update(1 / 60);
    const particle = system.particles[0] as TrailParticle;
    // Straight along +Z from the origin, whatever direction the shape gave it.
    particle.position.set(0, 0, 0);
    particle.velocity.set(0, 0, SPEED);
    particle.resetHistory();
    for (let i = 0; i < 10; i++) renderer.update(1 / 60);
    return {system, renderer, particle};
}

interface Buffers {
    positionBuffer: Float32Array;
    uvBuffer: Float32Array;
    widthBuffer: Float32Array;
    indexCount: number;
}
const buffers = (renderer: BatchedRenderer) => renderer.batches[0] as unknown as Buffers;

/** Z of drawn pair k (both vertices of a pair share it on a straight trail). */
const drawnZ = (renderer: BatchedRenderer, k: number) => buffers(renderer).positionBuffer[k * 6 + 2];

/** How many pairs the batch drew this frame, from its index count (two triangles per segment). */
const drawnPairs = (renderer: BatchedRenderer) => {
    const mesh = renderer.batches[0].mesh;
    return mesh.getTotalIndices() > 0 ? (mesh.subMeshes?.[0]?.indexCount ?? 0) / 6 + 1 : 0;
};

/** U of drawn pair k. */
const drawnU = (renderer: BatchedRenderer, k: number) => buffers(renderer).uvBuffer[k * 4];

/** Redraws the batch as if the display were `residual` seconds off the last step. */
function drawAt(system: ParticleSystem, renderer: BatchedRenderer, residual: number) {
    system['clock']['accumulator'] = residual;
    renderer.batches[0].update();
}

const recordedZ = (particle: TrailParticle, i: number) =>
    particle.historyPositions[particle.getHistoryIndex(i) * 3 + 2];

/** Updates at 50 Hz until the residual has the sign asked for. */
function frameWithResidual(system: ParticleSystem, renderer: BatchedRenderer, negative: boolean): number {
    for (let i = 0; i < 50; i++) {
        renderer.update(1 / 50);
        const residual = system.simulationResidual;
        if (negative ? residual < -1e-3 : residual > 1e-3) {
            return residual;
        }
    }
    throw new Error('no such frame');
}

describe('the live tip of a trail', () => {
    test('folds nothing back when the last step ran ahead of the display', () => {
        const {system, renderer, particle} = trail();
        const residual = frameWithResidual(system, renderer, true);
        const count = particle.historyCount;
        // No tip: the drawn ribbon ends at its head, pulled back along the last segment.
        expect(drawnPairs(renderer)).toBe(count);
        const head = drawnZ(renderer, count - 1);
        const before = drawnZ(renderer, count - 2);
        const recordedHead = particle.historyPositions[particle.getHistoryIndex(count - 1) * 3 + 2];
        expect(head).toBeLessThan(recordedHead);
        expect(head).toBeGreaterThan(before);
        expect(head).toBeCloseTo(recordedHead + residual * SPEED, 4);
        // Every drawn segment runs with the motion.
        for (let k = 1; k < count; k++) {
            expect(drawnZ(renderer, k) - drawnZ(renderer, k - 1)).toBeGreaterThanOrEqual(0);
        }
        renderer.dispose();
    });

    test('runs ahead of the head when the display is past the last step', () => {
        const {system, renderer, particle} = trail();
        const residual = frameWithResidual(system, renderer, false);
        const count = particle.historyCount;
        expect(drawnPairs(renderer)).toBe(count + 1);
        expect(drawnZ(renderer, count) - drawnZ(renderer, count - 1)).toBeCloseTo(residual * SPEED, 4);
        renderer.dispose();
    });

    test('adds no tip for float noise left in the accumulator', () => {
        const {system, renderer, particle} = trail();
        system['clock']['accumulator'] = 3.5e-18;
        renderer.batches[0].update();
        expect(drawnPairs(renderer)).toBe(particle.historyCount);
        renderer.dispose();
    });

    test('stops at the last sample once the particle has died', () => {
        const {system, renderer, particle} = trail({startLife: new ConstantValue(0.3)});
        // Run past death, between steps, while the trail shrinks away.
        let checked = 0;
        for (let i = 0; i < 40 && particle.historyCount > 0; i++) {
            renderer.update(1 / 50);
            if (particle.age > particle.life && particle.historyCount > 1) {
                const count = particle.historyCount;
                expect(drawnPairs(renderer)).toBeLessThanOrEqual(count);
                const newest = particle.historyPositions[particle.getHistoryIndex(count - 1) * 3 + 2];
                expect(drawnZ(renderer, count - 1)).toBeCloseTo(newest, 5);
                checked++;
            }
        }
        expect(checked).toBeGreaterThan(3);
        system.dispose();
        renderer.dispose();
    });

    test("keeps each sample's U as the residual changes sign", () => {
        const {system, renderer, particle} = trail();
        const count = particle.historyCount;
        drawAt(system, renderer, -2e-4);
        const behind = Array.from({length: count - 1}, (_, k) => drawnU(renderer, k));
        drawAt(system, renderer, 2e-4);
        // A residual of 2e-4 s is about 1% of a step: U may move by that share of a sample, not
        // jump by a whole one (1 / count) as it did when the drawn count changed.
        for (let k = 0; k < count - 1; k++) {
            expect(Math.abs(drawnU(renderer, k) - behind[k])).toBeLessThan(0.05 / count);
        }
        // The ribbon still spans the texture end to end on both frames.
        expect(drawnU(renderer, count)).toBeCloseTo(1, 5);
        drawAt(system, renderer, -2e-4);
        expect(drawnU(renderer, count - 1)).toBeCloseTo(1, 5);
        renderer.dispose();
    });

    test.each([
        ['tessellated', {tessellation: 3}],
        ['swept', {sideAxis: new Vector3(1, 0, 0)}],
        ['swept and tessellated', {sideAxis: new Vector3(1, 0, 0), tessellation: 2}],
    ] as Array<[string, Partial<TrailSettings>]>)('pulls a %s head back along its last segment', (_name, extra) => {
        const {system, renderer, particle} = trail({
            rendererEmitterSettings: {startLength: new ConstantValue(30), followLocalOrigin: false, ...extra},
        });
        const perSegment = (extra.tessellation ?? 0) + 1;
        const step = system.simulationStep;
        drawAt(system, renderer, -0.25 * step);
        const count = particle.historyCount;
        const pairs = (count - 1) * perSegment + 1;
        expect(drawnPairs(renderer)).toBe(pairs);
        const head = drawnZ(renderer, pairs - 1);
        expect(head).toBeCloseTo(recordedZ(particle, count - 1) - 0.25 * step * SPEED, 4);
        // The pulled-back segment keeps its points in order, evenly along the straight trail.
        const start = (count - 2) * perSegment;
        const gap = (head - drawnZ(renderer, start)) / perSegment;
        for (let k = start + 1; k < pairs; k++) {
            expect(drawnZ(renderer, k) - drawnZ(renderer, k - 1)).toBeCloseTo(gap, 4);
        }
        for (let k = 0; k < pairs * 6; k++) {
            expect(Number.isFinite(buffers(renderer).positionBuffer[k])).toBe(true);
        }
        renderer.dispose();
    });

    test('ends on the sample before the head when the display is a whole step behind', () => {
        const {system, renderer, particle} = trail({
            rendererEmitterSettings: {startLength: new ConstantValue(30), followLocalOrigin: false, tessellation: 2},
        });
        drawAt(system, renderer, -system.simulationStep);
        const count = particle.historyCount;
        const pairs = (count - 1) * 3 + 1;
        expect(drawnZ(renderer, pairs - 1)).toBeCloseTo(recordedZ(particle, count - 2), 4);
        expect(drawnU(renderer, pairs - 1)).toBeCloseTo(1, 5);
        for (let k = 0; k < pairs * 2; k++) {
            expect(Number.isFinite(buffers(renderer).uvBuffer[k])).toBe(true);
        }
        renderer.dispose();
    });

    test('is as wide as the head under WidthOverLength', () => {
        const {system, renderer, particle} = trail();
        system.addBehavior(new WidthOverLength(new PiecewiseBezier([[new Bezier(0.2, 0.2, 0.2, 0.2), 0]])));
        frameWithResidual(system, renderer, false);
        const count = particle.historyCount;
        const widths = buffers(renderer).widthBuffer;
        expect(widths[(count - 1) * 2]).toBeCloseTo(0.2, 5);
        expect(widths[count * 2]).toBeCloseTo(widths[(count - 1) * 2], 5);
        renderer.dispose();
    });
});

describe('a trail system', () => {
    test('made with no trail settings gets the defaults and runs', () => {
        const system = new ParticleSystem({
            scene,
            renderMode: RenderMode.Trail,
            startLife: new ConstantValue(1),
            emissionOverTime: new ConstantValue(30),
            shape: new PointEmitter(),
        });
        const settings = system.rendererEmitterSettings as TrailSettings;
        expect(settings.followLocalOrigin).toBe(false);
        expect((settings.startLength as ConstantValue).value).toBe(30);
        const renderer = new BatchedRenderer('defaults', scene);
        renderer.addSystem(system);
        expect(() => {
            for (let i = 0; i < 20; i++) renderer.update(1 / 60);
        }).not.toThrow();
        expect(system.particleNum).toBeGreaterThan(0);
        renderer.dispose();
    });

    test("fills the defaults on a copy, leaving the caller's settings as they were", () => {
        const given = {tessellation: 2} as TrailSettings;
        const system = new ParticleSystem({scene, renderMode: RenderMode.Trail, rendererEmitterSettings: given});
        expect(given).toEqual({tessellation: 2});
        expect((system.rendererEmitterSettings as TrailSettings).tessellation).toBe(2);
        expect((system.rendererEmitterSettings as TrailSettings).followLocalOrigin).toBe(false);
        system.dispose();
    });

    test('compiles alpha test in, and cuts at the set value', () => {
        const {renderer} = trail({alphaTest: 0.4});
        const material = renderer.batches[0].mesh.material as ShaderMaterial;
        expect(material['options'].defines).toContain('USE_ALPHATEST');
        expect(material['_floats'].alphaTest).toBeCloseTo(0.4, 5);
        renderer.dispose();
    });

    test('has no screen-space uniforms left', () => {
        const {renderer} = trail();
        const uniforms = shaderOptions(renderer.batches[0].mesh.material).uniforms!;
        for (const name of ['resolution', 'lineWidth', 'sizeAttenuation', 'world', 'worldViewProjection']) {
            expect(uniforms).not.toContain(name);
        }
        renderer.dispose();
    });
});

/**
 * The vertex shader's facing, ported to TS: the direction a point is widened along, across the
 * tangent and the line of sight, in view space.
 */
type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scaleV = (a: V, s: number): V => [a[0] * s, a[1] * s, a[2] * s];
const direction = (d: V): V => (dot(d, d) > 1e-12 ? scaleV(d, 1 / Math.sqrt(dot(d, d))) : [0, 0, 0]);
function trailSide(previous: V, point: V, next: V, ortho = false): V {
    const incoming = direction(sub(point, previous));
    const outgoing = direction(sub(next, point));
    let tangent = add(incoming, outgoing);
    if (dot(tangent, tangent) < 1e-6) {
        tangent = dot(outgoing, outgoing) > 0 ? outgoing : incoming;
    }
    const sight: V = ortho ? [0, 0, 1] : point;
    let side = cross(tangent, sight);
    if (dot(side, side) < 1e-12) side = cross(tangent, [0, 0, 1]);
    if (dot(side, side) < 1e-12) side = [1, 0, 0];
    return direction(side);
}

describe('trail facing', () => {
    const finiteUnit = (v: V) => {
        v.forEach((c) => expect(Number.isFinite(c)).toBe(true));
        expect(Math.sqrt(dot(v, v))).toBeCloseTo(1, 6);
    };

    test.each([
        ['a straight trail', [0, 0, 4], [1, 0, 5], [2, 0, 6]],
        ['repeated points', [1, 1, 5], [1, 1, 5], [1, 1, 5]],
        ['a point repeated at the head', [0, 0, 5], [1, 0, 5], [1, 0, 5]],
        ['a hairpin', [0, 0, 5], [1, 0, 5], [0, 0, 5]],
        ['a segment pointing at the camera', [0, 0, 2], [0, 0, 4], [0, 0, 6]],
        ['a neighbour behind the camera', [0, 0, -3], [0.5, 0, 1], [1, 0, 5]],
    ] as Array<[string, V, V, V]>)('stays a finite unit vector for %s', (_name, previous, point, next) => {
        finiteUnit(trailSide(previous, point, next));
        finiteUnit(trailSide(previous, point, next, true));
    });

    test('is across the tangent and the line of sight', () => {
        const side = trailSide([0, -1, 5], [0, 0, 5], [0, 1, 5]);
        expect(dot(side, [0, 1, 0])).toBeCloseTo(0, 6);
        expect(dot(side, direction([0, 0, 5]))).toBeCloseTo(0, 6);
    });

    test('the shaders carry the same facing in both languages', () => {
        for (const source of [trailVertGLSL, trailVertWGSL]) {
            expect(source).toContain('trailSide(previousPoint, point, nextPoint)');
            expect(source).toMatch(/dot\(tangent, tangent\) < 1e-6/);
            expect(source).toMatch(/projection\[3\]\[3\] > 0\.5/);
            expect(source).not.toContain('resolution');
        }
    });
});
