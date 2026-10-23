import type {AbstractEngine} from '@babylonjs/core/Engines/abstractEngine.js';
import {Engine} from '@babylonjs/core/Engines/engine.js';
import type {Texture} from '@babylonjs/core/Materials/Textures/texture.js';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import type {Scene} from '@babylonjs/core/scene.js';
import React, {
    useCallback,
    useDeferredValue,
    useEffect,
    useLayoutEffect,
    useMemo,
    useReducer,
    useRef,
    useState,
} from 'react';
import {createRoot} from 'react-dom/client';
import {collectJsonFiles, type AssetLoadProgress, type EffectAsset} from '../core/assets.js';
import {ASSET_DRAG_MIME} from '../core/assetTree.js';
import type {EffectBinding} from '../core/binding.js';
import {
    createEditorSession,
    type EditorProject,
    type EditorSession,
    type EffectEditorHostHandle,
    type PrefabInfo,
} from '../core/editorSession.js';
import {pickAssetFolderFiles} from '../core/pickAssetFiles.js';
import {createPlaybackState, type PlaybackState} from '../core/playback.js';
import {countInstancesByAsset, type SceneEntry} from '../core/sceneEntries.js';
import {toggleStagePlayback} from '../core/transport.js';
import {AssetsDrawer, TimelineDock} from './host/BottomDocks.js';
import {HostDialogs, type PrefabDialog} from './host/HostDialogs.js';
import {useHostShortcuts, useStageGizmo, useUnsavedChangesGuard, useViewportInset} from './host/hostHooks.js';
import {InspectorSidebar} from './host/InspectorSidebar.js';
import {SceneSidebar} from './host/SceneSidebar.js';
import {ViewportPane, type GizmoMode} from './host/ViewportPane.js';
import type {GeometryData, GeometryOption, TextureOption} from './modules.js';
import {globalEditorStyles, theme} from './theme.js';
import {TimelinePanel} from './TimelinePanel.js';
import {TransportBar} from './TransportBar.js';

export type {EditorProject, EffectEditorHostHandle} from '../core/editorSession.js';

/** Props of {@link EffectEditorHost}. */
export interface EffectEditorHostProps {
    /** Quarks JSON export to open; a default effect is created when omitted. */
    effectJson?: unknown;
    /** When set, a Save button appears and receives the serialized effect. */
    onSave?: (json: string) => void;
    /** Called once the engine, scene and binding are live, and again whenever the focused effect changes. */
    onReady?: (handle: EffectEditorHostHandle) => void;
    /** Inspector header shown while the focused effect has no name. */
    title?: string;
    /** Texture presets offered in the Renderer module; the first is the default effect's texture. */
    textureOptions?: TextureOption[];
    /** Mesh presets for the Mesh render mode (e.g. asset meshes from a host editor). */
    geometryOptions?: GeometryOption[];
    /** Host texture loader for texture URLs picked in the editor. */
    resolveTexture?: (url: string, scene: Scene) => Texture | null | undefined;
    /** Host loader for the Mesh "Load from file…" option (e.g. GLB via @babylonjs/loaders). */
    resolveGeometry?: (file: File, scene: Scene) => Promise<GeometryData>;
    /** Optional link rendered in the viewport's top-left corner (e.g. back to a host gallery page). */
    backLink?: {
        /** Where the link goes. */
        href: string;
        /** The link's text; a leading `←` is dropped, an arrow icon is drawn instead. */
        label: string;
    };
    /**
     * Project to edit: its assets load from and save to `store`, and the scene is saved with
     * Save / Ctrl+S. Without it the editor works in memory only.
     */
    project?: EditorProject;
    /** Shows a "← Projects" button; called once unsaved scene changes are dealt with. */
    onExitProject?: () => void;
    /**
     * Builds the engine the editor draws with, on the canvas it is given, for example a
     * `WebGPUEngine` after `await engine.initAsync()`. It may return a promise. It must build a new
     * engine on every call: the editor disposes the engine when it unmounts, and React may mount
     * it more than once (StrictMode). Defaults to a WebGL `Engine` with antialiasing.
     */
    createEngine?: (canvas: HTMLCanvasElement) => AbstractEngine | Promise<AbstractEngine>;
}

/**
 * Self-contained effect editor: live Babylon preview, a Scene list of the effects placed in it,
 * an inspector, and a bottom dock with the timeline and the Assets browser. Assets are effect
 * files; dragging one into the viewport instantiates an independent copy, as many times as needed.
 * Designed for embedding — see {@link QuarksEffectEditor}.Show for the NME-style entry point.
 *
 * The scene, Assets, prefab mode and undo live in an {@link EditorSession}; this component is its
 * React view.
 */
export function EffectEditorHost(props: EffectEditorHostProps): React.ReactElement {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const counterRef = useRef<HTMLSpanElement>(null);
    const fpsRef = useRef<HTMLSpanElement>(null);
    const playheadRef = useRef<HTMLDivElement>(null);
    const timelineCounterRef = useRef<HTMLSpanElement>(null);
    const mainAreaRef = useRef<HTMLDivElement>(null);
    const assetFolderInputRef = useRef<HTMLInputElement>(null);
    const assetDragDepthRef = useRef(0);
    const playbackRef = useRef<PlaybackState>(createPlaybackState());
    const propsRef = useRef(props);

    const [session, setSession] = useState<EditorSession | null>(null);
    const [binding, setBinding] = useState<EffectBinding | null>(null);
    const [, force] = useReducer((x: number) => x + 1, 0);
    const [stagePlaying, setStagePlaying] = useState(true);
    const [speed, setSpeed] = useState(1);
    const [gizmoMode, setGizmoMode] = useState<GizmoMode>('none');
    const [selectedNode, setSelectedNode] = useState<TransformNode | null>(null);
    const selectedNodeRef = useRef<TransformNode | null>(null);
    const [sceneEntries, setSceneEntries] = useState<SceneEntry[]>([]);
    const [assets, setAssets] = useState<EffectAsset[]>([]);
    const [assetsLoading, setAssetsLoading] = useState<AssetLoadProgress | null>(null);
    const [focusedRoot, setFocusedRoot] = useState<TransformNode | null>(null);
    const [visibleRootIds, setVisibleRootIds] = useState<number[]>([]);
    const [message, setMessage] = useState<{title: string; message: string} | null>(null);
    const [assetDragHover, setAssetDragHover] = useState<{label: string; count: number} | null>(null);
    const [showEmitterWireframes, setShowEmitterWireframes] = useState(false);
    const [timelineCollapsed, setTimelineCollapsed] = useState(false);
    const [soloRootId, setSoloRootId] = useState<number | null>(null);
    // Assets drawer: floats over the viewport until closed (X, Esc, Ctrl+Space or the Assets
    // button); pinned, it is docked above the timeline instead.
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerPinned, setDrawerPinned] = useState(false);
    const [sceneDirty, setSceneDirty] = useState(false);
    const [projectLoading, setProjectLoading] = useState(Boolean(props.project));
    const [toast, setToast] = useState<string | null>(null);
    const [saveAsTarget, setSaveAsTarget] = useState<SceneEntry | null>(null);
    const [exitPrompt, setExitPrompt] = useState(false);
    // Prefab mode: one asset opened on its own, the scene set aside until "← Scene".
    const [prefabInfo, setPrefabInfo] = useState<PrefabInfo | null>(null);
    const [prefabDirty, setPrefabDirty] = useState(false);
    const [prefabDialog, setPrefabDialog] = useState<PrefabDialog>(null);
    /** Asset waiting to replace an open prefab that has unsaved edits. */
    const [prefabSwitch, setPrefabSwitch] = useState<{id: number; name: string} | null>(null);
    const toastTimerRef = useRef(0);
    const showToast = useCallback((text: string) => {
        window.clearTimeout(toastTimerRef.current);
        setToast(text);
        toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
    }, []);
    const showMessage = (title: string, text: string) => setMessage({title, message: text});

    /** Builds the session on `engine` and starts it; returns what undoes it, engine included. */
    function mountSession(canvas: HTMLCanvasElement, engine: AbstractEngine): () => void {
        const created = createEditorSession({
            engine,
            playback: playbackRef.current,
            project: props.project,
            effectJson: props.effectJson,
            resolveTexture: props.resolveTexture,
            defaultTextureUrl: props.textureOptions?.[0]?.url,
            isAssetDragActive: () => assetDragDepthRef.current > 0,
            getSelectedNode: () => selectedNodeRef.current,
            view: {
                bindingChanged: setBinding,
                selectedNodeChanged: setSelectedNode,
                focusedRootChanged: setFocusedRoot,
                entriesChanged: setSceneEntries,
                assetsChanged: setAssets,
                visibleChanged: setVisibleRootIds,
                soloChanged: setSoloRootId,
                assetsLoadingChanged: setAssetsLoading,
                sceneDirtyChanged: setSceneDirty,
                projectLoaded: () => setProjectLoading(false),
                prefabChanged: setPrefabInfo,
                prefabDirtyChanged: setPrefabDirty,
                prefabSwitchRequested: setPrefabSwitch,
                dragHoverChanged: setAssetDragHover,
                assetsRevealed: () => setDrawerOpen(true),
                refresh: force,
                toast: showToast,
                message: (title, text) => setMessage({title, message: text}),
                ready: (handle) => propsRef.current.onReady?.(handle),
                frame: (stats) => {
                    if (fpsRef.current) {
                        fpsRef.current.textContent = `${stats.fps} FPS`;
                    }
                    if (counterRef.current) {
                        counterRef.current.textContent = stats.counter;
                    }
                },
            },
        });
        setSession(created);
        created.start();

        const resizeObserver = new ResizeObserver(() => engine.resize());
        resizeObserver.observe(canvas);
        const onWindowDragEnd = () => {
            assetDragDepthRef.current = 0;
            created.clearDropPreview();
        };
        window.addEventListener('dragend', onWindowDragEnd);
        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('dragend', onWindowDragEnd);
            assetDragDepthRef.current = 0;
            setSession(null);
            created.dispose();
            engine.dispose();
        };
    }

    useEffect(() => {
        const canvas = canvasRef.current!;
        let unmounted = false;
        let teardown: (() => void) | null = null;
        const mount = (engine: AbstractEngine) => {
            if (unmounted) {
                engine.dispose();
                return;
            }
            teardown = mountSession(canvas, engine);
        };
        const built = props.createEngine ? props.createEngine(canvas) : new Engine(canvas, true);
        if (built instanceof Promise) {
            built.then(mount, (err: unknown) => {
                console.error('[Quarks editor] Could not create the engine:', err);
                if (!unmounted) {
                    setMessage({title: 'Engine', message: err instanceof Error ? err.message : String(err)});
                }
            });
        } else {
            mount(built);
        }
        return () => {
            unmounted = true;
            window.clearTimeout(toastTimerRef.current);
            teardown?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only: builds the engine and scene once
    }, []);

    useEffect(() => {
        playbackRef.current.stagePlaying = stagePlaying;
        session?.syncPlayback();
    }, [session, stagePlaying, visibleRootIds, sceneEntries]);

    useEffect(() => {
        session?.setEmitterWireframesVisible(showEmitterWireframes);
    }, [session, showEmitterWireframes]);

    const viewportInset = useViewportInset(
        session,
        canvasRef,
        mainAreaRef,
        drawerOpen && !drawerPinned,
        timelineCollapsed
    );
    useUnsavedChangesGuard(Boolean(props.project) && sceneDirty);

    // The selection, with a node gone with an undo falling back to the effect's root; the gizmo
    // follows it.
    const liveSelection = selectedNode?.isDisposed() ? (session?.binding?.root ?? null) : selectedNode;
    // The session's callbacks read the latest props and selection through these refs.
    useLayoutEffect(() => {
        propsRef.current = props;
        selectedNodeRef.current = liveSelection;
    });
    const gizmoTarget =
        liveSelection && !liveSelection.isDisposed()
            ? liveSelection
            : binding?.root && !binding.root.isDisposed()
              ? binding.root
              : null;
    useStageGizmo(session, gizmoMode, gizmoTarget, assetsLoading !== null);

    const closeFloatingDrawer = () => {
        if (!drawerPinned) {
            setDrawerOpen(false);
        }
    };
    const savePrefabOrScene = () => {
        if (session?.isPrefabOpen) {
            setPrefabDialog('overwrite');
        } else {
            void session?.saveScene();
        }
    };
    useHostShortcuts({
        save: savePrefabOrScene,
        toggleAssets: () => setDrawerOpen((open) => !open),
        togglePlayback: () => {
            if (!session) return;
            const playback = playbackRef.current;
            toggleStagePlayback(session.binding, session.scene, playback, playback.stagePlaying, setStagePlaying);
        },
        closeDrawer: closeFloatingDrawer,
        historyStep: (redo) => session?.historyStep(redo),
        deleteFocused: () => session?.deleteFocused() ?? false,
    });

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
            await session?.importAssets(files);
        } catch (err) {
            showMessage('Import assets', err instanceof Error ? err.message : String(err));
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
                showMessage('Import assets', err instanceof Error ? err.message : String(err));
                console.error('Failed to open folder picker:', err);
            }
        })();
    };

    const requestPrefabExit = () => {
        if (prefabDirty) {
            setPrefabDialog('exit');
        } else {
            session?.closePrefab();
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

    const allSystems = binding ? [binding.system, ...binding.subSystems] : [];
    const activeSystem = binding ? (allSystems.find((s) => s.emitter === liveSelection) ?? binding.system) : null;
    // The inspector is the expensive part of a selection change (every module re-renders for the
    // new system). It renders from deferred values, so the click, tree highlight and gizmo update
    // at once and the inspector catches up in an interruptible render instead of stalling frames.
    const deferredBinding = useDeferredValue(binding);
    const deferredNode = useDeferredValue(liveSelection);
    const inspectorBinding = deferredBinding && !deferredBinding.root.isDisposed() ? deferredBinding : binding;
    const inspectorNode =
        deferredNode && !deferredNode.isDisposed() && inspectorBinding === deferredBinding
            ? deferredNode
            : (inspectorBinding?.root ?? null);
    const inspectorSystem = inspectorBinding
        ? ([inspectorBinding.system, ...inspectorBinding.subSystems].find((s) => s.emitter === inspectorNode) ??
          inspectorBinding.system)
        : null;
    const visibleRootIdSet = useMemo(() => new Set(visibleRootIds), [visibleRootIds]);
    const instanceCounts = useMemo(() => countInstancesByAsset(sceneEntries), [sceneEntries]);
    const timelinePlaybackEnabled = !focusedRoot || visibleRootIdSet.has(focusedRoot.uniqueId);
    const {resolveTexture, resolveGeometry} = props;
    const resolveTextureForEditor = useCallback(
        (url: string) => (session && resolveTexture ? resolveTexture(url, session.scene) : undefined),
        [session, resolveTexture]
    );
    const resolveGeometryForEditor = useCallback(
        (file: File) => {
            if (!session || !resolveGeometry) {
                return Promise.reject(new Error('Geometry loader is not available.'));
            }
            return resolveGeometry(file, session.scene);
        },
        [session, resolveGeometry]
    );
    const isAssetDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(ASSET_DRAG_MIME);

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
                    <SceneSidebar
                        projectName={props.project?.name}
                        canExitProject={Boolean(props.onExitProject)}
                        sceneDirty={sceneDirty}
                        projectLoading={projectLoading}
                        prefabInfo={prefabInfo}
                        prefabDirty={prefabDirty}
                        entries={sceneEntries}
                        focusedRoot={focusedRoot}
                        visibleRootIds={visibleRootIdSet}
                        soloRootId={soloRootId}
                        selectedNode={liveSelection}
                        onExitProject={requestExitProject}
                        onSave={savePrefabOrScene}
                        onExitPrefab={requestPrefabExit}
                        onSavePrefab={() => setPrefabDialog('overwrite')}
                        onFocus={(entry) => session?.focusEntry(entry)}
                        onToggleVisible={(entry) => session?.toggleVisible(entry)}
                        onToggleSolo={(entry) => session?.toggleSolo(entry)}
                        onSaveAsAsset={setSaveAsTarget}
                        onDelete={(entry) => session?.deleteEntry(entry)}
                        onCreateDefault={() => session?.createDefault()}
                        onSelectNode={(entry, node) => {
                            if (entry && session?.binding?.root !== entry.root) {
                                session?.focusEntry(entry);
                            }
                            setSelectedNode(node);
                        }}
                    />
                    <ViewportPane
                        canvasRef={canvasRef}
                        fpsRef={fpsRef}
                        inset={viewportInset}
                        transport={
                            session && (
                                <TransportBar
                                    binding={binding}
                                    scene={session.scene}
                                    renderer={session.renderer}
                                    playbackRef={playbackRef}
                                    counterRef={counterRef}
                                    stagePlaying={stagePlaying}
                                    setStagePlaying={setStagePlaying}
                                    speed={speed}
                                    setSpeed={setSpeed}
                                    enabled={timelinePlaybackEnabled}
                                />
                            )
                        }
                        dragHover={assetDragHover}
                        assetsLoading={assetsLoading}
                        prefabInfo={prefabInfo}
                        prefabDirty={prefabDirty}
                        backLink={props.backLink}
                        canUndo={Boolean(session?.history.canUndo)}
                        canRedo={Boolean(session?.history.canRedo)}
                        hasFocus={binding !== null}
                        gizmoMode={gizmoMode}
                        showWireframes={showEmitterWireframes}
                        onHistoryStep={(redo) => session?.historyStep(redo)}
                        onGizmoMode={setGizmoMode}
                        onToggleWireframes={() => setShowEmitterWireframes((on) => !on)}
                        onExitPrefab={requestPrefabExit}
                        onSavePrefab={() => setPrefabDialog('overwrite')}
                        dragHandlers={{
                            onDragEnter: (e) => {
                                if (isAssetDrag(e)) assetDragDepthRef.current += 1;
                            },
                            onDragLeave: (e) => {
                                if (!isAssetDrag(e)) return;
                                assetDragDepthRef.current -= 1;
                                if (assetDragDepthRef.current <= 0) {
                                    assetDragDepthRef.current = 0;
                                    session?.hideDropPreview();
                                }
                            },
                            onDragOver: (e) => {
                                if (!isAssetDrag(e)) return;
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'copy';
                                session?.previewDrop(e.clientX, e.clientY);
                            },
                            onDrop: (e) => {
                                if (!isAssetDrag(e)) return;
                                e.preventDefault();
                                assetDragDepthRef.current = 0;
                                session?.placeDrop(e.clientX, e.clientY, e.dataTransfer);
                            },
                        }}
                    />
                    <InspectorSidebar
                        binding={binding}
                        inspector={
                            inspectorBinding && inspectorSystem && inspectorNode
                                ? {binding: inspectorBinding, system: inspectorSystem, node: inspectorNode}
                                : null
                        }
                        title={props.title}
                        onRenamed={(name) => {
                            const entry = sceneEntries.find((item) => item.root === binding?.root);
                            if (entry) {
                                entry.name = name;
                            }
                        }}
                        onSave={props.onSave}
                        toast={showToast}
                        textureOptions={props.textureOptions}
                        geometryOptions={props.geometryOptions}
                        resolveTexture={props.resolveTexture ? resolveTextureForEditor : undefined}
                        resolveGeometry={props.resolveGeometry ? resolveGeometryForEditor : undefined}
                    />
                </div>
                <AssetsDrawer
                    open={drawerOpen}
                    pinned={drawerPinned}
                    onTogglePin={() => {
                        setDrawerPinned((pinned) => !pinned);
                        setDrawerOpen(true);
                    }}
                    onClose={() => {
                        setDrawerPinned(false);
                        setDrawerOpen(false);
                    }}
                    panel={{
                        assets,
                        instanceCounts,
                        loading: assetsLoading,
                        folderInputRef: assetFolderInputRef,
                        onImportFiles: (files) => void runAssetImport(files),
                        onImportFolder: handleImportFolder,
                        onAddToScene: (payload) => session?.addToScene(payload),
                        onOpenPrefab: (asset) => session?.openPrefab(asset.id),
                        onDelete: (payload) => session?.deleteAssets(payload),
                    }}
                />
            </div>
            <TimelineDock
                collapsed={timelineCollapsed}
                onToggleCollapsed={() => setTimelineCollapsed((collapsed) => !collapsed)}
                effectName={binding?.root.name}
                assetCount={assets.length}
                assetsActive={drawerOpen || drawerPinned}
                onToggleAssets={() => {
                    if (drawerPinned) {
                        setDrawerPinned(false);
                        setDrawerOpen(false);
                    } else {
                        setDrawerOpen((open) => !open);
                    }
                }}
            >
                {binding && activeSystem && session ? (
                    <TimelinePanel
                        docked
                        showTransport={false}
                        binding={binding}
                        selectedNode={liveSelection}
                        onSelectNode={setSelectedNode}
                        scene={session.scene}
                        renderer={session.renderer}
                        playbackRef={playbackRef}
                        playheadRef={playheadRef}
                        counterRef={timelineCounterRef}
                        stagePlaying={stagePlaying}
                        setStagePlaying={setStagePlaying}
                        speed={speed}
                        setSpeed={setSpeed}
                        playbackEnabled={timelinePlaybackEnabled}
                    />
                ) : null}
            </TimelineDock>
            <HostDialogs
                session={session}
                loadingProject={projectLoading ? (props.project?.name ?? 'project') : null}
                toast={toast}
                saveAsTarget={saveAsTarget}
                setSaveAsTarget={setSaveAsTarget}
                prefabInfo={prefabInfo}
                prefabDialog={prefabDialog}
                setPrefabDialog={setPrefabDialog}
                prefabSwitch={prefabSwitch}
                setPrefabSwitch={setPrefabSwitch}
                exitPrompt={exitPrompt}
                setExitPrompt={setExitPrompt}
                message={message}
                setMessage={setMessage}
                onExitProject={props.onExitProject}
            />
        </div>
    );
}

/** NME-style imperative entry point for hosts like BabylonJS Editor windows. */
export const QuarksEffectEditor = {
    /**
     * Mounts an {@link EffectEditorHost} into `hostElement`.
     *
     * @returns A handle whose `dispose()` unmounts the editor and frees its engine.
     */
    Show(options: EffectEditorHostProps & {hostElement: HTMLElement}): {
        /** Unmounts the editor. */
        dispose: () => void;
    } {
        const {hostElement, ...props} = options;
        const root = createRoot(hostElement);
        root.render(<EffectEditorHost {...props} />);
        return {dispose: () => root.unmount()};
    },
};
