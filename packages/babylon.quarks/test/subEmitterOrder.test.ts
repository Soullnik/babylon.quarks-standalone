import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {
    ColorOverLife,
    ConstantColor,
    ConstantValue,
    EmitSubParticleSystem,
    Gradient,
    IntervalValue,
    PointEmitter,
    Vector3 as QVector3,
    SphereEmitter,
    SubParticleEmitMode,
    Vector4,
} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleEmitter} from '../src/ParticleEmitter';
import {ParticleSystem} from '../src/ParticleSystem';
import {RenderMode} from '../src/VFXBatch';

/**
 * A sub emitter's particles are created by its parent's behaviors, part way
 * through the parent's step. A sub system updated before its parent has already
 * fixed the list of particles it will run behaviors over, so those new ones are
 * drawn that frame carrying nothing but their start values — white where a
 * colour curve would have coloured them, and at their start size.
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

/** Starts white, and a colour curve is the only thing that makes it otherwise. */
function makeChild(): ParticleSystem {
    return new ParticleSystem({
        scene,
        duration: 100,
        looping: true,
        worldSpace: true,
        onlyUsedByOther: true,
        startLife: new ConstantValue(1),
        startSpeed: new ConstantValue(2),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(60),
        emissionBursts: [],
        shape: new PointEmitter(),
        renderMode: RenderMode.BillBoard,
        behaviors: [
            new ColorOverLife(
                new Gradient(
                    [
                        [new QVector3(0, 0, 1), 0],
                        [new QVector3(0, 0, 1), 1],
                    ],
                    [
                        [1, 0],
                        [0, 1],
                    ]
                )
            ),
        ],
    });
}

function makeParent(): ParticleSystem {
    return new ParticleSystem({
        scene,
        duration: 100,
        looping: true,
        worldSpace: true,
        startLife: new ConstantValue(2),
        startSpeed: new IntervalValue(4, 8),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(10),
        emissionBursts: [],
        shape: new SphereEmitter(),
        renderMode: RenderMode.BillBoard,
    });
}

const isStartColour = (colour: {x: number; y: number; z: number; w: number}) =>
    colour.x === 1 && colour.y === 1 && colour.z === 1 && colour.w === 1;

describe('sub emitter update order', () => {
    it('never draws a sub emitted particle before its behaviors have run', () => {
        const child = makeChild();
        const parent = makeParent();
        const childEmitter = new ParticleEmitter(child);
        childEmitter.parent = parent.emitter;
        parent.addBehavior(new EmitSubParticleSystem(parent, false, childEmitter, SubParticleEmitMode.Birth));

        const renderer = new BatchedRenderer('sub-order', scene);
        // Added child first on purpose: this is the order a loader produces when
        // the sub system happens to come first in the file, and it is the order
        // that used to leave newborns unstyled.
        renderer.addSystem(child);
        renderer.addSystem(parent);
        parent.play();
        child.play();

        let unstyled = 0;
        let seen = 0;
        for (let i = 0; i < 300; i++) {
            renderer.update(1 / 60);
            for (let j = 0; j < child.particleNum; j++) {
                seen++;
                if (isStartColour(child.particles[j].color)) unstyled++;
            }
        }

        // The run has to have produced sub particles at all for this to mean
        // anything.
        expect(seen).toBeGreaterThan(100);
        expect(unstyled).toBe(0);
    });

    it('puts a system ahead of the one it emits into, however it was added', () => {
        const child = makeChild();
        const parent = makeParent();
        const childEmitter = new ParticleEmitter(child);
        childEmitter.parent = parent.emitter;
        parent.addBehavior(new EmitSubParticleSystem(parent, false, childEmitter, SubParticleEmitMode.Birth));

        const renderer = new BatchedRenderer('sub-order-2', scene);
        renderer.addSystem(child);
        renderer.addSystem(parent);
        const order = (renderer as unknown as {orderSystems(): unknown[]}).orderSystems();
        expect(order.indexOf(parent)).toBeLessThan(order.indexOf(child));
    });

    it('does not leave sub particles at startColour when the child clock paused empty', () => {
        // onlyUsedByOther + non-looping finishes the moment it hits zero particles.
        // Skipping update then froze its fixed-step accumulator while the parent
        // kept ticking — next refill sat at age 0 / startColour for a frame or
        // more wherever the parent was, which is the random white trail flashes
        // in subEmitter2. Jittered dt is what opens the phase gap.
        const child = new ParticleSystem({
            scene,
            duration: 0.3,
            looping: false,
            worldSpace: true,
            onlyUsedByOther: true,
            startLife: new ConstantValue(0.2),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(30),
            emissionBursts: [],
            shape: new PointEmitter(),
            renderMode: RenderMode.BillBoard,
            behaviors: [
                new ColorOverLife(
                    new Gradient(
                        [
                            [new QVector3(0, 0, 1), 0],
                            [new QVector3(0, 0, 1), 1],
                        ],
                        [
                            [1, 0],
                            [0, 1],
                        ]
                    )
                ),
            ],
        });
        const parent = new ParticleSystem({
            scene,
            duration: 100,
            looping: true,
            worldSpace: true,
            startLife: new ConstantValue(0.5),
            startSpeed: new ConstantValue(8),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(6),
            emissionBursts: [],
            shape: new SphereEmitter(),
            renderMode: RenderMode.BillBoard,
        });
        const childEmitter = new ParticleEmitter(child);
        childEmitter.parent = parent.emitter;
        parent.addBehavior(new EmitSubParticleSystem(parent, false, childEmitter, SubParticleEmitMode.Birth));

        const renderer = new BatchedRenderer('sub-phase', scene);
        renderer.addSystem(child);
        renderer.addSystem(parent);
        parent.play();
        child.play();

        let unstyled = 0;
        let ageZero = 0;
        let seen = 0;
        const deltas = [1 / 90, 1 / 45, 1 / 120, 1 / 75, 0.03];
        for (let i = 0; i < 400; i++) {
            renderer.update(deltas[i % deltas.length]);
            for (let j = 0; j < child.particleNum; j++) {
                seen++;
                const particle = child.particles[j];
                if (particle.age === 0) ageZero++;
                if (isStartColour(particle.color)) unstyled++;
            }
        }

        expect(seen).toBeGreaterThan(50);
        expect(ageZero).toBe(0);
        expect(unstyled).toBe(0);
        renderer.dispose();
    });
});
