/**
 * The id an effect file knows a node by: the uuid it was loaded under, or its Babylon `uniqueId`
 * for a node made in code. Every link written into a file (a sub emitter's target, a mesh surface
 * shape's mesh, a prefab animation's target) and every node's own `uuid` use this, so an effect
 * loaded, saved and loaded again keeps its links.
 */
export function quarksNodeId(node: {uniqueId: number}): string {
    return (node as {_quarksUUID?: string})._quarksUUID ?? node.uniqueId.toString();
}
