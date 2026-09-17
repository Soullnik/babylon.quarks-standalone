import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera';
import {Engine} from '@babylonjs/core/Engines/engine';
import {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import '@babylonjs/core/Rendering/depthRendererSceneComponent';
import {Scene} from '@babylonjs/core/scene';
import {BatchedRenderer} from 'babylon.quarks';
import {BURN_CUBE, createBurnEmbers, createBurnShell, createBurnSmoke} from './burnScene';

/**
 * A burn built the way a shipped game builds one: the fire is a second copy of
 * the object's mesh rather than sprites pushed against it, and the particle
 * systems only do the things that live in the air around it.
 *
 * Query parameters:
 *   burn=0..1      how far the fire has eaten into the surface
 *   style=painted  flat bands, hard edges and a stepped clock — a drawn look
 *   shell=0        hide the mesh pass, leaving only the particles
 *   embers=0       drop the embers
 *   smoke=0        drop the smoke
 *   t=…            seconds to simulate before the first frame
 */
const params = new URLSearchParams(location.search);
const burnAmount = Number(params.get('burn') ?? 0.72);
const stylized = params.get('style') === 'painted';
const withShell = params.get('shell') !== '0';
const withEmbers = params.get('embers') !== '0';
const withSmoke = params.get('smoke') !== '0';
const settleTime = Number(params.get('t') ?? 1.5);

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const engine = new Engine(canvas, true, {preserveDrawingBuffer: true, stencil: true});
const scene = new Scene(engine);
scene.clearColor = new Color4(0.04, 0.045, 0.06, 1);

const camera = new ArcRotateCamera('cam', -Math.PI / 2 + 0.6, 1.25, 6.5, new BVector3(0, 0.75, 0), scene);
camera.attachControl(canvas, true);
camera.minZ = 0.1;
camera.maxZ = 100;
new HemisphericLight('light', new BVector3(0, 1, 0), scene);

const cube = MeshBuilder.CreateBox('thinCube', BURN_CUBE, scene);
cube.position = new BVector3(0, 0.75, 0);
const cubeMaterial = new StandardMaterial('thinCubeMat', scene);
cubeMaterial.diffuseColor = new Color3(0.4, 0.42, 0.5);
cubeMaterial.specularColor = new Color3(0.05, 0.05, 0.05);
cube.material = cubeMaterial;

const batchRenderer = new BatchedRenderer('batchRenderer', scene);
batchRenderer.setDepthTexture(scene.enableDepthRenderer(camera).getDepthMap());

let elapsed = 0;
const burnMaterial = withShell
    ? createBurnShell(scene, cube, camera, {burn: burnAmount, stylized, getTime: () => elapsed})
    : null;
if (withEmbers) {
    createBurnEmbers(scene, batchRenderer, cube);
}
if (withSmoke) {
    createBurnSmoke(scene, batchRenderer, cube);
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
