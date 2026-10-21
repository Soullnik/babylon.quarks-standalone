import {RandomGUID} from '@babylonjs/core/Misc/guid';

/**
 * The id an effect file knows a node by: the uuid it was loaded under, or, for a node made in code,
 * a GUID given to it the first time it is asked for and kept from then on. Every link written into
 * a file (a sub emitter's target, a mesh surface shape's mesh, a prefab animation's target) and
 * every node's own `uuid` use this, so an effect loaded, saved and loaded again keeps its links,
 * and a node made in code never takes the id of one loaded from a file.
 */
export function quarksNodeId(node: object): string {
    const ided = node as {_quarksUUID?: string};
    return (ided._quarksUUID ??= RandomGUID());
}
