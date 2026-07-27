import type { DemoContext } from '../types';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
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

const ENV_FACE_URLS = [
    'textures/cube/posx.jpg',
    'textures/cube/posy.jpg',
    'textures/cube/posz.jpg',
    'textures/cube/negx.jpg',
    'textures/cube/negy.jpg',
    'textures/cube/negz.jpg',
] as const;

/** Loads one image URL as an HTMLImageElement. */
function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load ${url}`));
        image.src = url;
    });
}

/** Packs the six cube faces into one 3×2 atlas (px py pz / nx ny nz). */
async function createEnvAtlas(scene: DemoContext['scene']): Promise<Texture> {
    const images = await Promise.all(ENV_FACE_URLS.map((url) => loadImage(url)));
    const size = images[0].width;
    const canvas = document.createElement('canvas');
    canvas.width = size * 3;
    canvas.height = size * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Could not create env atlas canvas');
    }
    for (let i = 0; i < 6; i++) {
        ctx.drawImage(images[i], (i % 3) * size, Math.floor(i / 3) * size, size, size);
    }
    const atlas = new Texture(canvas.toDataURL('image/jpeg', 0.92), scene, {
        noMipmap: true,
        invertY: false,
        samplingMode: Texture.LINEAR_LINEAR,
    });
    atlas.name = 'meshEnvAtlas';
    atlas.level = 1;
    return atlas;
}

export async function init({scene, camera, batchRenderer, systems}: DemoContext) {
    camera.setPosition(new BVector3(0, 6, 16));

    const envAtlas = await createEnvAtlas(scene);

    const meshMaterial = new StandardMaterial('meshParticleMaterial', scene);
    meshMaterial.backFaceCulling = false;
    meshMaterial.alpha = 1;
    meshMaterial.transparencyMode = null;
    (meshMaterial as any).reflectionAtlas = envAtlas;
    (meshMaterial as any).reflectionLevel = 1;

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
