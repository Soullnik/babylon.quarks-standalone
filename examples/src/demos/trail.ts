import {Constants} from '@babylonjs/core/Engines/constants';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {
    ApplyCollision,
    ApplyForce,
    ColorOverLength,
    ColorOverLife,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    FrameOverLife,
    Gradient,
    IntervalValue,
    ParticleSystem,
    RandomColor,
    RenderMode,
    SizeOverLife,
    WidthOverLength,
} from 'babylon.quarks';
import {curve, fade} from '../shared/curves';
import {addGround} from '../shared/stage';
import {baseTexture, kenneyTexture, sheetOf} from '../shared/textures';
import {every, replay} from '../shared/timing';
import type {DemoContext, DemoRun} from '../types';

/**
 * Sparks thrown up in bursts, each drawing a trail: white-hot at its head and cooling to red down
 * its length (`ColorOverLength`), thinning toward its tail (`WidthOverLength`). They fall under a
 * force and bounce on the floor, a collision plane in the emitter's space (`ApplyCollision` with
 * `planes`), losing some of their speed and life at every bounce.
 */
export function init({scene, camera, add}: DemoContext): DemoRun {
    camera.setPosition(new BVector3(0, 4, 13));
    camera.setTarget(new BVector3(0, 1.6, 0));
    addGround(scene);

    const sparks = new ParticleSystem({
        scene,
        duration: 2,
        looping: false,
        startLife: new IntervalValue(2.2, 3),
        startSpeed: new IntervalValue(7, 11),
        startSize: new IntervalValue(0.2, 0.3),
        startColor: new RandomColor(new Color4(1, 0.95, 0.8, 1), new Color4(1, 0.8, 0.45, 1)),
        worldSpace: true,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [
            {time: 0, count: new ConstantValue(55), cycle: 1, interval: 0, probability: 1},
            {time: 0.35, count: new ConstantValue(35), cycle: 1, interval: 0, probability: 1},
        ],
        shape: new ConeEmitter({radius: 0.15, angle: 0.55}),
        renderMode: RenderMode.Trail,
        rendererEmitterSettings: {startLength: new ConstantValue(24)},
        // Soft edges and a bright line down the middle.
        texture: kenneyTexture(scene, 'ribbon'),
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
    });
    sparks.emitter.name = 'Sparks';
    sparks.addBehavior(
        new ColorOverLength(
            new Gradient(
                [
                    [new Color3(1, 1, 1), 0],
                    [new Color3(1, 0.6, 0.15), 0.35],
                    [new Color3(0.8, 0.12, 0.02), 1],
                ],
                [
                    [1, 0],
                    [0, 1],
                ]
            )
        )
    );
    sparks.addBehavior(
        new WidthOverLength(
            curve([
                [0, 1],
                [1, 0.2],
            ])
        )
    );
    sparks.addBehavior(new ColorOverLife(fade(0, 0.75)));
    sparks.addBehavior(
        new SizeOverLife(
            curve([
                [0, 1],
                [1, 0.4],
            ])
        )
    );
    sparks.addBehavior(new ApplyForce(new BVector3(0, -1, 0), new ConstantValue(14)));
    // The floor as a plane in the emitter's space: the emitter is turned so its +z is up, so the
    // plane's normal is +z and it passes through the emitter, which stands on the ground.
    sparks.addBehavior(
        new ApplyCollision(undefined, 0.55, {
            planes: [{position: {x: 0, y: 0, z: 0}, normal: {x: 0, y: 0, z: 1}}],
            dampen: 0.15,
            lifetimeLoss: 0.1,
        })
    );
    sparks.emitter.rotation.x = -Math.PI / 2;
    sparks.emitter.position.y = 0.05;
    add(sparks);

    // A glow on the floor where they burst from.
    const glow = new ParticleSystem({
        scene,
        duration: 2,
        looping: false,
        startLife: new ConstantValue(0.6),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(3),
        startColor: new ConstantColor(new Color4(1, 0.6, 0.25, 0.7)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [
            {time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1},
            {time: 0.35, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1},
        ],
        shape: new ConeEmitter({radius: 0.01, angle: 0}),
        texture: baseTexture(scene, 'glow'),
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        renderMode: RenderMode.HorizontalBillBoard,
    });
    glow.emitter.name = 'Floor glow';
    glow.addBehavior(new ColorOverLife(fade(0.05, 0.3)));
    glow.emitter.position.y = 0.04;
    add(glow);

    // The flash they burst out of.
    const flash = new ParticleSystem({
        scene,
        duration: 2,
        looping: false,
        startLife: new ConstantValue(0.3),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(2.4, 2.8),
        startRotation: new IntervalValue(0, Math.PI * 2),
        startColor: new ConstantColor(new Color4(1, 0.85, 0.55, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [
            {time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1},
            {time: 0.35, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1},
        ],
        shape: new ConeEmitter({radius: 0.01, angle: 0}),
        texture: baseTexture(scene, 'flash'),
        ...sheetOf('flash'),
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
    });
    flash.emitter.name = 'Flash';
    flash.addBehavior(
        new FrameOverLife(
            curve([
                [0, 0],
                [1, 5.99],
            ])
        )
    );
    flash.emitter.position.y = 0.5;
    add(flash);

    return {update: every(3.2, () => replay([sparks, glow, flash]))};
}
