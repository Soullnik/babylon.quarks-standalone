import type { DemoContext } from '../types';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {CubeTexture} from '@babylonjs/core/Materials/Textures/cubeTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {Constants} from '@babylonjs/core/Engines/constants';
import {
    ParticleSystem,
    ConstantValue,
    IntervalValue,
    ConeEmitter,
    RenderMode,
    ConstantColor,
    RandomQuatGenerator,
    EulerGenerator,
    Rotation3DOverLife,
    Vector4,
} from 'babylon.quarks';

export function init({scene, camera, batchRenderer, systems}: DemoContext) {
    camera.setPosition(new BVector3(0, 6, 16));

    // noMipmap: true — on iOS WebKit, a cube that expects mipmaps but never gets a
    // complete chain throws GL_INVALID_OPERATION (1282) on every draw, so the
    // particle batch is culled while the CPU count keeps moving.
    const envMap = CubeTexture.CreateFromImages(
        [
            'textures/cube/posx.jpg',
            'textures/cube/posy.jpg',
            'textures/cube/posz.jpg',
            'textures/cube/negx.jpg',
            'textures/cube/negy.jpg',
            'textures/cube/negz.jpg',
        ],
        scene,
        true
    );
    envMap.coordinatesMode = Texture.CUBIC_MODE;
    envMap.updateSamplingMode(Texture.LINEAR_LINEAR);

    // StandardMaterial is the public API surface: applyMaterialSettings reads
    // reflectionTexture into the mesh batch. Do not assign it to a scene mesh —
    // compiling Standard + cubemap on a dummy mesh has broken draws on iOS WebKit
    // while the particle count still ticks.
    const meshMaterial = new StandardMaterial('meshParticleMaterial', scene);
    meshMaterial.backFaceCulling = false;
    meshMaterial.alpha = 0.95;
    meshMaterial.transparencyMode = null;
    meshMaterial.reflectionTexture = envMap;

    const particleMesh = MeshBuilder.CreateCapsule(
        'meshParticleGeo',
        {radius: 1, height: 3, tessellation: 12, subdivisions: 3},
        scene
    );
    particleMesh.isVisible = false;
    particleMesh.setEnabled(false);
    const positions = particleMesh.getVerticesData(VertexBuffer.PositionKind);
    const normals = particleMesh.getVerticesData(VertexBuffer.NormalKind);
    const indices = particleMesh.getIndices();
    if (!positions || !indices) {
        return;
    }

    const meshSystem = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        prewarm: true,
        instancingGeometry: new Float32Array(positions),
        instancingNormals: normals ? new Float32Array(normals) : undefined,
        instancingIndices: new Uint32Array(indices),
        startLife: new IntervalValue(2.0, 3.0),
        startSpeed: new ConstantValue(1),
        startSize: new ConstantValue(0.1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        startRotation: new RandomQuatGenerator(),
        worldSpace: true,
        emissionOverTime: new ConstantValue(60),
        shape: new ConeEmitter({radius: 0.1, angle: 1}),
        material: meshMaterial,
        renderMode: RenderMode.Mesh,
        transparent: true,
        blendMode: Constants.ALPHA_COMBINE,
        alphaTest: 0,
        startTileIndex: new ConstantValue(0),
        uTileCount: 1,
        vTileCount: 1,
        renderOrder: 0,
    });
    meshSystem.addBehavior(
        new Rotation3DOverLife(
            new EulerGenerator(new IntervalValue(0, Math.PI), new ConstantValue(0), new ConstantValue(0))
        )
    );
    batchRenderer.addSystem(meshSystem);
    systems.push(meshSystem);
}
