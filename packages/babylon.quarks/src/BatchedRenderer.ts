import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {IParticleSystem} from 'quarks.core';
import {VFXBatch, RenderMode, StoredBatchSettings} from './VFXBatch';
import {SpriteBatch} from './SpriteBatch';
import {TrailBatch} from './TrailBatch';
import {ParticleSystem} from './ParticleSystem';

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

    constructor(name: string, scene: Scene) {
        super(name, scene);
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

    addSystem(system: IParticleSystem) {
        (system as unknown as ParticleSystem)._renderer = this;
        if (this.adaptivePerformanceState.enabled) {
            (system as any).setQualityFactor?.(this.adaptivePerformanceState.currentQuality);
        }
        const settings = (system as unknown as ParticleSystem).getRendererSettings();
        for (let i = 0; i < this.batches.length; i++) {
            if (BatchedRenderer.equals(this.batches[i].settings, settings)) {
                this.batches[i].addSystem(system);
                this.systemToBatchIndex.set(system, i);
                return;
            }
        }
        let batch: VFXBatch;
        const scene = this.getScene();
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
            (ps as any).setQualityFactor?.(quality);
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
            (ps as any).update(delta);
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
