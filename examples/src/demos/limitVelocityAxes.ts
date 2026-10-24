import {Constants} from '@babylonjs/core/Engines/constants';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {
    ColorOverLife,
    ConstantValue,
    Gradient,
    IntervalValue,
    LimitSpeedOverLife,
    ParticleSystem,
    RandomColor,
    RenderMode,
    SphereEmitter,
    Vector3,
    Vector3Function,
    Vector4,
} from 'babylon.quarks';
import {createSharedTexture} from '../shared/common';
import type {DemoContext} from '../types';

/**
 * Limit Velocity over Lifetime with and without Separate Axes. Both systems shoot sparks out of a
 * sphere in every direction. The left one limits the speed: the cloud slows down evenly and stays
 * round. The right one limits each axis on its own, hard on the emitter's Y and loose on X and Z:
 * the cloud flattens into a disc, which leans with its emitter because the limits are local.
 */
export function init({scene, camera, batchRenderer, systems}: DemoContext) {
    camera.setPosition(new BVector3(0, 7, 20));
    const texture = createSharedTexture(scene);

    const make = (x: number, tint: Vector4) => {
        const system = new ParticleSystem({
            scene,
            duration: 1,
            looping: true,
            startLife: new ConstantValue(1.5),
            startSpeed: new IntervalValue(6, 10),
            startSize: new IntervalValue(0.15, 0.3),
            startColor: new RandomColor(tint, new Vector4(1, 1, 1, 1)),
            worldSpace: true,
            emissionOverTime: new ConstantValue(400),
            shape: new SphereEmitter({radius: 0.3}),
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
                        [1, 0.6],
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

    // One limit for the speed: the cloud stays round.
    make(-5.5, new Vector4(1, 0.7, 0.3, 1)).addBehavior(new LimitSpeedOverLife(new ConstantValue(1.5), 1));

    // A limit per local axis: hardly any speed along the emitter's Y, so the cloud flattens.
    const flat = make(5.5, new Vector4(0.4, 0.8, 1, 1));
    flat.addBehavior(
        new LimitSpeedOverLife(
            new Vector3Function(new ConstantValue(2.5), new ConstantValue(0.1), new ConstantValue(2.5)),
            1,
            'local'
        )
    );
    flat.emitter.rotation.z = 0.5;
}
