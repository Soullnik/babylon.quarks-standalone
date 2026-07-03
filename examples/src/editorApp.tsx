import React from "react";
import {createRoot} from "react-dom/client";
import {Scene} from "@babylonjs/core/scene";
import {ArcRotateCamera} from "@babylonjs/core/Cameras/arcRotateCamera";
import {Vector3 as BVector3} from "@babylonjs/core/Maths/math.vector";
import {Color4} from "@babylonjs/core/Maths/math.color";
import {Constants} from "@babylonjs/core/Engines/constants";
import {
    BatchedRenderer,
    ColorOverLife,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    IntervalValue,
    ParticleSystem,
    RenderMode,
    SizeOverLife,
    Vector4,
} from "babylon.quarks";
import {EffectBinding, EffectHistory, DEFAULT_GRADIENT_STOPS, buildGradient, buildScalar} from "babylon.quarks-editor";
import {EffectEditor} from "babylon.quarks-editor/react";
import {SHARED_ASSETS, createSharedTexture} from "./shared/common";
import {createEngineFromQuery} from "./shared/engineFactory";
import {loadQuarksFromJson} from "./loadQuarksJson";

const canvas = document.getElementById("renderer-canvas") as HTMLCanvasElement;
const engine = await createEngineFromQuery(canvas);

const scene = new Scene(engine);
scene.clearColor = new Color4(0.03, 0.04, 0.09, 1);
const camera = new ArcRotateCamera("cam", -Math.PI / 2, 1.15, 9, new BVector3(0, 1.4, 0), scene);
camera.attachControl(canvas, true);
camera.wheelDeltaPercentage = 0.01;

const batchRenderer = new BatchedRenderer("editor-particles", scene);

const system = new ParticleSystem({
    scene,
    duration: 4,
    looping: true,
    startLife: new IntervalValue(1.2, 1.8),
    startSpeed: new IntervalValue(3, 5),
    startSize: new IntervalValue(0.25, 0.5),
    startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
    emissionOverTime: new ConstantValue(80),
    shape: new ConeEmitter({radius: 0.3, angle: 0.5}),
    renderMode: RenderMode.BillBoard,
    texture: createSharedTexture(scene, SHARED_ASSETS.defaultParticle),
    transparent: true,
    blendMode: Constants.ALPHA_ADD,
});
system.addBehavior(new ColorOverLife(buildGradient(DEFAULT_GRADIENT_STOPS)));
system.addBehavior(
    new SizeOverLife(buildScalar({mode: "curve", value: 1, min: 0, max: 1, curve: [0.3, 1, 1, 0.2]}) as never)
);
batchRenderer.addSystem(system);

let binding = new EffectBinding(system);

const textureOptions = [
    {label: "Default particle", url: SHARED_ASSETS.defaultParticle},
    {label: "Texture atlas 1", url: SHARED_ASSETS.atlas},
    {label: "Texture atlas 2", url: SHARED_ASSETS.atlasSecondary},
    {label: "Smoke (4x4 sheet)", url: SHARED_ASSETS.smoke},
];

const root = createRoot(document.getElementById("editor-root")!);
const history = new EffectHistory();

function mountEditor(nextBinding: EffectBinding) {
    binding = nextBinding;
    history.attach(nextBinding);
    nextBinding.subscribe(updateHistoryButtons);
    root.render(
        <EffectEditor
            binding={nextBinding}
            textureOptions={textureOptions}
            resolveTexture={(url) => createSharedTexture(scene, url)}
        />
    );
    updateDebugHook();
    updateHistoryButtons();
}

/** Replaces the current effect with systems loaded from a Quarks JSON export. */
function importEffectJson(json: unknown) {
    for (const existing of [binding.system, ...binding.subSystems]) {
        batchRenderer.deleteSystem(existing);
        existing.dispose();
    }
    const loaded: ParticleSystem[] = [];
    loadQuarksFromJson(scene, batchRenderer, loaded, json);
    if (loaded.length === 0) {
        throw new Error("No particle systems found in the JSON file.");
    }
    const main = loaded.find((s) => !s.onlyUsedByOther) ?? loaded[0];
    const subs = loaded.filter((s) => s !== main);
    mountEditor(new EffectBinding(main, subs));
}

const particleCountEl = document.getElementById("particle-count")!;
engine.runRenderLoop(() => {
    batchRenderer.update(engine.getDeltaTime() / 1000);
    scene.render();
    let count = binding.system.particleNum;
    for (const sub of binding.subSystems) {
        count += sub.particleNum;
    }
    particleCountEl.textContent = `${count} particles`;
});
window.addEventListener("resize", () => engine.resize());

document.getElementById("restart-btn")!.addEventListener("click", () => binding.restart());
document.getElementById("export-btn")!.addEventListener("click", () => {
    const json = binding.exportJSON("EditorEffect");
    const blob = new Blob([json], {type: "application/json"});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "effect.json";
    link.click();
    URL.revokeObjectURL(link.href);
});

const undoButton = document.getElementById("undo-btn") as HTMLButtonElement;
const redoButton = document.getElementById("redo-btn") as HTMLButtonElement;

function updateHistoryButtons() {
    undoButton.disabled = !history.canUndo;
    redoButton.disabled = !history.canRedo;
}

function applyHistory(json: unknown | null) {
    if (json) {
        importEffectJson(json);
    }
    updateHistoryButtons();
}

undoButton.addEventListener("click", () => applyHistory(history.undo()));
redoButton.addEventListener("click", () => applyHistory(history.redo()));
window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        applyHistory(event.shiftKey ? history.redo() : history.undo());
    }
});

const importInput = document.getElementById("import-input") as HTMLInputElement;
document.getElementById("import-btn")!.addEventListener("click", () => importInput.click());
importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    importInput.value = "";
    if (!file) {
        return;
    }
    try {
        importEffectJson(JSON.parse(await file.text()));
        history.clear();
        updateHistoryButtons();
    } catch (e) {
        console.error("Failed to import effect JSON:", e);
        alert("Failed to import effect JSON: " + (e as Error).message);
    }
});

// Debug/testing hook: lets the console (and smoke tests) reach the live binding.
function updateDebugHook() {
    (window as never as {__quarksEditor: unknown}).__quarksEditor = {
        binding,
        system: binding.system,
        batchRenderer,
        scene,
        importEffectJson,
        parseEffectJson: (json: unknown) => loadQuarksFromJson(scene, batchRenderer, [], json),
    };
}

mountEditor(binding);
