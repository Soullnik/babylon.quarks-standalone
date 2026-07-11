import {Scene} from '@babylonjs/core/scene';
import {ComputeShader} from '@babylonjs/core/Compute/computeShader';
import {StorageBuffer} from '@babylonjs/core/Buffers/storageBuffer';
import {RawTexture} from '@babylonjs/core/Materials/Textures/rawTexture';
import {Constants} from '@babylonjs/core/Engines/constants';
import type {WebGPUEngine} from '@babylonjs/core/Engines/webgpuEngine';
import {Matrix3, Quaternion, Vector3} from 'quarks.core';
import type {ParticleSystem} from '../ParticleSystem';
import {EncodedSystem} from './encodeSystem';
import {
    CURVE_RESOLUTION,
    computeParamsLayout,
    ParamsLayout,
    writeParamFields,
} from './generators/GeneratorEncoder';
import {FLAG_VISIBLE, FLAG_WORLD_SPACE} from './wgsl/assemble';
import {maxOfGenerator} from './GpuCapacity';

// Buffer creation flags (Constants.BUFFER_CREATIONFLAG_*)
const FLAGS_READWRITE = 3;

const PARTICLE_STRIDE_FLOATS = 20; // 5 x vec4
const WORKGROUP_SIZE = 64;

// Dawn derives each pipeline's bind group layout from the bindings the kernel
// statically uses; binding an unused resource is a validation error, so each
// kernel gets its own mapping covering exactly what it references.
const BASE_BINDINGS = {
    params: {group: 0, binding: 0},
    particles: {group: 0, binding: 1},
    counters: {group: 0, binding: 2},
    freeList: {group: 0, binding: 3},
};
const INSTANCE_BINDING = {instanceData: {group: 0, binding: 4}};
const CURVE_BINDING = {curveAtlas: {group: 0, binding: 5}};

interface PendingDeaths {
    dieAt: number;
    count: number;
}

/**
 * Owns the GPU-side state and compute pipelines of one particle system:
 * particle slots, freelist, per-frame params, and the spawn/update/reset
 * kernels. Dispatch happens from GpuSpriteBatch.update() via {@link tick},
 * writing render attributes into the batch's shared instance buffer.
 */
export class GpuParticleSimulator {
    readonly capacity: number;
    readonly signature: string;

    private readonly system: ParticleSystem;
    private readonly scene: Scene;
    private readonly layout: ParamsLayout;
    private readonly paramsData: Float32Array;
    private readonly paramsUints: Uint32Array;
    private readonly fields: EncodedSystem['fields'];

    private paramsBuffer: StorageBuffer;
    private particleBuffer: StorageBuffer;
    private countersBuffer: StorageBuffer;
    private freeListBuffer: StorageBuffer;
    private curveAtlas: RawTexture | null = null;

    private resetCS: ComputeShader;
    private spawnCS: ComputeShader;
    private updateCS: ComputeShader;

    private pendingSpawn = 0;
    private pendingDelta = 0;
    private needsReset = true;
    private simTime = 0;
    private maxLife: number;
    private pendingDeaths: PendingDeaths[] = [];
    /** CPU-side upper-bound estimate of live particles (exact readback is a later phase). */
    aliveEstimate = 0;

    // scratch for matrix decomposition
    private readonly tmpQuat = new Quaternion();
    private readonly tmpPos = new Vector3();
    private readonly tmpScale = new Vector3();
    private readonly normalMatrix = new Matrix3();

    constructor(system: ParticleSystem, scene: Scene, encoded: EncodedSystem) {
        this.system = system;
        this.scene = scene;
        this.capacity = encoded.capacity;
        this.signature = encoded.signature;
        this.fields = encoded.fields;
        this.maxLife = maxOfGenerator(system.startLife) ?? 5;

        const engine = scene.getEngine() as WebGPUEngine;
        this.layout = computeParamsLayout(encoded.fields);
        this.paramsData = new Float32Array(this.layout.totalFloats);
        this.paramsUints = new Uint32Array(this.paramsData.buffer);

        this.paramsBuffer = new StorageBuffer(engine, this.layout.totalFloats * 4, FLAGS_READWRITE, 'quarksGpuParams');
        this.particleBuffer = new StorageBuffer(
            engine,
            this.capacity * PARTICLE_STRIDE_FLOATS * 4,
            FLAGS_READWRITE,
            'quarksGpuParticles'
        );
        this.countersBuffer = new StorageBuffer(engine, 16, FLAGS_READWRITE, 'quarksGpuCounters');
        this.freeListBuffer = new StorageBuffer(engine, this.capacity * 4, FLAGS_READWRITE, 'quarksGpuFreeList');

        if (encoded.curves.length > 0) {
            const atlasData = new Float32Array(CURVE_RESOLUTION * encoded.curves.length * 4);
            for (let row = 0; row < encoded.curves.length; row++) {
                atlasData.set(encoded.curves[row](), row * CURVE_RESOLUTION * 4);
            }
            this.curveAtlas = new RawTexture(
                atlasData,
                CURVE_RESOLUTION,
                encoded.curves.length,
                Constants.TEXTUREFORMAT_RGBA,
                scene,
                false,
                false,
                Constants.TEXTURE_NEAREST_SAMPLINGMODE,
                Constants.TEXTURETYPE_FLOAT
            );
        }

        this.resetCS = new ComputeShader(
            'quarksGpuReset',
            engine,
            {computeSource: encoded.kernels.reset},
            {bindingsMapping: {...BASE_BINDINGS, ...INSTANCE_BINDING}}
        );
        this.spawnCS = new ComputeShader(
            'quarksGpuSpawn',
            engine,
            {computeSource: encoded.kernels.spawn},
            {bindingsMapping: {...BASE_BINDINGS, ...(encoded.kernels.spawnUsesCurves ? CURVE_BINDING : {})}}
        );
        this.updateCS = new ComputeShader(
            'quarksGpuUpdate',
            engine,
            {computeSource: encoded.kernels.update},
            {
                bindingsMapping: {
                    ...BASE_BINDINGS,
                    ...INSTANCE_BINDING,
                    ...(encoded.kernels.updateUsesCurves ? CURVE_BINDING : {}),
                },
            }
        );
        for (const cs of [this.resetCS, this.spawnCS, this.updateCS]) {
            cs.setStorageBuffer('params', this.paramsBuffer);
            cs.setStorageBuffer('particles', this.particleBuffer);
            cs.setStorageBuffer('counters', this.countersBuffer);
            cs.setStorageBuffer('freeList', this.freeListBuffer);
        }
        if (this.curveAtlas) {
            if (encoded.kernels.spawnUsesCurves) {
                this.spawnCS.setTexture('curveAtlas', this.curveAtlas, false);
            }
            if (encoded.kernels.updateUsesCurves) {
                this.updateCS.setTexture('curveAtlas', this.curveAtlas, false);
            }
        }
    }

    /** Queues this frame's emission; called from ParticleSystem.update(). */
    pushFrame(delta: number, spawnCount: number): void {
        this.pendingSpawn += spawnCount;
        this.pendingDelta += delta;
        this.simTime += delta;
        if (spawnCount > 0) {
            this.pendingDeaths.push({dieAt: this.simTime + this.maxLife, count: spawnCount});
            this.aliveEstimate = Math.min(this.capacity, this.aliveEstimate + spawnCount);
        }
        while (this.pendingDeaths.length > 0 && this.pendingDeaths[0].dieAt <= this.simTime) {
            this.aliveEstimate = Math.max(0, this.aliveEstimate - this.pendingDeaths.shift()!.count);
        }
    }

    /** Restarts the simulation (freelist + counters re-init, all slots freed). */
    requestReset(): void {
        this.needsReset = true;
        this.pendingSpawn = 0;
        this.pendingDelta = 0;
        this.simTime = 0;
        this.aliveEstimate = 0;
        this.pendingDeaths.length = 0;
    }

    /**
     * Writes per-frame params and dispatches reset/spawn/update. Called once
     * per frame by GpuSpriteBatch with the shared instance buffer and this
     * system's slot range offset.
     */
    tick(instanceBuffer: StorageBuffer, instanceOffset: number, visible: boolean): void {
        // Compute pipelines compile asynchronously; accumulate emission until
        // every kernel is ready so no particles are silently dropped.
        if (!this.resetCS.isReady() || !this.spawnCS.isReady() || !this.updateCS.isReady()) {
            return;
        }

        const delta = this.pendingDelta;
        const spawnCount = Math.min(this.pendingSpawn, this.capacity);
        this.pendingDelta = 0;
        this.pendingSpawn = 0;

        this.writeParams(delta, spawnCount, instanceOffset, visible);
        this.paramsBuffer.update(this.paramsData);

        // the spawn kernel never touches instance data
        this.resetCS.setStorageBuffer('instanceData', instanceBuffer);
        this.updateCS.setStorageBuffer('instanceData', instanceBuffer);

        const groups = Math.ceil(this.capacity / WORKGROUP_SIZE);
        if (this.needsReset) {
            this.needsReset = false;
            this.resetCS.dispatch(groups, 1, 1);
        }
        if (spawnCount > 0) {
            this.spawnCS.dispatch(Math.ceil(spawnCount / WORKGROUP_SIZE), 1, 1);
        }
        if (delta > 0 || spawnCount > 0) {
            this.updateCS.dispatch(groups, 1, 1);
        }
    }

    private writeParams(delta: number, spawnCount: number, instanceOffset: number, visible: boolean): void {
        const floats = this.paramsData;
        const uints = this.paramsUints;
        const emitterMatrix = this.system.emitter.matrixWorld;

        // head: emitterMatrix (0..15), normalMatrix as mat4 (16..31),
        // timing (32..35), counts (36..39), scaleV (40..43)
        floats.set(emitterMatrix.elements, 0);

        this.normalMatrix.getNormalMatrix(emitterMatrix);
        const n = this.normalMatrix.elements;
        floats[16] = n[0]; floats[17] = n[1]; floats[18] = n[2]; floats[19] = 0;
        floats[20] = n[3]; floats[21] = n[4]; floats[22] = n[5]; floats[23] = 0;
        floats[24] = n[6]; floats[25] = n[7]; floats[26] = n[8]; floats[27] = 0;
        floats[28] = 0; floats[29] = 0; floats[30] = 0; floats[31] = 1;

        floats[32] = delta;
        floats[33] = this.system.duration > 0 ? this.system.emissionState.time / this.system.duration : 0;
        floats[34] = this.system.emissionState.time;
        floats[35] = 0;

        uints[36] = spawnCount >>> 0;
        uints[37] = (Math.random() * 0xffffffff) >>> 0;
        uints[38] = instanceOffset >>> 0;
        uints[39] = ((this.system.worldSpace ? FLAG_WORLD_SPACE : 0) | (visible ? FLAG_VISIBLE : 0)) >>> 0;

        emitterMatrix.decompose(this.tmpPos, this.tmpQuat, this.tmpScale);
        const sx = Math.abs(this.tmpScale.x);
        const sy = Math.abs(this.tmpScale.y);
        const sz = Math.abs(this.tmpScale.z);
        floats[40] = sx;
        floats[41] = sy;
        floats[42] = sz;
        floats[43] = (sx + sy + sz) / 3;

        writeParamFields(this.fields, this.layout, floats);
    }

    dispose(): void {
        this.paramsBuffer.dispose();
        this.particleBuffer.dispose();
        this.countersBuffer.dispose();
        this.freeListBuffer.dispose();
        this.curveAtlas?.dispose();
    }
}
