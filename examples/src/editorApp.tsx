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
import {EffectBinding, DEFAULT_GRADIENT_STOPS, buildGradient, buildScalar} from "babylon.quarks-editor";
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

const binding = new EffectBinding(system);

const particleCountEl = document.getElementById("particle-count")!;
engine.runRenderLoop(() => {
    batchRenderer.update(engine.getDeltaTime() / 1000);
    scene.render();
    particleCountEl.textContent = `${system.particleNum} particles`;
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

createRoot(document.getElementById("editor-root")!).render(<EffectEditor binding={binding} />);

// Debug/testing hook: lets the console (and smoke tests) reach the live binding.
(window as never as {__quarksEditor: unknown}).__quarksEditor = {
    binding,
    system,
    batchRenderer,
    scene,
    parseEffectJson: (json: unknown) => loadQuarksFromJson(scene, batchRenderer, [], json),
};
