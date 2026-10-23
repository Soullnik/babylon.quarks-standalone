import type {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import type {ParticleSystem} from 'babylon.quarks';
import type {EffectTreeNode} from './effectTree.js';
import {buildEffectTree, serializeEffectTree} from './effectTree.js';

/** Called after every change made through an {@link EffectBinding}. */
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

    /** Calls `listener` after every change; returns the call that stops it. */
    subscribe(listener: EditorListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Monotonic change counter, usable as a React external-store snapshot. */
    getRevision(): number {
        return this.revision;
    }

    /**
     * Changes the main system through `mutate`: takes an undo snapshot first, then notifies
     * subscribers. Every inspector edit goes through here.
     */
    apply(mutate: (system: ParticleSystem) => void): void {
        this.onBeforeChange?.();
        mutate(this.system);
        this.notify();
    }

    /** Adds a system to the effect's sub systems. */
    addSubSystem(sub: ParticleSystem): void {
        this.subSystems.push(sub);
        this.notify();
    }

    /** Removes a system from the effect's sub systems; a system it does not have is ignored. */
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

    /**
     * Notifies subscribers of a change made outside `apply()` — e.g. a transform edited by the
     * gizmo, or a sub-system edited through its own nested binding.
     */
    markChanged(): void {
        this.notify();
    }

    private notify(): void {
        this.revision++;
        for (const listener of this.listeners) {
            listener();
        }
    }

    /** Restarts every system of the effect from time 0. */
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
