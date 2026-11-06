import {Constants} from '@babylonjs/core/Engines/constants';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
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
} from 'babylon.quarks';
import {addLabel} from '../shared/labels';
import {addGround} from '../shared/stage';
import {baseTexture} from '../shared/textures';
import type {DemoContext, DemoRun} from '../types';

/**
 * The `space` of a force (Unity's Space on Force over Lifetime). Both systems simulate in
 * local space and their emitters tip back and forth. The left one is pulled by a `'world'`
 * gravity, so its sparks keep falling straight down however the emitter leans; the right one
 * is pushed by a `'local'` thrust along the emitter's own X, so the push turns with it.
 */
export function init({scene, camera, add}: DemoContext): DemoRun {
    camera.setPosition(new BVector3(0, 5, 20));
    camera.setTarget(new BVector3(0, -1, 0));
    addGround(scene, -6);
    addLabel(scene, 'World force: gravity', new BVector3(-5, 3.2, 0));
    addLabel(scene, 'Local force: thrust', new BVector3(5, 3.2, 0));
    const texture = baseTexture(scene, 'streak');

    const make = (x: number, tint: Color4) => {
        const system = new ParticleSystem({
            scene,
            duration: 1,
            looping: true,
            startLife: new ConstantValue(2.5),
            startSpeed: new IntervalValue(4, 6),
            startSize: new IntervalValue(0.12, 0.22),
            startColor: new RandomColor(tint, new Color4(1, 1, 1, 1)),
            worldSpace: false,
            emissionOverTime: new ConstantValue(200),
            shape: new ConeEmitter({radius: 0.3, angle: 0.25}),
            renderMode: RenderMode.StretchedBillBoard,
            rendererEmitterSettings: {speedFactor: 0.07, lengthFactor: 1},
            texture,
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
        });
        system.addBehavior(
            new ColorOverLife(
                new Gradient(
                    [
                        [new Color3(1, 1, 1), 0],
                        [new Color3(1, 1, 1), 1],
                    ],
                    [
                        [1, 0],
                        [0, 1],
                    ]
                )
            )
        );
        system.emitter.position.set(x, 0, 0);
        add(system);
        return system;
    };

    // Gravity is a world force (the default): down stays down.
    const gravity = make(-5, new Color4(1, 0.8, 0.3, 1));
    gravity.addBehavior(new ApplyForce(new BVector3(0, -1, 0), new ConstantValue(12)));

    // A thrust along the emitter's own X: it leans with the emitter.
    const thrust = make(5, new Color4(0.4, 0.8, 1, 1));
    thrust.addBehavior(new ForceOverLife(new ConstantValue(12), new ConstantValue(0), new ConstantValue(0), 'local'));

    // Tips both emitters back and forth.
    let time = 0;
    return {
        update(delta) {
            time += delta;
            for (const system of [gravity, thrust]) {
                system.emitter.rotation.z = Math.sin(time * 0.8) * 0.9;
            }
        },
    };
}
