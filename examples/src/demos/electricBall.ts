import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {
    ColorOverLife,
    ConstantColor,
    ConstantValue,
    FrameOverLife,
    IntervalValue,
    ParticleSystem,
    PointEmitter,
    RandomColor,
    RenderMode,
    SizeOverLife,
    SphereEmitter,
    Vector3Function,
} from 'babylon.quarks';
import {curve, fade} from '../shared/curves';
import {baseTexture, kenneySheet, kenneyTexture} from '../shared/textures';
import type {DemoContext, DemoRun} from '../types';

/**
 * A ball of lightning drifting on a figure-eight. Its core flickers (short glows replacing each
 * other), a web of electricity crackles over it and in it (webs of the sheet lit for a moment each,
 * turned and picked at random, overlapping into a net), bolts crack out of its centre in every
 * direction (a card whose `pivot` puts its left end on the particle, turned at random, each
 * showing a random bolt of the sheet for a moment), and sparks thrown off in world space stay
 * behind as it moves. Its webs and bolts are made from Kenney's CC0 particle pack.
 */
export function init({scene, camera, add}: DemoContext): DemoRun {
    camera.setPosition(new BVector3(0, 3, 8.2));
    camera.setTarget(new BVector3(0, 1.9, 0));
    const glow = baseTexture(scene, 'glow');
    const bolts = kenneyTexture(scene, 'bolts');
    const webs = kenneyTexture(scene, 'webs');
    const spark = baseTexture(scene, 'spark');

    // A ground to float over, lit by the ball where it passes.
    const ground = MeshBuilder.CreateDisc('ground', {radius: 30, tessellation: 64}, scene);
    ground.rotation.x = Math.PI / 2;
    const groundMaterial = new StandardMaterial('ground', scene);
    groundMaterial.diffuseColor = new Color3(0.2, 0.22, 0.27);
    groundMaterial.specularColor = Color3.Black();
    ground.material = groundMaterial;

    const ball = new TransformNode('Ball lightning', scene);
    const attach = (system: ParticleSystem, name: string) => {
        system.emitter.name = name;
        system.emitter.parent = ball;
        add(system);
        return system;
    };
    const common = {scene, transparent: true, blendMode: Constants.ALPHA_ADD, looping: true, duration: 1};

    // The glow round it and the flickering core: short glows, each a little different, so the
    // brightness never settles.
    attach(
        new ParticleSystem({
            ...common,
            startLife: new IntervalValue(0.25, 0.4),
            startSpeed: new ConstantValue(0),
            startSize: new IntervalValue(4.2, 5),
            startColor: new ConstantColor(new Color4(0.3, 0.5, 1, 0.6)),
            emissionOverTime: new ConstantValue(8),
            shape: new PointEmitter(),
            texture: glow,
            renderOrder: 0,
        }),
        'Aura'
    ).addBehavior(new ColorOverLife(fade(0.3, 0.6)));
    attach(
        new ParticleSystem({
            ...common,
            startLife: new IntervalValue(0.08, 0.16),
            startSpeed: new ConstantValue(0),
            startSize: new IntervalValue(0.6, 1),
            startColor: new RandomColor(new Color4(0.6, 0.78, 1, 0.75), new Color4(0.9, 0.95, 1, 0.9)),
            emissionOverTime: new ConstantValue(30),
            shape: new PointEmitter(),
            texture: glow,
            renderOrder: 2,
        }),
        'Core'
    ).addBehavior(new ColorOverLife(fade(0.2, 0.5)));

    // A web of electricity over it: crackling webs the size of the ball, each lit for a moment,
    // turned at random and a random one of the sheet, so they overlap into a net that never holds
    // still; smaller, brighter ones crackle inside.
    for (const [name, size, rate, color, order] of [
        ['Web', [3, 4.4], 34, [new Color4(0.35, 0.55, 1, 0.85), new Color4(0.7, 0.85, 1, 1)], 1],
        ['Crackle', [1.3, 2], 22, [new Color4(0.5, 0.7, 1, 0.85), new Color4(0.85, 0.93, 1, 1)], 2],
    ] as const) {
        attach(
            new ParticleSystem({
                ...common,
                startLife: new IntervalValue(0.06, 0.14),
                startSpeed: new ConstantValue(0),
                startSize: new IntervalValue(size[0], size[1]),
                startRotation: new IntervalValue(0, Math.PI * 2),
                startColor: new RandomColor(color[0], color[1]),
                emissionOverTime: new ConstantValue(rate),
                shape: new PointEmitter(),
                texture: webs,
                ...kenneySheet('webs'),
                startTileIndex: new IntervalValue(0, 4),
                renderOrder: order,
            }),
            name
        );
    }

    // Bolts out of the centre: a 3:1 card whose left end sits on the particle (pivot +0.5 in x),
    // turned at random, flickering through random bolts of the sheet.
    const boltSystem = attach(
        new ParticleSystem({
            ...common,
            startLife: new IntervalValue(0.08, 0.2),
            startSpeed: new ConstantValue(0),
            startSize: new Vector3Function(
                new IntervalValue(1.8, 3.2),
                new IntervalValue(0.55, 0.9),
                new ConstantValue(1)
            ),
            startRotation: new IntervalValue(0, Math.PI * 2),
            startColor: new RandomColor(new Color4(0.55, 0.75, 1, 1), new Color4(0.9, 0.95, 1, 1)),
            emissionOverTime: new ConstantValue(18),
            shape: new PointEmitter(),
            texture: bolts,
            ...kenneySheet('bolts'),
            startTileIndex: new ConstantValue(0),
            pivot: new BVector3(0.5, 0, 0),
            renderOrder: 3,
        }),
        'Bolts'
    );
    boltSystem.addBehavior(new FrameOverLife(new ConstantValue(0), {fps: 24, frameCount: 4, random: true}));

    // Sparks thrown off, simulated in world space: they stay where they were thrown as the ball
    // moves on, and fall.
    const sparks = attach(
        new ParticleSystem({
            ...common,
            worldSpace: true,
            startLife: new IntervalValue(0.3, 0.7),
            startSpeed: new IntervalValue(1.5, 4),
            startSize: new IntervalValue(0.08, 0.16),
            startColor: new RandomColor(new Color4(0.6, 0.8, 1, 1), new Color4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(40),
            shape: new SphereEmitter({radius: 0.6, thickness: 0}),
            texture: spark,
            renderMode: RenderMode.StretchedBillBoard,
            rendererEmitterSettings: {speedFactor: 0.08, lengthFactor: 1},
            renderOrder: 3,
        }),
        'Sparks'
    );
    sparks.addBehavior(
        new SizeOverLife(
            curve([
                [0, 1],
                [1, 0],
            ])
        )
    );

    // Its light on the ground, which follows it on the ground below.
    const pool = new ParticleSystem({
        ...common,
        startLife: new IntervalValue(0.2, 0.35),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(4.5, 5.5),
        startColor: new ConstantColor(new Color4(0.3, 0.5, 1, 0.5)),
        emissionOverTime: new ConstantValue(10),
        shape: new PointEmitter(),
        texture: glow,
        renderMode: RenderMode.HorizontalBillBoard,
        renderOrder: 0,
    });
    pool.emitter.name = 'Light on the ground';
    pool.addBehavior(new ColorOverLife(fade(0.3, 0.6)));
    add(pool);

    // Drifts on a figure-eight, bobbing.
    let time = 0;
    return {
        update(delta) {
            time += delta;
            ball.position.set(Math.sin(time * 0.6) * 2.6, 2.4 + Math.sin(time * 1.7) * 0.3, Math.sin(time * 1.2) * 1.2);
            pool.emitter.position.set(ball.position.x, 0.02, ball.position.z);
        },
    };
}
