import type { DemoContext } from '../types';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {Constants} from '@babylonjs/core/Engines/constants';
import {
    ParticleSystem,
    RenderMode,
    ConstantValue,
    ConstantColor,
    PointEmitter,
    SphereEmitter,
    ColorOverLife,
    Vector4,
    Vector3,
    Gradient,
    OrbitOverLife,
} from 'babylon.quarks';
import {createSharedTexture} from '../shared/common';

export function init({scene, camera, batchRenderer, systems}: DemoContext) {
    camera.setPosition(new BVector3(0, 6, 22));
    const texture = createSharedTexture(scene);

    const beam = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        // rate × life = 1 leaves one blank frame per period on the fixed-step
        // clock (age and emission sit one step apart). One step of slack is the
        // same workaround Unity documents as "life 1.01".
        startLife: new ConstantValue(1 + 1 / 60),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(40),
        startColor: new ConstantColor(new Vector4(0, 0, 0, 1)),
        worldSpace: false,
        emissionOverTime: new ConstantValue(1),
        emissionBursts: [],
        shape: new PointEmitter(),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_COMBINE,
        startTileIndex: new ConstantValue(0),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 0,
    });
    batchRenderer.addSystem(beam);
    systems.push(beam);

    const particleGradient = new Gradient(
        [
            [new Vector3(0, 0, 0), 0],
            [new Vector3(1, 1, 1), 0.2],
            [new Vector3(1, 1, 1), 0.8],
            [new Vector3(0, 0, 0), 1],
        ],
        [
            [1, 0],
            [1, 0.2],
            [1, 0.8],
            [1, 1],
        ]
    );

    const particles = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new ConstantValue(3),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(4),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        worldSpace: false,
        emissionOverTime: new ConstantValue(8),
        emissionBursts: [],
        shape: new SphereEmitter({radius: 18, arc: Math.PI * 2, thickness: 0.01}),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(4),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 0,
    });
    particles.addBehavior(new OrbitOverLife(new ConstantValue(1)));
    particles.addBehavior(new ColorOverLife(particleGradient));
    batchRenderer.addSystem(particles);
    systems.push(particles);

    const ring = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        // Same knife-edge as beam: one particle per second living one second.
        startLife: new ConstantValue(1 + 1 / 60),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(30),
        startColor: new ConstantColor(new Vector4(0.9254901960784314, 0.788235294117647, 0.1607843137254902, 1)),
        worldSpace: false,
        emissionOverTime: new ConstantValue(1),
        emissionBursts: [],
        shape: new PointEmitter(),
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(4),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 0,
    });
    batchRenderer.addSystem(ring);
    systems.push(ring);
}
