import type { DemoContext } from '../types';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {Constants} from '@babylonjs/core/Engines/constants';
import {
    ParticleSystem,
    RenderMode,
    ConstantValue,
    IntervalValue,
    ConstantColor,
    PointEmitter,
    SphereEmitter,
    SizeOverLife,
    FrameOverLife,
    PiecewiseBezier,
    Bezier,
    RandomColor,
    Vector4,
} from 'babylon.quarks';
import {createColorOverLifeRange, createSharedTexture, SHARED_ASSETS} from '../shared/common';

export function init({scene, camera, batchRenderer, systems, demoState}: DemoContext) {
    camera.setPosition(new BVector3(0, 8, 20));
    const texture2 = createSharedTexture(scene, SHARED_ASSETS.atlasSecondary);
    const tracked: ParticleSystem[] = [];

    const beam = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new ConstantValue(1.0),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(15.0),
        startColor: new ConstantColor(
            new Vector4(0.5220588 * 0.772549, 0.6440161 * 0.772549, 1 * 0.772549, 0.772549)
        ),
        worldSpace: false,
        emissionOverTime: new ConstantValue(1),
        emissionBursts: [],
        shape: new PointEmitter(),
        texture: texture2,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(1),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 0,
    });
    batchRenderer.addSystem(beam);
    systems.push(beam);
    tracked.push(beam);

    const beamWorld = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new IntervalValue(0.1, 0.4),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(7.5, 15),
        startColor: new RandomColor(
            new Vector4(0.1397059 * 0.8, 0.3592291 * 0.8, 1 * 0.8, 1),
            new Vector4(1 * 0.8, 0.9275356 * 0.8, 0.1029412 * 0.8, 1)
        ),
        worldSpace: true,
        emissionOverTime: new IntervalValue(5, 10),
        emissionBursts: [],
        shape: new SphereEmitter({radius: 0.01, thickness: 1, arc: Math.PI * 2}),
        texture: texture2,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(1),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 0,
    });
    beamWorld.addBehavior(createColorOverLifeRange(new Vector4(1, 1, 1, 1), new Vector4(0, 0, 0, 1)));
    batchRenderer.addSystem(beamWorld);
    systems.push(beamWorld);
    tracked.push(beamWorld);

    const electricity = new ParticleSystem({
        scene,
        duration: 0.5,
        looping: true,
        startLife: new IntervalValue(0.2, 0.3),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(3, 6),
        startRotation: new IntervalValue(-Math.PI, Math.PI),
        startColor: new RandomColor(
            new Vector4(0.1397059, 0.3592291, 1, 1),
            new Vector4(1, 0.9275356, 0.1029412, 1)
        ),
        worldSpace: true,
        emissionOverTime: new IntervalValue(5, 10),
        emissionBursts: [],
        shape: new PointEmitter(),
        texture: texture2,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(0),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 2,
    });
    electricity.addBehavior(new FrameOverLife(new PiecewiseBezier([[new Bezier(53, 56, 59, 62), 0]])));
    electricity.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(1.0, 1.0, 0.75, 0), 0]])));
    batchRenderer.addSystem(electricity);
    systems.push(electricity);
    tracked.push(electricity);

    const electricBall = new ParticleSystem({
        scene,
        duration: 0.4,
        looping: true,
        startLife: new IntervalValue(0.2, 0.4),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(5, 10),
        startRotation: new IntervalValue(-Math.PI, Math.PI),
        startColor: new RandomColor(
            new Vector4(0.1397059, 0.3592291, 1, 1),
            new Vector4(1, 0.9275356, 0.1029412, 1)
        ),
        worldSpace: false,
        emissionOverTime: new ConstantValue(3),
        emissionBursts: [],
        shape: new PointEmitter(),
        texture: texture2,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(0),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 1,
    });
    electricBall.addBehavior(new FrameOverLife(new PiecewiseBezier([[new Bezier(62, 65, 68, 71), 0]])));
    batchRenderer.addSystem(electricBall);
    systems.push(electricBall);
    tracked.push(electricBall);

    demoState.electricBall = {tracked, x: 0};
    for (const s of tracked) {
        s.restart();
        s.play();
    }
}

export function update({demoState}: DemoContext, delta: number) {
    const st = demoState.electricBall;
    if (!st?.tracked?.length) {
        return;
    }
    st.x += delta * 30;
    if (st.x > 20) {
        st.x = -20;
    }
    for (const s of st.tracked) {
        s.emitter.position.x = st.x;
    }
}
