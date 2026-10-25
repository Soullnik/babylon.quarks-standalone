import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
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

    it("'local' scales the shape, size and speed by the emitter's own scale, not its parents'", () => {
        const ps = nested('local', 0.5, 4);
        ps.update(1 / 60);
        expect(radiusOf(ps)).toBeCloseTo(0.5);
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
                const got = send(ps, [1, 2, 3]);
                if (mode === 'shape') {
                    // Unit axes: only the direction of each axis, mirroring included, is kept.
                    const unit = sendBabylon(ps, [1 / Math.abs(own[0]), 2, 3]);
                    for (let i = 0; i < 3; i++) expect(got[i]).toBeCloseTo(unit[i], 5);
                } else {
                    for (let i = 0; i < 3; i++) expect(got[i]).toBeCloseTo(expected[i], 5);
                }
            }
        }
    });

    it("keeps a mirrored parent's mirroring but not its scale in 'local'", () => {
        const ps = system('local', 1);
        const parent = new TransformNode('parent', scene);
        parent.scaling = new BVector3(3, -3, 3);
        ps.emitter.parent = parent;
        ps.emitter.computeWorldMatrix(true);
        expect(send(ps, [1, 2, 3])).toEqual([expect.closeTo(1, 5), expect.closeTo(-2, 5), expect.closeTo(3, 5)]);
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

    it('scales ForceOverLife and LimitSpeedOverLife with the motion', () => {
        const make = (mode: ScalingMode) => {
            const ps = system(mode, 0.5);
            ps.startSpeed = new ConstantValue(0);
            ps.addBehavior(new ForceOverLife(new ConstantValue(0), new ConstantValue(-10), new ConstantValue(0)));
            ps.addBehavior(new LimitSpeedOverLife(new PiecewiseBezier([[new Bezier(3, 3, 3, 3), 0]]), 1));
            for (let i = 0; i < 120; i++) ps.update(1 / 60);
            return speedOf(ps);
        };
        // Gravity pulls until the limit holds it: 3 in world units, half that when scaled.
        const shape = make('shape');
        expect(shape).toBeGreaterThan(2.5);
        expect(shape).toBeLessThan(4);
        expect(make('hierarchy')).toBeCloseTo(shape / 2, 0);
        expect(make('local')).toBeCloseTo(shape / 2, 0);
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
            expect(ParticleSystem.fromJSON(json, meta, {}, scene).scalingMode).toBe(mode);
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
