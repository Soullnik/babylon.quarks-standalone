import {Engine} from "@babylonjs/core/Engines/engine";
import type {AbstractEngine} from "@babylonjs/core/Engines/abstractEngine";

/**
 * Creates the Babylon engine for a demo page. Append ?engine=webgpu to the URL
 * to run on WebGPUEngine; falls back to WebGL when WebGPU is unsupported.
 *
 * WebGPU pipeline compilation is asynchronous and validation errors surface on the
 * device rather than as thrown exceptions, so we hook them explicitly — otherwise a
 * broken material just renders nothing with no obvious cause. Copy anything logged
 * with the [WebGPU] prefix when reporting rendering issues.
 */
export async function createEngineFromQuery(canvas: HTMLCanvasElement): Promise<AbstractEngine> {
    const requested = new URLSearchParams(window.location.search).get("engine");
    if (requested === "webgpu") {
        const {WebGPUEngine} = await import("@babylonjs/core/Engines/webgpuEngine");
        await import("@babylonjs/core/Engines/WebGPU/Extensions/index");
        if (await WebGPUEngine.IsSupportedAsync) {
            const engine = new WebGPUEngine(canvas, {antialias: true});
            await engine.initAsync();
            hookWebGPUErrors(engine);
            return engine;
        }
        console.warn("WebGPU requested but not supported in this browser; falling back to WebGL.");
    }
    return new Engine(canvas, true);
}

interface MinimalGpuDevice {
    addEventListener(type: "uncapturederror", listener: (event: {error: {message: string}}) => void): void;
    lost: Promise<{reason: string; message: string}>;
}

/** Surfaces WebGPU device validation/out-of-memory errors to the console. */
function hookWebGPUErrors(engine: AbstractEngine): void {
    const device = (engine as unknown as {_device?: MinimalGpuDevice})._device;
    if (!device) {
        return;
    }
    device.addEventListener("uncapturederror", (event) => {
        console.error("[WebGPU] uncaptured error:", event.error.message);
    });
    device.lost.then((info) => {
        // "destroyed" reason is the normal path on engine.dispose(); ignore it.
        if (info.reason !== "destroyed") {
            console.error("[WebGPU] device lost:", info.reason, info.message);
        }
    });
}
