import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {
    ApplyForce,
    Behavior,
    ConstantColor,
    ConstantValue,
    OrbitOverLife,
    PointEmitter,
    Vector3,
    Vector4,
    VelocityOverLife,
} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import {RenderMode} from '../src/VFXBatch';

/**
 * A stretched billboard is drawn along the particle's velocity plus its animated velocity, the
 * motion Velocity over Lifetime and the orbit give it by moving its position, as Unity draws
 * along totalVelocity. Lightning that starts at speed 0 and rises only
 * by Velocity over Lifetime: it had no direction, stood edge-on to the camera and was not seen.
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

function system(renderMode: RenderMode, behaviors: Behavior[]): ParticleSystem {
    return new ParticleSystem({
        scene,
        duration: 10,
        looping: true,
        worldSpace: true,
        startLife: new ConstantValue(5),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
        shape: new PointEmitter(),
        renderMode,
        rendererEmitterSettings:
            renderMode === RenderMode.StretchedBillBoard ? {speedFactor: 0.5, lengthFactor: 0.1} : {},
        behaviors,
    });
}

const rising = () => new VelocityOverLife(new ConstantValue(0), new ConstantValue(4), new ConstantValue(0));

/** The velocity the batch hands the stretched shader for its first particle. */
function drawnVelocity(renderer: BatchedRenderer): [number, number, number] {
    const v = (renderer.batches[0] as unknown as {velocityBuffer: Float32Array}).velocityBuffer;
    return [v[0], v[1], v[2]];
}

function play(ps: ParticleSystem, steps: number): BatchedRenderer {
    const renderer = new BatchedRenderer('animated', scene);
    renderer.addSystem(ps);
    ps.play();
    for (let i = 0; i < steps; i++) renderer.update(1 / 60);
    return renderer;
}

describe('animated velocity', () => {
    it('stretches a billboard moved only by VelocityOverLife along that motion', () => {
        const ps = system(RenderMode.StretchedBillBoard, [rising()]);
        const renderer = play(ps, 6);
        const [x, y, z] = drawnVelocity(renderer);
        // 4 up, times the speed factor 0.5.
        expect(x).toBeCloseTo(0, 5);
        expect(y).toBeCloseTo(2, 3);
        expect(z).toBeCloseTo(0, 5);
        expect(ps.particles[0].velocity.length()).toBe(0);
        renderer.dispose();
    });

    it('adds an orbit and a velocity to it, and the motion to the culling bounds', () => {
        const ps = system(RenderMode.StretchedBillBoard, [
            new ApplyForce(new Vector3(1, 0, 0), new ConstantValue(6)),
            rising(),
            new OrbitOverLife(new ConstantValue(0)),
        ]);
        const renderer = play(ps, 6);
        const [x, y] = drawnVelocity(renderer);
        expect(x).toBeGreaterThan(0.1);
        expect(y).toBeCloseTo(2, 3);
        // The step's speed reaches the bounds' padding: the rise counts, not only the force.
        const bounds = (ps as unknown as {bounds: {maxSpeedSq: number}}).bounds;
        expect(Math.sqrt(bounds.maxSpeedSq)).toBeGreaterThan(4);
        renderer.dispose();
    });

    it('is kept only by a stretched system with a behavior that moves positions directly', () => {
        const kept = (ps: ParticleSystem) => {
            const renderer = play(ps, 2);
            const length = (ps as unknown as {store: {animatedVelocity: Float32Array}}).store.animatedVelocity.length;
            renderer.dispose();
            return length > 0;
        };
        expect(kept(system(RenderMode.StretchedBillBoard, [rising()]))).toBe(true);
        expect(kept(system(RenderMode.StretchedBillBoard, [new OrbitOverLife(new ConstantValue(1))]))).toBe(true);
        expect(
            kept(system(RenderMode.StretchedBillBoard, [new ApplyForce(new Vector3(0, 1, 0), new ConstantValue(1))]))
        ).toBe(false);
        expect(kept(system(RenderMode.BillBoard, [rising()]))).toBe(false);
    });

    it('carries the stretch on between steps without a pop at birth', () => {
        const ps = system(RenderMode.StretchedBillBoard, [rising()]);
        const renderer = new BatchedRenderer('animated', scene);
        renderer.addSystem(ps);
        ps.play();
        // Frames shorter than a step: the drawn velocity is carried on from the last two steps'.
        const seen: number[] = [];
        for (let i = 0; i < 12; i++) {
            renderer.update(1 / 240);
            seen.push(drawnVelocity(renderer)[1]);
        }
        // A constant rise is drawn constant from the first frame: a newborn's last step is its own.
        for (const y of seen.filter((v) => v !== 0)) expect(y).toBeCloseTo(2, 3);
        renderer.dispose();
    });
});
