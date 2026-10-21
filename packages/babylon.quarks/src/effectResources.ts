import type {Material} from '@babylonjs/core/Materials/material';
import type {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';

/** What an effect root owns: the textures it holds a count on, and the materials made for it alone. */
interface EffectResources {
    textures: Set<BaseTexture>;
    materials: Material[];
}

const owned = new WeakMap<TransformNode, EffectResources>();
/** How many effect roots hold each texture. */
const holders = new WeakMap<BaseTexture, number>();

/** Records that `root` uses `textures` and owns `materials`, so {@link disposeEffect} can free them. */
export function retainEffectResources(
    root: TransformNode,
    textures: Iterable<BaseTexture>,
    materials: Material[]
): void {
    const resources: EffectResources = {textures: new Set(textures), materials};
    for (const texture of resources.textures) {
        holders.set(texture, (holders.get(texture) ?? 0) + 1);
    }
    owned.set(root, resources);
}

/** Gives `copy` a hold on the textures `source` holds, as a copy of the effect draws with them too. */
export function shareEffectResources(source: TransformNode, copy: TransformNode): void {
    const resources = owned.get(source);
    if (resources !== undefined) {
        retainEffectResources(copy, resources.textures, []);
    }
}

/**
 * Disposes an effect root and its nodes and systems, the materials made for it, and each texture it
 * holds once no other effect root holds it. A root nothing was recorded for is only disposed.
 */
export function disposeEffect(root: TransformNode): void {
    const resources = owned.get(root);
    owned.delete(root);
    root.dispose();
    if (resources === undefined) {
        return;
    }
    for (const material of resources.materials) {
        material.dispose();
    }
    for (const texture of resources.textures) {
        const count = (holders.get(texture) ?? 1) - 1;
        if (count > 0) {
            holders.set(texture, count);
        } else {
            holders.delete(texture);
            texture.dispose();
        }
    }
}
