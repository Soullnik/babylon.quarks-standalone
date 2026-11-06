import {FreeCamera} from '@babylonjs/core/Cameras/freeCamera';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Quaternion as BQuaternion, Vector3 as BVector3, Matrix} from '@babylonjs/core/Maths/math.vector';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {ConstantValue, EulerGenerator, Particle, PointEmitter, Quaternion, Vector3} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import {SpriteBatch} from '../src/SpriteBatch';
import {RenderMode} from '../src/VFXBatch';

/**
 * Unity applies an emitter's scale to a mesh particle outside the particle's rotation, along the
 * axes of the render alignment, so a mesh turned under an unevenly scaled emitter is stretched
 * along the emitter's (or the world's) axes, not its own. The expected columns are Unity 6's,
 * baked with ParticleSystemRenderer.BakeMesh: a frame mesh (origin, +X, +Y, +Z) of size 1 turned
 * by a 3D start rotation of (30, 40, 50) degrees, in a local-space system whose node is turned by
 * (10, 20, 30) degrees and scaled (1, 2, 1) under a parent scaled (2, 1, 1). A portal
 * spinning flat rings under such a parent: Unity keeps them upright ellipses as they
 * turn, while scaling each one's size spun the ellipses into a lobed knot.
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

const DEG = Math.PI / 180;

/** Unity's Euler angles, in degrees, as a turn: Babylon and Unity share the order and handedness. */
function unityEuler(x: number, y: number, z: number): BQuaternion {
    return BQuaternion.FromEulerAngles(x * DEG, y * DEG, z * DEG);
}

/** One mesh particle at the origin, turned by Unity's (30, 40, 50), under the probe's emitter. */
function system(parameters: Partial<ParticleSystemParameters> = {}): ParticleSystem {
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
        startSize: new ConstantValue(1),
        // The exporter's Unity rotation: intrinsic YXZ in quarks is Unity's Z, X, Y.
        startRotation: new EulerGenerator(
            new ConstantValue(30 * DEG),
            new ConstantValue(40 * DEG),
            new ConstantValue(50 * DEG),
            'YXZ'
        ),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
        shape,
        renderMode: RenderMode.Mesh,
        instancingGeometry: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
        texture: null,
        worldSpace: false,
        scalingMode: 'hierarchy',
        renderAlignment: 'local',
        ...parameters,
    });
    const parent = new TransformNode('parent', scene);
    parent.scaling.set(2, 1, 1);
    ps.emitter.parent = parent;
    ps.emitter.rotationQuaternion = unityEuler(10, 20, 30);
    ps.emitter.scaling.set(1, 2, 1);
    ps.emitter.computeWorldMatrix(true);
    return ps;
}

function render(ps: ParticleSystem): SpriteBatch {
    const renderer = new BatchedRenderer('stretch', scene);
    renderer.addSystem(ps);
    ps.play();
    renderer.update(1 / 60);
    renderer.update(1 / 60);
    return renderer.batches[0] as SpriteBatch;
}

/**
 * What the vertex shader does to the first instance's mesh axes, from the batch's buffers: each
 * axis scaled by the size, turned by the rotation and stretched by the stretch, in the world.
 */
function drawnAxes(batch: SpriteBatch): Vector3[] {
    expect(batch.mesh.forcedInstanceCount).toBe(1);
    const size = batch['sizeBuffer'] as Float32Array;
    const turn = batch['rotationBuffer'] as Float32Array;
    const stretch = batch['stretchBuffer'] as Float32Array;
    const q = new Quaternion(turn[0], turn[1], turn[2], turn[3]);
    return [0, 1, 2].map((axis) => {
        const v = new Vector3(axis === 0 ? size[0] : 0, axis === 1 ? size[1] : 0, axis === 2 ? size[2] : 0);
        v.applyQuaternion(q);
        return new Vector3(
            stretch[0] * v.x + stretch[3] * v.y + stretch[6] * v.z,
            stretch[1] * v.x + stretch[4] * v.y + stretch[7] * v.z,
            stretch[2] * v.x + stretch[5] * v.y + stretch[8] * v.z
        );
    });
}

function expectAxes(actual: Vector3[], expected: number[][]): void {
    for (let axis = 0; axis < 3; axis++) {
        expect(actual[axis].x).toBeCloseTo(expected[axis][0], 3);
        expect(actual[axis].y).toBeCloseTo(expected[axis][1], 3);
        expect(actual[axis].z).toBeCloseTo(expected[axis][2], 3);
    }
}

describe('the stretch of mesh particles', () => {
    it("stretches a mesh along the emitter's axes after its turn, Local alignment, Hierarchy scaling", () => {
        const axes = drawnAxes(render(system()));
        // Unity's L·R: the emitter's world matrix, skewed by the turned node under the uneven
        // parent, after the particle's turn.
        expectAxes(axes, [
            [0.055, 1.5161, 0.1451],
            [-1.0756, 0.634, 1.1128],
            [2.2228, -0.694, 0.1821],
        ]);
    });

    it('takes the node’s own scale along its axes, Local scaling', () => {
        const axes = drawnAxes(render(system({scalingMode: 'local'})));
        expectAxes(axes, [
            [0.0275, 1.5161, 0.1451],
            [-0.5378, 0.634, 1.1128],
            [1.1114, -0.694, 0.1821],
        ]);
    });

    it("stretches along the world's axes, World alignment", () => {
        const axes = drawnAxes(render(system({renderAlignment: 'world'})));
        expectAxes(axes, [
            [1.2641, 1.5591, -0.1334],
            [-0.6508, 1.3083, 0.8224],
            [0.9527, -1.1751, 0.7387],
        ]);
    });

    it("stretches along the camera's axes, View alignment: the scale before the camera's turn", () => {
        const camera = new FreeCamera('cam', new BVector3(2, 3, -8), scene);
        camera.setTarget(BVector3.Zero());
        const batch = render(system({renderAlignment: 'view'}));
        // The shader turns the stretched mesh into the camera's axes; the stretch is Unity's
        // lossy scale, the world matrix along the axes of the node's rotation, as for World.
        const stretch = Array.from((batch['stretchBuffer'] as Float32Array).slice(0, 9));
        const world = (batch['visibleSystems'][0] as ParticleSystem).emitter.getWorldMatrix().m;
        const turn = new Matrix();
        unityEuler(10, 20, 30).toRotationMatrix(turn);
        const lossy = [0, 1, 2].map((axis) => {
            const o = axis * 4;
            return turn.m[o] * world[o] + turn.m[o + 1] * world[o + 1] + turn.m[o + 2] * world[o + 2];
        });
        const expected = [lossy[0], 0, 0, 0, lossy[1], 0, 0, 0, lossy[2]];
        for (let k = 0; k < 9; k++) {
            expect(stretch[k]).toBeCloseTo(expected[k], 5);
        }
        expect((batch['sizeBuffer'] as Float32Array)[0]).toBeCloseTo(1, 6);
    });

    it('keeps the size and leaves a world-space mesh unstretched: it took the scale at birth', () => {
        const batch = render(system({worldSpace: true}));
        const stretch = Array.from((batch['stretchBuffer'] as Float32Array).slice(0, 9));
        expect(stretch).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    });

    it('does not mirror a mesh under a mirrored emitter, as before', () => {
        const ps = system();
        ps.emitter.scaling.set(-1, 2, 1);
        ps.emitter.computeWorldMatrix(true);
        const stretch = (render(ps)['stretchBuffer'] as Float32Array).slice(0, 9);
        const [a, b, c, d, e, f, g, h, i] = Array.from(stretch);
        const det = a * (e * i - f * h) - d * (b * i - c * h) + g * (b * f - c * e);
        expect(det).toBeGreaterThan(0);
    });

    it('binds the stretch as one buffer of three views', () => {
        const ps = system();
        const batch = render(ps);
        const views = ['stretchX', 'stretchY', 'stretchZ'].map((kind) => batch.mesh.getVertexBuffer(kind)!);
        expect(views.every((view) => view.getBuffer() === views[0].getBuffer())).toBe(true);
        expect(views.map((view) => view.byteOffset)).toEqual([0, 12, 24]);
        expect(views[0].byteStride).toBe(36);
    });
});
