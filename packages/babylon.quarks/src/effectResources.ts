import type {Material} from '@babylonjs/core/Materials/material';
import type {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Node} from '@babylonjs/core/node';

/** What an effect root holds a count on: the textures it draws with and the materials made for the effect. */
interface EffectResources {
    textures: Set<BaseTexture>;
    materials: Set<Material>;
}

const owned = new WeakMap<Node, EffectResources>();
/** How many effect roots hold each texture and material. */
const holders = new WeakMap<BaseTexture | Material, number>();

/**
 * Records that `root` uses `textures` and the `materials` made for the effect. Each is freed once
 * the last root holding it is disposed, however that happens: {@link disposeEffect},
 * `root.dispose()`, a parent's dispose or the scene's.
 */
export function retainEffectResources(
    root: TransformNode,
    textures: Iterable<BaseTexture>,
    materials: Iterable<Material>
): void {
    if (owned.has(root)) {
        return;
    }
    const resources: EffectResources = {textures: new Set(textures), materials: new Set(materials)};
    for (const resource of [...resources.textures, ...resources.materials]) {
        holders.set(resource, (holders.get(resource) ?? 0) + 1);
    }
    owned.set(root, resources);
    root.onDisposeObservable.addOnce(() => releaseEffectResources(root));
}

/**
 * Gives `copy` a hold on the textures and materials the effect `source` belongs to holds, as a
 * copy of the effect, or of a node in it, draws with them too.
 */
export function shareEffectResources(source: TransformNode, copy: TransformNode): void {
    for (let node: Node | null = source; node !== null; node = node.parent) {
        const resources = owned.get(node);
        if (resources !== undefined) {
            retainEffectResources(copy, resources.textures, resources.materials);
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
    for (const resource of [...resources.materials, ...resources.textures]) {
        const count = (holders.get(resource) ?? 1) - 1;
        if (count > 0) {
            holders.set(resource, count);
        } else {
            holders.delete(resource);
            resource.dispose();
        }
    }
}

/**
 * Disposes an effect root and its nodes and systems, and each material and texture it holds once no
 * other effect root holds it. A root nothing was recorded for is only disposed.
 */
export function disposeEffect(root: TransformNode): void {
    root.dispose();
    // A root disposed earlier, before its hold was recorded, still lets go.
    releaseEffectResources(root);
}
