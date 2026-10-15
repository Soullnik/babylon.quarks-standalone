import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera';
import {Engine} from '@babylonjs/core/Engines/engine';
import {PointerEventTypes} from '@babylonjs/core/Events/pointerEvents';
import {GizmoManager} from '@babylonjs/core/Gizmos/gizmoManager';
import {DirectionalLight} from '@babylonjs/core/Lights/directionalLight';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {Viewport} from '@babylonjs/core/Maths/math.viewport';
import type {Mesh} from '@babylonjs/core/Meshes/mesh';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {UtilityLayerRenderer} from '@babylonjs/core/Rendering/utilityLayerRenderer';
import {Scene} from '@babylonjs/core/scene';
import {GridMaterial} from '@babylonjs/materials/grid/gridMaterial';
import {
    ArrowLeftIcon,
    ArrowPathIcon,
    ArrowsPointingOutIcon,
    ArrowUturnLeftIcon,
    ArrowUturnRightIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    CubeTransparentIcon,
    CursorArrowRaysIcon,
    MapPinIcon,
    Square2StackIcon,
    XMarkIcon,
} from '@heroicons/react/24/solid';
import {BatchedRenderer, QuarksUtil} from 'babylon.quarks';
import React, {useCallback, useDeferredValue, useEffect, useMemo, useReducer, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {getAssetDragSession, setAssetDragSession} from '../core/assetDragSession';
import {ASSET_DRAG_MIME, describeAssetDrag, readAssetDrag, type AssetDragPayload} from '../core/assetTree';
import {
    collectJsonFiles,
    createEffectAsset,
    loadEffectAssets,
    mergeAssets,
    removeAssets,
    type AssetLoadProgress,
    type EffectAsset,
} from '../core/assets';
import {EffectBinding} from '../core/binding';
import {createSceneDefaultEntry} from '../core/defaultEffect';
import {serializeEffectTree} from '../core/effectTree';
import {EmitterShapeWireframes} from '../core/emitterShapeWireframe';
import {GalleryDropMarker} from '../core/galleryDropMarker';
import {cancelGalleryCameraFocus, focusGalleryEntry} from '../core/galleryLayout';
import {
    applyGalleryPlayback,
    countGalleryParticles,
    hasActivePreview,
    pauseFinishedPreviews,
} from '../core/galleryPlayback';
import {pickGroundPosition, placeSceneEntriesAt, setSceneEntryVisible} from '../core/galleryScene';
import {GallerySelectionMarker} from '../core/gallerySelectionMarker';
import {EffectHistory, type HistoryStacks} from '../core/history';
import {parseEffectFromJson} from '../core/loadEffect';
import {pickAssetFolderFiles} from '../core/pickAssetFiles';
import {
    clearFocusFinished,
    createPlaybackState,
    getFocusElapsed,
    isFocusFinished,
    markFocusFinished,
    setFocusElapsed,
    type PlaybackState,
} from '../core/playback';
import type {ProjectStore, StoredAsset, StoredScene} from '../core/projectStore';
import {logRenderMismatch} from '../core/renderDebug';
import {
    bindingFromSceneEntry,
    countInstancesByAsset,
    disposeSceneEntry,
    instantiateSceneEntry,
    type SceneEntry,
} from '../core/sceneEntries';
import {pauseFocus, scrubFocusToSettled} from '../core/scrub';
import {computeTimelineRows, computeTimelineSpan} from '../core/timeline';
import {notifyTransformChanged, subscribeTransform} from '../core/transformStore';
import {toggleStagePlayback} from '../core/transport';
import {GalleryViewportPicker} from '../core/viewportPicker';
import {AssetsPanel} from './AssetsPanel';
import {ChoiceDialog} from './ChoiceDialog';
import {EffectEditor} from './EffectEditor';
import {EffectTreeView} from './EffectTreeView';
import {MessageDialog} from './MessageDialog';
import {PromptDialog} from './PromptDialog';
import {ScenePanel} from './ScenePanel';
import {TimelinePanel} from './TimelinePanel';
import {TransportBar} from './TransportBar';
import {iconStyle, type HeroIcon} from './icons';
import type {GeometryData, GeometryOption, TextureOption} from './modules';
import {buttonStyle, globalEditorStyles, theme} from './theme';

export interface EffectEditorHostHandle {
    binding: EffectBinding;
    history: EffectHistory;
    scene: Scene;
    renderer: BatchedRenderer;
    /** Replaces the scene with this effect (it is also added to Assets). */
    importJson: (json: unknown) => void;
    /** Imports effect files (and the texture/geometry files they reference) into Assets. */
    importAssets: (files: FileList | File[]) => Promise<void>;
    /** @deprecated Renamed to `importAssets`. */
    importGallery: (files: FileList | File[]) => Promise<void>;
    exportJson: () => string;
}

export interface EffectEditorHostProps {
    /** Quarks JSON export to open; a default effect is created when omitted. */
    effectJson?: unknown;
    /** When set, a Save button appears and receives the serialized effect. */
    onSave?: (json: string) => void;
    /** Called once the engine/scene/binding are live (and after every import). */
    onReady?: (handle: EffectEditorHostHandle) => void;
    title?: string;
    textureOptions?: TextureOption[];
    /** Mesh presets for the Mesh render mode (e.g. asset meshes from a host editor). */
    geometryOptions?: GeometryOption[];
    resolveTexture?: (url: string, scene: Scene) => unknown;
    /** Host loader for the Mesh "Load from file…" option (e.g. GLB via @babylonjs/loaders). */
    resolveGeometry?: (file: File, scene: Scene) => Promise<GeometryData>;
    /** Optional link rendered in the viewport's top-left corner (e.g. back to a host gallery page). */
    backLink?: {href: string; label: string};
    /**
     * Project to edit: its assets load from and save to `store`, and the scene is saved with
     * Save / Ctrl+S. Without it the editor works in memory only.
     */
    project?: {store: ProjectStore; id: string; name: string};
    /** Shows a "← Projects" button; called once unsaved scene changes are dealt with. */
    onExitProject?: () => void;
}

const SCENE_SAVE_INFO_KEY = 'babylon.quarks-editor:scene-save-info-seen';

function toStoredAsset(asset: EffectAsset): StoredAsset {
    return {path: asset.path, name: asset.name, json: asset.json, missingFiles: asset.missingFiles};
}

/** `Folder/Name` typed by the user → a clean asset path ending in `.json`. */
function normalizeAssetPath(input: string): string {
    const segments = input
        .replace(/\\/g, '/')
        .split('/')
        .map((part) => part.trim())
        .filter(Boolean);
    const path = segments.join('/') || 'Effect';
    return /\.json$/i.test(path) ? path : `${path}.json`;
}

type GizmoMode = 'none' | 'position' | 'rotation' | 'scale';
const SCENE_PANEL_WIDTH = 280;
const TIMELINE_HEIGHT = 200;
const DRAWER_HEIGHT = 280;

const GIZMO_MODE_BUTTONS: Array<{value: GizmoMode; Icon: HeroIcon; title: string}> = [
    {value: 'none', Icon: CursorArrowRaysIcon, title: 'Select (hide stage gizmo)'},
    {value: 'position', Icon: ArrowsPointingOutIcon, title: 'Move the stage node (position)'},
    {value: 'rotation', Icon: ArrowPathIcon, title: 'Rotate the stage node'},
    {value: 'scale', Icon: Square2StackIcon, title: 'Scale the stage node'},
];

const squareButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    width: 28,
    height: 28,
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
};

const activeSquareButtonStyle: React.CSSProperties = {
    border: `1px solid ${theme.borderActive}`,
    background: 'rgba(120, 165, 255, 0.35)',
};

const dockTitleStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: theme.text,
};

const dockIconButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    width: 24,
    height: 22,
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
};

function isTextInput(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

/**
 * Inspector value controls (numbers, checkboxes, selects): Ctrl+Z there means the effect's undo,
 * not the browser's per-field text undo. Free-text inputs (names, filters) keep the native one.
 */
function isInspectorValueControl(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    if (el.tagName === 'SELECT') return true;
    return el.tagName === 'INPUT' && ['number', 'checkbox', 'range', 'color'].includes((el as HTMLInputElement).type);
}

/** Position of `node` in its effect tree (0 = root), to find the same node after a rebuild. */
function nodeIndexInEffect(root: TransformNode, node: TransformNode | null): number {
    if (!node || node === root) return 0;
    return root.getDescendants(false).indexOf(node) + 1;
}

function nodeAtIndex(root: TransformNode, index: number): TransformNode {
    if (index <= 0) return root;
    return (root.getDescendants(false)[index - 1] as TransformNode | undefined) ?? root;
}

/**
 * Self-contained effect editor: live Babylon preview, a Scene list of the effects placed in it,
 * an inspector, and a bottom dock with the timeline and the Assets browser. Assets are effect
 * files; dragging one into the viewport instantiates an independent copy, as many times as needed.
 * Designed for embedding — see QuarksEffectEditor.Show for the NME-style entry point.
 */
export function EffectEditorHost(props: EffectEditorHostProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const counterRef = useRef<HTMLSpanElement>(null);
    const fpsRef = useRef<HTMLSpanElement>(null);
    const playheadRef = useRef<HTMLDivElement>(null);
    const assetFolderInputRef = useRef<HTMLInputElement>(null);
    const actionsRef = useRef({
        importAssets: async (_files: FileList | File[]) => {},
        focusEntry: (_entry: SceneEntry) => {},
        toggleVisible: (_entry: SceneEntry) => {},
        toggleSolo: (_entry: SceneEntry) => {},
        deleteEntry: (_entry: SceneEntry) => {},
        createDefault: () => {},
        placeDrop: (_clientX: number, _clientY: number, _dataTransfer?: DataTransfer) => {},
        addToScene: (_payload: AssetDragPayload) => {},
        deleteAssets: (_payload: AssetDragPayload) => {},
        saveEntryAsAsset: (_entry: SceneEntry, _path: string) => {},
        saveScene: async (): Promise<boolean> => false,
        openPrefab: (_assetId: number, _discardChanges?: boolean) => {},
        overwritePrefab: () => {},
        savePrefabAsNew: (_path: string) => {},
        closePrefab: () => {},
        prefabInstanceCount: (): number => 0,
        historyStep: (_redo: boolean) => {},
    });
    const dropMarkerRef = useRef<GalleryDropMarker | null>(null);
    const selectionMarkerRef = useRef<GallerySelectionMarker | null>(null);
    const emitterWireframesRef = useRef<EmitterShapeWireframes | null>(null);
    const viewportPickerRef = useRef<GalleryViewportPicker | null>(null);
    const assetDragDepthRef = useRef(0);
    const stateRef = useRef<{
        engine: Engine;
        scene: Scene;
        camera: ArcRotateCamera;
        ground: Mesh;
        renderer: BatchedRenderer;
        binding: EffectBinding | null;
        history: EffectHistory;
        sceneEntries: SceneEntry[];
        visibleRootIds: number[];
        assets: EffectAsset[];
    } | null>(null);
    const gizmoManagerRef = useRef<GizmoManager | null>(null);
    const [binding, setBinding] = useState<EffectBinding | null>(null);
    const [, force] = useReducer((x: number) => x + 1, 0);
    const playbackRef = useRef<PlaybackState>(createPlaybackState());
    const focusTimelineMetaRef = useRef({rootId: -1, revision: -1, span: 1, anyLooping: false});
    const [stagePlaying, setStagePlaying] = useState(true);
    const [speed, setSpeed] = useState(1);
    const [renamingRoot, setRenamingRoot] = useState(false);
    const [gizmoMode, setGizmoMode] = useState<GizmoMode>('none');
    const [selectedNode, setSelectedNode] = useState<TransformNode | null>(null);
    const selectedNodeRef = useRef<TransformNode | null>(null);
    selectedNodeRef.current = selectedNode;
    const [sceneEntries, setSceneEntries] = useState<SceneEntry[]>([]);
    const [assets, setAssets] = useState<EffectAsset[]>([]);
    const [assetsLoading, setAssetsLoading] = useState<AssetLoadProgress | null>(null);
    const [focusedRoot, setFocusedRoot] = useState<TransformNode | null>(null);
    const [visibleRootIds, setVisibleRootIds] = useState<number[]>([]);
    const [messageDialog, setMessageDialog] = useState<{title: string; message: string} | null>(null);
    const [assetDragHover, setAssetDragHover] = useState<{label: string; count: number} | null>(null);
    const [showEmitterWireframes, setShowEmitterWireframes] = useState(false);
    const [timelineCollapsed, setTimelineCollapsed] = useState(false);
    const [soloRootId, setSoloRootId] = useState<number | null>(null);
    // Assets drawer: floats over the viewport until closed (X, Esc, Ctrl+Space or the Assets
    // button); pinned, it is docked above the timeline instead.
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerPinned, setDrawerPinned] = useState(false);
    const drawerPinnedRef = useRef(false);
    drawerPinnedRef.current = drawerPinned;
    const timelineCounterRef = useRef<HTMLSpanElement>(null);
    const mainAreaRef = useRef<HTMLDivElement>(null);
    /** Pixels at the bottom of the viewport covered by the floating Assets drawer. */
    const [viewportInset, setViewportInset] = useState(0);
    const [sceneDirty, setSceneDirty] = useState(false);
    const [projectLoading, setProjectLoading] = useState(Boolean(props.project));
    const [toast, setToast] = useState<string | null>(null);
    const [saveAsTarget, setSaveAsTarget] = useState<SceneEntry | null>(null);
    const [exitPrompt, setExitPrompt] = useState(false);
    // Prefab mode: one asset opened on its own, the scene set aside until "← Scene".
    const [prefabInfo, setPrefabInfo] = useState<{name: string; path: string} | null>(null);
    const [prefabDirty, setPrefabDirty] = useState(false);
    const [prefabDialog, setPrefabDialog] = useState<'overwrite' | 'exit' | 'saveAs' | null>(null);
    /** Asset waiting to replace an open prefab that has unsaved edits. */
    const [prefabSwitch, setPrefabSwitch] = useState<{id: number; name: string} | null>(null);
    const toastTimerRef = useRef(0);
    const showToast = (text: string) => {
        window.clearTimeout(toastTimerRef.current);
        setToast(text);
        toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
    };
    const closeFloatingDrawer = () => {
        if (!drawerPinnedRef.current) {
            setDrawerOpen(false);
        }
    };

    const isAssetsLoading = assetsLoading !== null;

    const showMessage = (title: string, message: string) => setMessageDialog({title, message});

    /** Appends effect files to Assets without touching the scene. */
    const runAssetImport = async (files: FileList | File[]) => {
        if (collectJsonFiles(files).length === 0) {
            showMessage(
                'Import assets',
                files.length === 0
                    ? 'Import was cancelled or the browser returned no files.\n\nTry Chrome or Edge and pick .json files or a folder that contains them.'
                    : `No .json files found among ${files.length} file(s) in the selection.`
            );
            return;
        }

        try {
            await actionsRef.current.importAssets(files);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            showMessage('Import assets', message);
            console.error('Failed to import assets:', err);
        }
        force();
    };

    const handleImportFolder = () => {
        if (typeof (window as Window & {showDirectoryPicker?: unknown}).showDirectoryPicker !== 'function') {
            assetFolderInputRef.current?.click();
            return;
        }

        void (async () => {
            try {
                const picked = await pickAssetFolderFiles();
                if (picked === null || picked === undefined) {
                    return;
                }
                await runAssetImport(picked);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                showMessage('Import assets', message);
                console.error('Failed to open folder picker:', err);
            }
        })();
    };

    useEffect(() => {
        const engine = new Engine(canvasRef.current!, true);
        const scene = new Scene(engine);
        scene.clearColor = new Color4(0.03, 0.04, 0.09, 1);
        const camera = new ArcRotateCamera('cam', -Math.PI / 2, 1.15, 9, new BVector3(0, 1.4, 0), scene);
        camera.attachControl(canvasRef.current!, true);
        camera.wheelDeltaPercentage = 0.01;

        // Mesh render mode particles are lit (billboard modes ignore these); the grid is visual
        // reference only and is not a physics collider.
        scene.ambientColor = new Color3(1, 1, 1);
        const sunLight = new DirectionalLight('sun', new BVector3(-1, -1, -1), scene);
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
        const ground = MeshBuilder.CreateGround('ground', {width: 100, height: 100}, scene);
        ground.material = groundMaterial;

        const gizmoUtilityLayer = new UtilityLayerRenderer(scene);
        const gizmoManager = new GizmoManager(scene, undefined, gizmoUtilityLayer);
        gizmoManager.usePointerToAttachGizmos = false;
        gizmoManagerRef.current = gizmoManager;

        const renderer = new BatchedRenderer('quarks-editor', scene);
        const history = new EffectHistory();
        /** Undo/redo of effects that are not focused right now, by root uniqueId. */
        const historyByRoot = new Map<number, HistoryStacks>();

        const dropMarker = new GalleryDropMarker(scene);
        dropMarkerRef.current = dropMarker;
        const selectionMarker = new GallerySelectionMarker(scene);
        selectionMarkerRef.current = selectionMarker;
        const emitterWireframes = new EmitterShapeWireframes(scene);
        emitterWireframesRef.current = emitterWireframes;
        const viewportPicker = new GalleryViewportPicker(scene);
        viewportPickerRef.current = viewportPicker;

        stateRef.current = {
            engine,
            scene,
            camera,
            ground,
            renderer,
            binding: null,
            history,
            sceneEntries: [],
            visibleRootIds: [],
            assets: [],
        };
        const state = stateRef.current;

        const handleViewportPointerLeave = () => viewportPicker.setHover(null);
        canvasRef.current?.addEventListener('pointerleave', handleViewportPointerLeave);

        const pointerObserver = scene.onPointerObservable.add((pointerInfo) => {
            if (assetDragDepthRef.current > 0) {
                return;
            }
            const event = pointerInfo.event;
            if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
                const effectRoot = viewportPicker.pick(event.clientX, event.clientY);
                const focused = state.binding?.root ?? null;
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
            const entry = state.sceneEntries.find((item) => item.root === effectRoot);
            if (entry && state.binding?.root !== effectRoot) {
                focusEntry(entry);
            }
            setSelectedNode(effectRoot);
        });

        const clearAssetDragPreview = () => {
            assetDragDepthRef.current = 0;
            dropMarker.hide();
            setAssetDragHover(null);
            setAssetDragSession(null);
        };

        const onWindowDragEnd = () => clearAssetDragPreview();
        window.addEventListener('dragend', onWindowDragEnd);

        // ---- state commits ------------------------------------------------------------------

        /**
         * The open prefab, if any: its asset, and the scene set aside while it is edited. In prefab
         * mode `state.sceneEntries` holds just the prefab's instance, so playback, picking, undo and
         * the timeline all work on it unchanged.
         */
        let prefab: {
            asset: EffectAsset;
            stash: {
                entries: SceneEntry[];
                visible: number[];
                focusedRoot: TransformNode | null;
                camera: {target: BVector3; radius: number; alpha: number; beta: number};
            };
        } | null = null;
        let prefabChanged = false;

        /** Scene changes since the last save; suppressed while a project scene loads. */
        let dirty = false;
        let loadingScene = Boolean(props.project);
        const markDirty = () => {
            if (prefab) {
                if (!prefabChanged) {
                    prefabChanged = true;
                    setPrefabDirty(true);
                }
                return;
            }
            if (!loadingScene && !dirty) {
                dirty = true;
                setSceneDirty(true);
            }
        };
        const markClean = () => {
            dirty = false;
            setSceneDirty(false);
        };
        const unsubscribeTransform = subscribeTransform(markDirty);

        const commitEntries = (next: SceneEntry[]) => {
            state.sceneEntries = next;
            setSceneEntries(next);
            markDirty();
        };

        const commitAssets = (next: EffectAsset[]) => {
            state.assets = next;
            setAssets(next);
        };

        const commitVisible = (next: number[]) => {
            state.visibleRootIds = next;
            setVisibleRootIds(next);
            markDirty();
        };

        const onBindingChange = () => {
            force();
            markDirty();
        };

        const isVisible = (entry: SceneEntry) => state.visibleRootIds.includes(entry.root.uniqueId);

        const refreshPlayback = () => {
            applyGalleryPlayback(
                state.sceneEntries,
                new Set(state.visibleRootIds),
                playbackRef.current.stagePlaying,
                playbackRef.current.focusFinishedByRoot
            );
            renderer.refreshBatches();
            scene.render();
            force();
        };

        // ---- focus ----------------------------------------------------------------------------

        const attachBinding = (next: EffectBinding | null) => {
            const previous = state.binding;
            if (previous && !previous.root.isDisposed()) {
                historyByRoot.set(previous.root.uniqueId, history.saveStacks());
            }
            history.restoreStacks(next ? historyByRoot.get(next.root.uniqueId) : undefined);
            if (next) {
                history.attach(next);
                next.subscribe(onBindingChange);
            }
            state.binding = next;
            setBinding(next);
        };

        const focusEntry = (entry: SceneEntry | null, moveCamera = true) => {
            attachBinding(entry ? bindingFromSceneEntry(entry) : null);
            setSelectedNode(entry?.root ?? null);
            setFocusedRoot(entry?.root ?? null);
            playbackRef.current.focusRootId = entry?.root.uniqueId ?? null;
            if (entry && isVisible(entry)) {
                selectionMarker.show(entry.root);
                if (moveCamera) {
                    focusGalleryEntry(camera, entry.root);
                }
            } else {
                selectionMarker.hide();
            }
            props.onReady?.(makeHandle());
        };

        // ---- scene entries ------------------------------------------------------------------

        /** Adds entries to the scene (visible) and focuses the first. */
        const addEntries = (entries: SceneEntry[], center: BVector3) => {
            if (entries.length === 0) {
                return;
            }
            placeSceneEntriesAt(entries, center);
            for (const entry of entries) {
                entry.root.setEnabled(true);
            }
            commitEntries([...state.sceneEntries, ...entries]);
            commitVisible([...state.visibleRootIds, ...entries.map((entry) => entry.root.uniqueId)]);
            focusEntry(entries[0], false);
            refreshPlayback();
        };

        const refuseInPrefabMode = () => {
            if (!prefab) return false;
            showToast('Effects go into the scene — go back to the scene (← Scene) to add them');
            return true;
        };

        const instantiateAssets = (toPlace: EffectAsset[], center: BVector3) => {
            if (refuseInPrefabMode()) {
                return;
            }
            const created: SceneEntry[] = [];
            for (const asset of toPlace) {
                try {
                    const entry = instantiateSceneEntry(scene, renderer, asset, [...state.sceneEntries, ...created]);
                    if (entry) {
                        created.push(entry);
                    }
                } catch (err) {
                    console.warn(`[Quarks editor] Could not instantiate "${asset.path}":`, err);
                }
            }
            if (created.length < toPlace.length) {
                showMessage(
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
            clearFocusFinished(playbackRef.current, id);
            commitVisible(
                show ? [...state.visibleRootIds, id] : state.visibleRootIds.filter((rootId) => rootId !== id)
            );
            if (state.binding?.root === entry.root) {
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
            setSoloRootId(null);
            const toShow = state.sceneEntries.filter((entry) => hidden.has(entry.root.uniqueId) && !isVisible(entry));
            for (const entry of toShow) {
                setSceneEntryVisible(entry, renderer, true);
                clearFocusFinished(playbackRef.current, entry.root.uniqueId);
            }
            commitVisible([...state.visibleRootIds, ...toShow.map((entry) => entry.root.uniqueId)]);
        };

        const toggleSolo = (entry: SceneEntry) => {
            if (prefab) return;
            const id = entry.root.uniqueId;
            const wasSolo = solo?.rootId === id;
            exitSolo();
            if (!wasSolo) {
                const others = state.sceneEntries.filter((item) => item !== entry && isVisible(item));
                for (const other of others) {
                    setSceneEntryVisible(other, renderer, false);
                }
                const hiddenIds = others.map((other) => other.root.uniqueId);
                const visible = state.visibleRootIds.filter((rootId) => !hiddenIds.includes(rootId));
                if (!visible.includes(id)) {
                    setSceneEntryVisible(entry, renderer, true);
                    visible.push(id);
                }
                commitVisible(visible);
                solo = {rootId: id, hidden: hiddenIds};
                setSoloRootId(id);
                if (state.binding?.root !== entry.root) {
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
            const index = state.sceneEntries.indexOf(entry);
            if (index < 0) {
                return;
            }
            const id = entry.root.uniqueId;
            if (solo?.rootId === id) {
                exitSolo();
            }
            const wasFocused = state.binding?.root === entry.root;
            if (wasFocused) {
                selectionMarker.hide();
            }
            disposeSceneEntry(entry, renderer);
            const remaining = state.sceneEntries.filter((item) => item !== entry);
            commitEntries(remaining);
            commitVisible(state.visibleRootIds.filter((rootId) => rootId !== id));
            clearFocusFinished(playbackRef.current, id);
            playbackRef.current.focusElapsedByRoot.delete(id);
            if (wasFocused) {
                focusEntry(remaining[Math.min(index, remaining.length - 1)] ?? null, false);
            }
            historyByRoot.delete(id);
            refreshPlayback();
        };

        const createDefault = () => {
            if (refuseInPrefabMode()) {
                return;
            }
            const entry = createSceneDefaultEntry(scene, state.sceneEntries, {
                resolveTexture: props.resolveTexture,
                textureUrl: props.textureOptions?.[0]?.url,
            });
            for (const system of entry.systems) {
                renderer.addSystem(system);
            }
            addEntries([entry], new BVector3(camera.target.x, 0, camera.target.z));
        };

        // ---- assets ---------------------------------------------------------------------------

        const placeDrop = (clientX: number, clientY: number, dataTransfer?: DataTransfer) => {
            const payload = (dataTransfer && readAssetDrag(dataTransfer)) ?? getAssetDragSession();
            clearAssetDragPreview();
            if (!payload) {
                return;
            }
            const {assets: toPlace} = describeAssetDrag(state.assets, payload);
            instantiateAssets(toPlace, pickGroundPosition(scene, clientX, clientY));
        };

        const addToScene = (payload: AssetDragPayload) => {
            const {assets: toPlace} = describeAssetDrag(state.assets, payload);
            instantiateAssets(toPlace, new BVector3(camera.target.x, 0, camera.target.z));
        };

        /** Writes asset changes through to the project; failures are reported, not thrown. */
        const persist = (action: (store: ProjectStore, projectId: string) => Promise<void>) => {
            const project = props.project;
            if (!project) return;
            action(project.store, project.id).catch((err) => {
                console.error('[Quarks editor] Could not save to the project:', err);
                showMessage('Project storage', err instanceof Error ? err.message : String(err));
            });
        };

        const deleteAssets = (payload: AssetDragPayload) => {
            const next = removeAssets(state.assets, payload);
            const removed = state.assets.filter((asset) => !next.includes(asset)).map((asset) => asset.path);
            commitAssets(next);
            persist((store, id) => store.deleteAssets(id, removed));
        };

        const importAssets = async (files: FileList | File[]) => {
            setAssetsLoading({done: 0, total: 0, loaded: 0, failed: 0});
            let incoming: EffectAsset[];
            try {
                incoming = await loadEffectAssets(files, (progress) => setAssetsLoading(progress));
            } finally {
                setAssetsLoading(null);
            }
            const {merged, added} = mergeAssets(state.assets, incoming);
            commitAssets(merged);
            setDrawerOpen(true);
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

        /**
         * Saves a scene instance as a new asset at `rawPath` (`Folder/Name`, never overwriting) and
         * makes the instance an instance of it.
         */
        /** New asset at `rawPath` (`Folder/Name`, a free path — never overwrites) from an effect tree. */
        const createAssetFromRoot = (root: TransformNode, rawPath: string): EffectAsset => {
            const taken = new Set(state.assets.map((asset) => asset.path));
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
            commitAssets([...state.assets, asset]);
            persist((store, id) => store.putAssets(id, [toStoredAsset(asset)]));
            return asset;
        };

        const saveEntryAsAsset = (entry: SceneEntry, rawPath: string) => {
            const asset = createAssetFromRoot(entry.root, rawPath);
            entry.assetId = asset.id;
            entry.path = asset.path;
            commitEntries([...state.sceneEntries]);
            setDrawerOpen(true);
            showToast(`Saved as asset “${asset.path.replace(/\.json$/i, '')}”`);
        };

        // ---- prefab mode ------------------------------------------------------------------------

        /** Scene instances made from the open prefab — they keep their own copy when it is saved. */
        const prefabInstanceCount = () =>
            prefab ? prefab.stash.entries.filter((entry) => entry.assetId === prefab!.asset.id).length : 0;

        /** Drops the prefab instance(s) currently in `state.sceneEntries`, with their history. */
        const disposePrefabInstances = () => {
            for (const entry of state.sceneEntries) {
                const id = entry.root.uniqueId;
                disposeSceneEntry(entry, renderer);
                historyByRoot.delete(id);
                clearFocusFinished(playbackRef.current, id);
                playbackRef.current.focusElapsedByRoot.delete(id);
            }
        };

        /**
         * Opens an asset as a prefab. With another prefab open it is swapped in place — the scene stays
         * set aside — after asking about unsaved edits unless `discardChanges`.
         */
        const openPrefab = (assetId: number, discardChanges = false) => {
            if (prefab?.asset.id === assetId) {
                return;
            }
            const asset = state.assets.find((item) => item.id === assetId);
            if (!asset) return;
            if (prefab && prefabChanged && !discardChanges) {
                setPrefabSwitch({id: asset.id, name: asset.name});
                return;
            }
            let entry: SceneEntry | null = null;
            try {
                entry = instantiateSceneEntry(scene, renderer, asset, []);
            } catch (err) {
                console.warn(`[Quarks editor] Could not open prefab "${asset.path}":`, err);
            }
            if (!entry) {
                showMessage('Open prefab', `“${asset.name}” has no particle systems to edit.`);
                return;
            }
            if (prefab) {
                selectionMarker.hide();
                disposePrefabInstances();
                prefab.asset = asset;
                prefabChanged = false;
                setPrefabDirty(false);
                setPrefabInfo({name: asset.name, path: asset.path});
                entry.root.setEnabled(true);
                state.sceneEntries = [entry];
                setSceneEntries([entry]);
                state.visibleRootIds = [entry.root.uniqueId];
                setVisibleRootIds([entry.root.uniqueId]);
                focusEntry(entry);
                refreshPlayback();
                return;
            }
            exitSolo();
            const stash = {
                entries: state.sceneEntries,
                visible: state.visibleRootIds,
                focusedRoot: state.binding?.root ?? null,
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
            prefabChanged = false;
            setPrefabDirty(false);
            setPrefabInfo({name: asset.name, path: asset.path});
            entry.root.setEnabled(true);
            state.sceneEntries = [entry];
            setSceneEntries([entry]);
            state.visibleRootIds = [entry.root.uniqueId];
            setVisibleRootIds([entry.root.uniqueId]);
            focusEntry(entry);
            refreshPlayback();
        };

        /** Leaves prefab mode without saving: drops the prefab instance and brings the scene back. */
        const closePrefab = () => {
            if (!prefab) return;
            const {stash} = prefab;
            prefab = null;
            selectionMarker.hide();
            disposePrefabInstances();
            state.sceneEntries = stash.entries;
            setSceneEntries(stash.entries);
            state.visibleRootIds = stash.visible;
            setVisibleRootIds(stash.visible);
            for (const entry of stash.entries) {
                if (stash.visible.includes(entry.root.uniqueId)) {
                    setSceneEntryVisible(entry, renderer, true);
                    clearFocusFinished(playbackRef.current, entry.root.uniqueId);
                }
            }
            cancelGalleryCameraFocus();
            camera.setTarget(stash.camera.target);
            camera.radius = stash.camera.radius;
            camera.alpha = stash.camera.alpha;
            camera.beta = stash.camera.beta;
            prefabChanged = false;
            setPrefabDirty(false);
            setPrefabInfo(null);
            focusEntry(stash.entries.find((entry) => entry.root === stash.focusedRoot) ?? null, false);
            refreshPlayback();
        };

        /** Overwrites the open prefab's asset with the edited instance. Scene instances keep theirs. */
        const overwritePrefab = () => {
            const root = state.sceneEntries[0]?.root;
            if (!prefab || !root) return;
            const updated: EffectAsset = {
                ...prefab.asset,
                json: JSON.parse(serializeEffectTree(root, prefab.asset.name)),
            };
            const exists = state.assets.some((asset) => asset.id === updated.id);
            commitAssets(
                exists
                    ? state.assets.map((asset) => (asset.id === updated.id ? updated : asset))
                    : [...state.assets, updated]
            );
            persist((store, id) => store.putAssets(id, [toStoredAsset(updated)]));
            prefab.asset = updated;
            prefabChanged = false;
            setPrefabDirty(false);
            showToast(`Prefab “${updated.name}” saved · scene unchanged`);
        };

        /** Saves the edited prefab as a new asset and keeps editing that one. */
        const savePrefabAsNew = (rawPath: string) => {
            const root = state.sceneEntries[0]?.root;
            if (!prefab || !root) return;
            const asset = createAssetFromRoot(root, rawPath);
            prefab.asset = asset;
            prefabChanged = false;
            setPrefabDirty(false);
            setPrefabInfo({name: asset.name, path: asset.path});
            showToast(`Saved as new prefab “${asset.path.replace(/\.json$/i, '')}”`);
        };

        // ---- project scene ----------------------------------------------------------------------

        /** Saves the scene to the project; resolves to false when it could not. */
        const saveScene = async (): Promise<boolean> => {
            const project = props.project;
            if (!project || prefab) return false;
            const visibleIds = new Set(state.visibleRootIds);
            const assetPathById = new Map(state.assets.map((asset) => [asset.id, asset.path]));
            const stored: StoredScene = {
                savedAt: Date.now(),
                entries: state.sceneEntries.map((entry) => ({
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
                showMessage('Save scene', err instanceof Error ? err.message : String(err));
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
                showToast('Scene saved · assets unchanged');
            } else {
                showMessage(
                    'Scene saved',
                    'Saving the scene stores the effects placed in it, with their own edits.\n\n' +
                        'It does not change the assets they came from. To keep an edited effect as an asset, ' +
                        'right-click it in the Scene list → “Save as new asset…”.'
                );
            }
            return true;
        };

        const loadProject = async (project: NonNullable<EffectEditorHostProps['project']>) => {
            try {
                const [storedAssets, storedScene] = await Promise.all([
                    project.store.loadAssets(project.id),
                    project.store.loadScene(project.id),
                ]);
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
                showMessage('Open project', err instanceof Error ? err.message : String(err));
            } finally {
                loadingScene = false;
                markClean();
                setProjectLoading(false);
            }
        };

        // ---- undo / redo ----------------------------------------------------------------------

        /** Rebuilds the focused entry from a history snapshot, in place in the scene list. */
        const historyStep = (redo: boolean) => {
            const current = state.binding;
            if (!current) {
                return;
            }
            const json = redo ? history.redo() : history.undo();
            const index = state.sceneEntries.findIndex((entry) => entry.root === current.root);
            const prev = index >= 0 ? state.sceneEntries[index] : null;
            if (!json || !prev) {
                force();
                return;
            }

            const selectedIndex = nodeIndexInEffect(current.root, selectedNodeRef.current);
            const visible = isVisible(prev);
            const {root, systems} = parseEffectFromJson(scene, renderer, json, {
                registerRenderer: true,
                autoplay: false,
            });
            if (systems.length === 0) {
                disposeSceneEntry({...prev, root, systems}, renderer);
                force();
                return;
            }
            disposeSceneEntry(prev, renderer);
            // The snapshot carries the root transform too, so a moved effect moves back.
            root.parent = null;
            root.name = prev.name;
            const nextEntry: SceneEntry = {...prev, root, systems};
            setSceneEntryVisible(nextEntry, renderer, visible);

            const entries = [...state.sceneEntries];
            entries[index] = nextEntry;
            commitEntries(entries);
            commitVisible(state.visibleRootIds.map((id) => (id === prev.root.uniqueId ? root.uniqueId : id)));
            if (solo) {
                if (solo.rootId === prev.root.uniqueId) {
                    solo.rootId = root.uniqueId;
                    setSoloRootId(root.uniqueId);
                }
                solo.hidden = solo.hidden.map((id) => (id === prev.root.uniqueId ? root.uniqueId : id));
            }

            const next = bindingFromSceneEntry(nextEntry);
            history.attach(next);
            next.subscribe(onBindingChange);
            state.binding = next;
            setBinding(next);
            setSelectedNode(nodeAtIndex(root, selectedIndex));
            setFocusedRoot(root);
            playbackRef.current.focusRootId = root.uniqueId;
            if (visible) {
                selectionMarker.show(root);
            }
            notifyTransformChanged();
            refreshPlayback();
        };

        // ---- handle -----------------------------------------------------------------------------

        const makeHandle = (): EffectEditorHostHandle => ({
            get binding() {
                const b = state.binding;
                if (!b) {
                    throw new Error('No effect is focused — add one to the scene first.');
                }
                return b;
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
            const entry = instantiateSceneEntry(scene, renderer, asset, state.sceneEntries);
            if (!entry) {
                throw new Error('No particle systems found in the JSON.');
            }
            asset.name = entry.name;
            asset.path = `_opened/${entry.name}.json`;
            commitAssets([...state.assets, asset]);
            return entry;
        };

        const importJson = (json: unknown) => {
            closePrefab();
            const entry = openJson(json);
            for (const existing of state.sceneEntries) {
                disposeSceneEntry(existing, renderer);
            }
            historyByRoot.clear();
            solo = null;
            setSoloRootId(null);
            commitEntries([]);
            commitVisible([]);
            addEntries([entry], BVector3.Zero());
        };

        actionsRef.current = {
            importAssets,
            focusEntry: (entry) => focusEntry(entry),
            toggleVisible,
            toggleSolo,
            deleteEntry,
            createDefault,
            placeDrop,
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
        };

        if (props.project) {
            void loadProject(props.project);
        } else if (props.effectJson) {
            addEntries([openJson(props.effectJson)], BVector3.Zero());
        } else {
            createDefault();
        }

        engine.runRenderLoop(() => {
            const playback = playbackRef.current;
            const entries = state.sceneEntries;
            const visibleIds = new Set(state.visibleRootIds);
            const focusBinding = state.binding;
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
                            !focusTimelineMetaRef.current.anyLooping &&
                            QuarksUtil.isEffectFinished(focusBinding.root)
                        ) {
                            const settleAt = getFocusElapsed(playback, focusId);
                            scrubFocusToSettled(focusBinding, renderer, settleAt);
                            markFocusFinished(playback, focusId);
                            pauseFocus(focusBinding);
                            needsRefresh = true;
                        } else if (
                            focusId != null &&
                            playback.stagePlaying &&
                            !playback.focusFinishedByRoot.has(focusId)
                        ) {
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

            if (fpsRef.current) {
                fpsRef.current.textContent = `${Math.round(engine.getFps())} FPS`;
            }

            if (
                focusBinding &&
                (focusBinding.root.uniqueId !== focusTimelineMetaRef.current.rootId ||
                    focusBinding.getRevision() !== focusTimelineMetaRef.current.revision)
            ) {
                const rows = computeTimelineRows(focusBinding);
                focusTimelineMetaRef.current = {
                    rootId: focusBinding.root.uniqueId,
                    revision: focusBinding.getRevision(),
                    span: computeTimelineSpan(rows),
                    anyLooping: rows.some((row) => row.kind === 'track' && row.looping),
                };
            }
            if (counterRef.current) {
                const count = countGalleryParticles(entries, visibleIds);
                const focused = entries.find((entry) => entry.root === focusBinding?.root);
                const focusId = playback.focusRootId ?? focused?.root.uniqueId ?? null;
                const focusElapsed = focusId != null ? getFocusElapsed(playback, focusId) : 0;
                const focusEnded = focusId != null && isFocusFinished(playback, focusId);
                const meta = focusTimelineMetaRef.current;
                const timeLabel = meta.anyLooping
                    ? `${focusElapsed.toFixed(1)}s ⟳`
                    : focusEnded
                      ? `${focusElapsed.toFixed(1)}s / ${meta.span.toFixed(1)}s (end)`
                      : `${focusElapsed.toFixed(1)}s / ${meta.span.toFixed(1)}s`;
                counterRef.current.textContent = focused ? `${timeLabel} · ${count} particles` : `${count} particles`;
            }
        });

        const resizeObserver = new ResizeObserver(() => engine.resize());
        resizeObserver.observe(canvasRef.current!);
        const onKey = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            if ((e.ctrlKey || e.metaKey) && key === 's') {
                e.preventDefault();
                if (prefab) {
                    setPrefabDialog('overwrite');
                } else {
                    void saveScene();
                }
                return;
            }
            if (e.code === 'Space' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                setDrawerOpen((open) => !open);
                return;
            }
            const target = e.target as HTMLElement | null;
            if (e.code === 'Space' && !isTextInput(target) && target?.tagName !== 'BUTTON') {
                e.preventDefault();
                const playback = playbackRef.current;
                toggleStagePlayback(state.binding, scene, playback, playback.stagePlaying, setStagePlaying);
                return;
            }
            if (e.key === 'Escape') {
                closeFloatingDrawer();
            }
            if ((e.ctrlKey || e.metaKey) && (key === 'z' || key === 'y')) {
                if (isTextInput(e.target) && !isInspectorValueControl(e.target)) {
                    return;
                }
                e.preventDefault();
                // Leave the field first so it shows the restored value instead of its draft text.
                (e.target as HTMLElement | null)?.blur?.();
                historyStep(key === 'y' || e.shiftKey);
                return;
            }
            if (e.key === 'Delete' && !isTextInput(e.target)) {
                const entry = state.sceneEntries.find((item) => item.root === state.binding?.root);
                if (entry) {
                    e.preventDefault();
                    deleteEntry(entry);
                }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => {
            unsubscribeTransform();
            window.clearTimeout(toastTimerRef.current);
            resizeObserver.disconnect();
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('dragend', onWindowDragEnd);
            clearAssetDragPreview();
            cancelGalleryCameraFocus();
            dropMarker.dispose();
            dropMarkerRef.current = null;
            selectionMarker.dispose();
            selectionMarkerRef.current = null;
            emitterWireframes.dispose();
            emitterWireframesRef.current = null;
            viewportPicker.dispose();
            viewportPickerRef.current = null;
            canvasRef.current?.removeEventListener('pointerleave', handleViewportPointerLeave);
            scene.onPointerObservable.remove(pointerObserver);
            gizmoManager.dispose();
            gizmoUtilityLayer.dispose();
            engine.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        playbackRef.current.stagePlaying = stagePlaying;
        const snap = stateRef.current;
        if (!snap) {
            return;
        }
        applyGalleryPlayback(
            snap.sceneEntries,
            new Set(visibleRootIds),
            stagePlaying,
            playbackRef.current.focusFinishedByRoot
        );
        if (!stagePlaying) {
            snap.renderer.refreshBatches();
        }
    }, [stagePlaying, visibleRootIds, sceneEntries]);

    useEffect(() => {
        emitterWireframesRef.current?.setVisible(showEmitterWireframes);
    }, [showEmitterWireframes]);

    // The floating drawer is opaque, so render the scene only in the part of the viewport above
    // it: the view — and every "frame this effect" camera move — re-centres on what is visible.
    useEffect(() => {
        const update = () => {
            const camera = stateRef.current?.camera;
            const canvas = canvasRef.current;
            const area = mainAreaRef.current;
            if (!camera || !canvas || !area) return;
            const canvasRect = canvas.getBoundingClientRect();
            const drawerTop = area.getBoundingClientRect().bottom - DRAWER_HEIGHT;
            const covered =
                drawerOpen && !drawerPinned
                    ? Math.max(0, Math.min(canvasRect.height * 0.8, canvasRect.bottom - drawerTop))
                    : 0;
            const fraction = canvasRect.height > 0 ? covered / canvasRect.height : 0;
            camera.viewport = new Viewport(0, fraction, 1, 1 - fraction);
            setViewportInset(covered);
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, [drawerOpen, drawerPinned, timelineCollapsed]);

    useEffect(() => {
        if (!props.project || !sceneDirty) return;
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [props.project, sceneDirty]);

    const requestPrefabExit = () => {
        if (prefabDirty) {
            setPrefabDialog('exit');
        } else {
            actionsRef.current.closePrefab();
        }
    };

    const requestExitProject = () => {
        if (prefabInfo) {
            requestPrefabExit();
            return;
        }
        if (sceneDirty) {
            setExitPrompt(true);
        } else {
            props.onExitProject?.();
        }
    };

    useEffect(() => {
        const gm = gizmoManagerRef.current;
        if (!gm) return;
        gm.positionGizmoEnabled = gizmoMode === 'position';
        gm.rotationGizmoEnabled = gizmoMode === 'rotation';
        gm.scaleGizmoEnabled = gizmoMode === 'scale';
        const activeGizmo =
            gizmoMode === 'position'
                ? gm.gizmos.positionGizmo
                : gizmoMode === 'rotation'
                  ? gm.gizmos.rotationGizmo
                  : gizmoMode === 'scale'
                    ? gm.gizmos.scaleGizmo
                    : null;
        let dragRaf = 0;
        const scheduleTransformRefresh = () => {
            if (dragRaf !== 0) {
                return;
            }
            dragRaf = requestAnimationFrame(() => {
                dragRaf = 0;
                notifyTransformChanged();
            });
        };
        // One gizmo drag = one undo step: snapshot at drag start, refresh the UI at the end.
        const dragStartObserver = activeGizmo?.onDragStartObservable.add(() =>
            stateRef.current?.binding?.onBeforeChange?.()
        );
        const dragObserver = activeGizmo?.onDragObservable.add(scheduleTransformRefresh);
        const dragEndObserver = activeGizmo?.onDragEndObservable.add(() => {
            notifyTransformChanged();
            stateRef.current?.binding?.markChanged();
        });
        return () => {
            if (dragRaf !== 0) {
                cancelAnimationFrame(dragRaf);
            }
            if (activeGizmo && dragStartObserver) {
                activeGizmo.onDragStartObservable.remove(dragStartObserver);
            }
            if (activeGizmo && dragObserver) {
                activeGizmo.onDragObservable.remove(dragObserver);
            }
            if (activeGizmo && dragEndObserver) {
                activeGizmo.onDragEndObservable.remove(dragEndObserver);
            }
        };
    }, [gizmoMode]);

    useEffect(() => {
        const gm = gizmoManagerRef.current;
        if (!gm) return;
        if (selectedNode && selectedNode.isDisposed()) {
            setSelectedNode(stateRef.current?.binding?.root ?? null);
            return;
        }
        if (isAssetsLoading) {
            return;
        }
        const target =
            selectedNode && !selectedNode.isDisposed()
                ? selectedNode
                : binding?.root && !binding.root.isDisposed()
                  ? binding.root
                  : null;
        gm.attachToNode(target);
    }, [selectedNode, binding, isAssetsLoading]);

    const state = stateRef.current;
    const gizmoNode =
        selectedNode && !selectedNode.isDisposed()
            ? selectedNode
            : binding?.root && !binding.root.isDisposed()
              ? binding.root
              : null;

    const allSystems = binding ? [binding.system, ...binding.subSystems] : [];
    const activeSystem = binding ? (allSystems.find((s) => s.emitter === selectedNode) ?? binding.system) : null;
    // The inspector is the expensive part of a selection change (every module re-renders for the
    // new system). It renders from deferred values, so the click, tree highlight and gizmo update
    // at once and the inspector catches up in an interruptible render instead of stalling frames.
    const deferredBinding = useDeferredValue(binding);
    const deferredNode = useDeferredValue(selectedNode);
    const inspectorBinding = deferredBinding && !deferredBinding.root.isDisposed() ? deferredBinding : binding;
    const inspectorNode =
        deferredNode && !deferredNode.isDisposed() && inspectorBinding === deferredBinding
            ? deferredNode
            : (inspectorBinding?.root ?? null);
    const inspectorSystems = inspectorBinding ? [inspectorBinding.system, ...inspectorBinding.subSystems] : [];
    const inspectorSystem = inspectorBinding
        ? (inspectorSystems.find((s) => s.emitter === inspectorNode) ?? inspectorBinding.system)
        : null;
    const visibleRootIdSet = useMemo(() => new Set(visibleRootIds), [visibleRootIds]);
    const instanceCounts = useMemo(() => countInstancesByAsset(sceneEntries), [sceneEntries]);
    const showTimeline = Boolean(binding && activeSystem && state);
    const timelinePlaybackEnabled = !focusedRoot || visibleRootIdSet.has(focusedRoot.uniqueId);
    const resolveTextureForEditor = useCallback(
        (url: string) => {
            const scene = stateRef.current?.scene;
            return scene && props.resolveTexture ? props.resolveTexture(url, scene) : undefined;
        },
        [props.resolveTexture]
    );
    const resolveGeometryForEditor = useCallback(
        (file: File) => {
            const scene = stateRef.current?.scene;
            if (!scene || !props.resolveGeometry) {
                return Promise.reject(new Error('Geometry loader is not available.'));
            }
            return props.resolveGeometry(file, scene);
        },
        [props.resolveGeometry]
    );

    return (
        <div
            className="qe-root"
            style={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                height: '100%',
                fontFamily: theme.font,
                color: theme.text,
                background: '#070b16',
            }}
        >
            <style>{globalEditorStyles}</style>
            <div
                ref={mainAreaRef}
                style={{
                    position: 'relative',
                    flex: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                <div style={{display: 'flex', flex: 1, minHeight: 0}}>
                    <aside
                        style={{
                            width: SCENE_PANEL_WIDTH,
                            flexShrink: 0,
                            borderRight: `1px solid ${theme.border}`,
                            background: theme.panelBg,
                            display: 'flex',
                            flexDirection: 'column',
                            minHeight: 0,
                        }}
                    >
                        {props.project && (
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '8px 10px',
                                    borderBottom: `1px solid ${theme.border}`,
                                }}
                            >
                                {props.onExitProject && (
                                    <button
                                        type="button"
                                        className="qe-hover"
                                        title="Back to projects"
                                        style={{...dockIconButtonStyle, width: 26, height: 26}}
                                        onClick={requestExitProject}
                                    >
                                        <ArrowLeftIcon style={iconStyle(13)} />
                                    </button>
                                )}
                                <span
                                    title={props.project.name}
                                    style={{
                                        flex: 1,
                                        minWidth: 0,
                                        fontSize: 13,
                                        fontWeight: 600,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {props.project.name}
                                    {sceneDirty ? ' *' : ''}
                                </span>
                                <button
                                    type="button"
                                    className="qe-hover"
                                    title="Save the scene (Ctrl+S) — assets are not changed"
                                    disabled={projectLoading}
                                    style={{
                                        ...buttonStyle,
                                        padding: '4px 12px',
                                        ...(sceneDirty
                                            ? {
                                                  background: theme.accent,
                                                  color: '#0a1128',
                                                  border: `1px solid ${theme.accent}`,
                                              }
                                            : {}),
                                    }}
                                    onClick={() =>
                                        prefabInfo ? setPrefabDialog('overwrite') : void actionsRef.current.saveScene()
                                    }
                                >
                                    Save
                                </button>
                            </div>
                        )}
                        <div style={{padding: '12px 14px 10px', borderBottom: `1px solid ${theme.border}`}}>
                            <div style={{fontSize: 14, fontWeight: 600}}>
                                {prefabInfo
                                    ? 'Prefab'
                                    : `Scene${sceneEntries.length > 0 ? ` · ${sceneEntries.length}` : ''}`}
                            </div>
                            <div style={{fontSize: 11, color: theme.textDim, marginTop: 4, lineHeight: 1.4}}>
                                {prefabInfo
                                    ? 'The scene is set aside while you edit this asset'
                                    : 'Effects in the viewport · click to edit · eye shows/hides'}
                            </div>
                        </div>
                        <div
                            style={{
                                flex: 1,
                                minHeight: 0,
                                overflow: 'hidden',
                                padding: '8px 12px 14px',
                                display: 'flex',
                                flexDirection: 'column',
                            }}
                        >
                            {prefabInfo ? (
                                <div style={{display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0}}>
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 10,
                                            padding: 12,
                                            border: `1px solid ${theme.borderActive}`,
                                            borderRadius: 8,
                                            background: 'rgba(120, 165, 255, 0.08)',
                                            fontSize: 12,
                                            color: theme.textDim,
                                            lineHeight: 1.5,
                                        }}
                                    >
                                        <div style={{fontSize: 13, fontWeight: 600, color: theme.text}}>
                                            {prefabInfo.name}
                                            {prefabDirty ? ' *' : ''}
                                        </div>
                                        <div style={{wordBreak: 'break-all'}}>{prefabInfo.path}</div>
                                        <div>
                                            Save (Ctrl+S) overwrites this asset. Effects already placed in the scene
                                            keep their own copy and do not change.
                                        </div>
                                        <div style={{display: 'flex', gap: 6}}>
                                            <button
                                                type="button"
                                                className="qe-hover"
                                                style={buttonStyle}
                                                onClick={requestPrefabExit}
                                            >
                                                ← Scene
                                            </button>
                                            <button
                                                type="button"
                                                className="qe-hover"
                                                style={buttonStyle}
                                                onClick={() => setPrefabDialog('overwrite')}
                                            >
                                                Save prefab
                                            </button>
                                        </div>
                                    </div>
                                    {sceneEntries[0] && (
                                        <div
                                            style={{
                                                flex: 1,
                                                minHeight: 0,
                                                overflowY: 'auto',
                                                border: `1px solid ${theme.border}`,
                                                borderRadius: 8,
                                                background: theme.sectionBg,
                                                padding: '4px 0',
                                            }}
                                        >
                                            <EffectTreeView
                                                includeRoot
                                                root={sceneEntries[0].root}
                                                selectedNode={selectedNode}
                                                onSelect={setSelectedNode}
                                            />
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <ScenePanel
                                    entries={sceneEntries}
                                    focusedRoot={focusedRoot}
                                    visibleRootIds={visibleRootIdSet}
                                    onFocus={(entry) => actionsRef.current.focusEntry(entry)}
                                    onToggleVisible={(entry) => actionsRef.current.toggleVisible(entry)}
                                    soloRootId={soloRootId}
                                    onToggleSolo={(entry) => actionsRef.current.toggleSolo(entry)}
                                    onSaveAsAsset={(entry) => setSaveAsTarget(entry)}
                                    onDelete={(entry) => actionsRef.current.deleteEntry(entry)}
                                    onCreateDefault={() => actionsRef.current.createDefault()}
                                    selectedNode={selectedNode}
                                    onSelectNode={(entry, node) => {
                                        if (stateRef.current?.binding?.root !== entry.root) {
                                            actionsRef.current.focusEntry(entry);
                                        }
                                        setSelectedNode(node);
                                    }}
                                />
                            )}
                        </div>
                    </aside>
                    <div
                        style={{position: 'relative', flex: 1, minWidth: 0}}
                        onDragEnter={(e) => {
                            if (!e.dataTransfer.types.includes(ASSET_DRAG_MIME)) return;
                            assetDragDepthRef.current += 1;
                        }}
                        onDragLeave={(e) => {
                            if (!e.dataTransfer.types.includes(ASSET_DRAG_MIME)) return;
                            assetDragDepthRef.current -= 1;
                            if (assetDragDepthRef.current <= 0) {
                                assetDragDepthRef.current = 0;
                                dropMarkerRef.current?.hide();
                                setAssetDragHover(null);
                            }
                        }}
                        onDragOver={(e) => {
                            if (!e.dataTransfer.types.includes(ASSET_DRAG_MIME)) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'copy';

                            const payload = getAssetDragSession();
                            const snap = stateRef.current;
                            if (!payload || !snap) return;

                            const described = describeAssetDrag(snap.assets, payload);
                            if (described.assets.length === 0) return;

                            const position = pickGroundPosition(snap.scene, e.clientX, e.clientY);
                            dropMarkerRef.current?.show(position, described.assets.length);
                            setAssetDragHover({label: described.label, count: described.assets.length});
                        }}
                        onDrop={(e) => {
                            if (!e.dataTransfer.types.includes(ASSET_DRAG_MIME)) return;
                            e.preventDefault();
                            actionsRef.current.placeDrop(e.clientX, e.clientY, e.dataTransfer);
                        }}
                    >
                        <canvas
                            ref={canvasRef}
                            style={{
                                width: '100%',
                                height: '100%',
                                display: 'block',
                                touchAction: 'none',
                                outline: 'none',
                            }}
                        />
                        <div
                            style={{
                                position: 'absolute',
                                bottom: 12 + viewportInset,
                                left: 12,
                                background: theme.panelBg,
                                border: `1px solid ${theme.border}`,
                                borderRadius: 8,
                                padding: '4px 10px',
                                fontSize: 12,
                                color: theme.textDim,
                                fontVariantNumeric: 'tabular-nums',
                                pointerEvents: 'none',
                                fontFamily: theme.font,
                            }}
                        >
                            <span ref={fpsRef}>— FPS</span>
                        </div>
                        {state && (
                            <div
                                style={{
                                    position: 'absolute',
                                    bottom: 12 + viewportInset,
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                }}
                            >
                                <TransportBar
                                    binding={binding}
                                    scene={state.scene}
                                    renderer={state.renderer}
                                    playbackRef={playbackRef}
                                    counterRef={counterRef}
                                    stagePlaying={stagePlaying}
                                    setStagePlaying={setStagePlaying}
                                    speed={speed}
                                    setSpeed={setSpeed}
                                    enabled={timelinePlaybackEnabled}
                                />
                            </div>
                        )}
                        {assetDragHover && (
                            <div
                                style={{
                                    position: 'absolute',
                                    inset: 10,
                                    border: '2px dashed rgba(120, 165, 255, 0.75)',
                                    borderRadius: 12,
                                    pointerEvents: 'none',
                                    boxShadow: 'inset 0 0 0 1px rgba(120, 165, 255, 0.15)',
                                }}
                            >
                                <div
                                    style={{
                                        position: 'absolute',
                                        left: '50%',
                                        top: 18,
                                        transform: 'translateX(-50%)',
                                        background: 'rgba(7, 11, 22, 0.88)',
                                        border: `1px solid ${theme.border}`,
                                        borderRadius: 8,
                                        padding: '8px 14px',
                                        fontSize: 13,
                                        color: theme.text,
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    Drop {assetDragHover.count === 1 ? 'effect' : `${assetDragHover.count} effects`} —{' '}
                                    {assetDragHover.label}
                                </div>
                            </div>
                        )}
                        {assetsLoading && (
                            <div
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: 'rgba(7, 11, 22, 0.72)',
                                    pointerEvents: 'none',
                                }}
                            >
                                <div
                                    style={{
                                        background: theme.panelBg,
                                        border: `1px solid ${theme.border}`,
                                        borderRadius: 10,
                                        padding: '16px 22px',
                                        textAlign: 'center',
                                    }}
                                >
                                    <div style={{fontWeight: 600, marginBottom: 6}}>Importing assets…</div>
                                    <div style={{fontSize: 13, color: theme.textDim}}>
                                        {assetsLoading.done} / {assetsLoading.total || '…'} files
                                        {assetsLoading.failed > 0 ? ` · ${assetsLoading.failed} skipped` : ''}
                                    </div>
                                </div>
                            </div>
                        )}
                        {prefabInfo && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 12,
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '4px 4px 4px 6px',
                                    background: theme.panelBg,
                                    border: `1px solid ${theme.borderActive}`,
                                    borderRadius: 8,
                                    fontSize: 12.5,
                                    zIndex: 5,
                                }}
                            >
                                <button
                                    type="button"
                                    className="qe-hover"
                                    title="Back to the scene"
                                    style={{...buttonStyle, padding: '3px 10px'}}
                                    onClick={requestPrefabExit}
                                >
                                    ← Scene
                                </button>
                                <span style={{color: theme.textDim}}>›</span>
                                <span style={{fontWeight: 600, whiteSpace: 'nowrap'}}>
                                    {prefabInfo.name}
                                    {prefabDirty ? ' *' : ''}
                                </span>
                                <button
                                    type="button"
                                    className="qe-hover"
                                    title="Overwrite the prefab asset (Ctrl+S)"
                                    style={{
                                        ...buttonStyle,
                                        padding: '3px 12px',
                                        ...(prefabDirty
                                            ? {
                                                  background: theme.accent,
                                                  color: '#0a1128',
                                                  border: `1px solid ${theme.accent}`,
                                              }
                                            : {}),
                                    }}
                                    onClick={() => setPrefabDialog('overwrite')}
                                >
                                    Save
                                </button>
                            </div>
                        )}
                        {props.backLink && !prefabInfo && (
                            <a
                                className="qe-hover"
                                href={props.backLink.href}
                                style={{
                                    position: 'absolute',
                                    top: 12,
                                    left: 12,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    background: theme.panelBg,
                                    border: `1px solid ${theme.border}`,
                                    borderRadius: 8,
                                    padding: '6px 12px',
                                    fontSize: 13,
                                    fontWeight: 500,
                                    color: theme.text,
                                    textDecoration: 'none',
                                    fontFamily: theme.font,
                                }}
                            >
                                <ArrowLeftIcon style={iconStyle(14)} />
                                {props.backLink.label.replace(/^←\s*/, '')}
                            </a>
                        )}
                        <div
                            style={{
                                position: 'absolute',
                                top: 12,
                                right: 12,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-end',
                                gap: 6,
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    gap: 4,
                                    background: theme.panelBg,
                                    border: `1px solid ${theme.border}`,
                                    borderRadius: 8,
                                    padding: 4,
                                }}
                            >
                                <button
                                    className="qe-hover"
                                    style={squareButtonStyle}
                                    title="Undo (Ctrl+Z)"
                                    disabled={!state?.history.canUndo || !binding}
                                    onClick={() => actionsRef.current.historyStep(false)}
                                >
                                    <ArrowUturnLeftIcon style={iconStyle(14)} />
                                </button>
                                <button
                                    className="qe-hover"
                                    style={squareButtonStyle}
                                    title="Redo (Ctrl+Shift+Z)"
                                    disabled={!state?.history.canRedo || !binding}
                                    onClick={() => actionsRef.current.historyStep(true)}
                                >
                                    <ArrowUturnRightIcon style={iconStyle(14)} />
                                </button>
                            </div>
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 4,
                                    background: theme.panelBg,
                                    border: `1px solid ${theme.border}`,
                                    borderRadius: 8,
                                    padding: 4,
                                }}
                            >
                                {GIZMO_MODE_BUTTONS.map((m) => (
                                    <button
                                        key={m.value}
                                        className="qe-hover"
                                        style={{
                                            ...squareButtonStyle,
                                            ...(gizmoMode === m.value ? activeSquareButtonStyle : {}),
                                        }}
                                        title={m.title}
                                        onClick={() => setGizmoMode(m.value)}
                                    >
                                        <m.Icon style={iconStyle(14)} />
                                    </button>
                                ))}
                            </div>
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 4,
                                    background: theme.panelBg,
                                    border: `1px solid ${theme.border}`,
                                    borderRadius: 8,
                                    padding: 4,
                                }}
                            >
                                <button
                                    className="qe-hover"
                                    style={{
                                        ...squareButtonStyle,
                                        ...(showEmitterWireframes ? activeSquareButtonStyle : {}),
                                    }}
                                    title="Show emitter shape wireframes"
                                    disabled={!binding}
                                    onClick={() => setShowEmitterWireframes((on) => !on)}
                                >
                                    <CubeTransparentIcon style={iconStyle(14)} />
                                </button>
                            </div>
                        </div>
                    </div>
                    <aside
                        style={{
                            width: 340,
                            flexShrink: 0,
                            borderLeft: `1px solid ${theme.border}`,
                            background: theme.panelBg,
                            display: 'flex',
                            flexDirection: 'column',
                            minHeight: 0,
                        }}
                    >
                        <div style={{padding: '12px 14px 10px', borderBottom: `1px solid ${theme.border}`}}>
                            <div
                                style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: theme.textDim,
                                    textTransform: 'uppercase',
                                    letterSpacing: 0.4,
                                    marginBottom: 6,
                                }}
                            >
                                Inspector
                            </div>
                            <div
                                className="qe-hover-bg"
                                title={binding ? 'Rename effect' : undefined}
                                style={{
                                    fontSize: 16,
                                    fontWeight: 600,
                                    cursor: binding ? 'pointer' : 'default',
                                    borderRadius: 6,
                                    padding: '2px 4px',
                                    margin: '-2px -4px',
                                }}
                                onClick={() => binding && setRenamingRoot(true)}
                            >
                                {(binding?.root.name || props.title) ?? 'Effect editor'}
                            </div>
                            {renamingRoot && binding && (
                                <PromptDialog
                                    title="Rename effect"
                                    defaultValue={binding.root.name}
                                    onSubmit={(name) => {
                                        binding.apply(() => (binding.root.name = name));
                                        const entry = sceneEntries.find((item) => item.root === binding.root);
                                        if (entry) {
                                            entry.name = name;
                                        }
                                        setRenamingRoot(false);
                                    }}
                                    onCancel={() => setRenamingRoot(false)}
                                />
                            )}
                            <div style={{display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10}}>
                                <button
                                    className="qe-hover"
                                    style={buttonStyle}
                                    disabled={!binding}
                                    onClick={() => {
                                        if (!binding) return;
                                        const blob = new Blob([binding.exportJSON('EditorEffect')], {
                                            type: 'application/json',
                                        });
                                        const link = document.createElement('a');
                                        link.href = URL.createObjectURL(blob);
                                        link.download = `${binding.root.name || 'effect'}.json`;
                                        link.click();
                                        URL.revokeObjectURL(link.href);
                                    }}
                                >
                                    Export
                                </button>
                                {props.onSave && (
                                    <button
                                        className="qe-hover"
                                        style={buttonStyle}
                                        disabled={!binding}
                                        onClick={() => binding && props.onSave!(binding.exportJSON('EditorEffect'))}
                                    >
                                        Save
                                    </button>
                                )}
                            </div>
                        </div>
                        <div style={{flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 14px 20px'}}>
                            {inspectorBinding && inspectorSystem && inspectorNode ? (
                                <EffectEditor
                                    binding={inspectorBinding}
                                    selectedSystem={inspectorSystem}
                                    gizmoTargetNode={inspectorNode}
                                    gizmoTargetLabel={inspectorNode.name || 'Node'}
                                    textureOptions={props.textureOptions}
                                    geometryOptions={props.geometryOptions}
                                    resolveTexture={props.resolveTexture ? resolveTextureForEditor : undefined}
                                    resolveGeometry={props.resolveGeometry ? resolveGeometryForEditor : undefined}
                                />
                            ) : (
                                <div style={{fontSize: 13, color: theme.textDim, lineHeight: 1.5}}>
                                    No effect selected.
                                </div>
                            )}
                        </div>
                    </aside>
                </div>
                <div
                    aria-hidden={!drawerOpen && !drawerPinned}
                    style={{
                        height: DRAWER_HEIGHT,
                        display: 'flex',
                        flexDirection: 'column',
                        background: theme.panelBg,
                        borderTop: `1px solid ${theme.border}`,
                        ...(drawerPinned
                            ? {flexShrink: 0}
                            : {
                                  position: 'absolute',
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  zIndex: 20,
                                  background: '#0a0f20',
                                  boxShadow: '0 -10px 30px rgba(0, 0, 0, 0.5)',
                                  transform: drawerOpen ? 'none' : 'translateY(100%)',
                                  opacity: drawerOpen ? 1 : 0,
                                  pointerEvents: drawerOpen ? 'auto' : 'none',
                                  transition: 'transform 0.18s ease, opacity 0.18s ease',
                              }),
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 6px 4px 12px',
                            borderBottom: `1px solid ${theme.border}`,
                        }}
                    >
                        <span style={dockTitleStyle}>Assets</span>
                        <span style={{fontSize: 11, color: theme.textDim}}>Ctrl+Space</span>
                        <span style={{flex: 1}} />
                        <button
                            type="button"
                            className="qe-hover"
                            title={
                                drawerPinned
                                    ? 'Unpin — float over the viewport again'
                                    : 'Pin — keep it docked above the timeline'
                            }
                            style={{...dockIconButtonStyle, ...(drawerPinned ? activeSquareButtonStyle : {})}}
                            onClick={() => {
                                setDrawerPinned((pinned) => !pinned);
                                setDrawerOpen(true);
                            }}
                        >
                            <MapPinIcon style={iconStyle(13)} />
                        </button>
                        <button
                            type="button"
                            className="qe-hover"
                            title="Close (Esc)"
                            style={dockIconButtonStyle}
                            onClick={() => {
                                setDrawerPinned(false);
                                setDrawerOpen(false);
                            }}
                        >
                            <XMarkIcon style={iconStyle(13)} />
                        </button>
                    </div>
                    <AssetsPanel
                        assets={assets}
                        instanceCounts={instanceCounts}
                        loading={assetsLoading}
                        folderInputRef={assetFolderInputRef}
                        onImportFiles={(files) => void runAssetImport(files)}
                        onImportFolder={handleImportFolder}
                        onAddToScene={(payload) => actionsRef.current.addToScene(payload)}
                        onOpenPrefab={(asset) => actionsRef.current.openPrefab(asset.id)}
                        onDelete={(payload) => actionsRef.current.deleteAssets(payload)}
                    />
                </div>
            </div>
            <div
                style={{
                    flexShrink: 0,
                    borderTop: `1px solid ${theme.border}`,
                    background: theme.panelBg,
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <div style={{display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px'}}>
                    <button
                        type="button"
                        className="qe-hover-bg"
                        title={timelineCollapsed ? 'Expand timeline' : 'Collapse timeline'}
                        style={{...dockIconButtonStyle, border: 'none', background: 'transparent'}}
                        onClick={() => setTimelineCollapsed((collapsed) => !collapsed)}
                    >
                        {timelineCollapsed ? (
                            <ChevronUpIcon style={iconStyle(13)} />
                        ) : (
                            <ChevronDownIcon style={iconStyle(13)} />
                        )}
                    </button>
                    <span style={dockTitleStyle}>Timeline</span>
                    {binding && (
                        <span
                            style={{
                                fontSize: 12,
                                color: theme.textDim,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {binding.root.name}
                        </span>
                    )}
                    <span style={{flex: 1}} />
                    <button
                        type="button"
                        className="qe-hover"
                        title="Assets (Ctrl+Space)"
                        style={{
                            ...buttonStyle,
                            padding: '3px 10px',
                            ...(drawerOpen || drawerPinned ? activeSquareButtonStyle : {}),
                        }}
                        onClick={() => {
                            if (drawerPinned) {
                                setDrawerPinned(false);
                                setDrawerOpen(false);
                            } else {
                                setDrawerOpen((open) => !open);
                            }
                        }}
                    >
                        Assets{assets.length > 0 ? ` · ${assets.length}` : ''}
                    </button>
                </div>
                <div
                    style={{
                        height: TIMELINE_HEIGHT,
                        display: timelineCollapsed ? 'none' : 'flex',
                        borderTop: `1px solid ${theme.border}`,
                    }}
                >
                    {showTimeline && binding && activeSystem && state ? (
                        <TimelinePanel
                            docked
                            showTransport={false}
                            binding={binding}
                            selectedNode={selectedNode}
                            onSelectNode={setSelectedNode}
                            scene={state.scene}
                            renderer={state.renderer}
                            playbackRef={playbackRef}
                            playheadRef={playheadRef}
                            counterRef={timelineCounterRef}
                            stagePlaying={stagePlaying}
                            setStagePlaying={setStagePlaying}
                            speed={speed}
                            setSpeed={setSpeed}
                            playbackEnabled={timelinePlaybackEnabled}
                        />
                    ) : (
                        <div style={{padding: '14px', fontSize: 12, color: theme.textDim}}>
                            Select an effect in the Scene to see its timeline.
                        </div>
                    )}
                </div>
            </div>
            {projectLoading && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(7, 11, 22, 0.8)',
                        zIndex: 900,
                        color: theme.text,
                        fontSize: 14,
                    }}
                >
                    Opening {props.project?.name ?? 'project'}…
                </div>
            )}
            {toast && (
                <div
                    role="status"
                    style={{
                        position: 'fixed',
                        top: 16,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 950,
                        background: '#13204a',
                        border: `1px solid ${theme.borderActive}`,
                        borderRadius: 8,
                        padding: '8px 14px',
                        fontSize: 12.5,
                        color: theme.text,
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                        pointerEvents: 'none',
                    }}
                >
                    {toast}
                </div>
            )}
            {saveAsTarget && (
                <PromptDialog
                    title="Save as new asset — Folder/Name"
                    defaultValue={saveAsTarget.name}
                    placeholder="Fire/Big explosion"
                    confirmLabel="Save"
                    onSubmit={(path) => {
                        const entry = saveAsTarget;
                        setSaveAsTarget(null);
                        actionsRef.current.saveEntryAsAsset(entry, path);
                    }}
                    onCancel={() => setSaveAsTarget(null)}
                />
            )}
            {prefabDialog === 'overwrite' && prefabInfo && (
                <ChoiceDialog
                    title={`Overwrite prefab “${prefabInfo.name}”?`}
                    message={(() => {
                        const count = actionsRef.current.prefabInstanceCount();
                        return count > 0
                            ? `The asset is replaced with your edits. The ${count} “${prefabInfo.name}” effect(s) already in the scene will not change.`
                            : 'The asset is replaced with your edits. Effects already in the scene will not change.';
                    })()}
                    actions={[
                        {label: 'Cancel', onSelect: () => setPrefabDialog(null)},
                        {label: 'Save as new…', onSelect: () => setPrefabDialog('saveAs')},
                        {
                            label: 'Overwrite',
                            primary: true,
                            onSelect: () => {
                                setPrefabDialog(null);
                                actionsRef.current.overwritePrefab();
                            },
                        },
                    ]}
                    onCancel={() => setPrefabDialog(null)}
                />
            )}
            {prefabSwitch && prefabInfo && (
                <ChoiceDialog
                    title={`Save changes to prefab “${prefabInfo.name}”?`}
                    message={`Before opening “${prefabSwitch.name}”. Saving overwrites the prefab asset; effects already in the scene will not change.`}
                    actions={[
                        {label: 'Cancel', onSelect: () => setPrefabSwitch(null)},
                        {
                            label: "Don't save",
                            danger: true,
                            onSelect: () => {
                                setPrefabSwitch(null);
                                actionsRef.current.openPrefab(prefabSwitch.id, true);
                            },
                        },
                        {
                            label: 'Save',
                            primary: true,
                            onSelect: () => {
                                setPrefabSwitch(null);
                                actionsRef.current.overwritePrefab();
                                actionsRef.current.openPrefab(prefabSwitch.id, true);
                            },
                        },
                    ]}
                    onCancel={() => setPrefabSwitch(null)}
                />
            )}
            {prefabDialog === 'exit' && prefabInfo && (
                <ChoiceDialog
                    title={`Save changes to prefab “${prefabInfo.name}”?`}
                    message="Saving overwrites the prefab asset. Effects already in the scene will not change."
                    actions={[
                        {label: 'Cancel', onSelect: () => setPrefabDialog(null)},
                        {
                            label: "Don't save",
                            danger: true,
                            onSelect: () => {
                                setPrefabDialog(null);
                                actionsRef.current.closePrefab();
                            },
                        },
                        {
                            label: 'Save',
                            primary: true,
                            onSelect: () => {
                                setPrefabDialog(null);
                                actionsRef.current.overwritePrefab();
                                actionsRef.current.closePrefab();
                            },
                        },
                    ]}
                    onCancel={() => setPrefabDialog(null)}
                />
            )}
            {prefabDialog === 'saveAs' && prefabInfo && (
                <PromptDialog
                    title="Save prefab as new asset — Folder/Name"
                    defaultValue={prefabInfo.path.replace(/\.json$/i, '')}
                    confirmLabel="Save"
                    onSubmit={(path) => {
                        setPrefabDialog(null);
                        actionsRef.current.savePrefabAsNew(path);
                    }}
                    onCancel={() => setPrefabDialog(null)}
                />
            )}
            {exitPrompt && (
                <ChoiceDialog
                    title="Save changes to the scene?"
                    message="The scene has changes that are not saved. Assets are already saved."
                    actions={[
                        {label: 'Cancel', onSelect: () => setExitPrompt(false)},
                        {
                            label: "Don't save",
                            danger: true,
                            onSelect: () => {
                                setExitPrompt(false);
                                props.onExitProject?.();
                            },
                        },
                        {
                            label: 'Save',
                            primary: true,
                            onSelect: () => {
                                setExitPrompt(false);
                                void actionsRef.current.saveScene().then((saved) => saved && props.onExitProject?.());
                            },
                        },
                    ]}
                    onCancel={() => setExitPrompt(false)}
                />
            )}
            {messageDialog && (
                <MessageDialog
                    title={messageDialog.title}
                    message={messageDialog.message}
                    onClose={() => setMessageDialog(null)}
                />
            )}
        </div>
    );
}

/** NME-style imperative entry point for hosts like BabylonJS Editor windows. */
export const QuarksEffectEditor = {
    Show(options: EffectEditorHostProps & {hostElement: HTMLElement}): {dispose: () => void} {
        const {hostElement, ...props} = options;
        const root = createRoot(hostElement);
        root.render(<EffectEditorHost {...props} />);
        return {dispose: () => root.unmount()};
    },
};
