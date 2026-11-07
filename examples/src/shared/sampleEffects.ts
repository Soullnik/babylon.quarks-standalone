import {Constants} from '@babylonjs/core/Engines/constants';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Scene} from '@babylonjs/core/scene';
import {
    ApplyForce,
    ColorOverLength,
    ColorOverLife,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    DonutEmitter,
    EulerGenerator,
    FrameOverLife,
    Gradient,
    IntervalValue,
    ParticleSystem,
    type ParticleSystemParameters,
    PointEmitter,
    RandomColor,
    RenderMode,
    RotationOverLife,
    SizeOverLife,
    SphereEmitter,
    VelocityOverLife,
    WidthOverLength,
} from 'babylon.quarks';
import {curve, fade} from './curves';
import {spike} from './geometry';
import {baseTexture, kenneySheet, kenneyTexture, sheetOf} from './textures';

/**
 * Small finished effects built in code, each under a root of its own, not yet added to a renderer.
 * `scripts/write-sample-effects.mts` saves them as the files in `examples/public/effects/`, which
 * the Loading Effects demo loads; the demo also builds one here and saves and loads it again.
 *
 * Each is built in layers as a game's effect is: something dark behind, a coloured body, a small
 * white-hot core, and something on the ground.
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

/** Colour from `from` to `to` over life, alpha in, held, then out. */
function heat(from: Color3, to: Color3, holdUntil = 0.4): Gradient {
    return new Gradient(
        [
            [from, 0],
            [to, 1],
        ],
        [
            [0, 0],
            [1, 0.08],
            [1, holdUntil],
            [0, 1],
        ]
    );
}

/**
 * Soft ends for a trail, as a game's long particles have: its alpha rises over the first part from
 * the head, holds, and runs out to nothing at the tail (`ColorOverLength`, 0 at the head), and it
 * narrows toward the tail (`WidthOverLength`), so it never ends in a hard cut.
 */
function softEnds(trail: ParticleSystem): void {
    trail.addBehavior(
        new ColorOverLength(
            new Gradient(
                [
                    [new Color3(1, 1, 1), 0],
                    [new Color3(1, 1, 1), 1],
                ],
                [
                    [0, 0],
                    [1, 0.12],
                    [1, 0.45],
                    [0, 1],
                ]
            )
        )
    );
    trail.addBehavior(
        new WidthOverLength(
            curve([
                [0, 0.7],
                [0.15, 1],
                [1, 0.25],
            ])
        )
    );
}

/**
 * A fiery burst every two seconds: a flash, a fireball of rolling flame, embers thrown out
 * trailing light and falling, dark smoke rising after, its light on the ground.
 */
export function emberBurst(scene: Scene): TransformNode {
    const root = new TransformNode('Ember burst', scene);
    const puffs = kenneyTexture(scene, 'puffs');

    // Dark smoke behind, alpha-blended: random puffs, turning, swelling as they rise.
    const smoke = layer(
        root,
        'Smoke',
        {
            duration: 2,
            looping: true,
            startDelay: new ConstantValue(0.15),
            startLife: new IntervalValue(1.5, 2),
            startSpeed: new IntervalValue(0.6, 1.1),
            startSize: new IntervalValue(1.3, 1.8),
            startRotation: new IntervalValue(0, Math.PI * 2),
            startColor: new RandomColor(new Color4(0.16, 0.13, 0.13, 0.75), new Color4(0.26, 0.21, 0.2, 0.75)),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{...ONCE, count: new ConstantValue(7)}],
            shape: new ConeEmitter({radius: 0.4, angle: 0.35}),
            texture: puffs,
            ...kenneySheet('puffs'),
            startTileIndex: new IntervalValue(0, 25),
            transparent: true,
            blendMode: Constants.ALPHA_COMBINE,
            renderOrder: -1,
        },
        scene,
        true
    );
    smoke.addBehavior(new RotationOverLife(new IntervalValue(-0.6, 0.6)));
    smoke.addBehavior(
        new SizeOverLife(
            curve([
                [0, 0.6],
                [1, 1.6],
            ])
        )
    );
    smoke.addBehavior(new ColorOverLife(fade(0.15, 0.55)));

    // The fireball: puffs of flame bursting out, from white-yellow to deep red as they cool.
    const fireball = layer(
        root,
        'Fireball',
        {
            duration: 2,
            looping: true,
            startLife: new IntervalValue(0.45, 0.7),
            startSpeed: new IntervalValue(0.8, 1.8),
            startSize: new IntervalValue(1, 1.5),
            startRotation: new IntervalValue(0, Math.PI * 2),
            startColor: new ConstantColor(new Color4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{...ONCE, count: new ConstantValue(9)}],
            shape: new SphereEmitter({radius: 0.3, thickness: 1}),
            texture: puffs,
            ...kenneySheet('puffs'),
            startTileIndex: new IntervalValue(0, 25),
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
        },
        scene
    );
    fireball.emitter.position.y = 0.6;
    fireball.addBehavior(new ColorOverLife(heat(new Color3(1, 0.85, 0.45), new Color3(0.7, 0.12, 0.02), 0.3)));
    fireball.addBehavior(
        new SizeOverLife(
            curve([
                [0, 0.5],
                [0.4, 1.2],
                [1, 1.5],
            ])
        )
    );
    fireball.addBehavior(new RotationOverLife(new IntervalValue(-1.5, 1.5)));

    // The flash at its heart.
    const flash = layer(
        root,
        'Flash',
        {
            duration: 2,
            looping: true,
            startLife: new ConstantValue(0.3),
            startSpeed: new ConstantValue(0),
            startSize: new IntervalValue(2.6, 3.1),
            startRotation: new IntervalValue(0, Math.PI * 2),
            startColor: new ConstantColor(new Color4(1, 0.85, 0.55, 1)),
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
    flash.emitter.position.y = 0.6;
    flash.addBehavior(
        new FrameOverLife(
            curve([
                [0, 0],
                [1, 5.99],
            ])
        )
    );

    // Embers thrown up and out, each trailing light, falling back.
    const embers = layer(
        root,
        'Embers',
        {
            duration: 2,
            looping: true,
            startLife: new IntervalValue(0.9, 1.4),
            startSpeed: new IntervalValue(3.5, 6),
            startSize: new IntervalValue(0.06, 0.11),
            startColor: new RandomColor(new Color4(1, 0.9, 0.55, 1), new Color4(1, 0.5, 0.15, 1)),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{...ONCE, count: new ConstantValue(28)}],
            shape: new ConeEmitter({radius: 0.25, angle: 0.75}),
            texture: kenneyTexture(scene, 'ribbon'),
            renderMode: RenderMode.Trail,
            rendererEmitterSettings: {startLength: new ConstantValue(10), followLocalOrigin: false},
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
        },
        scene,
        true
    );
    embers.emitter.position.y = 0.4;
    embers.addBehavior(new ApplyForce({x: 0, y: -1, z: 0}, new ConstantValue(7)));
    embers.addBehavior(new ColorOverLife(fade(0, 0.65)));
    softEnds(embers);

    // Its light on the ground.
    const glow = layer(
        root,
        'Ground glow',
        {
            duration: 2,
            looping: true,
            startLife: new ConstantValue(0.7),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(4),
            startColor: new ConstantColor(new Color4(1, 0.5, 0.15, 0.6)),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [ONCE],
            shape: new PointEmitter(),
            texture: baseTexture(scene, 'glow'),
            renderMode: RenderMode.HorizontalBillBoard,
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
        },
        scene
    );
    glow.emitter.position.y = 0.03;
    glow.addBehavior(new ColorOverLife(fade(0.05, 0.4)));
    return root;
}

/**
 * A frost nova every two seconds: ice spikes bursting out of the ground in a ring and sinking
 * back, a ring of frost running out over the ground, glints thrown up, cold mist rolling out.
 */
export function frostRing(scene: Scene): TransformNode {
    const root = new TransformNode('Frost ring', scene);

    // Ice spikes: a faceted mesh with streaks and cracks running up it, tinted pale blue, its edges
    // lit; opaque, so it writes depth and shows its outer faces only. 'world' keeps them upright
    // although the ring is laid flat by turning the emitter.
    const spikes = layer(
        root,
        'Ice spikes',
        {
            duration: 2,
            looping: true,
            startLife: new IntervalValue(1.5, 1.8),
            startSpeed: new ConstantValue(0),
            startSize: new IntervalValue(0.9, 1.6),
            startRotation: new EulerGenerator(
                new IntervalValue(-0.4, 0.4),
                new IntervalValue(0, Math.PI * 2),
                new IntervalValue(-0.4, 0.4),
                'YXZ'
            ),
            startColor: new ConstantColor(new Color4(0.62, 0.88, 1, 1)),
            // The streaked texture is mostly dark: brightened in linear space to read as ice.
            materialColorScale: 2.4,
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{...ONCE, count: new ConstantValue(11)}],
            shape: new DonutEmitter({radius: 1.3, donutRadius: 0.3, thickness: 1, arc: Math.PI * 2}),
            renderMode: RenderMode.Mesh,
            renderAlignment: 'world',
            ...spike(0.16),
            texture: kenneyTexture(scene, 'veins', true),
            rim: {color: [0.7, 0.92, 1], power: 2, strength: 1, mode: 'add'},
            lighting: 'fixed',
            transparent: false,
            renderFace: 'front',
            blendMode: Constants.ALPHA_DISABLE,
        },
        scene,
        true
    );
    spikes.addBehavior(
        new SizeOverLife(
            curve([
                [0, 0],
                [0.1, 1.08],
                [0.16, 1],
                [0.8, 1],
                [1, 0],
            ])
        )
    );

    // A ring of frost running out over the ground.
    const ring = layer(
        root,
        'Ring',
        {
            duration: 2,
            looping: true,
            startLife: new ConstantValue(1.1),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(5.5),
            startRotation: new IntervalValue(0, Math.PI * 2),
            startColor: new ConstantColor(new Color4(0.5, 0.82, 1, 1)),
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
                [0.35, 0.85],
                [1, 1],
            ])
        )
    );
    ring.addBehavior(new ColorOverLife(fade(0, 0.3)));

    // Glints thrown up from the ice, turning, shrinking away.
    const glints = layer(
        root,
        'Glints',
        {
            duration: 2,
            looping: true,
            startLife: new IntervalValue(0.9, 1.3),
            startSpeed: new IntervalValue(1.8, 3.4),
            startSize: new IntervalValue(0.25, 0.5),
            startRotation: new IntervalValue(0, Math.PI * 2),
            startColor: new RandomColor(new Color4(0.8, 0.95, 1, 1), new Color4(0.45, 0.75, 1, 1)),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{...ONCE, count: new ConstantValue(22)}],
            shape: new ConeEmitter({radius: 1.2, angle: 0.9}),
            texture: kenneyTexture(scene, 'stars'),
            ...kenneySheet('stars'),
            startTileIndex: new IntervalValue(0, 3),
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
        },
        scene,
        true
    );
    glints.addBehavior(new ApplyForce({x: 0, y: -1, z: 0}, new ConstantValue(3)));
    glints.addBehavior(new RotationOverLife(new IntervalValue(-3, 3)));
    glints.addBehavior(
        new SizeOverLife(
            curve([
                [0, 1],
                [1, 0],
            ])
        )
    );

    // Cold mist rolling out low over the ground.
    const mist = layer(
        root,
        'Mist',
        {
            duration: 2,
            looping: true,
            startLife: new IntervalValue(1.1, 1.5),
            startSpeed: new IntervalValue(0.8, 1.4),
            startSize: new IntervalValue(1.2, 1.8),
            startRotation: new IntervalValue(0, Math.PI * 2),
            startColor: new ConstantColor(new Color4(0.55, 0.8, 1, 0.22)),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{...ONCE, count: new ConstantValue(10)}],
            shape: new ConeEmitter({radius: 0.8, angle: 1.45}),
            texture: kenneyTexture(scene, 'puffs'),
            ...kenneySheet('puffs'),
            startTileIndex: new IntervalValue(0, 25),
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
        },
        scene,
        true
    );
    mist.emitter.position.y = 0.3;
    mist.addBehavior(new RotationOverLife(new IntervalValue(-0.5, 0.5)));
    mist.addBehavior(new ColorOverLife(fade(0.2, 0.5)));
    return root;
}

/**
 * An arcane swirl that keeps going: a magic circle turning on the ground, a glowing core, two
 * ribbons of light orbiting it, glyphs and sparks going round.
 */
export function arcaneSwirl(scene: Scene): TransformNode {
    const root = new TransformNode('Arcane swirl', scene);
    const standing = {
        duration: 1,
        looping: false,
        startLife: new ConstantValue(1e6),
        startSpeed: new ConstantValue(0),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [ONCE],
        shape: new PointEmitter(),
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
    };

    // A magic circle turning slowly on the ground under it.
    layer(
        root,
        'Circle',
        {
            ...standing,
            startSize: new ConstantValue(4.2),
            startColor: new ConstantColor(new Color4(0.7, 0.4, 1, 0.85)),
            texture: kenneyTexture(scene, 'sigil'),
            renderMode: RenderMode.HorizontalBillBoard,
        },
        scene
    ).addBehavior(new RotationOverLife(new ConstantValue(0.35)));

    layer(
        root,
        'Core',
        {
            duration: 1,
            looping: true,
            startLife: new ConstantValue(1),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(2.2),
            startColor: new ConstantColor(new Color4(0.75, 0.4, 1, 0.7)),
            emissionOverTime: new ConstantValue(3),
            shape: new PointEmitter(),
            texture: baseTexture(scene, 'glow'),
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
        },
        scene
    ).emitter.position.y = 1.3;

    // Two ribbons of light orbiting the core: trails from points on a sphere, turned round y.
    const ribbons = layer(
        root,
        'Ribbons',
        {
            duration: 2,
            looping: true,
            startLife: new IntervalValue(1.4, 1.8),
            startSpeed: new ConstantValue(0),
            startSize: new IntervalValue(0.35, 0.5),
            startColor: new RandomColor(new Color4(0.85, 0.55, 1, 1), new Color4(0.5, 0.7, 1, 1)),
            emissionOverTime: new ConstantValue(4),
            shape: new SphereEmitter({radius: 1.2, thickness: 0}),
            texture: kenneyTexture(scene, 'ribbon'),
            renderMode: RenderMode.Trail,
            rendererEmitterSettings: {startLength: new ConstantValue(30), followLocalOrigin: false},
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
        },
        scene
    );
    ribbons.emitter.position.y = 1.3;
    ribbons.addBehavior(
        new VelocityOverLife(
            new ConstantValue(0),
            new ConstantValue(0.3),
            new ConstantValue(0),
            new ConstantValue(0),
            new ConstantValue(3.2)
        )
    );
    ribbons.addBehavior(new ColorOverLife(fade(0.15, 0.6)));
    softEnds(ribbons);

    const sparks = layer(
        root,
        'Sparks',
        {
            duration: 2,
            looping: true,
            startLife: new IntervalValue(1.6, 2.2),
            startSpeed: new ConstantValue(0),
            startSize: new IntervalValue(0.12, 0.2),
            startColor: new RandomColor(new Color4(0.85, 0.6, 1, 1), new Color4(0.45, 0.7, 1, 1)),
            emissionOverTime: new ConstantValue(40),
            shape: new SphereEmitter({radius: 1.1, thickness: 0.2}),
            texture: baseTexture(scene, 'spark'),
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
        },
        scene
    );
    sparks.emitter.position.y = 1.3;
    sparks.addBehavior(
        new VelocityOverLife(
            new ConstantValue(0),
            new ConstantValue(0.4),
            new ConstantValue(0),
            new ConstantValue(0),
            new ConstantValue(2.4)
        )
    );
    sparks.addBehavior(new ColorOverLife(fade(0.15, 0.6)));

    const glyphs = layer(
        root,
        'Glyphs',
        {
            duration: 2,
            looping: true,
            startLife: new ConstantValue(2),
            startSpeed: new ConstantValue(0),
            startSize: new IntervalValue(0.6, 0.85),
            startColor: new ConstantColor(new Color4(0.85, 0.65, 1, 1)),
            emissionOverTime: new ConstantValue(3),
            shape: new SphereEmitter({radius: 1.7, thickness: 0}),
            texture: baseTexture(scene, 'glyphs'),
            ...sheetOf('glyphs'),
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
        },
        scene
    );
    glyphs.emitter.position.y = 1.3;
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
