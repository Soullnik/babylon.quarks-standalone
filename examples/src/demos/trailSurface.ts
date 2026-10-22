import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {DynamicTexture} from '@babylonjs/core/Materials/Textures/dynamicTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Scene} from '@babylonjs/core/scene';
import {
    Bezier,
    ConstantColor,
    ConstantValue,
    IntervalValue,
    MeshSurfaceEmitter,
    ParticleSystem,
    PiecewiseBezier,
    PointEmitter,
    RandomColor,
    RenderMode,
    SizeOverLife,
    Vector4,
} from 'babylon.quarks';
import {createSharedTexture} from '../shared/common';
import type {DemoContext} from '../types';

/** A square canvas texture painted by `paint`, wrapping or clamped, without mipmaps. */
function canvasTexture(
    scene: Scene,
    name: string,
    size: number,
    wrap: boolean,
    paint: (ctx: CanvasRenderingContext2D, size: number) => void
): DynamicTexture {
    const texture = new DynamicTexture(name, {width: size, height: size}, scene, false);
    paint(texture.getContext() as unknown as CanvasRenderingContext2D, size);
    texture.update(false);
    const mode = wrap ? Texture.WRAP_ADDRESSMODE : Texture.CLAMP_ADDRESSMODE;
    texture.wrapU = mode;
    texture.wrapV = mode;
    return texture;
}

/** Soft bands along U that tile: the red channel runs 0…1 across each band, alpha follows. */
function bands(ctx: CanvasRenderingContext2D, size: number): void {
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const v = 0.5 + 0.5 * Math.sin((x / size) * Math.PI * 2 * 3);
            const i = (y * size + x) * 4;
            image.data[i] = image.data[i + 1] = image.data[i + 2] = Math.round(v * 255);
            image.data[i + 3] = Math.round(Math.pow(v, 2) * 255);
        }
    }
    ctx.putImageData(image, 0, 0);
}

/** Ice ramp along U: deep blue, cyan, white. */
function iceRamp(ctx: CanvasRenderingContext2D, size: number): void {
    const gradient = ctx.createLinearGradient(0, 0, size, 0);
    gradient.addColorStop(0, 'rgba(10, 20, 90, 0)');
    gradient.addColorStop(0.4, 'rgba(30, 90, 220, 1)');
    gradient.addColorStop(0.75, 'rgba(120, 230, 255, 1)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 1)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
}

/**
 * Left: a spinning torus knot with a `MeshSurfaceEmitter`, shedding trail
 * particles along its surface normals. The trails are smoothed with
 * `tessellation` and `curveTension`, keep their particle's colour
 * (`colorFromParticle`), run their texture from the head (`uvFromHead`), vanish
 * with their particle (`dieWithParticle`) and are recorded in world space
 * (`recordWorldSpace`), so they streak behind the knot although the system
 * simulates in its local space.
 *
 * Right: mesh-particle ripples. The disc's second UV set is radial, the map is
 * laid on UV channel 1 and scrolled, so the bands flow outward from the centre;
 * a gradient map colours them by the band's red channel.
 */
export function init({scene, camera, batchRenderer, systems}: DemoContext) {
    camera.setPosition(new BVector3(0, 7, 20));
    const sheet = createSharedTexture(scene);

    // Left: the knot and the trails shed from its surface.
    const pivot = new TransformNode('knotPivot', scene);
    pivot.position.x = -5;
    const knot = MeshBuilder.CreateTorusKnot(
        'knot',
        {radius: 1.4, tube: 0.4, radialSegments: 64, tubularSegments: 12},
        scene
    );
    knot.parent = pivot;
    const knotMaterial = new StandardMaterial('knot', scene);
    knotMaterial.diffuseColor = new Color3(0.15, 0.18, 0.3);
    knotMaterial.emissiveColor = new Color3(0.05, 0.08, 0.2);
    knotMaterial.specularColor = Color3.Black();
    knot.material = knotMaterial;

    const trails = new ParticleSystem({
        scene,
        duration: 2,
        looping: true,
        startLife: new IntervalValue(0.8, 1.2),
        startSpeed: new IntervalValue(2, 4),
        startSize: new ConstantValue(0.14),
        startColor: new RandomColor(new Vector4(1, 0.5, 0.2, 1), new Vector4(1, 0.9, 0.4, 1)),
        worldSpace: false,
        emissionOverTime: new ConstantValue(60),
        shape: new MeshSurfaceEmitter(knot),
        texture: sheet,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(0),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.Trail,
        rendererEmitterSettings: {
            startLength: new ConstantValue(20),
            followLocalOrigin: false,
            tessellation: 6,
            curveTension: 0.2,
            colorFromParticle: true,
            uvFromHead: true,
            dieWithParticle: true,
            recordWorldSpace: true,
        },
    });
    trails.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.8, 0.4, 0), 0]])));
    trails.emitter.parent = pivot;
    batchRenderer.addSystem(trails);
    systems.push(trails);

    // Right: a disc whose second UV set is radial (U = distance from the centre, V = angle).
    const disc = MeshBuilder.CreateDisc('ripple', {radius: 1, tessellation: 48}, scene);
    disc.isVisible = false;
    disc.setEnabled(false);
    const positions = disc.getVerticesData(VertexBuffer.PositionKind)!;
    const uvs2 = new Float32Array((positions.length / 3) * 2);
    for (let i = 0; i < positions.length / 3; i++) {
        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        uvs2[i * 2] = Math.sqrt(x * x + y * y);
        uvs2[i * 2 + 1] = Math.atan2(y, x) / (Math.PI * 2) + 0.5;
    }
    const ripples = new ParticleSystem({
        scene,
        duration: 2,
        looping: true,
        startLife: new IntervalValue(1.2, 1.8),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(2, 4),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        worldSpace: false,
        emissionOverTime: new ConstantValue(2),
        shape: new PointEmitter(),
        texture: canvasTexture(scene, 'bands', 256, true, bands),
        mapUV: {channel: 1, tiling: [2, 1], scroll: [-0.8, 0]},
        gradientMap: {ramp: canvasTexture(scene, 'iceRamp', 256, false, iceRamp), channel: 'r'},
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        renderMode: RenderMode.Mesh,
        instancingGeometry: new Float32Array(positions),
        instancingNormals: new Float32Array(disc.getVerticesData(VertexBuffer.NormalKind)!),
        instancingUVs: new Float32Array(disc.getVerticesData(VertexBuffer.UVKind)!),
        instancingUVs2: uvs2,
        instancingIndices: new Uint32Array(disc.getIndices()!),
    });
    ripples.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.3, 0.8, 1, 1), 0]])));
    ripples.emitter.position = new BVector3(5, -1, 0);
    ripples.emitter.rotation.x = Math.PI / 2; // lay the disc flat
    batchRenderer.addSystem(ripples);
    systems.push(ripples);
}

export function update({scene}: DemoContext, delta: number) {
    const pivot = scene.getTransformNodeByName('knotPivot');
    if (pivot) {
        pivot.rotation.y += delta * 0.6;
        pivot.rotation.x += delta * 0.2;
    }
}
