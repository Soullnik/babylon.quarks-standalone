import {Constants} from '@babylonjs/core/Engines/constants';
import {PointLight} from '@babylonjs/core/Lights/pointLight';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {
    Bezier,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    IntervalValue,
    ParticleSystem,
    PiecewiseBezier,
    RenderMode,
    SpeedOverLife,
    Vector4,
} from 'babylon.quarks';
import {createSharedTexture, SHARED_ASSETS} from '../shared/common';
import type {DemoContext} from '../types';

export function init({scene, camera, batchRenderer, systems, demoState}: DemoContext) {
    camera.setPosition(new BVector3(0, 10, 60));
    camera.lowerRadiusLimit = 1;
    camera.upperRadiusLimit = 200;
    const texture = createSharedTexture(scene, SHARED_ASSETS.defaultParticle);

    const ground = MeshBuilder.CreateGround('followGround', {width: 130, height: 130}, scene);
    const groundMat = new StandardMaterial('followGroundMat', scene);
    groundMat.diffuseColor = new Color3(0.08, 0.1, 0.14);
    groundMat.specularColor = new Color3(0.05, 0.05, 0.05);
    ground.material = groundMat;
    ground.position.y = -0.02;

    const routeRing = MeshBuilder.CreateTorus(
        'followRoute',
        {diameter: 100, thickness: 0.18, tessellation: 128},
        scene
    );
    const routeRingMat = new StandardMaterial('followRouteMat', scene);
    routeRingMat.diffuseColor = new Color3(0.22, 0.36, 0.66);
    routeRingMat.emissiveColor = new Color3(0.08, 0.16, 0.32);
    routeRing.material = routeRingMat;
    routeRing.rotation.x = Math.PI / 2;

    const leader = MeshBuilder.CreateSphere('followLeader', {diameter: 0.6}, scene);
    const leaderMat = new StandardMaterial('followLeaderMat', scene);
    leaderMat.diffuseColor = new Color3(1, 0.6, 0.2);
    leaderMat.emissiveColor = new Color3(0.7, 0.35, 0.1);
    leader.material = leaderMat;
    leader.position.y = 0.7;

    const leaderLight = new PointLight('followLeaderLight', leader.position.clone(), scene);
    leaderLight.parent = leader;
    leaderLight.intensity = 10;
    leaderLight.range = 25;
    leaderLight.diffuse = new Color3(1, 0.5, 0.2);

    const system = new ParticleSystem({
        scene,
        duration: 6,
        looping: true,
        startLife: new IntervalValue(2, 3),
        startSpeed: new ConstantValue(20),
        startSize: new IntervalValue(1, 2),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        // Keep particles in world space so the moving leader leaves a readable trail.
        worldSpace: true,
        emissionOverTime: new ConstantValue(10),
        shape: new ConeEmitter({radius: 0.1, angle: 0.1}),
        renderMode: RenderMode.BillBoard,
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
    });
    system.addBehavior(new SpeedOverLife(new PiecewiseBezier([[new Bezier(1, 0.75, 0.5, 0), 0]])));
    system.emitter.parent = leader;
    batchRenderer.addSystem(system);
    systems.push(system);

    demoState.followObject = {
        elapsed: 0,
        leader,
        camera,
    };
}

export function update({demoState}: DemoContext, delta: number) {
    const state = demoState.followObject;
    if (!state) {
        return;
    }
    state.elapsed += delta;
    const x = Math.sin(state.elapsed) * 50;
    const z = Math.cos(state.elapsed) * 50;
    state.leader.position.x = x;
    state.leader.position.y = 0.7;
    state.leader.position.z = z;
    state.camera.setPosition(new BVector3(x, 10, z + 10));
    state.camera.setTarget(new BVector3(x, 0.7, z));
}
