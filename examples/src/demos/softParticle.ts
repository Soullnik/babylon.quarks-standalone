import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import '@babylonjs/core/Rendering/depthRendererSceneComponent';
import {
    Bezier,
    ConstantColor,
    ConstantValue,
    DepthTextureMode,
    ForceOverLife,
    FrameOverLife,
    ParticleSystem,
    PiecewiseBezier,
    PointEmitter,
    RenderMode,
    Vector4,
} from 'babylon.quarks';
import {createSharedTexture, SHARED_ASSETS} from '../shared/common';
import type {DemoContext} from '../types';

export function init({scene, camera, batchRenderer, systems}: DemoContext) {
    camera.setPosition(new BVector3(0, 7, 16));
    const texture = createSharedTexture(scene, SHARED_ASSETS.smoke);
    if (typeof scene.enableDepthRenderer === 'function') {
        const depthRenderer = scene.enableDepthRenderer();
        // The default depth renderer writes a linear depth metric, which is what
        // DepthTextureMode.LinearDepthMetric decodes.
        batchRenderer.setDepthTexture(depthRenderer.getDepthMap(), DepthTextureMode.LinearDepthMetric);
    }

    // Geometry for the particles to intersect. The slab is 5 cm thick on
    // purpose: a thin wall is where a hard billboard cut is most obvious.
    const ground = MeshBuilder.CreateGround('softGround', {width: 40, height: 40}, scene);
    const groundMaterial = new StandardMaterial('softGroundMat', scene);
    groundMaterial.diffuseColor = new Color3(0.22, 0.24, 0.3);
    groundMaterial.specularColor = new Color3(0.05, 0.05, 0.05);
    ground.material = groundMaterial;

    const slab = MeshBuilder.CreateBox('softSlab', {width: 10, height: 7, depth: 0.05}, scene);
    slab.position = new BVector3(0, 3.5, 0);
    const slabMaterial = new StandardMaterial('softSlabMat', scene);
    slabMaterial.diffuseColor = new Color3(0.35, 0.37, 0.45);
    slabMaterial.specularColor = new Color3(0.05, 0.05, 0.05);
    slab.material = slabMaterial;

    const softParticles = new ParticleSystem({
        scene,
        duration: 2,
        looping: true,
        startLife: new ConstantValue(2),
        startSpeed: new ConstantValue(10),
        startSize: new ConstantValue(2),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        worldSpace: true,
        emissionOverTime: new ConstantValue(60),
        shape: new PointEmitter(),
        renderMode: RenderMode.BillBoard,
        texture,
        transparent: true,
        blendMode: Constants.ALPHA_COMBINE,
        blendTiles: true,
        startTileIndex: new ConstantValue(0),
        uTileCount: 2,
        vTileCount: 2,
        softParticles: true,
        softNearFade: 0,
        softFarFade: 1,
    });
    softParticles.addBehavior(new FrameOverLife(new PiecewiseBezier([[new Bezier(0, 1.33333, 2.66667, 4), 0]])));
    softParticles.addBehavior(new ForceOverLife(new ConstantValue(0), new ConstantValue(-10), new ConstantValue(0)));
    batchRenderer.addSystem(softParticles);
    systems.push(softParticles);
}
