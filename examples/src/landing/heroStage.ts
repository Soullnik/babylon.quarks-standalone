import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera';
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
import type {DemoContext, DemoModule, DemoState} from '../types';
import {createVortex, type StagePointer} from './vortex';

/** One effect the hero stage can show. */
interface StageEffect {
    /** The effect's demo key in the gallery, or null for the landing-only vortex. */
    demoKey: string | null;
    load: () => Promise<DemoModule>;
    /** Whether dragging orbits the camera; the vortex uses the pointer itself. */
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

const pointer: StagePointer = {x: 0, y: 0, seen: false};

const EFFECTS: Record<string, StageEffect> = {
    vortex: {demoKey: null, load: async () => createVortex(pointer), orbit: false},
    electric: {demoKey: 'ElectricBallDemo', load: () => import('../demos/electricBall'), orbit: true},
    explosion: {demoKey: 'ExplosionDemo', load: () => import('../demos/explosion'), orbit: true},
    weapons: {demoKey: 'AuraTrailDemo', load: () => import('../demos/auraTrail'), orbit: true},
    forces: {demoKey: 'ForceSpaceDemo', load: () => import('../demos/forceSpace'), orbit: true},
};

type GPUAdapterLike = {isFallbackAdapter?: boolean; info?: {isFallbackAdapter?: boolean}};
type NavigatorWithGPU = Navigator & {gpu?: {requestAdapter(): Promise<GPUAdapterLike | null>}};

/**
 * Creates the stage's engine: WebGPU when the browser has a hardware adapter, WebGL otherwise.
 * `?engine=webgl` or `?engine=webgpu` in the page URL forces one (the latter still falls back
 * when WebGPU is missing). A software (fallback) adapter is skipped unless forced: it renders
 * slower than WebGL on the same machine.
 */
async function createStageEngine(canvas: HTMLCanvasElement): Promise<{engine: AbstractEngine; label: string}> {
    const requested = new URLSearchParams(window.location.search).get('engine');
    const gpu = (navigator as NavigatorWithGPU).gpu;
    if (requested !== 'webgl' && gpu) {
        try {
            const adapter = await gpu.requestAdapter();
            const fallback = adapter?.info?.isFallbackAdapter ?? adapter?.isFallbackAdapter ?? false;
            if (adapter && (!fallback || requested === 'webgpu')) {
                const {WebGPUEngine} = await import('@babylonjs/core/Engines/webgpuEngine');
                await import('@babylonjs/core/Engines/WebGPU/Extensions/index');
                const engine = new WebGPUEngine(canvas, {antialias: true});
                await engine.initAsync();
                return {engine, label: 'WebGPU'};
            }
        } catch (error) {
            console.warn('WebGPU is unavailable here; the stage falls back to WebGL.', error);
        }
    }
    const engine = new Engine(canvas, true);
    return {engine, label: engine.webGLVersion >= 2 ? 'WebGL 2' : 'WebGL'};
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
 * readout and an "Open in editor" action. Renders only while the stage is on screen. Returns a
 * function that tears everything down.
 */
export async function mountHeroStage(root: HTMLElement): Promise<() => void> {
    const el = queryStage(root);
    if (!el) {
        return () => {};
    }
    const {engine, label} = await createStageEngine(el.canvas);
    engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));
    if (el.engineLabel) {
        el.engineLabel.textContent = label;
    }

    let scene: Scene | null = null;
    let ctx: DemoContext | null = null;
    let effect: DemoModule | null = null;
    let effectId = '';
    let loadToken = 0;

    const showEffect = async (id: string) => {
        const entry = EFFECTS[id];
        if (!entry || id === effectId) {
            return;
        }
        effectId = id;
        const token = ++loadToken;
        for (const tab of el.tabs) {
            tab.setAttribute('aria-pressed', String(tab.dataset.effect === id));
        }
        if (el.demoLink) {
            el.demoLink.href = entry.demoKey ? `./babylonDemo.html#${entry.demoKey}` : '#demos';
            el.demoLink.textContent = entry.demoKey ? 'Full-screen demo' : 'All demos';
        }
        const module = await entry.load();
        if (token !== loadToken) {
            return;
        }

        scene?.dispose();
        effect = null;
        const next = new Scene(engine);
        next.useRightHandedSystem = true;
        next.clearColor = new Color4(0.035, 0.04, 0.06, 1);
        const camera = new ArcRotateCamera('stageCamera', -Math.PI / 2, Math.PI / 3, 20, BVector3.Zero(), next);
        camera.minZ = 0.1;
        if (entry.orbit) {
            camera.attachControl(el.canvas, true);
            // Wheel and pinch would steal the page's scroll; dragging still orbits.
            camera.inputs.removeByType('ArcRotateCameraMouseWheelInput');
        }
        new HemisphericLight('stageLight', new BVector3(0.35, 1, -0.2), next);
        const batchRenderer = new BatchedRenderer('stageVfx', next);
        const demoState: DemoState = {totalTime: 0, refreshIndex: 0};
        const nextCtx: DemoContext = {scene: next, camera, batchRenderer, systems: [], demoState};
        scene = next;
        ctx = nextCtx;
        try {
            await module.init(nextCtx);
            if (token === loadToken) {
                effect = module;
            }
        } catch (error) {
            console.error('The stage effect could not start:', error);
        }
    };

    for (const tab of el.tabs) {
        tab.addEventListener('click', () => void showEffect(tab.dataset.effect ?? ''));
    }

    const onPointerMove = (event: PointerEvent) => {
        const rect = el.canvas.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
        pointer.y = -(((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1);
        pointer.seen = true;
    };
    el.canvas.addEventListener('pointermove', onPointerMove, {passive: true});

    const onEditor = () => void openInEditor(ctx, effectId);
    el.editorButton?.addEventListener('click', onEditor);

    let frames = 0;
    let lastStat = performance.now();
    const renderFrame = () => {
        if (!scene || !ctx) {
            return;
        }
        const delta = Math.min(engine.getDeltaTime() / 1000, 0.05);
        try {
            effect?.update?.(ctx, delta);
            ctx.batchRenderer.update(delta);
            scene.render();
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

    const onResize = () => engine.resize();
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(el.canvas);

    const initial = el.tabs.find((tab) => tab.getAttribute('aria-pressed') === 'true')?.dataset.effect ?? 'vortex';
    await showEffect(initial);
    el.root.dataset.live = 'true';

    return () => {
        observer.disconnect();
        resizeObserver.disconnect();
        el.canvas.removeEventListener('pointermove', onPointerMove);
        el.editorButton?.removeEventListener('click', onEditor);
        setRunning(false);
        loadToken++;
        scene?.dispose();
        engine.dispose();
        delete el.root.dataset.live;
    };
}

/**
 * Hands the running effect to the editor page, the way the demo viewer does: serialise every
 * effect root under the renderer into session storage and open `editor.html?effect=session`.
 */
async function openInEditor(ctx: DemoContext | null, effectId: string) {
    if (!ctx || ctx.systems.length === 0) {
        window.location.href = './editor.html';
        return;
    }
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
    const name = effectId === 'vortex' ? 'Vortex' : (EFFECTS[effectId]?.demoKey ?? 'Effect').replace(/Demo$/, '');
    sessionStorage.setItem('quarks-editor-effect', serializeEffectForest([...roots], name));
    window.location.href = './editor.html?effect=session';
}
