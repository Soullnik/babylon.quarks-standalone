import {Engine} from "@babylonjs/core/Engines/engine";
import type {AbstractEngine} from "@babylonjs/core/Engines/abstractEngine";

/**
 * Creates the Babylon engine for a demo page. Append ?engine=webgpu to the URL
 * to run on WebGPUEngine; falls back to WebGL when WebGPU is unsupported.
 */
export async function createEngineFromQuery(canvas: HTMLCanvasElement): Promise<AbstractEngine> {
    const requested = new URLSearchParams(window.location.search).get("engine");
    if (requested === "webgpu") {
        try {
            const {WebGPUEngine} = await import("@babylonjs/core/Engines/webgpuEngine");
            await import("@babylonjs/core/Engines/WebGPU/Extensions/index");
            if (await WebGPUEngine.IsSupportedAsync) {
                const engine = new WebGPUEngine(canvas, {antialias: true});
                await engine.initAsync();
                return engine;
            }
            console.warn("WebGPU requested but not supported in this browser; falling back to WebGL.");
        } catch (error) {
            // IsSupportedAsync only checks for an adapter; device creation can
            // still fail (e.g. driver/DXC issues) — fall back instead of dying.
            console.warn("WebGPU initialization failed; falling back to WebGL.", error);
        }
    }
    return new Engine(canvas, true);
}
