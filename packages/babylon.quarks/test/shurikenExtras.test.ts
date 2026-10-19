import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    EmitSubParticleSystem,
    EmitterShape,
    Particle,
    PointEmitter,
    Quaternion,
    SubParticleEmitMode,
    Vector3,
    Vector4,
} from 'quarks.core';
import {ParticleSystem} from '../src/ParticleSystem';
import {RenderMode} from '../src/VFXBatch';

/** A cone with no angle and no radius: every particle leaves straight along +Z. */
const STRAIGHT_UP = () => new ConeEmitter({radius: 0, angle: 0});

describe('align to direction and sub emitter inheritance', () => {
    let engine: NullEngine;
    let scene: Scene;
    const STEP = 1 / 60;

    beforeEach(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
    });

    afterEach(() => {
        engine.dispose();
    });

    function makeSystem(parameters: Partial<ConstructorParameters<typeof ParticleSystem>[0]> = {}): ParticleSystem {
        return new ParticleSystem({
            scene,
            looping: false,
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
            startLife: new ConstantValue(2),
            startSpeed: new ConstantValue(1),
            startSize: new ConstantValue(0.5),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            shape: STRAIGHT_UP(),
            renderMode: RenderMode.BillBoard,
            texture: null,
            ...parameters,
        });
    }

    it('turns a mesh particle so its +Z follows the velocity, start rotation first', () => {
        const system = makeSystem({
            renderMode: RenderMode.Mesh,
            alignToDirection: true,
            shape: new ConeEmitter({radius: 0, angle: 0}),
        });
        // Send the particles along +X instead of +Z by turning the emitter.
        system.emitter.rotation.y = Math.PI / 2;
        system.emitter.computeWorldMatrix(true);
        system.update(STEP);
        const particle = system.particles[0];
        const rotation = particle.rotation as Quaternion;
        const forward = new Vector3(0, 0, 1).applyQuaternion(rotation);
        const direction = particle.velocity.clone().normalize();
        // Local space: the velocity is still +Z there, so the alignment is the identity turn.
        expect(forward.dot(direction)).toBeCloseTo(1, 5);
    });

    /** A shape that sends every particle along one local direction. */
    function along(x: number, y: number, z: number): EmitterShape {
        const shape = new PointEmitter();
        shape.initialize = (p: Particle) => {
            p.position.set(0, 0, 0);
            p.velocity.set(x, y, z).multiplyScalar(p.startSpeed);
        };
        return shape;
    }

    it('turns a billboard toward its direction in the emitter plane and leaves still particles alone', () => {
        // Straight along +Z: nothing to turn toward in the XY plane, the start rotation stays.
        const straight = makeSystem({alignToDirection: true, startRotation: new ConstantValue(0.25)});
        straight.update(STEP);
        expect(straight.particles[0].rotation).toBeCloseTo(0.25, 5);

        const still = makeSystem({alignToDirection: true, shape: along(1, 0, 0), startSpeed: new ConstantValue(0)});
        still.update(STEP);
        expect(still.particles[0].rotation).toBe(0);

        // Along +X: the quad's top turns a quarter clockwise to point that way, on top of the start rotation.
        const right = makeSystem({
            alignToDirection: true,
            shape: along(1, 0, 0),
            startRotation: new ConstantValue(0.25),
        });
        right.update(STEP);
        expect(right.particles[0].rotation).toBeCloseTo(0.25 - Math.PI / 2, 5);

        // Along +Y: the top already points that way.
        const up = makeSystem({alignToDirection: true, shape: along(0, 1, 0)});
        up.update(STEP);
        expect(up.particles[0].rotation).toBeCloseTo(0, 5);

        const off = makeSystem({shape: along(1, 0, 0)});
        off.update(STEP);
        expect(off.particles[0].rotation).toBe(0);
    });

    it('aligns a mesh particle with a sideways velocity', () => {
        const system = makeSystem({renderMode: RenderMode.Mesh, alignToDirection: true, shape: along(1, 0, 0)});
        system.update(STEP);
        const forward = new Vector3(0, 0, 1).applyQuaternion(system.particles[0].rotation as Quaternion);
        expect(forward.x).toBeCloseTo(1, 5);
        expect(forward.z).toBeCloseTo(0, 5);
    });

    it('round-trips alignToDirection through JSON only when set', () => {
        expect(makeSystem().toJSON().alignToDirection).toBeUndefined();
        const json = makeSystem({alignToDirection: true}).toJSON();
        expect(json.alignToDirection).toBe(true);
        const loaded = ParticleSystem.fromJSON(json, {textures: {}, materials: {}, geometries: {}}, {}, scene);
        expect(loaded.alignToDirection).toBe(true);
        expect(loaded.clone().alignToDirection).toBe(true);
    });

    function withSub(inherit: Array<'color' | 'size' | 'rotation' | 'lifetime'>) {
        const sub = makeSystem({
            onlyUsedByOther: true,
            startLife: new ConstantValue(4),
            startSize: new ConstantValue(0.1),
            startColor: new ConstantColor(new Vector4(0.5, 1, 1, 1)),
            startRotation: new ConstantValue(0.1),
            shape: new PointEmitter(),
        });
        const parent = makeSystem({
            startLife: new ConstantValue(2),
            startSize: new ConstantValue(3),
            startColor: new ConstantColor(new Vector4(0.5, 0.5, 1, 0.5)),
            startRotation: new ConstantValue(1),
            shape: new PointEmitter(),
        });
        parent.addBehavior(
            new EmitSubParticleSystem(parent, false, sub.emitter, SubParticleEmitMode.Birth, 1, inherit)
        );
        return {parent, sub};
    }

    it('lets sub emitted particles start from the parent colour, size, rotation and lifetime', () => {
        const {parent, sub} = withSub(['color', 'size', 'rotation', 'lifetime']);
        // Birth sub emission runs during the parent's step; the sub's own update is not needed to spawn.
        parent.update(STEP);
        parent.update(STEP);
        expect(sub.particleNum).toBeGreaterThan(0);
        const child = sub.particles[0];
        expect(child.color.toArray()).toEqual([0.25, 0.5, 1, 0.5]);
        expect(child.size.x).toBeCloseTo(0.3, 6);
        expect(child.rotation).toBeCloseTo(1.1, 6);
        // Born at the parent's birth: the whole of the parent's life remains, so nearly 4 s.
        expect(child.life).toBeGreaterThan(3.9);
        expect(child.life).toBeLessThanOrEqual(4);
    });

    it('inherits nothing by default', () => {
        const {parent, sub} = withSub([]);
        parent.update(STEP);
        parent.update(STEP);
        const child = sub.particles[0];
        expect(child.color.toArray()).toEqual([0.5, 1, 1, 1]);
        expect(child.size.x).toBeCloseTo(0.1, 6);
        expect(child.rotation).toBeCloseTo(0.1, 6);
        expect(child.life).toBe(4);
    });
});
