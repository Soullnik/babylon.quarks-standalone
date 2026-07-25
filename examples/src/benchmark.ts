import {Scene} from "@babylonjs/core/scene";
import {ArcRotateCamera} from "@babylonjs/core/Cameras/arcRotateCamera";
import {Vector3 as BVector3} from "@babylonjs/core/Maths/math.vector";
import {Color4} from "@babylonjs/core/Maths/math.color";
import {Constants} from "@babylonjs/core/Engines/constants";
import {ParticleSystem as NativeParticleSystem} from "@babylonjs/core/Particles/particleSystem";
import {GPUParticleSystem} from "@babylonjs/core/Particles/gpuParticleSystem";
import "@babylonjs/core/Particles/webgl2ParticleSystem";
import {SceneInstrumentation} from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import {
    BatchedRenderer,
    ParticleSystem,
    ConstantValue,
    IntervalValue,
    ConstantColor,
    ConeEmitter,
    RenderMode,
    Vector4,
} from "babylon.quarks";
import {SHARED_ASSETS, createColorOverLifeRange, createSharedTexture} from "./shared/common";
import {createEngineFromQuery} from "./shared/engineFactory";

const LIFETIME = 2;
const EMITTER_RING_RADIUS = 3;
const CONE_RADIUS = 0.2;
const CONE_ANGLE = 0.5;
const PARTICLE_COUNT_OPTIONS = [2000, 5000, 10000, 20000, 50000, 100000, 200000, 300000];
const DEFAULT_SWEEP_COUNTS = [2000, 10000, 30000];

const query = new URLSearchParams(window.location.search);
const numberList = (raw: string | null, fallback: number[]): number[] => {
    const parsed = (raw ?? '')
        .split(',')
        .map((part) => parseInt(part, 10))
        .filter((value) => Number.isFinite(value) && value > 0);
    return parsed.length > 0 ? parsed : fallback;
};

const WARMUP_FRAMES = numberList(query.get('warmup'), [90])[0];
const MEASURE_FRAMES = numberList(query.get('frames'), [240])[0];
const SWEEP_COUNTS = numberList(query.get('counts'), DEFAULT_SWEEP_COUNTS);

const COLOR_START = {r: 1, g: 0.7, b: 0.3, a: 1};
const COLOR_END = {r: 0.6, g: 0.2, b: 0.05, a: 0};

interface BenchConfig {
    totalParticles: number;
    emitterCount: number;
}

interface Backend {
    id: string;
    label: string;
    isSupported(): boolean;
    /** Creates all particle systems for the given config inside the scene. */
    start(scene: Scene, config: BenchConfig): void;
    /** Per-frame simulation work not covered by scene.render(). */
    update(delta: number): void;
    getActiveCount(): number;
}

interface RunResult {
    backend: string;
    totalParticles: number;
    emitterCount: number;
    avgCpuMs: number;
    avgFps: number;
    drawCalls: number;
    activeParticles: number;
}

function emitterPositions(count: number): BVector3[] {
    if (count === 1) {
        return [BVector3.Zero()];
    }
    const positions: BVector3[] = [];
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        positions.push(new BVector3(Math.cos(angle) * EMITTER_RING_RADIUS, 0, Math.sin(angle) * EMITTER_RING_RADIUS));
    }
    return positions;
}

function perEmitterRate(config: BenchConfig): number {
    return config.totalParticles / config.emitterCount / LIFETIME;
}

const quarksBackend: (() => Backend) = () => {
    let renderer: BatchedRenderer | null = null;
    let systems: ParticleSystem[] = [];
    return {
        id: "quarks",
        label: "babylon.quarks (batched)",
        isSupported: () => true,
        start(scene, config) {
            renderer = new BatchedRenderer("bench-quarks", scene);
            systems = [];
            const texture = createSharedTexture(scene, SHARED_ASSETS.defaultParticle);
            const rate = perEmitterRate(config);
            for (const position of emitterPositions(config.emitterCount)) {
                const system = new ParticleSystem({
                    scene,
                    duration: LIFETIME,
                    looping: true,
                    startLife: new ConstantValue(LIFETIME),
                    startSpeed: new IntervalValue(3, 5),
                    startSize: new IntervalValue(0.2, 0.4),
                    startColor: new ConstantColor(
                        new Vector4(COLOR_START.r, COLOR_START.g, COLOR_START.b, COLOR_START.a)
                    ),
                    emissionOverTime: new ConstantValue(rate),
                    // quarks' angle is a half-angle; Babylon's native cone uses a full angle.
                    shape: new ConeEmitter({radius: CONE_RADIUS, angle: CONE_ANGLE / 2}),
                    renderMode: RenderMode.BillBoard,
                    texture,
                    transparent: true,
                    blendMode: Constants.ALPHA_ADD,
                });
                system.addBehavior(
                    createColorOverLifeRange(
                        new Vector4(COLOR_START.r, COLOR_START.g, COLOR_START.b, COLOR_START.a),
                        new Vector4(COLOR_END.r, COLOR_END.g, COLOR_END.b, COLOR_END.a)
                    )
                );
                system.emitter.position = position;
                // quarks emits along local +Z; Babylon's native cone emits along +Y.
                system.emitter.rotation.x = -Math.PI / 2;
                renderer.addSystem(system);
                systems.push(system);
            }
        },
        update(delta) {
            renderer?.update(delta);
        },
        getActiveCount() {
            return systems.reduce((sum, system) => sum + system.particleNum, 0);
        },
    };
};

function configureNativeSystem(
    system: NativeParticleSystem | GPUParticleSystem,
    position: BVector3,
    rate: number
): void {
    system.emitter = position;
    system.minLifeTime = LIFETIME;
    system.maxLifeTime = LIFETIME;
    system.emitRate = rate;
    system.minEmitPower = 3;
    system.maxEmitPower = 5;
    system.minSize = 0.2;
    system.maxSize = 0.4;
    // updateSpeed is in "time units per frame at 60fps"; 1/60 makes lifetimes/rates second-based.
    system.updateSpeed = 1 / 60;
    system.blendMode = NativeParticleSystem.BLENDMODE_ADD;
    system.createConeEmitter(CONE_RADIUS, CONE_ANGLE);
    system.addColorGradient(0, new Color4(COLOR_START.r, COLOR_START.g, COLOR_START.b, COLOR_START.a));
    system.addColorGradient(1, new Color4(COLOR_END.r, COLOR_END.g, COLOR_END.b, COLOR_END.a));
    system.start();
}

const nativeCpuBackend: (() => Backend) = () => {
    let systems: NativeParticleSystem[] = [];
    return {
        id: "native-cpu",
        label: "Babylon ParticleSystem (CPU)",
        isSupported: () => true,
        start(scene, config) {
            systems = [];
            const rate = perEmitterRate(config);
            const capacity = Math.ceil((config.totalParticles / config.emitterCount) * 1.25);
            for (const position of emitterPositions(config.emitterCount)) {
                const system = new NativeParticleSystem(`bench-cpu-${systems.length}`, capacity, scene);
                system.particleTexture = createSharedTexture(scene, SHARED_ASSETS.defaultParticle);
                configureNativeSystem(system, position, rate);
                systems.push(system);
            }
        },
        update() {},
        getActiveCount() {
            return systems.reduce((sum, system) => sum + system.particles.length, 0);
        },
    };
};

const nativeGpuBackend: (() => Backend) = () => {
    let systems: GPUParticleSystem[] = [];
    let capacityPerSystem = 0;
    return {
        id: "native-gpu",
        label: "Babylon GPUParticleSystem",
        isSupported: () => GPUParticleSystem.IsSupported,
        start(scene, config) {
            systems = [];
            const rate = perEmitterRate(config);
            capacityPerSystem = Math.ceil((config.totalParticles / config.emitterCount) * 1.25);
            for (const position of emitterPositions(config.emitterCount)) {
                const system = new GPUParticleSystem(
                    `bench-gpu-${systems.length}`,
                    {capacity: capacityPerSystem},
                    scene
                );
                system.particleTexture = createSharedTexture(scene, SHARED_ASSETS.defaultParticle);
                configureNativeSystem(system, position, rate);
                systems.push(system);
            }
        },
        update() {},
        getActiveCount() {
            // GPU simulation state is not CPU-readable; report the steady-state target.
            return systems.length > 0 ? Math.round(capacityPerSystem / 1.25) * systems.length : 0;
        },
    };
};

const backendFactories: {[id: string]: () => Backend} = {
    "quarks": quarksBackend,
    "native-cpu": nativeCpuBackend,
    "native-gpu": nativeGpuBackend,
};

const backendLabels: {[id: string]: string} = {
    "quarks": "babylon.quarks (batched)",
    "native-cpu": "Babylon ParticleSystem (CPU)",
    "native-gpu": "Babylon GPUParticleSystem",
};

const canvas = document.getElementById("renderer-canvas") as HTMLCanvasElement;
const backendSelect = document.getElementById("backend-select") as HTMLSelectElement;
const countSelect = document.getElementById("count-select") as HTMLSelectElement;
const emittersSelect = document.getElementById("emitters-select") as HTMLSelectElement;
const runSweepButton = document.getElementById("run-sweep") as HTMLButtonElement;
const copyResultsButton = document.getElementById("copy-results") as HTMLButtonElement;
const progressEl = document.getElementById("progress") as HTMLDivElement;
const statsEl = document.getElementById("stats") as HTMLDivElement;
const resultsEl = document.getElementById("results") as HTMLDivElement;

const engine = await createEngineFromQuery(canvas);

let scene: Scene | null = null;
let instrumentation: SceneInstrumentation | null = null;
let backend: Backend | null = null;

let cpuMsWindow: number[] = [];
let sampler: {
    framesLeft: number;
    warmupLeft: number;
    cpuMsSum: number;
    fpsSum: number;
    samples: number;
    resolve: (value: {avgCpuMs: number; avgFps: number; drawCalls: number; activeParticles: number}) => void;
} | null = null;

let sweepRunning = false;
let sweepResults: RunResult[] = [];

function fillSelect(select: HTMLSelectElement, entries: Array<{value: string; label: string; disabled?: boolean}>) {
    select.innerHTML = "";
    for (const entry of entries) {
        const option = document.createElement("option");
        option.value = entry.value;
        option.textContent = entry.label;
        option.disabled = Boolean(entry.disabled);
        select.appendChild(option);
    }
}

function currentConfig(): BenchConfig {
    return {
        totalParticles: parseInt(countSelect.value, 10),
        emitterCount: parseInt(emittersSelect.value, 10),
    };
}

/** Tears down the previous run and builds a fresh scene for the given backend. */
function startRun(backendId: string, config: BenchConfig) {
    scene?.dispose();
    cpuMsWindow = [];

    scene = new Scene(engine);
    scene.clearColor = new Color4(0.03, 0.04, 0.09, 1);
    const camera = new ArcRotateCamera("cam", -Math.PI / 2, 1.1, 16, new BVector3(0, 1.5, 0), scene);
    camera.attachControl(canvas, true);
    camera.wheelDeltaPercentage = 0.01;
    instrumentation = new SceneInstrumentation(scene);

    backend = backendFactories[backendId]();
    backend.start(scene, config);
}

function averageCpuMs(): number {
    if (cpuMsWindow.length === 0) {
        return 0;
    }
    return cpuMsWindow.reduce((a, b) => a + b, 0) / cpuMsWindow.length;
}

function renderLiveStats() {
    if (!backend) {
        return;
    }
    statsEl.innerHTML = [
        `<b>Engine</b> ${engine.isWebGPU ? "WebGPU" : "WebGL"}`,
        `<b>FPS</b> ${engine.getFps().toFixed(0)}`,
        `<b>CPU frame</b> ${averageCpuMs().toFixed(2)} ms`,
        `<b>Draw calls</b> ${instrumentation?.drawCallsCounter.current ?? 0}`,
        `<b>Active particles</b> ${backend.getActiveCount()}`,
    ].join("<br>");
}

engine.runRenderLoop(() => {
    if (!scene || !backend) {
        return;
    }
    const delta = engine.getDeltaTime() / 1000;
    const frameStart = performance.now();
    backend.update(delta);
    scene.render();
    const cpuMs = performance.now() - frameStart;

    cpuMsWindow.push(cpuMs);
    if (cpuMsWindow.length > 30) {
        cpuMsWindow.shift();
    }

    if (sampler) {
        if (sampler.warmupLeft > 0) {
            sampler.warmupLeft--;
        } else {
            sampler.cpuMsSum += cpuMs;
            sampler.fpsSum += engine.getFps();
            sampler.samples++;
            sampler.framesLeft--;
            if (sampler.framesLeft <= 0) {
                const done = sampler;
                sampler = null;
                done.resolve({
                    avgCpuMs: done.cpuMsSum / done.samples,
                    avgFps: done.fpsSum / done.samples,
                    drawCalls: instrumentation?.drawCallsCounter.current ?? 0,
                    activeParticles: backend.getActiveCount(),
                });
            }
        }
    }

    renderLiveStats();
});

function measureCurrentRun(): Promise<{avgCpuMs: number; avgFps: number; drawCalls: number; activeParticles: number}> {
    return new Promise((resolve) => {
        sampler = {
            framesLeft: MEASURE_FRAMES,
            warmupLeft: WARMUP_FRAMES,
            cpuMsSum: 0,
            fpsSum: 0,
            samples: 0,
            resolve,
        };
    });
}

function resultsToMarkdown(results: RunResult[]): string {
    const header = "| Backend | Particles | Emitters | CPU ms/frame | FPS | Draw calls |";
    const divider = "|---|---:|---:|---:|---:|---:|";
    const rows = results.map(
        (r) =>
            `| ${r.backend} | ${r.totalParticles} | ${r.emitterCount} | ${r.avgCpuMs.toFixed(2)} | ${r.avgFps.toFixed(0)} | ${r.drawCalls} |`
    );
    return [header, divider, ...rows].join("\n");
}

function renderResultsTable(results: RunResult[]) {
    if (results.length === 0) {
        resultsEl.innerHTML = "";
        return;
    }
    const rows = results
        .map(
            (r) =>
                `<tr><td>${r.backend}</td><td>${r.totalParticles}</td><td>${r.emitterCount}</td>` +
                `<td>${r.avgCpuMs.toFixed(2)}</td><td>${r.avgFps.toFixed(0)}</td><td>${r.drawCalls}</td></tr>`
        )
        .join("");
    resultsEl.innerHTML =
        `<table><thead><tr><th>Backend</th><th>Particles</th><th>Emitters</th>` +
        `<th>CPU ms</th><th>FPS</th><th>Draws</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function runSweep() {
    if (sweepRunning) {
        return;
    }
    sweepRunning = true;
    runSweepButton.disabled = true;
    copyResultsButton.disabled = true;
    sweepResults = [];

    const emitterCount = parseInt(emittersSelect.value, 10);
    const backendIds = Object.keys(backendFactories).filter((id) => backendFactories[id]().isSupported());
    const totalRuns = backendIds.length * SWEEP_COUNTS.length;
    let runIndex = 0;

    for (const backendId of backendIds) {
        for (const totalParticles of SWEEP_COUNTS) {
            runIndex++;
            progressEl.textContent = `Running ${runIndex}/${totalRuns}: ${backendLabels[backendId]}, ${totalParticles} particles...`;
            startRun(backendId, {totalParticles, emitterCount});
            const measured = await measureCurrentRun();
            sweepResults.push({
                backend: backendLabels[backendId],
                totalParticles,
                emitterCount,
                ...measured,
            });
            renderResultsTable(sweepResults);
        }
    }

    progressEl.textContent = `Done: ${totalRuns} runs, ${emitterCount} emitter(s) each.`;
    runSweepButton.disabled = false;
    copyResultsButton.disabled = false;
    sweepRunning = false;

    // Return to the interactive configuration.
    startRun(backendSelect.value, currentConfig());
}

declare global {
    interface Window {
        benchmarkResults?: RunResult[];
        benchmarkDone?: boolean;
    }
}

function applySelection() {
    if (sweepRunning) {
        return;
    }
    startRun(backendSelect.value, currentConfig());
}

fillSelect(backendSelect, [
    {value: "quarks", label: backendLabels["quarks"]},
    {value: "native-cpu", label: backendLabels["native-cpu"]},
    {
        value: "native-gpu",
        label: backendLabels["native-gpu"] + (GPUParticleSystem.IsSupported ? "" : " (unsupported)"),
        disabled: !GPUParticleSystem.IsSupported,
    },
]);
fillSelect(
    countSelect,
    PARTICLE_COUNT_OPTIONS.map((count) => ({value: String(count), label: count.toLocaleString("en-US")}))
);
countSelect.value = "10000";
fillSelect(emittersSelect, [1, 4, 16].map((count) => ({value: String(count), label: String(count)})));
emittersSelect.value = String(numberList(query.get('emitters'), [4])[0]);

backendSelect.addEventListener("change", applySelection);
countSelect.addEventListener("change", applySelection);
emittersSelect.addEventListener("change", applySelection);
runSweepButton.addEventListener("click", () => void runSweep());
copyResultsButton.addEventListener("click", () => {
    void navigator.clipboard.writeText(resultsToMarkdown(sweepResults));
    copyResultsButton.textContent = "Copied!";
    setTimeout(() => (copyResultsButton.textContent = "Copy as markdown"), 1200);
});

window.addEventListener("resize", () => engine.resize());

applySelection();

/**
 * Headless hook: `?autorun=1` runs the sweep on load and publishes the results
 * on `window`, so browser automation can read the same numbers the panel shows.
 * `counts`, `emitters`, `warmup` and `frames` override the sweep parameters.
 * Runs last so the controls it reads are already populated.
 */
if (query.get("autorun") !== null) {
    window.benchmarkDone = false;
    void runSweep().then(() => {
        window.benchmarkResults = sweepResults;
        window.benchmarkDone = true;
    });
}
