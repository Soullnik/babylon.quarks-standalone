import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, TrailParticle, TrailSettings, Vector3, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import {TrailBatch} from '../src/TrailBatch';
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

/** One trail particle riding the emitter, its ribbon swept along the emitter's X, a blade 2 long. */
function blade(worldSpace = true, sideAxis: Vector3 | null = new Vector3(1, 0, 0)) {
    return new ParticleSystem({
        scene,
        duration: 10,
        looping: false,
        startLife: new ConstantValue(10),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(2),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), probability: 1, interval: 0, cycle: 1}],
        shape: new PointEmitter(),
        renderMode: RenderMode.Trail,
        worldSpace,
        rendererEmitterSettings: {
            startLength: new ConstantValue(20),
            followLocalOrigin: true,
            ...(sideAxis ? {sideAxis} : {}),
        },
    });
}

const buffers = (renderer: BatchedRenderer) => {
    const batch = renderer.batches[0] as TrailBatch as any;
    return {positions: batch.positionBuffer as Float32Array, widths: batch.widthBuffer as Float32Array};
};

describe('swept trail', () => {
    it('records the emitter axis with each sample, turned as the emitter was', () => {
        const system = blade();
        system.update(1 / 60);
        system.emitter.rotation.y = Math.PI / 2;
        system.emitter.computeWorldMatrix(true);
        system.update(1 / 60);
        const trail = system.particles[0] as TrailParticle;
        expect(trail.historyCount).toBeGreaterThanOrEqual(2);
        const sides = trail.historySides;
        const first = trail.getHistoryIndex(0) * 3;
        const last = trail.getHistoryIndex(trail.historyCount - 1) * 3;
        expect([sides[first], sides[first + 1], sides[first + 2]].map((v) => Math.round(v * 1e4) / 1e4)).toEqual([
            1, 0, 0,
        ]);
        // X turned a quarter about Y points down -Z.
        expect(sides[last]).toBeCloseTo(0, 5);
        expect(sides[last + 2]).toBeCloseTo(-1, 5);
    });

    it('bounds the ribbon by both its edges', () => {
        const renderer = new BatchedRenderer('swept', scene);
        const system = blade();
        renderer.addSystem(system);
        for (let i = 0; i < 4; i++) {
            system.emitter.position.z = i;
            system.emitter.computeWorldMatrix(true);
            renderer.update(1 / 60);
        }
        const min = new Vector3();
        const max = new Vector3();
        expect(system.getWorldBounds(min, max)).toBe(true);
        // The blade is 2 long across X: its edges lie at -1 and +1.
        expect(min.x).toBeLessThanOrEqual(-1 + 1e-4);
        expect(max.x).toBeGreaterThanOrEqual(1 - 1e-4);
    });

    it('lays each vertex pair half the width to either side along it, with no camera-facing width', () => {
        const renderer = new BatchedRenderer('swept', scene);
        const system = blade();
        renderer.addSystem(system);
        for (let i = 0; i < 4; i++) {
            system.emitter.position.z = i;
            system.emitter.computeWorldMatrix(true);
            renderer.update(1 / 60);
        }
        const {positions, widths} = buffers(renderer);
        const trail = system.particles[0] as TrailParticle;
        const pairs = trail.historyCount;
        expect(pairs).toBeGreaterThanOrEqual(2);
        for (let i = 0; i < pairs; i++) {
            const p = i * 6;
            expect(positions[p]).toBeCloseTo(1, 5);
            expect(positions[p + 3]).toBeCloseTo(-1, 5);
            expect(positions[p + 1]).toBeCloseTo(positions[p + 4], 5);
            expect(positions[p + 2]).toBeCloseTo(positions[p + 5], 5);
            expect(widths[i * 2]).toBe(0);
            expect(widths[i * 2 + 1]).toBe(0);
        }
    });

    it('sweeps the live tip drawn between steps too', () => {
        const renderer = new BatchedRenderer('sweptTip', scene);
        const system = blade();
        (system.rendererEmitterSettings as TrailSettings).followLocalOrigin = false;
        renderer.addSystem(system);
        // Uneven frames leave a residual, so a live tip is appended past the recorded head.
        for (let i = 0; i < 5; i++) renderer.update(0.021);
        const trail = system.particles[0] as TrailParticle;
        const {positions, widths} = buffers(renderer);
        const pairs = trail.historyCount + ((system as any).simulationResidual ? 1 : 0);
        expect((system as any).simulationResidual).toBeGreaterThan(0);
        const tip = (pairs - 1) * 6;
        expect(positions[tip] - positions[tip + 3]).toBeCloseTo(2, 4);
        expect(widths[(pairs - 1) * 2]).toBe(0);
    });

    it('scales the width with the emitter, and works in local space', () => {
        const renderer = new BatchedRenderer('sweptLocal', scene);
        const system = blade(false);
        system.emitter.scaling.set(3, 3, 3);
        system.emitter.computeWorldMatrix(true);
        renderer.addSystem(system);
        renderer.update(1 / 60);
        renderer.update(1 / 60);
        const {positions} = buffers(renderer);
        // Size 2, scale 3: 6 across, 3 to either side.
        expect(positions[0] - positions[3]).toBeCloseTo(6, 4);
    });

    it('leaves a trail without an axis camera-facing', () => {
        const renderer = new BatchedRenderer('facing', scene);
        const system = blade(true, null);
        renderer.addSystem(system);
        renderer.update(1 / 60);
        renderer.update(1 / 60);
        const {positions, widths} = buffers(renderer);
        expect(positions[0]).toBe(positions[3]);
        expect(widths[0]).toBe(2);
        expect((system.particles[0] as TrailParticle).historySides.length).toBe(0);
    });

    it('round-trips its axis through JSON and clone, written only when set', () => {
        const system = blade(true, new Vector3(0, 0, 2));
        const json = system.toJSON();
        expect((json.rendererEmitterSettings as any).sideAxis).toEqual([0, 0, 2]);
        const meta = {geometries: {}, materials: {}, textures: {}} as any;
        for (const copy of [ParticleSystem.fromJSON(system.toJSON(meta), meta, {}, scene), system.clone()]) {
            const axis = (copy.rendererEmitterSettings as TrailSettings).sideAxis!;
            expect([axis.x, axis.y, axis.z]).toEqual([0, 0, 2]);
        }
        expect('sideAxis' in (blade(true, null).toJSON().rendererEmitterSettings as object)).toBe(false);
    });
});
