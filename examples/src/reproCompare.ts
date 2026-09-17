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
 * Every way of dealing with a billboard that intersects a thin wall, running at
 * once so one turntable shows all of them at the same angle and the same moment
 * in the effect. Each panel is its own engine, scene and camera, stepped by hand
 * from a single clock.
 *
 * `window.reproAdvance(dt, dAlpha)` steps every panel and orbits every camera,
 * so a capture script gets the same take each run.
 */
interface Variant {
    label: string;
    apply: (system: ParticleSystem, renderer: BatchedRenderer) => void;
    /** World-space shift of the whole effect, towards the camera's start side. */
    worldOffset?: number;
}

const VARIANTS: Variant[] = [
    {label: '1 — как есть, без фиксов', apply: () => {}},
    {
        label: '2 — сдвиг эффекта в мире 0.6',
        apply: () => {},
        worldOffset: 0.6,
    },
    {
        label: '3 — soft particles (fade 0.1)',
        apply: (system, renderer) => {
            system.softParticles = true;
            system.softNearFade = 0;
            system.softFarFade = 0.1;
            renderer.updateSystem(system);
        },
    },
    {
        label: '4 — camera offset 0.25',
        apply: (system, renderer) => {
            system.cameraOffset = 0.25;
            renderer.updateSystem(system);
        },
    },
    {
        label: '5 — camera offset + soft',
        apply: (system, renderer) => {
            system.cameraOffset = 0.25;
            system.softParticles = true;
            system.softNearFade = 0;
            system.softFarFade = 0.1;
            renderer.updateSystem(system);
        },
    },
    {
        label: '6 — depth test off',
        apply: (system, renderer) => {
            system.getRendererSettings().materialDepthTest = false;
            renderer.updateSystem(system);
        },
    },
];

const params = new URLSearchParams(location.search);
const settleTime = Number(params.get('t') ?? 1.2);

interface Panel {
    engine: Engine;
    scene: Scene;
    camera: ArcRotateCamera;
    renderer: BatchedRenderer;
}

const panels: Panel[] = [];
const grid = document.getElementById('grid') as HTMLDivElement;

function createPanel(variant: Variant, json: unknown): Panel {
    const holder = document.createElement('div');
    holder.className = 'panel';
    const canvas = document.createElement('canvas');
    canvas.width = 420;
    canvas.height = 310;
    const label = document.createElement('div');
    label.className = 'label';
    label.innerHTML = `<b>${variant.label.split(' — ')[0]}</b> — ${variant.label.split(' — ')[1]}`;
    holder.append(canvas, label);
    grid.append(holder);

    const engine = new Engine(canvas, true, {preserveDrawingBuffer: true});
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.05, 0.06, 0.09, 1);
    const camera = new ArcRotateCamera('cam', -Math.PI / 2 + 0.6, 1.25, 6, new BVector3(0, 0.6, 0), scene);
    camera.minZ = 0.1;
    camera.maxZ = 100;
    new HemisphericLight('light', new BVector3(0, 1, 0), scene);

    const cube = MeshBuilder.CreateBox('thinCube', {width: 3, height: 3, depth: 0.05}, scene);
    cube.position = new BVector3(0, 0.75, 0);
    const cubeMaterial = new StandardMaterial('thinCubeMat', scene);
    cubeMaterial.diffuseColor = new Color3(0.45, 0.47, 0.55);
    cubeMaterial.specularColor = new Color3(0.05, 0.05, 0.05);
    cube.material = cubeMaterial;

    const renderer = new BatchedRenderer('batchRenderer', scene);
    renderer.setDepthTexture(scene.enableDepthRenderer(camera).getDepthMap());

    const systems: ParticleSystem[] = [];
    const root = loadQuarksFromJson(scene, renderer, systems, json, './');
    root.position = new BVector3(0, 0, -(variant.worldOffset ?? 0));
    for (const system of systems) {
        variant.apply(system, renderer);
    }

    const step = 1 / 60;
    for (let time = 0; time < settleTime; time += step) {
        renderer.update(step);
    }
    scene.render();
    return {engine, scene, camera, renderer};
}

async function main() {
    const json = await (await fetch('./RoundFireRed.json')).json();
    for (const variant of VARIANTS) {
        panels.push(createPanel(variant, json));
    }
    (window as unknown as {reproReady: boolean}).reproReady = true;
}

(window as unknown as {reproAdvance: (dt: number, dAlpha: number) => void}).reproAdvance = (dt, dAlpha) => {
    for (const panel of panels) {
        panel.camera.alpha += dAlpha;
        panel.renderer.update(dt);
        panel.scene.render();
    }
};

main().catch((error) => {
    console.error(error);
    (window as unknown as {reproError: string}).reproError = String(error);
});
