import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {ParticleEmitter, ParticleSystem, QuarksLoader} from 'babylon.quarks';
import type {DemoContext} from '../types';

const EXPLOSION_REFRESH_TIME = 2;

export async function init({scene, camera, batchRenderer, systems, demoState}: DemoContext) {
    camera.setPosition(new BVector3(0, 10, 15));

    const loader = new QuarksLoader(scene, {baseUrl: ''});
    const effect = await loader.load('ps.json');
    effect.parent = batchRenderer;
    const trackedSystems: ParticleSystem[] = [];
    const traverse = (node: TransformNode) => {
        if (node instanceof ParticleEmitter) {
            batchRenderer.addSystem(node.system);
            const system = node.system as ParticleSystem;
            systems.push(system);
            trackedSystems.push(system);
            system.looping = false;
            system.restart();
            system.play();
        }
        for (const child of node.getChildren()) {
            traverse(child as TransformNode);
        }
    };
    traverse(effect);
    demoState.explosion = {elapsed: 0, systems: trackedSystems};
}

export function update({demoState}: DemoContext, delta: number) {
    const state = demoState.explosion;
    if (!state?.systems?.length) {
        return;
    }
    state.elapsed += delta;
    if (state.elapsed >= EXPLOSION_REFRESH_TIME) {
        state.elapsed = 0;
        for (const system of state.systems) {
            system.restart();
            system.play();
        }
    }
}
