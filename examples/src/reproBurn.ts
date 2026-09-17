import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera';
import {Constants} from '@babylonjs/core/Engines/constants';
import {Engine} from '@babylonjs/core/Engines/engine';
import {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import '@babylonjs/core/Rendering/depthRendererSceneComponent';
import {Scene} from '@babylonjs/core/scene';
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

/**
 * A burn built the way a shipped game builds one: the fire is a second copy of
 * the object's mesh rather than sprites pushed against it, and the particle
 * systems only do the things that live in the air around it.
 *
 * Query parameters:
 *   burn=0..1  how far the fire has eaten into the surface
 *   shell=0    hide the mesh pass, leaving only the particles
 *   embers=0   drop the embers
 *   smoke=0    drop the smoke
 *   t=…        seconds to simulate before the first frame
 */
const params = new URLSearchParams(location.search);
const burnAmount = Number(params.get('burn') ?? 0.72);
const withShell = params.get('shell') !== '0';
const withEmbers = params.get('embers') !== '0';
const withSmoke = params.get('smoke') !== '0';
const settleTime = Number(params.get('t') ?? 1.5);

const CUBE = {width: 3, height: 3, depth: 0.05};

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const engine = new Engine(canvas, true, {preserveDrawingBuffer: true, stencil: true});
const scene = new Scene(engine);
scene.clearColor = new Color4(0.04, 0.045, 0.06, 1);

const camera = new ArcRotateCamera('cam', -Math.PI / 2 + 0.6, 1.25, 6.5, new BVector3(0, 0.75, 0), scene);
camera.attachControl(canvas, true);
camera.minZ = 0.1;
camera.maxZ = 100;
new HemisphericLight('light', new BVector3(0, 1, 0), scene);

const cube = MeshBuilder.CreateBox('thinCube', CUBE, scene);
cube.position = new BVector3(0, 0.75, 0);
const cubeMaterial = new StandardMaterial('thinCubeMat', scene);
cubeMaterial.diffuseColor = new Color3(0.4, 0.42, 0.5);
cubeMaterial.specularColor = new Color3(0.05, 0.05, 0.05);
cube.material = cubeMaterial;

const batchRenderer = new BatchedRenderer('batchRenderer', scene);
batchRenderer.setDepthTexture(scene.enableDepthRenderer(camera).getDepthMap());

let elapsed = 0;
let burnMaterial: ShaderMaterial | null = null;

/** The fire pass: the same box, a hair larger, drawn additively over the object. */
function createBurnShell() {
    // Subdivided so the inflate and the fresnel have vertices to work with.
    const shell = MeshBuilder.CreateBox('burnShell', CUBE, scene);
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
                'height',
            ],
        }
    );
    material.setFloat('inflate', 0.02);
    material.setFloat('burn', burnAmount);
    material.setFloat('noiseScale', 9.0);
    material.setFloat('scrollSpeed', 0.55);
    material.setFloat('height', CUBE.height);
    material.setVector3('emberColor', new BVector3(1.0, 0.28, 0.06));
    material.setVector3('flameColor', new BVector3(1.0, 0.62, 0.16));
    material.setVector3('coreColor', new BVector3(1.0, 0.86, 0.5));
    material.alphaMode = Constants.ALPHA_ADD;
    material.needAlphaBlending = () => true;
    material.backFaceCulling = false;
    material.disableDepthWrite = true;
    material.onBindObservable.add(() => {
        material.setVector3('eyePosition', camera.globalPosition);
        material.setFloat('time', elapsed);
    });
    shell.material = material;
    burnMaterial = material;
}

/** Embers leaving the surface along its normals, then drifting up. */
function createEmbers() {
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
    batchRenderer.addSystem(embers);
}

/** Smoke above the object, where nothing can intersect it. */
function createSmoke() {
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
    batchRenderer.addSystem(smoke);
}

if (withShell) {
    createBurnShell();
}
if (withEmbers) {
    createEmbers();
}
if (withSmoke) {
    createSmoke();
}

function advance(dt: number) {
    elapsed += dt;
    batchRenderer.update(dt);
}

const step = 1 / 60;
for (let time = 0; time < settleTime; time += step) {
    advance(step);
}
scene.render();
(window as unknown as {reproReady: boolean}).reproReady = true;

(window as unknown as {reproAdvance: (dt: number, dAlpha: number) => void}).reproAdvance = (dt, dAlpha) => {
    camera.alpha += dAlpha;
    advance(dt);
    scene.render();
};

/** Lets a capture script sweep the burn amount without reloading. */
(window as unknown as {reproSetBurn: (value: number) => void}).reproSetBurn = (value) => {
    burnMaterial?.setFloat('burn', value);
};

engine.runRenderLoop(() => {
    scene.render();
});
window.addEventListener('resize', () => engine.resize());
