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
    ConeEmitter,
    SphereEmitter,
    SizeOverLife,
    PiecewiseBezier,
    Bezier,
    Vector4,
    OrbitOverLife,
} from 'babylon.quarks';
import {createColorOverLifeRange, createSharedTexture} from '../shared/common';

const REFRESH_INTERVAL = 2.2;

function restartTracked(tracked) {
    for (const s of tracked) {
        s.restart();
        s.play();
    }
}

export function init({scene, camera, batchRenderer, systems, demoState}: DemoContext) {
    camera.setPosition(new BVector3(0, 16, 36));
    const texture = createSharedTexture(scene);
    const yellow = new Vector4(0.8, 0.8, 0.2, 1);
    const tracked: ParticleSystem[] = [];

    const gatherParticles = new ParticleSystem({
        scene,
        duration: 0.5,
        looping: false,
        startLife: new IntervalValue(0.3, 0.4),
        startSpeed: new IntervalValue(-100, -150),
        startSize: new IntervalValue(1, 2),
        startColor: new ConstantColor(yellow),
        worldSpace: false,
        emissionOverTime: new ConstantValue(100),
        shape: new SphereEmitter({radius: 60, thickness: 0.8, arc: Math.PI}),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(0),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.StretchedBillBoard,
        speedFactor: 0.05,
        renderOrder: 2,
    });
    gatherParticles.addBehavior(createColorOverLifeRange(new Vector4(0.2, 0.2, 0.2, 1), new Vector4(1, 1, 1, 1)));
    batchRenderer.addSystem(gatherParticles);
    systems.push(gatherParticles);
    tracked.push(gatherParticles);

    const glowParam = {
        scene,
        duration: 2,
        looping: false,
        startLife: new ConstantValue(2.0),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(120, 160),
        startColor: new ConstantColor(yellow),
        worldSpace: false,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0.01, probability: 1}],
        shape: new PointEmitter(),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(1),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.Mesh,
        renderOrder: 0,
    };
    const glow = new ParticleSystem(glowParam);
    glow.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0, 0.75, 0.9, 1), 0], [new Bezier(1, 0.9, 0.75, 0), 0.5]])));
    glow.emitter.rotation.x = -Math.PI / 2;
    batchRenderer.addSystem(glow);
    systems.push(glow);
    tracked.push(glow);

    const glow2 = new ParticleSystem({
        ...glowParam,
        startSize: new IntervalValue(60, 80),
        renderMode: RenderMode.BillBoard,
    });
    glow2.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0, 0.75, 0.9, 1), 0], [new Bezier(1, 0.9, 0.75, 0), 0.2]])));
    batchRenderer.addSystem(glow2);
    systems.push(glow2);
    tracked.push(glow2);

    const particle = new ParticleSystem({
        scene,
        duration: 1.0,
        looping: false,
        startLife: new IntervalValue(0.6, 0.8),
        startSpeed: new IntervalValue(120, 180),
        startSize: new IntervalValue(2, 4),
        startColor: new ConstantColor(yellow),
        worldSpace: false,
        emissionOverTime: new PiecewiseBezier([
            [new Bezier(0, 0, 0, 0), 0],
            [new Bezier(50, 80, 80, 50), 0.4],
        ]),
        shape: new ConeEmitter({radius: 25, thickness: 0.2, angle: Math.PI / 100}),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(0),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 2,
    });
    particle.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0, 0.75, 0.9, 1), 0], [new Bezier(1, 0.9, 0.75, 0), 0.5]])));
    particle.addBehavior(
        new OrbitOverLife(new PiecewiseBezier([[new Bezier(0, Math.PI * 4 * 0.75, Math.PI * 4 * 0.9, Math.PI * 4), 0]]))
    );
    particle.emitter.rotation.x = -Math.PI / 2;
    batchRenderer.addSystem(particle);
    systems.push(particle);
    tracked.push(particle);

    demoState.levelUp = {tracked, elapsed: 0};
    restartTracked(tracked);
}

export function update({demoState}: DemoContext, delta: number) {
    const st = demoState.levelUp;
    if (!st?.tracked?.length) {
        return;
    }
    st.elapsed += delta;
    if (st.elapsed >= REFRESH_INTERVAL) {
        st.elapsed = 0;
        restartTracked(st.tracked);
    }
}
