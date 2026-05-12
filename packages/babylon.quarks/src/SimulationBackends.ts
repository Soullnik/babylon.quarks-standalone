import {Scene} from '@babylonjs/core/scene';
import {ComputeShader} from '@babylonjs/core/Compute/computeShader';
import {StorageBuffer} from '@babylonjs/core/Buffers/storageBuffer';
import {Constants} from '@babylonjs/core/Engines/constants';
import {IParticleSystem} from 'quarks.core';
import {RenderMode} from './VFXBatch';

export enum SimulationBackend {
    CPU = 'cpu',
    GPU = 'gpu',
}

export interface SimulationBackendState {
    requestedBackend: SimulationBackend;
    activeBackend: SimulationBackend;
    fallbackReason?: string;
}

export interface SimulationBackendDiagnostics {
    supported: boolean;
    probeMode: boolean;
    eligibleSystems: number;
    dispatchedSystems: number;
    dispatchedParticles: number;
    lastDispatchMs: number;
    notes?: string;
}

export interface SimulationBackendAdapter {
    kind: SimulationBackend;
    updateSystems(systems: Iterable<IParticleSystem>, delta: number): void;
    getDiagnostics(): SimulationBackendDiagnostics;
}

class CpuSimulationBackendAdapter implements SimulationBackendAdapter {
    kind = SimulationBackend.CPU;
    private diagnostics: SimulationBackendDiagnostics = {
        supported: true,
        probeMode: false,
        eligibleSystems: 0,
        dispatchedSystems: 0,
        dispatchedParticles: 0,
        lastDispatchMs: 0,
        notes: 'CPU simulation backend',
    };

    updateSystems(systems: Iterable<IParticleSystem>, delta: number): void {
        let systemCount = 0;
        for (const particleSystem of systems) {
            (particleSystem as any).update(delta);
            systemCount++;
        }
        this.diagnostics.eligibleSystems = systemCount;
        this.diagnostics.dispatchedSystems = 0;
        this.diagnostics.dispatchedParticles = 0;
    }

    getDiagnostics(): SimulationBackendDiagnostics {
        return {...this.diagnostics};
    }
}

class GpuSimulationBackendAdapter implements SimulationBackendAdapter {
    private static readonly WORKGROUP_SIZE = 64;
    kind = SimulationBackend.GPU;
    private readonly scene: Scene;
    private computeShader?: ComputeShader;
    private positionsBuffer?: StorageBuffer;
    private velocitiesBuffer?: StorageBuffer;
    private agesBuffer?: StorageBuffer;
    private paramsBuffer?: StorageBuffer;
    private capacity = 0;
    private positionsUpload = new Float32Array(0);
    private velocitiesUpload = new Float32Array(0);
    private agesUpload = new Float32Array(0);
    private readonly paramsUpload = new Float32Array(4);
    private diagnostics: SimulationBackendDiagnostics = {
        supported: false,
        probeMode: true,
        eligibleSystems: 0,
        dispatchedSystems: 0,
        dispatchedParticles: 0,
        lastDispatchMs: 0,
        notes: 'GPU simulation probe mode is unavailable.',
    };

    constructor(scene: Scene) {
        this.scene = scene;
        this.diagnostics.supported = supportsGpuSimulation(scene);
        if (this.diagnostics.supported) {
            this.diagnostics.notes = 'GPU simulation probe mode enabled (compute dispatch + CPU fallback).';
        }
    }

    private isGpuEligibleSystem(system: IParticleSystem): boolean {
        const typedSystem = system as any;
        if (typedSystem.renderMode === RenderMode.Trail) {
            return false;
        }
        if (Array.isArray(typedSystem.behaviors) && typedSystem.behaviors.length > 0) {
            return false;
        }
        return typeof typedSystem.particleNum === 'number' && typedSystem.particleNum > 0;
    }

    private ensureGpuResources(requiredParticles: number) {
        if (!this.diagnostics.supported) {
            return;
        }
        const engine = this.scene.getEngine() as any;
        if (!this.computeShader) {
            this.computeShader = new ComputeShader(
                'quarksGpuSimulationProbe',
                engine,
                {
                    computeSource: `
struct BufferData {
    values: array<vec4<f32>>;
};
@group(0) @binding(0) var<storage, read_write> positions: BufferData;
@group(0) @binding(1) var<storage, read> velocities: BufferData;
@group(0) @binding(2) var<storage, read_write> ages: BufferData;
@group(0) @binding(3) var<storage, read> params: BufferData;

@compute @workgroup_size(${GpuSimulationBackendAdapter.WORKGROUP_SIZE}, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let index = id.x;
    let count = u32(params.values[0].y);
    if (index >= count) {
        return;
    }
    let delta = params.values[0].x;
    let velocity = velocities.values[index];
    let position = positions.values[index];
    let speedModifier = velocity.w;
    positions.values[index] = vec4<f32>(position.xyz + velocity.xyz * delta * speedModifier, position.w);
    let ageData = ages.values[index];
    ages.values[index] = vec4<f32>(ageData.x + delta, ageData.y, ageData.z, ageData.w);
}
                    `,
                },
                {
                    bindingsMapping: {
                        positions: {group: 0, binding: 0},
                        velocities: {group: 0, binding: 1},
                        ages: {group: 0, binding: 2},
                        params: {group: 0, binding: 3},
                    },
                }
            );
        }

        if (requiredParticles <= this.capacity) {
            return;
        }
        let newCapacity = this.capacity > 0 ? this.capacity : 1024;
        while (newCapacity < requiredParticles) {
            newCapacity *= 2;
        }
        const byteSize = newCapacity * 16;
        const creationFlags = Constants.BUFFER_CREATIONFLAG_READWRITE;

        this.positionsBuffer?.dispose();
        this.velocitiesBuffer?.dispose();
        this.agesBuffer?.dispose();
        this.paramsBuffer?.dispose();

        this.positionsBuffer = new StorageBuffer(engine, byteSize, creationFlags, 'quarks-probe-positions');
        this.velocitiesBuffer = new StorageBuffer(engine, byteSize, creationFlags, 'quarks-probe-velocities');
        this.agesBuffer = new StorageBuffer(engine, byteSize, creationFlags, 'quarks-probe-ages');
        this.paramsBuffer = new StorageBuffer(engine, 16, creationFlags, 'quarks-probe-params');

        this.computeShader?.setStorageBuffer('positions', this.positionsBuffer);
        this.computeShader?.setStorageBuffer('velocities', this.velocitiesBuffer);
        this.computeShader?.setStorageBuffer('ages', this.agesBuffer);
        this.computeShader?.setStorageBuffer('params', this.paramsBuffer);

        this.positionsUpload = new Float32Array(newCapacity * 4);
        this.velocitiesUpload = new Float32Array(newCapacity * 4);
        this.agesUpload = new Float32Array(newCapacity * 4);
        this.capacity = newCapacity;
    }

    private dispatchGpuProbeForSystem(system: IParticleSystem, delta: number): boolean {
        if (!this.computeShader || !this.positionsBuffer || !this.velocitiesBuffer || !this.agesBuffer || !this.paramsBuffer) {
            return false;
        }
        const typedSystem = system as any;
        const particleCount = typedSystem.particleNum as number;
        const particles = typedSystem.particles as any[];
        for (let index = 0; index < particleCount; index++) {
            const particle = particles[index] as any;
            const offset = index * 4;
            this.positionsUpload[offset] = particle.position.x;
            this.positionsUpload[offset + 1] = particle.position.y;
            this.positionsUpload[offset + 2] = particle.position.z;
            this.positionsUpload[offset + 3] = 0;
            this.velocitiesUpload[offset] = particle.velocity.x;
            this.velocitiesUpload[offset + 1] = particle.velocity.y;
            this.velocitiesUpload[offset + 2] = particle.velocity.z;
            this.velocitiesUpload[offset + 3] = particle.speedModifier ?? 1;
            this.agesUpload[offset] = particle.age;
            this.agesUpload[offset + 1] = particle.life;
            this.agesUpload[offset + 2] = 0;
            this.agesUpload[offset + 3] = 0;
        }

        const byteLength = particleCount * 16;
        this.positionsBuffer.update(this.positionsUpload, 0, byteLength);
        this.velocitiesBuffer.update(this.velocitiesUpload, 0, byteLength);
        this.agesBuffer.update(this.agesUpload, 0, byteLength);
        this.paramsUpload[0] = delta;
        this.paramsUpload[1] = particleCount;
        this.paramsUpload[2] = 0;
        this.paramsUpload[3] = 0;
        this.paramsBuffer.update(this.paramsUpload, 0, 16);

        if (!this.computeShader.isReady()) {
            return false;
        }
        const groupCount = Math.max(1, Math.ceil(particleCount / GpuSimulationBackendAdapter.WORKGROUP_SIZE));
        return this.computeShader.dispatch(groupCount, 1, 1);
    }

    updateSystems(systems: Iterable<IParticleSystem>, delta: number): void {
        let eligibleSystems = 0;
        let dispatchedSystems = 0;
        let dispatchedParticles = 0;
        const dispatchStart = this.diagnostics.supported ? performance.now() : 0;
        for (const particleSystem of systems) {
            (particleSystem as any).update(delta);
            if (!this.diagnostics.supported || !this.isGpuEligibleSystem(particleSystem)) {
                continue;
            }
            eligibleSystems++;
            this.ensureGpuResources(particleSystem.particleNum);
            if (this.dispatchGpuProbeForSystem(particleSystem, delta)) {
                dispatchedSystems++;
                dispatchedParticles += particleSystem.particleNum;
            }
        }
        this.diagnostics.eligibleSystems = eligibleSystems;
        this.diagnostics.dispatchedSystems = dispatchedSystems;
        this.diagnostics.dispatchedParticles = dispatchedParticles;
        this.diagnostics.lastDispatchMs = this.diagnostics.supported ? performance.now() - dispatchStart : 0;
    }

    getDiagnostics(): SimulationBackendDiagnostics {
        return {...this.diagnostics};
    }
}

function supportsGpuSimulation(scene: Scene): boolean {
    return scene.getEngine()?.getCaps?.().supportComputeShaders ?? false;
}

export function resolveSimulationBackend(
    scene: Scene,
    requestedBackend: SimulationBackend
): {adapter: SimulationBackendAdapter; state: SimulationBackendState} {
    if (requestedBackend === SimulationBackend.GPU) {
        if (supportsGpuSimulation(scene)) {
            return {
                adapter: new GpuSimulationBackendAdapter(scene),
                state: {
                    requestedBackend,
                    activeBackend: SimulationBackend.GPU,
                },
            };
        }
        return {
            adapter: new CpuSimulationBackendAdapter(),
            state: {
                requestedBackend,
                activeBackend: SimulationBackend.CPU,
                fallbackReason: 'GPU simulation backend is not available on the active engine.',
            },
        };
    }

    return {
        adapter: new CpuSimulationBackendAdapter(),
        state: {
            requestedBackend,
            activeBackend: SimulationBackend.CPU,
        },
    };
}
