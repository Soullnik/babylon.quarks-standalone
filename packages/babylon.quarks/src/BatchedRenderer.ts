import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {IParticleSystem} from 'quarks.core';
import {VFXBatch, RenderMode, StoredBatchSettings} from './VFXBatch';
import {SpriteBatch} from './SpriteBatch';
import {TrailBatch} from './TrailBatch';
import {ParticleSystem} from './ParticleSystem';
import {resolveSimulationBackend, SimulationBackend, SimulationMode} from './gpu/SimulationBackend';
import {GpuParticleSimulator} from './gpu/GpuParticleSimulator';
import {GpuSpriteBatch} from './gpu/GpuSpriteBatch';
import {estimateCapacity} from './gpu/GpuCapacity';
import {encodeSystem} from './gpu/encodeSystem';

export interface VFXBatchSettings {
    instancingGeometry: Float32Array;
    instancingIndices: Uint32Array | Uint16Array;
    instancingUVs?: Float32Array;
    instancingNormals?: Float32Array;
    renderMode: RenderMode;
    renderOrder: number;
    uTileCount: number;
    vTileCount: number;
    blendTiles: boolean;
    softParticles: boolean;
    softNearFade: number;
    softFarFade: number;
    materialBlendMode: number;
    materialTransparent: boolean;
    materialDepthTest: boolean;
    materialDepthWrite: boolean;
    materialAlphaTest: number;
    texture: Texture | null;
    layerMask: number;
}

export interface BatchedRendererOptions {
    /**
     * Simulation mode applied to systems that don't specify their own
     * `simulation` parameter. Defaults to 'cpu'.
     */
    defaultSimulation?: SimulationMode;
}

export interface AdaptivePerformanceOptions {
    targetFrameMs: number;
    minQuality: number;
    maxQuality: number;
    decreaseStep: number;
    increaseStep: number;
}

export interface AdaptivePerformanceState extends AdaptivePerformanceOptions {
    enabled: boolean;
    currentQuality: number;
    lastFrameCpuMs: number;
}

export class BatchedRenderer extends TransformNode {
    batches: Array<VFXBatch> = [];
    systemToBatchIndex: Map<IParticleSystem, number> = new Map<IParticleSystem, number>();
    depthTexture: BaseTexture | null = null;
    private adaptivePerformanceState: AdaptivePerformanceState = {
        enabled: false,
        targetFrameMs: 16.7,
        minQuality: 0.35,
        maxQuality: 1,
        decreaseStep: 0.08,
        increaseStep: 0.02,
        currentQuality: 1,
        lastFrameCpuMs: 0,
    };
    private lastAppliedQuality = Number.NaN;
    private readonly options: BatchedRendererOptions;

    constructor(name: string, scene: Scene, options: BatchedRendererOptions = {}) {
        super(name, scene);
        this.options = options;
    }

    private static clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }

    private static equals(a: StoredBatchSettings, b: VFXBatchSettings): boolean {
        return (
            a.materialBlendMode === b.materialBlendMode &&
            a.materialTransparent === b.materialTransparent &&
            a.materialDepthTest === b.materialDepthTest &&
            a.materialDepthWrite === b.materialDepthWrite &&
            a.materialAlphaTest === b.materialAlphaTest &&
            a.texture === b.texture &&
            a.renderMode === b.renderMode &&
            a.blendTiles === b.blendTiles &&
            a.softParticles === b.softParticles &&
            a.softFarFade === b.softFarFade &&
            a.softNearFade === b.softNearFade &&
            a.uTileCount === b.uTileCount &&
            a.vTileCount === b.vTileCount &&
            a.instancingGeometry === b.instancingGeometry &&
            a.renderOrder === b.renderOrder &&
            a.layerMask === b.layerMask
        );
    }

    /**
     * Resolves the simulation backend for a system: evaluates GPU support,
     * stores the resolved state on the system and creates/disposes its
     * GpuParticleSimulator accordingly.
     */
    private resolveBackend(particleSystem: ParticleSystem): boolean {
        const requested: SimulationMode = particleSystem.simulationMode ?? this.options.defaultSimulation ?? 'cpu';
        const scene = this.getScene();
        let state = resolveSimulationBackend(particleSystem, scene, requested);

        if (state.active === SimulationBackend.GPU) {
            const capacity = estimateCapacity(particleSystem, particleSystem.gpuMaxParticles);
            const result = encodeSystem(particleSystem, capacity);
            /* istanbul ignore if -- evaluateGpuSupport already vetted every feature the encoder checks */
            if (result.ok === false) {
                state = {
                    requested,
                    active: SimulationBackend.CPU,
                    fallbackReason: result.reasons[0],
                    unsupportedFeatures: result.reasons,
                };
            } else {
                if (particleSystem._gpuSimulator && particleSystem._gpuSimulator.signature !== result.encoded.signature) {
                    // config changed since the simulator was built (updateSystem path)
                    particleSystem._gpuSimulator.dispose();
                    particleSystem._gpuSimulator = undefined;
                }
                if (!particleSystem._gpuSimulator) {
                    particleSystem._gpuSimulator = new GpuParticleSimulator(particleSystem, scene, result.encoded);
                }
            }
        }

        if (state.active === SimulationBackend.CPU) {
            if (particleSystem._gpuSimulator) {
                particleSystem._gpuSimulator.dispose();
                particleSystem._gpuSimulator = undefined;
            }
            if (requested === 'gpu' && !particleSystem._gpuFallbackWarned) {
                particleSystem._gpuFallbackWarned = true;
                console.warn(
                    `babylon.quarks: GPU simulation was requested but is unavailable for this system; ` +
                        `falling back to CPU. Reasons: ${state.unsupportedFeatures?.join('; ')}`
                );
            }
        }

        particleSystem._simulationState = state;
        return state.active === SimulationBackend.GPU;
    }

    addSystem(system: IParticleSystem) {
        const particleSystem = system as ParticleSystem;
        particleSystem._renderer = this;
        if (this.adaptivePerformanceState.enabled) {
            particleSystem.setQualityFactor(this.adaptivePerformanceState.currentQuality);
        }
        const isGpu = this.resolveBackend(particleSystem);
        const settings = particleSystem.getRendererSettings();
        for (let i = 0; i < this.batches.length; i++) {
            if (
                this.batches[i] instanceof GpuSpriteBatch === isGpu &&
                BatchedRenderer.equals(this.batches[i].settings, settings)
            ) {
                this.batches[i].addSystem(system);
                this.systemToBatchIndex.set(system, i);
                return;
            }
        }
        let batch: VFXBatch;
        const scene = this.getScene();
        if (isGpu) {
            batch = new GpuSpriteBatch(settings, scene);
        } else {
            switch (settings.renderMode) {
                case RenderMode.Trail:
                    batch = new TrailBatch(settings, scene);
                    break;
                case RenderMode.Mesh:
                case RenderMode.BillBoard:
                case RenderMode.VerticalBillBoard:
                case RenderMode.HorizontalBillBoard:
                case RenderMode.StretchedBillBoard:
                    batch = new SpriteBatch(settings, scene);
                    break;
                default:
                    throw new Error(`Unsupported render mode: ${settings.renderMode}`);
            }
        }
        batch.mesh.parent = this;
        if (this.depthTexture) {
            batch.applyDepthTexture(this.depthTexture);
        }
        batch.addSystem(system);
        this.batches.push(batch);
        this.systemToBatchIndex.set(system, this.batches.length - 1);
    }

    deleteSystem(system: IParticleSystem) {
        const batchIndex = this.systemToBatchIndex.get(system);
        if (batchIndex !== undefined) {
            this.batches[batchIndex].removeSystem(system);
            this.systemToBatchIndex.delete(system);
        }
    }

    updateSystem(system: IParticleSystem) {
        this.deleteSystem(system);
        this.addSystem(system);
    }

    setDepthTexture(depthTexture: BaseTexture | null) {
        this.depthTexture = depthTexture;
        for (const batch of this.batches) {
            batch.applyDepthTexture(depthTexture);
        }
    }

    configureAdaptivePerformance(options: Partial<AdaptivePerformanceOptions> = {}) {
        const state = this.adaptivePerformanceState;
        const minQuality = BatchedRenderer.clamp(options.minQuality ?? state.minQuality, 0.05, 1);
        const maxQuality = BatchedRenderer.clamp(options.maxQuality ?? state.maxQuality, minQuality, 1);
        state.targetFrameMs = Math.max(options.targetFrameMs ?? state.targetFrameMs, 0.1);
        state.minQuality = minQuality;
        state.maxQuality = maxQuality;
        state.decreaseStep = Math.max(options.decreaseStep ?? state.decreaseStep, 0.001);
        state.increaseStep = Math.max(options.increaseStep ?? state.increaseStep, 0.001);
        state.currentQuality = BatchedRenderer.clamp(state.currentQuality, state.minQuality, state.maxQuality);
        state.enabled = true;
        this.lastAppliedQuality = Number.NaN;
    }

    disableAdaptivePerformance(resetQuality = true) {
        this.adaptivePerformanceState.enabled = false;
        if (resetQuality) {
            this.adaptivePerformanceState.currentQuality = this.adaptivePerformanceState.maxQuality;
            this.applyAdaptiveQuality();
        }
    }

    getAdaptivePerformanceState(): AdaptivePerformanceState {
        return {...this.adaptivePerformanceState};
    }

    private applyAdaptiveQuality() {
        const quality = this.adaptivePerformanceState.currentQuality;
        if (quality === this.lastAppliedQuality) {
            return;
        }
        for (const ps of this.systemToBatchIndex.keys()) {
            (ps as ParticleSystem).setQualityFactor(quality);
        }
        this.lastAppliedQuality = quality;
    }

    update(delta: number) {
        const adaptiveState = this.adaptivePerformanceState;
        const frameStart = adaptiveState.enabled ? performance.now() : 0;
        if (adaptiveState.enabled) {
            this.applyAdaptiveQuality();
        }
        for (const ps of this.systemToBatchIndex.keys()) {
            (ps as ParticleSystem).update(delta);
        }
        for (let i = 0; i < this.batches.length; i++) {
            this.batches[i].update();
        }
        if (!adaptiveState.enabled) {
            return;
        }

        adaptiveState.lastFrameCpuMs = performance.now() - frameStart;
        if (adaptiveState.lastFrameCpuMs > adaptiveState.targetFrameMs) {
            adaptiveState.currentQuality = BatchedRenderer.clamp(
                adaptiveState.currentQuality - adaptiveState.decreaseStep,
                adaptiveState.minQuality,
                adaptiveState.maxQuality
            );
        } else {
            adaptiveState.currentQuality = BatchedRenderer.clamp(
                adaptiveState.currentQuality + adaptiveState.increaseStep,
                adaptiveState.minQuality,
                adaptiveState.maxQuality
            );
        }
    }

    dispose(): void {
        for (const batch of this.batches) {
            batch.dispose();
        }
        this.batches = [];
        this.systemToBatchIndex.clear();
        super.dispose();
    }
}
