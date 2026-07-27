import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {ParticleSystem} from 'babylon.quarks';
import type {EffectTreeNode} from './effectTree';
import {buildEffectTree, serializeEffectTree} from './effectTree';

export type EditorListener = () => void;

/**
 * Headless edit-model over a live ParticleSystem: mutate through apply() so every
 * change notifies subscribers (React UI, save indicators, hosts like BabylonJS Editor).
 */
export class EffectBinding {
    /** Not `readonly` — `promoteToMain` reassigns this when the current main system is removed. */
    system: ParticleSystem;
    /** Systems spawned by sub-emitter behaviors; serialized as children of the root emitter. */
    readonly subSystems: ParticleSystem[] = [];
    /** Loaded scene root of the whole effect (Group tree); defaults to the system's emitter. */
    readonly root: TransformNode;
    /** Invoked before any mutation — used by EffectHistory to capture undo snapshots. */
    onBeforeChange?: () => void;
    private listeners = new Set<EditorListener>();
    private revision = 0;

    constructor(system: ParticleSystem, subSystems: ParticleSystem[] = [], root?: TransformNode) {
        this.system = system;
        this.subSystems.push(...subSystems);
        this.root = root ?? system.emitter;
    }

    /** Editor hierarchy tree (groups + emitters) rooted at this effect's scene root. */
    getTree(): EffectTreeNode {
        return buildEffectTree(this.root);
    }

    subscribe(listener: EditorListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Monotonic change counter, usable as a React external-store snapshot. */
    getRevision(): number {
        return this.revision;
    }

    apply(mutate: (system: ParticleSystem) => void): void {
        this.onBeforeChange?.();
        mutate(this.system);
        this.notify();
    }

    addSubSystem(sub: ParticleSystem): void {
        this.subSystems.push(sub);
        this.notify();
    }

    removeSubSystem(sub: ParticleSystem): void {
        const index = this.subSystems.indexOf(sub);
        if (index >= 0) {
            this.subSystems.splice(index, 1);
        }
        this.notify();
    }

    /**
     * Swaps which system is "main" — used when the current `system` is about to be removed
     * but other top-level systems remain. Being "main" vs. a sub-system is otherwise
     * meaningless to the effect itself (both play/restart/export the same way); it only
     * exists so there's always a designated fallback system to select.
     */
    promoteToMain(next: ParticleSystem): void {
        const index = this.subSystems.indexOf(next);
        if (index < 0) {
            return;
        }
        this.subSystems.splice(index, 1, this.system);
        this.system = next;
        this.notify();
    }

    private notify(): void {
        this.revision++;
        for (const listener of this.listeners) {
            listener();
        }
    }

    restart(): void {
        // onlyUsedByOther systems skip self-emission in update(); play() only unpauses sim.
        for (const system of [this.system, ...this.subSystems]) {
            system.restart();
            system.play();
        }
    }

    /**
     * Serializes the effect into the Quarks JSON envelope understood by QuarksLoader,
     * preserving the loaded group/emitter hierarchy.
     */
    exportJSON(name = 'effect'): string {
        return serializeEffectTree(this.root, name);
    }
}
