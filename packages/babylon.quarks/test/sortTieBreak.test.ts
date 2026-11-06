import {UniversalCamera} from '@babylonjs/core/Cameras/universalCamera';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {Scene} from '@babylonjs/core/scene';
import {ConstantValue, Particle, PointEmitter} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import {quarksSortDistance} from '../src/transparentSort';
import type {VFXBatch} from '../src/VFXBatch';
import {RenderMode} from '../src/VFXBatch';

let engine: NullEngine;
let scene: Scene;
let camera: UniversalCamera;

beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    camera = new UniversalCamera('camera', new BVector3(0, 0, -10), scene);
    camera.setTarget(BVector3.Zero());
});

afterEach(() => {
    scene.dispose();
    engine.dispose();
});

/** A quad whose vertices lie `z` ahead of its pivot, so the mesh is drawn off where the particle is. */
function offsetQuad(z: number): {positions: number[]; indices: number[]; uvs: number[]} {
    return {
        positions: [-0.5, -0.5, z, 0.5, -0.5, z, 0.5, 0.5, z, -0.5, 0.5, z],
        indices: [0, 1, 2, 0, 2, 3],
        uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    };
}

/** One mesh particle at the origin, unturned, size `size`, whose mesh lies `z` along its Z. */
function meshSystem(z: number, size = 2): ParticleSystem {
    const quad = offsetQuad(z);
    const shape = new PointEmitter();
    shape.initialize = (p: Particle) => {
        p.position.set(0, 0, 0);
        p.velocity.set(0, 0, 0);
    };
    const ps = new ParticleSystem({
        scene,
        duration: 10,
        looping: true,
        startLife: new ConstantValue(10),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(size),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
        shape,
        renderMode: RenderMode.Mesh,
        texture: null,
        // A mesh of its own, so each system has a batch of its own.
        instancingGeometry: quad.positions,
        instancingIndices: quad.indices,
        instancingUVs: quad.uvs,
    } as never);
    return ps;
}

/** The key the renderer sorts a batch's draw by: from the camera to its system's sorting centre. */
function sortDistance(batch: VFXBatch): number {
    return quarksSortDistance(batch.mesh.subMeshes[0]);
}

function setup(): {renderer: BatchedRenderer; front: ParticleSystem; back: ParticleSystem} {
    const renderer = new BatchedRenderer('renderer', scene);
    // The camera looks down +Z: the mesh 1.5 along +Z is the farther one.
    const back = meshSystem(1.5);
    const front = meshSystem(-1.5);
    for (const ps of [back, front]) {
        renderer.addSystem(ps);
        ps.restart();
    }
    // The second fill sorts by where the first drew the meshes.
    renderer.update(1 / 30);
    renderer.update(1 / 30);
    return {renderer, front, back};
}

function batchOf(renderer: BatchedRenderer, ps: ParticleSystem): VFXBatch {
    return renderer.batches[renderer.systemToBatchIndex.get(ps)!];
}

describe('transparent batches at the same place', () => {
    it('sort the one whose meshes are drawn farther as farther', () => {
        const {renderer, front, back} = setup();
        expect(front.particleNum).toBe(1);
        expect(batchOf(renderer, front)).not.toBe(batchOf(renderer, back));
        const near = sortDistance(batchOf(renderer, front));
        const far = sortDistance(batchOf(renderer, back));
        expect(far).toBeGreaterThan(near);
        // Only nudged: the particles themselves are at the same place.
        expect(far - near).toBeLessThan(0.01);
    });

    it('swap when the meshes turn around', () => {
        const {renderer, front, back} = setup();
        for (const ps of [front, back]) {
            for (const p of ps.particles.slice(0, ps.particleNum)) {
                (p.rotation as {setFromAxisAngle(axis: unknown, angle: number): void}).setFromAxisAngle(
                    {x: 0, y: 1, z: 0},
                    Math.PI
                );
            }
        }
        renderer.update(1 / 30);
        renderer.update(1 / 30);
        expect(sortDistance(batchOf(renderer, front))).toBeGreaterThan(sortDistance(batchOf(renderer, back)));
    });

    it('leave batches of centred meshes where their particles are', () => {
        const renderer = new BatchedRenderer('renderer', scene);
        const ps = meshSystem(0);
        renderer.addSystem(ps);
        ps.restart();
        renderer.update(1 / 30);
        const batch = batchOf(renderer, ps);
        const info = batch.mesh.getBoundingInfo();
        const center = info.minimum.add(info.maximum).scale(0.5);
        expect(center.length()).toBeLessThan(1e-9);
    });
});
