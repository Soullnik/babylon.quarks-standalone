import {FreeCamera} from '@babylonjs/core/Cameras/freeCamera';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import type {Mesh} from '@babylonjs/core/Meshes/mesh';
import type {SubMesh} from '@babylonjs/core/Meshes/subMesh';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, Particle, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import {quarksTransparentSortCompare} from '../src/transparentSort';
import {RenderMode} from '../src/VFXBatch';

/**
 * Unity draws each transparent particle system as a renderer of its own, back to front by the
 * distance from the camera to the centre of its bounds plus its sorting fudge, and draws
 * consecutive renderers of one material together. A batch holds every system of one material, so
 * when a system of another batch comes between two of its systems the batch is drawn twice, under
 * and over it. An effect that lays rear dust behind and front dust in front of
 * the smoke in two batches, drawn a batch at a time, drew a rear puff over a front one.
 */
let engine: NullEngine;
let scene: Scene;
let camera: FreeCamera;

beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    camera = new FreeCamera('cam', new BVector3(0, 0, -10), scene);
    camera.setTarget(BVector3.Zero());
});

afterEach(() => {
    scene.dispose();
    engine.dispose();
});

/** One particle at z `z`, moving along X so a trail has a length; `parameters` pick the batch. */
function system(z: number, renderMode: RenderMode, parameters: Partial<ParticleSystemParameters> = {}): ParticleSystem {
    const shape = new PointEmitter();
    shape.initialize = (p: Particle) => {
        p.position.set(0, 0, 0);
        p.velocity.set(1, 0, 0);
    };
    const ps = new ParticleSystem({
        scene,
        worldSpace: true,
        startLife: new ConstantValue(5),
        startSpeed: new ConstantValue(1),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
        shape,
        renderMode,
        ...parameters,
    });
    ps.emitter.position.set(0, 0, z);
    return ps;
}

const DRAW_MESHES = new Set(['spriteBatch', 'spriteBatchRun', 'trailBatch']);

/** The z of what each of the renderer's draws shows, in the order Babylon draws them. */
function drawnZ(): number[] {
    const draws: Array<{subMesh: SubMesh; z: number}> = [];
    for (const mesh of scene.meshes as Mesh[]) {
        if (!DRAW_MESHES.has(mesh.name) || !mesh.isVisible) {
            continue;
        }
        for (const subMesh of mesh.subMeshes) {
            let z: number;
            if (mesh.name === 'trailBatch') {
                z = mesh.getVerticesData('position')![subMesh.verticesStart * 3 + 2];
            } else {
                if (!mesh.forcedInstanceCount) {
                    continue;
                }
                z = (mesh.getVertexBuffer('offset')!.getData() as Float32Array)[2];
            }
            subMesh._alphaIndex = mesh.alphaIndex;
            subMesh._distanceToCamera = 0;
            draws.push({subMesh, z});
        }
    }
    draws.sort((a, b) => quarksTransparentSortCompare(a.subMesh, b.subMesh));
    return draws.map((d) => Math.round(d.z * 10) / 10);
}

function step(renderer: BatchedRenderer, frames = 3): void {
    for (let i = 0; i < frames; i++) {
        renderer.update(1 / 30);
    }
}

describe('the order of the systems', () => {
    it.each([RenderMode.BillBoard, RenderMode.Mesh, RenderMode.Trail])(
        "draws a batch twice around another batch's system between its two (mode %s)",
        (renderMode) => {
            const renderer = new BatchedRenderer('order', scene);
            // Two systems of one material with one of another between them, added near first.
            renderer.addSystem(system(0, renderMode));
            renderer.addSystem(system(5, renderMode));
            renderer.addSystem(system(2.5, renderMode, {blendMode: 2}));
            expect(renderer.batches).toHaveLength(2);
            step(renderer);
            expect(drawnZ()).toEqual([5, 2.5, 0]);
            // Babylon draws the runs: every draw is ready and renders.
            expect(() => scene.render()).not.toThrow();

            // From the other side the order turns round.
            camera.position.set(0, 0, 20);
            camera.setTarget(BVector3.Zero());
            camera.computeWorldMatrix();
            step(renderer, 2);
            expect(drawnZ()).toEqual([0, 2.5, 5]);
            renderer.dispose();
        }
    );

    it('draws a batch once when its systems come one after another, the sorting fudge counted', () => {
        const renderer = new BatchedRenderer('order', scene);
        renderer.addSystem(system(0, RenderMode.BillBoard));
        renderer.addSystem(system(5, RenderMode.BillBoard));
        // Between them by distance, but 10 behind both by its fudge: drawn first, under them.
        renderer.addSystem(system(2.5, RenderMode.BillBoard, {blendMode: 2, sortingFudge: 10}));
        step(renderer);
        expect(drawnZ()).toEqual([2.5, 5]);
        const batch = renderer.batches[0];
        expect(batch.mesh.forcedInstanceCount).toBe(2);
        // The far system's particle first in the batch's instances.
        const offsets = batch.mesh.getVertexBuffer('offset')!.getData() as Float32Array;
        expect([offsets[2], offsets[5]]).toEqual([5, 0]);
        renderer.dispose();
    });

    it('keeps the batches of systems that are not transparent whole', () => {
        const renderer = new BatchedRenderer('order', scene);
        renderer.addSystem(system(0, RenderMode.BillBoard, {transparent: false}));
        renderer.addSystem(system(5, RenderMode.BillBoard, {transparent: false}));
        renderer.addSystem(system(2.5, RenderMode.Mesh, {transparent: false}));
        step(renderer);
        expect(renderer.batches).toHaveLength(2);
        expect(renderer.batches[0].mesh.forcedInstanceCount).toBe(2);
        expect(scene.meshes.some((mesh) => mesh.name === 'spriteBatchRun')).toBe(false);
        renderer.dispose();
    });

    it('hides a run mesh while its batch draws once, and counts every instance drawn', () => {
        const renderer = new BatchedRenderer('order', scene);
        const near = system(0, RenderMode.BillBoard);
        renderer.addSystem(near);
        renderer.addSystem(system(5, RenderMode.BillBoard));
        const middle = system(2.5, RenderMode.BillBoard, {blendMode: 2});
        renderer.addSystem(middle);
        step(renderer);
        const run = scene.meshes.find((mesh) => mesh.name === 'spriteBatchRun')!;
        expect(run.isVisible).toBe(true);
        expect(renderer.getBatchRenderStats()[0].instanceCount).toBe(2);
        // Brought in front of both by its fudge: the batch's systems now come one after another.
        middle.sortingFudge = -20;
        step(renderer, 2);
        expect(drawnZ()).toEqual([5, 2.5]);
        expect(renderer.batches[0].mesh.forcedInstanceCount).toBe(2);
        expect(run.isVisible).toBe(false);
        renderer.dispose();
        expect(run.isDisposed()).toBe(true);
    });
});
