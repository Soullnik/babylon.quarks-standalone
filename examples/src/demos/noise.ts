import {Constants} from '@babylonjs/core/Engines/constants';
import {Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {
    BoxEmitter,
    ColorOverLife,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    InheritVelocity,
    type InheritVelocityMode,
    IntervalValue,
    LimitSpeedOverLife,
    Noise,
    ParticleSystem,
    type ParticleSystemParameters,
    RenderMode,
    SphereEmitter,
    TurbulenceField,
} from 'babylon.quarks';
import {curve, fade} from '../shared/curves';
import {addCaption} from '../shared/labels';
import {addGround} from '../shared/stage';
import {baseTexture} from '../shared/textures';
import {showTopics, type Topic} from '../shared/topics';
import type {DemoContext, DemoRun} from '../types';

const FLOOR = -2.6;

/**
 * Motion that is not a straight line, one topic at a time (picked in the panel), each labelled in
 * the scene.
 *
 * - Noise: rising wisps left straight, then shaken by `Noise` (each particle reads its own smooth
 *   noise over its age, here turning glints too with `rotationAmount`), faster with `scrollSpeed`,
 *   and through a `remap` curve that snaps the noise to its two ends, so the wisps zig-zag.
 * - Field and noise: streaks drawn along their motion in a cloud. `Noise` shakes each one its own
 *   way; a `TurbulenceField` is one field the whole cloud moves through, so neighbours flow
 *   alike, in broad swirls with one octave and finer ones with three.
 * - Inherit velocity: three emitters swinging side to side. Without `InheritVelocity` the sparks
 *   stay where they were born; with it at birth (`'initial'`) they are thrown along the swing; every
 *   step (`'current'`) they ride along with the emitter.
 */
export function init({scene, camera, add, controls}: DemoContext): DemoRun {
    camera.setPosition(new BVector3(0, 1.2, 12.5));
    camera.setTarget(new BVector3(0, 0.5, 0));
    addGround(scene, FLOOR);
    const spark = baseTexture(scene, 'spark');
    const glint = baseTexture(scene, 'glint');
    const streak = baseTexture(scene, 'streak');

    const system = (parent: TransformNode, parameters: Omit<ParticleSystemParameters, 'scene'>) => {
        const ps = new ParticleSystem({scene, ...parameters});
        ps.emitter.parent = parent;
        add(ps);
        return ps;
    };
    const ticks: ((delta: number) => void)[] = [];
    const topics: Topic[] = [];

    topics.push({
        name: 'Noise',
        build(group) {
            const kinds: {title: string; code: string; color: Color4; glints?: boolean; noise?: Noise}[] = [
                {title: 'Straight', code: 'no noise', color: new Color4(1, 0.75, 0.35, 1)},
                {
                    title: 'Shaken and turned',
                    code: 'Noise(0.8, 0.8), rotationAmount: 0.6',
                    color: new Color4(0.45, 0.85, 1, 1),
                    glints: true,
                    noise: new Noise(
                        new ConstantValue(0.8),
                        new ConstantValue(0.8),
                        new ConstantValue(1),
                        new ConstantValue(0.6)
                    ),
                },
                {
                    title: 'Scrolling faster',
                    code: 'scrollSpeed: 2',
                    color: new Color4(0.7, 1, 0.45, 1),
                    noise: new Noise(
                        new ConstantValue(0.8),
                        new ConstantValue(0.8),
                        new ConstantValue(1),
                        new ConstantValue(0),
                        new ConstantValue(2)
                    ),
                },
                {
                    title: 'Snapped to its ends',
                    code: 'remap: a step',
                    color: new Color4(1, 0.5, 0.8, 1),
                    noise: new Noise(
                        new ConstantValue(0.8),
                        new ConstantValue(0.7),
                        new ConstantValue(1),
                        new ConstantValue(0),
                        new ConstantValue(0),
                        curve([
                            [0, -1],
                            [0.45, -1],
                            [0.55, 1],
                            [1, 1],
                        ])
                    ),
                },
            ];
            kinds.forEach((kind, index) => {
                const x = (index - 1.5) * 3.6;
                const ps = system(group, {
                    duration: 3,
                    looping: true,
                    prewarm: true,
                    startLife: new IntervalValue(2.6, 3),
                    startSpeed: new IntervalValue(1.5, 1.7),
                    startSize: new IntervalValue(kind.glints ? 0.45 : 0.28, kind.glints ? 0.6 : 0.38),
                    startColor: new ConstantColor(kind.color),
                    emissionOverTime: new ConstantValue(26),
                    shape: new ConeEmitter({radius: 0.15, angle: 0.03}),
                    texture: kind.glints ? glint : spark,
                    transparent: true,
                    blendMode: Constants.ALPHA_ADD,
                });
                ps.emitter.position.set(x, FLOOR + 0.2, 0);
                ps.emitter.rotation.x = -Math.PI / 2; // cones emit along +z; aim them up
                if (kind.noise) {
                    ps.addBehavior(kind.noise);
                }
                ps.addBehavior(new ColorOverLife(fade(0.05, 0.75)));
                addCaption(scene, group, x, kind.title, kind.code);
            });
        },
    });

    topics.push({
        name: 'Field and noise',
        build(group) {
            const kinds: {title: string; code: string; color: Color4; motion: () => Noise | TurbulenceField}[] = [
                {
                    title: 'Each its own way',
                    code: 'Noise(0.6, 1.2)',
                    color: new Color4(1, 0.75, 0.35, 1),
                    motion: () => new Noise(new ConstantValue(0.6), new ConstantValue(1.2)),
                },
                {
                    title: 'One field: broad swirls',
                    code: 'TurbulenceField: scale 3, 1 octave',
                    color: new Color4(0.45, 0.85, 1, 1),
                    motion: () =>
                        new TurbulenceField({x: 3, y: 3, z: 3}, 1, {x: 6, y: 6, z: 6}, {x: 0.2, y: 0.2, z: 0.2}),
                },
                {
                    title: 'One field: finer swirls',
                    code: 'TurbulenceField: scale 1.2, 3 octaves',
                    color: new Color4(0.7, 1, 0.45, 1),
                    motion: () =>
                        new TurbulenceField({x: 1.2, y: 1.2, z: 1.2}, 3, {x: 6, y: 6, z: 6}, {x: 0.2, y: 0.2, z: 0.2}),
                },
            ];
            kinds.forEach((kind, index) => {
                const x = (index - 1) * 4.6;
                const ps = system(group, {
                    duration: 3,
                    looping: true,
                    prewarm: true,
                    startLife: new IntervalValue(2.5, 3),
                    // A slow rise for every streak, so each is drawn along a velocity; the noise or
                    // the field bends it.
                    startSpeed: new ConstantValue(0.8),
                    startSize: new IntervalValue(0.09, 0.13),
                    startColor: new ConstantColor(kind.color),
                    emissionOverTime: new ConstantValue(70),
                    shape: new BoxEmitter({width: 3.4, height: 1.5, depth: 3}),
                    texture: streak,
                    transparent: true,
                    blendMode: Constants.ALPHA_ADD,
                    renderMode: RenderMode.StretchedBillBoard,
                    rendererEmitterSettings: {speedFactor: 0.25, lengthFactor: 1},
                });
                ps.emitter.position.set(x, -1.4, 0);
                ps.emitter.rotation.x = -Math.PI / 2; // the box emits along +z; aim it up
                ps.addBehavior(kind.motion());
                // A drag: the field's push settles into a flow instead of speeding up for ever.
                ps.addBehavior(
                    new LimitSpeedOverLife(
                        curve([
                            [0, 1.4],
                            [1, 1.4],
                        ]),
                        0.25
                    )
                );
                ps.addBehavior(new ColorOverLife(fade(0.15, 0.7)));
                addCaption(scene, group, x, kind.title, kind.code);
            });
        },
    });

    topics.push({
        name: 'Inherit velocity',
        build(group) {
            const lanes: {title: string; code: string; color: Color4; mode?: InheritVelocityMode}[] = [
                {title: 'Left behind', code: 'no InheritVelocity', color: new Color4(1, 0.75, 0.35, 1)},
                {
                    title: 'Thrown along',
                    code: "InheritVelocity(1, 'initial')",
                    color: new Color4(0.45, 0.85, 1, 1),
                    mode: 'initial',
                },
                {
                    title: 'Carried along',
                    code: "InheritVelocity(1, 'current')",
                    color: new Color4(1, 0.5, 0.8, 1),
                    mode: 'current',
                },
            ];
            let time = 0;
            const swingers = lanes.map((lane, index) => {
                const y = 2 - index * 2;
                const ps = system(group, {
                    duration: 1,
                    looping: true,
                    worldSpace: true,
                    startLife: new IntervalValue(1.2, 1.5),
                    startSpeed: new IntervalValue(0.2, 0.5),
                    startSize: new IntervalValue(0.26, 0.36),
                    startColor: new ConstantColor(lane.color),
                    emissionOverTime: new ConstantValue(50),
                    shape: new SphereEmitter({radius: 0.15, thickness: 1}),
                    texture: spark,
                    transparent: true,
                    blendMode: Constants.ALPHA_ADD,
                });
                if (lane.mode) {
                    ps.addBehavior(new InheritVelocity(new ConstantValue(1), lane.mode));
                }
                ps.addBehavior(new ColorOverLife(fade(0.05, 0.6)));
                addCaption(scene, group, -6, lane.title, lane.code, y + 0.3);
                return {ps, y};
            });
            const place = () => {
                for (const {ps, y} of swingers) {
                    ps.emitter.position.set(1.4 + 3 * Math.sin(time * 1.7), y, 0);
                }
            };
            place();
            ticks.push((delta) => {
                time += delta;
                place();
            });
        },
    });

    showTopics(scene, controls, topics);

    return {
        update(delta) {
            for (const tick of ticks) {
                tick(delta);
            }
        },
    };
}
