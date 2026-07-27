import {
    ApplyForce,
    AxisAngleGenerator,
    ConstantColor,
    ConstantValue,
    PointEmitter,
    Bezier,
    OrbitOverLife,
    PiecewiseBezier,
    Rotation3DOverLife,
    RotationOverLife,
    SizeOverLife,
    TrailParticle,
    Vector3 as QVector3,
    Vector4,
} from 'quarks.core';
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
    // One whole step after pinning: the renderer continues the motion the last
    // step actually produced, so the last step has to be a real one. Pinning a
    // particle and reading straight away describes a step that never ran.
    renderer.update(1 / 60);
    renderer.refreshBatches();
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

    it('draws where wall-clock time says, while the simulation stays within a step of it', () => {
        const {system, renderer} = setup();
        const startZ = drawnZ(renderer);
        let elapsed = 0;
        for (let i = 0; i < 60; i++) {
            const delta = 1 / 90;
            renderer.update(delta);
            elapsed += delta;
            // The drawn position tracks wall-clock time. The simulated one is
            // rounded to the nearest step rather than floored (see
            // simulationResidual), so it can sit slightly ahead of wall-clock
            // time as well as behind — but never by more than one step either way.
            expect(drawnZ(renderer) - startZ).toBeCloseTo(elapsed * SPEED, 5);
            expect(Math.abs(system.particles[0].position.z - drawnZ(renderer))).toBeLessThanOrEqual(SPEED / 60 + 1e-6);
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

    it('carries motion that no velocity describes, like an orbit', () => {
        // The gap this closes: plenty of behaviors move a particle by writing
        // its position — orbits, noise, turbulence, anything a plugin does.
        // Continuing along the velocity leaves every one of them stuttering,
        // because their velocity is zero the whole time.
        const system = makeSystem();
        system.behaviors.push(new OrbitOverLife(new ConstantValue(2), new QVector3(0, 1, 0)));
        const renderer = new BatchedRenderer('smoothness-orbit', scene);
        renderer.addSystem(system);
        system.play();
        renderer.update(1 / 60);
        const particle = system.particles[0];
        particle.position.set(5, 0, 0);
        particle.velocity.set(0, 0, 0);
        particle.speedModifier = 1;
        for (const behavior of system.behaviors) behavior.initialize(particle, system);
        renderer.update(1 / 60);
        renderer.refreshBatches();

        const drawnX = () => (renderer.batches[0] as unknown as {offsetBuffer: Float32Array}).offsetBuffer[0];
        const drawn = () => {
            const b = (renderer.batches[0] as unknown as {offsetBuffer: Float32Array}).offsetBuffer;
            return [b[0], b[1], b[2]];
        };
        expect(particle.velocity.length()).toBe(0);

        let previous = drawn();
        const moves: number[] = [];
        for (let i = 0; i < 16; i++) {
            renderer.update(1 / 120);
            const now = drawn();
            moves.push(Math.hypot(now[0] - previous[0], now[1] - previous[1], now[2] - previous[2]));
            previous = now;
        }
        void drawnX;

        // Every frame moves, and by about the same amount: a frame that ran no
        // step must still show half a step's worth of orbit.
        const smallest = Math.min(...moves);
        const largest = Math.max(...moves);
        expect(smallest).toBeGreaterThan(0);
        expect(largest / smallest).toBeLessThan(1.1);
        renderer.dispose();
    });

    it('keeps a short-lived particle fading and shrinking every frame', () => {
        // Explosion layers live a fifth of a second — a dozen steps in total —
        // so a whole step of fade lands on one frame and none on the next.
        // Size and colour are read off a curve rather than integrated, so the
        // only way to continue them is to have kept what the step produced.
        const LIFE = 0.2;
        const system = new ParticleSystem({
            scene,
            duration: 100,
            looping: true,
            worldSpace: true,
            startLife: new ConstantValue(LIFE),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(2),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(300),
            shape: new PointEmitter(),
            renderMode: RenderMode.BillBoard,
            behaviors: [new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.7, 0.35, 0), 0]]))],
        });
        const renderer = new BatchedRenderer('smoothness-fade', scene);
        renderer.addSystem(system);
        system.play();
        for (let i = 0; i < 30; i++) renderer.update(1 / 60);

        const sizes = () => (renderer.batches[0] as unknown as {sizeBuffer: Float32Array}).sizeBuffer;
        let previous = {size: sizes()[0], who: system.particles[0]};
        const changes: number[] = [];
        for (let i = 0; i < 40; i++) {
            renderer.update(1 / 120);
            const who = system.particles[0];
            const size = sizes()[0];
            // Rows are recycled constantly at this lifetime; only compare a row
            // that still holds the same particle, and only once that particle
            // has a whole step behind it — one born this frame has nothing to
            // continue yet, correctly.
            if (who === previous.who && who.age > 1 / 60) changes.push(Math.abs(size - previous.size));
            previous = {size, who};
        }

        expect(changes.length).toBeGreaterThan(10);
        // Every frame moves the size along. Before this, half of them did not.
        const frozen = changes.filter((c) => c < 1e-6).length;
        expect(frozen).toBe(0);
        renderer.dispose();
    });

    it('keeps a stretched billboard the right length between steps', () => {
        // A stretched billboard's shape is its velocity: the streak points along
        // it and is as long as it. A velocity frozen between steps makes the
        // outline pop at the step rate while the position glides.
        const system = new ParticleSystem({
            scene,
            duration: 100,
            looping: true,
            worldSpace: true,
            startLife: new ConstantValue(50),
            startSpeed: new ConstantValue(30),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
            shape: new PointEmitter(),
            renderMode: RenderMode.StretchedBillBoard,
            rendererEmitterSettings: {speedFactor: 1, lengthFactor: 0},
            behaviors: [new ApplyForce(new QVector3(0, 0, -1), new ConstantValue(20))],
        });
        const renderer = new BatchedRenderer('smoothness-stretch', scene);
        renderer.addSystem(system);
        system.play();
        renderer.update(1 / 60);
        const particle = system.particles[0];
        particle.position.set(0, 0, 0);
        particle.velocity.set(0, 0, 30);
        particle.speedModifier = 1;
        renderer.update(1 / 60);

        const streak = () => {
            const v = (renderer.batches[0] as unknown as {velocityBuffer: Float32Array}).velocityBuffer;
            return Math.hypot(v[0], v[1], v[2]);
        };
        let previous = streak();
        const changes: number[] = [];
        for (let i = 0; i < 20; i++) {
            renderer.update(1 / 120);
            const now = streak();
            changes.push(Math.abs(now - previous));
            previous = now;
        }

        // A constant force shortens the streak at a constant rate, so no frame
        // may leave it unchanged and none may move it twice as far.
        const smallest = Math.min(...changes);
        const largest = Math.max(...changes);
        expect(smallest).toBeGreaterThan(0);
        expect(largest / smallest).toBeLessThan(1.1);
        renderer.dispose();
    });

    describe('turning', () => {
        const SPIN = 8; // rad/s, the sort of rate AcidBoiling's sprites use

        function setupSpinning(renderMode: RenderMode) {
            const mesh = renderMode === RenderMode.Mesh;
            const system = new ParticleSystem({
                scene,
                duration: 100,
                looping: true,
                worldSpace: true,
                startLife: new ConstantValue(50),
                startSpeed: new ConstantValue(0),
                startSize: new ConstantValue(1),
                startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
                emissionOverTime: new ConstantValue(0),
                emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
                shape: new PointEmitter(),
                renderMode,
                behaviors: [
                    mesh
                        ? new Rotation3DOverLife(new AxisAngleGenerator(new QVector3(0, 0, 1), new ConstantValue(SPIN)))
                        : new RotationOverLife(new ConstantValue(SPIN)),
                ],
            });
            const renderer = new BatchedRenderer('smoothness-spin', scene);
            renderer.addSystem(system);
            system.play();
            for (let i = 0; i < 4; i++) renderer.update(1 / 60);
            return {system, renderer};
        }

        const rotations = (renderer: BatchedRenderer) =>
            (renderer.batches[0] as unknown as {rotationBuffer: Float32Array}).rotationBuffer;

        it('keeps a spinning billboard turning on frames that run no simulation step', () => {
            const {renderer} = setupSpinning(RenderMode.BillBoard);
            const delta = 1 / 120;
            let previous = rotations(renderer)[0];
            for (let i = 0; i < 12; i++) {
                renderer.update(delta);
                const now = rotations(renderer)[0];
                expect(now - previous).toBeCloseTo(delta * SPIN, 5);
                previous = now;
            }
            renderer.dispose();
        });

        it('keeps a spinning mesh turning too', () => {
            const {renderer} = setupSpinning(RenderMode.Mesh);
            const delta = 1 / 120;
            const angle = (buffer: Float32Array) => 2 * Math.atan2(Math.abs(buffer[2]), buffer[3]);
            let previous = angle(rotations(renderer));
            const turns: number[] = [];
            for (let i = 0; i < 12; i++) {
                renderer.update(delta);
                const now = angle(rotations(renderer));
                // Ignore the wrap when the quaternion crosses half a turn.
                if (now > previous) turns.push(now - previous);
                previous = now;
            }
            expect(turns.length).toBeGreaterThan(6);
            for (const turn of turns) {
                // Within a thousandth of a degree of an even sub-step turn: the
                // partial turn is a normalised lerp rather than a true slerp.
                expect(turn).toBeCloseTo(delta * SPIN, 4);
            }
            renderer.dispose();
        });

        it('does not carry a recycled particle spin into a system that has none', () => {
            // A pooled row can come back without a turning behavior to reset it.
            const {system, renderer} = setupSpinning(RenderMode.BillBoard);
            system.behaviors.length = 0;
            const particle = system.particles[0];
            particle.rotation = 0.25;
            particle.angularVelocity = 0;
            renderer.refreshBatches();
            const held = rotations(renderer)[0];
            renderer.update(1 / 120);
            expect(rotations(renderer)[0]).toBeCloseTo(held, 6);
            renderer.dispose();
        });
    });

    describe('trails', () => {
        /** One trail particle, moving in +Z, its ribbon long enough to have a body. */
        function setupTrail(followLocalOrigin = false) {
            const system = new ParticleSystem({
                scene,
                duration: 100,
                looping: true,
                worldSpace: true,
                startLife: new ConstantValue(50),
                startSpeed: new ConstantValue(SPEED),
                startSize: new ConstantValue(1),
                startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
                emissionOverTime: new ConstantValue(0),
                emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
                shape: new PointEmitter(),
                renderMode: RenderMode.Trail,
                rendererEmitterSettings: {startLength: new ConstantValue(10), followLocalOrigin},
            });
            const renderer = new BatchedRenderer('smoothness-trail', scene);
            renderer.addSystem(system);
            system.play();
            renderer.update(1 / 60);
            const particle = system.particles[0] as TrailParticle;
            particle.position.set(0, 0, 0);
            particle.velocity.set(0, 0, SPEED);
            particle.speedModifier = 1;
            // Lay down a few samples so the ribbon has a body behind its head.
            for (let i = 0; i < 6; i++) renderer.update(1 / 60);
            return {system, renderer, particle};
        }

        const positions = (renderer: BatchedRenderer) =>
            (renderer.batches[0] as unknown as {positionBuffer: Float32Array}).positionBuffer;

        /**
         * Z of the newest ribbon sample written this frame. Between steps that
         * is the live tip past the recorded head; on a step boundary it is the
         * recorded head itself.
         */
        const headZ = (renderer: BatchedRenderer, particle: TrailParticle, residual: number) => {
            const sample = particle.historyCount - 1 + (residual > 0 ? 1 : 0);
            return positions(renderer)[sample * 2 * 3 + 2];
        };

        /** Length of the last recorded segment (second-newest → newest). */
        const recordedTailLength = (renderer: BatchedRenderer, particle: TrailParticle) => {
            const newest = particle.historyCount - 1;
            const a = newest * 2 * 3 + 2;
            const b = (newest - 1) * 2 * 3 + 2;
            return Math.abs(positions(renderer)[a] - positions(renderer)[b]);
        };

        it('keeps the ribbon head moving on frames that run no simulation step', () => {
            const {system, renderer, particle} = setupTrail();
            const delta = 1 / 120;
            let previous = headZ(renderer, particle, system.simulationResidual ?? 0);
            for (let i = 0; i < 12; i++) {
                renderer.update(delta);
                const now = headZ(renderer, particle, system.simulationResidual ?? 0);
                expect(now - previous).toBeCloseTo(delta * SPEED, 5);
                previous = now;
            }
            renderer.dispose();
        });

        it('leaves every recorded sample where it was, including the head', () => {
            // The live tip is appended past the recorded ribbon; stretching the
            // recorded head instead pulses the last segment once per step.
            const {renderer, particle} = setupTrail();
            const before = positions(renderer).slice(0, particle.historyCount * 2 * 3);
            renderer.update(1 / 120); // no simulation step
            const after = positions(renderer).slice(0, particle.historyCount * 2 * 3);
            expect(Array.from(after)).toEqual(Array.from(before));
            renderer.dispose();
        });

        it('does not stretch the last recorded segment between steps', () => {
            const {renderer, particle} = setupTrail();
            const before = recordedTailLength(renderer, particle);
            for (let i = 0; i < 8; i++) {
                renderer.update(1 / 120);
                expect(recordedTailLength(renderer, particle)).toBeCloseTo(before, 5);
            }
            renderer.dispose();
        });

        it('feeds the live tip to the shader consistently as current, previous and next', () => {
            // The ribbon direction comes from neighbouring samples, so a tip
            // carried in one buffer but not the others would twist it.
            const {system, renderer, particle} = setupTrail();
            renderer.update(1 / 120);
            expect(system.simulationResidual ?? 0).toBeGreaterThan(0);
            const buffers = renderer.batches[0] as unknown as {
                positionBuffer: Float32Array;
                previousBuffer: Float32Array;
                nextBuffer: Float32Array;
            };
            const tip = particle.historyCount; // appended past the recorded head
            const recordedHead = particle.historyCount - 1;
            const tipOffset = tip * 2 * 3;
            const headOffset = recordedHead * 2 * 3;
            // The tip is its own `next`...
            expect(buffers.nextBuffer[tipOffset + 2]).toBeCloseTo(buffers.positionBuffer[tipOffset + 2], 6);
            // ...and the `next` of the recorded head behind it.
            expect(buffers.nextBuffer[headOffset + 2]).toBeCloseTo(buffers.positionBuffer[tipOffset + 2], 6);
            // ...and its `previous` is that recorded head.
            expect(buffers.previousBuffer[tipOffset + 2]).toBeCloseTo(buffers.positionBuffer[headOffset + 2], 6);
            renderer.dispose();
        });

        it('leaves a ribbon pinned to the emitter origin alone', () => {
            // Those follow the emitter transform, not the particle's velocity.
            const {system, renderer, particle} = setupTrail(true);
            const before = headZ(renderer, particle, system.simulationResidual ?? 0);
            renderer.update(1 / 120);
            expect(headZ(renderer, particle, system.simulationResidual ?? 0)).toBeCloseTo(before, 6);
            renderer.dispose();
        });
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
        // 30 steps here, plus the one setup ran to give the renderer real motion.
        expect(system.particles[0].position.z).toBeCloseTo((31 / 60) * SPEED, 4);
        expect(system.simulationResidual).toBeLessThan(1 / 60);
        renderer.dispose();
    });
});
