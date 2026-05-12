import {Scene} from '@babylonjs/core/scene';
import {IParticleSystem} from 'quarks.core';

export enum SimulationBackend {
    CPU = 'cpu',
    GPU = 'gpu',
}

export interface SimulationBackendState {
    requestedBackend: SimulationBackend;
    activeBackend: SimulationBackend;
    fallbackReason?: string;
}

export interface SimulationBackendAdapter {
    kind: SimulationBackend;
    updateSystems(systems: Iterable<IParticleSystem>, delta: number): void;
}

class CpuSimulationBackendAdapter implements SimulationBackendAdapter {
    kind = SimulationBackend.CPU;

    updateSystems(systems: Iterable<IParticleSystem>, delta: number): void {
        for (const particleSystem of systems) {
            (particleSystem as any).update(delta);
        }
    }
}

class GpuSimulationBackendAdapter implements SimulationBackendAdapter {
    kind = SimulationBackend.GPU;

    updateSystems(systems: Iterable<IParticleSystem>, delta: number): void {
        // Placeholder GPU backend: API-compatible path for future compute implementation.
        for (const particleSystem of systems) {
            (particleSystem as any).update(delta);
        }
    }
}

function supportsGpuSimulation(scene: Scene): boolean {
    const engineName = scene.getEngine()?.constructor?.name ?? '';
    return engineName.toLowerCase().includes('webgpu');
}

export function resolveSimulationBackend(
    scene: Scene,
    requestedBackend: SimulationBackend
): {adapter: SimulationBackendAdapter; state: SimulationBackendState} {
    if (requestedBackend === SimulationBackend.GPU) {
        if (supportsGpuSimulation(scene)) {
            return {
                adapter: new GpuSimulationBackendAdapter(),
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
