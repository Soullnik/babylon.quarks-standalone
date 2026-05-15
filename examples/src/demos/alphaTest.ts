import type { DemoContext } from '../types';
import '@babylonjs/loaders';
import {ImportMeshAsync} from '@babylonjs/core/Loading/sceneLoader';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {Constants} from '@babylonjs/core/Engines/constants';
import {
    ParticleSystem,
    RenderMode,
    ConstantValue,
    IntervalValue,
    ConstantColor,
    PointEmitter,
    RandomQuatGenerator,
    PiecewiseBezier,
    Bezier,
    Vector4,
    Vector3,
    AxisAngleGenerator,
    Rotation3DOverLife,
    SpeedOverLife,
} from 'babylon.quarks';

const alphaTestConfig = {
    name: 'AlphaTest',
    duration: 5,
    burstCount: 100,
    life: {min: 4, max: 5},
    speed: 5,
    size: {min: 0.4, max: 0.5},
    angularVelocityAxis: {x: 0, y: 0.5, z: 0.2},
    angularVelocity: 1,
    speedOverLifeCurve: [1, 0.75, 0.5, 0],
    emitterOffsetX: 2,
};

function getMeshTexture(mesh: Mesh): Texture | null {
    const material = mesh.material;
    if (!material) {
        return null;
    }
    if (material instanceof PBRMaterial) {
        const texture = material.albedoTexture;
        return texture instanceof Texture ? texture : null;
    }
    if (material instanceof StandardMaterial) {
        const texture = material.diffuseTexture ?? material.opacityTexture;
        return texture instanceof Texture ? texture : null;
    }
    return null;
}

export async function init({scene, camera, batchRenderer, systems}: DemoContext) {
    camera.setPosition(new BVector3(0, 7, 14));

    const loaded = await ImportMeshAsync('leave.glb', scene, {meshNames: '', rootUrl: ''});
    const sourceMesh = loaded.meshes.find((node) => node instanceof Mesh && node.getTotalVertices() > 0);
    if (!(sourceMesh instanceof Mesh)) {
        return;
    }
    sourceMesh.isVisible = false;
    sourceMesh.setEnabled(false);

    const positions = sourceMesh.getVerticesData(VertexBuffer.PositionKind);
    const uvs = sourceMesh.getVerticesData(VertexBuffer.UVKind);
    const normals = sourceMesh.getVerticesData(VertexBuffer.NormalKind);
    const indices = sourceMesh.getIndices();
    if (!positions || !indices) {
        return;
    }

    const diffuseTexture = getMeshTexture(sourceMesh);
    const leaves = new ParticleSystem({
        scene,
        duration: alphaTestConfig.duration,
        looping: true,
        instancingGeometry: new Float32Array(positions),
        instancingUVs: uvs ? new Float32Array(uvs) : undefined,
        instancingNormals: normals ? new Float32Array(normals) : undefined,
        instancingIndices: new Uint32Array(indices),
        startRotation: new RandomQuatGenerator(),
        startLife: new IntervalValue(alphaTestConfig.life.min, alphaTestConfig.life.max),
        startSpeed: new ConstantValue(alphaTestConfig.speed),
        startSize: new IntervalValue(alphaTestConfig.size.min, alphaTestConfig.size.max),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        worldSpace: false,
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [
            {
                time: 0,
                count: new ConstantValue(alphaTestConfig.burstCount),
                cycle: 1,
                interval: 0.01,
                probability: 1,
            },
        ],
        shape: new PointEmitter(),
        texture: diffuseTexture,
        alphaTest: 0.5,
        transparent: false,
        blendMode: Constants.ALPHA_COMBINE,
        depthWrite: true,
        depthTest: true,
        startTileIndex: new ConstantValue(0),
        uTileCount: 1,
        vTileCount: 1,
        renderOrder: 2,
        renderMode: RenderMode.Mesh,
    });
    leaves.addBehavior(
        new Rotation3DOverLife(
            new AxisAngleGenerator(
                new Vector3(
                    alphaTestConfig.angularVelocityAxis.x,
                    alphaTestConfig.angularVelocityAxis.y,
                    alphaTestConfig.angularVelocityAxis.z
                ).normalize(),
                new ConstantValue(alphaTestConfig.angularVelocity)
            )
        )
    );
    const speedCurve = alphaTestConfig.speedOverLifeCurve as [number, number, number, number];
    leaves.addBehavior(
        new SpeedOverLife(
            new PiecewiseBezier([[new Bezier(...speedCurve), 0]])
        )
    );
    leaves.emitter.position = new BVector3(alphaTestConfig.emitterOffsetX, 0, 0);

    batchRenderer.addSystem(leaves);
    systems.push(leaves);
}
