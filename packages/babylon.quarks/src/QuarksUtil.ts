import {InstancedMesh} from '@babylonjs/core/Meshes/instancedMesh';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Node} from '@babylonjs/core/node';
import {ConstantValue, EmitSubParticleSystem, FunctionValueGenerator, IntervalValue, ValueGenerator} from 'quarks.core';
import {BatchedRenderer} from './BatchedRenderer';
import {shareEffectResources} from './effectResources';
import {MeshSurfaceEmitter} from './MeshSurfaceEmitter';
import {ParticleEmitter} from './ParticleEmitter';
import {ParticleSystem} from './ParticleSystem';

/**
 * Helpers that act on a whole effect: every particle system under a root node, as a loaded effect
 * or a hand-built tree has them.
 */
export class QuarksUtil {
    /** Calls `callback` on `root` and every node under it that is a {@link ParticleEmitter}. */
    static runOnAllParticleEmitters(root: Node, callback: (emitter: ParticleEmitter) => void): void {
        QuarksUtil.traverseNode(root, (node) => {
            if (node instanceof ParticleEmitter) {
                callback(node);
            }
        });
    }

    /** Adds every system under `root` to `batchRenderer`. */
    static addToBatchRenderer(root: Node, batchRenderer: BatchedRenderer): void {
        QuarksUtil.runOnAllParticleEmitters(root, (emitter) => {
            batchRenderer.addSystem(emitter.system);
        });
    }

    /**
     * Plays every system under `root`, see {@link ParticleSystem.play}: paused ones resume and
     * finished ones, a short burst inside a longer effect included, start over.
     */
    static play(root: Node): void {
        QuarksUtil.runOnAllParticleEmitters(root, (emitter) => {
            (emitter.system as unknown as ParticleSystem).play();
        });
    }

    /**
     * Undoes {@link pause} on every system under `root`, see {@link ParticleSystem.resume}: the
     * finished ones stay finished.
     */
    static resume(root: Node): void {
        QuarksUtil.runOnAllParticleEmitters(root, (emitter) => {
            (emitter.system as unknown as ParticleSystem).resume();
        });
    }

    /** Clears, rewinds and pauses every system under `root`, see {@link ParticleSystem.stop}. */
    static stop(root: Node): void {
        QuarksUtil.runOnAllParticleEmitters(root, (emitter) => {
            (emitter.system as unknown as ParticleSystem).stop();
        });
    }

    /** Pauses every system under `root`, see {@link ParticleSystem.pause}. */
    static pause(root: Node): void {
        QuarksUtil.runOnAllParticleEmitters(root, (emitter) => {
            (emitter.system as unknown as ParticleSystem).pause();
        });
    }

    /** Restarts every system under `root` from the beginning, see {@link ParticleSystem.restart}. */
    static restart(root: Node): void {
        QuarksUtil.runOnAllParticleEmitters(root, (emitter) => {
            (emitter.system as unknown as ParticleSystem).restart();
        });
    }

    /** Sets {@link ParticleSystem.autoDestroy} on every system under `root`. */
    static setAutoDestroy(root: Node, autoDestroy: boolean): void {
        QuarksUtil.runOnAllParticleEmitters(root, (emitter) => {
            (emitter.system as unknown as ParticleSystem).autoDestroy = autoDestroy;
        });
    }

    /** Ends emission on every system under `root` and lets the particles die out, see {@link ParticleSystem.endEmit}. */
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
     * transforms and enabled state. Meshes are cloned as meshes that share
     * the source's geometry and material, instances of a mesh in the tree as
     * instances of its copy, and a mesh surface shape that emits from a mesh
     * in the tree emits from its copy. An instance of a mesh outside the tree
     * stays an instance of that mesh, and goes when it is disposed. The copy holds the
     * source's textures and materials, so disposing the source leaves the copy
     * whole. It is not added to any renderer. Nodes that are neither transform
     * nodes nor emitters, such as lights and cameras, are skipped.
     */
    static instantiate(root: TransformNode, name?: string): TransformNode {
        const copies = new Map<ParticleEmitter, ParticleEmitter>();
        const meshCopies = new Map<Node, Mesh>();
        const inTree = new Set<Node>([root, ...root.getDescendants(false)]);
        // A mesh is copied when first needed: where it sits in the tree, or earlier, as the source
        // of an instance copied before it. Its children are copied as every node's are.
        const meshCopyOf = (mesh: Mesh): Mesh => {
            let copy = meshCopies.get(mesh);
            if (copy === undefined) {
                copy = mesh.clone(mesh.name, null, true);
                copy.setEnabled(mesh.isEnabled(false));
                meshCopies.set(mesh, copy);
            }
            return copy;
        };
        const copyNode = (node: Node, parent: TransformNode | null, copyName?: string): TransformNode | null => {
            let copy: TransformNode;
            if (node instanceof ParticleEmitter) {
                copy = node.clone(copyName);
                copies.set(node, copy as ParticleEmitter);
            } else if (node instanceof Mesh) {
                copy = meshCopyOf(node);
                if (copyName !== undefined) {
                    copy.name = copyName;
                }
            } else if (node instanceof InstancedMesh) {
                // An instance of a mesh in the tree becomes an instance of its copy, so the copy
                // does not go when the source effect is disposed (a mesh disposes its instances).
                const source = inTree.has(node.sourceMesh) ? meshCopyOf(node.sourceMesh) : undefined;
                copy = node.clone(copyName ?? node.name, null, true, source)!;
                copy.setEnabled(node.isEnabled(false));
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
        // The copy draws with the source's textures and materials, so disposeEffect(source) keeps them.
        shareEffectResources(root, copy);
        for (const emitter of copies.values()) {
            const system = emitter.system as unknown as ParticleSystem;
            // Sub emitter behaviors on the copies still target the original emitters.
            for (const behavior of system.behaviors) {
                if (behavior instanceof EmitSubParticleSystem) {
                    const target = copies.get(behavior.subParticleSystem as unknown as ParticleEmitter);
                    if (target !== undefined) {
                        behavior.subParticleSystem = target as unknown as typeof behavior.subParticleSystem;
                    }
                }
            }
            // So does a mesh surface shape: it emits from the copy of its mesh when the tree has one.
            const shape = system.emitterShape;
            if (shape instanceof MeshSurfaceEmitter && shape.mesh !== undefined) {
                const meshCopy = meshCopies.get(shape.mesh);
                if (meshCopy !== undefined) {
                    shape.mesh = meshCopy;
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
     * are sampled. A runtime {@link ParticleSystem.timeDilation} is not counted:
     * this is the effect's own length. Particles cut short by collisions or culling only make the
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
