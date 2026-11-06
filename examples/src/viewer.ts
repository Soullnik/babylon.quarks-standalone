import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera';
import {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight';
import {Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import type {AbstractMesh} from '@babylonjs/core/Meshes/abstractMesh';
import {Scene} from '@babylonjs/core/scene';
import {BatchedRenderer} from 'babylon.quarks';
import {ensurePortableTextureUrl, serializeEffectForest} from 'babylon.quarks-editor';
import {SECTIONS} from './demoManifest';
import {playQuarksJson} from './loadQuarksJson';
import {demos} from './registry';
import {createEngineFromQuery} from './shared/engineFactory';
import {createDemoContext, effectRoots, MAX_FRAME, particleCount} from './shared/host';
import type {DemoContext, DemoControls, DemoRun} from './types';

const GITHUB_BASE = 'https://github.com/Soullnik/babylon.quarks-standalone/blob/main/';
const DROPPED_KEY = '__dropped_json__';
const CLEAR_COLOR = new Color4(0.05, 0.05, 0.08, 1);
const SPEEDS = [0.25, 0.5, 1, 2] as const;

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const canvas = byId<HTMLCanvasElement>('renderer-canvas')!;
const demoSelect = byId<HTMLSelectElement>('demo-select')!;
const jsonFileInput = byId<HTMLInputElement>('json-file-input');
const dropOverlay = byId('drop-overlay');
const titleEl = byId('demo-name');
const categoryEl = byId('demo-category');
const descriptionEl = byId('demo-description');
const controlsEl = byId('demo-controls');
const pauseBtn = byId<HTMLButtonElement>('pauseBtn');
const speedSelect = byId<HTMLSelectElement>('speed-select');
const sourceLink = byId<HTMLAnchorElement>('source-link');
const particleCountEl = byId('particleCount');
const fpsEl = byId('fps');
const engine = await createEngineFromQuery(canvas);
/** `?pauseAt=S`: the viewer stops each demo at S seconds of its time, the moment a preview shows. */
const pauseAt = Number(new URLSearchParams(window.location.search).get('pauseAt')) || 0;

/** What the viewer is showing: a demo of the gallery, or a JSON file dropped on the page. */
interface Shown {
    key: string;
    name: string;
    category: string;
    description: string;
    sourcePath: string;
    ctx: DemoContext;
    run: DemoRun;
}

let shown: Shown | null = null;
let demoIndex = 0;
let loadToken = 0;
let paused = false;
let speed = 1;
/** Simulated seconds since the shown demo started, what previews and the smoke test wait on. */
let demoTime = 0;
let peakParticles = 0;
let frameCount = 0;
let lastFpsTime = performance.now();
let dragDepth = 0;

/**
 * A new scene with the viewer's camera, light and batch renderer, and a set of panel controls,
 * which go into the panel once the demo is shown.
 */
function createScene(controls: HTMLElement): DemoContext {
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    scene.clearColor = CLEAR_COLOR.clone();
    const camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 3, 20, BVector3.Zero(), scene);
    camera.attachControl(canvas, true);
    camera.minZ = 0.1;
    new HemisphericLight('light', new BVector3(0, 1, 0), scene);
    return createDemoContext(scene, camera, new BatchedRenderer('batchRenderer', scene), panelControls(controls));
}

/** Controls drawn into `container`, the panel's part under the description. */
function panelControls(container: HTMLElement): DemoControls {
    const row = (label: string, input: HTMLElement) => {
        const wrap = document.createElement('label');
        wrap.className = 'control';
        const text = document.createElement('span');
        text.textContent = label;
        wrap.append(input, text);
        container.append(wrap);
    };
    return {
        toggle(label, value, onChange) {
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = value;
            input.addEventListener('change', () => onChange(input.checked));
            row(label, input);
        },
        choice(label, options, value, onChange) {
            const select = document.createElement('select');
            select.className = 'ui-select';
            for (const option of options) {
                select.add(new Option(option, option, false, option === value));
            }
            select.addEventListener('change', () => onChange(select.value as typeof value));
            row(label, select);
        },
        button(label, onClick) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'ui-btn';
            button.textContent = label;
            button.addEventListener('click', onClick);
            container.append(button);
        },
    };
}

/** Leaves what is shown: the demo's own clean-up, then its scene. */
function leave() {
    if (!shown) {
        return;
    }
    shown.run.dispose?.();
    shown.ctx.scene.dispose();
    shown = null;
}

function describe() {
    if (!shown) {
        return;
    }
    // The picker names the demo; the title line is only for a load error.
    if (titleEl) titleEl.textContent = '';
    document.title = `${shown.name} — Babylon.quarks demos`;
    if (categoryEl) categoryEl.textContent = shown.category;
    if (descriptionEl) descriptionEl.textContent = shown.description;
    if (sourceLink) {
        sourceLink.href = GITHUB_BASE + shown.sourcePath;
        sourceLink.textContent = shown.key === DROPPED_KEY ? 'Loader' : 'Source';
    }
    demoSelect.value = shown.key;
    const option = demoSelect.querySelector<HTMLOptionElement>(`option[value="${DROPPED_KEY}"]`);
    if (option) {
        option.hidden = shown.key !== DROPPED_KEY;
    }
}

function showError(error: unknown) {
    console.error('Error loading demo:', error);
    if (titleEl) titleEl.textContent = 'Error: ' + (error as Error).message;
}

/** Shows a new scene: the old one keeps rendering until the new one is built. */
async function show(build: (ctx: DemoContext) => Promise<Omit<Shown, 'ctx' | 'run'> & {run: DemoRun}>) {
    const token = ++loadToken;
    const controls = document.createElement('div');
    const ctx = createScene(controls);
    try {
        const built = await build(ctx);
        if (token !== loadToken) {
            built.run.dispose?.();
            ctx.scene.dispose();
            return;
        }
        leave();
        if (controlsEl) {
            controlsEl.replaceChildren(...Array.from(controls.childNodes));
            controlsEl.hidden = controlsEl.childNodes.length === 0;
        }
        shown = {...built, ctx};
        demoTime = 0;
        peakParticles = 0;
        setPaused(false);
        describe();
        window.location.hash = '#' + shown.key;
    } catch (error) {
        ctx.scene.dispose();
        if (token === loadToken) {
            showError(error);
        }
    }
}

function loadDemo(index: number) {
    demoIndex = index;
    const demo = demos[index];
    return show(async (ctx) => {
        const module = await demo.load();
        const run = (await module.init(ctx)) ?? {};
        return {...demo, run};
    });
}

async function loadDroppedJsonFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.json')) {
        throw new Error('Please choose a .json file exported from Quarks.');
    }
    const json = JSON.parse(await file.text());
    let option = demoSelect.querySelector<HTMLOptionElement>(`option[value="${DROPPED_KEY}"]`);
    if (!option) {
        option = new Option('', DROPPED_KEY);
        demoSelect.insertBefore(option, demoSelect.firstChild);
    }
    option.textContent = file.name;
    await show(async (ctx) => {
        ctx.camera.setPosition(new BVector3(0, 8, 18));
        return {
            key: DROPPED_KEY,
            name: file.name,
            category: 'Dropped file',
            description: 'A Quarks JSON file opened from disk; its one-shot systems replay every two seconds.',
            sourcePath: 'packages/babylon.quarks/src/QuarksLoader.ts',
            run: playQuarksJson(ctx, json),
        };
    });
}

function firstJsonFile(list: FileList | null | undefined): File | null {
    for (const file of Array.from(list ?? [])) {
        if (file.name.toLowerCase().endsWith('.json')) {
            return file;
        }
    }
    return null;
}

function openJson(file: File | null) {
    if (file) {
        loadDroppedJsonFile(file).catch(showError);
    }
}

function setupJsonImport() {
    byId('openJsonBtn')?.addEventListener('click', () => jsonFileInput?.click());
    jsonFileInput?.addEventListener('change', () => {
        const file = jsonFileInput.files?.[0] ?? null;
        jsonFileInput.value = '';
        openJson(file);
    });
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;
    window.addEventListener('dragenter', (event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        dragDepth += 1;
        dropOverlay?.classList.add('is-visible');
    });
    window.addEventListener('dragleave', (event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) dropOverlay?.classList.remove('is-visible');
    });
    window.addEventListener('dragover', (event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer!.dropEffect = 'copy';
    });
    window.addEventListener('drop', (event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        dragDepth = 0;
        dropOverlay?.classList.remove('is-visible');
        openJson(firstJsonFile(event.dataTransfer?.files));
    });
}

async function openInEditor() {
    if (!shown || shown.ctx.systems.length === 0) {
        return;
    }
    // Some demos take a texture straight off a loaded GLB's material, whose url is Babylon's
    // internal placeholder and does not survive the move to the editor's page: bake its pixels
    // into a portable data URI first.
    for (const system of shown.ctx.systems) {
        if (system.texture) {
            await ensurePortableTextureUrl(system.texture);
        }
    }
    sessionStorage.setItem('quarks-editor-effect', serializeEffectForest(effectRoots(shown.ctx), shown.name));
    window.location.href = './editor.html?effect=session';
}

function setPaused(value: boolean) {
    paused = value;
    if (pauseBtn) {
        pauseBtn.textContent = paused ? 'Play' : 'Pause';
        pauseBtn.setAttribute('aria-pressed', String(paused));
    }
}

function restart() {
    if (shown?.key === DROPPED_KEY) {
        return;
    }
    void loadDemo(demoIndex);
}

/**
 * The share of the canvas the particles cover, read back from one frame drawn with every other
 * mesh hidden: the smoke test's proof that a demo's particles reach the screen, which a ground,
 * labels or props drawing fine does not give.
 */
function coverage(): Promise<number> {
    return new Promise((resolve, reject) => {
        const ctx = shown?.ctx;
        if (!ctx) {
            resolve(0);
            return;
        }
        const {scene, batchRenderer} = ctx;
        const particles = new Set<AbstractMesh>(batchRenderer.batches.map((batch) => batch.mesh));
        const hidden: AbstractMesh[] = [];
        scene.onBeforeRenderObservable.addOnce(() => {
            for (const mesh of scene.meshes) {
                if (mesh.isVisible && !particles.has(mesh)) {
                    mesh.isVisible = false;
                    hidden.push(mesh);
                }
            }
        });
        scene.onAfterRenderObservable.addOnce(() => {
            const width = engine.getRenderWidth();
            const height = engine.getRenderHeight();
            const clear = [scene.clearColor.r, scene.clearColor.g, scene.clearColor.b].map((c) => c * 255);
            const read = engine.readPixels(0, 0, width, height, true, false);
            for (const mesh of hidden) {
                mesh.isVisible = true;
            }
            read.then((pixels) => {
                const data = pixels as Uint8Array;
                let drawn = 0;
                for (let i = 0; i < data.length; i += 4) {
                    const d =
                        Math.abs(data[i] - clear[0]) +
                        Math.abs(data[i + 1] - clear[1]) +
                        Math.abs(data[i + 2] - clear[2]);
                    if (d > 12) drawn++;
                }
                resolve(drawn / (width * height));
            }).catch(reject);
        });
    });
}

// The hook previews, the smoke test and the console use to reach the running demo.
(window as never as {__quarksViewer: unknown}).__quarksViewer = {
    /** The key of the demo once its `init` has finished, null while it loads. */
    get ready() {
        return shown?.key ?? null;
    },
    get systems() {
        return shown?.ctx.systems ?? [];
    },
    get time() {
        return demoTime;
    },
    get paused() {
        return paused;
    },
    /** The most particles alive at once since the demo started. */
    get peakParticles() {
        return peakParticles;
    },
    coverage,
};

function fillPicker() {
    for (const section of SECTIONS) {
        for (const category of section.categories) {
            const group = document.createElement('optgroup');
            group.label = `${section.title} · ${category}`;
            for (const demo of demos) {
                if (demo.section === section.id && demo.category === category) {
                    group.append(new Option(demo.name, demo.key));
                }
            }
            if (group.children.length > 0) {
                demoSelect.append(group);
            }
        }
    }
    for (const value of SPEEDS) {
        speedSelect?.add(new Option(`${value}×`, String(value), false, value === 1));
    }
}

/** Prev and Next follow the picker's order, by section and category. */
function step(direction: 1 | -1) {
    const keys = Array.from(
        demoSelect.querySelectorAll<HTMLOptionElement>('optgroup option'),
        (option) => option.value
    );
    const current = keys.indexOf(demos[demoIndex].key);
    const next = keys[(current + direction + keys.length) % keys.length];
    void loadDemo(demos.findIndex((demo) => demo.key === next));
}

function indexOfHash(): number {
    const hash = window.location.hash.substring(1);
    return demos.findIndex((demo) => demo.key === hash);
}

fillPicker();
setupJsonImport();
byId('openInEditorBtn')?.addEventListener('click', () => void openInEditor());
byId('nextBtn')?.addEventListener('click', () => step(1));
byId('previousBtn')?.addEventListener('click', () => step(-1));
byId('restartBtn')?.addEventListener('click', restart);
pauseBtn?.addEventListener('click', () => setPaused(!paused));
byId('panelToggle')?.addEventListener('click', (event) => {
    const toggle = event.currentTarget as HTMLButtonElement;
    const collapsed = byId('demo-panel')?.classList.toggle('is-collapsed') ?? false;
    toggle.textContent = collapsed ? 'Show' : 'Hide';
    toggle.setAttribute('aria-expanded', String(!collapsed));
});
speedSelect?.addEventListener('change', () => {
    speed = Number(speedSelect.value) || 1;
});
demoSelect.addEventListener('change', () => {
    const index = demos.findIndex((demo) => demo.key === demoSelect.value);
    if (index >= 0) {
        void loadDemo(index);
    }
});
document.addEventListener('keydown', (event) => {
    if ((event.target as HTMLElement | null)?.closest('input, select, textarea')) {
        return;
    }
    if (event.key === 'ArrowRight') step(1);
    if (event.key === 'ArrowLeft') step(-1);
    if (event.key === ' ') {
        event.preventDefault();
        setPaused(!paused);
    }
    if (event.key === 'r' || event.key === 'R') restart();
});
window.addEventListener('hashchange', () => {
    const index = indexOfHash();
    if (index >= 0 && demos[index].key !== shown?.key) {
        void loadDemo(index);
    }
});

void loadDemo(Math.max(0, indexOfHash()));

engine.runRenderLoop(() => {
    if (!shown) {
        return;
    }
    try {
        let delta = paused ? 0 : Math.min(engine.getDeltaTime() / 1000, MAX_FRAME) * speed;
        if (pauseAt > 0 && demoTime + delta >= pauseAt) {
            delta = Math.max(pauseAt - demoTime, 0);
            setPaused(true);
        }
        demoTime += delta;
        shown.run.update?.(delta);
        shown.ctx.batchRenderer.update(delta);

        const particles = particleCount(shown.ctx);
        peakParticles = Math.max(peakParticles, particles);
        if (particleCountEl) particleCountEl.textContent = particles.toString();
        frameCount++;
        const now = performance.now();
        if (now - lastFpsTime >= 1000) {
            if (fpsEl) fpsEl.textContent = frameCount.toString();
            frameCount = 0;
            lastFpsTime = now;
        }
        shown.ctx.scene.render();
    } catch (e) {
        console.error('Render error:', e);
    }
});

window.addEventListener('resize', () => engine.resize());
