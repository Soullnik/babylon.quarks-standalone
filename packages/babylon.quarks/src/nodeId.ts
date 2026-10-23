import {RandomGUID} from '@babylonjs/core/Misc/guid';

/** The id each node is known by in effect files, set when it is loaded or first asked for. */
const nodeIds = new WeakMap<object, string>();

/**
 * The id an effect file knows a node by: the uuid it was loaded under, or, for a node made in code,
 * a GUID given to it the first time it is asked for and kept from then on. Every link written into
 * a file (a sub emitter's target, a mesh surface shape's mesh, a prefab animation's target) and
 * every node's own `uuid` use this, so an effect loaded, saved and loaded again keeps its links,
 * and a node made in code never takes the id of one loaded from a file.
 */
export function quarksNodeId(node: object): string {
    let id = nodeIds.get(node);
    if (id === undefined) {
        id = RandomGUID();
        nodeIds.set(node, id);
    }
    return id;
}

/**
 * The uuid `node` was loaded under or was given, or undefined for a node no file or save has named.
 * @internal
 */
export function fileNodeId(node: object): string | undefined {
    return nodeIds.get(node);
}

/**
 * Names `node` with `id`, the uuid a file gave it.
 * @internal
 */
export function setQuarksNodeId(node: object, id: string): void {
    nodeIds.set(node, id);
}
