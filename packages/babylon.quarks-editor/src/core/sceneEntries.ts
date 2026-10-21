import type {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {BatchedRenderer, ParticleEmitter, ParticleSystem} from 'babylon.quarks';
import {QuarksUtil} from 'babylon.quarks';
import type {EffectAsset} from './assets.js';
import {EffectBinding} from './binding.js';
import {disposeLoadedEffect, parseEffectFromJson} from './loadEffect.js';

/**
 * One effect instance placed in the scene. Every instance is live (its systems are registered
 * with the renderer) and independent: dropping the same asset three times gives three entries
 * that are edited separately.
 */
export interface SceneEntry {
    name: string;
    /** Path of the asset it came from, or a synthetic `_created/…` path for new effects. */
    path: string;
    /** Asset this instance was made from, if any. */
    assetId: number | null;
    root: TransformNode;
    systems: ParticleSystem[];
}

/** `name`, or `name (2)`, `name (3)`… when an entry already uses it. */
export function uniqueEntryName(name: string, existing: SceneEntry[]): string {
    const taken = new Set(existing.map((entry) => entry.name));
    if (!taken.has(name)) {
        return name;
    }
    let n = 2;
    while (taken.has(`${name} (${n})`)) {
        n++;
    }
    return `${name} (${n})`;
}

function isPlaceholderName(name: string): boolean {
    return !name || name === 'Effect' || name === 'Object3D' || name === 'Group';
}

/**
 * Parses an asset into a new scene instance with its systems registered (paused). Returns null
 * when the JSON holds no particle systems.
 */
export function instantiateSceneEntry(
    scene: Scene,
    renderer: BatchedRenderer,
    asset: EffectAsset,
    existing: SceneEntry[]
): SceneEntry | null {
    const {root, systems} = parseEffectFromJson(scene, renderer, asset.json, {
        registerRenderer: true,
        autoplay: false,
    });
    if (systems.length === 0) {
        disposeLoadedEffect(root, systems, renderer, true);
        return null;
    }
    const name = uniqueEntryName(isPlaceholderName(root.name) ? asset.name : root.name, existing);
    root.name = name;
    root.parent = null;
    return {name, path: asset.path, assetId: asset.id, root, systems};
}

/** Builds an edit binding for one scene entry. */
export function bindingFromSceneEntry(entry: SceneEntry): EffectBinding {
    const main = entry.systems.find((s) => !s.onlyUsedByOther) ?? entry.systems[0];
    return new EffectBinding(
        main,
        entry.systems.filter((s) => s !== main),
        entry.root
    );
}

/**
 * Unregisters and disposes one scene entry — including systems the inspector added after the
 * entry was created, which only the live emitter tree knows about.
 */
export function disposeSceneEntry(entry: SceneEntry, renderer: BatchedRenderer): void {
    const systems = new Set<ParticleSystem>(entry.systems);
    QuarksUtil.runOnAllParticleEmitters(entry.root, (emitter: ParticleEmitter) => {
        systems.add(emitter.system as ParticleSystem);
    });
    disposeLoadedEffect(entry.root, [...systems], renderer, true);
}

/** Number of scene instances per asset id. */
export function countInstancesByAsset(entries: SceneEntry[]): Map<number, number> {
    const counts = new Map<number, number>();
    for (const entry of entries) {
        if (entry.assetId != null) {
            counts.set(entry.assetId, (counts.get(entry.assetId) ?? 0) + 1);
        }
    }
    return counts;
}
