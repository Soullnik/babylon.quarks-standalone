import {Scene} from "@babylonjs/core/scene";
import {ArcRotateCamera} from "@babylonjs/core/Cameras/arcRotateCamera";
import {HemisphericLight} from "@babylonjs/core/Lights/hemisphericLight";
import {Vector3 as BVector3} from "@babylonjs/core/Maths/math.vector";
import {Color4} from "@babylonjs/core/Maths/math.color";
import {BatchedRenderer, ParticleSystem} from "babylon.quarks";
import {loadQuarksFromJson} from "./loadQuarksJson";
import {createEngineFromQuery} from "./shared/engineFactory";
import {EffectBinding} from "babylon.quarks-editor";
import {demos} from "./registry";
import type {DemoContext, DemoDefinition, DemoState} from "./types";

const GITHUB_BASE = "https://github.com/Soullnik/babylon.quarks-standalone/blob/main/";
const DROPPED_JSON_DEMO_KEY = "__dropped_json__";
const DROPPED_JSON_REFRESH_TIME = 2;

const canvas = document.getElementById("renderer-canvas") as HTMLCanvasElement;
const demoSelect = document.getElementById("demo-select") as HTMLSelectElement;
const jsonFileInput = document.getElementById("json-file-input") as HTMLInputElement | null;
const dropOverlay = document.getElementById("drop-overlay");
const engine = await createEngineFromQuery(canvas);

let scene: Scene;
let camera: ArcRotateCamera;
let batchRenderer: BatchedRenderer;
let systems: ParticleSystem[] = [];
let demoIndex = 0;
let activeDemo: DemoDefinition | null = null;
let demoState: DemoState = {};
let loadToken = 0;
let frameCount = 0;
let lastFpsTime = performance.now();
let dragDepth = 0;

const droppedJsonDemo: DemoDefinition = {
    key: DROPPED_JSON_DEMO_KEY,
    name: "Dropped JSON",
    module: "dropped",
    sourcePath: "examples/src/viewer.ts",
    description: "Preview a Quarks JSON file dropped or opened from disk.",
    tags: ["import"],
    preview: {icon: "JS", gradient: "linear-gradient(135deg, #6f90e9 0%, #1e2f72 100%)"},
    init: async () => {},
    onFrame: ({demoState: state}, delta) => {
        const preview = state.droppedJsonPreview;
        if (!preview?.systems?.length) {
            return;
        }
        preview.elapsed += delta;
        if (preview.elapsed < DROPPED_JSON_REFRESH_TIME) {
            return;
        }
        preview.elapsed = 0;
        for (const system of preview.systems) {
            if (!system.looping) {
                system.restart();
                system.play();
            }
        }
    },
};

/** Creates the dropped-json option in the demo picker when needed. */
function ensureDroppedJsonOption(label: string) {
    let option = demoSelect.querySelector(`option[value="${DROPPED_JSON_DEMO_KEY}"]`) as HTMLOptionElement | null;
    if (!option) {
        option = document.createElement("option");
        option.value = DROPPED_JSON_DEMO_KEY;
        demoSelect.insertBefore(option, demoSelect.firstChild);
    }
    option.textContent = label;
    option.hidden = false;
}

/** Hides the dropped-json option after switching back to a built-in demo. */
function hideDroppedJsonOption() {
    const option = demoSelect.querySelector(`option[value="${DROPPED_JSON_DEMO_KEY}"]`) as HTMLOptionElement | null;
    if (option) {
        option.hidden = true;
    }
}

function createBaseScene() {
    if (scene) {
        scene.dispose();
    }
    scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    scene.clearColor = new Color4(0.05, 0.05, 0.08, 1);

    camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3, 20, BVector3.Zero(), scene);
    camera.attachControl(canvas, true);
    camera.minZ = 0.1;
    new HemisphericLight("light", new BVector3(0, 1, 0), scene);

    batchRenderer = new BatchedRenderer("batchRenderer", scene);
    systems = [];
    demoState = {totalTime: 0, refreshIndex: 0};
}

function updateSourceLink() {
    const sourceLink = document.getElementById("source-link") as HTMLAnchorElement | null;
    if (!sourceLink || !activeDemo) {
        return;
    }
    if (activeDemo.key === DROPPED_JSON_DEMO_KEY) {
        sourceLink.href = GITHUB_BASE + "packages/babylon.quarks/src/QuarksLoader.ts";
        sourceLink.textContent = "Loader";
        return;
    }
    sourceLink.textContent = "Source";
    sourceLink.href = GITHUB_BASE + activeDemo.sourcePath;
}

function updateDemoSelectValue() {
    if (demoSelect && activeDemo) {
        demoSelect.value = activeDemo.key;
    }
}

function updateDemoTitle() {
    const title = document.getElementById("demo-name");
    if (title && activeDemo) {
        title.textContent = activeDemo.name;
    }
}

function setDropOverlayVisible(visible: boolean) {
    if (dropOverlay) {
        dropOverlay.classList.toggle("is-visible", visible);
    }
}

/** Loads a Quarks JSON file from disk into the viewer. */
async function loadDroppedJsonFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".json")) {
        throw new Error("Please choose a .json file exported from Quarks.");
    }

    const token = ++loadToken;
    createBaseScene();
    camera.setPosition(new BVector3(0, 8, 18));

    const json = JSON.parse(await file.text());
    const trackedSystems: ParticleSystem[] = [];
    loadQuarksFromJson(scene, batchRenderer, trackedSystems, json);

    if (token !== loadToken) {
        return;
    }

    systems.push(...trackedSystems);
    demoState.droppedJsonPreview = {elapsed: 0, systems: trackedSystems};
    activeDemo = {...droppedJsonDemo, name: file.name};
    ensureDroppedJsonOption(file.name);
    updateDemoTitle();
    updateDemoSelectValue();
    window.location.hash = "#" + DROPPED_JSON_DEMO_KEY;
    updateSourceLink();
}

/** Picks the first JSON file from a drag-and-drop or file-input event. */
function getJsonFileFromDataTransfer(dataTransfer: DataTransfer | null): File | null {
    if (!dataTransfer?.files?.length) {
        return null;
    }
    for (let i = 0; i < dataTransfer.files.length; i++) {
        const file = dataTransfer.files[i];
        if (file.name.toLowerCase().endsWith(".json")) {
            return file;
        }
    }
    return null;
}

async function loadDemo(index: number) {
    const token = ++loadToken;
    createBaseScene();
    activeDemo = demos[index];
    hideDroppedJsonOption();
    try {
        await activeDemo.init({scene, camera, batchRenderer, systems, demoState});
        if (token !== loadToken) {
            return;
        }
        updateDemoTitle();
        updateDemoSelectValue();
        window.location.hash = "#" + activeDemo.key;
        updateSourceLink();
    } catch (e) {
        if (token !== loadToken) {
            return;
        }
        console.error("Error loading demo:", e);
        const title = document.getElementById("demo-name");
        if (title) {
            title.textContent = "Error: " + (e as Error).message;
        }
    }
}

function nextDemo() {
    demoIndex = (demoIndex + 1) % demos.length;
    loadDemo(demoIndex);
}

function previousDemo() {
    demoIndex = (demoIndex - 1 + demos.length) % demos.length;
    loadDemo(demoIndex);
}

function setupJsonImportUi() {
    document.getElementById("openJsonBtn")?.addEventListener("click", () => {
        jsonFileInput?.click();
    });

    jsonFileInput?.addEventListener("change", async () => {
        const file = jsonFileInput.files?.[0];
        jsonFileInput.value = "";
        if (!file) {
            return;
        }
        try {
            await loadDroppedJsonFile(file);
        } catch (e) {
            console.error("Error loading JSON file:", e);
            const title = document.getElementById("demo-name");
            if (title) {
                title.textContent = "Error: " + (e as Error).message;
            }
        }
    });

    const onDragEnter = (event: DragEvent) => {
        if (!event.dataTransfer?.types.includes("Files")) {
            return;
        }
        event.preventDefault();
        dragDepth += 1;
        setDropOverlayVisible(true);
    };

    const onDragLeave = (event: DragEvent) => {
        if (!event.dataTransfer?.types.includes("Files")) {
            return;
        }
        event.preventDefault();
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) {
            setDropOverlayVisible(false);
        }
    };

    const onDragOver = (event: DragEvent) => {
        if (!event.dataTransfer?.types.includes("Files")) {
            return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
    };

    const onDrop = async (event: DragEvent) => {
        if (!event.dataTransfer?.types.includes("Files")) {
            return;
        }
        event.preventDefault();
        dragDepth = 0;
        setDropOverlayVisible(false);

        const file = getJsonFileFromDataTransfer(event.dataTransfer);
        if (!file) {
            return;
        }
        try {
            await loadDroppedJsonFile(file);
        } catch (e) {
            console.error("Error loading dropped JSON:", e);
            const title = document.getElementById("demo-name");
            if (title) {
                title.textContent = "Error: " + (e as Error).message;
            }
        }
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
}

document.getElementById("openInEditorBtn")?.addEventListener("click", () => {
    if (systems.length === 0) {
        return;
    }
    // Serialize whatever the demo is currently running and hand it to the editor page.
    const main = systems.find((s) => !s.onlyUsedByOther) ?? systems[0];
    const binding = new EffectBinding(main, systems.filter((s) => s !== main));
    sessionStorage.setItem("quarks-editor-effect", binding.exportJSON(activeDemo?.name ?? "DemoEffect"));
    window.location.href = "./editor.html?effect=session";
});

document.getElementById("nextBtn")?.addEventListener("click", nextDemo);
document.getElementById("previousBtn")?.addEventListener("click", previousDemo);
demoSelect.addEventListener("change", (event) => {
    const selectedKey = (event.target as HTMLSelectElement).value;
    if (selectedKey === DROPPED_JSON_DEMO_KEY) {
        return;
    }
    const selectedIndex = demos.findIndex((demoItem) => demoItem.key === selectedKey);
    if (selectedIndex >= 0) {
        demoIndex = selectedIndex;
        loadDemo(demoIndex);
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
        nextDemo();
    }
    if (event.key === "ArrowLeft") {
        previousDemo();
    }
});

window.addEventListener("hashchange", () => {
    const hash = window.location.hash.substring(1);
    if (hash === DROPPED_JSON_DEMO_KEY) {
        return;
    }
    const hashIndex = demos.findIndex((demoItem) => demoItem.key === hash);
    if (hashIndex >= 0 && hashIndex !== demoIndex) {
        demoIndex = hashIndex;
        loadDemo(demoIndex);
    }
});

demos.forEach((demoItem) => {
    const option = document.createElement("option");
    option.value = demoItem.key;
    option.textContent = demoItem.name;
    demoSelect.appendChild(option);
});

if (window.location.hash) {
    const hash = window.location.hash.substring(1);
    const hashIndex = demos.findIndex((demoItem) => demoItem.key === hash);
    if (hashIndex >= 0) {
        demoIndex = hashIndex;
    }
}

setupJsonImportUi();
loadDemo(demoIndex);

engine.runRenderLoop(() => {
    if (!scene || !batchRenderer || !activeDemo) {
        return;
    }
    try {
        const delta = engine.getDeltaTime() / 1000;
        const ctx: DemoContext = {scene, camera, batchRenderer, systems, demoState};
        if (activeDemo.onFrame) {
            activeDemo.onFrame(ctx, delta);
        }
        batchRenderer.update(delta);

        let totalParticles = 0;
        for (const system of systems) {
            totalParticles += system.particleNum;
        }
        const particleCount = document.getElementById("particleCount");
        if (particleCount) {
            particleCount.textContent = totalParticles.toString();
        }

        frameCount++;
        const now = performance.now();
        if (now - lastFpsTime >= 1000) {
            const fps = document.getElementById("fps");
            if (fps) {
                fps.textContent = frameCount.toString();
            }
            frameCount = 0;
            lastFpsTime = now;
        }

        scene.render();
    } catch (e) {
        console.error("Render error:", e);
    }
});

window.addEventListener("resize", () => engine.resize());
