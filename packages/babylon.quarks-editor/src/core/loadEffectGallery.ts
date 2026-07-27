import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Scene} from '@babylonjs/core/scene';
import type {ParticleSystem} from 'babylon.quarks';
import {EffectBinding} from './binding';
import {disposeLoadedEffect, parseEffectFromJson} from './loadEffect';

export interface GalleryEntry {
    name: string;
    /** Relative path inside the imported folder (preserves subfolders). */
    path: string;
    root: TransformNode;
    systems: ParticleSystem[];
    /** True once the user has dropped this effect into the viewport. */
    inScene: boolean;
}

export interface GalleryLoadProgress {
    done: number;
    total: number;
    loaded: number;
    failed: number;
}

const YIELD_EVERY = 8;

function yieldToBrowser(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Collects `.json` files from a folder picker result, sorted by relative path. */
export function collectJsonFiles(files: FileList | File[]): File[] {
    const list = Array.from(files);
    return list
        .filter((file) => file.name.toLowerCase().endsWith('.json'))
        .sort((a, b) => {
            const pathA = (a as File & {webkitRelativePath?: string}).webkitRelativePath || a.name;
            const pathB = (b as File & {webkitRelativePath?: string}).webkitRelativePath || b.name;
            return pathA.localeCompare(pathB);
        });
}

/**
 * Parses every JSON effect into a hidden catalog — not registered with the renderer until the
 * user drops the effect into the viewport.
 */
export async function loadEffectGallery(
    scene: Scene,
    files: FileList | File[],
    catalogRoot: TransformNode,
    onProgress: (progress: GalleryLoadProgress) => void
): Promise<GalleryEntry[]> {
    const jsonFiles = collectJsonFiles(files);
    const entries: GalleryEntry[] = [];

    onProgress({done: 0, total: jsonFiles.length, loaded: 0, failed: 0});

    for (let i = 0; i < jsonFiles.length; i++) {
        const file = jsonFiles[i];
        try {
            const json = JSON.parse(await file.text());
            const {root, systems} = parseEffectFromJson(scene, null, json, {
                registerRenderer: false,
                autoplay: false,
            });
            if (systems.length === 0) {
                disposeLoadedEffect(root, systems, null, false);
                continue;
            }

            const relPath = (file as File & {webkitRelativePath?: string}).webkitRelativePath || file.name;
            const label = file.name.replace(/\.json$/i, '');
            if (!root.name || root.name === 'Effect' || root.name === 'Object3D') {
                root.name = label;
            }

            root.parent = catalogRoot;
            root.setEnabled(false);

            entries.push({
                name: label,
                path: relPath.replace(/\\/g, '/'),
                root,
                systems,
                inScene: false,
            });
        } catch (err) {
            console.warn(`[Quarks editor] Skipped "${file.name}":`, err);
        }

        onProgress({
            done: i + 1,
            total: jsonFiles.length,
            loaded: entries.length,
            failed: i + 1 - entries.length,
        });

        if ((i + 1) % YIELD_EVERY === 0) {
            await yieldToBrowser();
        }
    }

    return entries;
}

/** Builds an edit binding for one catalog entry without unloading the rest. */
export function bindingFromGalleryEntry(entry: GalleryEntry): EffectBinding {
    const main = entry.systems.find((s) => !s.onlyUsedByOther) ?? entry.systems[0];
    return new EffectBinding(
        main,
        entry.systems.filter((s) => s !== main),
        entry.root
    );
}

/** Merges newly loaded catalog entries, skipping duplicate paths. */
export function mergeGalleryEntries(
    existing: GalleryEntry[],
    incoming: GalleryEntry[],
    renderer: import('babylon.quarks').BatchedRenderer | null
): {merged: GalleryEntry[]; added: GalleryEntry[]; skipped: number} {
    const paths = new Set(existing.map((entry) => entry.path));
    const added: GalleryEntry[] = [];
    let skipped = 0;

    for (const entry of incoming) {
        if (paths.has(entry.path)) {
            disposeLoadedEffect(entry.root, entry.systems, renderer, false);
            skipped++;
            continue;
        }
        paths.add(entry.path);
        added.push(entry);
    }

    return {merged: [...existing, ...added], added, skipped};
}

/** Disposes every catalog entry and the hidden catalog root. */
export function disposeGallery(
    catalogRoot: TransformNode | null,
    entries: GalleryEntry[],
    renderer: import('babylon.quarks').BatchedRenderer
): void {
    for (const entry of entries) {
        disposeLoadedEffect(entry.root, entry.systems, renderer, entry.inScene);
    }
    if (catalogRoot && !catalogRoot.isDisposed()) {
        catalogRoot.dispose(false, true);
    }
}
