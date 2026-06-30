import {Node} from '@babylonjs/core/node';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {ParticleEmitter} from './ParticleEmitter';
import {ParticleSystem} from './ParticleSystem';
import {BatchedRenderer} from './BatchedRenderer';
import {IParticleSystem} from 'quarks.core';

export class QuarksUtil {
    /**
     * Scales a loaded effect (or any emitter subtree) by an explicit factor, e.g. 0.5 = half size.
     * worldSpace systems bake scale into each particle at spawn time, so already-emitted particles
     * won't resize retroactively; this restarts them by default so every particle reflects the new scale.
     */
    static resizeEffect(root: TransformNode, scale: number | Vector3, options: {restart?: boolean} = {}): void {
        const scaleVector = typeof scale === 'number' ? new Vector3(scale, scale, scale) : scale;
        root.scaling.copyFrom(scaleVector);

        if (options.restart ?? true) {
            QuarksUtil.runOnAllParticleEmitters(root, (emitter) => {
                const system = emitter.system as ParticleSystem;
                if (system.worldSpace) {
                    system.restart();
                }
            });
        }
    }

    static runOnAllParticleEmitters(root: Node, callback: (emitter: ParticleEmitter) => void): void {
        QuarksUtil.traverseNode(root, (node) => {
            if (node instanceof ParticleEmitter) {
                callback(node);
            }
        });
    }

    static addToBatchRenderer(root: Node, batchRenderer: BatchedRenderer): void {
        QuarksUtil.runOnAllParticleEmitters(root, (emitter) => {
            batchRenderer.addSystem(emitter.system);
        });
    }

    static play(root: Node): void {
        QuarksUtil.runOnAllParticleEmitters(root, (emitter) => {
            (emitter.system as unknown as ParticleSystem).play();
        });
    }

    static stop(root: Node): void {
        QuarksUtil.runOnAllParticleEmitters(root, (emitter) => {
            (emitter.system as unknown as ParticleSystem).stop();
        });
    }

    static pause(root: Node): void {
        QuarksUtil.runOnAllParticleEmitters(root, (emitter) => {
            (emitter.system as unknown as ParticleSystem).pause();
        });
    }

    static restart(root: Node): void {
        QuarksUtil.runOnAllParticleEmitters(root, (emitter) => {
            (emitter.system as unknown as ParticleSystem).restart();
        });
    }

    static setAutoDestroy(root: Node, autoDestroy: boolean): void {
        QuarksUtil.runOnAllParticleEmitters(root, (emitter) => {
            (emitter.system as unknown as ParticleSystem).autoDestroy = autoDestroy;
        });
    }

    static endEmit(root: Node): void {
        QuarksUtil.runOnAllParticleEmitters(root, (emitter) => {
            (emitter.system as unknown as ParticleSystem).endEmit();
        });
    }

    private static traverseNode(node: Node, callback: (node: Node) => void): void {
        callback(node);
        const children = node.getChildren();
        for (const child of children) {
            QuarksUtil.traverseNode(child, callback);
        }
    }
}
