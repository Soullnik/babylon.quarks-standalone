import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';

/** Marks meshes/nodes created only for editor interaction or overlays (not part of the effect). */
export const EDITOR_SCENE_NODE_METADATA = {quarksEditorSceneNode: true as const};

/** True for viewport pick proxies, shape wireframes, and other non-exportable scene helpers. */
export function isEditorSceneNode(node: TransformNode): boolean {
    const meta = node.metadata as {quarksEditorPick?: boolean; quarksEditorSceneNode?: boolean} | undefined;
    if (meta?.quarksEditorPick || meta?.quarksEditorSceneNode) {
        return true;
    }
    const name = node.name;
    return name.startsWith('viewport-pick-root-') || name.startsWith('wf-');
}
