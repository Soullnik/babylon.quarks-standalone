import type {
    ProjectMeta,
    ProjectStore,
    StorageEstimate,
    StoredAsset,
    StoredScene,
    StoredSceneEntry,
} from './projectStore.js';

const DB_NAME = 'babylon-quarks-editor';
const DB_VERSION = 1;
const FILE_REF = 'quarks-file:';
const FILE_REF_PATTERN = /quarks-file:([0-9a-z]+)/g;

interface AssetRecord extends StoredAsset {
    projectId: string;
}
interface FileRecord {
    projectId: string;
    hash: string;
    blob: Blob;
}
interface SceneRecord extends StoredScene {
    projectId: string;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function done(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
}

function newId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Content hash of a data URI, so the same texture is stored once per project. */
async function hashString(text: string): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
    }
    // Insecure contexts have no crypto.subtle: a 53-bit string hash (cyrb53) twice, salted.
    const cyrb53 = (seed: number) => {
        let h1 = 0xdeadbeef ^ seed;
        let h2 = 0x41c6ce57 ^ seed;
        for (let i = 0; i < text.length; i++) {
            const ch = text.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
    };
    return `${cyrb53(1)}${cyrb53(2)}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

function imagesOf(json: unknown): Array<{url?: unknown}> {
    const images = (json as {images?: unknown} | null)?.images;
    return Array.isArray(images) ? images : [];
}

/**
 * Projects in the browser's IndexedDB. Texture data URIs are pulled out of the effect JSON into
 * a per-project file store keyed by content hash — 50 effects sharing a texture store it once —
 * and put back as data URIs on load, so the editor only ever sees self-contained effects.
 */
export class IndexedDbProjectStore implements ProjectStore {
    private dbPromise: Promise<IDBDatabase> | null = null;
    /** data URI → hash, so re-saving unchanged textures skips hashing. */
    private readonly hashByDataUrl = new Map<string, string>();
    /** `${projectId}/${hash}` → data URI, so every effect sharing a file gets the same string. */
    private readonly dataUrlByFile = new Map<string, Promise<string | null>>();

    private db(): Promise<IDBDatabase> {
        if (!this.dbPromise) {
            this.dbPromise = new Promise((resolve, reject) => {
                const open = indexedDB.open(DB_NAME, DB_VERSION);
                open.onupgradeneeded = () => {
                    const db = open.result;
                    db.createObjectStore('projects', {keyPath: 'id'});
                    db.createObjectStore('assets', {keyPath: ['projectId', 'path']}).createIndex(
                        'projectId',
                        'projectId'
                    );
                    db.createObjectStore('files', {keyPath: ['projectId', 'hash']}).createIndex(
                        'projectId',
                        'projectId'
                    );
                    db.createObjectStore('scenes', {keyPath: 'projectId'});
                };
                open.onsuccess = () => resolve(open.result);
                open.onerror = () => reject(open.error);
            });
        }
        return this.dbPromise;
    }

    // ---- projects -------------------------------------------------------------------------

    async listProjects(): Promise<ProjectMeta[]> {
        const db = await this.db();
        const all = await request<ProjectMeta[]>(db.transaction('projects').objectStore('projects').getAll());
        return all.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    async getProject(id: string): Promise<ProjectMeta | null> {
        const db = await this.db();
        return (
            (await request<ProjectMeta | undefined>(db.transaction('projects').objectStore('projects').get(id))) ?? null
        );
    }

    async createProject(name: string): Promise<ProjectMeta> {
        const now = Date.now();
        const meta: ProjectMeta = {id: newId(), name, createdAt: now, updatedAt: now, assetCount: 0, sizeBytes: 0};
        const db = await this.db();
        const tx = db.transaction('projects', 'readwrite');
        tx.objectStore('projects').put(meta);
        await done(tx);
        return meta;
    }

    async renameProject(id: string, name: string): Promise<void> {
        const meta = await this.getProject(id);
        if (!meta) return;
        const db = await this.db();
        const tx = db.transaction('projects', 'readwrite');
        tx.objectStore('projects').put({...meta, name, updatedAt: Date.now()});
        await done(tx);
    }

    async duplicateProject(id: string, name: string): Promise<ProjectMeta> {
        const source = await this.getProject(id);
        if (!source) throw new Error('Project not found.');
        const db = await this.db();
        const read = db.transaction(['assets', 'files', 'scenes']);
        const [assets, files, scene] = await Promise.all([
            request<AssetRecord[]>(read.objectStore('assets').index('projectId').getAll(id)),
            request<FileRecord[]>(read.objectStore('files').index('projectId').getAll(id)),
            request<SceneRecord | undefined>(read.objectStore('scenes').get(id)),
        ]);
        const now = Date.now();
        const meta: ProjectMeta = {...source, id: newId(), name, createdAt: now, updatedAt: now};
        const tx = db.transaction(['projects', 'assets', 'files', 'scenes'], 'readwrite');
        tx.objectStore('projects').put(meta);
        for (const asset of assets) tx.objectStore('assets').put({...asset, projectId: meta.id});
        for (const file of files) tx.objectStore('files').put({...file, projectId: meta.id});
        if (scene) tx.objectStore('scenes').put({...scene, projectId: meta.id});
        await done(tx);
        return meta;
    }

    async deleteProject(id: string): Promise<void> {
        const db = await this.db();
        const tx = db.transaction(['projects', 'assets', 'files', 'scenes'], 'readwrite');
        tx.objectStore('projects').delete(id);
        tx.objectStore('scenes').delete(id);
        for (const name of ['assets', 'files'] as const) {
            const keys = await request(tx.objectStore(name).index('projectId').getAllKeys(id));
            for (const key of keys) tx.objectStore(name).delete(key);
        }
        await done(tx);
        for (const key of [...this.dataUrlByFile.keys()]) {
            if (key.startsWith(`${id}/`)) this.dataUrlByFile.delete(key);
        }
    }

    // ---- assets ---------------------------------------------------------------------------

    async loadAssets(projectId: string): Promise<StoredAsset[]> {
        const db = await this.db();
        const records = await request<AssetRecord[]>(
            db.transaction('assets').objectStore('assets').index('projectId').getAll(projectId)
        );
        return Promise.all(
            records.map(async ({path, name, json, missingFiles}) => ({
                path,
                name,
                json: await this.unpack(projectId, json),
                missingFiles,
            }))
        );
    }

    async putAssets(projectId: string, assets: StoredAsset[]): Promise<void> {
        const files = new Map<string, Blob>();
        const packed = await Promise.all(
            assets.map(async (asset) => ({...asset, projectId, json: await this.pack(asset.json, files)}))
        );
        const db = await this.db();
        const tx = db.transaction(['assets', 'files'], 'readwrite');
        for (const record of packed) tx.objectStore('assets').put(record);
        this.writeFiles(tx, projectId, files);
        await done(tx);
        await this.refresh(projectId);
    }

    async deleteAssets(projectId: string, paths: string[]): Promise<void> {
        const db = await this.db();
        const tx = db.transaction('assets', 'readwrite');
        for (const path of paths) tx.objectStore('assets').delete([projectId, path]);
        await done(tx);
        await this.refresh(projectId);
    }

    // ---- scene ----------------------------------------------------------------------------

    async loadScene(projectId: string): Promise<StoredScene | null> {
        const db = await this.db();
        const record = await request<SceneRecord | undefined>(
            db.transaction('scenes').objectStore('scenes').get(projectId)
        );
        if (!record) return null;
        const entries = await Promise.all(
            record.entries.map(async (entry) => ({...entry, json: await this.unpack(projectId, entry.json)}))
        );
        return {entries, savedAt: record.savedAt};
    }

    async saveScene(projectId: string, scene: StoredScene): Promise<void> {
        const files = new Map<string, Blob>();
        const entries: StoredSceneEntry[] = await Promise.all(
            scene.entries.map(async (entry) => ({...entry, json: await this.pack(entry.json, files)}))
        );
        const db = await this.db();
        const tx = db.transaction(['scenes', 'files'], 'readwrite');
        tx.objectStore('scenes').put({projectId, entries, savedAt: scene.savedAt});
        this.writeFiles(tx, projectId, files);
        await done(tx);
        await this.refresh(projectId);
    }

    // ---- storage ----------------------------------------------------------------------------

    async estimate(): Promise<StorageEstimate> {
        const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
        const estimate = storage?.estimate ? await storage.estimate() : undefined;
        const persisted = storage?.persisted ? await storage.persisted() : false;
        return {usage: estimate?.usage ?? null, quota: estimate?.quota ?? null, persisted};
    }

    async requestPersistence(): Promise<boolean> {
        const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
        return storage?.persist ? storage.persist() : false;
    }

    // ---- files ------------------------------------------------------------------------------

    /** Clones `json` with each texture data URI replaced by a `quarks-file:<hash>` reference. */
    private async pack(json: unknown, files: Map<string, Blob>): Promise<unknown> {
        const clone = structuredClone(json);
        for (const image of imagesOf(clone)) {
            const url = image.url;
            if (typeof url !== 'string' || !url.startsWith('data:')) continue;
            let hash = this.hashByDataUrl.get(url);
            if (!hash) {
                hash = await hashString(url);
                this.hashByDataUrl.set(url, hash);
            }
            if (!files.has(hash)) {
                files.set(hash, await (await fetch(url)).blob());
            }
            image.url = FILE_REF + hash;
        }
        return clone;
    }

    /** Puts data URIs back in place of file references. */
    private async unpack(projectId: string, json: unknown): Promise<unknown> {
        for (const image of imagesOf(json)) {
            const url = image.url;
            if (typeof url !== 'string' || !url.startsWith(FILE_REF)) continue;
            const dataUrl = await this.readFile(projectId, url.slice(FILE_REF.length));
            image.url = dataUrl ?? '';
        }
        return json;
    }

    private readFile(projectId: string, hash: string): Promise<string | null> {
        const key = `${projectId}/${hash}`;
        let pending = this.dataUrlByFile.get(key);
        if (!pending) {
            pending = (async () => {
                const db = await this.db();
                const record = await request<FileRecord | undefined>(
                    db.transaction('files').objectStore('files').get([projectId, hash])
                );
                if (!record) return null;
                const dataUrl = await blobToDataUrl(record.blob);
                this.hashByDataUrl.set(dataUrl, hash);
                return dataUrl;
            })();
            this.dataUrlByFile.set(key, pending);
        }
        return pending;
    }

    private writeFiles(tx: IDBTransaction, projectId: string, files: Map<string, Blob>): void {
        for (const [hash, blob] of files) {
            tx.objectStore('files').put({projectId, hash, blob} satisfies FileRecord);
        }
    }

    /** Drops files nothing references any more and updates the project's size/count. */
    private async refresh(projectId: string): Promise<void> {
        const db = await this.db();
        const tx = db.transaction(['projects', 'assets', 'files', 'scenes'], 'readwrite');
        const [meta, assets, files, scene] = await Promise.all([
            request<ProjectMeta | undefined>(tx.objectStore('projects').get(projectId)),
            request<AssetRecord[]>(tx.objectStore('assets').index('projectId').getAll(projectId)),
            request<FileRecord[]>(tx.objectStore('files').index('projectId').getAll(projectId)),
            request<SceneRecord | undefined>(tx.objectStore('scenes').get(projectId)),
        ]);
        const text = JSON.stringify([assets.map((asset) => asset.json), scene?.entries ?? []]);
        const referenced = new Set([...text.matchAll(FILE_REF_PATTERN)].map((match) => match[1]));
        let size = text.length;
        for (const file of files) {
            if (referenced.has(file.hash)) {
                size += file.blob.size;
            } else {
                tx.objectStore('files').delete([projectId, file.hash]);
                this.dataUrlByFile.delete(`${projectId}/${file.hash}`);
            }
        }
        if (meta) {
            tx.objectStore('projects').put({
                ...meta,
                assetCount: assets.length,
                sizeBytes: size,
                updatedAt: Date.now(),
            });
        }
        await done(tx);
    }
}
