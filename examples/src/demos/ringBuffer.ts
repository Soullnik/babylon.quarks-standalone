import {Constants} from '@babylonjs/core/Engines/constants';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3, Vector2} from '@babylonjs/core/Maths/math.vector';
import {
    ColorOverLife,
    ConstantColor,
    ConstantValue,
    Gradient,
    ParticleSystem,
    type ParticleSystemParameters,
    PointEmitter,
    RenderMode,
    SizeOverLife,
} from 'babylon.quarks';
import {curve} from '../shared/curves';
import {addLabel} from '../shared/labels';
import {addGround} from '../shared/stage';
import {baseTexture, sheetOf} from '../shared/textures';
import type {DemoContext, DemoRun} from '../types';

/** The radius of the circle each walker goes round, and its pace in radians a second. */
const RADIUS = 3.5;
const PACE = 0.7;
/** The length of a step, from one foot's print to the other's. */
const STEP = 0.75;
/** How far either foot is set from the line walked. */
const STANCE = 0.17;
/** The prints of each foot the buffer holds: about two thirds of the way round. */
const PRINTS = 9;
/** The height of the floor; the prints lie just above it. */
const FLOOR = -0.4;

/**
 * Ring Buffer Mode (Unity's option of the same name). A full system replaces its oldest particle
 * with each new one, so what it leaves behind is always its last `maxParticles`.
 *
 * - Left, `pauseUntilReplaced`: someone unseen walks round a circle leaving boot prints, one
 *   system per foot emitting over distance. A print lives a second and then waits, paused at the
 *   end of its life, until the buffer reuses it: the trail is always the last nine steps of each
 *   foot, and the oldest vanish as the walker goes on.
 * - Right, `loopUntilReplaced`: wards dropped along the same walk. Each loops the middle of its
 *   life (a ring swelling and fading) until it is replaced, so the whole trail keeps pulsing.
 */
export function init({scene, camera, add}: DemoContext): DemoRun {
    camera.setPosition(new BVector3(0, 8.5, 12));
    camera.setTarget(new BVector3(0, -0.5, 0.5));
    // Pale ground, as packed snow, so the dark prints read.
    addGround(scene, FLOOR, new Color3(0.36, 0.38, 0.45));
    addLabel(scene, 'Pause until replaced', new BVector3(-5, 0.2, 5.6));
    addLabel(scene, 'Loop until replaced', new BVector3(5, 0.2, 5.6));

    const flat = (parameters: Partial<ParticleSystemParameters>) =>
        new ParticleSystem({
            scene,
            duration: 1,
            looping: true,
            startSpeed: new ConstantValue(0),
            worldSpace: true,
            emissionOverTime: new ConstantValue(0),
            shape: new PointEmitter(),
            renderMode: RenderMode.HorizontalBillBoard,
            transparent: true,
            ...parameters,
        } as ParticleSystemParameters);

    // The prints: pressed in (a touch larger for a moment), then settling a little lighter.
    const prints = baseTexture(scene, 'footprints');
    const heading = new ConstantValue(0);
    const foot = (tile: number) => {
        const system = flat({
            startLife: new ConstantValue(1),
            startSize: new ConstantValue(0.8),
            startRotation: heading,
            startColor: new ConstantColor(new Color4(0.05, 0.06, 0.1, 0.95)),
            emissionOverDistance: new ConstantValue(1 / (2 * STEP)),
            maxParticles: PRINTS,
            ringBufferMode: 'pauseUntilReplaced',
            texture: prints,
            ...sheetOf('footprints'),
            startTileIndex: new ConstantValue(tile),
            blendMode: Constants.ALPHA_COMBINE,
        });
        system.addBehavior(
            new SizeOverLife(
                curve([
                    [0, 1.12],
                    [0.15, 1],
                    [1, 1],
                ])
            )
        );
        system.addBehavior(
            new ColorOverLife(
                new Gradient(
                    [
                        [new Color3(1, 1, 1), 0],
                        [new Color3(1, 1, 1), 1],
                    ],
                    [
                        [1, 0],
                        [0.85, 1],
                    ]
                )
            )
        );
        add(system);
        return system;
    };
    const left = foot(0);
    const right = foot(1);

    // The wards: a ring that, over the looped middle of its life, swells and fades, again and again.
    const wards = flat({
        startLife: new ConstantValue(1.2),
        startSize: new ConstantValue(1.3),
        startColor: new ConstantColor(new Color4(0.35, 0.8, 1, 1)),
        emissionOverDistance: new ConstantValue(1 / 1.3),
        maxParticles: 11,
        ringBufferMode: 'loopUntilReplaced',
        ringBufferLoopRange: new Vector2(0.3, 0.7),
        texture: baseTexture(scene, 'ring'),
        blendMode: Constants.ALPHA_ADD,
    });
    wards.addBehavior(
        new SizeOverLife(
            curve([
                [0, 0.2],
                [1, 1.2],
            ])
        )
    );
    wards.addBehavior(
        new ColorOverLife(
            new Gradient(
                [
                    [new Color3(1, 1, 1), 0],
                    [new Color3(1, 1, 1), 1],
                ],
                [
                    [0, 0],
                    [1, 0.32],
                    [0, 0.7],
                    [0, 1],
                ]
            )
        )
    );
    add(wards);

    // Walks both round their circles, the feet either side of the line and half a stride apart
    // (each foot prints once a stride), the prints turned to the way walked.
    const y = FLOOR + 0.01;
    let time = 0;
    const place = (system: ParticleSystem, cx: number, angle: number, side: number) => {
        const out = RADIUS + side * STANCE;
        system.emitter.position.set(cx + Math.cos(angle) * out, y, Math.sin(angle) * out);
    };
    return {
        update(delta) {
            time += delta;
            const angle = time * PACE;
            // Seen from above the walk is clockwise (the scene is right-handed), so the left foot
            // is on the outside of the circle; a print's toe points the way walked.
            heading.value = Math.PI - angle;
            place(left, -5, angle, 1);
            place(right, -5, angle + STEP / RADIUS, -1);
            wards.emitter.position.set(5 + Math.cos(angle) * RADIUS, y, Math.sin(angle) * RADIUS);
        },
    };
}
