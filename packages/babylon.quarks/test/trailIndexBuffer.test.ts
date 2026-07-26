import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, IntervalValue, SphereEmitter, Vector4} from 'quarks.core';
import {ParticleSystem} from '../src/ParticleSystem';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {RenderMode, VFXBatch} from '../src/VFXBatch';

/**
 * The index buffer a trail batch draws from has to be created at the size the
 * batch can grow to, not at the size of the placeholder triangle it starts
 * with. WebGL tolerated drawing past the end of an undersized buffer; WebGPU
 * refuses the draw outright — "index range does not fit in index buffer size".
 */
describe('trail index buffer', () => {
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

    // Deliberately small: enough history to draw real geometry, but under the
    // batch's starting capacity, so no reallocation happens mid-test and the
    // size reserved up front is the size still in use at the end.
    it('reserves, up front, room for every index it later draws', () => {
        const system = new ParticleSystem({
            scene,
            duration: 10,
            looping: true,
            worldSpace: true,
            startLife: new ConstantValue(2),
            startSpeed: new IntervalValue(5, 20),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(5),
            shape: new SphereEmitter(),
            renderMode: RenderMode.Trail,
            rendererEmitterSettings: {startLength: new ConstantValue(8), followLocalOrigin: false},
        });
        const renderer = new BatchedRenderer('trail-index', scene);
        renderer.addSystem(system);
        const batch = renderer.batches[0] as VFXBatch;
        // Read before any frame: this is the size the GPU buffer is created at,
        // and the only size WebGPU will let a draw reach. Reading it later would
        // measure nothing, because updating indices replaces the CPU-side array.
        const reserved = batch.mesh.getTotalIndices();

        system.play();
        for (let i = 0; i < 180; i++) renderer.update(1 / 60);

        const drawn = batch.mesh.subMeshes[0].indexCount;
        expect(drawn).toBeGreaterThan(6);
        expect(reserved).toBeGreaterThanOrEqual(drawn);

        renderer.dispose();
    });
});

describe('trail draws when it has nothing to show', () => {
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

    it('never submits a draw of zero indices', () => {
        // A looping effect spends the gap between passes with no trail geometry
        // at all. A zero-index draw is still submitted, and WebGPU warns about
        // it once per frame for the whole gap.
        const system = new ParticleSystem({
            scene,
            duration: 1,
            looping: false,
            worldSpace: true,
            startLife: new ConstantValue(0.5),
            startSpeed: new IntervalValue(5, 10),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(20),
            shape: new SphereEmitter(),
            renderMode: RenderMode.Trail,
            rendererEmitterSettings: {startLength: new ConstantValue(6), followLocalOrigin: false},
        });
        const renderer = new BatchedRenderer('trail-empty', scene);
        renderer.addSystem(system);
        const batch = renderer.batches[0] as VFXBatch;
        system.play();

        let sawGeometry = false;
        let sawEmpty = false;
        for (let i = 0; i < 240; i++) {
            renderer.update(1 / 60);
            const submesh = batch.mesh.subMeshes[0];
            expect(submesh.indexCount).toBeGreaterThan(0);
            if (system.particleNum > 0) sawGeometry = true;
            else if (sawGeometry) sawEmpty = true;
        }
        // The run has to actually cover both states for the assertion to mean
        // anything: trails drawn, then the effect finished and nothing left.
        expect(sawGeometry).toBe(true);
        expect(sawEmpty).toBe(true);

        // ...and what it draws while empty collapses to a single point.
        const indices = batch.mesh.getIndices()!;
        expect(Array.from(indices.slice(0, 6))).toEqual([0, 0, 0, 0, 0, 0]);

        renderer.dispose();
    });
});
