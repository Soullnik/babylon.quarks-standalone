/** @jest-environment jsdom */
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {PointerEventTypes} from '@babylonjs/core/Events/pointerEvents';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {ConstantValue, serializeEffect} from 'babylon.quarks';
import {setAssetDragSession} from '../src/core/assetDragSession';
import type {EffectAsset} from '../src/core/assets';
import {ASSET_DRAG_MIME} from '../src/core/assetTree';
import type {EffectBinding} from '../src/core/binding';
import {
    createEditorSession,
    nodeAtIndex,
    nodeIndexInEffect,
    normalizeAssetPath,
    type EditorSession,
    type EditorSessionOptions,
    type EditorSessionView,
    type EffectEditorHostHandle,
} from '../src/core/editorSession';
import {createPlaybackState, markFocusFinished} from '../src/core/playback';
import type {ProjectStore, StoredAsset, StoredScene} from '../src/core/projectStore';
import {createChildSystem} from '../src/core/systems';
import {notifyTransformChanged} from '../src/core/transformStore';
import {GalleryViewportPicker} from '../src/core/viewportPicker';
import {makeSystem} from './helpers';
import {fileAt, installFilePolyfills} from './polyfills';

installFilePolyfills();
// jsdom's Blob has no text(); asset import reads files with it.
if (!Blob.prototype.text) {
    Blob.prototype.text = function (this: Blob) {
        return new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsText(this);
        });
    };
}

/** A view that records what the session told it. */
function recordingView() {
    const state = {
        binding: null as EffectBinding | null,
        selected: null as TransformNode | null,
        focusedRoot: null as TransformNode | null,
        entries: [] as unknown[],
        assets: [] as EffectAsset[],
        visible: [] as number[],
        solo: null as number | null,
        loading: [] as unknown[],
        sceneDirty: false,
        projectLoaded: 0,
        prefab: null as {name: string; path: string} | null,
        prefabDirty: false,
        prefabSwitch: null as {id: number; name: string} | null,
        dragHover: null as {label: string; count: number} | null,
        revealed: 0,
        refreshes: 0,
        toasts: [] as string[],
        messages: [] as Array<{title: string; text: string}>,
        handles: [] as EffectEditorHostHandle[],
        frames: [] as Array<{fps: number; counter: string}>,
    };
    const view: EditorSessionView = {
        bindingChanged: (b) => (state.binding = b),
        selectedNodeChanged: (n) => (state.selected = n),
        focusedRootChanged: (r) => (state.focusedRoot = r),
        entriesChanged: (e) => (state.entries = e),
        assetsChanged: (a) => (state.assets = a),
        visibleChanged: (v) => (state.visible = v),
        soloChanged: (s) => (state.solo = s),
        assetsLoadingChanged: (p) => state.loading.push(p),
        sceneDirtyChanged: (d) => (state.sceneDirty = d),
        projectLoaded: () => state.projectLoaded++,
        prefabChanged: (p) => (state.prefab = p),
        prefabDirtyChanged: (d) => (state.prefabDirty = d),
        prefabSwitchRequested: (a) => (state.prefabSwitch = a),
        dragHoverChanged: (h) => (state.dragHover = h),
        assetsRevealed: () => state.revealed++,
        refresh: () => state.refreshes++,
        toast: (t) => state.toasts.push(t),
        message: (title, text) => state.messages.push({title, text}),
        ready: (h) => state.handles.push(h),
        frame: (f) => state.frames.push(f),
    };
    return {state, view};
}

/** A project store in memory. */
function memoryStore(scene: StoredScene | null = null, assets: StoredAsset[] = []) {
    const saved = {scene, assets: [...assets], deleted: [] as string[]};
    const store = {
        loadAssets: jest.fn(async () => saved.assets),
        loadScene: jest.fn(async () => saved.scene),
        putAssets: jest.fn(async (_id: string, put: StoredAsset[]) => {
            for (const asset of put) {
                saved.assets = [...saved.assets.filter((a) => a.path !== asset.path), asset];
            }
        }),
        deleteAssets: jest.fn(async (_id: string, paths: string[]) => {
            saved.deleted.push(...paths);
        }),
        saveScene: jest.fn(async (_id: string, next: StoredScene) => {
            saved.scene = next;
        }),
    };
    return {store: store as unknown as ProjectStore, mocks: store, saved};
}

/** Quarks JSON of a one-system effect named `name`. */
function effectJson(name = 'Spark'): Record<string, unknown> {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const root = new TransformNode(name, scene);
    const system = makeSystem(scene);
    system.emitter.name = name;
    system.emitter.parent = root;
    const json = serializeEffect(root, {name}) as unknown as Record<string, unknown>;
    scene.dispose();
    engine.dispose();
    return json;
}

/** The last item of a list (`Array.prototype.at` is ES2022, past the test target). */
const last = <T>(items: readonly T[]): T | undefined => items[items.length - 1];

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('editor session', () => {
    let engine: NullEngine;
    let session: EditorSession | null = null;
    let renderLoop: (() => void) | null = null;
    let consoleError: jest.SpyInstance;
    let consoleWarn: jest.SpyInstance;

    beforeEach(() => {
        engine = new NullEngine();
        renderLoop = null;
        jest.spyOn(engine, 'runRenderLoop').mockImplementation((fn: () => void) => {
            renderLoop = fn;
        });
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        localStorage.clear();
    });
    afterEach(() => {
        session?.dispose();
        session = null;
        engine.dispose();
        consoleError.mockRestore();
        consoleWarn.mockRestore();
        setAssetDragSession(null);
    });

    function open(extra: Partial<EditorSessionOptions> = {}) {
        const recorded = recordingView();
        const playback = createPlaybackState();
        session = createEditorSession({engine, playback, view: recorded.view, ...extra});
        session.start();
        return {...recorded, playback, session};
    }

    it('starts once, disposes once, and drops a project load that finishes after dispose', async () => {
        const {store} = memoryStore({
            savedAt: 1,
            entries: [{name: 'Saved', assetPath: null, json: effectJson('Saved'), visible: true}],
        });
        const {state, session: s} = open({project: {id: 'p', name: 'Demo', store}});
        s.start();
        expect(engine.runRenderLoop).toHaveBeenCalledTimes(1);
        s.dispose();
        s.dispose();
        await flush();
        expect(s.sceneEntries).toHaveLength(0);
        expect(state.entries).toEqual([]);
        expect(state.handles).toHaveLength(0);
        expect(state.projectLoaded).toBe(0);
        session = null;
    });

    it('drops an asset import that finishes after dispose', async () => {
        const {state, session: s} = open();
        const pending = s.importAssets([fileAt('fx/Late.json', JSON.stringify(effectJson('Late')))]);
        s.dispose();
        await pending;
        expect(s.assets).toHaveLength(0);
        expect(state.assets).toEqual([]);
        session = null;
    });

    it('runs with only the view callbacks a host passes', () => {
        const ready = jest.fn();
        session = createEditorSession({engine, playback: createPlaybackState(), view: {ready}});
        session.start();
        expect(ready).toHaveBeenCalledTimes(1);
        expect(session.sceneEntries).toHaveLength(1);
    });

    it('starts with a default effect, focused, shown and handed to the host', () => {
        const {state, session: s} = open({defaultTextureUrl: 'textures/glow.png'});
        expect(s.sceneEntries).toHaveLength(1);
        expect(state.entries).toBe(s.sceneEntries);
        expect(state.visible).toEqual([s.sceneEntries[0].root.uniqueId]);
        expect(state.binding).toBe(s.binding);
        expect(state.selected).toBe(s.sceneEntries[0].root);
        expect(state.handles).toHaveLength(1);
        const handle = state.handles[0];
        expect(handle.binding).toBe(s.binding);
        expect(handle.scene).toBe(s.scene);
        expect(handle.renderer).toBe(s.renderer);
        expect(handle.history).toBe(s.history);
        expect(handle).not.toHaveProperty('importGallery');
        expect(JSON.parse(handle.exportJson()).metadata).toBeDefined();
        // In memory, nothing is ever dirty.
        expect(state.sceneDirty).toBe(true);
        expect(s.isPrefabOpen).toBe(false);
        expect(renderLoop).not.toBeNull();
    });

    it('opens the effect it is given, and adds it to Assets', () => {
        const {state, session: s} = open({effectJson: effectJson('Spark')});
        expect(s.sceneEntries).toHaveLength(1);
        expect(s.sceneEntries[0].name).toBe('Spark');
        expect(state.assets.map((a) => a.path)).toEqual(['_opened/Spark.json']);
    });

    it('refuses JSON without systems', () => {
        const {session: s} = open();
        expect(() => s.importJson({metadata: {}, object: {type: 'Group', uuid: 'x', children: []}})).toThrow(
            'No particle systems'
        );
    });

    it('replaces the scene on importJson', () => {
        const {state, session: s} = open();
        const before = s.sceneEntries[0];
        s.importJson(effectJson('Ice'));
        expect(s.sceneEntries).toHaveLength(1);
        expect(s.sceneEntries[0].name).toBe('Ice');
        expect(before.root.isDisposed()).toBe(true);
        expect(state.solo).toBeNull();
        expect(last(state.handles)!.binding.root).toBe(s.sceneEntries[0].root);
    });

    it('throws from the handle when nothing is focused', () => {
        const {state, session: s} = open();
        s.deleteEntry(s.sceneEntries[0]);
        expect(s.binding).toBeNull();
        expect(() => last(state.handles)!.binding).toThrow('No effect is focused');
        expect(() => s.makeHandle().exportJson()).toThrow('No effect is focused');
    });

    it('shows, hides and solos entries, and brings the others back when solo ends', () => {
        const {state, session: s} = open();
        s.createDefault();
        s.createDefault();
        const [a, b, c] = s.sceneEntries;
        expect(s.binding!.root).toBe(c.root);

        s.toggleVisible(b);
        expect(state.visible).toEqual([a.root.uniqueId, c.root.uniqueId]);
        s.toggleVisible(c);
        s.toggleVisible(c);
        expect(state.visible).toContain(c.root.uniqueId);

        s.toggleSolo(a);
        expect(state.solo).toBe(a.root.uniqueId);
        expect(state.visible).toEqual([a.root.uniqueId]);
        expect(s.binding!.root).toBe(a.root);
        s.toggleSolo(a);
        expect(state.solo).toBeNull();
        expect(new Set(state.visible)).toEqual(new Set([a.root.uniqueId, c.root.uniqueId]));

        // Solo of a hidden, already focused entry shows it.
        s.toggleSolo(b);
        expect(state.visible).toEqual([b.root.uniqueId]);
        s.toggleSolo(b);
        s.toggleSolo(b);
        // Deleting the solo entry ends solo first.
        s.deleteEntry(b);
        expect(state.solo).toBeNull();
        expect(s.sceneEntries).toEqual([a, c]);
        expect(s.binding!.root).toBe(c.root);
    });

    it('removes the focused effect with deleteFocused, and ignores entries it does not have', () => {
        const {session: s} = open();
        const entry = s.sceneEntries[0];
        s.deleteEntry({...entry});
        expect(s.sceneEntries).toHaveLength(1);
        expect(s.deleteFocused()).toBe(true);
        expect(s.sceneEntries).toHaveLength(0);
        expect(s.deleteFocused()).toBe(false);
    });

    it('marks the project scene dirty on every change, and clean once saved', async () => {
        const {store, mocks, saved} = memoryStore();
        const {state, session: s} = open({project: {store, id: 'p', name: 'P'}});
        await flush();
        expect(state.projectLoaded).toBe(1);
        expect(s.sceneEntries).toHaveLength(1);
        expect(state.sceneDirty).toBe(false);

        s.createDefault();
        expect(state.sceneDirty).toBe(true);
        expect(await s.saveScene()).toBe(true);
        expect(state.sceneDirty).toBe(false);
        expect(saved.scene!.entries).toHaveLength(2);
        // The first save explains what it saved; later ones only toast.
        expect(last(state.messages)!.title).toBe('Scene saved');
        notifyTransformChanged();
        expect(state.sceneDirty).toBe(true);
        expect(await s.saveScene()).toBe(true);
        expect(last(state.toasts)).toBe('Scene saved · assets unchanged');

        mocks.saveScene.mockRejectedValueOnce(new Error('disk full'));
        expect(await s.saveScene()).toBe(false);
        expect(last(state.messages)).toEqual({title: 'Save scene', text: 'disk full'});
    });

    it('does not save a scene without a project', async () => {
        const {session: s} = open();
        expect(await s.saveScene()).toBe(false);
    });

    it('reopens a saved scene with its visibility and asset links', async () => {
        const json = effectJson('Fire');
        const scene: StoredScene = {
            savedAt: 1,
            entries: [
                {name: 'Fire A', assetPath: 'fx/Fire.json', json, visible: true},
                {name: 'Fire B', assetPath: null, json, visible: false},
                {
                    name: 'Broken',
                    assetPath: null,
                    json: {metadata: {}, object: {type: 'Group', uuid: 'g'}},
                    visible: true,
                },
            ],
        };
        const {store} = memoryStore(scene, [{path: 'fx/Fire.json', name: 'Fire', json, missingFiles: ['a.png']}]);
        const {state, session: s} = open({project: {store, id: 'p', name: 'P'}});
        await flush();
        expect(s.sceneEntries.map((e) => e.name)).toEqual(['Fire A', 'Fire B']);
        expect(s.sceneEntries[0].assetId).toBe(state.assets[0].id);
        expect(s.sceneEntries[1].assetId).toBeNull();
        expect(s.sceneEntries[1].path).toBe('_created/Fire B.json');
        expect(state.visible).toEqual([s.sceneEntries[0].root.uniqueId]);
        expect(s.assets[0]).toMatchObject({path: 'fx/Fire.json', missingFiles: ['a.png']});
        expect(state.sceneDirty).toBe(false);
    });

    it('reports a project that cannot be opened', async () => {
        const {store, mocks} = memoryStore();
        mocks.loadAssets.mockRejectedValueOnce(new Error('gone'));
        const {state} = open({project: {store, id: 'p', name: 'P'}});
        await flush();
        expect(state.messages).toEqual([{title: 'Open project', text: 'gone'}]);
        expect(state.projectLoaded).toBe(1);
    });

    it('imports asset files, persists the new ones and refuses an import with nothing new', async () => {
        const {store, mocks} = memoryStore();
        const {state, session: s} = open({project: {store, id: 'p', name: 'P'}});
        await flush();
        const file = fileAt('Burst.json', JSON.stringify(effectJson('Burst')));
        await s.importAssets([file]);
        expect(state.assets.map((a) => a.path)).toEqual(['Burst.json']);
        expect(state.loading[0]).toEqual({done: 0, total: 0, loaded: 0, failed: 0});
        expect(last(state.loading)).toBeNull();
        expect(state.revealed).toBe(1);
        expect(mocks.putAssets).toHaveBeenCalledTimes(1);
        await expect(s.importAssets([file])).rejects.toThrow('already in Assets');
        await expect(s.importAssets([fileAt('empty.json', '{}')])).rejects.toThrow('No particle effects');
    });

    it('reports a failed write to the project', async () => {
        const {store, mocks} = memoryStore();
        const {state, session: s} = open({project: {store, id: 'p', name: 'P'}});
        await flush();
        mocks.putAssets.mockRejectedValueOnce(new Error('quota'));
        s.saveEntryAsAsset(s.sceneEntries[0], 'Fire/Big');
        await flush();
        expect(last(state.messages)).toEqual({title: 'Project storage', text: 'quota'});
    });

    it('saves an entry as a new asset at a free path and links the entry to it', () => {
        const {state, session: s} = open();
        const entry = s.sceneEntries[0];
        s.saveEntryAsAsset(entry, ' Fire \\ Big ');
        s.saveEntryAsAsset(entry, 'Fire/Big.json');
        s.saveEntryAsAsset(entry, '');
        expect(state.assets.map((a) => a.path)).toEqual(['Fire/Big.json', 'Fire/Big 2.json', 'Effect.json']);
        expect(entry.assetId).toBe(state.assets[2].id);
        expect(last(state.toasts)).toBe('Saved as asset “Effect”');
    });

    it('adds assets to the scene, by asset or by folder, and deletes them', async () => {
        const {store, mocks, saved} = memoryStore();
        const {state, session: s} = open({project: {store, id: 'p', name: 'P'}});
        await flush();
        s.saveEntryAsAsset(s.sceneEntries[0], 'fx/One');
        s.saveEntryAsAsset(s.sceneEntries[0], 'fx/Two');
        s.addToScene({kind: 'asset', id: state.assets[0].id});
        expect(s.sceneEntries).toHaveLength(2);
        s.addToScene({kind: 'folder', path: 'fx'});
        expect(s.sceneEntries).toHaveLength(4);
        s.deleteAssets({kind: 'asset', id: state.assets[0].id});
        await flush();
        expect(state.assets.map((a) => a.path)).toEqual(['fx/Two.json']);
        expect(mocks.deleteAssets).toHaveBeenCalledWith('p', ['fx/One.json']);
        expect(saved.deleted).toEqual(['fx/One.json']);
    });

    it('reports assets that fail to load when added', () => {
        const {state, session: s} = open();
        s.saveEntryAsAsset(s.sceneEntries[0], 'Good');
        // An asset whose JSON has no systems is skipped.
        state.assets[0].json = {metadata: {}, object: {type: 'Group', uuid: 'g', children: []}};
        s.addToScene({kind: 'asset', id: state.assets[0].id});
        expect(last(state.messages)!.title).toBe('Add to scene');
        expect(s.sceneEntries).toHaveLength(1);
    });

    it('previews and places a drag of assets from the drawer', () => {
        const {state, session: s} = open();
        s.saveEntryAsAsset(s.sceneEntries[0], 'Dragged');
        s.previewDrop(10, 10);
        expect(state.dragHover).toBeNull();
        setAssetDragSession({kind: 'folder', path: 'missing'});
        s.previewDrop(10, 10);
        expect(state.dragHover).toBeNull();
        setAssetDragSession({kind: 'asset', id: state.assets[0].id});
        s.previewDrop(10, 10);
        expect(state.dragHover).toEqual({label: 'Dragged', count: 1});
        const data = new Map<string, string>([
            [ASSET_DRAG_MIME, JSON.stringify({kind: 'asset', id: state.assets[0].id})],
        ]);
        s.placeDrop(10, 10, {getData: (type: string) => data.get(type) ?? ''} as unknown as DataTransfer);
        expect(state.dragHover).toBeNull();
        expect(s.sceneEntries).toHaveLength(2);
        // Nothing dragged: nothing placed.
        s.placeDrop(10, 10);
        expect(s.sceneEntries).toHaveLength(2);
    });

    it('edits an asset as a prefab, then restores the scene and camera', async () => {
        const {store, mocks} = memoryStore();
        const {state, session: s} = open({project: {store, id: 'p', name: 'P'}});
        await flush();
        const sceneEntry = s.sceneEntries[0];
        s.saveEntryAsAsset(sceneEntry, 'fx/Prefab');
        s.createDefault();
        s.toggleSolo(s.sceneEntries[1]);
        const asset = state.assets[0];
        const alpha = s.camera.alpha;

        s.openPrefab(asset.id);
        expect(s.isPrefabOpen).toBe(true);
        expect(state.solo).toBeNull();
        expect(state.prefab).toEqual({name: 'Prefab', path: 'fx/Prefab.json'});
        expect(s.sceneEntries).toHaveLength(1);
        expect(s.sceneEntries[0]).not.toBe(sceneEntry);
        expect(s.prefabInstanceCount()).toBe(1);
        s.openPrefab(asset.id);
        expect(s.sceneEntries).toHaveLength(1);

        // The scene's actions wait for the scene.
        s.createDefault();
        expect(last(state.toasts)).toMatch(/go back to the scene/);
        s.addToScene({kind: 'asset', id: asset.id});
        s.toggleSolo(s.sceneEntries[0]);
        s.deleteEntry(s.sceneEntries[0]);
        expect(s.deleteFocused()).toBe(false);
        expect(s.sceneEntries).toHaveLength(1);
        expect(await s.saveScene()).toBe(false);

        const sceneDirty = state.sceneDirty;
        s.binding!.apply((system) => (system.startLife = new ConstantValue(4)));
        expect(state.prefabDirty).toBe(true);
        expect(state.sceneDirty).toBe(sceneDirty);
        s.overwritePrefab();
        expect(state.prefabDirty).toBe(false);
        expect(mocks.putAssets).toHaveBeenLastCalledWith('p', [expect.objectContaining({path: 'fx/Prefab.json'})]);
        expect(JSON.stringify(state.assets[0].json)).toContain('"startLife":{"type":"ConstantValue","value":4}');

        s.binding!.markChanged();
        s.savePrefabAsNew('fx/Copy');
        expect(state.prefab).toEqual({name: 'Copy', path: 'fx/Copy.json'});
        expect(s.prefabInstanceCount()).toBe(0);

        s.camera.alpha = alpha + 1;
        s.closePrefab();
        expect(s.isPrefabOpen).toBe(false);
        expect(state.prefab).toBeNull();
        expect(s.sceneEntries).toHaveLength(2);
        expect(s.sceneEntries[0]).toBe(sceneEntry);
        expect(s.camera.alpha).toBeCloseTo(alpha);
        s.closePrefab();
    });

    it('asks before swapping a prefab with unsaved edits, and swaps in place when told to', () => {
        const {state, session: s} = open();
        s.saveEntryAsAsset(s.sceneEntries[0], 'A');
        s.saveEntryAsAsset(s.sceneEntries[0], 'B');
        const [a, b] = state.assets;
        s.openPrefab(a.id);
        s.binding!.markChanged();
        s.openPrefab(b.id);
        expect(state.prefabSwitch).toEqual({id: b.id, name: 'B'});
        expect(state.prefab!.name).toBe('A');
        s.openPrefab(b.id, true);
        expect(state.prefab!.name).toBe('B');
        expect(state.prefabDirty).toBe(false);
        expect(s.sceneEntries).toHaveLength(1);
        s.closePrefab();
        expect(s.sceneEntries).toHaveLength(1);
        // Unknown assets and assets without systems do not open.
        s.openPrefab(-5);
        state.assets[0].json = {metadata: {}, object: {type: 'Group', uuid: 'g', children: []}};
        s.openPrefab(state.assets[0].id);
        expect(last(state.messages)!.title).toBe('Open prefab');
        expect(s.isPrefabOpen).toBe(false);
    });

    it('does nothing with prefab saves outside prefab mode', () => {
        const {state, session: s} = open();
        s.overwritePrefab();
        s.savePrefabAsNew('X');
        expect(state.assets).toHaveLength(0);
        expect(s.prefabInstanceCount()).toBe(0);
    });

    it('undoes and redoes by rebuilding the entry in place, keeping the selected node and solo', () => {
        const {state, session: s} = open();
        s.createDefault();
        const first = s.sceneEntries[0];
        s.focusEntry(first, false);
        s.toggleSolo(first);
        const child = createChildSystem(s.binding!.system, {name: 'Child'});
        s.renderer.addSystem(child);
        s.binding!.markChanged();
        const childNode = child.emitter as TransformNode;
        const index = nodeIndexInEffect(first.root, childNode);
        expect(index).toBeGreaterThan(0);

        s.binding!.apply((system) => (system.startLife = new ConstantValue(7)));
        const before = s.sceneEntries[0].root;
        s.historyStep(false);
        const rebuilt = s.sceneEntries[0];
        expect(rebuilt.root).not.toBe(before);
        expect(rebuilt.name).toBe(first.name);
        expect(state.solo).toBe(rebuilt.root.uniqueId);
        expect(state.focusedRoot).toBe(rebuilt.root);
        expect((rebuilt.systems[0].startLife as ConstantValue).value).not.toBe(7);
        s.historyStep(true);
        expect((s.sceneEntries[0].systems[0].startLife as ConstantValue).value).toBe(7);
        // Nothing left to redo.
        const refreshes = state.refreshes;
        s.historyStep(true);
        expect(state.refreshes).toBe(refreshes + 1);
    });

    it('keeps the selected node across an undo', () => {
        let selected: TransformNode | null = null;
        // An effect as it loads from JSON, so an undo rebuilds the same tree.
        const {state, session: s} = open({getSelectedNode: () => selected, effectJson: effectJson('Spark')});
        const child = createChildSystem(s.binding!.system, {name: 'Child'});
        s.renderer.addSystem(child);
        s.binding!.markChanged();
        selected = child.emitter as TransformNode;
        s.binding!.apply((system) => (system.startLife = new ConstantValue(3)));
        s.historyStep(false);
        expect(state.selected!.name).toBe('Child');
        expect(nodeAtIndex(s.binding!.root, 99)).toBe(s.binding!.root);
    });

    it('ignores undo without a focused effect', () => {
        const {state, session: s} = open();
        s.deleteFocused();
        const refreshes = state.refreshes;
        s.historyStep(false);
        expect(state.refreshes).toBe(refreshes);
    });

    it('keeps each effect its own undo history', () => {
        const {session: s} = open();
        s.createDefault();
        const [a, b] = s.sceneEntries;
        s.focusEntry(a, false);
        s.binding!.apply((system) => (system.startLife = new ConstantValue(2)));
        expect(s.history.canUndo).toBe(true);
        s.focusEntry(b, false);
        expect(s.history.canUndo).toBe(false);
        s.focusEntry(a, false);
        expect(s.history.canUndo).toBe(true);
    });

    it('simulates, counts and parks the focused effect in the render loop', () => {
        const {state, playback, session: s} = open();
        jest.spyOn(engine, 'getDeltaTime').mockReturnValue(100);
        s.binding!.apply((system) => (system.looping = false));
        for (let i = 0; i < 120; i++) renderLoop!();
        expect(state.frames.length).toBe(120);
        expect(last(state.frames)!.counter).toMatch(/s \/ .*s \(end\) · \d+ particles/);
        const id = s.binding!.root.uniqueId;
        expect(playback.focusFinishedByRoot.has(id)).toBe(true);

        // Paused, a queued step advances one frame.
        playback.stagePlaying = false;
        s.syncPlayback();
        playback.stepQueued = true;
        renderLoop!();
        expect(playback.stepQueued).toBe(false);
        playback.scrubbing = true;
        renderLoop!();

        // A looping effect shows ⟳.
        playback.scrubbing = false;
        playback.stagePlaying = true;
        playback.focusFinishedByRoot.clear();
        s.binding!.apply((system) => (system.looping = true));
        renderLoop!();
        expect(last(state.frames)!.counter).toMatch(/⟳/);

        // With nothing focused the counter only counts.
        s.deleteFocused();
        renderLoop!();
        expect(last(state.frames)!.counter).toMatch(/^\d+ particles$/);
    });

    it('stops simulating hidden effects and keeps finished focus marks per effect', () => {
        const {playback, session: s} = open();
        const id = s.binding!.root.uniqueId;
        markFocusFinished(playback, id);
        s.toggleVisible(s.sceneEntries[0]);
        expect(playback.focusFinishedByRoot.has(id)).toBe(false);
        renderLoop!();
    });

    it('focuses an effect clicked in the viewport and highlights the one under the pointer', () => {
        const pick = jest.spyOn(GalleryViewportPicker.prototype, 'pick');
        const hover = jest.spyOn(GalleryViewportPicker.prototype, 'setHover');
        let dragging = false;
        const {state, session: s} = open({isAssetDragActive: () => dragging});
        s.createDefault();
        const [a, b] = s.sceneEntries;
        const send = (type: number, button = 0) =>
            s.scene.onPointerObservable.notifyObservers({type, event: {clientX: 1, clientY: 2, button}} as never);

        pick.mockReturnValue(a.root);
        send(PointerEventTypes.POINTERMOVE);
        expect(hover).toHaveBeenLastCalledWith(a.root);
        send(PointerEventTypes.POINTERDOWN, 2);
        expect(s.binding!.root).toBe(b.root);
        send(PointerEventTypes.POINTERDOWN);
        expect(s.binding!.root).toBe(a.root);
        expect(state.selected).toBe(a.root);
        send(PointerEventTypes.POINTERMOVE);
        expect(hover).toHaveBeenLastCalledWith(null);

        pick.mockReturnValue(null);
        send(PointerEventTypes.POINTERDOWN);
        expect(s.binding!.root).toBe(a.root);
        dragging = true;
        pick.mockReturnValue(b.root);
        send(PointerEventTypes.POINTERDOWN);
        expect(s.binding!.root).toBe(a.root);
        pick.mockRestore();
        hover.mockRestore();
    });

    it('frees what it built on dispose', () => {
        const {session: s} = open();
        const scene = s.scene;
        s.dispose();
        session = null;
        expect(scene.isDisposed).toBe(true);
    });
});

describe('asset paths', () => {
    it('normalises typed asset paths', () => {
        expect(normalizeAssetPath('a\\b/ c ')).toBe('a/b/c.json');
        expect(normalizeAssetPath('x.JSON')).toBe('x.JSON');
        expect(normalizeAssetPath('//')).toBe('Effect.json');
    });

    it('finds nodes by their place in an effect tree', () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const root = new TransformNode('root', scene);
        const child = new TransformNode('child', scene);
        child.parent = root;
        expect(nodeIndexInEffect(root, null)).toBe(0);
        expect(nodeIndexInEffect(root, root)).toBe(0);
        expect(nodeIndexInEffect(root, child)).toBe(1);
        expect(nodeAtIndex(root, 0)).toBe(root);
        expect(nodeAtIndex(root, 1)).toBe(child);
        scene.dispose();
        engine.dispose();
    });
});
