import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Node} from '@babylonjs/core/node';
import {ConstantValue, EmitSubParticleSystem, FunctionValueGenerator, IntervalValue, ValueGenerator} from 'quarks.core';
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

    /**
     * Seconds until the effect under `root` is over when it plays from the
     * start: for each system its start delay, its duration and its longest
     * particle life, divided by its playback speed; a sub emitter target goes
     * on emitting for its own duration after the last of its parents' particles
     * and ends a particle life after that, wherever it sits in the scene.
     * Infinity when a system loops, since such an effect only ends on
     * {@link endEmit}, or when one is frozen at playback speed 0.
     *
     * Random values count at their maximum, so this is an upper bound; curves
     * are sampled. Particles cut short by collisions or culling only make the
     * real effect shorter.
     */
    static getDuration(root: Node): number {
        const systems: ParticleSystem[] = [];
        QuarksUtil.runOnAllParticleEmitters(root, (emitter) => {
            systems.push(emitter.system as unknown as ParticleSystem);
        });
        const parents = new Map<ParticleSystem, ParticleSystem[]>();
        // Grows while it is walked: a target outside `root` is part of the effect too.
        for (let i = 0; i < systems.length; i++) {
            const system = systems[i];
            for (const behavior of system.behaviors) {
                if (!(behavior instanceof EmitSubParticleSystem)) {
                    continue;
                }
                const target = (behavior.subParticleSystem as unknown as ParticleEmitter | undefined)?.system as
                    | ParticleSystem
                    | undefined;
                if (target !== undefined && typeof target === 'object') {
                    if (!systems.includes(target)) {
                        systems.push(target);
                    }
                    const list = parents.get(target) ?? [];
                    list.push(system);
                    parents.set(target, list);
                }
            }
        }
        const ends = new Map<ParticleSystem, number>();
        const endOf = (system: ParticleSystem): number => {
            const known = ends.get(system);
            if (known !== undefined) {
                return known;
            }
            // Marks the system while it is resolved, so a sub emitter cycle loops forever rather than the stack.
            ends.set(system, Infinity);
            const speed = system.playbackSpeed;
            const life = QuarksUtil.maxOf(system.startLife) / speed;
            let end: number;
            if (!(speed > 0)) {
                end = Infinity;
            } else if (system.onlyUsedByOther) {
                end = 0;
                for (const parent of parents.get(system) ?? []) {
                    end = Math.max(end, endOf(parent));
                }
                end += system.duration / speed + life;
            } else if (system.looping) {
                end = Infinity;
            } else {
                // The delay is drawn once, at the start.
                end = (QuarksUtil.maxOf(system.startDelay, 0) + system.duration) / speed + life;
            }
            ends.set(system, end);
            return end;
        };
        let duration = 0;
        for (const system of systems) {
            duration = Math.max(duration, endOf(system));
        }
        return duration;
    }

    /** The largest value `generator` gives: exact for constants and intervals, sampled otherwise. */
    private static maxOf(generator: ValueGenerator | FunctionValueGenerator, at?: number): number {
        if (generator instanceof ConstantValue) {
            return generator.value;
        }
        if (generator instanceof IntervalValue) {
            return Math.max(generator.a, generator.b);
        }
        let max = -Infinity;
        const samples = 32;
        for (let i = 0; i <= samples; i++) {
            const memory: number[] = [];
            generator.startGen(memory);
            const value =
                generator.type === 'function'
                    ? generator.genValue(memory, at ?? i / samples)
                    : generator.genValue(memory);
            max = Math.max(max, value);
        }
        return max;
    }

    private static traverseNode(node: Node, callback: (node: Node) => void): void {
        callback(node);
        const children = node.getChildren();
        for (const child of children) {
            QuarksUtil.traverseNode(child, callback);
        }
    }
}
