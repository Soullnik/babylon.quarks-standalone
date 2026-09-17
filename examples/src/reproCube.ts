import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera';
import {Engine} from '@babylonjs/core/Engines/engine';
import {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import '@babylonjs/core/Rendering/depthRendererSceneComponent';
import {Scene} from '@babylonjs/core/scene';
import {BatchedRenderer, ParticleSystem} from 'babylon.quarks';
import {loadQuarksFromJson} from './loadQuarksJson';

/**
 * Minimal reproduction: the uploaded RoundFireRed effect sitting inside a cube
 * that is 0.05 units thick, which is where billboard particles show a hard cut
 * along the intersection line.
 *
 * Query parameters:
 *   soft=1   turn softParticles on for every system in the effect
 *   depth=1  hand the renderer a depth texture (needed for soft to do anything)
 *   near=…, far=…  softNearFade / softFarFade
 *   t=…      seconds of effect time to simulate before the screenshot
 */
const params = new URLSearchParams(location.search);
const useSoft = params.get('soft') === '1';
const useDepth = params.get('depth') !== '0';
const nearFade = Number(params.get('near') ?? 0);
const farFade = Number(params.get('far') ?? 1);
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

async function main() {
    const json = await (await fetch('./RoundFireRed.json')).json();
    const root = loadQuarksFromJson(scene, batchRenderer, systems, json, './');
    root.position = new BVector3(0, 0, 0);

    if (useSoft) {
        for (const system of systems) {
            system.softParticles = true;
            system.softNearFade = nearFade;
            system.softFarFade = farFade;
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

engine.runRenderLoop(() => {
    scene.render();
});
window.addEventListener('resize', () => engine.resize());
main().catch((error) => {
    console.error(error);
    (window as unknown as {reproError: string}).reproError = String(error);
});
