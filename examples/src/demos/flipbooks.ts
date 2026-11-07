import {Constants} from '@babylonjs/core/Engines/constants';
import {Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {
    ColorOverLife,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    FrameOverLife,
    IntervalValue,
    ParticleSystem,
    type ParticleSystemParameters,
    PointEmitter,
    SphereEmitter,
} from 'babylon.quarks';
import {curve, fade} from '../shared/curves';
import {addCaption} from '../shared/labels';
import {addGround} from '../shared/stage';
import {baseTexture, sheetOf} from '../shared/textures';
import {showTopics, type Topic} from '../shared/topics';
import type {DemoContext} from '../types';

const FLOOR = -2.6;

/** Frames 0 to the last of an `n`-frame sheet over the particle's life. */
function overLife(n: number) {
    return curve([
        [0, 0],
        [1, n - 0.01],
    ]);
}

/**
 * How a sheet of frames plays (`FrameOverLife`, Unity's Texture Sheet Animation), one topic at a
 * time (picked in the panel), each labelled in the scene.
 *
 * - Playing a sheet: smoke swelling and breaking up once over its life; a flame looping three
 *   times over its life (`cycles`); a flame at a fixed frame rate whatever its life (`fps`); and a
 *   flash that plays once and holds its last frame (`loop: false`).
 * - Rows: a sheet of four glyphs, one per row. The whole sheet plays all four in turn; one row
 *   plays one glyph (`rowLength`, `row`); a random row gives each particle its own
 *   (`randomRow`); and a random frame every tick flickers among them all (`random`).
 * - Frame blending: smoke played slowly (`fps: 3`), frame after frame, and with each frame crossfaded into
 *   the next (`blendTiles`).
 */
export function init({scene, camera, add, controls}: DemoContext) {
    camera.setPosition(new BVector3(0, 1.2, 12.5));
    camera.setTarget(new BVector3(0, 0.5, 0));
    addGround(scene, FLOOR);
    const smoke = baseTexture(scene, 'smoke_puff');
    const fire = baseTexture(scene, 'fire');
    const flash = baseTexture(scene, 'flash');
    const glyphs = baseTexture(scene, 'glyphs');

    const system = (parent: TransformNode, parameters: Omit<ParticleSystemParameters, 'scene'>) => {
        const ps = new ParticleSystem({scene, ...parameters});
        ps.emitter.parent = parent;
        add(ps);
        return ps;
    };
    const topics: Topic[] = [];

    topics.push({
        name: 'Playing a sheet',
        build(group) {
            const x = [-5.4, -1.8, 1.8, 5.4];

            const puffs = system(group, {
                duration: 2,
                looping: true,
                prewarm: true,
                startLife: new ConstantValue(2.4),
                startSpeed: new ConstantValue(0.9),
                startSize: new IntervalValue(2.2, 2.6),
                startRotation: new IntervalValue(0, Math.PI * 2),
                startColor: new ConstantColor(new Color4(0.85, 0.82, 0.9, 1)),
                emissionOverTime: new ConstantValue(1.5),
                shape: new ConeEmitter({radius: 0.2, angle: 0.1}),
                texture: smoke,
                ...sheetOf('smoke_puff'),
                transparent: true,
                blendMode: Constants.ALPHA_COMBINE,
            });
            puffs.emitter.position.set(x[0], -1.6, 0);
            puffs.emitter.rotation.x = -Math.PI / 2;
            puffs.addBehavior(new FrameOverLife(overLife(16)));
            addCaption(scene, group, x[0], 'Once over its life', 'frame: 0 → 15 over life');

            const flame = (at: number, frames: FrameOverLife, title: string, code: string) => {
                const ps = system(group, {
                    duration: 1,
                    looping: true,
                    prewarm: true,
                    startLife: new ConstantValue(2),
                    startSpeed: new ConstantValue(0),
                    startSize: new ConstantValue(3),
                    startColor: new ConstantColor(new Color4(1, 0.7, 0.35, 1)),
                    emissionOverTime: new ConstantValue(0.5),
                    shape: new PointEmitter(),
                    texture: fire,
                    ...sheetOf('fire'),
                    transparent: true,
                    blendMode: Constants.ALPHA_ADD,
                });
                ps.emitter.position.set(at, -1, 0);
                ps.addBehavior(frames);
                ps.addBehavior(new ColorOverLife(fade(0.1, 0.85)));
                addCaption(scene, group, at, title, code);
            };
            flame(x[1], new FrameOverLife(overLife(16), {cycles: 3}), 'Three times over its life', 'cycles: 3');
            flame(
                x[2],
                new FrameOverLife(new ConstantValue(0), {fps: 16, frameCount: 16}),
                'At a frame rate',
                'fps: 16, frameCount: 16'
            );

            const burst = system(group, {
                duration: 3,
                looping: true,
                startLife: new ConstantValue(2.6),
                startSpeed: new ConstantValue(0),
                startSize: new ConstantValue(3.4),
                startColor: new ConstantColor(new Color4(1, 0.85, 0.5, 1)),
                emissionOverTime: new ConstantValue(0),
                emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
                shape: new PointEmitter(),
                texture: flash,
                ...sheetOf('flash'),
                transparent: true,
                blendMode: Constants.ALPHA_ADD,
            });
            burst.emitter.position.set(x[3], -0.6, 0);
            // The sheet's last frames are empty; the segment stops on the star breaking up.
            burst.addBehavior(new FrameOverLife(new ConstantValue(0), {fps: 10, frameCount: 5, loop: false}));
            burst.addBehavior(new ColorOverLife(fade(0.02, 0.8)));
            addCaption(scene, group, x[3], 'Once, then holds', 'fps: 10, frameCount: 5, loop: false');
        },
    });

    topics.push({
        name: 'Rows',
        build(group) {
            const kinds: {title: string; code: string; color: Color4; frames: () => FrameOverLife}[] = [
                {
                    title: 'The whole sheet',
                    code: 'fps: 8, frameCount: 16',
                    color: new Color4(1, 0.75, 0.35, 1),
                    frames: () => new FrameOverLife(new ConstantValue(0), {fps: 8, frameCount: 16}),
                },
                {
                    title: 'One row',
                    code: 'rowLength: 4, row: 2',
                    color: new Color4(0.45, 0.85, 1, 1),
                    frames: () =>
                        new FrameOverLife(new ConstantValue(0), {fps: 8, frameCount: 4, rowLength: 4, row: 2}),
                },
                {
                    title: 'A random row each',
                    code: 'rowLength: 4, randomRow: true',
                    color: new Color4(0.7, 1, 0.45, 1),
                    frames: () =>
                        new FrameOverLife(new ConstantValue(0), {
                            fps: 8,
                            frameCount: 4,
                            rowLength: 4,
                            rowCount: 4,
                            randomRow: true,
                        }),
                },
                {
                    title: 'A random frame each tick',
                    code: 'fps: 6, frameCount: 16, random: true',
                    color: new Color4(1, 0.5, 0.8, 1),
                    frames: () => new FrameOverLife(new ConstantValue(0), {fps: 6, frameCount: 16, random: true}),
                },
            ];
            kinds.forEach((kind, index) => {
                const x = (index - 1.5) * 3.6;
                const ps = system(group, {
                    duration: 3,
                    looping: true,
                    prewarm: true,
                    startLife: new ConstantValue(3),
                    startSpeed: new IntervalValue(0.15, 0.35),
                    startSize: new IntervalValue(0.8, 1.1),
                    startColor: new ConstantColor(kind.color),
                    emissionOverTime: new ConstantValue(3),
                    shape: new SphereEmitter({radius: 1.3, thickness: 1}),
                    texture: glyphs,
                    ...sheetOf('glyphs'),
                    transparent: true,
                    blendMode: Constants.ALPHA_ADD,
                });
                ps.emitter.position.set(x, 0.1, 0);
                ps.addBehavior(kind.frames());
                ps.addBehavior(new ColorOverLife(fade(0.15, 0.75)));
                addCaption(scene, group, x, kind.title, kind.code);
            });
        },
    });

    topics.push({
        name: 'Frame blending',
        build(group) {
            [false, true].forEach((blend, index) => {
                const x = index === 0 ? -3.4 : 3.4;
                // One puff at a time, its 16 frames played slowly, three a second, once over its
                // life. Between two frames the frame runs on (2.5 halfway from 2 to 3), and
                // blending crossfades by that part.
                const ps = system(group, {
                    duration: 16 / 3,
                    looping: true,
                    startLife: new ConstantValue(16 / 3),
                    startSpeed: new ConstantValue(0),
                    startSize: new ConstantValue(4.6),
                    startColor: new ConstantColor(new Color4(0.85, 0.82, 0.9, 1)),
                    emissionOverTime: new ConstantValue(0),
                    emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
                    shape: new PointEmitter(),
                    texture: smoke,
                    ...sheetOf('smoke_puff'),
                    blendTiles: blend,
                    transparent: true,
                    blendMode: Constants.ALPHA_COMBINE,
                });
                ps.emitter.position.set(x, 0, 0);
                ps.addBehavior(new FrameOverLife(new ConstantValue(0), {fps: 3, frameCount: 16, loop: false}));
                addCaption(
                    scene,
                    group,
                    x,
                    blend ? 'Crossfaded into the next' : 'Frame after frame',
                    `blendTiles: ${blend}`
                );
            });
        },
    });

    showTopics(scene, controls, topics);
}
