import {ParticleEmitter, QuarksLoader, QuarksUtil} from 'babylon.quarks';
import type {BatchedRenderer, ParticleSystem} from 'babylon.quarks';
import type {Scene} from '@babylonjs/core/scene';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Node} from '@babylonjs/core/node';

/** `ParticleEmitter`'s constructor default (see babylon.quarks/src/ParticleEmitter.ts) — the
 * name every emitter gets when the source JSON didn't give it one of its own. */
const DEFAULT_EMITTER_NAME = 'particleEmitter';

function hasMeaningfulName(node: TransformNode): boolean {
    return !!node.name && node.name !== DEFAULT_EMITTER_NAME;
}

function groupChildren(node: TransformNode): TransformNode[] {
    return node.getChildren().filter((c): c is TransformNode => c instanceof TransformNode);
}

/** Reparents `only` onto `parent`, transferring the outgoing node's name if `only` doesn't
 * already have a meaningful one of its own, then disposes the now-empty wrapper. World
 * transform is preserved via `setParent`. */
function collapseInto(wrapper: TransformNode, only: TransformNode, parent: Node | null): void {
    if (!hasMeaningfulName(only) && hasMeaningfulName(wrapper)) {
        only.name = wrapper.name;
    }
    only.setParent(parent);
    wrapper.dispose(true, false);
}

/**
 * Collapses redundant organizational groups left over by importers — Unity's
 * one-GameObject-per-component convention turns every visual layer into its own Group, so a
 * single particle system becomes "Sparks" > unnamed emitter, and a component quarks doesn't
 * understand (e.g. a Light) becomes an empty Group with nothing under it. Recurses
 * bottom-up so nested wrapper chains collapse all the way down. The tree root itself is
 * handled separately by `promoteIfSingleChildRoot`, since collapsing it means returning a
 * different node as the effect's root.
 */
function flattenRedundantGroups(node: TransformNode): void {
    for (const child of node.getChildren()) {
        if (child instanceof TransformNode) {
            flattenRedundantGroups(child);
        }
    }
    if (node instanceof ParticleEmitter || !node.parent) {
        return;
    }
    const children = groupChildren(node);
    if (children.length === 0) {
        node.dispose(true, false);
        return;
    }
    if (children.length !== 1) {
        return;
    }
    const only = children[0];
    if (only instanceof ParticleEmitter && only.getChildren().length > 0) {
        return;
    }
    collapseInto(node, only, node.parent);
}

/** If the tree root itself only ever wraps a single child (after `flattenRedundantGroups`
 * has settled everything below it), that wrapper adds a tree level with nothing to organize —
 * promote the child to be the new root instead. Loops in case that child is, in turn, also a
 * single-child wrapper. */
function promoteIfSingleChildRoot(root: TransformNode): TransformNode {
    let current = root;
    while (!(current instanceof ParticleEmitter)) {
        const children = groupChildren(current);
        if (children.length !== 1) {
            break;
        }
        const only = children[0];
        const parent = current.parent;
        collapseInto(current, only, parent);
        current = only;
    }
    return current;
}

/** Parses a Quarks JSON export, registers all systems with the renderer and starts playback. */
export function loadEffectFromJson(
    scene: Scene,
    renderer: BatchedRenderer,
    json: unknown,
    baseUrl = ''
): {root: TransformNode; systems: ParticleSystem[]} {
    const loader = new QuarksLoader(scene, {baseUrl});
    let root = loader.parse(json as never, baseUrl);
    flattenRedundantGroups(root);
    root = promoteIfSingleChildRoot(root);
    const systems: ParticleSystem[] = [];
    QuarksUtil.runOnAllParticleEmitters(root, (emitter: ParticleEmitter) => {
        const system = emitter.system as ParticleSystem;
        renderer.addSystem(system);
        systems.push(system);
    });
    QuarksUtil.restart(root);
    QuarksUtil.play(root);
    return {root, systems};
}
