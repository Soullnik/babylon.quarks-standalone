import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {DynamicTexture} from '@babylonjs/core/Materials/Textures/dynamicTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
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
} from 'babylon.quarks';
import {band} from '../shared/geometry';
import {addLabel} from '../shared/labels';
import {addGround} from '../shared/stage';
import {baseTexture} from '../shared/textures';
import type {DemoContext, DemoRun} from '../types';

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
 * laid on UV channel 1 and scrolled, so smoke flows outward from the centre in
 * broken rings; a gradient map colours it by the smoke's red channel, as frost.
 */
export function init({scene, camera, add}: DemoContext): DemoRun {
    camera.setPosition(new BVector3(0, 4, 15));
    camera.setTarget(new BVector3(0, 0, 0));
    addGround(scene, -2.2);
    addLabel(scene, 'MeshSurfaceEmitter trails', new BVector3(-5, 3, 0), {height: 0.42});
    addLabel(scene, 'Mesh UV2 + gradientMap', new BVector3(5, 1.6, 0), {height: 0.42});
    const sheet = baseTexture(scene, 'streak');

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
        startColor: new RandomColor(new Color4(1, 0.5, 0.2, 1), new Color4(1, 0.9, 0.4, 1)),
        worldSpace: false,
        emissionOverTime: new ConstantValue(60),
        shape: new MeshSurfaceEmitter(knot),
        texture: sheet,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
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
    add(trails);

    // Right: a disc whose second UV set is radial (U = distance from the centre, V = angle). Built
    // as a flat band from the centre out, which repeats its seam column, so V runs 0 to 1 round it
    // without the jump an atan2 angle makes where it wraps (a seam smeared across the triangles).
    const disc = band({bottom: 0, top: 1, height: 0, segments: 64, rows: 12});
    const uvs2 = new Float32Array(disc.instancingUVs.length);
    for (let i = 0; i < uvs2.length; i += 2) {
        uvs2[i] = disc.instancingUVs[i + 1];
        uvs2[i + 1] = disc.instancingUVs[i];
    }
    const ripples = new ParticleSystem({
        scene,
        duration: 2,
        looping: true,
        startLife: new IntervalValue(1.2, 1.8),
        startSpeed: new ConstantValue(0),
        startSize: new IntervalValue(2, 4),
        startColor: new ConstantColor(new Color4(1, 1, 1, 1)),
        worldSpace: false,
        emissionOverTime: new ConstantValue(2),
        shape: new PointEmitter(),
        // Smoke run outward from the centre: broken rings of frost, not even bands.
        texture: baseTexture(scene, 'swirl', true),
        mapUV: {channel: 1, tiling: [1.5, 2], scroll: [-0.6, 0]},
        gradientMap: {ramp: canvasTexture(scene, 'iceRamp', 256, false, iceRamp), channel: 'r'},
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        renderMode: RenderMode.Mesh,
        ...disc,
        instancingUVs2: uvs2,
    });
    ripples.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.3, 0.8, 1, 1), 0]])));
    ripples.emitter.position = new BVector3(5, -1, 0);
    add(ripples);

    return {
        update(delta) {
            pivot.rotation.y += delta * 0.6;
            pivot.rotation.x += delta * 0.2;
        },
    };
}
