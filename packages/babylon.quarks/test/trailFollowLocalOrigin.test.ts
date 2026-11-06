import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, TrailParticle, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import {TrailBatch} from '../src/TrailBatch';
import {RenderMode} from '../src/VFXBatch';

/**
 * A trail that follows its local origin stays where it was emitted relative to the emitter and is
 * carried by it, so it draws the emitter's path. Wherever the samples are recorded (in the
 * system's space, or in the world with `recordWorldSpace`) and whatever the system's space, the
 * ribbon is drawn where the emitter was: once through the emitter's matrix, never twice.
 */
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

function riding(worldSpace: boolean, recordWorldSpace: boolean): ParticleSystem {
    return new ParticleSystem({
        scene,
        worldSpace,
        duration: 10,
        looping: false,
        startLife: new ConstantValue(10),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
        shape: new PointEmitter(),
        renderMode: RenderMode.Trail,
        rendererEmitterSettings: {startLength: new ConstantValue(20), followLocalOrigin: true, recordWorldSpace},
    });
}

/** The centres of the drawn ribbon, x of each sample, oldest first. */
function drawnX(renderer: BatchedRenderer): number[] {
    const batch = renderer.batches[0] as TrailBatch;
    const positions = batch['positionBuffer'] as Float32Array;
    // The vertices the batch drew this frame: its draw ranges, one per run of systems.
    const count = batch.mesh.subMeshes.reduce((n, subMesh) => n + subMesh.verticesCount, 0) / 2;
    const xs: number[] = [];
    for (let i = 0; i < count; i++) {
        // Two vertices per sample, a camera-facing ribbon: both at the sample's centre.
        xs.push(positions[i * 6]);
    }
    return xs;
}

describe('a trail following its local origin', () => {
    for (const worldSpace of [false, true]) {
        for (const recordWorldSpace of [false, true]) {
            it(`draws where the emitter was (worldSpace ${worldSpace}, recordWorldSpace ${recordWorldSpace})`, () => {
                const renderer = new BatchedRenderer('trail', scene);
                const system = riding(worldSpace, recordWorldSpace);
                renderer.addSystem(system);
                // The emitter moves along x from 3 to 5; the ribbon must run over the same span.
                for (let i = 0; i <= 4; i++) {
                    system.emitter.position.set(3 + i * 0.5, 0, 0);
                    system.emitter.computeWorldMatrix(true);
                    renderer.update(1 / 60);
                }
                const xs = drawnX(renderer);
                expect(xs.length).toBeGreaterThanOrEqual(3);
                expect(Math.min(...xs)).toBeGreaterThanOrEqual(3 - 1e-4);
                expect(Math.max(...xs)).toBeCloseTo(5, 4);
            });
        }
    }

    it('records world samples once with recordWorldSpace in a local-space system', () => {
        const system = riding(false, true);
        system.emitter.position.set(3, 0, 0);
        system.emitter.computeWorldMatrix(true);
        system.play();
        system.update(1 / 60);
        system.update(1 / 60);
        const trail = system.particles[0] as TrailParticle;
        const head = trail.getHistoryIndex(trail.historyCount - 1) * 3;
        expect(trail.historyPositions[head]).toBeCloseTo(3, 5);
        // The particle itself stays in the system's (local) space, at its local origin.
        expect(trail.position.x).toBeCloseTo(0, 5);
    });
});
