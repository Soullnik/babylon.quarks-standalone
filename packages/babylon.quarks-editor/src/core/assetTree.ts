import type {EffectAsset} from './assets.js';

export interface AssetTreeFolder {
    kind: 'folder';
    name: string;
    path: string;
    children: AssetTreeNode[];
}

export interface AssetTreeEffect {
    kind: 'asset';
    name: string;
    path: string;
    asset: EffectAsset;
}

export type AssetTreeNode = AssetTreeFolder | AssetTreeEffect;

function compareNodes(a: AssetTreeNode, b: AssetTreeNode): number {
    if (a.kind !== b.kind) {
        return a.kind === 'folder' ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, {sensitivity: 'base'});
}

/** Builds a folder tree from asset relative paths (e.g. `VFX/Fire/Explosion.json`). */
export function buildAssetTree(assets: EffectAsset[]): AssetTreeNode[] {
    const roots: AssetTreeNode[] = [];

    for (const asset of assets) {
        const segments = asset.path
            .replace(/\.json$/i, '')
            .split('/')
            .filter(Boolean);
        const fileName = segments.pop() ?? asset.name;
        let level = roots;
        let pathSoFar = '';

        for (const segment of segments) {
            pathSoFar = pathSoFar ? `${pathSoFar}/${segment}` : segment;
            let folder = level.find((node): node is AssetTreeFolder => node.kind === 'folder' && node.name === segment);
            if (!folder) {
                folder = {kind: 'folder', name: segment, path: pathSoFar, children: []};
                level.push(folder);
            }
            level = folder.children;
        }

        level.push({kind: 'asset', name: fileName, path: asset.path, asset});
    }

    const sortTree = (nodes: AssetTreeNode[]): void => {
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

/** Children of the folder at `path` (`''` is the top level), or null when it no longer exists. */
export function folderChildren(tree: AssetTreeNode[], path: string): AssetTreeNode[] | null {
    let level = tree;
    for (const segment of path.split('/').filter(Boolean)) {
        const folder = level.find((node): node is AssetTreeFolder => node.kind === 'folder' && node.name === segment);
        if (!folder) {
            return null;
        }
        level = folder.children;
    }
    return level;
}

/** Assets whose name or path contains `query`, across every folder, sorted by name. */
export function searchAssets(assets: EffectAsset[], query: string): EffectAsset[] {
    const q = query.trim().toLowerCase();
    return assets
        .filter((asset) => `${asset.path} ${asset.name}`.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}));
}

export const ASSET_DRAG_MIME = 'application/x-quarks-asset-drop';

export type AssetDragPayload = {kind: 'asset'; id: number} | {kind: 'folder'; path: string};

export function writeAssetDrag(dataTransfer: DataTransfer, payload: AssetDragPayload): void {
    dataTransfer.setData(ASSET_DRAG_MIME, JSON.stringify(payload));
    dataTransfer.effectAllowed = 'copy';
}

export function readAssetDrag(dataTransfer: DataTransfer): AssetDragPayload | null {
    const raw = dataTransfer.getData(ASSET_DRAG_MIME);
    if (!raw) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw) as AssetDragPayload;
        if (parsed?.kind === 'asset' && typeof parsed.id === 'number') {
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

/** Returns every asset whose JSON path sits inside `folderPath` (recursive). */
export function collectAssetsInFolder(assets: EffectAsset[], folderPath: string): EffectAsset[] {
    const prefix = `${folderPath}/`;
    return assets.filter((asset) => asset.path.startsWith(prefix));
}

/** Collects all assets under a folder tree node. */
export function collectFolderAssets(node: AssetTreeFolder): EffectAsset[] {
    const collected: EffectAsset[] = [];
    const walk = (nodes: AssetTreeNode[]): void => {
        for (const child of nodes) {
            if (child.kind === 'asset') {
                collected.push(child.asset);
            } else {
                walk(child.children);
            }
        }
    };
    walk(node.children);
    return collected;
}

/** Resolves a drag payload to the assets that would be instantiated on drop. */
export function describeAssetDrag(
    assets: EffectAsset[],
    payload: AssetDragPayload
): {assets: EffectAsset[]; label: string} {
    if (payload.kind === 'asset') {
        const asset = assets.find((item) => item.id === payload.id);
        return {assets: asset ? [asset] : [], label: asset?.name ?? 'Effect'};
    }

    const label = payload.path.split('/').filter(Boolean).pop() ?? payload.path;
    return {assets: collectAssetsInFolder(assets, payload.path), label};
}
