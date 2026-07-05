import type {ParticleSystem} from 'babylon.quarks';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {buildEffectTree, serializeEffectTree} from './effectTree';
import type {EffectTreeNode} from './effectTree';

export type EditorListener = () => void;

/**
 * Headless edit-model over a live ParticleSystem: mutate through apply() so every
 * change notifies subscribers (React UI, save indicators, hosts like BabylonJS Editor).
 */
export class EffectBinding {
    readonly system: ParticleSystem;
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

    private notify(): void {
        this.revision++;
        for (const listener of this.listeners) {
            listener();
        }
    }

    restart(): void {
        // Replay every independent system; sub-emitter targets (onlyUsedByOther) are only
        // reset — their parents re-drive them, so playing them directly would double-emit.
        for (const system of [this.system, ...this.subSystems]) {
            system.restart();
            if (!system.onlyUsedByOther) {
                system.play();
            }
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
