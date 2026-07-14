import {ParticleEmitter} from 'babylon.quarks';
import type {ParticleSystem} from 'babylon.quarks';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Matrix, Quaternion} from '@babylonjs/core/Maths/math.vector';
import {isEditorSceneNode} from './editorScene';

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

interface SerializeMeta {
    textures: {[k: string]: {url?: string; name?: string}};
    materials: {[k: string]: {[key: string]: unknown}};
    geometries: {[k: string]: unknown};
}

function localMatrix(node: TransformNode): number[] {
    const rotation = node.rotationQuaternion ?? Quaternion.FromEulerVector(node.rotation);
    return Matrix.Compose(node.scaling, rotation, node.position).asArray().slice();
}

function serializeNode(tree: EffectTreeNode, meta: SerializeMeta, fallbackUuid: string): Record<string, unknown> {
    // Emitter nodes must serialize with the ParticleEmitter's own `.uuid` — that is exactly
    // what EmitSubParticleSystem.toJSON writes as its target reference, so the two match and
    // QuarksLoader.linkReferences can re-resolve sub-emitters on reimport.
    const uuid = tree.system
        ? (tree.node as unknown as {uuid: string}).uuid
        : ((tree.node as {_quarksUUID?: string})._quarksUUID ?? fallbackUuid);
    const children = tree.children.map((child, i) => serializeNode(child, meta, `${fallbackUuid}-${i}`));
    const base = {
        uuid,
        name: tree.name,
        layers: 1,
        matrix: localMatrix(tree.node),
        children: children.length > 0 ? children : undefined,
    };
    if (tree.system) {
        return {...base, type: 'ParticleEmitter', ps: tree.system.toJSON(meta as never, {useUrlForImage: true} as never)};
    }
    return {...base, type: 'Group'};
}

/**
 * Serializes an effect tree into the Quarks JSON envelope understood by QuarksLoader,
 * preserving the group/emitter hierarchy (not flattened).
 */
export function serializeEffectTree(root: TransformNode, name = 'effect'): string {
    const meta: SerializeMeta = {textures: {}, materials: {}, geometries: {}};
    const object = serializeNode(buildEffectTree(root), meta, `${name}-node`);
    return finishEnvelope(object, meta);
}

/**
 * Serializes several effect roots as children of a synthetic group — used when an effect
 * spans multiple top-level trees (e.g. a demo running several loaded effects at once).
 */
export function serializeEffectForest(roots: TransformNode[], name = 'effect'): string {
    if (roots.length === 1) {
        return serializeEffectTree(roots[0], name);
    }
    const meta: SerializeMeta = {textures: {}, materials: {}, geometries: {}};
    const children = roots.map((root, i) => serializeNode(buildEffectTree(root), meta, `${name}-node-${i}`));
    const object = {
        uuid: `${name}-root`,
        name,
        type: 'Group',
        layers: 1,
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        children,
    };
    return finishEnvelope(object, meta);
}

/** Flattens accumulated meta and wraps the serialized object into the Quarks envelope. */
function finishEnvelope(object: Record<string, unknown>, meta: SerializeMeta): string {
    // toJSON stashes live Texture instances and material records in meta; flatten them into
    // the serializable images/textures/materials arrays QuarksLoader expects.
    const images: Array<{uuid: string; url: string}> = [];
    const textures: Array<{uuid: string; image?: string}> = [];
    for (const [uuid, tex] of Object.entries(meta.textures)) {
        const url = tex?.url ?? tex?.name;
        if (url) {
            const imageUuid = `${uuid}-image`;
            images.push({uuid: imageUuid, url});
            textures.push({uuid, image: imageUuid});
        } else {
            textures.push({uuid});
        }
    }
    const materials = Object.values(meta.materials).map((material) => {
        const {sourceMaterial: _sourceMaterial, ...serializable} = material;
        return serializable;
    });

    return JSON.stringify(
        {
            metadata: {version: 4.5, type: 'Object3D', generator: 'babylon.quarks-editor'},
            geometries: Object.values(meta.geometries),
            materials,
            textures,
            images,
            object,
        },
        null,
        2
    );
}
