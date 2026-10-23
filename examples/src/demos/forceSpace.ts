import {Constants} from '@babylonjs/core/Engines/constants';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {
    ApplyForce,
    ColorOverLife,
    ConeEmitter,
    ConstantValue,
    ForceOverLife,
    Gradient,
    IntervalValue,
    ParticleSystem,
    RandomColor,
    RenderMode,
    Vector3,
    Vector4,
} from 'babylon.quarks';
import {createSharedTexture} from '../shared/common';
import type {DemoContext} from '../types';

/**
 * The `space` of a force (Unity's Space on Force over Lifetime). Both systems simulate in
 * local space and their emitters tip back and forth. The left one is pulled by a `'world'`
 * gravity, so its sparks keep falling straight down however the emitter leans; the right one
 * is pushed by a `'local'` thrust along the emitter's own X, so the push turns with it.
 */
export function init({scene, camera, batchRenderer, systems}: DemoContext) {
    camera.setPosition(new BVector3(0, 6, 22));
    const texture = createSharedTexture(scene);

    const make = (x: number, tint: Vector4) => {
        const system = new ParticleSystem({
            scene,
            duration: 1,
            looping: true,
            startLife: new ConstantValue(2.5),
            startSpeed: new IntervalValue(4, 6),
            startSize: new IntervalValue(0.15, 0.3),
            startColor: new RandomColor(tint, new Vector4(1, 1, 1, 1)),
            worldSpace: false,
            emissionOverTime: new ConstantValue(200),
            shape: new ConeEmitter({radius: 0.3, angle: 0.25}),
            renderMode: RenderMode.BillBoard,
            texture,
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
            startTileIndex: new ConstantValue(0),
            uTileCount: 10,
            vTileCount: 10,
        });
        system.addBehavior(
            new ColorOverLife(
                new Gradient(
                    [
                        [new Vector3(1, 1, 1), 0],
                        [new Vector3(1, 1, 1), 1],
                    ],
                    [
                        [1, 0],
                        [0, 1],
                    ]
                )
            )
        );
        system.emitter.position.set(x, 0, 0);
        batchRenderer.addSystem(system);
        systems.push(system);
        return system;
    };

    // Gravity is a world force (the default): down stays down.
    const gravity = make(-5, new Vector4(1, 0.8, 0.3, 1));
    gravity.addBehavior(new ApplyForce(new Vector3(0, -1, 0), new ConstantValue(12)));

    // A thrust along the emitter's own X: it leans with the emitter.
    const thrust = make(5, new Vector4(0.4, 0.8, 1, 1));
    thrust.addBehavior(new ForceOverLife(new ConstantValue(12), new ConstantValue(0), new ConstantValue(0), 'local'));
}

/** Tips both emitters back and forth. */
export function update({systems}: DemoContext) {
    const time = (performance.now() / 1000) % 1000;
    for (const system of systems) {
        system.emitter.rotation.z = Math.sin(time * 0.8) * 0.9;
    }
}
