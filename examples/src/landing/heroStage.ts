import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera';
import type {ArcRotateCameraPointersInput} from '@babylonjs/core/Cameras/Inputs/arcRotateCameraPointersInput';
import type {AbstractEngine} from '@babylonjs/core/Engines/abstractEngine';
import {Engine} from '@babylonjs/core/Engines/engine';
import {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight';
import {Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
// Side-effect import: registers Scene.createPickingRay, used to project the pointer into the world.
import '@babylonjs/core/Culling/ray';
import {BatchedRenderer, BehaviorTypes, EmitterShapes} from 'babylon.quarks';
import {demoManifest} from '../demoManifest';
import type {DemoContext, DemoModule, DemoState} from '../types';
import {createVortex, type StagePointer} from './vortex';

/** One effect the hero stage can show. */
interface StageEffect {
    /** The effect's demo key in the gallery, or null for the landing-only vortex. */
    demoKey: string | null;
    load: () => Promise<DemoModule>;
    /** Whether dragging orbits the camera; the vortex follows the pointer instead. */
    orbit: boolean;
}

/** The elements the stage drives, all inside `[data-stage]`. */
interface StageElements {
    root: HTMLElement;
    canvas: HTMLCanvasElement;
    tabs: HTMLButtonElement[];
    particles: HTMLElement | null;
    fps: HTMLElement | null;
    engineLabel: HTMLElement | null;
    demoLink: HTMLAnchorElement | null;
    editorButton: HTMLButtonElement | null;
}

/** A scene with one effect running in it. */
interface LoadedEffect {
    id: string;
    ctx: DemoContext;
    module: DemoModule;
}

const pointer: StagePointer = {x: 0, y: 0, seen: false};

const EFFECTS: Record<string, StageEffect> = {
    vortex: {demoKey: null, load: async () => createVortex(pointer), orbit: false},
    electric: {demoKey: 'ElectricBallDemo', load: () => import('../demos/electricBall'), orbit: true},
    explosion: {demoKey: 'ExplosionDemo', load: () => import('../demos/explosion'), orbit: true},
    weapons: {demoKey: 'AuraTrailDemo', load: () => import('../demos/auraTrail'), orbit: true},
    forces: {demoKey: 'ForceSpaceDemo', load: () => import('../demos/forceSpace'), orbit: true},
};

/** The effect's display name: the gallery's name for a demo, "Vortex" for the landing effect. */
function effectName(id: string) {
    const key = EFFECTS[id]?.demoKey;
    return key ? (demoManifest.find((demo) => demo.key === key)?.name ?? key) : 'Vortex';
}

type GPUAdapterLike = {isFallbackAdapter?: boolean; info?: {isFallbackAdapter?: boolean}};
type NavigatorWithGPU = Navigator & {gpu?: {requestAdapter(): Promise<GPUAdapterLike | null>}};

/**
 * Creates the stage's engine: WebGPU when the browser has a hardware adapter, WebGL otherwise.
 * `?engine=webgl` or `?engine=webgpu` in the page URL forces one (the latter still falls back
 * when WebGPU is missing). A software (fallback) adapter is skipped unless forced: it renders
 * slower than WebGL on the same machine. A canvas that WebGPU touched cannot give WebGL a
 * context, so a failed WebGPU start swaps in a fresh canvas.
 */
async function createStageEngine(
    canvas: HTMLCanvasElement
): Promise<{engine: AbstractEngine; canvas: HTMLCanvasElement; label: string}> {
    // Babylon sets `touch-action: none` on its canvas by default, which would stop a swipe on the
    // stage from scrolling the page; the stylesheet's `pan-y` keeps vertical swipes for the page.
    const options = {doNotHandleTouchAction: true};
    const requested = new URLSearchParams(window.location.search).get('engine');
    const gpu = (navigator as NavigatorWithGPU).gpu;
    if (requested !== 'webgl' && gpu) {
        let gpuEngine: AbstractEngine | null = null;
        try {
            const adapter = await gpu.requestAdapter();
            const fallback = adapter?.info?.isFallbackAdapter ?? false;
            if (adapter && (!fallback || requested === 'webgpu')) {
                const {WebGPUEngine} = await import('@babylonjs/core/Engines/webgpuEngine');
                await import('@babylonjs/core/Engines/WebGPU/Extensions/index');
                const engine = new WebGPUEngine(canvas, {...options, antialias: true});
                gpuEngine = engine;
                await engine.initAsync();
                return {engine, canvas, label: 'WebGPU'};
            }
        } catch (error) {
            console.warn('WebGPU is unavailable here; the stage falls back to WebGL.', error);
            if (gpuEngine) {
                gpuEngine.dispose();
                const fresh = canvas.cloneNode(false) as HTMLCanvasElement;
                canvas.replaceWith(fresh);
                canvas = fresh;
            }
        }
    }
    const engine = new Engine(canvas, true, options);
    return {engine, canvas, label: engine.webGLVersion >= 2 ? 'WebGL 2' : 'WebGL'};
}

function queryStage(root: HTMLElement): StageElements | null {
    const canvas = root.querySelector('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) {
        return null;
    }
    return {
        root,
        canvas,
        tabs: Array.from(root.querySelectorAll<HTMLButtonElement>('[data-effect]')),
        particles: root.querySelector('[data-stat="particles"]'),
        fps: root.querySelector('[data-stat="fps"]'),
        engineLabel: root.querySelector('[data-stat="engine"]'),
        demoLink: root.querySelector('[data-stage-demo]'),
        editorButton: root.querySelector('[data-stage-editor]'),
    };
}

/** What the landing page shows next to the stage, read from the live registries. */
export function libraryCounts() {
    return {
        behaviors: Object.keys(BehaviorTypes).length,
        shapes: Object.keys(EmitterShapes).length,
    };
}

/**
 * Mounts the hero stage: a live babylon.quarks scene inside `root`, with effect tabs, a stats
 * readout and an "Open in editor" action. It starts on the tab marked `aria-pressed="true"`,
 * renders only while the stage is on screen, and sets `data-live` on `root` once the first
 * effect runs. Rejects, with everything released, when that first effect cannot start.
 * Resolves to a function that tears everything down.
 */
export async function mountHeroStage(root: HTMLElement): Promise<() => void> {
    const el = queryStage(root);
    if (!el) {
        return () => {};
    }
    const created = await createStageEngine(el.canvas);
    const {engine, label} = created;
    el.canvas = created.canvas;
    engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));
    if (el.engineLabel) {
        el.engineLabel.textContent = label;
    }

    let current: LoadedEffect | null = null;
    let loadToken = 0;

    const markTabs = (id: string) => {
        for (const tab of el.tabs) {
            const pressed = tab.dataset.effect === id;
            tab.setAttribute('aria-pressed', String(pressed));
            tab.tabIndex = pressed ? 0 : -1;
        }
    };

    const describe = (id: string) => {
        const entry = EFFECTS[id];
        el.canvas.setAttribute(
            'aria-label',
            `Live babylon.quarks effect: ${effectName(id)}.${entry?.orbit ? ' Drag to orbit the camera.' : ''}`
        );
        if (el.demoLink && entry) {
            el.demoLink.href = entry.demoKey ? `./babylonDemo.html#${entry.demoKey}` : '#demos';
            el.demoLink.textContent = entry.demoKey ? 'Full-screen demo' : 'All demos';
        }
    };

    /**
     * Builds the effect in a new scene while the current one keeps rendering, then swaps them.
     * A newer request wins: a stale load disposes its own scene. Returns whether it swapped.
     */
    const showEffect = async (id: string): Promise<boolean> => {
        const entry = EFFECTS[id];
        if (!entry || id === current?.id) {
            return false;
        }
        const token = ++loadToken;
        markTabs(id);
        el.root.dataset.loading = 'true';

        let scene: Scene | null = null;
        try {
            const module = await entry.load();
            if (token !== loadToken) {
                return false;
            }
            scene = new Scene(engine);
            scene.useRightHandedSystem = true;
            scene.clearColor = new Color4(0.035, 0.04, 0.06, 1);
            const camera = new ArcRotateCamera('stageCamera', -Math.PI / 2, Math.PI / 3, 20, BVector3.Zero(), scene);
            camera.minZ = 0.1;
            new HemisphericLight('stageLight', new BVector3(0.35, 1, -0.2), scene);
            const batchRenderer = new BatchedRenderer('stageVfx', scene);
            const demoState: DemoState = {totalTime: 0, refreshIndex: 0};
            const ctx: DemoContext = {scene, camera, batchRenderer, systems: [], demoState};
            await module.init(ctx);
            if (token !== loadToken) {
                scene.dispose();
                return false;
            }
            if (entry.orbit) {
                camera.attachControl(el.canvas, true);
                // The wheel and pinch would steal the page's scroll and zoom; dragging still orbits.
                camera.inputs.removeByType('ArcRotateCameraMouseWheelInput');
                const pointers = camera.inputs.attached.pointers as ArcRotateCameraPointersInput | undefined;
                if (pointers) {
                    pointers.pinchZoom = false;
                }
            }
            const previous = current;
            current = {id, ctx, module};
            previous?.ctx.scene.dispose();
            describe(id);
            return true;
        } catch (error) {
            console.error(`The stage could not start "${id}":`, error);
            scene?.dispose();
            if (token === loadToken && current) {
                markTabs(current.id);
            }
            return false;
        } finally {
            if (token === loadToken) {
                delete el.root.dataset.loading;
            }
        }
    };

    const onTabClick = (event: Event) => {
        const id = (event.currentTarget as HTMLButtonElement).dataset.effect ?? '';
        void showEffect(id);
    };
    for (const tab of el.tabs) {
        tab.addEventListener('click', onTabClick);
    }

    const onPointerMove = (event: PointerEvent) => {
        const rect = el.canvas.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
        pointer.y = -(((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1);
        pointer.seen = true;
    };
    el.canvas.addEventListener('pointermove', onPointerMove, {passive: true});

    let handingOff = false;
    const onEditor = () => {
        if (handingOff || !current) {
            return;
        }
        handingOff = true;
        void openInEditor(current).finally(() => {
            handingOff = false;
        });
    };
    el.editorButton?.addEventListener('click', onEditor);

    let frames = 0;
    let lastStat = performance.now();
    const renderFrame = () => {
        if (!current) {
            return;
        }
        const {ctx, module} = current;
        const delta = Math.min(engine.getDeltaTime() / 1000, 0.05);
        try {
            module.update?.(ctx, delta);
            ctx.batchRenderer.update(delta);
            ctx.scene.render();
        } catch (error) {
            console.error('Stage render error:', error);
        }
        frames++;
        const now = performance.now();
        if (now - lastStat >= 500) {
            let particles = 0;
            for (const system of ctx.systems) {
                particles += system.particleNum;
            }
            if (el.particles) {
                el.particles.textContent = particles.toLocaleString('en-US');
            }
            if (el.fps) {
                el.fps.textContent = String(Math.round((frames * 1000) / (now - lastStat)));
            }
            frames = 0;
            lastStat = now;
        }
    };

    // Render only while the stage is visible; the browser already stops frames in hidden tabs.
    let running = false;
    const setRunning = (visible: boolean) => {
        if (visible && !running) {
            running = true;
            lastStat = performance.now();
            frames = 0;
            engine.runRenderLoop(renderFrame);
        } else if (!visible && running) {
            running = false;
            engine.stopRenderLoop(renderFrame);
        }
    };
    const observer = new IntersectionObserver((entries) => setRunning(entries.some((e) => e.isIntersecting)));
    observer.observe(el.root);

    const resizeObserver = new ResizeObserver(() => engine.resize());
    resizeObserver.observe(el.canvas);

    const teardown = () => {
        observer.disconnect();
        resizeObserver.disconnect();
        for (const tab of el.tabs) {
            tab.removeEventListener('click', onTabClick);
        }
        el.canvas.removeEventListener('pointermove', onPointerMove);
        el.editorButton?.removeEventListener('click', onEditor);
        setRunning(false);
        loadToken++;
        current?.ctx.scene.dispose();
        current = null;
        engine.dispose();
        delete el.root.dataset.live;
        delete el.root.dataset.loading;
    };

    const initial = el.tabs.find((tab) => tab.getAttribute('aria-pressed') === 'true')?.dataset.effect ?? 'vortex';
    if (!(await showEffect(initial))) {
        teardown();
        throw new Error(`the stage's first effect "${initial}" did not start`);
    }
    el.root.dataset.live = 'true';
    return teardown;
}

/**
 * Hands the running effect to the editor page, the way the demo viewer does: serialise every
 * effect root under the renderer into session storage and open `editor.html?effect=session`.
 */
async function openInEditor({id, ctx}: LoadedEffect) {
    try {
        const {ensurePortableTextureUrl, serializeEffectForest} = await import('babylon.quarks-editor');
        const roots = new Set<TransformNode>();
        for (const system of ctx.systems) {
            let node: TransformNode = system.emitter;
            while (node.parent && node.parent !== ctx.batchRenderer) {
                node = node.parent as TransformNode;
            }
            roots.add(node);
        }
        for (const system of ctx.systems) {
            if (system.texture) {
                await ensurePortableTextureUrl(system.texture);
            }
        }
        sessionStorage.setItem('quarks-editor-effect', serializeEffectForest([...roots], effectName(id)));
        window.location.href = './editor.html?effect=session';
    } catch (error) {
        // Storage full or blocked: open the editor on its own rather than doing nothing.
        console.warn('Could not hand the effect to the editor:', error);
        window.location.href = './editor.html';
    }
}
