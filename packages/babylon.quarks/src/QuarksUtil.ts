import {Node} from '@babylonjs/core/node';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {ParticleEmitter} from './ParticleEmitter';
import {ParticleSystem} from './ParticleSystem';
import {BatchedRenderer} from './BatchedRenderer';
import {IParticleSystem} from 'quarks.core';

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

    private static traverseNode(node: Node, callback: (node: Node) => void): void {
        callback(node);
        const children = node.getChildren();
        for (const child of children) {
            QuarksUtil.traverseNode(child, callback);
        }
    }
}
