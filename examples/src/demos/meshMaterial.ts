import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {CubeTexture} from '@babylonjs/core/Materials/Textures/cubeTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    EulerGenerator,
    IntervalValue,
    ParticleSystem,
    RandomQuatGenerator,
    RenderMode,
    Rotation3DOverLife,
    Vector4,
} from 'babylon.quarks';
import type {DemoContext} from '../types';

const ENV_FACE_URLS = [
    'textures/cube/posx.jpg',
    'textures/cube/posy.jpg',
    'textures/cube/posz.jpg',
    'textures/cube/negx.jpg',
    'textures/cube/negy.jpg',
    'textures/cube/negz.jpg',
];

export async function init({scene, camera, batchRenderer, systems}: DemoContext) {
    camera.setPosition(new BVector3(0, 6, 16));

    // Native Babylon cubemap — ParticleSystem harvest builds the iOS-safe 3×2 atlas.
    const envMap = CubeTexture.CreateFromImages(ENV_FACE_URLS, scene, true);
    envMap.coordinatesMode = Texture.CUBIC_MODE;
    envMap.level = 1;

    const meshMaterial = new StandardMaterial('meshParticleMaterial', scene);
    meshMaterial.backFaceCulling = false;
    meshMaterial.alpha = 1;
    meshMaterial.transparencyMode = null;
    meshMaterial.reflectionTexture = envMap;

    // Same class of texture AlphaTest / SubEmitter use successfully on iPhone.
    const diffuse = new Texture('textures/particle_default.png', scene);

    const particleMesh = MeshBuilder.CreateCapsule(
        'meshParticleGeo',
        {radius: 1, height: 3, tessellation: 12, subdivisions: 3},
        scene
    );
    particleMesh.isVisible = false;
    particleMesh.setEnabled(false);
    const positions = particleMesh.getVerticesData(VertexBuffer.PositionKind);
    const normals = particleMesh.getVerticesData(VertexBuffer.NormalKind);
    const uvs = particleMesh.getVerticesData(VertexBuffer.UVKind);
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
        instancingUVs: uvs ? new Float32Array(uvs) : undefined,
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
        texture: diffuse,
        renderMode: RenderMode.Mesh,
        transparent: false,
        blendMode: Constants.ALPHA_DISABLE,
        depthWrite: true,
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
