import {TransformNode} from '@babylonjs/core/Meshes/transformNode';

/**
 * Groups the given nodes under a new organizational TransformNode. Each node's world
 * transform is preserved via `setParent` — grouping never moves anything visually, it only
 * changes the hierarchy so the group can be repositioned/organized as one unit afterwards.
 */
export function groupNodes(nodes: TransformNode[], name = 'Group'): TransformNode {
    const scene = nodes[0].getScene();
    const group = new TransformNode(name, scene);
    group.setParent(nodes[0].parent);
    for (const node of nodes) {
        node.setParent(group);
    }
    return group;
}

/**
 * Dissolves a group, reparenting its children onto the group's own parent and disposing the
 * (now childless) group node. World transform of each child is preserved.
 */
export function ungroupNode(group: TransformNode): void {
    const parent = group.parent;
    const children = group.getChildren().filter((c): c is TransformNode => c instanceof TransformNode);
    for (const child of children) {
        child.setParent(parent);
    }
    group.dispose(true, false);
}
