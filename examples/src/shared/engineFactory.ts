import type {AbstractEngine} from '@babylonjs/core/Engines/abstractEngine';
import {Engine} from '@babylonjs/core/Engines/engine';

/**
 * Creates the Babylon engine for a demo page. Append ?engine=webgpu to the URL
 * to run on WebGPUEngine; falls back to WebGL when WebGPU is unsupported.
 */
export async function createEngineFromQuery(canvas: HTMLCanvasElement): Promise<AbstractEngine> {
    const requested = new URLSearchParams(window.location.search).get('engine');
    if (requested === 'webgpu') {
        const {WebGPUEngine} = await import('@babylonjs/core/Engines/webgpuEngine');
        await import('@babylonjs/core/Engines/WebGPU/Extensions/index');
        if (await WebGPUEngine.IsSupportedAsync) {
            const engine = new WebGPUEngine(canvas, {antialias: true});
            await engine.initAsync();
            return engine;
        }
        console.warn('WebGPU requested but not supported in this browser; falling back to WebGL.');
    }
    return new Engine(canvas, true);
}
