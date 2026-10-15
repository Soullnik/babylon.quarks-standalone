import {QuarksLoader} from 'babylon.quarks';

/**
 * One effect file in the Assets panel. Holds the source JSON only — nothing is live in the
 * Babylon scene until the asset is dropped into the viewport, and every drop instantiates a
 * fresh, independent copy (see `instantiateSceneEntry`).
 */
export interface EffectAsset {
    id: number;
    name: string;
    /** Relative path inside the imported folder (preserves subfolders). */
    path: string;
    /** Quarks JSON with every external file reference already inlined. */
    json: unknown;
    /** Texture/geometry files the effect references that were not among the imported files. */
    missingFiles: string[];
}

export interface AssetLoadProgress {
    done: number;
    total: number;
    loaded: number;
    failed: number;
}

const YIELD_EVERY = 8;
const IMAGE_FILE = /\.(png|jpe?g|webp|gif|bmp)$/i;

let nextAssetId = 1;

function yieldToBrowser(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function relativePathOf(file: File): string {
    return ((file as File & {webkitRelativePath?: string}).webkitRelativePath || file.name).replace(/\\/g, '/');
}

/** Files an asset import reads: effect `.json` files plus the images/geometries they may reference. */
export function isAssetImportFile(name: string): boolean {
    return /\.json$/i.test(name) || IMAGE_FILE.test(name);
}

/** Collects `.json` files from a picker result, sorted by relative path. */
export function collectJsonFiles(files: FileList | File[]): File[] {
    return Array.from(files)
        .filter((file) => file.name.toLowerCase().endsWith('.json'))
        .sort((a, b) => relativePathOf(a).localeCompare(relativePathOf(b)));
}

/** Resolves `url` against the folder of `fromPath` (`a/b/fx.json` + `../t.png` → `a/t.png`). */
export function resolveRelativePath(fromPath: string, url: string): string {
    const segments = fromPath.split('/').slice(0, -1);
    for (const part of url.split('/')) {
        if (part === '..') {
            segments.pop();
        } else if (part !== '.' && part !== '') {
            segments.push(part);
        }
    }
    return segments.join('/');
}

function isExternalUrl(url: string): boolean {
    return /^(data|blob):/i.test(url) || /^[a-z][a-z0-9+.-]*:\/\//i.test(url) || url.startsWith('/');
}

function readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

/** True for a Quarks effect envelope with at least one particle emitter. */
export function isEffectJson(json: unknown): boolean {
    const object = (json as {object?: unknown} | null)?.object;
    const walk = (node: unknown): boolean => {
        if (!node || typeof node !== 'object') return false;
        const typed = node as {type?: unknown; children?: unknown};
        if (typed.type === 'ParticleEmitter') return true;
        return Array.isArray(typed.children) && typed.children.some(walk);
    };
    return walk(object);
}

/**
 * Looks files up by path relative to the import root, falling back to the bare file name — a
 * multi-file "Import effect" pick has no folder structure, only names.
 */
class ImportedFileIndex {
    private readonly byPath = new Map<string, File>();
    private readonly byName = new Map<string, File>();
    private readonly cache = new Map<File, Promise<unknown>>();

    constructor(files: File[]) {
        for (const file of files) {
            this.byPath.set(relativePathOf(file).toLowerCase(), file);
            if (!this.byName.has(file.name.toLowerCase())) {
                this.byName.set(file.name.toLowerCase(), file);
            }
        }
    }

    find(fromPath: string, url: string): File | undefined {
        const clean = decodeURIComponent(url.split(/[?#]/)[0]);
        return (
            this.byPath.get(resolveRelativePath(fromPath, clean).toLowerCase()) ??
            this.byName.get((clean.split('/').pop() ?? clean).toLowerCase())
        );
    }

    /** Reads each file once, however many effects reference it. */
    read<T>(file: File, read: (file: File) => Promise<T>): Promise<T> {
        let pending = this.cache.get(file);
        if (!pending) {
            pending = read(file);
            this.cache.set(file, pending);
        }
        return pending as Promise<T>;
    }
}

/**
 * Inlines what an "assets as files" export put in separate files: image urls become data URIs
 * and external geometries are read into the JSON, so the effect loads (and later exports) as a
 * self-contained effect. Returns the references that could not be found among the files.
 */
async function inlineExternalFiles(json: any, effectPath: string, index: ImportedFileIndex): Promise<string[]> {
    const missing: string[] = [];

    for (const image of Array.isArray(json.images) ? json.images : []) {
        const url = image?.url;
        if (typeof url !== 'string' || isExternalUrl(url)) continue;
        const file = index.find(effectPath, url);
        if (file) {
            image.url = await index.read(file, readAsDataUrl);
        } else {
            missing.push(url);
        }
    }

    await QuarksLoader.resolveExternalGeometries(json, async (url) => {
        const file = index.find(effectPath, url);
        if (!file) {
            missing.push(url);
            throw new Error('not among the imported files');
        }
        return index.read(file, async (f) => JSON.parse(await f.text()));
    });

    return missing;
}

/**
 * Reads every effect JSON among `files` into an asset. Files that are not effects (geometry
 * files, unrelated JSON, images) are skipped silently; unreadable JSON is skipped with a warning.
 */
export async function loadEffectAssets(
    files: FileList | File[],
    onProgress: (progress: AssetLoadProgress) => void
): Promise<EffectAsset[]> {
    const all = Array.from(files).filter((file) => isAssetImportFile(file.name));
    const jsonFiles = collectJsonFiles(all);
    const index = new ImportedFileIndex(all);
    const assets: EffectAsset[] = [];
    let failed = 0;

    onProgress({done: 0, total: jsonFiles.length, loaded: 0, failed: 0});

    for (let i = 0; i < jsonFiles.length; i++) {
        const file = jsonFiles[i];
        const path = relativePathOf(file);
        try {
            const json = JSON.parse(await file.text());
            if (isEffectJson(json)) {
                const missingFiles = await inlineExternalFiles(json, path, index);
                if (missingFiles.length > 0) {
                    console.warn(`[Quarks editor] "${path}" references files that were not imported:`, missingFiles);
                }
                assets.push({id: nextAssetId++, name: file.name.replace(/\.json$/i, ''), path, json, missingFiles});
            }
        } catch (err) {
            failed++;
            console.warn(`[Quarks editor] Skipped "${path}":`, err);
        }

        onProgress({done: i + 1, total: jsonFiles.length, loaded: assets.length, failed});

        if ((i + 1) % YIELD_EVERY === 0) {
            await yieldToBrowser();
        }
    }

    return assets;
}

/** Wraps an in-memory effect JSON (e.g. the host's `effectJson`) as an asset. */
export function createEffectAsset(name: string, path: string, json: unknown): EffectAsset {
    return {id: nextAssetId++, name, path, json, missingFiles: []};
}

/** Merges newly imported assets, skipping paths already in the list. */
export function mergeAssets(
    existing: EffectAsset[],
    incoming: EffectAsset[]
): {merged: EffectAsset[]; added: EffectAsset[]; skipped: number} {
    const paths = new Set(existing.map((asset) => asset.path));
    const added: EffectAsset[] = [];
    for (const asset of incoming) {
        if (paths.has(asset.path)) continue;
        paths.add(asset.path);
        added.push(asset);
    }
    return {merged: [...existing, ...added], added, skipped: incoming.length - added.length};
}

/** Removes one asset, or every asset under a folder path. */
export function removeAssets(
    assets: EffectAsset[],
    target: {kind: 'asset'; id: number} | {kind: 'folder'; path: string}
): EffectAsset[] {
    if (target.kind === 'asset') {
        return assets.filter((asset) => asset.id !== target.id);
    }
    const prefix = `${target.path}/`;
    return assets.filter((asset) => !asset.path.startsWith(prefix));
}

const iconCache = new WeakMap<EffectAsset, string | null>();

/**
 * Url of the effect's main texture — the first emitter's material map — used as its icon in
 * the Assets panel. Falls back to the first image; null when the effect has no texture.
 */
export function assetIconUrl(asset: EffectAsset): string | null {
    const cached = iconCache.get(asset);
    if (cached !== undefined) {
        return cached;
    }
    const json = asset.json as any;
    const findMaterial = (node: any): string | undefined => {
        if (!node || typeof node !== 'object') return undefined;
        if (node.type === 'ParticleEmitter' && node.ps?.material) return node.ps.material;
        for (const child of Array.isArray(node.children) ? node.children : []) {
            const found = findMaterial(child);
            if (found) return found;
        }
        return undefined;
    };
    const byUuid = (list: unknown, uuid: unknown) =>
        (Array.isArray(list) ? list : []).find((item: any) => item?.uuid === uuid) as any;

    const material = byUuid(json?.materials, findMaterial(json?.object));
    const texture = byUuid(json?.textures, material?.map ?? material?.texture);
    const image = byUuid(json?.images, texture?.image) ?? (Array.isArray(json?.images) ? json.images[0] : undefined);
    const url = typeof image?.url === 'string' && image.url ? image.url : null;
    iconCache.set(asset, url);
    return url;
}
