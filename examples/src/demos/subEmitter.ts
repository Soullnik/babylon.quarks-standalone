import type { DemoContext } from '../types';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {QuarksLoader, ParticleEmitter, ParticleSystem} from 'babylon.quarks';

async function loadEffectAndAttach({
    scene,
    batchRenderer,
    systems,
    path,
    positionX,
    scale,
    trackedSystems,
}: {
    scene: DemoContext['scene'];
    batchRenderer: DemoContext['batchRenderer'];
    systems: DemoContext['systems'];
    path: string;
    positionX: number;
    scale?: number;
    trackedSystems: ParticleSystem[];
}) {
    const loader = new QuarksLoader(scene, {baseUrl: ''});
    const effect = await loader.load(path);
    effect.parent = batchRenderer;
    effect.position.x = positionX;
    if (scale !== undefined) {
        effect.scaling.setAll(scale);
    }
    const traverse = (node: TransformNode) => {
        if (node instanceof ParticleEmitter) {
            const system = node.system as ParticleSystem;
            batchRenderer.addSystem(system);
            systems.push(system);
            system.play();
            trackedSystems.push(system);
        }
        for (const child of node.getChildren()) {
            traverse(child as TransformNode);
        }
    };
    traverse(effect);
}

export async function init({scene, camera, batchRenderer, systems, demoState}: DemoContext) {
    camera.setPosition(new BVector3(0, 8, 18));
    const trackedSystems: ParticleSystem[] = [];
    await loadEffectAndAttach({scene, batchRenderer, systems, path: 'AcidBoiling.json', positionX: -5, scale: 2, trackedSystems});
    await loadEffectAndAttach({scene, batchRenderer, systems, path: 'subEmitter2.json', positionX: 5, trackedSystems});
    demoState.subEmitter = {elapsed: 0, trackedSystems};
}

export function update({demoState}: DemoContext, delta: number) {
    const state = demoState.subEmitter;
    if (!state?.trackedSystems?.length) {
        return;
    }
    state.elapsed += delta;
    if (state.elapsed >= 2) {
        state.elapsed = 0;
        for (const system of state.trackedSystems) {
            system.restart();
            system.play();
        }
    }
}
