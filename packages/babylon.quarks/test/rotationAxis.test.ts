import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {
    BoxEmitter,
    ConeEmitter,
    ConstantValue,
    EdgeEmitter,
    EmitterShape,
    IntervalValue,
    Particle,
    PointEmitter,
    Quaternion,
    RotationOverLife,
    SphereEmitter,
    Vector3,
} from 'quarks.core';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import {RenderMode} from '../src/VFXBatch';

const STEP = 1 / 30;
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

/** A shape that starts every particle at `position`, sent along `direction`. */
function from(position: Vector3, direction: Vector3): EmitterShape {
    const shape = new PointEmitter();
    shape.initialize = (p: Particle) => {
        p.position.copy(position);
        p.velocity.copy(direction).normalize().multiplyScalar(p.startSpeed);
    };
    return shape;
}

function system(parameters: Partial<ParticleSystemParameters> = {}): ParticleSystem {
    return new ParticleSystem({
        scene,
        duration: 10,
        looping: true,
        startLife: new ConstantValue(10),
        startSpeed: new ConstantValue(0),
        startRotation: new ConstantValue(Math.PI / 2),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(20), cycle: 1, interval: 0, probability: 1}],
        renderMode: RenderMode.Mesh,
        rotationAxis: 'emission',
        texture: null,
        ...parameters,
    });
}

function spawn(ps: ParticleSystem): Particle[] {
    ps.restart();
    ps.update(STEP);
    return ps.particles.slice(0, ps.particleNum);
}

/** Where the particle's rotation takes the mesh's `v`. */
function turned(particle: Particle, v: Vector3): Vector3 {
    return v.clone().applyQuaternion(particle.rotation as Quaternion);
}

const Y = new Vector3(0, 1, 0);

describe('rotationAxis', () => {
    it("turns a number start rotation about Z by default ('z')", () => {
        const [p] = spawn(system({rotationAxis: 'z', shape: new BoxEmitter()}));
        expect(p.rotationAxis ?? null).toBeNull();
        // 90° about Z takes X to Y.
        const x = turned(p, new Vector3(1, 0, 0));
        expect([x.x, x.y, x.z].map((n) => +n.toFixed(6))).toEqual([0, 1, 0]);
    });

    it('turns a mesh sent along Z, starting near the axis, about Y: a ring in XZ stays level', () => {
        const ps = system({shape: new ConeEmitter({radius: 0.01, angle: 0}), startSpeed: new ConstantValue(1)});
        for (const p of spawn(ps)) {
            expect(p.rotationAxis!.distanceTo(Y)).toBeLessThan(1e-6);
            expect(turned(p, Y).distanceTo(Y)).toBeLessThan(1e-6);
        }
    });

    it('takes the axis square to Z and the start direction', () => {
        const direction = new Vector3(0.6, 0.8, 0);
        const [p] = spawn(system({shape: from(new Vector3(), direction), startSpeed: new ConstantValue(2)}));
        const axis = p.rotationAxis!;
        expect(axis.length()).toBeCloseTo(1, 6);
        expect(axis.dot(direction)).toBeCloseTo(0, 6);
        expect(axis.z).toBeCloseTo(0, 6);
        // Z × direction, Unity's handedness.
        expect(axis.x).toBeCloseTo(-0.8, 6);
        expect(axis.y).toBeCloseTo(0.6, 6);
    });

    it('takes the start position for a particle sent along Z or not moving at all', () => {
        for (const speed of [0, 3]) {
            const shape = from(new Vector3(0.5, 0, 0.2), new Vector3(0, 0, 1));
            const [p] = spawn(system({shape, startSpeed: new ConstantValue(speed)}));
            expect(p.rotationAxis!.distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-6);
        }
    });

    it("takes the shape's direction even at a start speed of 0, as Unity does", () => {
        // Unity 6, a Single Sided Edge (sending along +Y) at speed 0: axisOfRotation (-1, 0, 0),
        // Z × Y, where the start position (on the X axis) would have given Y.
        const [edge] = spawn(system({shape: new EdgeEmitter({radius: 1}), startSpeed: new ConstantValue(0)}));
        expect(edge.rotationAxis!.distanceTo(new Vector3(-1, 0, 0))).toBeLessThan(1e-6);
        expect(edge.velocity.length()).toBe(0);
        // A tiny sphere at speed 0: each particle's axis is square to Z and to where the shape
        // sends it, not Y for all (a sword's glimmer lines).
        const particles = spawn(system({shape: new SphereEmitter({radius: 0.01}), startSpeed: new ConstantValue(0)}));
        expect(new Set(particles.map((p) => p.rotationAxis!.x.toFixed(3))).size).toBeGreaterThan(5);
        for (const p of particles) {
            expect(p.velocity.length()).toBe(0);
            const direction = p.position.clone().normalize();
            if (direction.x * direction.x + direction.y * direction.y < 0.01) continue;
            expect(p.rotationAxis!.dot(direction)).toBeCloseTo(0, 5);
        }
        // A start speed the shape scales still reaches the velocity.
        const [fast] = spawn(system({shape: new EdgeEmitter({radius: 1}), startSpeed: new ConstantValue(3)}));
        expect(fast.velocity.y).toBeCloseTo(3, 6);
    });

    it('falls back to Y when neither the direction nor the position leaves the Z axis', () => {
        const shape = from(new Vector3(0.05, 0.05, 1), new Vector3(0, 0, 1));
        const [p] = spawn(system({shape, startSpeed: new ConstantValue(1)}));
        expect(p.rotationAxis!.distanceTo(Y)).toBeLessThan(1e-6);
    });

    it('gives each particle its own axis on a sphere', () => {
        const particles = spawn(system({shape: new SphereEmitter({radius: 1}), startSpeed: new ConstantValue(1)}));
        const axes = new Set(particles.map((p) => p.rotationAxis!.x.toFixed(3)));
        expect(axes.size).toBeGreaterThan(5);
        for (const p of particles) {
            expect(p.rotationAxis!.z).toBeCloseTo(0, 6);
            // One sent within about 6° of Z takes the fallback, as in Unity.
            const direction = p.velocity.clone().normalize();
            if (direction.x * direction.x + direction.y * direction.y < 0.01) continue;
            expect(p.rotationAxis!.dot(p.velocity)).toBeCloseTo(0, 5);
        }
    });

    it('turns RotationOverLife about the same axis, so a level ring stays level', () => {
        const ps = system({
            shape: new ConeEmitter({radius: 0.01, angle: 0}),
            startSpeed: new ConstantValue(0),
            startRotation: new IntervalValue(0, Math.PI * 2),
            behaviors: [new RotationOverLife(new ConstantValue(3))],
        });
        const particles = spawn(ps);
        const start = particles.map((p) => (p.rotation as Quaternion).clone());
        for (let i = 0; i < 30; i++) ps.update(STEP);
        particles.forEach((p, i) => {
            expect(turned(p, Y).distanceTo(Y)).toBeLessThan(1e-5);
            // It did turn: 30 steps at 3 rad/s.
            expect(Math.abs((p.rotation as Quaternion).dot(start[i]))).toBeLessThan(0.99);
        });
    });
});
