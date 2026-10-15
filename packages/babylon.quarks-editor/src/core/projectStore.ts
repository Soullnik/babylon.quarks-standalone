/** One editor project: a library of effect assets plus the scene built from them. */
export interface ProjectMeta {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    assetCount: number;
    /** Approximate bytes the project takes in storage (JSON + texture files). */
    sizeBytes: number;
}

/** An effect asset as the store keeps it. `json` is a self-contained Quarks effect. */
export interface StoredAsset {
    /** Relative path inside the project (`Fire/Explosion.json`) — the asset's key. */
    path: string;
    name: string;
    json: unknown;
    missingFiles: string[];
}

/** One effect instance in a saved scene. */
export interface StoredSceneEntry {
    name: string;
    /** Path of the asset it was made from, if any. */
    assetPath: string | null;
    /** The instance's own (possibly edited) effect, root transform included. */
    json: unknown;
    visible: boolean;
}

export interface StoredScene {
    entries: StoredSceneEntry[];
    savedAt: number;
}

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
    listProjects(): Promise<ProjectMeta[]>;
    getProject(id: string): Promise<ProjectMeta | null>;
    createProject(name: string): Promise<ProjectMeta>;
    renameProject(id: string, name: string): Promise<void>;
    duplicateProject(id: string, name: string): Promise<ProjectMeta>;
    deleteProject(id: string): Promise<void>;

    loadAssets(projectId: string): Promise<StoredAsset[]>;
    /** Adds or replaces assets by path. */
    putAssets(projectId: string, assets: StoredAsset[]): Promise<void>;
    deleteAssets(projectId: string, paths: string[]): Promise<void>;

    loadScene(projectId: string): Promise<StoredScene | null>;
    saveScene(projectId: string, scene: StoredScene): Promise<void>;

    estimate(): Promise<StorageEstimate>;
    /** Asks the browser to keep the data even under storage pressure; resolves to the result. */
    requestPersistence(): Promise<boolean>;
}

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
