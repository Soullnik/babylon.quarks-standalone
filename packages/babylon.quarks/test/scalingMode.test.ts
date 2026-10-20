import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {Scene} from '@babylonjs/core/scene';
import {
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    EmitSubParticleSystem,
    ForceOverLife,
    LimitSpeedOverLife,
    SubParticleEmitMode,
    Vector4,
} from 'quarks.core';
import {ParticleSystem, ScalingMode} from '../src/ParticleSystem';

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

describe('scaling mode', () => {
    it("'shape' (default) keeps world-space speeds in world units", () => {
        const ps = system(undefined, 0.5);
        expect(ps.scalingMode).toBe('shape');
        ps.update(1 / 60);
        expect(speedOf(ps)).toBeCloseTo(4);
    });

    it("'hierarchy' scales world-space start speed with the emitter", () => {
        const ps = system('hierarchy', 0.5);
        ps.update(1 / 60);
        expect(speedOf(ps)).toBeCloseTo(2);
        expect(ps.motionScale).toBeCloseTo(0.5);
    });

    it("'hierarchy' scales ForceOverLife and LimitSpeedOverLife", () => {
        const make = (mode: ScalingMode) => {
            const ps = system(mode, 0.5);
            ps.startSpeed = new ConstantValue(0);
            ps.addBehavior(new ForceOverLife(new ConstantValue(0), new ConstantValue(-10), new ConstantValue(0)));
            ps.addBehavior(new LimitSpeedOverLife(new ConstantValue(3) as any, 1));
            for (let i = 0; i < 120; i++) ps.update(1 / 60);
            return speedOf(ps);
        };
        // Gravity pulls until the limit holds it: 3 in world units, half that when scaled.
        const shape = make('shape');
        const hierarchy = make('hierarchy');
        expect(shape).toBeGreaterThan(2.5);
        expect(shape).toBeLessThan(4);
        expect(hierarchy).toBeCloseTo(shape / 2, 0);
    });

    it('leaves local-space systems as they were', () => {
        const ps = system('hierarchy', 0.5, false);
        ps.update(1 / 60);
        expect(ps.motionScale).toBe(1);
        expect(speedOf(ps)).toBeCloseTo(4);
    });

    it('round-trips through JSON and clone, written only when not the default', () => {
        const ps = system('hierarchy', 1);
        const meta = {geometries: {}, materials: {}, textures: {}} as any;
        const json = ps.toJSON(meta);
        expect(json.scalingMode).toBe('hierarchy');
        expect(ParticleSystem.fromJSON(json, meta, {}, scene).scalingMode).toBe('hierarchy');
        expect(ps.clone().scalingMode).toBe('hierarchy');
        expect('scalingMode' in system(undefined, 1).toJSON(meta)).toBe(false);
    });
});

describe('scaling mode with sub emitters', () => {
    it("'hierarchy' takes the scale from the emitter, not a parent particle's velocity", () => {
        const parent = system('shape', 1);
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
});
