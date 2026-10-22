import {IDBFactory} from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import {IndexedDbProjectStore} from '../src/core/indexedDbProjectStore';
import {StoredAsset} from '../src/core/projectStore';
import {installFilePolyfills} from './polyfills';

installFilePolyfills();

const PNG = `data:image/png;base64,${Buffer.from('png-bytes').toString('base64')}`;
const OTHER = `data:image/png;base64,${Buffer.from('other').toString('base64')}`;

function asset(path: string, url = PNG): StoredAsset {
    return {path, name: path, json: {object: {type: 'Group'}, images: [{uuid: 'i', url}]}, missingFiles: []};
}

/** Counts the file records the store holds for one project. */
function countFiles(projectId: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const open = indexedDB.open('babylon-quarks-editor');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result;
            const count = db.transaction('files').objectStore('files').index('projectId').count(projectId);
            count.onsuccess = () => {
                db.close();
                resolve(count.result);
            };
            count.onerror = () => reject(count.error);
        };
    });
}

describe('IndexedDB project store', () => {
    let store: IndexedDbProjectStore;
    let afterNavigator: (() => void) | null = null;
    afterEach(() => {
        afterNavigator?.();
        afterNavigator = null;
    });

    beforeEach(() => {
        (globalThis as {indexedDB: IDBFactory}).indexedDB = new IDBFactory();
        store = new IndexedDbProjectStore();
    });

    it('creates, lists, renames and deletes projects', async () => {
        const a = await store.createProject('A');
        const b = await store.createProject('B');
        await store.renameProject(a.id, 'A2');
        const listed = await store.listProjects();
        expect(listed.map((p) => p.name)).toEqual(['A2', 'B']);
        expect(listed[0].updatedAt).toBeGreaterThanOrEqual(b.updatedAt);
        expect(await store.getProject('nope')).toBeNull();
        await store.renameProject('nope', 'x');
        await store.deleteProject(a.id);
        expect((await store.listProjects()).map((p) => p.id)).toEqual([b.id]);
    });

    it('stores a texture once per project and gives it back as a data uri', async () => {
        const project = await store.createProject('P');
        await store.putAssets(project.id, [asset('a.json'), asset('b.json'), asset('c.json', OTHER)]);
        const loaded = await store.loadAssets(project.id);
        expect(loaded.map((a) => a.path).sort()).toEqual(['a.json', 'b.json', 'c.json']);
        const urls = loaded.map((a) => (a.json as {images: Array<{url: string}>}).images[0].url);
        expect(urls.sort()).toEqual([OTHER, PNG, PNG].sort());
        const meta = (await store.getProject(project.id))!;
        expect(meta.assetCount).toBe(3);
        // Two distinct files are kept, the shared one only once.
        expect(await countFiles(project.id)).toBe(2);
        const twin = await store.createProject('Q');
        await store.putAssets(twin.id, [asset('a.json'), asset('b.json')]);
        const twinMeta = (await store.getProject(twin.id))!;
        expect(meta.sizeBytes).toBeGreaterThan(twinMeta.sizeBytes + 'other'.length);
        expect(await countFiles(twin.id)).toBe(1);

        await store.deleteAssets(project.id, ['c.json']);
        const after = (await store.getProject(project.id))!;
        expect(after.assetCount).toBe(2);
        expect(after.sizeBytes).toBeLessThan(meta.sizeBytes);
    });

    it('saves and loads the scene, and keeps a file the scene still references', async () => {
        const project = await store.createProject('P');
        await store.putAssets(project.id, [asset('a.json')]);
        await store.saveScene(project.id, {
            savedAt: 5,
            entries: [{name: 'A', assetPath: 'a.json', json: asset('x', PNG).json, visible: true}],
        });
        await store.deleteAssets(project.id, ['a.json']);
        const scene = (await store.loadScene(project.id))!;
        expect(scene.savedAt).toBe(5);
        expect(scene.entries[0]).toMatchObject({name: 'A', assetPath: 'a.json', visible: true});
        expect((scene.entries[0].json as {images: Array<{url: string}>}).images[0].url).toBe(PNG);
        expect(await store.loadScene('nope')).toBeNull();
    });

    it('duplicates a project with its assets, files and scene', async () => {
        const project = await store.createProject('P');
        await store.putAssets(project.id, [asset('a.json')]);
        await store.saveScene(project.id, {savedAt: 1, entries: []});
        const copy = await store.duplicateProject(project.id, 'Copy');
        expect(copy.id).not.toBe(project.id);
        expect(copy.name).toBe('Copy');
        const assets = await store.loadAssets(copy.id);
        expect((assets[0].json as {images: Array<{url: string}>}).images[0].url).toBe(PNG);
        expect((await store.loadScene(copy.id))!.savedAt).toBe(1);
        await store.deleteProject(project.id);
        expect((await store.loadAssets(copy.id)).length).toBe(1);
        await expect(store.duplicateProject('nope', 'x')).rejects.toThrow('Project not found.');
    });

    it('reads a missing file back as an empty url', async () => {
        const project = await store.createProject('P');
        await store.putAssets(project.id, [asset('a.json')]);
        const db = await (store as unknown as {db(): Promise<IDBDatabase>}).db();
        await new Promise<void>((resolve) => {
            const tx = db.transaction('files', 'readwrite');
            tx.objectStore('files').clear();
            tx.oncomplete = () => resolve();
        });
        const fresh = new IndexedDbProjectStore();
        const loaded = await fresh.loadAssets(project.id);
        expect((loaded[0].json as {images: Array<{url: string}>}).images[0].url).toBe('');
    });

    it('reports storage when the browser does, and none otherwise', async () => {
        const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
        afterNavigator = () => {
            if (original) Object.defineProperty(globalThis, 'navigator', original);
            else delete (globalThis as {navigator?: unknown}).navigator;
        };
        expect(await store.estimate()).toEqual({usage: null, quota: null, persisted: false});
        expect(await store.requestPersistence()).toBe(false);
        Object.defineProperty(globalThis, 'navigator', {
            configurable: true,
            value: {
                storage: {
                    estimate: async () => ({usage: 10, quota: 100}),
                    persisted: async () => true,
                    persist: async () => true,
                },
            },
        });
        expect(await store.estimate()).toEqual({usage: 10, quota: 100, persisted: true});
        expect(await store.requestPersistence()).toBe(true);
    });
});
