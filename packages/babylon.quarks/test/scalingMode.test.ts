import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Quaternion as BQuaternion, Vector3 as BVector3, Matrix} from '@babylonjs/core/Maths/math.vector';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {
    Bezier,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    EmitSubParticleSystem,
    ForceOverLife,
    LimitSpeedOverLife,
    PiecewiseBezier,
    SubParticleEmitMode,
    Vector3,
    Vector4,
} from 'quarks.core';
import type {ParticleEmitter} from '../src/ParticleEmitter';
import {ParticleSystem, ScalingMode} from '../src/ParticleSystem';
import {QuarksLoader} from '../src/QuarksLoader';
import {RenderMode} from '../src/VFXBatch';
import {emptyMeta} from './internals';

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

function system(scalingMode: ScalingMode | undefined, scale: number, worldSpace = true) {
    const ps = new ParticleSystem({
        scene,
        duration: 1,
        looping: false,
        startLife: new ConstantValue(10),
        startSpeed: new ConstantValue(4),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), probability: 1, interval: 0, cycle: 1}],
        shape: new ConeEmitter({radius: 0, angle: 0}),
        worldSpace,
        scalingMode,
    });
    ps.emitter.scaling = new BVector3(scale, scale, scale);
    ps.emitter.computeWorldMatrix(true);
    return ps;
}

const speedOf = (ps: ParticleSystem) => ps.particles[0].velocity.length();

/** A world-space system scaled by `own` under a parent scaled by `parentScale` and turned about y. */
function nested(scalingMode: ScalingMode | undefined, own: number, parentScale: number, worldSpace = true) {
    const ps = system(scalingMode, own, worldSpace);
    ps.emitterShape = new ConeEmitter({radius: 1, thickness: 0, angle: 0});
    const parent = new TransformNode('parent', scene);
    parent.scaling = new BVector3(parentScale, parentScale, parentScale);
    parent.rotation = new BVector3(0, Math.PI / 2, 0);
    parent.position = new BVector3(5, 0, 0);
    ps.emitter.parent = parent;
    ps.emitter.computeWorldMatrix(true);
    return ps;
}

const radiusOf = (ps: ParticleSystem) => {
    const p = ps.particles[0].position;
    // The cone's base is the emitter's xy plane; the parent turns it to face x, centred at x = 5.
    return Math.hypot(p.y, p.z);
};

describe('scaling mode', () => {
    it("is 'local' by default, as in Unity, and reads anything else as 'local'", () => {
        expect(system(undefined, 1).scalingMode).toBe('local');
        expect(system('bogus' as ScalingMode, 1).scalingMode).toBe('local');
    });

    it("'local' scales the shape, size and forces by the emitter's own scale, not its parents'", () => {
        const ps = nested('local', 0.5, 4);
        ps.update(1 / 60);
        expect(radiusOf(ps)).toBeCloseTo(0.5);
        // Measured in Unity 6: a start speed of 4 under its own scale of 0.5, in
        // world space, is 2 in 'local', 8 in 'hierarchy' (a parent of 4) and 4 in 'shape'.
        expect(speedOf(ps)).toBeCloseTo(2);
        expect(ps.particles[0].size.x).toBeCloseTo(0.5);
        expect(ps.motionScale).toBeCloseTo(0.5);
    });

    it("'hierarchy' scales them by the whole world scale", () => {
        const ps = nested('hierarchy', 0.5, 4);
        ps.update(1 / 60);
        expect(radiusOf(ps)).toBeCloseTo(2);
        expect(speedOf(ps)).toBeCloseTo(8);
        expect(ps.particles[0].size.x).toBeCloseTo(2);
        expect(ps.motionScale).toBeCloseTo(2);
    });

    it("'shape' scales the shape alone by the whole world scale", () => {
        const ps = nested('shape', 0.5, 4);
        ps.update(1 / 60);
        expect(radiusOf(ps)).toBeCloseTo(2);
        expect(speedOf(ps)).toBeCloseTo(4);
        expect(ps.particles[0].size.x).toBeCloseTo(1);
        expect(ps.motionScale).toBe(1);
    });

    it("scales a local-space particle's start speed with the emitter, as its whole frame is", () => {
        const ps = nested('hierarchy', 0.5, 4, false);
        ps.update(1 / 60);
        // Stored in the emitter's frame: the frame's scale of 2 makes it 8 in the world, as a
        // world-space particle starts.
        expect(speedOf(ps)).toBeCloseTo(4);
    });

    it('starts a world-space particle along each axis by the scale, as Unity does', () => {
        // Measured in Unity 6: a node turned (20, 30, 10) and scaled (1.3, 1, 0.9),
        // a cone of no opening sending particles along its +z at 4: 0.9 × 4 in 'local' and
        // 'hierarchy', 4 in 'shape'.
        for (const [mode, speed] of [
            ['local', 3.6],
            ['hierarchy', 3.6],
            ['shape', 4],
        ] as const) {
            const ps = system(mode, 1);
            ps.emitterShape = new ConeEmitter({radius: 0.5, thickness: 0, angle: 0});
            ps.emitter.rotationQuaternion = BQuaternion.FromEulerAngles(
                (20 * Math.PI) / 180,
                (30 * Math.PI) / 180,
                (10 * Math.PI) / 180
            );
            ps.emitter.scaling = new BVector3(1.3, 1, 0.9);
            ps.emitter.computeWorldMatrix(true);
            ps.update(1 / 60);
            expect([mode, speedOf(ps)]).toEqual([mode, expect.closeTo(speed, 4)]);
        }
    });

    it('keeps the position and rotation of the whole hierarchy in every mode', () => {
        for (const mode of ['local', 'hierarchy', 'shape'] as const) {
            const ps = nested(mode, 0.5, 4);
            ps.update(1 / 60);
            const {position, velocity} = ps.particles[0];
            // The parent's quarter turn about y sends the emitter's +z (the cone's axis) to +x.
            expect(Math.abs(position.x - 5)).toBeLessThan(0.2);
            expect(velocity.x).toBeGreaterThan(0);
            expect(Math.hypot(velocity.y, velocity.z)).toBeCloseTo(0);
        }
    });

    it('gives the emitter matrix the scale the mode applies, in local space too', () => {
        const scaleOf = (ps: ParticleSystem) => {
            const e = ps.emitter.matrixWorld.elements;
            return Math.hypot(e[0], e[1], e[2]);
        };
        expect(scaleOf(nested('local', 0.5, 4, false))).toBeCloseTo(0.5);
        expect(scaleOf(nested('hierarchy', 0.5, 4, false))).toBeCloseTo(2);
        const shape = nested('shape', 0.5, 4, false);
        expect(scaleOf(shape)).toBeCloseTo(1);
        expect(shape.emitter.shapeScale.x).toBeCloseTo(2);
        shape.update(1 / 60);
        // In local space the particle keeps the scaled shape position, and its own size and speed.
        const p = shape.particles[0];
        expect(Math.hypot(p.position.x, p.position.y)).toBeCloseTo(2);
        expect(speedOf(shape)).toBeCloseTo(4);
        expect(p.size.x).toBeCloseTo(1);
        expect(shape.motionScale).toBe(1);
    });

    it('follows a change of mode or of the scale at once', () => {
        const ps = nested('local', 0.5, 4, false);
        const scaleOf = () => Math.hypot(...Array.from(ps.emitter.matrixWorld.elements.slice(0, 3)));
        expect(scaleOf()).toBeCloseTo(0.5);
        ps.scalingMode = 'hierarchy';
        expect(scaleOf()).toBeCloseTo(2);
        ps.emitter.scaling = new BVector3(0.25, 0.25, 0.25);
        ps.emitter.computeWorldMatrix(true);
        expect(scaleOf()).toBeCloseTo(1);
    });

    it('stays finite on an emitter of zero scale', () => {
        for (const mode of ['local', 'shape'] as const) {
            const ps = nested(mode, 1, 0);
            for (const v of ps.emitter.matrixWorld.elements) expect(Number.isFinite(v)).toBe(true);
        }
    });

    /** Where the matrix sends `p`, as [x, y, z]. */
    const send = (ps: ParticleSystem, p: [number, number, number]) => {
        const v = new Vector3(...p).applyMatrix4(ps.emitter.matrixWorld);
        return [v.x, v.y, v.z];
    };
    /** Where Babylon's own world matrix sends `p`. */
    const sendBabylon = (ps: ParticleSystem, p: [number, number, number]) => {
        const v = BVector3.TransformCoordinates(new BVector3(...p), ps.emitter.getWorldMatrix());
        return [v.x, v.y, v.z];
    };

    it('mirrors on the axis the emitter is mirrored on, in every mode', () => {
        for (const own of [
            [1, -1, 1],
            [1, 1, -1],
            [-1, -1, 1],
            [-2, 1, 1],
        ]) {
            for (const mode of ['local', 'hierarchy', 'shape'] as const) {
                const ps = system(mode, 1);
                const parent = new TransformNode('parent', scene);
                parent.rotation = new BVector3(0.3, 0.5, 0.1);
                ps.emitter.parent = parent;
                ps.emitter.scaling = new BVector3(own[0], own[1], own[2]);
                ps.emitter.computeWorldMatrix(true);
                const expected = sendBabylon(ps, [1, 2, 3]);
                if (mode === 'shape') {
                    // The turn alone; the shape takes the scale, mirror included (refreshed with
                    // the emitter matrix).
                    void ps.emitter.matrixWorld;
                    const shapeScale = ps.emitter.shapeScale;
                    expect([shapeScale.x, shapeScale.y, shapeScale.z]).toEqual(own.map((v) => expect.closeTo(v, 5)));
                    expect(ps.emitter.matrixWorld.determinant()).toBeCloseTo(1, 5);
                    const got = send(ps, [shapeScale.x, 2 * shapeScale.y, 3 * shapeScale.z]);
                    for (let i = 0; i < 3; i++) expect(got[i]).toBeCloseTo(expected[i], 5);
                } else {
                    const got = send(ps, [1, 2, 3]);
                    for (let i = 0; i < 3; i++) expect(got[i]).toBeCloseTo(expected[i], 5);
                }
            }
        }
    });

    it("leaves a mirrored parent's mirror out of 'local', as its scale, as Unity does", () => {
        const ps = system('local', 1);
        const parent = new TransformNode('parent', scene);
        parent.scaling = new BVector3(3, -3, 3);
        ps.emitter.parent = parent;
        ps.emitter.computeWorldMatrix(true);
        expect(send(ps, [1, 2, 3])).toEqual([expect.closeTo(1, 5), expect.closeTo(2, 5), expect.closeTo(3, 5)]);
        expect(ps.emitter.mirrored).toBe(false);
    });

    it('keeps the turn of an emitter flattened on one axis', () => {
        for (const mode of ['local', 'shape'] as const) {
            const ps = system(mode, 1);
            const parent = new TransformNode('parent', scene);
            parent.scaling = new BVector3(2, 2, 2);
            ps.emitter.parent = parent;
            ps.emitter.rotation = new BVector3(0, Math.PI / 4, 0);
            ps.emitter.scaling = new BVector3(1, 0, 1);
            ps.emitter.computeWorldMatrix(true);
            // Local x turns 45° about y, to (√½, 0, −√½), whatever the y axis is scaled to.
            const x = send(ps, [1, 0, 0]);
            expect(x[0]).toBeCloseTo(Math.SQRT1_2, 5);
            expect(x[2]).toBeCloseTo(-Math.SQRT1_2, 5);
        }
        // A parent flattened to 0 leaves 'shape' a whole basis, square to what is left.
        const ps = system('shape', 1);
        const parent = new TransformNode('parent', scene);
        parent.scaling = new BVector3(1, 0, 1);
        ps.emitter.parent = parent;
        ps.emitter.computeWorldMatrix(true);
        expect(send(ps, [0, 1, 0]).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 1, 0]);
    });

    it('starts particles moving the way the mirrored shape sends them', () => {
        const ps = system('local', 1);
        ps.emitterShape = new ConeEmitter({radius: 0, angle: 0});
        ps.emitter.scaling = new BVector3(1, 1, -1);
        ps.emitter.computeWorldMatrix(true);
        ps.update(1 / 60);
        // The cone sends particles along +z; the mirror along -z, and so the position.
        expect(ps.particles[0].velocity.z).toBeCloseTo(-4);
        expect(ps.particles[0].position.z).toBeLessThan(0);
    });

    it('scales ForceOverLife with the motion, not LimitSpeedOverLife, as Unity does', () => {
        const make = (mode: ScalingMode, limit: boolean) => {
            const ps = system(mode, 0.5);
            ps.startSpeed = new ConstantValue(0);
            ps.addBehavior(new ForceOverLife(new ConstantValue(0), new ConstantValue(-10), new ConstantValue(0)));
            if (limit) ps.addBehavior(new LimitSpeedOverLife(new PiecewiseBezier([[new Bezier(3, 3, 3, 3), 0]]), 1));
            // Half a second alone; a whole one with the limit, so the force outruns it either way.
            for (let i = 0; i < (limit ? 60 : 30); i++) ps.update(1 / 60);
            return speedOf(ps);
        };
        // Half a second of the force: 5 in world units, half that when scaled.
        expect(make('shape', false)).toBeCloseTo(5, 1);
        expect(make('hierarchy', false)).toBeCloseTo(2.5, 1);
        expect(make('local', false)).toBeCloseTo(2.5, 1);
        // The limit holds at 3 in world units whatever the scale.
        expect(make('shape', true)).toBeCloseTo(3, 1);
        expect(make('hierarchy', true)).toBeCloseTo(3, 1);
    });

    it('scales a world force in a local-space system too, but never gravity, as Unity does', () => {
        // World speed after half a second of a 10 down force (or gravity), emitter at half scale.
        const make = (worldSpace: boolean, scaleWithEmitter: boolean) => {
            const ps = system('hierarchy', 0.5, worldSpace);
            ps.startSpeed = new ConstantValue(0);
            ps.addBehavior(
                new ForceOverLife(
                    new ConstantValue(0),
                    new ConstantValue(-10),
                    new ConstantValue(0),
                    'world',
                    false,
                    scaleWithEmitter
                )
            );
            for (let i = 0; i < 30; i++) ps.update(1 / 60);
            // A local-space particle's velocity is in the emitter's units, half a world unit each.
            return speedOf(ps) * (worldSpace ? 1 : 0.5);
        };
        // Measured in Unity 6: a force reaches half the speed under a half-scale emitter in either
        // simulation space; gravity reaches the full speed.
        expect(make(true, true)).toBeCloseTo(2.5, 1);
        expect(make(false, true)).toBeCloseTo(2.5, 1);
        expect(make(true, false)).toBeCloseTo(5, 1);
        expect(make(false, false)).toBeCloseTo(5, 1);
    });

    it('leaves the motion of local-space systems to the emitter matrix', () => {
        const ps = system('hierarchy', 0.5, false);
        ps.update(1 / 60);
        expect(ps.motionScale).toBe(1);
        expect(speedOf(ps)).toBeCloseTo(4);
    });

    it('round-trips through JSON and clone, written only when not the default', () => {
        const meta = emptyMeta();
        for (const mode of ['hierarchy', 'shape'] as const) {
            const ps = system(mode, 1);
            const json = ps.toJSON(meta);
            expect(json.scalingMode).toBe(mode);
            expect(ParticleSystem.fromJSON(json, meta, scene).scalingMode).toBe(mode);
            expect(ps.clone().scalingMode).toBe(mode);
        }
        expect('scalingMode' in system('local', 1).toJSON(meta)).toBe(false);
    });
});

describe('scaling mode in files', () => {
    const file = (quarksFormat: number | undefined, scalingMode?: ScalingMode) => {
        const ps = system(scalingMode, 1);
        const meta = emptyMeta();
        const json = ps.toJSON(meta);
        return {
            metadata: quarksFormat === undefined ? {} : {quarksFormat},
            object: {
                uuid: 'e',
                type: 'ParticleEmitter',
                name: 'e',
                matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
                ps: json,
            },
        };
    };
    const loaded = (document: object) =>
        ((new QuarksLoader(scene).parse(document) as ParticleEmitter).system as unknown as ParticleSystem).scalingMode;

    it("reads a system in a file from before format 2 as 'hierarchy', which keeps its look", () => {
        expect(loaded(file(undefined))).toBe('hierarchy');
        expect(loaded(file(1))).toBe('hierarchy');
        expect(loaded(file(1, 'shape'))).toBe('hierarchy');
    });

    it('reads a format 2 file as written', () => {
        expect(loaded(file(2))).toBe('local');
        expect(loaded(file(2, 'shape'))).toBe('shape');
    });
});

describe('scaling mode with sub emitters', () => {
    it("'hierarchy' takes the scale from the emitter, not a parent particle's velocity", () => {
        const parent = system('local', 1);
        parent.looping = true;
        parent.startSpeed = new ConstantValue(20);
        const child = system('hierarchy', 1);
        child.onlyUsedByOther = true;
        child.startSpeed = new ConstantValue(2);
        // Turned off the emission axis, so the velocity basis is well defined.
        parent.addBehavior(new ForceOverLife(new ConstantValue(600), new ConstantValue(0), new ConstantValue(0)));
        parent.addBehavior(new EmitSubParticleSystem(parent, true, child.emitter, SubParticleEmitMode.Frame));
        for (let i = 0; i < 10; i++) {
            parent.update(1 / 60);
            child.update(1 / 60);
        }
        expect(child.particleNum).toBeGreaterThan(0);
        // Before, the parent particle's speed scaled it, to tens.
        expect(speedOf(child)).toBeCloseTo(2, 1);
    });

    it("sizes and speeds a sub emission by the parent particle's frame, not the sub emitter's scale", () => {
        const parent = system('local', 1);
        parent.looping = true;
        parent.startSpeed = new ConstantValue(20);
        const child = system('local', 2);
        child.onlyUsedByOther = true;
        child.startSpeed = new ConstantValue(2);
        parent.addBehavior(new ForceOverLife(new ConstantValue(600), new ConstantValue(0), new ConstantValue(0)));
        parent.addBehavior(new EmitSubParticleSystem(parent, true, child.emitter, SubParticleEmitMode.Frame));
        for (let i = 0; i < 10; i++) {
            parent.update(1 / 60);
            child.update(1 / 60);
        }
        expect(child.particleNum).toBeGreaterThan(0);
        expect(speedOf(child)).toBeCloseTo(2, 1);
        expect(child.particles[0].size.x).toBeCloseTo(1, 1);
    });
});

describe('scaling mode in a skewed hierarchy and along a stretched emitter', () => {
    /**
     * Measured in Unity 6: a root scaled (1, 0.25, 4), a child turned (30, 0, 0) and scaled
     * (2, 1, 1), the emitter turned (0, 40, 10) under it. The emitter's world matrix is skewed;
     * Unity turns it by `transform.rotation` and scales it by `transform.lossyScale`.
     */
    const UNITY_ROTATION = new BQuaternion(0.2710782, 0.307911783, 0.167293429, 0.8965043);
    const UNITY_LOSSY_SCALE = [2.04427624, 1.58222342, 2.62350035];
    const UNITY_LOCAL_TO_WORLD_X = [1.508813, 0.116724, -1.845557];

    function skewed(mode: ScalingMode, own = 1) {
        const ps = system(mode, own, false);
        const root = new TransformNode('root', scene);
        root.scaling = new BVector3(1, 0.25, 4);
        const child = new TransformNode('child', scene);
        child.parent = root;
        child.rotationQuaternion = new BQuaternion(0.258819073, 0, 0, 0.9659259);
        child.scaling = new BVector3(2, 1, 1);
        ps.emitter.parent = child;
        ps.emitter.rotationQuaternion = new BQuaternion(0.0298090167, 0.340718657, 0.0818996057, 0.9361168);
        ps.emitter.computeWorldMatrix(true);
        return ps;
    }

    /** The emitter matrix's axis `axis`, scaled to `length`, against Unity's turn. */
    function expectAxes(ps: ParticleSystem, length: number) {
        const e = ps.emitter.matrixWorld.elements;
        const turn = new Matrix();
        UNITY_ROTATION.toRotationMatrix(turn);
        for (let axis = 0; axis < 3; axis++) {
            for (let c = 0; c < 3; c++) {
                expect(e[axis * 4 + c]).toBeCloseTo(turn.m[axis * 4 + c] * length, 5);
            }
        }
    }

    it("turns and scales the shape as Unity's rotation and lossy scale, not the skewed axes", () => {
        const ps = skewed('shape');
        // The same world matrix as Unity's: a skewed one.
        const world = ps.emitter.getWorldMatrix().m;
        UNITY_LOCAL_TO_WORLD_X.forEach((value, c) => expect(world[c]).toBeCloseTo(value, 5));
        expectAxes(ps, 1);
        const shapeScale = ps.emitter.shapeScale;
        [shapeScale.x, shapeScale.y, shapeScale.z].forEach((value, axis) =>
            expect(value).toBeCloseTo(UNITY_LOSSY_SCALE[axis], 5)
        );
    });

    it("turns a skewed 'local' emitter the same way, at its own scale", () => {
        expectAxes(skewed('local', 0.5), 0.5);
    });

    it('sends particles of a stretched emitter the way Unity does in Shape mode, at their speed', () => {
        // Measured in Unity 6 on an emitter scaled (2, 1, 10): a 45° cone's particle at
        // (0.747, 0.930) on the stretched rim starts along (0.074, 0.092, 0.993), its direction
        // scaled by the emitter and set back to its speed.
        const ps = system('shape', 1, false);
        ps.startSpeed = new ConstantValue(1);
        ps.emitterShape = new ConeEmitter({radius: 1, thickness: 0, angle: Math.PI / 4});
        ps.emissionBursts = [{time: 0, count: new ConstantValue(8), probability: 1, interval: 0, cycle: 1}];
        ps.emitter.scaling = new BVector3(2, 1, 10);
        ps.emitter.computeWorldMatrix(true);
        ps.update(1 / 60);
        expect(ps.particleNum).toBe(8);
        const sent = (x: number, y: number) => {
            // The rim point the particle left from, before the stretch, and the cone's way there.
            const angle = Math.atan2(y, x / 2);
            const v = new Vector3(Math.cos(angle) * 2, Math.sin(angle), 10);
            return v.normalize();
        };
        const unity = sent(0.747, 0.93);
        expect([unity.x, unity.y, unity.z].map((n) => Math.round(n * 1000) / 1000)).toEqual([0.074, 0.092, 0.993]);
        for (const p of ps.particles.slice(0, ps.particleNum)) {
            const expected = sent(p.position.x, p.position.y);
            expect(p.velocity.length()).toBeCloseTo(1, 5);
            expect(p.velocity.distanceTo(expected)).toBeLessThan(1e-4);
        }
    });

    it("picks a mesh particle's axis from the stretched direction, as Unity does", () => {
        // Measured in Unity 6, same emitter: a particle starting along (-0.185, -0.033, 0.982)
        // turns about (0.176, -0.984, 0), square to Z and to that direction.
        const ps = system('shape', 1, false);
        ps.renderMode = RenderMode.Mesh;
        ps.rotationAxis = 'emission';
        ps.startRotation = new ConstantValue(0.5);
        ps.emitterShape = new ConeEmitter({radius: 1, thickness: 0, angle: Math.PI / 4});
        ps.emitter.scaling = new BVector3(2, 1, 10);
        ps.emitter.computeWorldMatrix(true);
        ps.update(1 / 60);
        const p = ps.particles[0];
        const v = p.velocity.clone().normalize();
        const axis = new Vector3(-v.y, v.x, 0).normalize();
        expect(p.rotationAxis!.distanceTo(axis)).toBeLessThan(1e-5);
    });
});

describe('scaling mode under a parent scaled to 0', () => {
    /**
     * Measured in Unity 6: a root at (1, 2, 3) turned (0, 90, 0) and scaled 0, the emitter at
     * (0, 0, 1) below it, turned (90, 0, 0) and scaled 0.5. Its `transform.rotation` is still
     * (90, 90, 0): its local x, y and z point along these world axes, in every scaling mode, and
     * the system sits at the root's position.
     */
    const UNITY_AXES = [
        [0, 0, -1],
        [1, 0, 0],
        [0, -1, 0],
    ];
    const UNITY_POSITION = [1, 2, 3];
    /** The cone's +z start direction in the world, at the length the mode scales it to. */
    const UNITY_START_DIRECTION = [0, -1, 0];

    function flattened(mode: ScalingMode, worldSpace = true) {
        const ps = system(mode, 0.5, worldSpace);
        ps.startSpeed = new ConstantValue(1);
        const root = new TransformNode('root', scene);
        root.position = new BVector3(1, 2, 3);
        root.rotationQuaternion = BQuaternion.RotationYawPitchRoll(Math.PI / 2, 0, 0);
        root.scaling = new BVector3(0, 0, 0);
        ps.emitter.parent = root;
        ps.emitter.position = new BVector3(0, 0, 1);
        ps.emitter.rotationQuaternion = BQuaternion.RotationYawPitchRoll(0, Math.PI / 2, 0);
        ps.emitter.computeWorldMatrix(true);
        return ps;
    }

    it("keeps the emitter's turn in 'local' and 'shape', at the length each mode gives", () => {
        for (const [mode, length] of [
            ['local', 0.5],
            ['shape', 1],
        ] as const) {
            const e = flattened(mode).emitter.matrixWorld.elements;
            UNITY_AXES.forEach((direction, axis) =>
                direction.forEach((value, c) => expect(e[axis * 4 + c]).toBeCloseTo(value * length, 5))
            );
            UNITY_POSITION.forEach((value, c) => expect(e[12 + c]).toBeCloseTo(value, 5));
        }
    });

    it('sends world-space particles the way the emitter is turned', () => {
        for (const mode of ['local', 'shape'] as const) {
            const ps = flattened(mode);
            ps.update(1 / 60);
            const v = ps.particles[0].velocity.clone().normalize();
            UNITY_START_DIRECTION.forEach((value, c) => expect(v.getComponent(c)).toBeCloseTo(value, 5));
        }
    });

    it("keeps the emitter's own mirroring", () => {
        const ps = flattened('local');
        ps.emitter.scaling = new BVector3(-0.5, 0.5, 0.5);
        ps.emitter.computeWorldMatrix(true);
        const e = ps.emitter.matrixWorld.elements;
        UNITY_AXES[0].forEach((value, c) => expect(e[c]).toBeCloseTo(-value * 0.5, 5));
        UNITY_AXES[1].forEach((value, c) => expect(e[4 + c]).toBeCloseTo(value * 0.5, 5));
    });
});

describe('scaling mode under mirrored nodes', () => {
    /**
     * Measured in Unity 6: three nodes at (0.5, 0, 0), (-0.3, 0.2, 0.1) and
     * (0.2, -0.4, 0.3), turned (10, 25, -40), (-35, 60, 15) and (70, -20, 30), scaled as each case
     * says, the system on the last, in world space. Its shape sends one particle from P along D's
     * +z at a speed of 1: where it was born and how it moves, in the world. Unity turns the system
     * by `transform.rotation`, which is a rotation under any mirror (each node's own turn seen
     * through the mirror of the scale above it), and scales it by the node's own scale in Local,
     * the shape by the signed lossy scale in Shape (a Local system under a root scaled
     * (-0.891, 0.891, 1.06) is the mirrored copy of an effect's other half).
     */
    const P = [0.7, 0.3, 0.2] as const;
    const D = [30, 40, 0];
    const POSITIONS = [
        [0.5, 0, 0],
        [-0.3, 0.2, 0.1],
        [0.2, -0.4, 0.3],
    ];
    const TURNS = [
        [10, 25, -40],
        [-35, 60, 15],
        [70, -20, 30],
    ];
    type Placed = {at: number[]; velocity: number[]};
    const CASES: {name: string; scales: number[][]; local: Placed; shape: Placed}[] = [
        {
            name: 'none',
            scales: [
                [1.2, 0.8, 1.1],
                [1, 1, 1],
                [1.3, 1, 0.9],
            ],
            local: {at: [1.6603, -0.0974, -0.4278], velocity: [0.3638, -0.5453, -0.837]},
            shape: {at: [1.6695, -0.1051, -0.4146], velocity: [0.325, -0.533, -0.7812]},
        },
        {
            name: 'rootX',
            scales: [
                [-1.2, 0.8, 1.1],
                [1, 1, 1],
                [1.3, 1, 0.9],
            ],
            local: {at: [0.5581, -0.6404, 0.5956], velocity: [-0.7011, -0.7928, 0.1007]},
            shape: {at: [0.376, 1.1602, 0.4348], velocity: [-0.8135, 0.5807, -0.0337]},
        },
        {
            name: 'rootY',
            scales: [
                [1.2, -0.8, 1.1],
                [1, 1, 1],
                [1.3, 1, 0.9],
            ],
            local: {at: [0.6667, -0.9285, -0.7372], velocity: [0.5274, -0.9225, 0.0317]},
            shape: {at: [0.7364, -1.2072, -0.1938], velocity: [0.4227, -0.4176, -0.8043]},
        },
        {
            name: 'rootZ',
            scales: [
                [1.2, 0.8, -1.1],
                [1, 1, 1],
                [1.3, 1, 0.9],
            ],
            local: {at: [1.5627, 0.2571, -0.4616], velocity: [0.7828, 0.3209, 0.6438]},
            shape: {at: [1.5571, -0.0582, -0.6555], velocity: [0.7158, -0.696, 0.0568]},
        },
        {
            name: 'rootXY',
            scales: [
                [-1.2, -0.8, 1.1],
                [1, 1, 1],
                [1.3, 1, 0.9],
            ],
            local: {at: [1.166, 0.4608, -0.0845], velocity: [0.7828, 0.3209, 0.6438]},
            shape: {at: [-0.5571, 0.0582, 0.6554], velocity: [-0.7158, 0.696, -0.0568]},
        },
        {
            name: 'rootXYZ',
            scales: [
                [-1.2, -0.8, -1.1],
                [1, 1, 1],
                [1.3, 1, 0.9],
            ],
            local: {at: [1.1504, 0.1534, -0.2937], velocity: [0.3638, -0.5453, -0.837]},
            shape: {at: [-0.6695, 0.105, 0.4146], velocity: [-0.325, 0.533, 0.7812]},
        },
        {
            name: 'midX',
            scales: [
                [1.2, 0.8, 1.1],
                [-1, 1, 1],
                [1.3, 1, 0.9],
            ],
            local: {at: [0.3018, -0.2557, -0.4749], velocity: [-0.7129, -0.7544, -0.23]},
            shape: {at: [1.7156, -0.1918, 0.7414], velocity: [0.3937, -0.66, 0.6399]},
        },
        {
            name: 'rootXmidZ',
            scales: [
                [-1.2, 0.8, 1.1],
                [1, 1, -1],
                [1.3, 1, 0.9],
            ],
            local: {at: [0.954, -0.2275, 0.5783], velocity: [0.3469, 0.8772, 0.4903]},
            shape: {at: [0.3026, -0.8366, -1.1536], velocity: [-0.8108, 0.0392, -0.584]},
        },
        {
            name: 'rootXleafY',
            scales: [
                [-1.2, 0.8, 1.1],
                [1, 1, 1],
                [1.3, -1, 0.9],
            ],
            local: {at: [0.1621, -0.725, 0.1529], velocity: [-0.0411, -0.6521, 0.8386]},
            shape: {at: [-0.039, 1.0718, -0.0294], velocity: [-0.1798, 0.7158, 0.6748]},
        },
        {
            name: 'leafX',
            scales: [
                [1.2, 0.8, 1.1],
                [1, 1, 1],
                [-1.3, 1, 0.9],
            ],
            local: {at: [0.3124, -0.4, 0.757], velocity: [-0.7081, -0.7859, 0.1053]},
            shape: {at: [0.3261, -0.4067, 0.7662], velocity: [-0.6536, -0.7527, 0.079]},
        },
    ];
    const DEG = Math.PI / 180;
    const turn = (t: number[]) => BQuaternion.FromEulerAngles(t[0] * DEG, t[1] * DEG, t[2] * DEG);

    function placed(mode: ScalingMode, scales: number[][]) {
        let parent: TransformNode | null = null;
        for (let i = 0; i < 2; i++) {
            const node: TransformNode = new TransformNode(`n${i}`, scene);
            node.parent = parent;
            node.position = BVector3.FromArray(POSITIONS[i]);
            node.rotationQuaternion = turn(TURNS[i]);
            node.scaling = BVector3.FromArray(scales[i]);
            parent = node;
        }
        const ps = system(mode, 1);
        ps.emitter.parent = parent;
        ps.emitter.position = BVector3.FromArray(POSITIONS[2]);
        ps.emitter.rotationQuaternion = turn(TURNS[2]);
        ps.emitter.scaling = BVector3.FromArray(scales[2]);
        ps.emitter.computeWorldMatrix(true);
        return ps;
    }

    /** The shape's +z, the way it sends the particle, in the node's space. */
    function direction(): Vector3 {
        const d = BVector3.Forward(false).applyRotationQuaternion(turn(D));
        return new Vector3(d.x, d.y, d.z);
    }

    /** Where the emitter matrix puts `p`, and `v` as a direction (no translation). */
    function through(ps: ParticleSystem, p: Vector3, v: Vector3): {at: Vector3; velocity: Vector3} {
        const m = ps.emitter.matrixWorld;
        const origin = new Vector3().applyMatrix4(m);
        return {at: p.clone().applyMatrix4(m), velocity: v.clone().applyMatrix4(m).sub(origin)};
    }

    function expectPlaced(got: {at: Vector3; velocity: Vector3}, unity: Placed, name: string): void {
        for (let c = 0; c < 3; c++) {
            expect([name, got.at.getComponent(c)]).toEqual([name, expect.closeTo(unity.at[c], 3)]);
            expect([name, got.velocity.getComponent(c)]).toEqual([name, expect.closeTo(unity.velocity[c], 3)]);
        }
    }

    it("'local': the shape and the motion by Unity's turn and the node's own scale, not a parent's mirror", () => {
        for (const c of CASES) {
            const ps = placed('local', c.scales);
            expectPlaced(through(ps, new Vector3(...P), direction()), c.local, c.name);
        }
    });

    it("'shape': the turn alone, the shape scaled by the signed lossy scale", () => {
        for (const c of CASES) {
            const ps = placed('shape', c.scales);
            // Refreshed with the emitter matrix.
            void ps.emitter.matrixWorld;
            const scale = ps.emitter.shapeScale;
            const d = direction().multiply(scale).normalize();
            expectPlaced(through(ps, new Vector3(...P).multiply(scale), d), c.shape, c.name);
        }
    });
});
