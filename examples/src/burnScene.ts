import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera';
import {Constants} from '@babylonjs/core/Engines/constants';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import type {Mesh} from '@babylonjs/core/Meshes/mesh';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import type {Scene} from '@babylonjs/core/scene';
import {
    BatchedRenderer,
    Bezier,
    ColorOverLife,
    ColorRange,
    ConstantColor,
    ConstantValue,
    ForceOverLife,
    FrameOverLife,
    IntervalValue,
    MeshSurfaceEmitter,
    ParticleSystem,
    PiecewiseBezier,
    RenderMode,
    SizeOverLife,
    SphereEmitter,
    Vector4,
    type FunctionColorGenerator,
} from 'babylon.quarks';
import {burnFragmentShader, burnVertexShader} from './burnShader';
import {createSharedTexture, SHARED_ASSETS} from './shared/common';

export const BURN_CUBE = {width: 3, height: 3, depth: 0.05};

export interface BurnShellOptions {
    burn: number;
    stylized: boolean;
    /** Read every bind, so one clock can drive several scenes. */
    getTime: () => number;
}

/**
 * The fire pass: a copy of the object's mesh, pushed out along its normals and
 * drawn additively. It cannot intersect the object because it is the object.
 */
export function createBurnShell(scene: Scene, cube: Mesh, camera: ArcRotateCamera, options: BurnShellOptions) {
    const shell = MeshBuilder.CreateBox('burnShell', BURN_CUBE, scene);
    shell.position = cube.position.clone();
    shell.isPickable = false;

    const material = new ShaderMaterial(
        'burnShell',
        scene,
        {vertexSource: burnVertexShader, fragmentSource: burnFragmentShader},
        {
            attributes: ['position', 'normal', 'uv'],
            uniforms: [
                'world',
                'worldViewProjection',
                'eyePosition',
                'inflate',
                'time',
                'burn',
                'noiseScale',
                'scrollSpeed',
                'emberColor',
                'flameColor',
                'coreColor',
                'outlineColor',
                'stylize',
                'height',
            ],
        }
    );
    material.setFloat('inflate', 0.02);
    material.setFloat('burn', options.burn);
    material.setFloat('noiseScale', 9.0);
    material.setFloat('scrollSpeed', 0.55);
    material.setFloat('height', BURN_CUBE.height);
    material.setVector3('emberColor', new BVector3(1.0, 0.28, 0.06));
    material.setVector3('flameColor', new BVector3(1.0, 0.62, 0.16));
    material.setVector3('coreColor', new BVector3(1.0, 0.86, 0.5));
    material.setVector3('outlineColor', new BVector3(0.42, 0.06, 0.03));
    material.setFloat('stylize', options.stylized ? 1 : 0);
    material.alphaMode = Constants.ALPHA_ADD;
    material.needAlphaBlending = () => true;
    material.backFaceCulling = false;
    material.disableDepthWrite = true;
    material.onBindObservable.add(() => {
        material.setVector3('eyePosition', camera.globalPosition);
        material.setFloat('time', options.getTime());
    });
    shell.material = material;
    return material;
}

/** Embers leaving the surface along its normals, then drifting up. */
export function createBurnEmbers(scene: Scene, renderer: BatchedRenderer, cube: Mesh) {
    const embers = new ParticleSystem({
        scene,
        duration: 2,
        looping: true,
        startLife: new IntervalValue(0.6, 1.3),
        startSpeed: new IntervalValue(0.15, 0.5),
        startSize: new IntervalValue(0.05, 0.12),
        startColor: new ConstantColor(new Vector4(1, 0.6, 0.2, 1)),
        worldSpace: true,
        emissionOverTime: new ConstantValue(140),
        shape: new MeshSurfaceEmitter(cube),
        renderMode: RenderMode.BillBoard,
        texture: createSharedTexture(scene, SHARED_ASSETS.defaultParticle),
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        cameraOffset: 0.05,
    });
    embers.addBehavior(new ForceOverLife(new ConstantValue(0), new ConstantValue(1.4), new ConstantValue(0)));
    embers.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.8, 0.35, 0), 0]])));
    embers.addBehavior(
        new ColorOverLife(
            new ColorRange(
                new Vector4(1, 0.85, 0.45, 1),
                new Vector4(1, 0.2, 0.05, 0)
            ) as unknown as FunctionColorGenerator
        )
    );
    embers.emitter.position = cube.position.clone();
    renderer.addSystem(embers);
    return embers;
}

/** Smoke above the object, where nothing can intersect it. */
export function createBurnSmoke(scene: Scene, renderer: BatchedRenderer, cube: Mesh) {
    const smoke = new ParticleSystem({
        scene,
        duration: 2,
        looping: true,
        startLife: new IntervalValue(1.4, 2.2),
        startSpeed: new IntervalValue(0.3, 0.7),
        startSize: new IntervalValue(0.7, 1.4),
        startColor: new ConstantColor(new Vector4(0.28, 0.26, 0.26, 0.5)),
        worldSpace: true,
        emissionOverTime: new ConstantValue(14),
        shape: new SphereEmitter({radius: 1.1, thickness: 1, arc: Math.PI * 2}),
        renderMode: RenderMode.BillBoard,
        texture: createSharedTexture(scene, SHARED_ASSETS.smoke),
        uTileCount: 2,
        vTileCount: 2,
        blendTiles: true,
        startTileIndex: new ConstantValue(0),
        transparent: true,
        blendMode: Constants.ALPHA_COMBINE,
        // Smoke is the layer soft particles are actually for: it drifts towards
        // the surface gradually instead of lying flat against it.
        softParticles: true,
        softNearFade: 0,
        softFarFade: 0.4,
    });
    smoke.addBehavior(new FrameOverLife(new PiecewiseBezier([[new Bezier(0, 1.33, 2.67, 4), 0]])));
    smoke.addBehavior(new ForceOverLife(new ConstantValue(0), new ConstantValue(0.8), new ConstantValue(0)));
    smoke.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.5, 0.9, 1.1, 1.2), 0]])));
    smoke.emitter.position = cube.position.add(new BVector3(0, 1.4, 0));
    renderer.addSystem(smoke);
    return smoke;
}
