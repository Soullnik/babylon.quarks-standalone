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
    SphereEmitter,
    SubParticleEmitMode,
    Vector3 as QVector3,
    Vector4,
} from 'quarks.core';
import {ParticleSystem} from '../src/ParticleSystem';
import {ParticleEmitter} from '../src/ParticleEmitter';
import {BatchedRenderer} from '../src/BatchedRenderer';
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
        parent.addBehavior(
            new EmitSubParticleSystem(parent, false, childEmitter, SubParticleEmitMode.Birth)
        );

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
        parent.addBehavior(
            new EmitSubParticleSystem(parent, false, childEmitter, SubParticleEmitMode.Birth)
        );

        const renderer = new BatchedRenderer('sub-order-2', scene);
        renderer.addSystem(child);
        renderer.addSystem(parent);
        const order = (renderer as unknown as {orderSystems(): unknown[]}).orderSystems();
        expect(order.indexOf(parent)).toBeLessThan(order.indexOf(child));
    });
});
