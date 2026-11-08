import type {AbstractMesh} from '@babylonjs/core/Meshes/abstractMesh';
import type {SubMesh} from '@babylonjs/core/Meshes/subMesh';
import {Logger} from '@babylonjs/core/Misc/logger';
import type {Scene} from '@babylonjs/core/scene';

// Unity's order of transparent particle systems in Babylon's sort of transparent meshes.
//
// Unity draws transparent renderers back to front by the distance from the camera to the centre of
// their bounds plus their Sorting Fudge, in world units (measured in Unity 6): a positive fudge
// pushes a particle system behind others, a negative one brings it in front, past the camera even.
// Each particle system is a renderer of its own, and consecutive systems of one material are
// drawn together. The renderer orders its systems that way each frame and splits each batch into
// the runs of its systems that come one after another, one draw each, giving every draw the key of
// its first system and its place in the order (see `setDrawOrder`). It sets, for the rendering
// groups its batches draw in, Babylon's default transparent compare reading those keys; other
// meshes sort by their distance as before. A batch the renderer has not ordered (no camera yet)
// sorts by Babylon's distance to its bounds plus its fudge.

/** The sorting fudge of each batch mesh that has one. */
const fudges = new WeakMap<AbstractMesh, number>();

/** Sets the sorting fudge `mesh` is sorted with; 0 removes it. @internal */
export function setSortingFudge(mesh: AbstractMesh, fudge: number): void {
    if (fudge === 0) {
        fudges.delete(mesh);
    } else {
        fudges.set(mesh, fudge);
    }
}

/** Where a draw of a batch comes in the renderer's back-to-front order of particle systems. */
interface DrawOrder {
    /** Distance from the camera to its first system's bounds centre, plus the sorting fudge. */
    key: number;
    /** Its place in the order, counted per frame: a tie between two keys goes to it. */
    sequence: number;
}

const drawOrders = new WeakMap<SubMesh, DrawOrder>();

/**
 * Sorts `subMesh` by `key` (see {@link quarksSortDistance}), and a tie with another draw of the
 * renderer by `sequence`, the lower drawn first. @internal
 */
export function setDrawOrder(subMesh: SubMesh, key: number, sequence: number): void {
    const order = drawOrders.get(subMesh);
    if (order === undefined) {
        drawOrders.set(subMesh, {key, sequence});
    } else {
        order.key = key;
        order.sequence = sequence;
    }
}

/** Sorts `subMesh` by its distance and its mesh's fudge again. @internal */
export function clearDrawOrder(subMesh: SubMesh): void {
    drawOrders.delete(subMesh);
}

/**
 * The key a transparent sub mesh is sorted by, back to front. For a draw of the renderer, the
 * distance from the camera to the centre of its first particle system's bounds plus the sorting
 * fudge, as the renderer measured it for the frame from the scene's first active camera; for any
 * other mesh, its distance as Babylon measured it for this draw. For an application with its own
 * transparent compare, to keep quarks' order in it.
 */
export function quarksSortDistance(subMesh: SubMesh): number {
    const order = drawOrders.get(subMesh);
    if (order !== undefined) {
        return order.key;
    }
    return subMesh._distanceToCamera + (fudges.get(subMesh.getMesh()) ?? 0);
}

/**
 * Babylon's default transparent compare (`RenderingGroup.defaultTransparentSortCompare`) with
 * {@link quarksSortDistance} for the distance: by alpha index, then back to front, and two draws of
 * the renderer at one key in the renderer's order. Other meshes sort exactly as Babylon sorts them.
 */
export function quarksTransparentSortCompare(a: SubMesh, b: SubMesh): number {
    if (a._alphaIndex > b._alphaIndex) {
        return 1;
    }
    if (a._alphaIndex < b._alphaIndex) {
        return -1;
    }
    const da = quarksSortDistance(a);
    const db = quarksSortDistance(b);
    if (da < db) {
        return 1;
    }
    if (da > db) {
        return -1;
    }
    const oa = drawOrders.get(a);
    const ob = drawOrders.get(b);
    if (oa !== undefined && ob !== undefined) {
        return oa.sequence - ob.sequence;
    }
    return 0;
}

type CompareFn = ((a: SubMesh, b: SubMesh) => number) | null | undefined;

/** The rendering manager's custom compares, by rendering group; private in Babylon. */
interface CustomCompares {
    _customOpaqueSortCompareFn?: Record<number, CompareFn>;
    _customAlphaTestSortCompareFn?: Record<number, CompareFn>;
    _customTransparentSortCompareFn?: Record<number, CompareFn>;
}

/**
 * Whether this Babylon keeps the custom compares where {@link installTransparentSort} reads them,
 * to hand the opaque and alpha test ones back unchanged. The tests pin it for the Babylon version
 * the library is built against.
 * @internal
 */
export function readsCustomCompares(scene: Scene): boolean {
    const manager = scene.renderingManager as unknown as CustomCompares;
    return (
        typeof manager._customOpaqueSortCompareFn === 'object' &&
        typeof manager._customAlphaTestSortCompareFn === 'object' &&
        typeof manager._customTransparentSortCompareFn === 'object'
    );
}

const warned = new WeakMap<Scene, Set<number>>();

/**
 * Sorts the transparent meshes of `scene`'s rendering group `group` with
 * {@link quarksTransparentSortCompare}, keeping its opaque and alpha test compares. A group that
 * already has a transparent compare of the application's own keeps it, with a warning once: that
 * compare can call {@link quarksSortDistance} to keep the order.
 * @internal
 */
export function installTransparentSort(scene: Scene, group: number): void {
    const manager = scene.renderingManager as unknown as CustomCompares;
    if (!readsCustomCompares(scene)) {
        return;
    }
    const transparent = manager._customTransparentSortCompareFn![group];
    if (transparent === quarksTransparentSortCompare) {
        return;
    }
    if (transparent) {
        const groups = warned.get(scene) ?? new Set<number>();
        warned.set(scene, groups);
        if (!groups.has(group)) {
            groups.add(group);
            Logger.Warn(
                `babylon.quarks: rendering group ${group} sorts its transparent meshes with a compare of its own, ` +
                    "so particle systems are not drawn in Unity's order there; call quarksSortDistance(subMesh) " +
                    'in that compare for the distance to keep it.'
            );
        }
        return;
    }
    scene.setRenderingOrder(
        group,
        manager._customOpaqueSortCompareFn![group] ?? null,
        manager._customAlphaTestSortCompareFn![group] ?? null,
        quarksTransparentSortCompare
    );
}
