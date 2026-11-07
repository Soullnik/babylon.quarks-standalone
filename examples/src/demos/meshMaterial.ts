import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {CubeTexture} from '@babylonjs/core/Materials/Textures/cubeTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {
    ApplyCollision,
    ApplyForce,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    EulerGenerator,
    IntervalValue,
    ParticleSystem,
    RandomColor,
    RandomQuatGenerator,
    RenderMode,
    Rotation3DOverLife,
} from 'babylon.quarks';
import {addGround} from '../shared/stage';
import {baseTexture} from '../shared/textures';
import type {DemoContext} from '../types';

const ENV_FACE_URLS = [
    'textures/cube/posx.jpg',
    'textures/cube/posy.jpg',
    'textures/cube/posz.jpg',
    'textures/cube/negx.jpg',
    'textures/cube/negy.jpg',
    'textures/cube/negz.jpg',
];

/**
 * Mesh particles drawn with a Babylon material: gold coins thrown up in a fountain, a
 * `StandardMaterial` with an environment map for their shine, tumbling (`Rotation3DOverLife`),
 * falling and bouncing on the floor (`ApplyCollision` with a plane) until they fade. A glow under
 * the fountain is an ordinary additive billboard system beside them.
 */
export function init({scene, camera, add}: DemoContext) {
    camera.setPosition(new BVector3(0, 4.5, 10));
    camera.setTarget(new BVector3(0, 1.4, 0));
    addGround(scene);

    const environment = CubeTexture.CreateFromImages(ENV_FACE_URLS, scene, true);
    environment.coordinatesMode = Texture.CUBIC_MODE;
    const gold = new StandardMaterial('gold', scene);
    gold.diffuseColor = new Color3(0.85, 0.6, 0.18);
    gold.specularColor = new Color3(1, 0.9, 0.6);
    gold.specularPower = 48;
    gold.reflectionTexture = environment;
    gold.reflectionTexture.level = 0.55;
    gold.backFaceCulling = false;

    // A coin: a short cylinder, about 1 across.
    const coin = MeshBuilder.CreateCylinder('coin', {diameter: 1, height: 0.12, tessellation: 24}, scene);
    coin.isVisible = false;
    coin.setEnabled(false);

    const coins = new ParticleSystem({
        scene,
        duration: 1.5,
        looping: true,
        prewarm: true,
        instancingGeometry: new Float32Array(coin.getVerticesData(VertexBuffer.PositionKind)!),
        instancingNormals: new Float32Array(coin.getVerticesData(VertexBuffer.NormalKind)!),
        instancingUVs: new Float32Array(coin.getVerticesData(VertexBuffer.UVKind)!),
        instancingIndices: new Uint32Array(coin.getIndices()!),
        startLife: new IntervalValue(2.4, 3.2),
        startSpeed: new IntervalValue(5, 7),
        startSize: new IntervalValue(0.28, 0.36),
        // The particle's colour tints the material: gold, the shine from the environment map.
        startColor: new RandomColor(new Color4(1, 0.72, 0.25, 1), new Color4(1, 0.85, 0.45, 1)),
        startRotation: new RandomQuatGenerator(),
        worldSpace: true,
        emissionOverTime: new ConstantValue(14),
        shape: new ConeEmitter({radius: 0.2, angle: 0.45}),
        material: gold,
        renderMode: RenderMode.Mesh,
        transparent: false,
        blendMode: Constants.ALPHA_DISABLE,
    });
    coins.emitter.name = 'Coins';
    coins.addBehavior(
        new Rotation3DOverLife(
            new EulerGenerator(new IntervalValue(-9, 9), new IntervalValue(-3, 3), new IntervalValue(-9, 9))
        )
    );
    coins.addBehavior(new ApplyForce(new BVector3(0, -1, 0), new ConstantValue(12)));
    coins.addBehavior(
        new ApplyCollision(undefined, 0.45, {
            planes: [{position: {x: 0, y: 0, z: 0}, normal: {x: 0, y: 0, z: 1}}],
            dampen: 0.25,
        })
    );
    // The cone emits along +z; aim it up. The collision plane is in the emitter's space, so its
    // normal is +z too: up, and the floor is the emitter's own height.
    coins.emitter.rotation.x = -Math.PI / 2;
    coins.emitter.position.y = 0.05;
    add(coins);

    const glow = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new IntervalValue(0.4, 0.6),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(2.4, 3),
        startColor: new ConstantColor(new Color4(1, 0.75, 0.3, 0.35)),
        emissionOverTime: new ConstantValue(6),
        shape: new ConeEmitter({radius: 0.01, angle: 0}),
        texture: baseTexture(scene, 'glow'),
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        renderMode: RenderMode.HorizontalBillBoard,
    });
    glow.emitter.name = 'Glow';
    glow.emitter.position.y = 0.04;
    add(glow);
}
