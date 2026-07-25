import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {ParticleSystem} from '../src/ParticleSystem';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {RenderMode} from '../src/VFXBatch';

/**
 * The simulation runs on a fixed 1/60 step, but frames do not arrive on that
 * grid: at 120Hz every other frame runs no step at all, and even at 60Hz the
 * accumulator drifts across the boundary. Drawing exactly what the last step
 * produced makes the particles stutter while the frame rate stays perfect, so
 * the renderer carries them along their velocity for the leftover time.
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

const SPEED = 20;

/** One particle, moving in +Z at a known constant speed, in world space. */
function makeSystem(worldSpace = true): ParticleSystem {
    return new ParticleSystem({
        scene,
        duration: 100,
        looping: true,
        worldSpace,
        startLife: new ConstantValue(50),
        startSpeed: new ConstantValue(SPEED),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
        shape: new PointEmitter(),
        renderMode: RenderMode.BillBoard,
    });
}

/** Position the batch uploaded for the first particle. */
function drawnZ(renderer: BatchedRenderer): number {
    return (renderer.batches[0] as unknown as {offsetBuffer: Float32Array}).offsetBuffer[2];
}

/**
 * Mounts the system, lets the burst emit its one particle, then pins that
 * particle to a known straight-line motion so the numbers below are exact
 * rather than at the mercy of the emitter's direction.
 */
function setup(worldSpace = true) {
    const system = makeSystem(worldSpace);
    const renderer = new BatchedRenderer('smoothness', scene);
    renderer.addSystem(system);
    system.play();
    renderer.update(1 / 60); // leaves the accumulator empty
    const particle = system.particles[0];
    particle.position.set(0, 0, 0);
    particle.velocity.set(0, 0, SPEED);
    particle.speedModifier = 1;
    renderer.refreshBatches(); // so the drawn state reflects the pinned particle
    return {system, renderer, particle};
}

describe('render-time smoothness', () => {
    it('keeps the drawn particle moving on frames that run no simulation step', () => {
        const {renderer} = setup();
        // 120Hz: half the frames land between simulation steps.
        const delta = 1 / 120;

        let previous = drawnZ(renderer);
        const moves: number[] = [];
        for (let i = 0; i < 20; i++) {
            renderer.update(delta);
            const now = drawnZ(renderer);
            moves.push(now - previous);
            previous = now;
        }

        const expected = delta * SPEED;
        for (const move of moves) {
            expect(move).toBeCloseTo(expected, 5);
        }
        renderer.dispose();
    });

    it('draws where wall-clock time says, while the simulation lags behind', () => {
        const {system, renderer} = setup();
        let elapsed = 0;
        for (let i = 0; i < 60; i++) {
            const delta = 1 / 90;
            renderer.update(delta);
            elapsed += delta;
            // The drawn position tracks wall-clock time, while the simulated one
            // lags by up to a step.
            expect(drawnZ(renderer)).toBeCloseTo(elapsed * SPEED, 5);
            expect(system.particles[0].position.z).toBeLessThanOrEqual(drawnZ(renderer) + 1e-6);
        }
        renderer.dispose();
    });

    it('applies the same correction to a local-space system', () => {
        const {renderer} = setup(false);
        const delta = 1 / 120;

        let previous = drawnZ(renderer);
        for (let i = 0; i < 12; i++) {
            renderer.update(delta);
            const now = drawnZ(renderer);
            expect(now - previous).toBeCloseTo(delta * SPEED, 5);
            previous = now;
        }
        renderer.dispose();
    });

    it('applies it to a system emitting through another one, particle by particle', () => {
        // Sub emitters carry their own parent transform, so their particles are
        // written one at a time instead of as a range from the store.
        const {system, renderer} = setup(false);
        system.onlyUsedByOther = true;
        renderer.refreshBatches();
        const delta = 1 / 120;

        let previous = drawnZ(renderer);
        for (let i = 0; i < 12; i++) {
            renderer.update(delta);
            const now = drawnZ(renderer);
            expect(now - previous).toBeCloseTo(delta * SPEED, 5);
            previous = now;
        }
        renderer.dispose();
    });

    it('holds a paused system exactly where the simulation left it', () => {
        const {system, renderer} = setup();
        for (let i = 0; i < 10; i++) renderer.update(1 / 90);
        system.pause();
        renderer.update(1 / 90);

        const held = drawnZ(renderer);
        expect(held).toBeCloseTo(system.particles[0].position.z, 6);
        for (let i = 0; i < 5; i++) {
            renderer.update(1 / 90);
            expect(drawnZ(renderer)).toBeCloseTo(held, 6);
        }
        renderer.dispose();
    });

    it('leaves the simulation itself untouched', () => {
        // Whatever the renderer draws, the particle state after N fixed steps
        // has to be exactly N steps of motion.
        const {system, renderer} = setup();
        for (let i = 0; i < 30; i++) renderer.update(1 / 60);
        expect(system.particles[0].position.z).toBeCloseTo((30 / 60) * SPEED, 4);
        expect(system.simulationResidual).toBeLessThan(1 / 60);
        renderer.dispose();
    });
});
