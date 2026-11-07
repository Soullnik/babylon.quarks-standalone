import {Constants} from '@babylonjs/core/Engines/constants';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
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
import {addGround} from '../shared/stage';
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
    addGround(scene, 0, new Color3(0.2, 0.22, 0.27));

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
            startSize: new IntervalValue(0.45, 0.75),
            startColor: new RandomColor(new Color4(0.45, 0.65, 1, 0.6), new Color4(0.75, 0.88, 1, 0.75)),
            emissionOverTime: new ConstantValue(16),
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
        ['Web', [3, 4.4], 30, [new Color4(0.22, 0.42, 1, 0.5), new Color4(0.45, 0.68, 1, 0.65)], 1],
        ['Crackle', [1.3, 2], 18, [new Color4(0.4, 0.62, 1, 0.55), new Color4(0.7, 0.85, 1, 0.75)], 2],
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
            startLife: new IntervalValue(0.06, 0.12),
            startSpeed: new ConstantValue(0),
            startSize: new Vector3Function(
                new IntervalValue(1, 1.8),
                new IntervalValue(0.4, 0.6),
                new ConstantValue(1)
            ),
            startRotation: new IntervalValue(0, Math.PI * 2),
            startColor: new RandomColor(new Color4(0.55, 0.75, 1, 1), new Color4(0.9, 0.95, 1, 1)),
            emissionOverTime: new ConstantValue(14),
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

    // Now and then it strikes the ground: a bolt from the ball down (a card hanging from its top
    // end, turned to point down), and a flash where it lands. Each is one burst, replayed (restart)
    // at the strike, placed under the ball.
    const once = [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}];
    const strike = new ParticleSystem({
        ...common,
        looping: false,
        duration: 0.2,
        startLife: new ConstantValue(0.12),
        startSpeed: new ConstantValue(0),
        startSize: new Vector3Function(new ConstantValue(2.6), new IntervalValue(0.7, 0.9), new ConstantValue(1)),
        startRotation: new ConstantValue(-Math.PI / 2),
        startColor: new ConstantColor(new Color4(0.75, 0.88, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: once,
        shape: new PointEmitter(),
        texture: bolts,
        ...kenneySheet('bolts'),
        startTileIndex: new IntervalValue(0, 4),
        pivot: new BVector3(0.5, 0, 0),
        renderOrder: 3,
    });
    strike.emitter.name = 'Strike';
    add(strike);
    const landing = new ParticleSystem({
        ...common,
        looping: false,
        duration: 0.4,
        startLife: new ConstantValue(0.35),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(2.6),
        startRotation: new IntervalValue(0, Math.PI * 2),
        startColor: new ConstantColor(new Color4(0.55, 0.75, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: once,
        shape: new PointEmitter(),
        texture: kenneyTexture(scene, 'stars'),
        ...kenneySheet('stars'),
        startTileIndex: new ConstantValue(3),
        renderMode: RenderMode.HorizontalBillBoard,
        renderOrder: 1,
    });
    landing.addBehavior(new ColorOverLife(fade(0, 0.25)));
    landing.emitter.name = 'Strike flash';
    add(landing);
    strike.stop();
    landing.stop();

    // Drifts on a figure-eight, bobbing.
    let time = 0;
    let nextStrike = 0.8;
    return {
        update(delta) {
            time += delta;
            ball.position.set(Math.sin(time * 0.6) * 2.6, 2.4 + Math.sin(time * 1.7) * 0.3, Math.sin(time * 1.2) * 1.2);
            pool.emitter.position.set(ball.position.x, 0.02, ball.position.z);
            if (time >= nextStrike) {
                // The hanging card's top end on the ball's underside, its length to the ground.
                strike.emitter.position.set(ball.position.x, ball.position.y - 0.2, ball.position.z);
                landing.emitter.position.set(ball.position.x, 0.03, ball.position.z);
                strike.restart();
                landing.restart();
                nextStrike = time + 0.7 + Math.random() * 0.9;
            }
        },
    };
}
