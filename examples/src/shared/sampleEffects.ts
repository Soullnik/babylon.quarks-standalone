import {Constants} from '@babylonjs/core/Engines/constants';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Scene} from '@babylonjs/core/scene';
import {
    ApplyForce,
    ColorOverLife,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    FrameOverLife,
    Gradient,
    IntervalValue,
    ParticleSystem,
    type ParticleSystemParameters,
    PointEmitter,
    RandomColor,
    RenderMode,
    SizeOverLife,
    SphereEmitter,
    VelocityOverLife,
} from 'babylon.quarks';
import {curve, fade} from './curves';
import {baseTexture, sheetOf} from './textures';

/**
 * Small finished effects built in code, each under a root of its own, not yet added to a renderer.
 * `scripts/write-sample-effects.mts` saves them as the files in `examples/public/effects/`, which
 * the Loading Effects demo loads; the demo also builds one here and saves and loads it again.
 */

/** A system named `name` under `root`, emitting up when `up` (cones emit along +z). */
function layer(
    root: TransformNode,
    name: string,
    parameters: Omit<ParticleSystemParameters, 'scene'>,
    scene: Scene,
    up = false
): ParticleSystem {
    const system = new ParticleSystem({scene, ...parameters});
    system.emitter.name = name;
    system.emitter.parent = root;
    if (up) {
        system.emitter.rotation.x = -Math.PI / 2;
    }
    return system;
}

const ONCE = {time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1};

/** A fiery burst every two seconds: a flash, embers thrown up and falling, smoke rising after. */
export function emberBurst(scene: Scene): TransformNode {
    const root = new TransformNode('Ember burst', scene);

    const flash = layer(
        root,
        'Flash',
        {
            duration: 2,
            looping: true,
            startLife: new ConstantValue(0.35),
            startSpeed: new ConstantValue(0),
            startSize: new IntervalValue(2.6, 3),
            startRotation: new IntervalValue(0, Math.PI * 2),
            startColor: new ConstantColor(new Color4(1, 0.7, 0.35, 1)),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [ONCE],
            shape: new PointEmitter(),
            texture: baseTexture(scene, 'flash'),
            ...sheetOf('flash'),
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
        },
        scene
    );
    flash.addBehavior(
        new FrameOverLife(
            curve([
                [0, 0],
                [1, 7.99],
            ])
        )
    );

    const embers = layer(
        root,
        'Embers',
        {
            duration: 2,
            looping: true,
            startLife: new IntervalValue(1, 1.5),
            startSpeed: new IntervalValue(3, 5.5),
            startSize: new IntervalValue(0.14, 0.26),
            startColor: new RandomColor(new Color4(1, 0.85, 0.45, 1), new Color4(1, 0.4, 0.12, 1)),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{...ONCE, count: new ConstantValue(45)}],
            shape: new ConeEmitter({radius: 0.2, angle: 0.7}),
            texture: baseTexture(scene, 'streak'),
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
            renderMode: RenderMode.StretchedBillBoard,
            rendererEmitterSettings: {speedFactor: 0.06, lengthFactor: 1},
        },
        scene,
        true
    );
    embers.addBehavior(new ApplyForce({x: 0, y: -1, z: 0}, new ConstantValue(7)));
    embers.addBehavior(new ColorOverLife(fade(0, 0.6)));

    const smoke = layer(
        root,
        'Smoke',
        {
            duration: 2,
            looping: true,
            startDelay: new ConstantValue(0.1),
            startLife: new IntervalValue(1.4, 1.8),
            startSpeed: new IntervalValue(0.5, 0.9),
            startSize: new IntervalValue(1.2, 1.6),
            startRotation: new IntervalValue(0, Math.PI * 2),
            startColor: new ConstantColor(new Color4(0.32, 0.28, 0.3, 0.8)),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{...ONCE, count: new ConstantValue(5)}],
            shape: new ConeEmitter({radius: 0.3, angle: 0.3}),
            texture: baseTexture(scene, 'smoke_puff'),
            ...sheetOf('smoke_puff'),
            blendTiles: true,
            transparent: true,
            blendMode: Constants.ALPHA_COMBINE,
            renderOrder: -1,
        },
        scene,
        true
    );
    smoke.addBehavior(
        new FrameOverLife(
            curve([
                [0, 0],
                [1, 15.99],
            ])
        )
    );
    smoke.addBehavior(new ColorOverLife(fade(0.1, 0.6)));
    return root;
}

/** A frost ring every two seconds: a ring spreading on the ground, glints thrown out, cold mist. */
export function frostRing(scene: Scene): TransformNode {
    const root = new TransformNode('Frost ring', scene);

    const ring = layer(
        root,
        'Ring',
        {
            duration: 2,
            looping: true,
            startLife: new ConstantValue(1.3),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(4.5),
            startColor: new ConstantColor(new Color4(0.55, 0.85, 1, 1)),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [ONCE],
            shape: new PointEmitter(),
            texture: baseTexture(scene, 'ring'),
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
            renderMode: RenderMode.HorizontalBillBoard,
        },
        scene
    );
    ring.emitter.position.y = 0.05;
    ring.addBehavior(
        new SizeOverLife(
            curve([
                [0, 0.15],
                [0.4, 0.85],
                [1, 1],
            ])
        )
    );
    ring.addBehavior(new ColorOverLife(fade(0, 0.3)));

    const glints = layer(
        root,
        'Glints',
        {
            duration: 2,
            looping: true,
            startLife: new IntervalValue(1.1, 1.5),
            startSpeed: new IntervalValue(1.5, 3),
            startSize: new IntervalValue(0.35, 0.6),
            startRotation: new IntervalValue(0, Math.PI * 2),
            startColor: new RandomColor(new Color4(0.8, 0.95, 1, 1), new Color4(0.4, 0.7, 1, 1)),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{...ONCE, count: new ConstantValue(18)}],
            shape: new ConeEmitter({radius: 0.6, angle: 1.1}),
            texture: baseTexture(scene, 'glint'),
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
        },
        scene,
        true
    );
    glints.addBehavior(new ApplyForce({x: 0, y: -1, z: 0}, new ConstantValue(3)));
    glints.addBehavior(
        new SizeOverLife(
            curve([
                [0, 1],
                [1, 0],
            ])
        )
    );

    const mist = layer(
        root,
        'Mist',
        {
            duration: 2,
            looping: true,
            startLife: new IntervalValue(1, 1.4),
            startSpeed: new IntervalValue(0.4, 0.8),
            startSize: new IntervalValue(1, 1.4),
            startColor: new ConstantColor(new Color4(0.6, 0.8, 1, 0.3)),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{...ONCE, count: new ConstantValue(6)}],
            shape: new ConeEmitter({radius: 0.8, angle: 1.3}),
            texture: baseTexture(scene, 'glow'),
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
        },
        scene,
        true
    );
    // Lifted off the ground, so the soft glows do not cut into it.
    mist.emitter.position.y = 0.6;
    mist.addBehavior(new ColorOverLife(fade(0.2, 0.5)));
    return root;
}

/** An arcane swirl that keeps going: sparks orbiting a core, glyphs turning round it. */
export function arcaneSwirl(scene: Scene): TransformNode {
    const root = new TransformNode('Arcane swirl', scene);

    layer(
        root,
        'Core',
        {
            duration: 1,
            looping: true,
            startLife: new ConstantValue(1),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(2.4),
            startColor: new ConstantColor(new Color4(0.75, 0.4, 1, 0.8)),
            emissionOverTime: new ConstantValue(3),
            shape: new PointEmitter(),
            texture: baseTexture(scene, 'glow'),
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
        },
        scene
    ).addBehavior(new ColorOverLife(fade(0.3, 0.7)));

    const sparks = layer(
        root,
        'Sparks',
        {
            duration: 2,
            looping: true,
            startLife: new IntervalValue(1.6, 2.2),
            startSpeed: new ConstantValue(0),
            startSize: new IntervalValue(0.16, 0.26),
            startColor: new RandomColor(new Color4(0.85, 0.6, 1, 1), new Color4(0.45, 0.7, 1, 1)),
            emissionOverTime: new ConstantValue(40),
            shape: new SphereEmitter({radius: 1.1, thickness: 0.2}),
            texture: baseTexture(scene, 'spark'),
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
        },
        scene
    );
    sparks.addBehavior(
        new VelocityOverLife(
            new ConstantValue(0),
            new ConstantValue(0.4),
            new ConstantValue(0),
            new ConstantValue(0),
            new ConstantValue(2.4)
        )
    );
    sparks.addBehavior(
        new ColorOverLife(
            new Gradient(
                [
                    [new Color3(1, 1, 1), 0],
                    [new Color3(1, 1, 1), 1],
                ],
                [
                    [0, 0],
                    [1, 0.15],
                    [1, 0.6],
                    [0, 1],
                ]
            )
        )
    );

    const glyphs = layer(
        root,
        'Glyphs',
        {
            duration: 2,
            looping: true,
            startLife: new ConstantValue(2),
            startSpeed: new ConstantValue(0),
            startSize: new IntervalValue(0.5, 0.7),
            startColor: new ConstantColor(new Color4(0.8, 0.6, 1, 1)),
            emissionOverTime: new ConstantValue(3),
            shape: new SphereEmitter({radius: 1.6, thickness: 0}),
            texture: baseTexture(scene, 'glyphs'),
            ...sheetOf('glyphs'),
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
        },
        scene
    );
    glyphs.addBehavior(
        new FrameOverLife(new ConstantValue(0), {fps: 8, frameCount: 4, rowLength: 4, rowCount: 4, randomRow: true})
    );
    glyphs.addBehavior(
        new VelocityOverLife(
            new ConstantValue(0),
            new ConstantValue(0),
            new ConstantValue(0),
            new ConstantValue(0),
            new ConstantValue(1.2)
        )
    );
    glyphs.addBehavior(new ColorOverLife(fade(0.2, 0.7)));
    return root;
}

/** The sample effects by the file name they are saved under. */
export const SAMPLE_EFFECTS: Record<string, (scene: Scene) => TransformNode> = {
    'ember-burst': emberBurst,
    'frost-ring': frostRing,
    'arcane-swirl': arcaneSwirl,
};
