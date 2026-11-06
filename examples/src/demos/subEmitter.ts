import {Constants} from '@babylonjs/core/Engines/constants';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {
    ApplyForce,
    ColorOverLife,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    EmitSubParticleSystem,
    Gradient,
    IntervalValue,
    LimitSpeedOverLife,
    type ParticleEmitter,
    ParticleSystem,
    type ParticleSystemParameters,
    PointEmitter,
    RandomColor,
    RenderMode,
    SizeOverLife,
    SphereEmitter,
    SubParticleEmitMode,
} from 'babylon.quarks';
import {curve, fade} from '../shared/curves';
import {addGround} from '../shared/stage';
import {baseTexture} from '../shared/textures';
import type {DemoContext} from '../types';

/**
 * Fireworks, built from sub emitters (`EmitSubParticleSystem`), each a system of its own that
 * only its parent drives (`onlyUsedByOther`):
 *
 * - Birth: while a rocket flies it sheds a stream of sparks, the spark system's rate running for
 *   each rocket as long as it lives.
 * - Death: where a rocket dies a shell bursts, sparks thrown out round it, in the rocket's colour
 *   (`inherit: ['color']`), and a flash.
 * - Death with a probability: about a third of the shell's sparks crackle as they burn out
 *   (`emitProbability` 0.35), a little white pop each.
 */
export function init({scene, camera, add}: DemoContext) {
    camera.setPosition(new BVector3(0, 4, 24));
    camera.setTarget(new BVector3(0, 8, 0));
    addGround(scene);
    const spark = baseTexture(scene, 'spark');
    const streak = baseTexture(scene, 'streak');
    const glow = baseTexture(scene, 'glow');
    const glint = baseTexture(scene, 'glint');

    const system = (name: string, parameters: Partial<ParticleSystemParameters>) => {
        const ps = new ParticleSystem({
            scene,
            duration: 1,
            looping: false,
            worldSpace: true,
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
            emissionOverTime: new ConstantValue(0),
            ...parameters,
        } as ParticleSystemParameters);
        ps.emitter.name = name;
        add(ps);
        return ps;
    };
    const burst = (count: number) => [
        {time: 0, count: new ConstantValue(count), cycle: 1, interval: 0, probability: 1},
    ];

    // The rockets: shot up at a slant, slowing under gravity, each its own colour.
    const rockets = system('Rockets', {
        duration: 3,
        looping: true,
        startLife: new IntervalValue(1.1, 1.4),
        startSpeed: new IntervalValue(10, 12),
        startSize: new ConstantValue(0.16),
        startColor: new RandomColor(new Color4(1, 0.35, 0.2, 1), new Color4(0.35, 0.75, 1, 1)),
        emissionOverTime: new ConstantValue(1.4),
        shape: new ConeEmitter({radius: 2.5, angle: 0.2}),
        texture: spark,
    });
    rockets.addBehavior(new ApplyForce(new BVector3(0, -1, 0), new ConstantValue(5)));
    rockets.emitter.rotation.x = -Math.PI / 2;

    // Birth: the stream of sparks a rocket sheds while it flies, falling behind it.
    const trail = system('Rocket sparks', {
        duration: 1,
        looping: true,
        onlyUsedByOther: true,
        startLife: new IntervalValue(0.3, 0.6),
        startSpeed: new IntervalValue(0.2, 0.8),
        startSize: new IntervalValue(0.06, 0.12),
        startColor: new ConstantColor(new Color4(1, 0.8, 0.5, 1)),
        emissionOverTime: new ConstantValue(40),
        shape: new SphereEmitter({radius: 0.05}),
        texture: spark,
    });
    trail.addBehavior(new ApplyForce(new BVector3(0, -1, 0), new ConstantValue(3)));
    trail.addBehavior(new ColorOverLife(fade(0, 0.3)));

    // Death: the shell bursting, its sparks in the rocket's colour, eased out, falling.
    const shell = system('Shell', {
        duration: 0.2,
        onlyUsedByOther: true,
        startLife: new IntervalValue(1.2, 1.7),
        startSpeed: new IntervalValue(6, 8),
        startSize: new IntervalValue(0.16, 0.26),
        startColor: new ConstantColor(new Color4(1, 1, 1, 1)),
        emissionBursts: burst(90),
        shape: new SphereEmitter({radius: 0.1}),
        texture: streak,
        renderMode: RenderMode.StretchedBillBoard,
        rendererEmitterSettings: {speedFactor: 0.12, lengthFactor: 1},
    });
    shell.addBehavior(
        new LimitSpeedOverLife(
            curve([
                [0, 8],
                [0.3, 2.5],
                [1, 0.5],
            ]),
            1
        )
    );
    shell.addBehavior(new ApplyForce(new BVector3(0, -1, 0), new ConstantValue(2)));
    shell.addBehavior(
        new ColorOverLife(
            new Gradient(
                [
                    [new Color3(1, 1, 1), 0],
                    [new Color3(1, 1, 1), 0.5],
                    [new Color3(0.8, 0.4, 0.3), 1],
                ],
                [
                    [1, 0],
                    [1, 0.6],
                    [0, 1],
                ]
            )
        )
    );
    const flash = system('Flash', {
        duration: 0.2,
        onlyUsedByOther: true,
        startLife: new ConstantValue(0.35),
        startSize: new ConstantValue(4),
        startColor: new ConstantColor(new Color4(1, 0.9, 0.7, 0.8)),
        emissionBursts: burst(1),
        shape: new PointEmitter(),
        texture: glow,
    });
    flash.addBehavior(
        new SizeOverLife(
            curve([
                [0, 0.3],
                [0.2, 1],
                [1, 0.6],
            ])
        )
    );
    flash.addBehavior(new ColorOverLife(fade(0, 0.2)));

    // Death, sometimes: a shell spark crackling as it burns out.
    const crackle = system('Crackle', {
        duration: 0.2,
        onlyUsedByOther: true,
        startLife: new IntervalValue(0.12, 0.2),
        startSize: new IntervalValue(0.25, 0.45),
        startRotation: new IntervalValue(0, Math.PI),
        startColor: new ConstantColor(new Color4(1, 1, 1, 1)),
        emissionBursts: burst(1),
        shape: new PointEmitter(),
        texture: glint,
    });
    crackle.addBehavior(new ColorOverLife(fade(0, 0.3)));

    const sub = (parent: ParticleSystem, target: ParticleSystem, mode: SubParticleEmitMode, probability = 1) =>
        parent.addBehavior(
            new EmitSubParticleSystem(parent, false, target.emitter as ParticleEmitter, mode, probability, ['color'])
        );
    sub(rockets, trail, SubParticleEmitMode.Birth);
    sub(rockets, shell, SubParticleEmitMode.Death);
    sub(rockets, flash, SubParticleEmitMode.Death);
    sub(shell, crackle, SubParticleEmitMode.Death, 0.35);
}
