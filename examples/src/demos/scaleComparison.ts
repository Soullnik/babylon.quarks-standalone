import type { DemoContext } from '../types';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {Constants} from '@babylonjs/core/Engines/constants';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {
    ParticleSystem,
    ConstantValue,
    IntervalValue,
    SphereEmitter,
    RenderMode,
    ConstantColor,
    Vector4,
} from 'babylon.quarks';
import {createSharedTexture, SHARED_ASSETS} from '../shared/common';

function addScaledSystem({
    scene,
    batchRenderer,
    systems,
    texture,
    positionX,
    scale,
}: {
    scene: DemoContext['scene'];
    batchRenderer: DemoContext['batchRenderer'];
    systems: DemoContext['systems'];
    texture: ReturnType<typeof createSharedTexture>;
    positionX: number;
    scale: number;
}) {
    const root = new TransformNode(`scaleRoot_${scale}`, scene);
    root.position.x = positionX;
    // Plain Babylon API instead of QuarksUtil.resizeEffect, set before the
    // system starts emitting so every particle bakes in the right scale.
    root.scaling.setAll(scale);

    // 1-unit reference cube so the particle size at each scale is easy to compare against.
    const marker = MeshBuilder.CreateBox(`marker_${scale}`, {size: 1}, scene);
    const markerMat = new StandardMaterial(`markerMat_${scale}`, scene);
    markerMat.diffuseColor = new Color3(0.3, 0.3, 0.3);
    markerMat.alpha = 0.35;
    marker.material = markerMat;
    marker.parent = root;

    const system = new ParticleSystem({
        scene,
        duration: 5,
        looping: true,
        startLife: new IntervalValue(3, 4),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(1, 1.5),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        worldSpace: false,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(20), cycle: 1, interval: 0.01, probability: 1}],
        shape: new SphereEmitter({radius: 2}),
        renderMode: RenderMode.BillBoard,
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
    });
    system.emitter.parent = root;
    batchRenderer.addSystem(system);
    systems.push(system);
}

export function init({scene, camera, batchRenderer, systems}: DemoContext) {
    camera.setPosition(new BVector3(0, 6, 20));
    const texture = createSharedTexture(scene, SHARED_ASSETS.defaultParticle);

    addScaledSystem({scene, batchRenderer, systems, texture, positionX: -8, scale: 1});
    addScaledSystem({scene, batchRenderer, systems, texture, positionX: 0, scale: 0.5});
    addScaledSystem({scene, batchRenderer, systems, texture, positionX: 8, scale: 0.25});
}
