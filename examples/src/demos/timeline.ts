import {Constants} from '@babylonjs/core/Engines/constants';
import {Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {
    ApplyForce,
    Bezier,
    ConstantColor,
    ConstantValue,
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
import {createColorOverLifeGradient, createSharedTexture} from '../shared/common';
import type {DemoContext} from '../types';

/** Seconds of charge before the release. */
const CHARGE = 1.2;

/**
 * A charged blast laid out on a QuarksPrefab timeline, as a Unity Timeline or a
 * Niagara emitter schedule would: a looping charge glow, a release burst on a
 * window shorter than a frame, and smoke that lingers. The prefab advances with
 * the scene (`autoUpdate`); at the end of the timeline the systems stop
 * emitting and their particles die out, and every other cycle plays in slow
 * motion through the prefab's `timeScale`.
 */
export function init(ctx: DemoContext) {
    const {scene, camera, batchRenderer, systems, demoState} = ctx;
    camera.setPosition(new BVector3(0, 4, 14));
    const texture = createSharedTexture(scene);

    const charge = new ParticleSystem({
        scene,
        duration: 0.5,
        looping: true,
        startLife: new ConstantValue(0.5),
        startSpeed: new ConstantValue(-3),
        startSize: new IntervalValue(0.3, 0.6),
        startColor: new ConstantColor(new Color4(0.5, 0.7, 1, 1)),
        emissionOverTime: new ConstantValue(80),
        shape: new SphereEmitter({radius: 1.6, thickness: 0.1, arc: Math.PI * 2}),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(0),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
    });
    charge.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.4, 1, 1, 0.2), 0]])));

    const release = new ParticleSystem({
        scene,
        duration: 1,
        looping: false,
        startLife: new IntervalValue(0.4, 0.8),
        startSpeed: new IntervalValue(10, 18),
        startSize: new IntervalValue(0.3, 0.5),
        startColor: new RandomColor(new Color4(1, 1, 1, 1), new Color4(0.5, 0.7, 1, 1)),
        worldSpace: true,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(120), cycle: 1, interval: 0, probability: 1}],
        shape: new SphereEmitter({radius: 0.2, thickness: 1, arc: Math.PI * 2}),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(0),
        uTileCount: 10,
        vTileCount: 10,
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
        startColor: new ConstantColor(new Color4(0.6, 0.65, 0.8, 0.5)),
        worldSpace: true,
        emissionOverTime: new ConstantValue(25),
        shape: new PointEmitter(),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_COMBINE,
        startTileIndex: new ConstantValue(1),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
    });
    smoke.addBehavior(createColorOverLifeGradient(new Color4(0.6, 0.65, 0.8, 0.5), new Color4(0.3, 0.3, 0.4, 0)));
    smoke.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.5, 0.8, 1, 1.2), 0]])));

    const prefab = new QuarksPrefab('blast', scene);
    prefab.registerBatchedRenderer(batchRenderer);
    for (const system of [charge, release, smoke]) {
        system.emitter.parent = prefab;
        // The timeline starts them; until then they wait.
        system.stop();
        batchRenderer.addSystem(system);
        systems.push(system);
    }
    prefab.addParticleSystemAnimation(charge.emitter as ParticleEmitter, 0, CHARGE);
    // Far shorter than a frame: the prefab still plays it when a frame steps over it.
    prefab.addParticleSystemAnimation(release.emitter as ParticleEmitter, CHARGE, 0.01);
    prefab.addParticleSystemAnimation(smoke.emitter as ParticleEmitter, CHARGE, 0.8);
    prefab.autoUpdate = true;
    prefab.play();
    demoState.timeline = {prefab, cycle: 0, rest: 0};
}

export function update({demoState}: DemoContext, delta: number) {
    const st = demoState.timeline;
    if (!st || st.prefab.isPlaying) {
        return;
    }
    // A pause of a second between blasts, so the smoke clears; then the next one,
    // every other one at half speed.
    st.rest += delta;
    if (st.rest < 1) {
        return;
    }
    st.rest = 0;
    st.cycle++;
    st.prefab.timeScale = st.cycle % 2 === 1 ? 0.5 : 1;
    st.prefab.play();
}
