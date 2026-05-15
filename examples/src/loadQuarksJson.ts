import type {Scene} from "@babylonjs/core/scene";
import type {TransformNode} from "@babylonjs/core/Meshes/transformNode";
import {QuarksLoader, QuarksUtil, ParticleEmitter, ParticleSystem, BatchedRenderer} from "babylon.quarks";

/** Returns true when JSON looks like a Quarks / Three.js Object3D export. */
export function isQuarksExportJson(json: unknown): json is Record<string, unknown> {
    return typeof json === "object" && json !== null && "object" in json;
}

/** Registers particle systems from a loaded root and starts playback. */
export function mountQuarksEffect(root: TransformNode, batchRenderer: BatchedRenderer, systems: ParticleSystem[]) {
    QuarksUtil.runOnAllParticleEmitters(root, (emitter: ParticleEmitter) => {
        const system = emitter.system as ParticleSystem;
        batchRenderer.addSystem(system);
        systems.push(system);
    });
    QuarksUtil.restart(root);
    QuarksUtil.play(root);
}

/** Parses Quarks JSON and attaches it to the batched renderer. */
export function loadQuarksFromJson(
    scene: Scene,
    batchRenderer: BatchedRenderer,
    systems: ParticleSystem[],
    json: unknown,
    baseUrl = ""
): TransformNode {
    if (!isQuarksExportJson(json)) {
        throw new Error("JSON must be a Quarks export with an \"object\" root (Object3D.toJSON format).");
    }
    const loader = new QuarksLoader(scene, {baseUrl});
    const root = loader.parse(json, baseUrl);
    root.parent = batchRenderer;
    mountQuarksEffect(root, batchRenderer, systems);
    return root;
}
