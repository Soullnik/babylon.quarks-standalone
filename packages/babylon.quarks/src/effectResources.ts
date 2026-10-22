import type {Material} from '@babylonjs/core/Materials/material';
import type {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Node} from '@babylonjs/core/node';

/** What an effect root owns: the textures it holds a count on, and the materials made for it alone. */
interface EffectResources {
    textures: Set<BaseTexture>;
    materials: Material[];
}

const owned = new WeakMap<Node, EffectResources>();
/** How many effect roots hold each texture. */
const holders = new WeakMap<BaseTexture, number>();

/**
 * Records that `root` uses `textures` and owns `materials`. They are freed when the root is
 * disposed, however that happens: {@link disposeEffect}, `root.dispose()`, a parent's dispose or
 * the scene's.
 */
export function retainEffectResources(
    root: TransformNode,
    textures: Iterable<BaseTexture>,
    materials: Material[]
): void {
    if (owned.has(root)) {
        return;
    }
    const resources: EffectResources = {textures: new Set(textures), materials};
    for (const texture of resources.textures) {
        holders.set(texture, (holders.get(texture) ?? 0) + 1);
    }
    owned.set(root, resources);
    root.onDisposeObservable.addOnce(() => releaseEffectResources(root));
}

/**
 * Gives `copy` a hold on the textures the effect `source` belongs to holds, as a copy of the
 * effect, or of a node in it, draws with them too.
 */
export function shareEffectResources(source: TransformNode, copy: TransformNode): void {
    for (let node: Node | null = source; node !== null; node = node.parent) {
        const resources = owned.get(node);
        if (resources !== undefined) {
            retainEffectResources(copy, resources.textures, []);
            return;
        }
    }
}

function releaseEffectResources(root: Node): void {
    const resources = owned.get(root);
    if (resources === undefined) {
        return;
    }
    owned.delete(root);
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

/**
 * Disposes an effect root and its nodes and systems, the materials made for it, and each texture it
 * holds once no other effect root holds it. A root nothing was recorded for is only disposed.
 */
export function disposeEffect(root: TransformNode): void {
    root.dispose();
    // A root disposed earlier, before its hold was recorded, still lets go.
    releaseEffectResources(root);
}
