import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Node} from '@babylonjs/core/node';
import {EmitSubParticleSystem} from 'quarks.core';
import {BatchedRenderer} from './BatchedRenderer';
import {ParticleEmitter} from './ParticleEmitter';
import {ParticleSystem} from './ParticleSystem';

export class QuarksUtil {
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

    /**
     * True when every system under `root` is finished: non-looping ones that
     * ran their course, looping ones whose emission was ended (see
     * {@link endEmit}) and whose particles are gone. A looping system still
     * emitting keeps the effect unfinished.
     */
    static isEffectFinished(root: Node): boolean {
        let found = false;
        let finished = true;
        QuarksUtil.runOnAllParticleEmitters(root, (emitter) => {
            found = true;
            if (!(emitter.system as unknown as ParticleSystem).isFinished()) {
                finished = false;
            }
        });
        return found && finished;
    }

    /**
     * A deep copy of an effect: the node tree under `root` with every particle
     * system cloned, sub emitter links pointing at the copies, and the same
     * transforms and enabled state. The copy is not added to any renderer.
     * Nodes that are neither transform nodes nor emitters are skipped.
     */
    static instantiate(root: TransformNode, name?: string): TransformNode {
        const copies = new Map<ParticleEmitter, ParticleEmitter>();
        const copyNode = (node: Node, parent: TransformNode | null, copyName?: string): TransformNode | null => {
            let copy: TransformNode;
            if (node instanceof ParticleEmitter) {
                copy = node.clone(copyName);
                copies.set(node, copy as ParticleEmitter);
            } else if (node instanceof TransformNode) {
                copy = new TransformNode(copyName ?? node.name, node.getScene());
                copy.position.copyFrom(node.position);
                copy.rotation.copyFrom(node.rotation);
                copy.scaling.copyFrom(node.scaling);
                if (node.rotationQuaternion) {
                    copy.rotationQuaternion = node.rotationQuaternion.clone();
                }
                copy.setEnabled(node.isEnabled(false));
            } else {
                return null;
            }
            copy.parent = parent;
            for (const child of node.getChildren()) {
                copyNode(child, copy);
            }
            return copy;
        };
        const copy = copyNode(root, null, name) as TransformNode;
        // Sub emitter behaviors on the copies still target the original emitters.
        for (const emitter of copies.values()) {
            for (const behavior of (emitter.system as unknown as ParticleSystem).behaviors) {
                if (behavior instanceof EmitSubParticleSystem) {
                    const target = copies.get(behavior.subParticleSystem as unknown as ParticleEmitter);
                    if (target !== undefined) {
                        behavior.subParticleSystem = target as unknown as typeof behavior.subParticleSystem;
                    }
                }
            }
        }
        return copy;
    }

    private static traverseNode(node: Node, callback: (node: Node) => void): void {
        callback(node);
        const children = node.getChildren();
        for (const child of children) {
            QuarksUtil.traverseNode(child, callback);
        }
    }
}
