import type {GalleryEntry} from './loadEffectGallery';

export interface GalleryTreeFolder {
    kind: 'folder';
    name: string;
    path: string;
    children: GalleryTreeNode[];
}

export interface GalleryTreeEffect {
    kind: 'effect';
    name: string;
    path: string;
    entry: GalleryEntry;
}

export type GalleryTreeNode = GalleryTreeFolder | GalleryTreeEffect;

function compareNodes(a: GalleryTreeNode, b: GalleryTreeNode): number {
    if (a.kind !== b.kind) {
        return a.kind === 'folder' ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, {sensitivity: 'base'});
}

/** Builds a folder tree from gallery entry relative paths (e.g. `VFX/Fire/Explosion.json`). */
export function buildGalleryTree(entries: GalleryEntry[]): GalleryTreeNode[] {
    const roots: GalleryTreeNode[] = [];

    for (const entry of entries) {
        const normalized = entry.path.replace(/\\/g, '/');
        const segments = normalized.replace(/\.json$/i, '').split('/').filter(Boolean);
        const fileName = segments.pop() ?? entry.name;
        let level = roots;
        let pathSoFar = '';

        for (const segment of segments) {
            pathSoFar = pathSoFar ? `${pathSoFar}/${segment}` : segment;
            let folder = level.find((node): node is GalleryTreeFolder => node.kind === 'folder' && node.name === segment);
            if (!folder) {
                folder = {kind: 'folder', name: segment, path: pathSoFar, children: []};
                level.push(folder);
            }
            level = folder.children;
        }

        level.push({
            kind: 'effect',
            name: fileName,
            path: entry.path,
            entry,
        });
    }

    const sortTree = (nodes: GalleryTreeNode[]): void => {
        nodes.sort(compareNodes);
        for (const node of nodes) {
            if (node.kind === 'folder') {
                sortTree(node.children);
            }
        }
    };

    sortTree(roots);
    return roots;
}

/** Filters a folder tree while preserving ancestors of matching effects. */
export function filterGalleryTree(nodes: GalleryTreeNode[], query: string): GalleryTreeNode[] {
    const q = query.trim().toLowerCase();
    if (!q) {
        return nodes;
    }

    const walk = (node: GalleryTreeNode): GalleryTreeNode | null => {
        if (node.kind === 'effect') {
            const haystack = `${node.path} ${node.name}`.toLowerCase();
            return haystack.includes(q) ? node : null;
        }

        const children = node.children.map(walk).filter((child): child is GalleryTreeNode => child !== null);
        if (children.length === 0) {
            return null;
        }
        return {...node, children};
    };

    return nodes.map(walk).filter((node): node is GalleryTreeNode => node !== null);
}

export const GALLERY_DRAG_MIME = 'application/x-quarks-gallery-drop';

export type GalleryDragPayload =
    | {kind: 'effect'; id: number}
    | {kind: 'folder'; path: string};

export function writeGalleryDrag(dataTransfer: DataTransfer, payload: GalleryDragPayload): void {
    dataTransfer.setData(GALLERY_DRAG_MIME, JSON.stringify(payload));
    dataTransfer.effectAllowed = 'copy';
}

export function readGalleryDrag(dataTransfer: DataTransfer): GalleryDragPayload | null {
    const raw = dataTransfer.getData(GALLERY_DRAG_MIME);
    if (!raw) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw) as GalleryDragPayload;
        if (parsed?.kind === 'effect' && typeof parsed.id === 'number') {
            return parsed;
        }
        if (parsed?.kind === 'folder' && typeof parsed.path === 'string') {
            return parsed;
        }
    } catch {
        return null;
    }
    return null;
}

/** Returns every effect whose JSON path sits inside `folderPath` (recursive). */
export function collectEntriesInFolder(entries: GalleryEntry[], folderPath: string): GalleryEntry[] {
    const prefix = folderPath.replace(/\\/g, '/');
    return entries.filter((entry) => {
        const path = entry.path.replace(/\\/g, '/');
        const parent = path.replace(/\/[^/]+\.json$/i, '');
        return parent === prefix || parent.startsWith(`${prefix}/`);
    });
}

/** Collects all effects under a folder tree node. */
export function collectFolderEntries(node: GalleryTreeFolder): GalleryEntry[] {
    const collected: GalleryEntry[] = [];
    const walk = (nodes: GalleryTreeNode[]): void => {
        for (const child of nodes) {
            if (child.kind === 'effect') {
                collected.push(child.entry);
            } else {
                walk(child.children);
            }
        }
    };
    walk(node.children);
    return collected;
}

export type GalleryFlatRow =
    | {kind: 'folder'; depth: number; node: GalleryTreeFolder; effectCount: number}
    | {kind: 'effect'; depth: number; node: GalleryTreeEffect};

/** Flattens the visible folder tree into rows for virtual scrolling. */
export function flattenVisibleGalleryRows(
    nodes: GalleryTreeNode[],
    closedFolders: ReadonlySet<string>,
    expandAll: boolean,
    depth = 0
): GalleryFlatRow[] {
    const rows: GalleryFlatRow[] = [];
    for (const node of nodes) {
        if (node.kind === 'folder') {
            const effectCount = collectFolderEntries(node).length;
            rows.push({kind: 'folder', depth, node, effectCount});
            const open = expandAll || !closedFolders.has(node.path);
            if (open) {
                rows.push(...flattenVisibleGalleryRows(node.children, closedFolders, expandAll, depth + 1));
            }
        } else {
            rows.push({kind: 'effect', depth, node});
        }
    }
    return rows;
}

/** Resolves a drag payload to the entries that would be placed on drop. */
export function describeGalleryDrag(
    entries: GalleryEntry[],
    payload: GalleryDragPayload
): {entries: GalleryEntry[]; label: string} {
    if (payload.kind === 'effect') {
        const entry = entries.find((item) => item.root.uniqueId === payload.id);
        return {entries: entry ? [entry] : [], label: entry?.name ?? 'Effect'};
    }

    const folderEntries = collectEntriesInFolder(entries, payload.path);
    const label = payload.path.split('/').filter(Boolean).pop() ?? payload.path;
    return {entries: folderEntries, label};
}
