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
import {BURN_CUBE, createBurnEmbers, createBurnShell, createBurnSmoke} from './burnScene';
import {loadQuarksFromJson} from './loadQuarksJson';

/**
 * The whole road in one take: the exported effect pressed against a thin cube,
 * the two render-side fixes for that, and the burn the fire actually wants to be
 * — in both a photographic and a drawn style. Every panel is its own engine and
 * scene, stepped from one clock and orbited together, so they can be compared at
 * the same angle and the same moment.
 */
interface Variant {
    label: string;
    /** Loads the exported fireball effect; otherwise the panel builds a burn. */
    effect?: (system: ParticleSystem, renderer: BatchedRenderer) => void;
    worldOffset?: number;
    burn?: {stylized: boolean; shell: boolean};
}

const VARIANTS: Variant[] = [
    {label: '1 — эффект как есть', effect: () => {}},
    {
        label: '2 — + camera offset',
        effect: (system, renderer) => {
            system.cameraOffset = 0.25;
            renderer.updateSystem(system);
        },
    },
    {
        label: '3 — + depth test off',
        effect: (system, renderer) => {
            system.getRendererSettings().materialDepthTest = false;
            renderer.updateSystem(system);
        },
    },
    {label: '4 — burn: только частицы', burn: {stylized: false, shell: false}},
    {label: '5 — burn: меш-слой', burn: {stylized: false, shell: true}},
    {label: '6 — burn: рисованный', burn: {stylized: true, shell: true}},
];

const params = new URLSearchParams(location.search);
const settleTime = Number(params.get('t') ?? 1.5);
const burnAmount = Number(params.get('burn') ?? 0.72);

interface Panel {
    scene: Scene;
    camera: ArcRotateCamera;
    renderer: BatchedRenderer;
}

const panels: Panel[] = [];
const grid = document.getElementById('grid') as HTMLDivElement;
let elapsed = 0;

function createPanel(variant: Variant, json: unknown): Panel {
    const holder = document.createElement('div');
    holder.className = 'panel';
    const canvas = document.createElement('canvas');
    canvas.width = 420;
    canvas.height = 310;
    const label = document.createElement('div');
    label.className = 'label';
    const [number, text] = variant.label.split(' — ');
    label.innerHTML = `<b>${number}</b> — ${text}`;
    holder.append(canvas, label);
    grid.append(holder);

    const engine = new Engine(canvas, true, {preserveDrawingBuffer: true});
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.04, 0.045, 0.06, 1);
    const camera = new ArcRotateCamera('cam', -Math.PI / 2 + 0.6, 1.25, 6.5, new BVector3(0, 0.75, 0), scene);
    camera.minZ = 0.1;
    camera.maxZ = 100;
    new HemisphericLight('light', new BVector3(0, 1, 0), scene);

    const cube = MeshBuilder.CreateBox('thinCube', BURN_CUBE, scene);
    cube.position = new BVector3(0, 0.75, 0);
    const cubeMaterial = new StandardMaterial('thinCubeMat', scene);
    cubeMaterial.diffuseColor = new Color3(0.4, 0.42, 0.5);
    cubeMaterial.specularColor = new Color3(0.05, 0.05, 0.05);
    cube.material = cubeMaterial;

    const renderer = new BatchedRenderer('batchRenderer', scene);
    renderer.setDepthTexture(scene.enableDepthRenderer(camera).getDepthMap());

    if (variant.burn) {
        if (variant.burn.shell) {
            createBurnShell(scene, cube, camera, {
                burn: burnAmount,
                stylized: variant.burn.stylized,
                getTime: () => elapsed,
            });
        }
        createBurnEmbers(scene, renderer, cube);
        createBurnSmoke(scene, renderer, cube);
    } else {
        const systems: ParticleSystem[] = [];
        const root = loadQuarksFromJson(scene, renderer, systems, json, './');
        root.position = new BVector3(0, 0, -(variant.worldOffset ?? 0));
        for (const system of systems) {
            variant.effect?.(system, renderer);
        }
    }

    const step = 1 / 60;
    for (let time = 0; time < settleTime; time += step) {
        renderer.update(step);
    }
    scene.render();
    return {scene, camera, renderer};
}

async function main() {
    const json = await (await fetch('./RoundFireRed.json')).json();
    for (const variant of VARIANTS) {
        panels.push(createPanel(variant, json));
    }
    (window as unknown as {reproReady: boolean}).reproReady = true;
}

(window as unknown as {reproAdvance: (dt: number, dAlpha: number) => void}).reproAdvance = (dt, dAlpha) => {
    elapsed += dt;
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
