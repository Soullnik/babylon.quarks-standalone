import {Constants} from '@babylonjs/core/Engines/constants';
import {Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {
    ApplyForce,
    type BurstParameters,
    ColorOverLife,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    IntervalValue,
    ParticleSystem,
    type ParticleSystemParameters,
    RandomColor,
    SizeOverLife,
    SphereEmitter,
    type StopAction,
} from 'babylon.quarks';
import {curve, fade} from '../shared/curves';
import {addCaption, addStatus} from '../shared/labels';
import {addGround} from '../shared/stage';
import {baseTexture} from '../shared/textures';
import {every, replay} from '../shared/timing';
import {showTopics, type Topic} from '../shared/topics';
import type {DemoContext, DemoRun} from '../types';

const FLOOR = -2.6;

/** A burst of `count` particles: one wave unless `cycle` says more. */
function burst(count: number, more: Partial<BurstParameters> = {}): BurstParameters {
    return {time: 0, count: new ConstantValue(count), cycle: 1, interval: 0, probability: 1, ...more};
}

/**
 * When and how much a system emits, and what it does when it is done, one topic at a time (picked
 * in the panel), each labelled in the scene.
 *
 * - Bursts: one burst; waves of a burst (`cycle`, `interval`); waves that each fire only by chance
 *   (`probability`); and a steady stream with a burst on top of it a second into the cycle.
 * - Delay and prewarm: the same column of embers restarted every four seconds, starting empty,
 *   after a delay (`startDelay`), full from its first frame (`prewarm`), and warmed up for only
 *   the last part of its cycle (`prewarmTime`).
 * - Playback speed: the same fountain at a third, at one and at twice its speed (`playbackSpeed`).
 * - Seed: confetti bursts. Two unseeded systems roll differently; two with the same `seed` land
 *   every piece in the same place, colour and size, cycle after cycle.
 * - Stop action and events: one-shot bursts replayed every three seconds. When one is done its
 *   `stopAction` leaves it, disables its emitter or disposes it, as each one's status shows; and a
 *   `'finished'` listener plays a second effect the moment the first one's last spark dies.
 */
export function init({scene, camera, add, controls, systems}: DemoContext): DemoRun {
    camera.setPosition(new BVector3(0, 1.2, 12.5));
    camera.setTarget(new BVector3(0, 0.5, 0));
    addGround(scene, FLOOR);
    const spark = baseTexture(scene, 'spark');
    const disc = baseTexture(scene, 'disc');
    const ring = baseTexture(scene, 'ring');

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
    /** Sparks flying out of a point and falling, the shells of the bursts. */
    const sparks = (parent: TransformNode, color: Color4, more: Partial<ParticleSystemParameters>) => {
        const ps = system(parent, {
            duration: 2,
            looping: true,
            startLife: new IntervalValue(1.2, 1.6),
            startSpeed: new IntervalValue(2, 2.6),
            startSize: new IntervalValue(0.4, 0.55),
            startColor: new ConstantColor(color),
            emissionOverTime: new ConstantValue(0),
            shape: new SphereEmitter({radius: 0.1, thickness: 1}),
            texture: spark,
            transparent: true,
            blendMode: Constants.ALPHA_ADD,
            ...more,
        });
        ps.addBehavior(new ApplyForce(new BVector3(0, -1, 0), new ConstantValue(3)));
        ps.addBehavior(
            new SizeOverLife(
                curve([
                    [0, 1],
                    [1, 0.2],
                ])
            )
        );
        return ps;
    };

    const ticks: ((delta: number) => void)[] = [];
    const topics: Topic[] = [];

    topics.push({
        name: 'Bursts',
        build(group) {
            const columns: {title: string; code: string; color: Color4; more: Partial<ParticleSystemParameters>}[] = [
                {
                    title: 'One burst',
                    code: 'count: 40',
                    color: new Color4(1, 0.75, 0.35, 1),
                    more: {emissionBursts: [burst(40)]},
                },
                {
                    title: 'Waves',
                    code: 'cycle: 4, interval: 0.2',
                    color: new Color4(0.45, 0.85, 1, 1),
                    more: {emissionBursts: [burst(14, {cycle: 4, interval: 0.2})]},
                },
                {
                    title: 'Waves by chance',
                    code: 'cycle: 6, interval: 0.3, probability: 0.5',
                    color: new Color4(0.7, 1, 0.45, 1),
                    more: {emissionBursts: [burst(14, {cycle: 6, interval: 0.3, probability: 0.5})]},
                },
                {
                    title: 'Stream and burst',
                    code: 'emissionOverTime: 14, burst at 1 s',
                    color: new Color4(1, 0.5, 0.8, 1),
                    more: {emissionOverTime: new ConstantValue(14), emissionBursts: [burst(40, {time: 1})]},
                },
            ];
            columns.forEach((column, index) => {
                const x = (index - 1.5) * 3.6;
                const ps = sparks(group, column.color, column.more);
                ps.emitter.position.set(x, 0.4, 0);
                addCaption(scene, group, x, column.title, column.code);
            });
        },
    });

    topics.push({
        name: 'Delay and prewarm',
        build(group) {
            const columns: {title: string; code: string; more: Partial<ParticleSystemParameters>}[] = [
                {title: 'From empty', code: 'defaults', more: {}},
                {title: 'Waits a second', code: 'startDelay: 1', more: {startDelay: new ConstantValue(1)}},
                {title: 'Full at once', code: 'prewarm: true', more: {prewarm: true}},
                {
                    title: 'Warmed 0.8 s',
                    code: 'prewarm: true, prewarmTime: 0.8',
                    more: {prewarm: true, prewarmTime: 0.8},
                },
            ];
            const columnsOfEmbers = columns.map((column, index) => {
                const x = (index - 1.5) * 3.6;
                const embers = toUp(
                    system(group, {
                        duration: 3,
                        looping: true,
                        startLife: new IntervalValue(2.2, 2.6),
                        startSpeed: new IntervalValue(1.5, 1.8),
                        startSize: new IntervalValue(0.28, 0.42),
                        startColor: new RandomColor(new Color4(1, 0.8, 0.35, 1), new Color4(1, 0.4, 0.15, 1)),
                        emissionOverTime: new ConstantValue(30),
                        shape: new ConeEmitter({radius: 0.35, angle: 0.08}),
                        texture: spark,
                        transparent: true,
                        blendMode: Constants.ALPHA_ADD,
                        ...column.more,
                    })
                );
                embers.emitter.position.set(x, FLOOR + 0.2, 0);
                embers.addBehavior(new ColorOverLife(fade(0.05, 0.75)));
                addCaption(scene, group, x, column.title, column.code);
                return embers;
            });
            // Restarted together every four seconds, to watch each start again.
            ticks.push(every(4, () => replay(columnsOfEmbers)));
        },
    });

    topics.push({
        name: 'Playback speed',
        build(group) {
            [0.3, 1, 2].forEach((speed, index) => {
                const x = (index - 1) * 4.4;
                const fountain = toUp(
                    system(group, {
                        duration: 2,
                        looping: true,
                        prewarm: true,
                        playbackSpeed: speed,
                        startLife: new IntervalValue(1.5, 1.8),
                        startSpeed: new IntervalValue(5.2, 6),
                        startSize: new IntervalValue(0.26, 0.36),
                        startColor: new RandomColor(new Color4(0.45, 0.85, 1, 1), new Color4(0.75, 0.6, 1, 1)),
                        emissionOverTime: new ConstantValue(40),
                        shape: new ConeEmitter({radius: 0.1, angle: 0.22}),
                        texture: spark,
                        transparent: true,
                        blendMode: Constants.ALPHA_ADD,
                    })
                );
                fountain.emitter.position.set(x, FLOOR + 0.1, 0);
                fountain.addBehavior(new ApplyForce(new BVector3(0, -1, 0), new ConstantValue(7)));
                addCaption(
                    scene,
                    group,
                    x,
                    speed < 1 ? 'Slower' : speed > 1 ? 'Faster' : 'As authored',
                    `playbackSpeed: ${speed}`
                );
            });
        },
    });

    topics.push({
        name: 'Seed',
        build(group) {
            const confetti = (x: number, seed: number | undefined) => {
                const ps = system(group, {
                    duration: 2.5,
                    looping: true,
                    seed,
                    startLife: new ConstantValue(2.4),
                    startSpeed: new ConstantValue(0),
                    startSize: new IntervalValue(0.15, 0.5),
                    startColor: new RandomColor(new Color4(1, 0.35, 0.45, 1), new Color4(0.35, 0.8, 1, 1)),
                    emissionOverTime: new ConstantValue(0),
                    emissionBursts: [burst(28)],
                    shape: new SphereEmitter({radius: 1.3, thickness: 1}),
                    texture: disc,
                    transparent: true,
                    blendMode: Constants.ALPHA_COMBINE,
                });
                ps.emitter.position.set(x, 0.3, 0);
                ps.addBehavior(new ApplyForce(new BVector3(0, -1, 0), new ConstantValue(0.35)));
                ps.addBehavior(new ColorOverLife(fade(0.05, 0.85)));
            };
            confetti(-5.4, undefined);
            confetti(-2.2, undefined);
            confetti(2.2, 7);
            confetti(5.4, 7);
            addCaption(scene, group, -3.8, 'Unseeded: each rolls its own', 'seed: undefined');
            addCaption(scene, group, 3.8, 'Seeded alike: twins', 'seed: 7');
        },
    });

    topics.push({
        name: 'Stop action and events',
        build(group) {
            /** A one-shot burst of sparks that ends: emission over at 0.3 s, its last spark dead by 1.9 s. */
            const oneShot = (x: number, color: Color4, stopAction: StopAction) => {
                const ps = sparks(group, color, {
                    duration: 0.3,
                    looping: false,
                    stopAction,
                    emissionBursts: [burst(50)],
                });
                ps.emitter.position.set(x, 0.4, 0);
                return ps;
            };

            const actions: {title: string; stopAction: StopAction; color: Color4}[] = [
                {title: 'Left as it is', stopAction: 'none', color: new Color4(1, 0.75, 0.35, 1)},
                {title: 'Emitter disabled', stopAction: 'disable', color: new Color4(0.45, 0.85, 1, 1)},
                {title: 'System disposed', stopAction: 'destroy', color: new Color4(1, 0.5, 0.8, 1)},
            ];
            const replays = actions.map((action, index) => {
                const x = (index - 1.5) * 3.6;
                addCaption(scene, group, x, action.title, `stopAction: '${action.stopAction}'`);
                // On the floor in front of the burst, under where its particles fall, so they never cover it.
                const status = addStatus(scene, group, new BVector3(x, FLOOR + 0.12, 1.2));
                let current = oneShot(x, action.color, action.stopAction);
                let finished = false;
                let disposed = false;
                const watch = (ps: ParticleSystem) => {
                    ps.addEventListener('finished', () => (finished = true));
                    // A disposed system leaves the demo's list: the viewer counts and saves the live ones.
                    ps.addEventListener('destroy', () => {
                        disposed = true;
                        systems.splice(systems.indexOf(ps), 1);
                    });
                };
                watch(current);
                ticks.push(() => {
                    status(
                        disposed
                            ? 'finished: disposed'
                            : !current.emitter.isEnabled(false)
                              ? 'finished: emitter disabled'
                              : finished
                                ? 'finished: still enabled'
                                : 'playing'
                    );
                });
                return () => {
                    if (disposed) {
                        current = oneShot(x, action.color, action.stopAction);
                        watch(current);
                    } else {
                        current.emitter.setEnabled(true);
                        replay([current]);
                    }
                    finished = false;
                    disposed = false;
                };
            });

            // The fourth plays a ring the moment its sparks finish.
            const x = 1.5 * 3.6;
            addCaption(scene, group, x, 'Then the next effect', "addEventListener('finished')");
            const first = oneShot(x, new Color4(0.7, 1, 0.45, 1), 'none');
            const next = system(group, {
                duration: 0.5,
                looping: false,
                startLife: new ConstantValue(0.5),
                startSpeed: new ConstantValue(0),
                startSize: new ConstantValue(3.2),
                startColor: new ConstantColor(new Color4(0.7, 1, 0.45, 1)),
                emissionOverTime: new ConstantValue(0),
                emissionBursts: [burst(1)],
                shape: new SphereEmitter({radius: 0.01, thickness: 1}),
                texture: ring,
                transparent: true,
                blendMode: Constants.ALPHA_ADD,
            });
            next.emitter.position.set(x, 0.4, 0);
            next.addBehavior(
                new SizeOverLife(
                    curve([
                        [0, 0.2],
                        [1, 1],
                    ])
                )
            );
            next.addBehavior(new ColorOverLife(fade(0.05, 0.4)));
            next.stop();
            first.addEventListener('finished', () => replay([next]));
            replays.push(() => replay([first]));

            ticks.push(every(3, () => replays.forEach((start) => start())));
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
