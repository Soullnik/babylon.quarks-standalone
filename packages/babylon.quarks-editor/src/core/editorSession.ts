import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera.js';
// scene.pick lives in Ray's side effect (Babylon 9.31 no longer pulls it in); gizmos pick through it.
import '@babylonjs/core/Culling/ray.js';
import type {AbstractEngine} from '@babylonjs/core/Engines/abstractEngine.js';
import {PointerEventTypes} from '@babylonjs/core/Events/pointerEvents.js';
import {GizmoManager} from '@babylonjs/core/Gizmos/gizmoManager.js';
import {DirectionalLight} from '@babylonjs/core/Lights/directionalLight.js';
import type {Texture} from '@babylonjs/core/Materials/Textures/texture.js';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color.js';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import type {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder.js';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {UtilityLayerRenderer} from '@babylonjs/core/Rendering/utilityLayerRenderer.js';
import {Scene} from '@babylonjs/core/scene.js';
import {GridMaterial} from '@babylonjs/materials/grid/gridMaterial.js';
import {BatchedRenderer, QuarksUtil} from 'babylon.quarks';
import {getAssetDragSession, setAssetDragSession} from './assetDragSession.js';
import {describeAssetDrag, readAssetDrag, type AssetDragPayload} from './assetTree.js';
import {
    createEffectAsset,
    loadEffectAssets,
    mergeAssets,
    removeAssets,
    type AssetLoadProgress,
    type EffectAsset,
} from './assets.js';
import type {EffectBinding} from './binding.js';
import {createSceneDefaultEntry} from './defaultEffect.js';
import {serializeEffectTree} from './effectTree.js';
import {EmitterShapeWireframes} from './emitterShapeWireframe.js';
import {GalleryDropMarker} from './galleryDropMarker.js';
import {cancelGalleryCameraFocus, focusGalleryEntry} from './galleryLayout.js';
import {
    applyGalleryPlayback,
    countGalleryParticles,
    hasActivePreview,
    pauseFinishedPreviews,
} from './galleryPlayback.js';
import {pickGroundPosition, placeSceneEntriesAt, setSceneEntryVisible} from './galleryScene.js';
import {GallerySelectionMarker} from './gallerySelectionMarker.js';
import {EffectHistory, type HistoryStacks} from './history.js';
import {parseEffectFromJson} from './loadEffect.js';
import {
    clearFocusFinished,
    getFocusElapsed,
    isFocusFinished,
    markFocusFinished,
    setFocusElapsed,
    type PlaybackState,
} from './playback.js';
import type {ProjectStore, StoredAsset, StoredScene} from './projectStore.js';
import {logRenderMismatch} from './renderDebug.js';
import {bindingFromSceneEntry, disposeSceneEntry, instantiateSceneEntry, type SceneEntry} from './sceneEntries.js';
import {pauseFocus, scrubFocusToSettled} from './scrub.js';
import {computeTimelineRows, computeTimelineSpan} from './timeline.js';
import {notifyTransformChanged, subscribeTransform} from './transformStore.js';
import {GalleryViewportPicker} from './viewportPicker.js';

/** What an editor session hands its host once it is live, and again whenever the focused effect changes. */
export interface EffectEditorHostHandle {
    /** The focused effect's binding; reading it throws when no effect is focused. */
    binding: EffectBinding;
    /** Undo/redo of the focused effect. */
    history: EffectHistory;
    /** The editor's preview scene. */
    scene: Scene;
    /** The renderer every effect in the scene draws through. */
    renderer: BatchedRenderer;
    /** Replaces the scene with this effect (it is also added to Assets). */
    importJson: (json: unknown) => void;
    /** Imports effect files (and the texture/geometry files they reference) into Assets. */
    importAssets: (files: FileList | File[]) => Promise<void>;
    /** @deprecated Renamed to `importAssets`. */
    importGallery: (files: FileList | File[]) => Promise<void>;
    /** The focused effect as quarks JSON; throws when no effect is focused. */
    exportJson: () => string;
}

/** A project an editor session loads its assets and scene from, and saves them to. */
export interface EditorProject {
    /** Where the project lives. */
    store: ProjectStore;
    /** The project's id in `store`. */
    id: string;
    /** The project's display name. */
    name: string;
}

/** Which prefab is open, as the host shows it. */
export interface PrefabInfo {
    /** The asset's display name. */
    name: string;
    /** The asset's path in Assets. */
    path: string;
}

/** Live readouts a session writes every frame. */
export interface EditorFrameStats {
    /** Frames per second, rounded. */
    fps: number;
    /** Time and particle count of the focused effect, e.g. `1.2s / 3.0s · 240 particles`. */
    counter: string;
}

/**
 * How an editor session reports to its host. A React host passes its state setters. Callbacks
 * run synchronously from the action that changed the value, except `frame` (from the render
 * loop) and the results of asynchronous work: asset import progress and a project's load. None
 * runs after the session is disposed.
 */
export interface EditorSessionView {
    /** The focused effect's binding changed (`null`: nothing is focused). */
    bindingChanged(binding: EffectBinding | null): void;
    /** The node selected in the focused effect changed. */
    selectedNodeChanged(node: TransformNode | null): void;
    /** The focused effect's root changed. */
    focusedRootChanged(root: TransformNode | null): void;
    /** The scene's entries changed. */
    entriesChanged(entries: SceneEntry[]): void;
    /** Assets changed. */
    assetsChanged(assets: EffectAsset[]): void;
    /** The set of shown entries changed, by root `uniqueId`. */
    visibleChanged(rootIds: number[]): void;
    /** The entry shown alone changed (`null`: none). */
    soloChanged(rootId: number | null): void;
    /** An asset import started, progressed (a progress value) or ended (`null`). */
    assetsLoadingChanged(progress: AssetLoadProgress | null): void;
    /** The scene has unsaved changes, or no longer has. */
    sceneDirtyChanged(dirty: boolean): void;
    /** The project's scene finished loading, or failed to. */
    projectLoaded(): void;
    /** The open prefab changed (`null`: back to the scene). */
    prefabChanged(info: PrefabInfo | null): void;
    /** The open prefab has unsaved edits, or no longer has. */
    prefabDirtyChanged(dirty: boolean): void;
    /** Opening another asset waits on what to do with the open prefab's unsaved edits. */
    prefabSwitchRequested(asset: {id: number; name: string}): void;
    /** The asset drag hovering the viewport changed (`null`: none). */
    dragHoverChanged(hover: {label: string; count: number} | null): void;
    /** Something was added to Assets that the user should see. */
    assetsRevealed(): void;
    /** Something changed that has no state of its own, such as an undo stack; re-render. */
    refresh(): void;
    /** A short notice. */
    toast(text: string): void;
    /** A notice the user dismisses. */
    message(title: string, text: string): void;
    /** The session is live, or what it hands out changed. */
    ready(handle: EffectEditorHostHandle): void;
    /** A frame was drawn. */
    frame(stats: EditorFrameStats): void;
}

/** What an editor session is built from. */
export interface EditorSessionOptions {
    /** The engine to draw with; its rendering canvas, if any, drives the camera and picking. */
    engine: AbstractEngine;
    /** Playback state shared with the host's transport and timeline. */
    playback: PlaybackState;
    /** How the session reports to its host; a callback left out is not called. */
    view: Partial<EditorSessionView>;
    /** The project to load and save; without it the session works in memory only. */
    project?: EditorProject;
    /** Quarks JSON to open when there is no project; a default effect is created when omitted. */
    effectJson?: unknown;
    /** Texture loader for new default effects. */
    resolveTexture?: (url: string, scene: Scene) => Texture | null | undefined;
    /** Texture URL of new default effects. */
    defaultTextureUrl?: string;
    /** True while an asset is being dragged over the viewport; viewport picking pauses meanwhile. */
    isAssetDragActive?: () => boolean;
    /** The node selected in the host, kept across undo and redo. */
    getSelectedNode?: () => TransformNode | null;
}

/**
 * The editor's headless half: the preview scene, the effects placed in it, Assets, prefab mode,
 * the project's scene and undo, without any UI. `EffectEditorHost` is its React view; any
 * other host can drive it through these actions and {@link EditorSessionView}.
 */
export interface EditorSession {
    /** The engine the session draws with. */
    readonly engine: AbstractEngine;
    /** The preview scene. */
    readonly scene: Scene;
    /** The orbit camera. */
    readonly camera: ArcRotateCamera;
    /** The grid the effects stand on. */
    readonly ground: Mesh;
    /** The renderer every effect draws through. */
    readonly renderer: BatchedRenderer;
    /** Undo/redo of the focused effect. */
    readonly history: EffectHistory;
    /** The transform gizmos. */
    readonly gizmoManager: GizmoManager;
    /** The focused effect's binding, if any. */
    readonly binding: EffectBinding | null;
    /** The effects in the scene (in prefab mode, just the prefab's instance). */
    readonly sceneEntries: SceneEntry[];
    /** The shown entries, by root `uniqueId`. */
    readonly visibleRootIds: number[];
    /** Assets. */
    readonly assets: EffectAsset[];
    /** True while a prefab is open. */
    readonly isPrefabOpen: boolean;
    /** Imports effect files into Assets; throws when nothing new was found. */
    importAssets(files: FileList | File[]): Promise<void>;
    /** Replaces the scene with this effect, also added to Assets. */
    importJson(json: unknown): void;
    /** Focuses an entry and frames it. */
    focusEntry(entry: SceneEntry | null, moveCamera?: boolean): void;
    /** Shows or hides an entry. */
    toggleVisible(entry: SceneEntry): void;
    /** Shows an entry alone, or ends solo when it already is. */
    toggleSolo(entry: SceneEntry): void;
    /** Removes an entry from the scene. */
    deleteEntry(entry: SceneEntry): void;
    /** Removes the focused entry, if any; returns whether it did. */
    deleteFocused(): boolean;
    /** Adds a default effect at the camera target. */
    createDefault(): void;
    /** Where dragged assets would land, and what they are, for the drag preview. */
    previewDrop(clientX: number, clientY: number): void;
    /** Places dragged assets where they were dropped. */
    placeDrop(clientX: number, clientY: number, dataTransfer?: DataTransfer): void;
    /** Hides the drag preview while the drag goes on elsewhere. */
    hideDropPreview(): void;
    /** Hides the drag preview and forgets the drag, once it ended. */
    clearDropPreview(): void;
    /** Shows or hides wireframes of the focused effect's emitter shapes. */
    setEmitterWireframesVisible(visible: boolean): void;
    /** Adds assets at the camera target. */
    addToScene(payload: AssetDragPayload): void;
    /** Removes assets. */
    deleteAssets(payload: AssetDragPayload): void;
    /** Saves an entry as a new asset at `Folder/Name` and makes it an instance of it. */
    saveEntryAsAsset(entry: SceneEntry, path: string): void;
    /** Saves the scene to the project; resolves to false when it could not. */
    saveScene(): Promise<boolean>;
    /** Opens an asset on its own, setting the scene aside. */
    openPrefab(assetId: number, discardChanges?: boolean): void;
    /** Overwrites the open prefab's asset with the edits. */
    overwritePrefab(): void;
    /** Saves the open prefab as a new asset and keeps editing that one. */
    savePrefabAsNew(path: string): void;
    /** Leaves prefab mode without saving. */
    closePrefab(): void;
    /** Scene instances of the open prefab's asset. */
    prefabInstanceCount(): number;
    /** Undoes (`redo` false) or redoes a change to the focused effect. */
    historyStep(redo: boolean): void;
    /** Re-applies playback to the scene after the host changed `playback.stagePlaying`. */
    syncPlayback(): void;
    /** The handle a host hands to its embedder. */
    makeHandle(): EffectEditorHostHandle;
    /** Loads the project, or the initial effect, and starts the render loop. Later calls do nothing. */
    start(): void;
    /**
     * Stops the render loop and frees the scene, the markers and the gizmos. Work still in flight
     * (a project load, an asset import) is dropped when it finishes. The engine is the caller's.
     */
    dispose(): void;
}

const SCENE_SAVE_INFO_KEY = 'babylon.quarks-editor:scene-save-info-seen';

function toStoredAsset(asset: EffectAsset): StoredAsset {
    return {path: asset.path, name: asset.name, json: asset.json, missingFiles: asset.missingFiles};
}

/** `Folder/Name` typed by the user → a clean asset path ending in `.json`. */
export function normalizeAssetPath(input: string): string {
    const segments = input
        .replace(/\\/g, '/')
        .split('/')
        .map((part) => part.trim())
        .filter(Boolean);
    const path = segments.join('/') || 'Effect';
    return /\.json$/i.test(path) ? path : `${path}.json`;
}

/** Position of `node` in its effect tree (0 = root), to find the same node after a rebuild. */
export function nodeIndexInEffect(root: TransformNode, node: TransformNode | null): number {
    if (!node || node === root) return 0;
    return root.getDescendants(false).indexOf(node) + 1;
}

/** The node at `index` in an effect tree, as {@link nodeIndexInEffect} counts; the root when out of range. */
export function nodeAtIndex(root: TransformNode, index: number): TransformNode {
    if (index <= 0) return root;
    return (root.getDescendants(false)[index - 1] as TransformNode | undefined) ?? root;
}

function errorText(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/** Builds the editor's scene on `options.engine`; call `start()` once the host is ready for callbacks. */
export function createEditorSession(options: EditorSessionOptions): EditorSession {
    const {engine, playback} = options;
    let disposed = false;
    let started = false;
    /** The host's view, silenced once the session is disposed; missing callbacks are no-ops. */
    const view = new Proxy(options.view, {
        get: (target, key) => {
            const callback: unknown = Reflect.get(target, key);
            return (...args: unknown[]) => {
                if (!disposed && typeof callback === 'function') {
                    callback.apply(target, args);
                }
            };
        },
    }) as EditorSessionView;
    const canvas = engine.getRenderingCanvas();
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.03, 0.04, 0.09, 1);
    const camera = new ArcRotateCamera('cam', -Math.PI / 2, 1.15, 9, new Vector3(0, 1.4, 0), scene);
    if (canvas) {
        camera.attachControl(canvas, true);
    }
    camera.wheelDeltaPercentage = 0.01;

    // Mesh render mode particles are lit (billboard modes ignore these); the grid is visual
    // reference only and is not a physics collider.
    scene.ambientColor = new Color3(1, 1, 1);
    const sunLight = new DirectionalLight('sun', new Vector3(-1, -1, -1), scene);
    sunLight.intensity = 1.0;
    sunLight.diffuse = new Color3(1, 1, 1);
    sunLight.specular = new Color3(1, 1, 1);

    const groundMaterial = new GridMaterial('groundMaterial', scene);
    groundMaterial.majorUnitFrequency = 2;
    groundMaterial.minorUnitVisibility = 0.1;
    groundMaterial.gridRatio = 0.5;
    groundMaterial.backFaceCulling = false;
    groundMaterial.mainColor = new Color3(1, 1, 1);
    groundMaterial.lineColor = new Color3(1, 1, 1);
    groundMaterial.opacity = 0.5;
    // Draw only the lines. Babylon < 9.31 did this by itself for opacity < 1; 9.31 needs the flag,
    // or the whole plane is filled with the main color.
    groundMaterial.linesOnly = true;
    const ground = MeshBuilder.CreateGround('ground', {width: 100, height: 100}, scene);
    ground.material = groundMaterial;

    const gizmoUtilityLayer = new UtilityLayerRenderer(scene);
    const gizmoManager = new GizmoManager(scene, undefined, gizmoUtilityLayer);
    gizmoManager.usePointerToAttachGizmos = false;

    const renderer = new BatchedRenderer('quarks-editor', scene);
    const history = new EffectHistory();
    /** Undo/redo of effects that are not focused right now, by root uniqueId. */
    const historyByRoot = new Map<number, HistoryStacks>();

    const dropMarker = new GalleryDropMarker(scene);
    const selectionMarker = new GallerySelectionMarker(scene);
    const emitterWireframes = new EmitterShapeWireframes(scene);
    const viewportPicker = new GalleryViewportPicker(scene);

    let binding: EffectBinding | null = null;
    let sceneEntries: SceneEntry[] = [];
    let visibleRootIds: number[] = [];
    let assets: EffectAsset[] = [];
    let focusTimelineMeta = {rootId: -1, revision: -1, span: 1, anyLooping: false};

    const handleViewportPointerLeave = () => viewportPicker.setHover(null);
    canvas?.addEventListener('pointerleave', handleViewportPointerLeave);

    const pointerObserver = scene.onPointerObservable.add((pointerInfo) => {
        if (options.isAssetDragActive?.()) {
            return;
        }
        const event = pointerInfo.event;
        if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
            const effectRoot = viewportPicker.pick(event.clientX, event.clientY);
            const focused = binding?.root ?? null;
            viewportPicker.setHover(effectRoot && effectRoot !== focused ? effectRoot : null);
            return;
        }
        if (pointerInfo.type !== PointerEventTypes.POINTERDOWN || event.button !== 0) {
            return;
        }
        const effectRoot = viewportPicker.pick(event.clientX, event.clientY);
        if (!effectRoot) {
            return;
        }
        const entry = sceneEntries.find((item) => item.root === effectRoot);
        if (entry && binding?.root !== effectRoot) {
            focusEntry(entry);
        }
        view.selectedNodeChanged(effectRoot);
    });

    const hideDropPreview = () => {
        dropMarker.hide();
        view.dragHoverChanged(null);
    };
    const clearDropPreview = () => {
        hideDropPreview();
        setAssetDragSession(null);
    };

    // ---- state commits ------------------------------------------------------------------

    /**
     * The open prefab, if any: its asset, and the scene set aside while it is edited. In prefab
     * mode `sceneEntries` holds just the prefab's instance, so playback, picking, undo and the
     * timeline all work on it unchanged.
     */
    let prefab: {
        asset: EffectAsset;
        stash: {
            entries: SceneEntry[];
            visible: number[];
            focusedRoot: TransformNode | null;
            camera: {target: Vector3; radius: number; alpha: number; beta: number};
        };
    } | null = null;
    let prefabChanged = false;

    /** Scene changes since the last save; suppressed while a project scene loads. */
    let dirty = false;
    let loadingScene = Boolean(options.project);
    const markDirty = () => {
        if (prefab) {
            if (!prefabChanged) {
                prefabChanged = true;
                view.prefabDirtyChanged(true);
            }
            return;
        }
        if (!loadingScene && !dirty) {
            dirty = true;
            view.sceneDirtyChanged(true);
        }
    };
    const markClean = () => {
        dirty = false;
        view.sceneDirtyChanged(false);
    };
    const setPrefabClean = () => {
        prefabChanged = false;
        view.prefabDirtyChanged(false);
    };
    const unsubscribeTransform = subscribeTransform(markDirty);

    /** Sets the entries and their visibility without marking the scene changed. */
    const replaceEntries = (entries: SceneEntry[], visible: number[]) => {
        sceneEntries = entries;
        view.entriesChanged(entries);
        visibleRootIds = visible;
        view.visibleChanged(visible);
    };

    const commitEntries = (next: SceneEntry[]) => {
        sceneEntries = next;
        view.entriesChanged(next);
        markDirty();
    };

    const commitAssets = (next: EffectAsset[]) => {
        assets = next;
        view.assetsChanged(next);
    };

    const commitVisible = (next: number[]) => {
        visibleRootIds = next;
        view.visibleChanged(next);
        markDirty();
    };

    const onBindingChange = () => {
        view.refresh();
        markDirty();
    };

    const isVisible = (entry: SceneEntry) => visibleRootIds.includes(entry.root.uniqueId);

    const refreshPlayback = () => {
        applyGalleryPlayback(
            sceneEntries,
            new Set(visibleRootIds),
            playback.stagePlaying,
            playback.focusFinishedByRoot
        );
        renderer.refreshBatches();
        scene.render();
        view.refresh();
    };

    // ---- focus ----------------------------------------------------------------------------

    const setFocus = (next: EffectBinding | null) => {
        binding = next;
        view.bindingChanged(next);
    };

    const attachBinding = (next: EffectBinding | null) => {
        const previous = binding;
        if (previous && !previous.root.isDisposed()) {
            historyByRoot.set(previous.root.uniqueId, history.saveStacks());
        }
        history.restoreStacks(next ? historyByRoot.get(next.root.uniqueId) : undefined);
        if (next) {
            history.attach(next);
            next.subscribe(onBindingChange);
        }
        setFocus(next);
    };

    const focusEntry = (entry: SceneEntry | null, moveCamera = true) => {
        attachBinding(entry ? bindingFromSceneEntry(entry) : null);
        view.selectedNodeChanged(entry?.root ?? null);
        view.focusedRootChanged(entry?.root ?? null);
        playback.focusRootId = entry?.root.uniqueId ?? null;
        if (entry && isVisible(entry)) {
            selectionMarker.show(entry.root);
            if (moveCamera) {
                focusGalleryEntry(camera, entry.root);
            }
        } else {
            selectionMarker.hide();
        }
        view.ready(makeHandle());
    };

    // ---- scene entries ------------------------------------------------------------------

    /** Adds entries to the scene (visible) and focuses the first. */
    const addEntries = (entries: SceneEntry[], center: Vector3) => {
        if (entries.length === 0) {
            return;
        }
        placeSceneEntriesAt(entries, center);
        for (const entry of entries) {
            entry.root.setEnabled(true);
        }
        commitEntries([...sceneEntries, ...entries]);
        commitVisible([...visibleRootIds, ...entries.map((entry) => entry.root.uniqueId)]);
        focusEntry(entries[0], false);
        refreshPlayback();
    };

    const refuseInPrefabMode = () => {
        if (!prefab) return false;
        view.toast('Effects go into the scene — go back to the scene (← Scene) to add them');
        return true;
    };

    const cameraGroundTarget = () => new Vector3(camera.target.x, 0, camera.target.z);

    const instantiateAssets = (toPlace: EffectAsset[], center: Vector3) => {
        if (refuseInPrefabMode()) {
            return;
        }
        const created: SceneEntry[] = [];
        for (const asset of toPlace) {
            try {
                const entry = instantiateSceneEntry(scene, renderer, asset, [...sceneEntries, ...created]);
                if (entry) {
                    created.push(entry);
                }
            } catch (err) {
                console.warn(`[Quarks editor] Could not instantiate "${asset.path}":`, err);
            }
        }
        if (created.length < toPlace.length) {
            view.message(
                'Add to scene',
                `${toPlace.length - created.length} of ${toPlace.length} effect(s) could not be loaded — see the console.`
            );
        }
        addEntries(created, center);
    };

    const toggleVisible = (entry: SceneEntry) => {
        const id = entry.root.uniqueId;
        const show = !isVisible(entry);
        setSceneEntryVisible(entry, renderer, show);
        clearFocusFinished(playback, id);
        commitVisible(show ? [...visibleRootIds, id] : visibleRootIds.filter((rootId) => rootId !== id));
        if (binding?.root === entry.root) {
            if (show) {
                selectionMarker.show(entry.root);
            } else {
                selectionMarker.hide();
            }
        }
        refreshPlayback();
    };

    /** Entry shown alone, and the entries solo hid (shown again when it ends). */
    let solo: {rootId: number; hidden: number[]} | null = null;

    const exitSolo = () => {
        if (!solo) {
            return;
        }
        const hidden = new Set(solo.hidden);
        solo = null;
        view.soloChanged(null);
        const toShow = sceneEntries.filter((entry) => hidden.has(entry.root.uniqueId) && !isVisible(entry));
        for (const entry of toShow) {
            setSceneEntryVisible(entry, renderer, true);
            clearFocusFinished(playback, entry.root.uniqueId);
        }
        commitVisible([...visibleRootIds, ...toShow.map((entry) => entry.root.uniqueId)]);
    };

    const toggleSolo = (entry: SceneEntry) => {
        if (prefab) return;
        const id = entry.root.uniqueId;
        const wasSolo = solo?.rootId === id;
        exitSolo();
        if (!wasSolo) {
            const others = sceneEntries.filter((item) => item !== entry && isVisible(item));
            for (const other of others) {
                setSceneEntryVisible(other, renderer, false);
            }
            const hiddenIds = others.map((other) => other.root.uniqueId);
            const visible = visibleRootIds.filter((rootId) => !hiddenIds.includes(rootId));
            if (!visible.includes(id)) {
                setSceneEntryVisible(entry, renderer, true);
                visible.push(id);
            }
            commitVisible(visible);
            solo = {rootId: id, hidden: hiddenIds};
            view.soloChanged(id);
            if (binding?.root !== entry.root) {
                focusEntry(entry);
            } else {
                selectionMarker.show(entry.root);
                focusGalleryEntry(camera, entry.root);
            }
        }
        refreshPlayback();
    };

    const deleteEntry = (entry: SceneEntry) => {
        if (prefab) return;
        const index = sceneEntries.indexOf(entry);
        if (index < 0) {
            return;
        }
        const id = entry.root.uniqueId;
        if (solo?.rootId === id) {
            exitSolo();
        }
        const wasFocused = binding?.root === entry.root;
        if (wasFocused) {
            selectionMarker.hide();
        }
        disposeSceneEntry(entry, renderer);
        const remaining = sceneEntries.filter((item) => item !== entry);
        commitEntries(remaining);
        commitVisible(visibleRootIds.filter((rootId) => rootId !== id));
        clearFocusFinished(playback, id);
        playback.focusElapsedByRoot.delete(id);
        if (wasFocused) {
            focusEntry(remaining[Math.min(index, remaining.length - 1)] ?? null, false);
        }
        historyByRoot.delete(id);
        refreshPlayback();
    };

    const deleteFocused = () => {
        const entry = sceneEntries.find((item) => item.root === binding?.root);
        if (!entry || prefab) {
            return false;
        }
        deleteEntry(entry);
        return true;
    };

    const createDefault = () => {
        if (refuseInPrefabMode()) {
            return;
        }
        const entry = createSceneDefaultEntry(scene, sceneEntries, {
            resolveTexture: options.resolveTexture,
            textureUrl: options.defaultTextureUrl,
        });
        for (const system of entry.systems) {
            renderer.addSystem(system);
        }
        addEntries([entry], cameraGroundTarget());
    };

    // ---- assets ---------------------------------------------------------------------------

    const previewDrop = (clientX: number, clientY: number) => {
        const payload = getAssetDragSession();
        if (!payload) return;
        const described = describeAssetDrag(assets, payload);
        if (described.assets.length === 0) return;
        dropMarker.show(pickGroundPosition(scene, clientX, clientY), described.assets.length);
        view.dragHoverChanged({label: described.label, count: described.assets.length});
    };

    const placeDrop = (clientX: number, clientY: number, dataTransfer?: DataTransfer) => {
        const payload = (dataTransfer && readAssetDrag(dataTransfer)) ?? getAssetDragSession();
        clearDropPreview();
        if (!payload) {
            return;
        }
        const {assets: toPlace} = describeAssetDrag(assets, payload);
        instantiateAssets(toPlace, pickGroundPosition(scene, clientX, clientY));
    };

    const addToScene = (payload: AssetDragPayload) => {
        const {assets: toPlace} = describeAssetDrag(assets, payload);
        instantiateAssets(toPlace, cameraGroundTarget());
    };

    /** Writes asset changes through to the project; failures are reported, not thrown. */
    const persist = (action: (store: ProjectStore, projectId: string) => Promise<void>) => {
        const project = options.project;
        if (!project) return;
        action(project.store, project.id).catch((err) => {
            console.error('[Quarks editor] Could not save to the project:', err);
            view.message('Project storage', errorText(err));
        });
    };

    const deleteAssets = (payload: AssetDragPayload) => {
        const next = removeAssets(assets, payload);
        const removed = assets.filter((asset) => !next.includes(asset)).map((asset) => asset.path);
        commitAssets(next);
        persist((store, id) => store.deleteAssets(id, removed));
    };

    const importAssets = async (files: FileList | File[]) => {
        view.assetsLoadingChanged({done: 0, total: 0, loaded: 0, failed: 0});
        let incoming: EffectAsset[];
        try {
            incoming = await loadEffectAssets(files, (progress) => view.assetsLoadingChanged(progress));
        } finally {
            view.assetsLoadingChanged(null);
        }
        if (disposed) return;
        const {merged, added} = mergeAssets(assets, incoming);
        commitAssets(merged);
        view.assetsRevealed();
        if (added.length > 0) {
            persist((store, id) => store.putAssets(id, added.map(toStoredAsset)));
        }

        if (incoming.length === 0) {
            throw new Error('No particle effects found in the selected file(s).');
        }
        if (added.length === 0) {
            throw new Error('All selected effects are already in Assets.');
        }
    };

    /** New asset at `rawPath` (`Folder/Name`, a free path — never overwrites) from an effect tree. */
    const createAssetFromRoot = (root: TransformNode, rawPath: string): EffectAsset => {
        const taken = new Set(assets.map((asset) => asset.path));
        const wanted = normalizeAssetPath(rawPath);
        let path = wanted;
        for (let n = 2; taken.has(path); n++) {
            path = wanted.replace(/\.json$/i, ` ${n}.json`);
        }
        const name = path
            .split('/')
            .pop()!
            .replace(/\.json$/i, '');
        const asset = createEffectAsset(name, path, JSON.parse(serializeEffectTree(root, name)));
        commitAssets([...assets, asset]);
        persist((store, id) => store.putAssets(id, [toStoredAsset(asset)]));
        return asset;
    };

    const saveEntryAsAsset = (entry: SceneEntry, rawPath: string) => {
        const asset = createAssetFromRoot(entry.root, rawPath);
        entry.assetId = asset.id;
        entry.path = asset.path;
        commitEntries([...sceneEntries]);
        view.assetsRevealed();
        view.toast(`Saved as asset “${asset.path.replace(/\.json$/i, '')}”`);
    };

    // ---- prefab mode ------------------------------------------------------------------------

    /** Scene instances made from the open prefab — they keep their own copy when it is saved. */
    const prefabInstanceCount = () =>
        prefab ? prefab.stash.entries.filter((entry) => entry.assetId === prefab!.asset.id).length : 0;

    /** Drops the prefab instance(s) currently in `sceneEntries`, with their history. */
    const disposePrefabInstances = () => {
        for (const entry of sceneEntries) {
            const id = entry.root.uniqueId;
            disposeSceneEntry(entry, renderer);
            historyByRoot.delete(id);
            clearFocusFinished(playback, id);
            playback.focusElapsedByRoot.delete(id);
        }
    };

    /** Shows `entry` as the open prefab's only instance, with `asset` as the prefab. */
    const showPrefab = (asset: EffectAsset, entry: SceneEntry) => {
        setPrefabClean();
        view.prefabChanged({name: asset.name, path: asset.path});
        entry.root.setEnabled(true);
        replaceEntries([entry], [entry.root.uniqueId]);
        focusEntry(entry);
        refreshPlayback();
    };

    /**
     * Opens an asset as a prefab. With another prefab open it is swapped in place — the scene stays
     * set aside — after asking about unsaved edits unless `discardChanges`.
     */
    const openPrefab = (assetId: number, discardChanges = false) => {
        if (prefab?.asset.id === assetId) {
            return;
        }
        const asset = assets.find((item) => item.id === assetId);
        if (!asset) return;
        if (prefab && prefabChanged && !discardChanges) {
            view.prefabSwitchRequested({id: asset.id, name: asset.name});
            return;
        }
        let entry: SceneEntry | null = null;
        try {
            entry = instantiateSceneEntry(scene, renderer, asset, []);
        } catch (err) {
            console.warn(`[Quarks editor] Could not open prefab "${asset.path}":`, err);
        }
        if (!entry) {
            view.message('Open prefab', `“${asset.name}” has no particle systems to edit.`);
            return;
        }
        if (prefab) {
            selectionMarker.hide();
            disposePrefabInstances();
            prefab.asset = asset;
            showPrefab(asset, entry);
            return;
        }
        exitSolo();
        const stash = {
            entries: sceneEntries,
            visible: visibleRootIds,
            focusedRoot: binding?.root ?? null,
            camera: {target: camera.target.clone(), radius: camera.radius, alpha: camera.alpha, beta: camera.beta},
        };
        // Hide the scene without touching its saved visibility.
        for (const item of stash.entries) {
            if (stash.visible.includes(item.root.uniqueId)) {
                setSceneEntryVisible(item, renderer, false);
            }
        }
        selectionMarker.hide();
        prefab = {asset, stash};
        showPrefab(asset, entry);
    };

    /** Leaves prefab mode without saving: drops the prefab instance and brings the scene back. */
    const closePrefab = () => {
        if (!prefab) return;
        const {stash} = prefab;
        prefab = null;
        selectionMarker.hide();
        disposePrefabInstances();
        replaceEntries(stash.entries, stash.visible);
        for (const entry of stash.entries) {
            if (stash.visible.includes(entry.root.uniqueId)) {
                setSceneEntryVisible(entry, renderer, true);
                clearFocusFinished(playback, entry.root.uniqueId);
            }
        }
        cancelGalleryCameraFocus();
        camera.setTarget(stash.camera.target);
        camera.radius = stash.camera.radius;
        camera.alpha = stash.camera.alpha;
        camera.beta = stash.camera.beta;
        setPrefabClean();
        view.prefabChanged(null);
        focusEntry(stash.entries.find((entry) => entry.root === stash.focusedRoot) ?? null, false);
        refreshPlayback();
    };

    /** Overwrites the open prefab's asset with the edited instance. Scene instances keep theirs. */
    const overwritePrefab = () => {
        const root = sceneEntries[0]?.root;
        if (!prefab || !root) return;
        const updated: EffectAsset = {
            ...prefab.asset,
            json: JSON.parse(serializeEffectTree(root, prefab.asset.name)),
        };
        const exists = assets.some((asset) => asset.id === updated.id);
        commitAssets(
            exists ? assets.map((asset) => (asset.id === updated.id ? updated : asset)) : [...assets, updated]
        );
        persist((store, id) => store.putAssets(id, [toStoredAsset(updated)]));
        prefab.asset = updated;
        setPrefabClean();
        view.toast(`Prefab “${updated.name}” saved · scene unchanged`);
    };

    /** Saves the edited prefab as a new asset and keeps editing that one. */
    const savePrefabAsNew = (rawPath: string) => {
        const root = sceneEntries[0]?.root;
        if (!prefab || !root) return;
        const asset = createAssetFromRoot(root, rawPath);
        prefab.asset = asset;
        setPrefabClean();
        view.prefabChanged({name: asset.name, path: asset.path});
        view.toast(`Saved as new prefab “${asset.path.replace(/\.json$/i, '')}”`);
    };

    // ---- project scene ----------------------------------------------------------------------

    /** Saves the scene to the project; resolves to false when it could not. */
    const saveScene = async (): Promise<boolean> => {
        const project = options.project;
        if (!project || prefab) return false;
        const visibleIds = new Set(visibleRootIds);
        const assetPathById = new Map(assets.map((asset) => [asset.id, asset.path]));
        const stored: StoredScene = {
            savedAt: Date.now(),
            entries: sceneEntries.map((entry) => ({
                name: entry.name,
                assetPath: entry.assetId != null ? (assetPathById.get(entry.assetId) ?? null) : null,
                json: JSON.parse(serializeEffectTree(entry.root, entry.name)),
                visible: visibleIds.has(entry.root.uniqueId),
            })),
        };
        try {
            await project.store.saveScene(project.id, stored);
        } catch (err) {
            console.error('[Quarks editor] Could not save the scene:', err);
            view.message('Save scene', errorText(err));
            return false;
        }
        markClean();
        let infoSeen = true;
        try {
            infoSeen = localStorage.getItem(SCENE_SAVE_INFO_KEY) === '1';
            localStorage.setItem(SCENE_SAVE_INFO_KEY, '1');
        } catch {
            // Storage blocked — fall back to the toast.
        }
        if (infoSeen) {
            view.toast('Scene saved · assets unchanged');
        } else {
            view.message(
                'Scene saved',
                'Saving the scene stores the effects placed in it, with their own edits.\n\n' +
                    'It does not change the assets they came from. To keep an edited effect as an asset, ' +
                    'right-click it in the Scene list → “Save as new asset…”.'
            );
        }
        return true;
    };

    const loadProject = async (project: EditorProject) => {
        try {
            const [storedAssets, storedScene] = await Promise.all([
                project.store.loadAssets(project.id),
                project.store.loadScene(project.id),
            ]);
            if (disposed) return;
            const loadedAssets = storedAssets.map((stored) => ({
                ...createEffectAsset(stored.name, stored.path, stored.json),
                missingFiles: stored.missingFiles,
            }));
            commitAssets(loadedAssets);
            const assetIdByPath = new Map(loadedAssets.map((asset) => [asset.path, asset.id]));

            if (!storedScene) {
                createDefault();
                return;
            }
            const created: SceneEntry[] = [];
            const visible: number[] = [];
            for (const stored of storedScene.entries) {
                const entry = instantiateSceneEntry(
                    scene,
                    renderer,
                    {id: -1, name: stored.name, path: stored.assetPath ?? '', json: stored.json, missingFiles: []},
                    created
                );
                if (!entry) continue;
                entry.name = stored.name;
                entry.root.name = stored.name;
                entry.assetId = stored.assetPath != null ? (assetIdByPath.get(stored.assetPath) ?? null) : null;
                entry.path = stored.assetPath ?? `_created/${stored.name}.json`;
                setSceneEntryVisible(entry, renderer, stored.visible);
                if (stored.visible) visible.push(entry.root.uniqueId);
                created.push(entry);
            }
            commitEntries(created);
            commitVisible(visible);
            focusEntry(created[0] ?? null, false);
            refreshPlayback();
        } catch (err) {
            console.error('[Quarks editor] Could not open the project:', err);
            view.message('Open project', errorText(err));
        } finally {
            loadingScene = false;
            markClean();
            view.projectLoaded();
        }
    };

    // ---- undo / redo ----------------------------------------------------------------------

    /** Rebuilds the focused entry from a history snapshot, in place in the scene list. */
    const historyStep = (redo: boolean) => {
        const current = binding;
        if (!current) {
            return;
        }
        const json = redo ? history.redo() : history.undo();
        const index = sceneEntries.findIndex((entry) => entry.root === current.root);
        const prev = index >= 0 ? sceneEntries[index] : null;
        if (!json || !prev) {
            view.refresh();
            return;
        }

        const selectedIndex = nodeIndexInEffect(current.root, options.getSelectedNode?.() ?? null);
        const visible = isVisible(prev);
        const {root, systems} = parseEffectFromJson(scene, renderer, json, {
            registerRenderer: true,
            autoplay: false,
        });
        if (systems.length === 0) {
            disposeSceneEntry({...prev, root, systems}, renderer);
            view.refresh();
            return;
        }
        disposeSceneEntry(prev, renderer);
        // The snapshot carries the root transform too, so a moved effect moves back.
        root.parent = null;
        root.name = prev.name;
        const nextEntry: SceneEntry = {...prev, root, systems};
        setSceneEntryVisible(nextEntry, renderer, visible);

        const entries = [...sceneEntries];
        entries[index] = nextEntry;
        commitEntries(entries);
        commitVisible(visibleRootIds.map((id) => (id === prev.root.uniqueId ? root.uniqueId : id)));
        if (solo) {
            if (solo.rootId === prev.root.uniqueId) {
                solo.rootId = root.uniqueId;
                view.soloChanged(root.uniqueId);
            }
            solo.hidden = solo.hidden.map((id) => (id === prev.root.uniqueId ? root.uniqueId : id));
        }

        const next = bindingFromSceneEntry(nextEntry);
        history.attach(next);
        next.subscribe(onBindingChange);
        setFocus(next);
        view.selectedNodeChanged(nodeAtIndex(root, selectedIndex));
        view.focusedRootChanged(root);
        playback.focusRootId = root.uniqueId;
        if (visible) {
            selectionMarker.show(root);
        }
        notifyTransformChanged();
        refreshPlayback();
    };

    // ---- handle -----------------------------------------------------------------------------

    const makeHandle = (): EffectEditorHostHandle => ({
        get binding() {
            if (!binding) {
                throw new Error('No effect is focused — add one to the scene first.');
            }
            return binding;
        },
        history,
        scene,
        renderer,
        importJson,
        importAssets,
        importGallery: importAssets,
        exportJson: () => makeHandle().binding.exportJSON('EditorEffect'),
    });

    /** Adds `json` to Assets and returns its single instance; throws when it has no systems. */
    const openJson = (json: unknown, name = 'Effect') => {
        const asset = createEffectAsset(name, `_opened/${name}.json`, json);
        const entry = instantiateSceneEntry(scene, renderer, asset, sceneEntries);
        if (!entry) {
            throw new Error('No particle systems found in the JSON.');
        }
        asset.name = entry.name;
        asset.path = `_opened/${entry.name}.json`;
        commitAssets([...assets, asset]);
        return entry;
    };

    const importJson = (json: unknown) => {
        closePrefab();
        const entry = openJson(json);
        for (const existing of sceneEntries) {
            disposeSceneEntry(existing, renderer);
        }
        historyByRoot.clear();
        solo = null;
        view.soloChanged(null);
        commitEntries([]);
        commitVisible([]);
        addEntries([entry], Vector3.Zero());
    };

    // ---- frame ------------------------------------------------------------------------------

    const renderFrame = () => {
        const entries = sceneEntries;
        const visibleIds = new Set(visibleRootIds);
        const focusBinding = binding;
        if (!playback.scrubbing) {
            let delta = (engine.getDeltaTime() / 1000) * playback.speed;
            const stepQueued = playback.stepQueued;
            if (!playback.stagePlaying) {
                delta = stepQueued ? 1 / 60 : 0;
                playback.stepQueued = false;
            }
            if (delta > 0) {
                const simulate = hasActivePreview(entries, visibleIds) && (playback.stagePlaying || stepQueued);
                if (simulate) {
                    renderer.update(delta);
                    let needsRefresh = false;
                    if (pauseFinishedPreviews(entries, visibleIds, playback.focusFinishedByRoot)) {
                        needsRefresh = true;
                    }
                    const focusId = playback.focusRootId ?? focusBinding?.root.uniqueId ?? null;
                    if (
                        focusId != null &&
                        focusBinding &&
                        playback.stagePlaying &&
                        !playback.focusFinishedByRoot.has(focusId) &&
                        !focusTimelineMeta.anyLooping &&
                        QuarksUtil.isEffectFinished(focusBinding.root)
                    ) {
                        const settleAt = getFocusElapsed(playback, focusId);
                        scrubFocusToSettled(focusBinding, renderer, settleAt);
                        markFocusFinished(playback, focusId);
                        pauseFocus(focusBinding);
                        needsRefresh = true;
                    } else if (focusId != null && playback.stagePlaying && !playback.focusFinishedByRoot.has(focusId)) {
                        const prev = getFocusElapsed(playback, focusId);
                        setFocusElapsed(playback, focusId, prev + delta);
                    }
                    if (needsRefresh) {
                        renderer.refreshBatches();
                    }
                    logRenderMismatch(renderer, countGalleryParticles(entries, visibleIds));
                } else if (entries.length > 0) {
                    renderer.refreshBatches();
                }
            }
        }
        scene.render();
        selectionMarker.follow();
        viewportPicker.follow();
        if (focusBinding) {
            emitterWireframes.sync(
                [focusBinding.system, ...focusBinding.subSystems],
                `${focusBinding.root.uniqueId}:${focusBinding.getRevision()}`
            );
        }
        const pickKey = entries
            .map((entry) => `${entry.root.uniqueId}:${visibleIds.has(entry.root.uniqueId) ? 1 : 0}`)
            .join('|');
        viewportPicker.sync(entries, null, `${pickKey}::${focusBinding?.root.uniqueId ?? 'none'}`);

        if (
            focusBinding &&
            (focusBinding.root.uniqueId !== focusTimelineMeta.rootId ||
                focusBinding.getRevision() !== focusTimelineMeta.revision)
        ) {
            const rows = computeTimelineRows(focusBinding);
            focusTimelineMeta = {
                rootId: focusBinding.root.uniqueId,
                revision: focusBinding.getRevision(),
                span: computeTimelineSpan(rows),
                anyLooping: rows.some((row) => row.kind === 'track' && row.looping),
            };
        }
        const count = countGalleryParticles(entries, visibleIds);
        const focused = entries.find((entry) => entry.root === focusBinding?.root);
        const focusId = playback.focusRootId ?? focused?.root.uniqueId ?? null;
        const focusElapsed = focusId != null ? getFocusElapsed(playback, focusId) : 0;
        const focusEnded = focusId != null && isFocusFinished(playback, focusId);
        const meta = focusTimelineMeta;
        const timeLabel = meta.anyLooping
            ? `${focusElapsed.toFixed(1)}s ⟳`
            : focusEnded
              ? `${focusElapsed.toFixed(1)}s / ${meta.span.toFixed(1)}s (end)`
              : `${focusElapsed.toFixed(1)}s / ${meta.span.toFixed(1)}s`;
        view.frame({
            fps: Math.round(engine.getFps()),
            counter: focused ? `${timeLabel} · ${count} particles` : `${count} particles`,
        });
    };

    const syncPlayback = () => {
        applyGalleryPlayback(
            sceneEntries,
            new Set(visibleRootIds),
            playback.stagePlaying,
            playback.focusFinishedByRoot
        );
        if (!playback.stagePlaying) {
            renderer.refreshBatches();
        }
    };

    const start = () => {
        if (started || disposed) return;
        started = true;
        if (options.project) {
            void loadProject(options.project);
        } else if (options.effectJson) {
            addEntries([openJson(options.effectJson)], Vector3.Zero());
        } else {
            createDefault();
        }
        engine.runRenderLoop(renderFrame);
    };

    const dispose = () => {
        if (disposed) return;
        disposed = true;
        unsubscribeTransform();
        clearDropPreview();
        cancelGalleryCameraFocus();
        dropMarker.dispose();
        selectionMarker.dispose();
        emitterWireframes.dispose();
        viewportPicker.dispose();
        canvas?.removeEventListener('pointerleave', handleViewportPointerLeave);
        scene.onPointerObservable.remove(pointerObserver);
        gizmoManager.dispose();
        gizmoUtilityLayer.dispose();
        engine.stopRenderLoop(renderFrame);
        scene.dispose();
    };

    return {
        engine,
        scene,
        camera,
        ground,
        renderer,
        history,
        gizmoManager,
        get binding() {
            return binding;
        },
        get sceneEntries() {
            return sceneEntries;
        },
        get visibleRootIds() {
            return visibleRootIds;
        },
        get assets() {
            return assets;
        },
        get isPrefabOpen() {
            return prefab !== null;
        },
        importAssets,
        importJson,
        focusEntry,
        toggleVisible,
        toggleSolo,
        deleteEntry,
        deleteFocused,
        createDefault,
        previewDrop,
        placeDrop,
        hideDropPreview,
        clearDropPreview,
        setEmitterWireframesVisible: (visible) => emitterWireframes.setVisible(visible),
        addToScene,
        deleteAssets,
        saveEntryAsAsset,
        saveScene,
        openPrefab,
        overwritePrefab,
        savePrefabAsNew,
        closePrefab,
        prefabInstanceCount,
        historyStep,
        syncPlayback,
        makeHandle,
        start,
        dispose,
    };
}
