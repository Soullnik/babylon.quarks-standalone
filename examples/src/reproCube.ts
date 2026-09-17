import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera';
import {Constants} from '@babylonjs/core/Engines/constants';
import {Engine} from '@babylonjs/core/Engines/engine';
import {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight';
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
    IntervalValue,
    MeshSurfaceEmitter,
    ParticleSystem,
    PiecewiseBezier,
    RenderMode,
    SizeOverLife,
    Vector4,
    type FunctionColorGenerator,
} from 'babylon.quarks';
import {loadQuarksFromJson} from './loadQuarksJson';
import {createSharedTexture, SHARED_ASSETS} from './shared/common';

/**
 * Minimal reproduction: the uploaded RoundFireRed effect sitting inside a cube
 * that is 0.05 units thick, which is where billboard particles show a hard cut
 * along the intersection line.
 *
 * Query parameters:
 *   soft=1   turn softParticles on for every system in the effect
 *   depth=1  hand the renderer a depth texture (needed for soft to do anything)
 *   near=…, far=…  softNearFade / softFarFade
 *   test=0   drop the depth test, so the effect draws over the cube instead of
 *            being cut by it — what a lot of shipped games do for small effects
 *   offset=… push the whole effect this far towards the camera in world space:
 *            fine from one angle, obviously detached once the camera orbits
 *   camoff=… the same nudge done per sprite along the eye ray, which holds from
 *            every angle (ParticleSystem.cameraOffset)
 *   surface=1 replace the loaded effect with small flames emitted from the
 *            cube's own surface along its normals — the shape of effect that
 *            wraps an object instead of sitting in one plane through it
 *   t=…      seconds of effect time to simulate before the screenshot
 *
 * `window.reproAdvance(dt, dAlpha)` steps the effect and orbits the camera by
 * hand, so a capture script can build a deterministic turntable.
 */
const params = new URLSearchParams(location.search);
const useSoft = params.get('soft') === '1';
const useDepth = params.get('depth') !== '0';
const nearFade = Number(params.get('near') ?? 0);
const farFade = Number(params.get('far') ?? 1);
const depthTest = params.get('test') !== '0';
const effectOffset = Number(params.get('offset') ?? 0);
const cameraOffset = Number(params.get('camoff') ?? 0);
const emitFromSurface = params.get('surface') === '1';
const settleTime = Number(params.get('t') ?? 1.2);

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const engine = new Engine(canvas, true, {preserveDrawingBuffer: true, stencil: true});
const scene = new Scene(engine);
scene.clearColor = new Color4(0.05, 0.06, 0.09, 1);

const camera = new ArcRotateCamera('cam', -Math.PI / 2 + 0.6, 1.25, 6, new BVector3(0, 0.6, 0), scene);
camera.attachControl(canvas, true);
camera.minZ = 0.1;
camera.maxZ = 100;
new HemisphericLight('light', new BVector3(0, 1, 0), scene);

// The cube from the report: 0.05 thick, standing through the middle of the effect.
const cube = MeshBuilder.CreateBox('thinCube', {width: 3, height: 3, depth: 0.05}, scene);
cube.position = new BVector3(0, 0.75, 0);
const cubeMaterial = new StandardMaterial('thinCubeMat', scene);
cubeMaterial.diffuseColor = new Color3(0.45, 0.47, 0.55);
cubeMaterial.specularColor = new Color3(0.05, 0.05, 0.05);
cube.material = cubeMaterial;

const batchRenderer = new BatchedRenderer('batchRenderer', scene);
if (useDepth) {
    batchRenderer.setDepthTexture(scene.enableDepthRenderer(camera).getDepthMap());
}

const systems: ParticleSystem[] = [];

/**
 * Small, short-lived flames born on the cube's surface and drifting out along
 * its normals. A wrapping effect is authored this way — one fireball sprite
 * pushed against an object can only ever be a flat card next to it.
 */
function createSurfaceFlames() {
    const flames = new ParticleSystem({
        scene,
        duration: 2,
        looping: true,
        startLife: new IntervalValue(0.4, 0.8),
        startSpeed: new IntervalValue(0.2, 0.6),
        startSize: new IntervalValue(0.25, 0.5),
        startColor: new ConstantColor(new Vector4(1, 0.55, 0.15, 1)),
        worldSpace: true,
        emissionOverTime: new ConstantValue(400),
        shape: new MeshSurfaceEmitter(cube),
        renderMode: RenderMode.BillBoard,
        texture: createSharedTexture(scene, SHARED_ASSETS.defaultParticle),
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        softParticles: useSoft,
        softNearFade: nearFade,
        softFarFade: farFade,
        cameraOffset,
    });
    flames.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(1, 0.9, 0.5, 0), 0]])));
    flames.addBehavior(
        new ColorOverLife(
            new ColorRange(
                new Vector4(1, 0.8, 0.3, 1),
                new Vector4(1, 0.15, 0.05, 0)
            ) as unknown as FunctionColorGenerator
        )
    );
    flames.emitter.position = cube.position.clone();
    batchRenderer.addSystem(flames);
    systems.push(flames);
}

async function main() {
    if (emitFromSurface) {
        createSurfaceFlames();
        const step = 1 / 60;
        for (let time = 0; time < settleTime; time += step) {
            batchRenderer.update(step);
        }
        scene.render();
        (window as unknown as {reproReady: boolean}).reproReady = true;
        return;
    }

    const json = await (await fetch('./RoundFireRed.json')).json();
    const root = loadQuarksFromJson(scene, batchRenderer, systems, json, './');
    // Towards the camera, which sits on -Z looking at the cube.
    root.position = new BVector3(0, 0, -effectOffset);

    if (!depthTest) {
        for (const system of systems) {
            system.getRendererSettings().materialDepthTest = false;
            batchRenderer.updateSystem(system);
        }
    }

    if (useSoft) {
        for (const system of systems) {
            system.softParticles = true;
            system.softNearFade = nearFade;
            system.softFarFade = farFade;
            batchRenderer.updateSystem(system);
        }
    }

    if (cameraOffset !== 0) {
        for (const system of systems) {
            system.cameraOffset = cameraOffset;
            batchRenderer.updateSystem(system);
        }
    }

    // Fixed-step warm-up so the screenshot is the same every run.
    const step = 1 / 60;
    for (let time = 0; time < settleTime; time += step) {
        batchRenderer.update(step);
    }
    scene.render();
    (window as unknown as {reproReady: boolean}).reproReady = true;
}

// Hand-driven frames: a capture script gets the same turntable every run,
// whatever the machine's frame rate.
(window as unknown as {reproAdvance: (dt: number, dAlpha: number) => void}).reproAdvance = (dt, dAlpha) => {
    camera.alpha += dAlpha;
    batchRenderer.update(dt);
    scene.render();
};

engine.runRenderLoop(() => {
    scene.render();
});
window.addEventListener('resize', () => engine.resize());
main().catch((error) => {
    console.error(error);
    (window as unknown as {reproError: string}).reproError = String(error);
});
