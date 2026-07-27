import {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {EmitSubParticleSystem, IParticleSystem} from 'quarks.core';
import {ParticleSystem} from './ParticleSystem';
import {SpriteBatch} from './SpriteBatch';
import {TrailBatch} from './TrailBatch';
import {RenderMode, StoredBatchSettings, VFXBatch} from './VFXBatch';

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
    /**
     * Cubemap (or other reflection texture) harvested from a Babylon material's
     * `reflectionTexture`. Mesh batches sample it like StandardMaterial cubic
     * reflection; other render modes ignore it.
     */
    reflectionTexture: BaseTexture | null;
    /** Multiplier for the reflection sample — mirrors `texture.level`. */
    reflectionLevel: number;
    /**
     * Optional six cube-face 2D textures (px,py,pz,nx,ny,nz). Prefer
     * `reflectionAtlas` on iOS — many simultaneous face samplers still trip
     * GL_INVALID_OPERATION on WebKit.
     */
    reflectionFaces: BaseTexture[] | null;
    /**
     * Single 3×2 atlas of cube faces (px py pz / nx ny nz). One sampler2D —
     * the path that stays valid on iOS WebKit ShaderMaterial draws.
     */
    reflectionAtlas: BaseTexture | null;
    layerMask: number;
}

export interface AdaptivePerformanceOptions {
    targetFrameMs: number;
    minQuality: number;
    maxQuality: number;
    decreaseStep: number;
    increaseStep: number;
}

/** True when both face lists are the same six texture references (or both empty). */
function reflectionFacesEqual(a: BaseTexture[] | null | undefined, b: BaseTexture[] | null | undefined): boolean {
    if (a === b) {
        return true;
    }
    if (!a || !b || a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
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
    /** Systems in insertion order — iterated every frame, unlike the map. */
    private systems: Array<IParticleSystem> = [];
    /**
     * The same systems, ordered so that one emitting into another comes first.
     *
     * A sub emitter's particles are created by its parent's behaviors, part way
     * through the parent's step. A sub system updated before its parent has
     * already fixed the list of particles it will run behaviors over, so those
     * new particles are drawn that frame with nothing but their start values —
     * white where a colour curve would have coloured them, at their start size,
     * sitting at the point they were born. Rebuilt only when the set of systems
     * or their behaviors changes, not per frame.
     */
    private orderedSystems: Array<IParticleSystem> = [];
    private orderedSystemsStale = true;
    /** Consecutive frames each batch has held no system, parallel to `batches`. */
    private batchEmptyFrames: Array<number> = [];
    /**
     * How long an empty batch is kept before it is disposed. Systems that toggle
     * a setting back and forth reuse the batch within this window instead of
     * rebuilding a mesh and material every time.
     */
    private static readonly EMPTY_BATCH_GRACE_FRAMES = 120;
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
            a.reflectionTexture === b.reflectionTexture &&
            a.reflectionLevel === b.reflectionLevel &&
            reflectionFacesEqual(a.reflectionFaces, b.reflectionFaces) &&
            a.reflectionAtlas === b.reflectionAtlas &&
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
        const particleSystem = system as ParticleSystem;
        particleSystem._renderer = this;
        if (!this.systemToBatchIndex.has(system) && this.systems.indexOf(system) === -1) {
            this.systems.push(system);
            this.orderedSystemsStale = true;
        }
        if (this.adaptivePerformanceState.enabled) {
            particleSystem.setQualityFactor(this.adaptivePerformanceState.currentQuality);
        }
        this.assignToBatch(particleSystem);
    }

    /** Places a system into a compatible batch, creating one when none matches. */
    private assignToBatch(particleSystem: ParticleSystem) {
        const system = particleSystem as IParticleSystem;
        const settings = particleSystem.getRendererSettings();
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
        this.batchEmptyFrames.push(0);
        this.systemToBatchIndex.set(system, this.batches.length - 1);
    }

    deleteSystem(system: IParticleSystem) {
        const removed = this.removeFromBatch(system);
        const index = this.systems.indexOf(system);
        if (index !== -1) {
            this.systems.splice(index, 1);
            this.orderedSystemsStale = true;
        }
        // Also out of the ordered copy, which update() may be iterating right
        // now: a system that disposes itself from inside its own update leaves
        // the loop expecting the slot it vacated to hold the next one.
        const ordered = this.orderedSystems.indexOf(system);
        if (ordered !== -1) {
            this.orderedSystems.splice(ordered, 1);
        }
        return removed;
    }

    /** Detaches a system from its batch, leaving the renderer's system list alone. */
    private removeFromBatch(system: IParticleSystem): boolean {
        const batchIndex = this.systemToBatchIndex.get(system);
        if (batchIndex === undefined) {
            return false;
        }
        this.batches[batchIndex].removeSystem(system);
        this.systemToBatchIndex.delete(system);
        return true;
    }

    /**
     * Re-buckets a system whose render settings changed. The system keeps its
     * place in the update order, so this is safe to call mid-frame.
     */
    updateSystem(system: IParticleSystem) {
        this.removeFromBatch(system);
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
        for (let i = 0; i < this.systems.length; i++) {
            (this.systems[i] as ParticleSystem).setQualityFactor(quality);
        }
        this.lastAppliedQuality = quality;
    }

    /** @internal Called when a system's behaviors change, which can add a sub emitter. */
    _invalidateUpdateOrder(): void {
        this.orderedSystemsStale = true;
    }

    /**
     * Orders the systems so a system emitting into another runs first.
     *
     * Depth first over "emits into" edges, recording each system once all the
     * systems it feeds have been recorded, then reversed — a system therefore
     * lands ahead of everything it emits into, however deep the chain. A cycle
     * cannot be satisfied by any order; it is left as found rather than dropped.
     */
    private orderSystems(): Array<IParticleSystem> {
        if (!this.orderedSystemsStale) {
            return this.orderedSystems;
        }
        const ordered: Array<IParticleSystem> = [];
        const visiting = new Set<IParticleSystem>();
        const done = new Set<IParticleSystem>();
        const known = new Set<IParticleSystem>(this.systems);

        const subTargetsOf = (system: IParticleSystem): Array<IParticleSystem> => {
            const targets: Array<IParticleSystem> = [];
            for (const behavior of (system as ParticleSystem).behaviors ?? []) {
                if (behavior.type !== 'EmitSubParticleSystem') {
                    continue;
                }
                const target = (behavior as EmitSubParticleSystem).subParticleSystem?.system;
                if (target !== undefined && known.has(target)) {
                    targets.push(target);
                }
            }
            return targets;
        };

        const visit = (system: IParticleSystem): void => {
            if (done.has(system) || visiting.has(system)) {
                return;
            }
            visiting.add(system);
            for (const target of subTargetsOf(system)) {
                visit(target);
            }
            visiting.delete(system);
            done.add(system);
            ordered.push(system);
        };

        for (const system of this.systems) {
            visit(system);
        }
        ordered.reverse();
        this.orderedSystems = ordered;
        this.orderedSystemsStale = false;
        return ordered;
    }

    update(delta: number) {
        const adaptiveState = this.adaptivePerformanceState;
        const frameStart = adaptiveState.enabled ? performance.now() : 0;
        if (adaptiveState.enabled) {
            this.applyAdaptiveQuality();
        }
        const systems = this.orderSystems();
        for (let i = 0; i < systems.length; i++) {
            const system = systems[i];
            // A disabled emitter holds its particles frozen instead of simulating
            // them unseen, matching how Unity treats a disabled ParticleSystem.
            // Pooled effects parked with setEnabled(false) then cost nothing.
            if (system.emitter.visible) {
                (system as ParticleSystem).update(delta);
            }
            // An autoDestroy system disposes itself from inside update and drops
            // out of the list; stay on the slot it vacated.
            if (systems[i] !== system) {
                i--;
            }
        }
        this.refreshBatches();
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

    /** Rebuild instance buffers from current particle state without advancing simulation. */
    refreshBatches(): void {
        const emptyFrames = this.batchEmptyFrames;
        for (let i = 0; i < this.batches.length; i++) {
            const batch = this.batches[i];
            if (batch.systems.size > 0) {
                emptyFrames[i] = 0;
                batch.update();
                continue;
            }
            const framesEmpty = (emptyFrames[i] ?? 0) + 1;
            emptyFrames[i] = framesEmpty;
            if (framesEmpty === 1) {
                // One last update clears the instance data left on screen.
                batch.update();
            } else if (framesEmpty > BatchedRenderer.EMPTY_BATCH_GRACE_FRAMES) {
                // Nothing has used these settings for a while: give the mesh,
                // material and GPU buffers back instead of re-uploading empty
                // instance data forever.
                this.removeBatch(i);
                i--;
            }
        }
    }

    /** Disposes the batch at `index` and repairs the system→batch mapping. */
    private removeBatch(index: number): void {
        this.batches[index].dispose();
        this.batches.splice(index, 1);
        this.batchEmptyFrames.splice(index, 1);
        for (const [system, batchIndex] of this.systemToBatchIndex) {
            if (batchIndex > index) {
                this.systemToBatchIndex.set(system, batchIndex - 1);
            }
        }
    }

    /** Per-batch particle vs GPU instance counts — for diagnosing stale render state. */
    getBatchRenderStats(): Array<{
        batchIndex: number;
        renderMode: RenderMode;
        instanceCount: number;
        particleCount: number;
        systemNames: string[];
    }> {
        return this.batches.map((batch, batchIndex) => {
            let particleCount = 0;
            const systemNames: string[] = [];
            for (const system of batch.systems) {
                const ps = system as ParticleSystem;
                particleCount += ps.particleNum;
                systemNames.push(ps.emitter.name);
            }
            return {
                batchIndex,
                renderMode: batch.settings.renderMode,
                instanceCount: batch.mesh.forcedInstanceCount ?? 0,
                particleCount,
                systemNames,
            };
        });
    }

    dispose(): void {
        for (const batch of this.batches) {
            batch.dispose();
        }
        this.batches = [];
        this.batchEmptyFrames.length = 0;
        this.systems.length = 0;
        this.systemToBatchIndex.clear();
        super.dispose();
    }
}
