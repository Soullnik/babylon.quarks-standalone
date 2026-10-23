/** One editor project: a library of effect assets plus the scene built from them. */
export interface ProjectMeta {
    /** The project's key in its store. */
    id: string;
    /** The project's display name. */
    name: string;
    /** When the project was created, in milliseconds since the epoch. */
    createdAt: number;
    /** When the project last changed, in milliseconds since the epoch. */
    updatedAt: number;
    /** How many effect assets the project holds. */
    assetCount: number;
    /** Approximate bytes the project takes in storage (JSON + texture files). */
    sizeBytes: number;
}

/** An effect asset as the store keeps it. `json` is a self-contained Quarks effect. */
export interface StoredAsset {
    /** Relative path inside the project (`Fire/Explosion.json`) — the asset's key. */
    path: string;
    /** The asset's display name, its file name without `.json`. */
    name: string;
    /** The effect, as quarks JSON with its textures inlined. */
    json: unknown;
    /** Files the effect referenced that were not imported with it. */
    missingFiles: string[];
}

/** One effect instance in a saved scene. */
export interface StoredSceneEntry {
    /** The instance's name in the Scene list. */
    name: string;
    /** Path of the asset it was made from, if any. */
    assetPath: string | null;
    /** The instance's own (possibly edited) effect, root transform included. */
    json: unknown;
    /** Whether the instance was shown. */
    visible: boolean;
}

/** A project's saved scene: the effects placed in it, in Scene list order. */
export interface StoredScene {
    /** The scene's effect instances. */
    entries: StoredSceneEntry[];
    /** When it was saved, in milliseconds since the epoch. */
    savedAt: number;
}

/** How much storage projects use, as far as the browser tells. */
export interface StorageEstimate {
    /** Bytes the whole site uses (all projects), when the browser reports it. */
    usage: number | null;
    /** Bytes the browser lets the site use, when it reports it. */
    quota: number | null;
    /** True when the browser promised not to evict the data under storage pressure. */
    persisted: boolean;
}

/**
 * Where projects live. The editor only talks to this interface; `IndexedDbProjectStore` keeps
 * everything in the browser, and an embedding host can supply its own (e.g. on disk).
 */
export interface ProjectStore {
    /** Every project, most recently changed first. */
    listProjects(): Promise<ProjectMeta[]>;
    /** One project, or null when there is none with that id. */
    getProject(id: string): Promise<ProjectMeta | null>;
    /** Creates an empty project. */
    createProject(name: string): Promise<ProjectMeta>;
    /** Renames a project. */
    renameProject(id: string, name: string): Promise<void>;
    /** Copies a project, its assets and its scene, under a new name. */
    duplicateProject(id: string, name: string): Promise<ProjectMeta>;
    /** Deletes a project, its assets and its scene. */
    deleteProject(id: string): Promise<void>;

    /** A project's assets. */
    loadAssets(projectId: string): Promise<StoredAsset[]>;
    /** Adds or replaces assets by path. */
    putAssets(projectId: string, assets: StoredAsset[]): Promise<void>;
    /** Deletes assets by path; paths it does not have are ignored. */
    deleteAssets(projectId: string, paths: string[]): Promise<void>;

    /** A project's saved scene, or null when it was never saved. */
    loadScene(projectId: string): Promise<StoredScene | null>;
    /** Replaces a project's saved scene. */
    saveScene(projectId: string, scene: StoredScene): Promise<void>;

    /** How much storage projects use. */
    estimate(): Promise<StorageEstimate>;
    /** Asks the browser to keep the data even under storage pressure; resolves to the result. */
    requestPersistence(): Promise<boolean>;
}

/** A byte count for people: `512 B`, `1.5 KB`, `20 MB`; `—` when unknown. */
export function formatBytes(bytes: number | null | undefined): string {
    if (bytes == null) return '—';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
