import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {ConstantValue, EulerGenerator, Particle, PointEmitter, Quaternion, Vector3} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem, ScalingMode} from '../src/ParticleSystem';
import type {SpriteBatch} from '../src/SpriteBatch';
import {RenderMode} from '../src/VFXBatch';

/**
 * A mesh particle under a mirrored node, against Unity 6: one particle of size
 * 1.5 on a node turned (-90°, 35°, 0) below a parent, the negative scale on the node, (-1.5, 1,
 * 1.5) or (-1.5, 1.5, 1.5), or on the parent, with Render Alignment Local. Unity draws the mesh by
 * the matrix of its scaling mode, mirror included: the world matrix in Hierarchy, the node's turn
 * and own scale in Local; in Shape it is never mirrored. The particle's own turn is inside the
 * mirror, so it turns the other way. Each case is the vertex map Unity baked, per unit of size:
 * the world vectors its mesh's x, y and z axes are drawn along: the size along each, turned, then
 * stretched by the emitter's scale (see meshStretch.test.ts). The cases with a start rotation were
 * measured with an even scale.
 */
const DEG = Math.PI / 180;
const STEP = 1 / 60;
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

interface Case {
    mirror: 'node' | 'even' | 'parent' | 'none';
    mode: ScalingMode;
    worldSpace?: boolean;
    /** The start rotation 3D, degrees, as Unity's (Z, then X, then Y). */
    rotation?: [number, number, number];
    /** Unity's map: the drawn x, y and z axes of the mesh. */
    axes: [number, number, number][];
}

/** The axes of the mesh as the batch draws its one particle: the size along each, then turned. */
function drawnAxes(c: Case): [number, number, number][] {
    const parent = new TransformNode('parent', scene);
    parent.position.set(0.5, 0, 0);
    if (c.mirror === 'parent') parent.scaling.set(-1.5, 1, 1.5);
    const ps = new ParticleSystem({
        scene,
        duration: 10,
        looping: false,
        startLife: new ConstantValue(10),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1.5),
        startRotation: new EulerGenerator(
            new ConstantValue((c.rotation?.[0] ?? 0) * DEG),
            new ConstantValue((c.rotation?.[1] ?? 0) * DEG),
            new ConstantValue((c.rotation?.[2] ?? 0) * DEG),
            'YXZ'
        ),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
        shape: Object.assign(new PointEmitter(), {
            initialize: (p: Particle) => {
                p.position.set(0, 0, 0);
                p.velocity.set(0, 0, 0);
            },
        }),
        renderMode: RenderMode.Mesh,
        renderAlignment: 'local',
        scalingMode: c.mode,
        worldSpace: c.worldSpace ?? false,
        texture: null,
    });
    ps.emitter.parent = parent;
    ps.emitter.position.set(-0.3, 0.2, 0.1);
    ps.emitter.rotation = new BVector3(-90 * DEG, 35 * DEG, 0);
    const scales = {node: [-1.5, 1, 1.5], even: [-1.5, 1.5, 1.5], none: [1.5, 1, 1.5], parent: [1, 1, 1]};
    ps.emitter.scaling = BVector3.FromArray(scales[c.mirror]);
    ps.emitter.computeWorldMatrix(true);
    const renderer = new BatchedRenderer('mirror', scene);
    renderer.addSystem(ps);
    ps.play();
    renderer.update(STEP);
    renderer.update(STEP);
    const batch = renderer.batches[0] as SpriteBatch;
    expect(batch.mesh.forcedInstanceCount).toBe(1);
    const r = batch['rotationBuffer'] as Float32Array;
    const s = batch['sizeBuffer'] as Float32Array;
    // The stretch's three columns, applied after the turn (see meshStretch.test.ts).
    const t = batch['stretchBuffer'] as Float32Array;
    const q = new Quaternion(r[0], r[1], r[2], r[3]);
    return [0, 1, 2].map((axis) => {
        const v = new Vector3(axis === 0 ? s[0] : 0, axis === 1 ? s[1] : 0, axis === 2 ? s[2] : 0).applyQuaternion(q);
        return [
            (t[0] * v.x + t[3] * v.y + t[6] * v.z) / 1.5,
            (t[1] * v.x + t[4] * v.y + t[7] * v.z) / 1.5,
            (t[2] * v.x + t[5] * v.y + t[8] * v.z) / 1.5,
        ] as [number, number, number];
    });
}

function expectAxes(c: Case): void {
    const drawn = drawnAxes(c);
    for (let axis = 0; axis < 3; axis++) {
        for (let k = 0; k < 3; k++) {
            expect(drawn[axis][k]).toBeCloseTo(c.axes[axis][k], 3);
        }
    }
}

describe('a mesh particle under a mirrored node, as Unity draws it', () => {
    it('Hierarchy: the world matrix, mirrored by a negative scale on the node', () => {
        expectAxes({
            mirror: 'node',
            mode: 'hierarchy',
            axes: [
                [-1.2287, 0, 0.8603],
                [-0.5736, 0, -0.8192],
                [0, 1.5, 0],
            ],
        });
    });

    it('Hierarchy: mirrored by a negative scale on a parent', () => {
        expectAxes({
            mirror: 'parent',
            mode: 'hierarchy',
            axes: [
                [-1.2287, 0, -0.8604],
                [0.8604, 0, -1.2287],
                [0, 1, 0],
            ],
        });
    });

    it('Hierarchy: a start rotation 3D turns the mesh inside the mirror', () => {
        expectAxes({
            mirror: 'even',
            mode: 'hierarchy',
            rotation: [20, 30, 40],
            axes: [
                [-1.4699, -0.2889, -0.0768],
                [-0.0963, 0.8224, -1.2507],
                [-0.2831, 1.2207, 0.8245],
            ],
        });
    });

    it('Hierarchy, world space: still the mirrored matrix', () => {
        expectAxes({
            mirror: 'node',
            mode: 'hierarchy',
            worldSpace: true,
            axes: [
                [-1.2287, 0, 0.8603],
                [-0.5736, 0, -0.8192],
                [0, 1.5, 0],
            ],
        });
        expectAxes({
            mirror: 'even',
            mode: 'hierarchy',
            worldSpace: true,
            rotation: [20, 30, 40],
            axes: [
                [-1.4699, -0.2889, -0.0768],
                [-0.0963, 0.8225, -1.2507],
                [-0.2831, 1.2207, 0.8245],
            ],
        });
    });

    it('unmirrored, the world matrix as before', () => {
        expectAxes({
            mirror: 'none',
            mode: 'hierarchy',
            axes: [
                [1.2287, 0, -0.8603],
                [-0.5736, 0, -0.8192],
                [0, 1.5, 0],
            ],
        });
    });

    it("Local: mirrored by the node's own negative scale", () => {
        expectAxes({
            mirror: 'node',
            mode: 'local',
            axes: [
                [-1.2287, 0, 0.8604],
                [-0.5736, 0, -0.8191],
                [0, 1.5, 0],
            ],
        });
    });

    it("Local: the particle's turn inside the node's own mirror", () => {
        expectAxes({
            mirror: 'even',
            mode: 'local',
            rotation: [20, 30, 40],
            axes: [
                [-1.4699, -0.2889, -0.0769],
                [-0.0963, 0.8224, -1.2507],
                [-0.2831, 1.2207, 0.8245],
            ],
        });
    });

    it("Local: a parent's mirror does not reach the mesh", () => {
        expectAxes({
            mirror: 'parent',
            mode: 'local',
            axes: [
                [0.8191, 0, 0.5736],
                [0.5736, 0, -0.8192],
                [0, 1, 0],
            ],
        });
    });

    it('Shape: never mirrored, wherever the negative scale is', () => {
        expectAxes({
            mirror: 'even',
            mode: 'shape',
            rotation: [20, 30, 40],
            axes: [
                [0.287, -0.1927, -0.9383],
                [-0.7616, 0.5483, -0.3455],
                [0.581, 0.8138, 0.0107],
            ],
        });
        expectAxes({
            mirror: 'node',
            mode: 'shape',
            axes: [
                [0.8191, 0, -0.5736],
                [-0.5736, 0, -0.8192],
                [0, 1, 0],
            ],
        });
        expectAxes({
            mirror: 'parent',
            mode: 'shape',
            axes: [
                [0.8191, 0, 0.5735],
                [0.5736, 0, -0.8192],
                [0, 1, 0],
            ],
        });
    });

    it('says whether the scale of its scaling mode mirrors the system', () => {
        const parent = new TransformNode('parent', scene);
        parent.scaling.set(1, -1, 1);
        const ps = new ParticleSystem({scene, renderMode: RenderMode.Mesh, texture: null, scalingMode: 'hierarchy'});
        ps.emitter.parent = parent;
        parent.computeWorldMatrix(true);
        ps.emitter.computeWorldMatrix(true);
        expect(ps.emitter.matrixWorld && ps.emitter.mirrored).toBe(true);
        ps.scalingMode = 'local';
        expect(ps.emitter.matrixWorld && ps.emitter.mirrored).toBe(false);
        ps.emitter.scaling.set(1, 1, -2);
        ps.emitter.computeWorldMatrix(true);
        expect(ps.emitter.matrixWorld && ps.emitter.mirrored).toBe(true);
        ps.scalingMode = 'shape';
        expect(ps.emitter.matrixWorld && ps.emitter.mirrored).toBe(false);
        ps.scalingMode = 'hierarchy';
        // Two negative axes, one on the parent and one on the node, turn rather than mirror.
        expect(ps.emitter.matrixWorld && ps.emitter.mirrored).toBe(false);
    });
});
