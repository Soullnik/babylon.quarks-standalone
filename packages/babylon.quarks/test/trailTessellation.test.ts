import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, TrailParticle, TrailSettings, Vector3, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import {TrailBatch} from '../src/TrailBatch';
import {MAX_TRAIL_TESSELLATION, trailCurveTension, trailTessellation} from '../src/trailCurve';
import {RenderMode} from '../src/VFXBatch';

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

const RADIUS = 2;

/** A trail riding the emitter round a circle, a few big steps apart: the corners a fast swing shows. */
function circling(settings: Partial<TrailSettings> = {}, worldSpace = true) {
    const system = new ParticleSystem({
        scene,
        duration: 10,
        looping: false,
        startLife: new ConstantValue(10),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(0.5),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), probability: 1, interval: 0, cycle: 1}],
        shape: new PointEmitter(),
        renderMode: RenderMode.Trail,
        worldSpace,
        rendererEmitterSettings: {startLength: new ConstantValue(20), followLocalOrigin: true, ...settings},
    });
    const renderer = new BatchedRenderer('tessellation', scene);
    renderer.addSystem(system);
    for (let i = 0; i < 5; i++) {
        const angle = (i * Math.PI) / 6;
        system.emitter.position.set(Math.sin(angle) * RADIUS, 0, Math.cos(angle) * RADIUS);
        // A blade pointing out from the centre.
        system.emitter.rotation.y = angle - Math.PI / 2;
        system.emitter.computeWorldMatrix(true);
        renderer.update(1 / 60);
    }
    const batch = renderer.batches[0] as TrailBatch as any;
    const trail = system.particles[0] as TrailParticle;
    return {system, renderer, batch, trail};
}

/** The drawn pair midpoints: where the ribbon runs. */
function centres(batch: any, pairs: number): number[][] {
    const p = batch.positionBuffer as Float32Array;
    const out: number[][] = [];
    for (let i = 0; i < pairs; i++) {
        const o = i * 6;
        out.push([(p[o] + p[o + 3]) / 2, (p[o + 1] + p[o + 4]) / 2, (p[o + 2] + p[o + 5]) / 2]);
    }
    return out;
}

const radiusOf = (point: number[]) => Math.hypot(point[0], point[2]);

describe('trail tessellation', () => {
    it('normalises its settings', () => {
        expect(trailTessellation(undefined)).toBe(0);
        expect(trailTessellation({tessellation: 2.6} as TrailSettings)).toBe(3);
        expect(trailTessellation({tessellation: -4} as TrailSettings)).toBe(0);
        expect(trailTessellation({tessellation: 99} as TrailSettings)).toBe(MAX_TRAIL_TESSELLATION);
        expect(trailTessellation({tessellation: NaN} as TrailSettings)).toBe(0);
        expect(trailCurveTension({curveTension: 3} as TrailSettings)).toBe(1);
        expect(trailCurveTension({curveTension: -1} as TrailSettings)).toBe(0);
    });

    it('draws each sample as one pair when off', () => {
        const {batch, trail} = circling();
        const pairs = trail.historyCount;
        expect(batch.mesh.subMeshes[0].verticesCount).toBe(pairs * 2);
    });

    it('draws each segment as several along a curve through every sample', () => {
        const plain = circling();
        const samples = centres(plain.batch, plain.trail.historyCount);
        const steps = 3;
        const curved = circling({tessellation: steps});
        const drawn = (samples.length - 1) * (steps + 1) + 1;
        expect(curved.batch.mesh.subMeshes[0].verticesCount).toBe(drawn * 2);
        const points = centres(curved.batch, drawn);
        // Through every sample...
        samples.forEach((sample, i) => {
            const point = points[i * (steps + 1)];
            sample.forEach((v, c) => expect(point[c]).toBeCloseTo(v, 5));
        });
        // ...and between them closer to the circle the samples lie on than the straight chord.
        const chordMid = samples[1].map((v, c) => (v + samples[2][c]) / 2);
        const curveMid = points[steps + 1 + 2];
        expect(Math.abs(radiusOf(curveMid) - RADIUS)).toBeLessThan(Math.abs(radiusOf(chordMid) - RADIUS) / 4);
    });

    it('curves a local-space trail through its samples the same way', () => {
        const plain = circling({}, false);
        const samples = centres(plain.batch, plain.trail.historyCount);
        const curved = circling({tessellation: 2}, false);
        const points = centres(curved.batch, (samples.length - 1) * 3 + 1);
        samples.forEach((sample, i) => sample.forEach((v, c) => expect(points[i * 3][c]).toBeCloseTo(v, 5)));
    });

    it('runs U along the curve, from the head under uvFromHead, on both UV channels', () => {
        const {batch, trail} = circling({tessellation: 3, uvFromHead: true});
        const drawn = (trail.historyCount - 1) * 4 + 1;
        const uv = batch.uvBuffer as Float32Array;
        expect(uv[0]).toBeCloseTo(1, 6);
        expect(uv[(drawn - 1) * 4]).toBeCloseTo(0, 6);
        for (let i = 1; i < drawn; i++) expect(uv[i * 4]).toBeLessThan(uv[(i - 1) * 4]);
    });

    describe('the curve itself', () => {
        /** The batch's tessellate on hand-placed samples: points along X, sizes and colors given. */
        function curve(xs: number[], curved: number, steps: number, tension = 0) {
            const {batch} = circling();
            const samples = batch.trailSamples(xs.length);
            xs.forEach((x, i) => {
                samples.writePoint(i, x, 0, 0, null);
                samples.size[i] = i;
                samples.writeColor(i, i, 0, 0, 1);
            });
            const out = batch.tessellate(samples, curved, xs.length, steps, tension, false);
            const n = (xs.length - 1) * (steps + 1) + 1;
            return {
                xs: Array.from({length: n}, (_, k) => out.position[k * 3]),
                sizes: Array.from(out.size.subarray(0, n)),
                reds: Array.from({length: n}, (_, k) => out.color[k * 4]),
            };
        }

        it('never runs past a live tip a fraction of a step ahead, or doubles back', () => {
            for (const fraction of [0.02, 0.1, 0.5]) {
                const {xs} = curve([0, 1, 2, 2 + fraction], 3, 8);
                for (let k = 1; k < xs.length; k++) expect(xs[k]).toBeGreaterThanOrEqual(xs[k - 1] - 1e-9);
                expect(Math.max(...xs)).toBeCloseTo(2 + fraction, 6);
            }
        });

        it('keeps the recorded part still however the live tip moves', () => {
            const steps = 4;
            const a = curve([0, 1, 2, 2.1], 3, steps).xs;
            const b = curve([0, 1, 2, 2.7], 3, steps).xs;
            const recorded = 2 * (steps + 1) + 1;
            expect(b.slice(0, recorded)).toEqual(a.slice(0, recorded));
        });

        it('does not overshoot samples spaced unevenly', () => {
            const {xs} = curve([0, 0.05, 1, 1.05, 3], 5, 8);
            for (let k = 1; k < xs.length; k++) expect(xs[k]).toBeGreaterThanOrEqual(xs[k - 1] - 1e-9);
        });

        it('eases widths and colors along each segment', () => {
            const {sizes, reds} = curve([0, 1, 2], 3, 3);
            expect(sizes).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
            expect(reds).toEqual(sizes);
        });
    });

    it('draws straight segments at full tension', () => {
        const plain = circling();
        const samples = centres(plain.batch, plain.trail.historyCount);
        const curved = circling({tessellation: 1, curveTension: 1});
        const points = centres(curved.batch, (samples.length - 1) * 2 + 1);
        const chordMid = samples[1].map((v, c) => (v + samples[2][c]) / 2);
        chordMid.forEach((v, c) => expect(points[3][c]).toBeCloseTo(v, 5));
    });

    it('turns a swept trail’s sides with the curve, keeping their length', () => {
        const {batch, trail} = circling({tessellation: 4, sideAxis: new Vector3(1, 0, 0)});
        const p = batch.positionBuffer as Float32Array;
        const drawn = (trail.historyCount - 1) * 5 + 1;
        for (let i = 0; i < drawn; i++) {
            const o = i * 6;
            // The blade's two ends are its width (0.5) apart, along a radius of the circle.
            const edge = Math.hypot(p[o] - p[o + 3], p[o + 1] - p[o + 4], p[o + 2] - p[o + 5]);
            expect(edge).toBeCloseTo(0.5, 2);
            const inner = radiusOf([p[o], 0, p[o + 2]]);
            const outer = radiusOf([p[o + 3], 0, p[o + 5]]);
            expect(Math.abs(outer - inner)).toBeCloseTo(0.5, 2);
        }
    });

    it('grows its buffers for the extra vertices', () => {
        const {batch, trail} = circling({tessellation: MAX_TRAIL_TESSELLATION});
        const drawn = (trail.historyCount - 1) * (MAX_TRAIL_TESSELLATION + 1) + 1;
        expect(batch.positionBuffer.length).toBeGreaterThanOrEqual(drawn * 6);
        expect(batch.mesh.subMeshes[0].verticesCount).toBe(drawn * 2);
    });

    it('round-trips through toJSON / fromJSON, and clone (the loader reads systems through fromJSON), writing only what is set', () => {
        const {system} = circling({tessellation: 5, curveTension: 0.25});
        const json = system.toJSON() as any;
        expect(json.rendererEmitterSettings).toMatchObject({tessellation: 5, curveTension: 0.25});
        const copy = ParticleSystem.fromJSON(json, {} as any, {}, scene);
        expect(copy.rendererEmitterSettings).toMatchObject({tessellation: 5, curveTension: 0.25});
        expect(system.clone().rendererEmitterSettings).toMatchObject({tessellation: 5, curveTension: 0.25});

        const plain = circling().system.toJSON() as any;
        expect('tessellation' in plain.rendererEmitterSettings).toBe(false);
        expect('curveTension' in plain.rendererEmitterSettings).toBe(false);
    });
});
