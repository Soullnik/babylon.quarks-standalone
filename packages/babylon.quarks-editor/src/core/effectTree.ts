import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import type {ParticleSystem} from 'babylon.quarks';
import {ParticleEmitter, serializeEffect} from 'babylon.quarks';
import {isEditorSceneNode} from './editorScene.js';

/** A node in the editor's effect hierarchy: a Group (organizational) or a ParticleEmitter. */
export interface EffectTreeNode {
    node: TransformNode;
    name: string;
    /** Present when the node is a ParticleEmitter. */
    system?: ParticleSystem;
    depth: number;
    children: EffectTreeNode[];
}

/** Walks a loaded root TransformNode into the editor tree (groups + emitters). */
export function buildEffectTree(root: TransformNode, depth = 0): EffectTreeNode {
    const system = root instanceof ParticleEmitter ? (root.system as ParticleSystem) : undefined;
    const treeNode: EffectTreeNode = {
        node: root,
        name: root.name || (system ? 'emitter' : 'group'),
        system,
        depth,
        children: [],
    };
    for (const child of root.getChildren()) {
        if (child instanceof TransformNode && !isEditorSceneNode(child)) {
            treeNode.children.push(buildEffectTree(child, depth + 1));
        }
    }
    return treeNode;
}

/** Flattens the tree into the systems it contains, in display order. */
export function collectSystems(tree: EffectTreeNode): ParticleSystem[] {
    const out: ParticleSystem[] = [];
    const walk = (node: EffectTreeNode) => {
        if (node.system) {
            out.push(node.system);
        }
        node.children.forEach(walk);
    };
    walk(tree);
    return out;
}

/** Writes the effect under `roots`, leaving out the editor's own helper nodes. */
function serialize(roots: TransformNode | TransformNode[], name: string): string {
    const json = serializeEffect(roots, {
        name,
        generator: 'babylon.quarks-editor',
        filter: (node) => !isEditorSceneNode(node),
    });
    return JSON.stringify(json, null, 2);
}

/**
 * Serializes an effect tree into the Quarks JSON envelope understood by QuarksLoader,
 * preserving the group/emitter hierarchy (not flattened).
 */
export function serializeEffectTree(root: TransformNode, name = 'effect'): string {
    return serialize(root, name);
}

/**
 * Serializes several effect roots as children of a synthetic group — used when an effect
 * spans multiple top-level trees (e.g. a demo running several loaded effects at once).
 */
export function serializeEffectForest(roots: TransformNode[], name = 'effect'): string {
    return serialize(roots.length === 1 ? roots[0] : roots, name);
}
