import {Constants} from '@babylonjs/core/Engines/constants';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {
    Bezier,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    FrameOverLife,
    IntervalValue,
    OrbitOverLife,
    ParticleSystem,
    PiecewiseBezier,
    PointEmitter,
    RandomColor,
    RenderMode,
    SizeOverLife,
    SphereEmitter,
    Vector4,
} from 'babylon.quarks';
import {createColorOverLifeRange, createSharedTexture} from '../shared/common';
import type {DemoContext} from '../types';

const REFRESH_INTERVAL = 1.8;

function restartTracked(tracked) {
    for (const s of tracked) {
        s.restart();
        s.play();
    }
}

export function init({scene, camera, batchRenderer, systems, demoState}: DemoContext) {
    camera.setPosition(new BVector3(0, 14, 32));
    const texture = createSharedTexture(scene);
    const yellow = new Vector4(1, 1, 0.3, 1);
    const darkOrange = new Vector4(1, 0.7, 0.1, 1);
    const red = new Vector4(1, 0, 0, 1);
    const tracked: ParticleSystem[] = [];

    const circle = new ParticleSystem({
        scene,
        duration: 1,
        looping: false,
        startLife: new ConstantValue(0.6),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(2, 10),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 0.5)),
        worldSpace: false,
        emissionOverTime: new ConstantValue(40),
        emissionBursts: [{time: 0, count: new ConstantValue(100), cycle: 1, interval: 0.01, probability: 1}],
        shape: new ConeEmitter({radius: 30, thickness: 0.12, arc: Math.PI * 2}),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(0),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 2,
    });
    circle.addBehavior(new OrbitOverLife(new IntervalValue(6, 8)));
    circle.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0, 0.88, 0.88, 0), 0]])));
    circle.addBehavior(createColorOverLifeRange(new Vector4(0.2, 0.6, 1, 1), new Vector4(0.2, 0.2, 1, 1)));
    batchRenderer.addSystem(circle);
    systems.push(circle);
    tracked.push(circle);

    const beam = new ParticleSystem({
        scene,
        duration: 1,
        looping: false,
        startLife: new ConstantValue(0.6),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(100),
        startColor: new ConstantColor(yellow),
        worldSpace: false,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(2), cycle: 1, interval: 0.01, probability: 1}],
        shape: new PointEmitter(),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(1),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 0,
    });
    beam.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.3, 0.5, 0.6666, 1), 0]])));
    batchRenderer.addSystem(beam);
    systems.push(beam);
    tracked.push(beam);

    const particles = new ParticleSystem({
        scene,
        duration: 1,
        looping: false,
        startLife: new IntervalValue(0.6, 0.8),
        startSpeed: new IntervalValue(20, 30),
        startSize: new IntervalValue(2, 6),
        startColor: new RandomColor(darkOrange, red),
        worldSpace: false,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0.4, count: new ConstantValue(30), cycle: 1, interval: 0.01, probability: 1}],
        shape: new SphereEmitter({radius: 20, thickness: 0.12, arc: Math.PI * 2}),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_COMBINE,
        startTileIndex: new ConstantValue(0),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.StretchedBillBoard,
        speedFactor: 0.1,
        renderOrder: 1,
    });
    particles.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.3, 0.25, 0.1), 0]])));
    batchRenderer.addSystem(particles);
    systems.push(particles);
    tracked.push(particles);

    const upflow = new ParticleSystem({
        scene,
        duration: 1,
        looping: false,
        startLife: new ConstantValue(0.6),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(60),
        startColor: new RandomColor(new Vector4(1, 0.2, 0, 1), red),
        worldSpace: false,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0.4, count: new ConstantValue(2), cycle: 1, interval: 0.01, probability: 1}],
        shape: new PointEmitter(),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(10),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.Mesh,
        renderOrder: 1,
    });
    upflow.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.9, 0.6, 0.3), 0]])));
    upflow.addBehavior(new FrameOverLife(new PiecewiseBezier([[new Bezier(38, 39, 40, 46), 0]])));
    batchRenderer.addSystem(upflow);
    systems.push(upflow);
    tracked.push(upflow);

    demoState.pickUp = {tracked, elapsed: 0};
    restartTracked(tracked);
}

export function update({demoState}: DemoContext, delta: number) {
    const st = demoState.pickUp;
    if (!st?.tracked?.length) {
        return;
    }
    st.elapsed += delta;
    if (st.elapsed >= REFRESH_INTERVAL) {
        st.elapsed = 0;
        restartTracked(st.tracked);
    }
}
