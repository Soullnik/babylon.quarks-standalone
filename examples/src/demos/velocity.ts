import {Constants} from '@babylonjs/core/Engines/constants';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {
    ChangeEmitDirection,
    ColorBySpeed,
    ColorOverLife,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    ForceOverLife,
    Gradient,
    IntervalValue,
    ParticleSystem,
    type ParticleSystemParameters,
    RandomizeDirection,
    RotationBySpeed,
    SizeBySpeed,
    SphereEmitter,
    VelocityOverLife,
} from 'babylon.quarks';
import {curve, fade} from '../shared/curves';
import {addCaption} from '../shared/labels';
import {addGround} from '../shared/stage';
import {baseTexture} from '../shared/textures';
import {showTopics, type Topic} from '../shared/topics';
import type {DemoContext} from '../types';

const FLOOR = -2.6;

/** Columns' x, `count` of them spread evenly `gap` apart round the centre. */
function columns(count: number, gap: number): number[] {
    return Array.from({length: count}, (_, i) => (i - (count - 1) / 2) * gap);
}

/**
 * How particles move once they are born, one topic at a time (picked in the panel), each labelled
 * in the scene.
 *
 * - Velocity over life: a velocity added on top of the particle's own, drifting along a curve
 *   (linear), turning round the emitter (orbital), moving away from it (radial), and turning round
 *   a point beside it (`orbitalOffset`).
 * - By speed: fountains whose sparks slow to a stop at the top and speed up as they fall back,
 *   sized (`SizeBySpeed`), spun (`RotationBySpeed`) and coloured (`ColorBySpeed`) by their speed.
 * - Emit direction: volleys from one narrow cone: as they are, a tight knot; each start direction
 *   randomised part of the way (`RandomizeDirection`), a filled cloud; and each turned away from
 *   its own by the same angle (`ChangeEmitDirection`), a hollow cone, so a volley flies out as a
 *   ring.
 * - Forces: a random sideways force over life, picked once per particle (each goes its own way)
 *   or every step (`randomized`: it jitters and averages out); and a fountain under an emitter
 *   scaled to half, whose gravity shrinks with it (`scaleWithEmitter`) or keeps its full strength.
 */
export function init({scene, camera, add, controls}: DemoContext) {
    camera.setPosition(new BVector3(0, 1.2, 12.5));
    camera.setTarget(new BVector3(0, 0.5, 0));
    addGround(scene, FLOOR);
    const spark = baseTexture(scene, 'spark');
    const glint = baseTexture(scene, 'glint');

    const system = (parent: TransformNode, parameters: Omit<ParticleSystemParameters, 'scene'>) => {
        const ps = new ParticleSystem({scene, ...parameters});
        ps.emitter.parent = parent;
        add(ps);
        return ps;
    };
    const toUp = (ps: ParticleSystem) => {
        ps.emitter.rotation.x = -Math.PI / 2; // cones emit along +z; aim them up
        return ps;
    };

    const topics: Topic[] = [];

    topics.push({
        name: 'Velocity over life',
        build(group) {
            const xs = columns(4, 3.6);
            const kinds: {title: string; code: string; color: Color4; radius: number; velocity: VelocityOverLife}[] = [
                {
                    title: 'Linear',
                    code: 'linearX: curve, linearY: 1.6',
                    color: new Color4(1, 0.75, 0.35, 1),
                    radius: 0.3,
                    velocity: new VelocityOverLife(
                        curve([
                            [0, -1.6],
                            [0.5, 1.6],
                            [1, -1.6],
                        ]),
                        new ConstantValue(1.6)
                    ),
                },
                {
                    title: 'Orbital',
                    code: 'orbitalY: 2, linearY: 0.7',
                    color: new Color4(0.45, 0.85, 1, 1),
                    radius: 1,
                    velocity: new VelocityOverLife(
                        new ConstantValue(0),
                        new ConstantValue(0.7),
                        new ConstantValue(0),
                        new ConstantValue(0),
                        new ConstantValue(2)
                    ),
                },
                {
                    title: 'Radial',
                    code: 'radial: 0.9, orbitalY: 2.5',
                    color: new Color4(0.7, 1, 0.45, 1),
                    radius: 0.2,
                    velocity: new VelocityOverLife(
                        new ConstantValue(0),
                        new ConstantValue(0),
                        new ConstantValue(0),
                        new ConstantValue(0),
                        new ConstantValue(2.5),
                        new ConstantValue(0),
                        'local',
                        new ConstantValue(0.9)
                    ),
                },
                {
                    title: 'Round a point beside it',
                    code: 'orbitalZ: 2.5, orbitalOffset: (1, 0, 0)',
                    color: new Color4(1, 0.5, 0.8, 1),
                    radius: 0.15,
                    velocity: new VelocityOverLife(
                        new ConstantValue(0),
                        new ConstantValue(0),
                        new ConstantValue(0),
                        new ConstantValue(0),
                        new ConstantValue(0),
                        new ConstantValue(2.5),
                        'local',
                        new ConstantValue(0),
                        {x: 1, y: 0, z: 0}
                    ),
                },
            ];
            kinds.forEach((kind, index) => {
                const ps = system(group, {
                    duration: 3,
                    looping: true,
                    prewarm: true,
                    startLife: new ConstantValue(3),
                    startSpeed: new ConstantValue(0),
                    startSize: new IntervalValue(0.28, 0.4),
                    startColor: new ConstantColor(kind.color),
                    emissionOverTime: new ConstantValue(28),
                    shape: new SphereEmitter({radius: kind.radius, thickness: kind.radius > 0.5 ? 0 : 1}),
                    texture: spark,
                    transparent: true,
                    blendMode: Constants.ALPHA_ADD,
                });
                ps.emitter.position.set(xs[index] - (index === 3 ? 0.9 : 0), index === 3 ? 0.4 : -1.4, 0);
                ps.addBehavior(kind.velocity);
                ps.addBehavior(new ColorOverLife(fade(0.1, 0.8)));
                addCaption(scene, group, xs[index], kind.title, kind.code);
            });
        },
    });

    topics.push({
        name: 'By speed',
        build(group) {
            const range = new IntervalValue(0, 7);
            const kinds: {title: string; code: string; texture: typeof spark; add(ps: ParticleSystem): void}[] = [
                {
                    title: 'Bigger when fast',
                    code: 'SizeBySpeed',
                    texture: spark,
                    add: (ps) =>
                        ps.addBehavior(
                            new SizeBySpeed(
                                curve([
                                    [0, 0.25],
                                    [1, 1.8],
                                ]),
                                range
                            )
                        ),
                },
                {
                    title: 'Spins when fast',
                    code: 'RotationBySpeed',
                    texture: glint,
                    add: (ps) =>
                        ps.addBehavior(
                            new RotationBySpeed(
                                curve([
                                    [0, 0],
                                    [1, 16],
                                ]),
                                range
                            )
                        ),
                },
                {
                    title: 'Hot when fast',
                    code: 'ColorBySpeed',
                    texture: spark,
                    add: (ps) =>
                        ps.addBehavior(
                            new ColorBySpeed(
                                new Gradient(
                                    [
                                        [new Color3(0.25, 0.3, 1), 0],
                                        [new Color3(1, 0.45, 0.2), 0.55],
                                        [new Color3(1, 0.95, 0.75), 1],
                                    ],
                                    [
                                        [1, 0],
                                        [1, 1],
                                    ]
                                ),
                                range
                            )
                        ),
                },
            ];
            const xs = columns(3, 4.4);
            kinds.forEach((kind, index) => {
                const ps = toUp(
                    system(group, {
                        duration: 2,
                        looping: true,
                        prewarm: true,
                        startLife: new IntervalValue(1.9, 2.1),
                        startSpeed: new IntervalValue(6.4, 7),
                        startSize: new ConstantValue(index === 1 ? 0.6 : 0.4),
                        startColor: new ConstantColor(
                            index === 1 ? new Color4(0.75, 0.9, 1, 1) : new Color4(1, 0.8, 0.45, 1)
                        ),
                        emissionOverTime: new ConstantValue(18),
                        shape: new ConeEmitter({radius: 0.1, angle: 0.18}),
                        texture: kind.texture,
                        transparent: true,
                        blendMode: Constants.ALPHA_ADD,
                    })
                );
                ps.emitter.position.set(xs[index], FLOOR + 0.1, 0);
                // Up to a stop at about 3.5 units, and back down.
                ps.addBehavior(new ForceOverLife(new ConstantValue(0), new ConstantValue(-7), new ConstantValue(0)));
                kind.add(ps);
                addCaption(scene, group, xs[index], kind.title, kind.code);
            });
        },
    });

    topics.push({
        name: 'Emit direction',
        build(group) {
            const kinds: {title: string; code: string; add?: (ps: ParticleSystem) => void}[] = [
                {title: 'A narrow cone', code: 'ConeEmitter angle: 0.02'},
                {
                    title: 'Randomised a third: a filled spray',
                    code: 'RandomizeDirection(0.35)',
                    add: (ps) => ps.addBehavior(new RandomizeDirection(0.35)),
                },
                {
                    title: 'Turned by an angle: a ring',
                    code: 'ChangeEmitDirection(0.45)',
                    add: (ps) => ps.addBehavior(new ChangeEmitDirection(new ConstantValue(0.45))),
                },
            ];
            const xs = columns(3, 4.4);
            kinds.forEach((kind, index) => {
                // Volleys, all at one speed, so each flies out as one shape: a tight knot from the
                // narrow cone, a filled cloud when randomised, a ring when every one is turned by
                // the same angle (a hollow cone). Aimed up and toward the camera, so the ring opens.
                const ps = toUp(
                    system(group, {
                        duration: 0.45,
                        looping: true,
                        prewarm: true,
                        startLife: new ConstantValue(0.8),
                        startSpeed: new ConstantValue(5),
                        startSize: new IntervalValue(0.14, 0.2),
                        startColor: new ConstantColor(new Color4(0.55, 0.85, 1, 1)),
                        emissionOverTime: new ConstantValue(0),
                        emissionBursts: [
                            {time: 0, count: new ConstantValue(36), cycle: 1, interval: 0, probability: 1},
                        ],
                        shape: new ConeEmitter({radius: 0.01, angle: 0.02}),
                        texture: spark,
                        transparent: true,
                        blendMode: Constants.ALPHA_ADD,
                    })
                );
                ps.emitter.rotation.x += 0.7;
                ps.emitter.position.set(xs[index], FLOOR + 0.2, 0);
                kind.add?.(ps);
                ps.addBehavior(new ColorOverLife(fade(0.05, 0.6)));
                addCaption(scene, group, xs[index], kind.title, kind.code);
            });
        },
    });

    topics.push({
        name: 'Forces',
        build(group) {
            const xs = columns(4, 3.6);
            const fountain = (parent: TransformNode, color: Color4, force: ForceOverLife) => {
                const ps = toUp(
                    system(parent, {
                        duration: 2,
                        looping: true,
                        prewarm: true,
                        startLife: new IntervalValue(1.6, 1.8),
                        startSpeed: new IntervalValue(5.5, 6),
                        startSize: new IntervalValue(0.26, 0.34),
                        startColor: new ConstantColor(color),
                        emissionOverTime: new ConstantValue(40),
                        shape: new ConeEmitter({radius: 0.05, angle: 0.05}),
                        texture: spark,
                        transparent: true,
                        blendMode: Constants.ALPHA_ADD,
                    })
                );
                ps.addBehavior(force);
                ps.addBehavior(new ColorOverLife(fade(0.05, 0.8)));
                return ps;
            };

            // A force across, picked per particle or again every step.
            [false, true].forEach((randomized, index) => {
                const ps = fountain(
                    group,
                    new Color4(1, 0.7, 0.35, 1),
                    new ForceOverLife(
                        new IntervalValue(-5, 5),
                        new ConstantValue(-6),
                        new ConstantValue(0),
                        'world',
                        randomized
                    )
                );
                ps.emitter.position.set(xs[index], FLOOR + 0.1, 0);
                addCaption(
                    scene,
                    group,
                    xs[index],
                    randomized ? 'Picked every step' : 'Picked per particle',
                    `x: -5…5${randomized ? ', randomized: true' : ''}`
                );
            });

            // The same fountain from an emitter scaled to half (its own scale: under the default
            // `scalingMode: 'local'` a parent's scale is not applied), its gravity scaled with it or not.
            [true, false].forEach((scales, index) => {
                const ps = fountain(
                    group,
                    new Color4(0.45, 0.85, 1, 1),
                    new ForceOverLife(
                        new ConstantValue(0),
                        new ConstantValue(-5),
                        new ConstantValue(0),
                        'world',
                        false,
                        scales
                    )
                );
                ps.emitter.position.set(xs[index + 2], FLOOR + 0.1, 0);
                ps.emitter.scaling.setAll(0.5);
                addCaption(
                    scene,
                    group,
                    xs[index + 2],
                    scales ? 'Half size, half gravity' : 'Half size, full gravity',
                    `scaleWithEmitter: ${scales}`
                );
            });
        },
    });

    showTopics(scene, controls, topics);
}
