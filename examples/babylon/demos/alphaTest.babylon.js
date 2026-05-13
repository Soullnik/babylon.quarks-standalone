import '@babylonjs/loaders';
import {ImportMeshAsync} from '@babylonjs/core/Loading/sceneLoader';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
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

function getMeshTexture(mesh) {
    const material = mesh.material;
    if (!material) {
        return null;
    }
    const candidate = material.albedoTexture || material.baseTexture || material.diffuseTexture || material.opacityTexture;
    return candidate instanceof Texture ? candidate : null;
}

export async function initAlphaTestBabylonDemo({scene, camera, batchRenderer, systems}) {
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
        maxParticle: alphaTestConfig.burstCount,
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
            ),
            false
        )
    );
    leaves.addBehavior(
        new SpeedOverLife(
            new PiecewiseBezier([
                [new Bezier(...alphaTestConfig.speedOverLifeCurve), 0],
            ])
        )
    );
    leaves.emitter.position = new BVector3(alphaTestConfig.emitterOffsetX, 0, 0);

    batchRenderer.addSystem(leaves);
    systems.push(leaves);
}
