import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData';
import {Buffer, VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {StorageBuffer} from '@babylonjs/core/Buffers/storageBuffer';
import {Scene} from '@babylonjs/core/scene';
import type {WebGPUEngine} from '@babylonjs/core/Engines/webgpuEngine';
import {IParticleSystem} from 'quarks.core';
import {VFXBatch} from '../VFXBatch';
import {VFXBatchSettings} from '../BatchedRenderer';
import {buildSpriteMaterial} from '../materials/spriteMaterial';
import {INSTANCE_STRIDE_FLOATS} from './wgsl/assemble';
import type {ParticleSystem} from '../ParticleSystem';

// Constants.BUFFER_CREATIONFLAG_READWRITE | BUFFER_CREATIONFLAG_VERTEX
const FLAGS_READWRITE_VERTEX = 3 | 8;

interface InstanceRange {
    offset: number;
    capacity: number;
}

/**
 * Renders GPU-simulated sprite systems. All systems in the batch share one
 * interleaved instance StorageBuffer that the compute update kernels write
 * into (each system gets a contiguous slot range); the same buffer is bound
 * as instanced vertex data, so no CPU-side per-particle work happens at all.
 * Dead slots carry zero size and rasterize nothing.
 */
export class GpuSpriteBatch extends VFXBatch {
    private allocations = new Map<IParticleSystem, InstanceRange>();
    private totalCapacity = 0;
    private instanceStorage: StorageBuffer | null = null;

    constructor(settings: VFXBatchSettings, scene: Scene) {
        super(settings, scene);
        this.setupBuffers();
        this.rebuildMaterial();
    }

    setupBuffers(): void {
        this.mesh.dispose();
        this.mesh = new Mesh('gpuSpriteBatch', this.scene);
        this.mesh.alwaysSelectAsActiveMesh = true;
        this.mesh.doNotSyncBoundingInfo = true;

        const vertexData = new VertexData();
        vertexData.positions = this.settings.instancingGeometry;
        vertexData.indices = this.settings.instancingIndices;
        if (this.settings.instancingUVs) {
            vertexData.uvs = this.settings.instancingUVs;
        }
        if (this.settings.instancingNormals) {
            vertexData.normals = this.settings.instancingNormals;
        }
        vertexData.applyToMesh(this.mesh, false);
        this.mesh.forcedInstanceCount = 0;
    }

    addSystem(system: IParticleSystem): void {
        super.addSystem(system);
        this.reallocate();
    }

    removeSystem(system: IParticleSystem): void {
        super.removeSystem(system);
        this.reallocate();
    }

    /**
     * Rebuilds the shared instance buffer whenever the set of systems changes.
     * Particle state buffers live on the simulators and survive; instance data
     * is fully rewritten by the next update dispatch.
     */
    private reallocate(): void {
        this.allocations.clear();
        let offset = 0;
        for (const system of this.systems) {
            const sim = (system as ParticleSystem)._gpuSimulator;
            if (!sim) {
                continue;
            }
            this.allocations.set(system, {offset, capacity: sim.capacity});
            offset += sim.capacity;
        }
        this.totalCapacity = offset;

        this.instanceStorage?.dispose();
        this.instanceStorage = null;
        if (this.totalCapacity === 0) {
            this.mesh.forcedInstanceCount = 0;
            this.mesh.setEnabled(false);
            return;
        }

        const engine = this.scene.getEngine() as WebGPUEngine;
        this.instanceStorage = new StorageBuffer(
            engine,
            this.totalCapacity * INSTANCE_STRIDE_FLOATS * 4,
            FLAGS_READWRITE_VERTEX,
            'quarksGpuInstances'
        );
        // Wrap the storage buffer as interleaved instanced vertex data
        // (offsets are in floats): offset(3) color(4) size(3) uvTile(1) rotation(1).
        const buffer = new Buffer(engine, this.instanceStorage.getBuffer(), false, INSTANCE_STRIDE_FLOATS);
        this.mesh.setVerticesBuffer(buffer.createVertexBuffer('offset', 0, 3, INSTANCE_STRIDE_FLOATS, true));
        this.mesh.setVerticesBuffer(buffer.createVertexBuffer('color', 3, 4, INSTANCE_STRIDE_FLOATS, true));
        this.mesh.setVerticesBuffer(buffer.createVertexBuffer('size', 7, 3, INSTANCE_STRIDE_FLOATS, true));
        this.mesh.setVerticesBuffer(buffer.createVertexBuffer('uvTile', 10, 1, INSTANCE_STRIDE_FLOATS, true));
        this.mesh.setVerticesBuffer(buffer.createVertexBuffer('rotation', 11, 1, INSTANCE_STRIDE_FLOATS, true));
    }

    expandBuffers(): void {
        // capacities are fixed per system; the shared buffer is rebuilt on
        // system add/remove instead
    }

    rebuildMaterial(): void {
        this.mesh.material = buildSpriteMaterial(this.settings, this.scene);
    }

    update(): void {
        if (!this.instanceStorage) {
            return;
        }
        // Invisible systems keep simulating (matching CPU semantics); their
        // update kernel writes zero-size instances instead.
        for (const system of this.systems) {
            const sim = (system as ParticleSystem)._gpuSimulator;
            const range = this.allocations.get(system);
            if (!sim || !range) {
                continue;
            }
            sim.tick(this.instanceStorage, range.offset, system.emitter.visible);
        }
        this.mesh.forcedInstanceCount = this.totalCapacity;
        this.mesh.setEnabled(this.totalCapacity > 0);
    }

    dispose(): void {
        if (this.mesh.material) {
            this.mesh.material.dispose();
        }
        this.instanceStorage?.dispose();
        this.instanceStorage = null;
        super.dispose();
    }
}
