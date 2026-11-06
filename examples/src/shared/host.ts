import type {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Scene} from '@babylonjs/core/scene';
import {type BatchedRenderer, type ParticleEmitter, type ParticleSystem, QuarksUtil} from 'babylon.quarks';
import type {DemoContext, DemoControls} from '../types';

/** Controls for a host without a panel: the demo keeps its initial values. */
export const NO_CONTROLS: DemoControls = {
    toggle() {},
    choice() {},
    button() {},
};

/** The longest frame the hosts simulate: a stalled tab resumes without a jump. */
export const MAX_FRAME = 0.05;

/** A demo's context in a scene the host has set up. */
export function createDemoContext(
    scene: Scene,
    camera: ArcRotateCamera,
    batchRenderer: BatchedRenderer,
    controls: DemoControls = NO_CONTROLS
): DemoContext {
    const systems: ParticleSystem[] = [];
    const add = (system: ParticleSystem) => {
        batchRenderer.addSystem(system);
        systems.push(system);
        return system;
    };
    return {
        scene,
        camera,
        batchRenderer,
        systems,
        controls,
        add,
        addEffect(root: TransformNode) {
            QuarksUtil.runOnAllParticleEmitters(root, (emitter: ParticleEmitter) => {
                systems.push(emitter.system as ParticleSystem);
            });
            QuarksUtil.addToBatchRenderer(root, batchRenderer);
            return root;
        },
    };
}

/**
 * The effects the demo runs, as trees: each system's emitter walked up to its top node below the
 * batch renderer. What "Open in editor" serializes.
 */
export function effectRoots(ctx: DemoContext): TransformNode[] {
    const roots = new Set<TransformNode>();
    for (const system of ctx.systems) {
        let node: TransformNode = system.emitter;
        while (node.parent && node.parent !== ctx.batchRenderer) {
            node = node.parent as TransformNode;
        }
        roots.add(node);
    }
    return [...roots];
}

/** The particles alive in the demo now. */
export function particleCount(ctx: DemoContext): number {
    let count = 0;
    for (const system of ctx.systems) {
        count += system.particleNum;
    }
    return count;
}
