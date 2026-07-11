import {Scene} from '@babylonjs/core/scene';
import type {ParticleSystem} from '../ParticleSystem';
import {RenderMode} from '../VFXBatch';
import {collectUnsupportedFeatures} from './encodeSystem';

/**
 * Requested simulation mode.
 * - `'cpu'` — today's JS simulation (default).
 * - `'gpu'` — WebGPU compute simulation; falls back to CPU with a one-time
 *   console warning when unsupported.
 * - `'auto'` — GPU when silently possible, CPU otherwise.
 */
export type SimulationMode = 'auto' | 'cpu' | 'gpu';

export enum SimulationBackend {
    CPU = 'cpu',
    GPU = 'gpu',
}

export interface SimulationBackendState {
    requested: SimulationMode;
    active: SimulationBackend;
    /** First blocking reason when a GPU request fell back to CPU. */
    fallbackReason?: string;
    /** Every blocking reason, for diagnostics/editor UI. */
    unsupportedFeatures?: string[];
}

const GPU_RENDER_MODES = new Set<RenderMode>([
    RenderMode.BillBoard,
    RenderMode.VerticalBillBoard,
    RenderMode.HorizontalBillBoard,
]);

/**
 * Checks whether a system can run its simulation on the GPU with the current
 * engine and configuration. Returns every blocking reason (empty = supported).
 */
export function evaluateGpuSupport(system: ParticleSystem, scene: Scene): {supported: boolean; reasons: string[]} {
    const reasons: string[] = [];

    const caps = scene.getEngine().getCaps();
    if (!caps.supportComputeShaders) {
        reasons.push('engine does not support compute shaders (WebGPU engine required)');
    }

    const renderMode = system.rendererSettings.renderMode;
    if (!GPU_RENDER_MODES.has(renderMode)) {
        reasons.push(`render mode ${RenderMode[renderMode]} is not GPU-supported yet`);
    }
    if (system.onlyUsedByOther) {
        reasons.push('system is driven by a sub-emitter (CPU only)');
    }
    if (system.prewarm && system.looping) {
        reasons.push('prewarm is not GPU-supported yet');
    }
    if (system.hasEventListeners('particleDied')) {
        reasons.push('particleDied listeners require CPU simulation');
    }

    reasons.push(...collectUnsupportedFeatures(system));

    return {supported: reasons.length === 0, reasons};
}

/** Resolves the active backend for a requested mode, with the fallback state. */
export function resolveSimulationBackend(
    system: ParticleSystem,
    scene: Scene,
    requested: SimulationMode
): SimulationBackendState {
    if (requested === 'cpu') {
        return {requested, active: SimulationBackend.CPU};
    }
    const {supported, reasons} = evaluateGpuSupport(system, scene);
    if (supported) {
        return {requested, active: SimulationBackend.GPU};
    }
    return {
        requested,
        active: SimulationBackend.CPU,
        fallbackReason: reasons[0],
        unsupportedFeatures: reasons,
    };
}
