import {Constants} from '@babylonjs/core/Engines/constants';
import {Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {
    ApplyForce,
    Bezier,
    ConstantColor,
    ConstantValue,
    FrameOverLife,
    IntervalValue,
    ParticleEmitter,
    ParticleSystem,
    PiecewiseBezier,
    PointEmitter,
    QuarksPrefab,
    RandomColor,
    RenderMode,
    SizeOverLife,
    SphereEmitter,
} from 'babylon.quarks';
import {createColorOverLifeGradient} from '../shared/common';
import {curve} from '../shared/curves';
import {addGround} from '../shared/stage';
import {baseTexture, sheetOf} from '../shared/textures';
import type {DemoContext, DemoRun} from '../types';

/** Seconds of charge before the release. */
const CHARGE = 1.2;

/**
 * A charged blast laid out on a QuarksPrefab timeline, as a Unity Timeline or a
 * Niagara emitter schedule would: a looping charge glow, a release burst on a
 * window shorter than a frame, and smoke that lingers. The prefab advances by
 * the demo's frame time (`update(delta)`; `autoUpdate` would take the scene's
 * instead); at the end of the timeline the systems stop
 * emitting and their particles die out, and every other cycle plays in slow
 * motion through the prefab's `timeScale`.
 */
export function init({scene, camera, batchRenderer, add}: DemoContext): DemoRun {
    camera.setPosition(new BVector3(0, 3.5, 12));
    camera.setTarget(new BVector3(0, 1.4, 0));
    addGround(scene, -1.6);
    const streak = baseTexture(scene, 'streak');

    const charge = new ParticleSystem({
        scene,
        duration: 0.5,
        looping: true,
        startLife: new ConstantValue(0.5),
        startSpeed: new ConstantValue(-3),
        startSize: new IntervalValue(0.1, 0.18),
        startColor: new ConstantColor(new Color4(0.5, 0.7, 1, 1)),
        emissionOverTime: new ConstantValue(80),
        shape: new SphereEmitter({radius: 1.6, thickness: 0.1, arc: Math.PI * 2}),
        texture: streak,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        renderMode: RenderMode.StretchedBillBoard,
        rendererEmitterSettings: {speedFactor: 0.12, lengthFactor: 1},
    });
    charge.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.4, 1, 1, 0.2), 0]])));

    const release = new ParticleSystem({
        scene,
        duration: 1,
        looping: false,
        startLife: new IntervalValue(0.4, 0.8),
        startSpeed: new IntervalValue(10, 18),
        startSize: new IntervalValue(0.14, 0.24),
        startColor: new RandomColor(new Color4(1, 1, 1, 1), new Color4(0.5, 0.7, 1, 1)),
        worldSpace: true,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(120), cycle: 1, interval: 0, probability: 1}],
        shape: new SphereEmitter({radius: 0.2, thickness: 1, arc: Math.PI * 2}),
        texture: streak,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        renderMode: RenderMode.StretchedBillBoard,
        rendererEmitterSettings: {speedFactor: 0.05, lengthFactor: 1},
    });
    release.addBehavior(new ApplyForce(new BVector3(0, -1, 0), new ConstantValue(12)));

    const smoke = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new IntervalValue(1, 1.6),
        startSpeed: new IntervalValue(0.5, 1.5),
        startSize: new IntervalValue(1.5, 2.5),
        startRotation: new IntervalValue(0, Math.PI * 2),
        startColor: new ConstantColor(new Color4(0.6, 0.65, 0.8, 0.5)),
        worldSpace: true,
        emissionOverTime: new ConstantValue(25),
        shape: new PointEmitter(),
        texture: baseTexture(scene, 'smoke_puff'),
        ...sheetOf('smoke_puff'),
        transparent: true,
        blendMode: Constants.ALPHA_COMBINE,
        renderMode: RenderMode.BillBoard,
    });
    smoke.addBehavior(
        new FrameOverLife(
            curve([
                [0, 0],
                [1, 15.99],
            ])
        )
    );
    smoke.addBehavior(createColorOverLifeGradient(new Color4(0.8, 0.84, 0.95, 0.75), new Color4(0.5, 0.52, 0.6, 0)));
    smoke.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.5, 0.8, 1, 1.2), 0]])));

    // A core gathering light over the charge.
    const core = new ParticleSystem({
        scene,
        duration: CHARGE,
        looping: false,
        startLife: new ConstantValue(CHARGE),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(2.6),
        startColor: new ConstantColor(new Color4(0.55, 0.75, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
        shape: new PointEmitter(),
        texture: baseTexture(scene, 'glow'),
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
    });
    core.addBehavior(
        new SizeOverLife(
            curve([
                [0, 0.1],
                [1, 1],
            ])
        )
    );

    // The release's flash: two stacked star bursts.
    const flash = new ParticleSystem({
        scene,
        duration: 0.4,
        looping: false,
        startLife: new IntervalValue(0.22, 0.3),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(4, 5),
        startRotation: new IntervalValue(0, Math.PI * 2),
        startColor: new RandomColor(new Color4(1, 1, 1, 1), new Color4(0.7, 0.85, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(2), cycle: 1, interval: 0, probability: 1}],
        shape: new PointEmitter(),
        texture: baseTexture(scene, 'flash'),
        ...sheetOf('flash'),
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
    });
    flash.addBehavior(
        new FrameOverLife(
            curve([
                [0, 0],
                [1, 7.99],
            ])
        )
    );

    const prefab = new QuarksPrefab('blast', scene);
    prefab.registerBatchedRenderer(batchRenderer);
    for (const system of [charge, core, release, flash, smoke]) {
        system.emitter.parent = prefab;
        // The timeline starts them; until then they wait.
        system.stop();
        add(system);
    }
    prefab.addParticleSystemAnimation(charge.emitter as ParticleEmitter, 0, CHARGE);
    prefab.addParticleSystemAnimation(core.emitter as ParticleEmitter, 0, CHARGE);
    // Far shorter than a frame: the prefab still plays it when a frame steps over it.
    prefab.addParticleSystemAnimation(release.emitter as ParticleEmitter, CHARGE, 0.01);
    prefab.addParticleSystemAnimation(flash.emitter as ParticleEmitter, CHARGE, 0.01);
    prefab.addParticleSystemAnimation(smoke.emitter as ParticleEmitter, CHARGE, 0.8);
    prefab.play();

    let cycle = 0;
    let rest = 0;
    return {
        update(delta) {
            prefab.update(delta);
            if (prefab.isPlaying) {
                return;
            }
            // A pause of a second between blasts, so the smoke clears; then the next one,
            // every other one at half speed.
            rest += delta;
            if (rest < 1) {
                return;
            }
            rest = 0;
            cycle++;
            prefab.timeScale = cycle % 2 === 1 ? 0.5 : 1;
            prefab.play();
        },
    };
}
