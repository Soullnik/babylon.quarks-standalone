import React, {useEffect, useReducer, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {
    ArrowLeftIcon,
    ArrowPathIcon,
    ArrowUturnLeftIcon,
    ArrowUturnRightIcon,
    ArrowsPointingOutIcon,
    CubeTransparentIcon,
    CursorArrowRaysIcon,
    Square2StackIcon,
} from '@heroicons/react/24/solid';
import {Engine} from '@babylonjs/core/Engines/engine';
import {Scene} from '@babylonjs/core/scene';
import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera';
import {DirectionalLight} from '@babylonjs/core/Lights/directionalLight';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {GizmoManager} from '@babylonjs/core/Gizmos/gizmoManager';
import {UtilityLayerRenderer} from '@babylonjs/core/Rendering/utilityLayerRenderer';
import {GridMaterial} from '@babylonjs/materials/grid/gridMaterial';
import {
    BatchedRenderer,
    ParticleSystem,
} from 'babylon.quarks';
import {EffectBinding} from '../core/binding';
import {EffectHistory} from '../core/history';
import {ensureGroundResolver} from '../core/collision';
import {createGalleryDefaultEntry} from '../core/defaultEffect';
import {loadEffectFromJson, disposeLoadedEffect, parseEffectFromJson} from '../core/loadEffect';
import {applyGalleryPlayback, countGalleryParticles} from '../core/galleryPlayback';
import {cancelGalleryCameraFocus, focusGalleryEntry} from '../core/galleryLayout';
import {GalleryDropMarker} from '../core/galleryDropMarker';
import {GallerySelectionMarker} from '../core/gallerySelectionMarker';
import {EmitterShapeWireframes} from '../core/emitterShapeWireframe';
import {getGalleryDragSession, setGalleryDragSession} from '../core/galleryDragSession';
import {pickGroundPosition, placeGalleryEntriesAt, placeGalleryEntryInScene} from '../core/galleryScene';
import {describeGalleryDrag, GALLERY_DRAG_MIME, readGalleryDrag} from '../core/galleryTree';
import {loadEffectGallery, collectJsonFiles, bindingFromGalleryEntry, mergeGalleryEntries, type GalleryEntry, type GalleryLoadProgress} from '../core/loadEffectGallery';
import {pickGalleryJsonFiles} from '../core/pickGalleryFiles';
import {EffectEditor} from './EffectEditor';
import {PromptDialog} from './PromptDialog';
import {MessageDialog} from './MessageDialog';
import {GalleryPanel} from './GalleryPanel';
import {TimelinePanel} from './TimelinePanel';
import type {PlaybackState} from './TimelinePanel';
import type {GeometryData, GeometryOption, TextureOption} from './modules';
import {buttonStyle, globalEditorStyles, theme} from './theme';
import {iconStyle, type HeroIcon} from './icons';
import type {Mesh} from '@babylonjs/core/Meshes/mesh';

export interface EffectEditorHostHandle {
    binding: EffectBinding;
    history: EffectHistory;
    scene: Scene;
    renderer: BatchedRenderer;
    importJson: (json: unknown) => void;
    /** Loads many JSON effects at once and appends them to the gallery catalog. */
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
}

/** Disposes an effect's systems and its remaining group tree (otherwise the groups leak). */
function disposeEffect(
    root: TransformNode,
    systems: ParticleSystem[],
    renderer: BatchedRenderer,
    inRenderer = true
): void {
    disposeLoadedEffect(root, systems, renderer, inRenderer);
}

type GizmoMode = 'none' | 'position' | 'rotation' | 'scale';

const GALLERY_PANEL_WIDTH = 280;

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

/**
 * Self-contained effect editor: live Babylon preview + hierarchy/inspector sidebar.
 * Designed for embedding — see QuarksEffectEditor.Show for the NME-style entry point.
 */
export function EffectEditorHost(props: EffectEditorHostProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const counterRef = useRef<HTMLSpanElement>(null);
    const fpsRef = useRef<HTMLSpanElement>(null);
    const playheadRef = useRef<HTMLDivElement>(null);
    const galleryFolderInputRef = useRef<HTMLInputElement>(null);
    const importJsonRef = useRef<(json: unknown) => void>(() => {});
    const importGalleryRef = useRef<(files: FileList | File[]) => Promise<void>>(async () => {});
    const selectGalleryEntryRef = useRef<(entry: GalleryEntry) => void>(() => {});
    const placeGalleryDropRef = useRef<(clientX: number, clientY: number, dataTransfer?: DataTransfer) => void>(() => {});
    const createGalleryDefaultRef = useRef<() => void>(() => {});
    const dropMarkerRef = useRef<GalleryDropMarker | null>(null);
    const selectionMarkerRef = useRef<GallerySelectionMarker | null>(null);
    const emitterWireframesRef = useRef<EmitterShapeWireframes | null>(null);
    const galleryDragDepthRef = useRef(0);
    const stateRef = useRef<{
        engine: Engine;
        scene: Scene;
        camera: ArcRotateCamera;
        ground: Mesh;
        renderer: BatchedRenderer;
        binding: EffectBinding | null;
        history: EffectHistory;
        stageRoot: TransformNode;
        galleryRoot: TransformNode | null;
        galleryEntries: GalleryEntry[];
    } | null>(null);
    const gizmoManagerRef = useRef<GizmoManager | null>(null);
    const [binding, setBinding] = useState<EffectBinding | null>(null);
    const [, force] = useReducer((x: number) => x + 1, 0);
    const playbackRef = useRef<PlaybackState>({paused: false, speed: 1, stepQueued: false, elapsed: 0, scrubbing: false});
    const [paused, setPaused] = useState(false);
    const [speed, setSpeed] = useState(1);
    const [renamingRoot, setRenamingRoot] = useState(false);
    const [gizmoMode, setGizmoMode] = useState<GizmoMode>('none');
    const [selectedNode, setSelectedNode] = useState<TransformNode | null>(null);
    const [gallery, setGallery] = useState<GalleryEntry[]>([]);
    const [galleryLoading, setGalleryLoading] = useState<GalleryLoadProgress | null>(null);
    const [selectedGalleryRoot, setSelectedGalleryRoot] = useState<TransformNode | null>(null);
    const [messageDialog, setMessageDialog] = useState<{title: string; message: string} | null>(null);
    const [galleryDragHover, setGalleryDragHover] = useState<{label: string; count: number} | null>(null);
    const [showEmitterWireframes, setShowEmitterWireframes] = useState(false);

    const isGalleryLoading = galleryLoading !== null;

    const showMessage = (title: string, message: string) => setMessageDialog({title, message});

    /** Appends JSON effects to the catalog without replacing the open effect. */
    const runGalleryImport = async (files: FileList | File[]) => {
        const jsonFiles = collectJsonFiles(files);
        if (jsonFiles.length === 0) {
            showMessage(
                'Import to gallery',
                files.length === 0
                    ? 'Import was cancelled or the browser returned no files.\n\nTry Chrome or Edge and pick .json files or a folder that contains them.'
                    : `No .json files found among ${files.length} file(s) in the selection.`
            );
            return;
        }

        try {
            await importGalleryRef.current(jsonFiles);
            stateRef.current?.history.clear();
            force();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            showMessage('Import to gallery', message);
            console.error('Failed to import effects into gallery:', err);
            force();
        }
    };

    const handleImportFolder = () => {
        if (typeof (window as Window & {showDirectoryPicker?: unknown}).showDirectoryPicker !== 'function') {
            galleryFolderInputRef.current?.click();
            return;
        }

        void (async () => {
            try {
                const picked = await pickGalleryJsonFiles();
                if (picked === null || picked === undefined) {
                    return;
                }
                await runGalleryImport(picked);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                showMessage('Import to gallery', message);
                console.error('Failed to open folder picker:', err);
            }
        })();
    };

    useEffect(() => {
        // Register the shared ground-plane collider before any effect (default or imported)
        // is built, so ApplyCollision behaviors deserialized by QuarksLoader resolve against it.
        ensureGroundResolver();
        const engine = new Engine(canvasRef.current!, true);
        const scene = new Scene(engine);
        scene.clearColor = new Color4(0.03, 0.04, 0.09, 1);
        const camera = new ArcRotateCamera('cam', -Math.PI / 2, 1.15, 9, new BVector3(0, 1.4, 0), scene);
        camera.attachControl(canvasRef.current!, true);
        camera.wheelDeltaPercentage = 0.01;

        // Mesh render mode particles are lit (billboard modes ignore these), and the grid gives
        // a visual floor at the same y=0 plane the Collision module's ground resolver uses.
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

        const stageRoot = new TransformNode('StageRoot', scene);
        const gizmoUtilityLayer = new UtilityLayerRenderer(scene);
        const gizmoManager = new GizmoManager(scene, undefined, gizmoUtilityLayer);
        gizmoManager.usePointerToAttachGizmos = false;
        gizmoManager.attachToNode(stageRoot);
        gizmoManagerRef.current = gizmoManager;

        const renderer = new BatchedRenderer('quarks-editor', scene);
        const history = new EffectHistory();
        const galleryRoot = new TransformNode('GalleryCatalog', scene);
        galleryRoot.setEnabled(false);
        let galleryEntries: GalleryEntry[] = [];

        const dropMarker = new GalleryDropMarker(scene);
        dropMarkerRef.current = dropMarker;
        const selectionMarker = new GallerySelectionMarker(scene);
        selectionMarkerRef.current = selectionMarker;
        const emitterWireframes = new EmitterShapeWireframes(scene);
        emitterWireframesRef.current = emitterWireframes;

        const clearGalleryDragPreview = () => {
            galleryDragDepthRef.current = 0;
            dropMarker.hide();
            setGalleryDragHover(null);
            setGalleryDragSession(null);
        };

        const onWindowDragEnd = () => clearGalleryDragPreview();
        window.addEventListener('dragend', onWindowDragEnd);

        const syncStateRef = (bindingValue: EffectBinding | null) => {
            stateRef.current = {
                engine,
                scene,
                camera,
                ground,
                renderer,
                binding: bindingValue,
                history,
                stageRoot,
                galleryRoot,
                galleryEntries,
            };
        };

        const selectGalleryEntry = (entry: GalleryEntry) => {
            const next = bindingFromGalleryEntry(entry);
            history.clear();
            history.attach(next);
            next.subscribe(force);
            syncStateRef(next);
            setBinding(next);
            setSelectedNode(next.system.emitter);
            setSelectedGalleryRoot(entry.root);
            playbackRef.current.elapsed = 0;
            if (!entry.inScene) {
                // Catalog-only: inspect/export ok, but don't drive transport — nothing is on stage.
                playbackRef.current.paused = true;
                setPaused(true);
                applyGalleryPlayback(galleryEntries, entry.root, false);
                selectionMarker.hide();
                return;
            }
            applyGalleryPlayback(galleryEntries, entry.root, !playbackRef.current.paused);
            selectionMarker.show(entry.root);
            focusGalleryEntry(camera, entry.root);
        };

        const placeGalleryDropAt = (clientX: number, clientY: number, dataTransfer?: DataTransfer) => {
            const payload = (dataTransfer && readGalleryDrag(dataTransfer)) ?? getGalleryDragSession();
            if (!payload) {
                return;
            }

            const {entries: toPlace} = describeGalleryDrag(galleryEntries, payload);
            if (toPlace.length === 0) {
                return;
            }

            const position = pickGroundPosition(scene, clientX, clientY);
            if (toPlace.length === 1) {
                placeGalleryEntryInScene(toPlace[0], stageRoot, renderer, position);
            } else {
                placeGalleryEntriesAt(toPlace, stageRoot, renderer, position);
            }

            galleryEntries = [...galleryEntries];
            if (stateRef.current) {
                stateRef.current.galleryEntries = galleryEntries;
            }
            setGallery(galleryEntries);
            selectGalleryEntry(toPlace[0]);
            dropMarkerRef.current?.hide();
            setGalleryDragHover(null);
            setGalleryDragSession(null);
            force();
        };

        const mount = (nextBinding: EffectBinding) => {
            nextBinding.root.parent = stageRoot;
            history.attach(nextBinding);
            nextBinding.subscribe(force);
            syncStateRef(nextBinding);
            setBinding(nextBinding);
            setSelectedNode(nextBinding.system.emitter);
            props.onReady?.(makeHandle());
        };

        const appendGalleryFromFiles = async (files: FileList | File[]) => {
            setGalleryLoading({done: 0, total: 0, loaded: 0, failed: 0});

            const incoming = await loadEffectGallery(scene, files, galleryRoot, (progress) => setGalleryLoading(progress));
            const {merged, added} = mergeGalleryEntries(galleryEntries, incoming, renderer);

            galleryEntries = merged;
            if (stateRef.current) {
                stateRef.current.galleryRoot = galleryRoot;
                stateRef.current.galleryEntries = merged;
            }

            setGalleryLoading(null);
            setGallery(merged);

            if (incoming.length === 0) {
                throw new Error('No particle effects found in the selected file(s).');
            }
            if (added.length === 0) {
                throw new Error('All selected effects are already in the catalog.');
            }

            selectGalleryEntry(added[0]);
            props.onReady?.(makeHandle());
        };

        const appendGalleryDefault = () => {
            const entry = createGalleryDefaultEntry(scene, galleryRoot, galleryEntries, {
                resolveTexture: props.resolveTexture,
                textureUrl: props.textureOptions?.[0]?.url,
            });
            galleryEntries = [...galleryEntries, entry];
            if (stateRef.current) {
                stateRef.current.galleryRoot = galleryRoot;
                stateRef.current.galleryEntries = galleryEntries;
            }
            setGallery(galleryEntries);
            selectGalleryEntry(entry);
            props.onReady?.(makeHandle());
        };

        const makeHandle = (): EffectEditorHostHandle => ({
            get binding() {
                const b = stateRef.current?.binding;
                if (!b) {
                    throw new Error('Gallery mode — import a single JSON to edit one effect.');
                }
                return b;
            },
            history,
            scene,
            renderer,
            importJson,
            importGallery: appendGalleryFromFiles,
            exportJson: () => makeHandle().binding.exportJSON('EditorEffect'),
        });

        const importJson = (json: unknown) => {
            const current = stateRef.current?.binding;
            const {root, systems} = loadEffectFromJson(scene, renderer, json);
            if (systems.length === 0) {
                disposeEffect(root, systems, renderer);
                throw new Error('No particle systems found in the JSON.');
            }
            if (current) {
                const catalogEntry = stateRef.current?.galleryEntries.find((entry) => entry.root === current.root);
                disposeEffect(current.root, [current.system, ...current.subSystems], renderer, catalogEntry?.inScene ?? true);
            }
            const main = systems.find((s) => !s.onlyUsedByOther) ?? systems[0];
            const next = new EffectBinding(main, systems.filter((s) => s !== main), root);
            setSelectedGalleryRoot(null);
            selectionMarker.hide();
            mount(next);
        };

        importJsonRef.current = importJson;
        importGalleryRef.current = appendGalleryFromFiles;
        selectGalleryEntryRef.current = selectGalleryEntry;
        placeGalleryDropRef.current = placeGalleryDropAt;
        createGalleryDefaultRef.current = appendGalleryDefault;

        const galleryDefaults = {
            resolveTexture: props.resolveTexture,
            textureUrl: props.textureOptions?.[0]?.url,
        };

        let initialEntry: GalleryEntry;
        if (props.effectJson) {
            const {root, systems} = loadEffectFromJson(scene, renderer, props.effectJson);
            root.parent = stageRoot;
            const name = root.name || 'Effect';
            initialEntry = {name, path: `_opened/${name}.json`, root, systems, inScene: true};
        } else {
            initialEntry = createGalleryDefaultEntry(scene, galleryRoot, [], galleryDefaults);
            placeGalleryEntryInScene(initialEntry, stageRoot, renderer, BVector3.Zero());
        }

        galleryEntries = [initialEntry];
        if (stateRef.current) {
            stateRef.current.galleryRoot = galleryRoot;
            stateRef.current.galleryEntries = galleryEntries;
        }
        setGallery(galleryEntries);
        selectGalleryEntry(initialEntry);
        props.onReady?.(makeHandle());

        engine.runRenderLoop(() => {
            const playback = playbackRef.current;
            const snapshot = stateRef.current;
            if (!playback.scrubbing) {
                let delta = (engine.getDeltaTime() / 1000) * playback.speed;
                const stepQueued = playback.stepQueued;
                if (playback.paused) {
                    delta = stepQueued ? 1 / 60 : 0;
                    playback.stepQueued = false;
                }
                if (delta > 0 && snapshot) {
                    const selectedEntry = snapshot.galleryEntries.find((entry) => entry.root === snapshot.binding?.root);
                    const simulate = selectedEntry
                        ? selectedEntry.inScene && (!playback.paused || stepQueued)
                        : !playback.paused || stepQueued;
                    if (simulate) {
                        renderer.update(delta);
                        playback.elapsed += delta;
                    }
                }
            }
            scene.render();
            selectionMarker.follow();
            const wireframes = emitterWireframesRef.current;
            if (wireframes && snapshot?.binding) {
                const b = snapshot.binding;
                wireframes.sync([b.system, ...b.subSystems], `${b.root.uniqueId}:${b.getRevision()}`);
            }
            if (!snapshot) return;

            if (fpsRef.current) {
                fpsRef.current.textContent = `${Math.round(engine.getFps())} FPS`;
            }

            const selectedEntry = snapshot.galleryEntries.find((entry) => entry.root === snapshot.binding?.root);
            if (selectedEntry) {
                const count = countGalleryParticles(snapshot.galleryEntries, snapshot.binding?.root ?? null);
                const inScene = snapshot.galleryEntries.filter((entry) => entry.inScene).length;
                if (counterRef.current) {
                    counterRef.current.textContent = `${inScene}/${snapshot.galleryEntries.length} in catalog · ${count} particles · ${playback.elapsed.toFixed(2)}s`;
                }
            } else if (snapshot.binding) {
                const b = snapshot.binding;
                const count = b.system.particleNum + b.subSystems.reduce((sum, sub) => sum + sub.particleNum, 0);
                if (counterRef.current) {
                    counterRef.current.textContent = `${count} particles · ${playback.elapsed.toFixed(2)}s`;
                }
            }
        });

        const resizeObserver = new ResizeObserver(() => engine.resize());
        resizeObserver.observe(canvasRef.current!);
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                const json = e.shiftKey ? history.redo() : history.undo();
                if (json) {
                    importJson(json);
                }
                force();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('dragend', onWindowDragEnd);
            clearGalleryDragPreview();
            cancelGalleryCameraFocus();
            dropMarker.dispose();
            dropMarkerRef.current = null;
            selectionMarker.dispose();
            selectionMarkerRef.current = null;
            emitterWireframes.dispose();
            emitterWireframesRef.current = null;
            gizmoManager.dispose();
            gizmoUtilityLayer.dispose();
            engine.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const snap = stateRef.current;
        if (!snap || !selectedGalleryRoot) {
            return;
        }
        const isCatalogEntry = snap.galleryEntries.some((entry) => entry.root === selectedGalleryRoot);
        if (!isCatalogEntry) {
            return;
        }
        applyGalleryPlayback(snap.galleryEntries, selectedGalleryRoot, !paused);
    }, [paused, selectedGalleryRoot, gallery]);

    useEffect(() => {
        emitterWireframesRef.current?.setVisible(showEmitterWireframes);
    }, [showEmitterWireframes]);

    useEffect(() => {
        const gm = gizmoManagerRef.current;
        if (!gm) return;
        gm.positionGizmoEnabled = gizmoMode === 'position';
        gm.rotationGizmoEnabled = gizmoMode === 'rotation';
        gm.scaleGizmoEnabled = gizmoMode === 'scale';
        const activeGizmo = gizmoMode === 'position' ? gm.gizmos.positionGizmo : gizmoMode === 'rotation' ? gm.gizmos.rotationGizmo : gizmoMode === 'scale' ? gm.gizmos.scaleGizmo : null;
        const observer = activeGizmo?.onDragObservable.add(() => force());
        return () => {
            if (activeGizmo && observer) activeGizmo.onDragObservable.remove(observer);
        };
    }, [gizmoMode]);

    useEffect(() => {
        const gm = gizmoManagerRef.current;
        const stageRoot = stateRef.current?.stageRoot;
        if (!gm || !stageRoot) return;
        if (selectedNode && selectedNode.isDisposed()) {
            setSelectedNode(stateRef.current?.binding?.system.emitter ?? null);
            return;
        }
        if (isGalleryLoading) {
            gm.attachToNode(stageRoot);
            return;
        }
        gm.attachToNode(selectedNode ?? stageRoot);
    }, [selectedNode, binding, isGalleryLoading]);

    const state = stateRef.current;
    const gizmoNode = selectedNode && !selectedNode.isDisposed() ? selectedNode : state?.stageRoot;
    const historyAction = (json: unknown | null) => {
        if (json && state?.binding) {
            const current = state.binding;
            const inGallery = state.galleryEntries.length > 0;
            const entryIndex = inGallery ? state.galleryEntries.findIndex((e) => e.root === current.root) : -1;
            const prev = entryIndex >= 0 ? state.galleryEntries[entryIndex] : null;
            const wasInScene = prev?.inScene ?? true;
            const savedPosition = wasInScene ? current.root.position.clone() : null;

            if (inGallery && entryIndex >= 0 && prev) {
                disposeEffect(current.root, [current.system, ...current.subSystems], state.renderer, wasInScene);
                const {root, systems} = parseEffectFromJson(state.scene, wasInScene ? state.renderer : null, json, {
                    registerRenderer: wasInScene,
                    autoplay: false,
                });
                if (systems.length === 0) {
                    disposeLoadedEffect(root, systems, state.renderer, wasInScene);
                    return;
                }
                if (wasInScene && savedPosition) {
                    root.position.copyFrom(savedPosition);
                    root.parent = state.stageRoot;
                    root.setEnabled(true);
                } else {
                    root.parent = state.galleryRoot;
                    root.setEnabled(false);
                }
                if (!root.name || root.name === 'Effect' || root.name === 'Object3D') {
                    root.name = prev.name;
                }
                const main = systems.find((s) => !s.onlyUsedByOther) ?? systems[0];
                const next = new EffectBinding(main, systems.filter((s) => s !== main), root);
                const updated = [...state.galleryEntries];
                updated[entryIndex] = {name: prev.name, path: prev.path, root, systems, inScene: wasInScene};
                state.galleryEntries = updated;
                setGallery(updated);
                state.history.attach(next);
                next.subscribe(force);
                state.binding = next;
                setBinding(next);
                setSelectedNode(next.system.emitter);
                setSelectedGalleryRoot(root);
                applyGalleryPlayback(updated, root, !playbackRef.current.paused);
                if (wasInScene) {
                    selectionMarkerRef.current?.show(root);
                } else {
                    selectionMarkerRef.current?.hide();
                }
            } else {
                const {root, systems} = loadEffectFromJson(state.scene, state.renderer, json);
                if (systems.length === 0) {
                    disposeEffect(root, systems, state.renderer);
                    return;
                }
                disposeEffect(current.root, [current.system, ...current.subSystems], state.renderer);
                const main = systems.find((s) => !s.onlyUsedByOther) ?? systems[0];
                const next = new EffectBinding(main, systems.filter((s) => s !== main), root);
                next.root.parent = state.stageRoot;
                state.history.attach(next);
                next.subscribe(force);
                state.binding = next;
                setBinding(next);
                setSelectedNode(next.system.emitter);
                setSelectedGalleryRoot(null);
                selectionMarkerRef.current?.hide();
                state.ground.scaling.x = 1;
                state.ground.scaling.z = 1;
                state.camera.radius = 9;
                state.camera.setTarget(new BVector3(0, 1.4, 0));
            }
        }
        force();
    };

    const allSystems = binding ? [binding.system, ...binding.subSystems] : [];
    const activeSystem = binding ? (allSystems.find((s) => s.emitter === selectedNode) ?? binding.system) : null;
    const gizmoTargetLabel = selectedNode ? gizmoNode?.name || 'Node' : 'Stage (preview parent)';
    const selectedGalleryEntry = selectedGalleryRoot
        ? gallery.find((entry) => entry.root === selectedGalleryRoot) ?? null
        : null;
    /** Timeline is always shown when an effect is selected; playback only when it is on stage. */
    const showTimeline = Boolean(binding && activeSystem && state);
    const timelinePlaybackEnabled = !selectedGalleryEntry || selectedGalleryEntry.inScene;

    return (
        <div className="qe-root" style={{display: 'flex', flexDirection: 'column', width: '100%', height: '100%', fontFamily: theme.font, color: theme.text, background: '#070b16'}}>
            <style>{globalEditorStyles}</style>
            <div style={{display: 'flex', flex: 1, minHeight: 0}}>
                <aside
                    style={{
                        width: GALLERY_PANEL_WIDTH,
                        flexShrink: 0,
                        borderRight: `1px solid ${theme.border}`,
                        background: theme.panelBg,
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 0,
                    }}
                >
                    <div style={{padding: '12px 14px 10px', borderBottom: `1px solid ${theme.border}`}}>
                        <div style={{fontSize: 14, fontWeight: 600}}>
                            Gallery{gallery.length > 0 ? ` · ${gallery.length}` : ''}
                        </div>
                        <div style={{fontSize: 11, color: theme.textDim, marginTop: 4, lineHeight: 1.4}}>
                            Drag into the viewport to place effects.
                        </div>
                    </div>
                    <div style={{flex: 1, minHeight: 0, overflow: 'hidden', padding: '8px 12px 14px', display: 'flex', flexDirection: 'column'}}>
                        <GalleryPanel
                            entries={gallery}
                            selectedRoot={selectedGalleryRoot}
                            loading={galleryLoading}
                            folderInputRef={galleryFolderInputRef}
                            onSelect={(entry) => selectGalleryEntryRef.current(entry)}
                            onImportFiles={(files) => void runGalleryImport(files)}
                            onImportFolder={() => void handleImportFolder()}
                            onCreateDefault={() => createGalleryDefaultRef.current()}
                        />
                    </div>
                </aside>
                <div
                    style={{position: 'relative', flex: 1, minWidth: 0}}
                    onDragEnter={(e) => {
                        if (!e.dataTransfer.types.includes(GALLERY_DRAG_MIME)) return;
                        galleryDragDepthRef.current += 1;
                    }}
                    onDragLeave={(e) => {
                        if (!e.dataTransfer.types.includes(GALLERY_DRAG_MIME)) return;
                        galleryDragDepthRef.current -= 1;
                        if (galleryDragDepthRef.current <= 0) {
                            galleryDragDepthRef.current = 0;
                            dropMarkerRef.current?.hide();
                            setGalleryDragHover(null);
                        }
                    }}
                    onDragOver={(e) => {
                        if (!e.dataTransfer.types.includes(GALLERY_DRAG_MIME)) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';

                        const payload = getGalleryDragSession();
                        const snap = stateRef.current;
                        if (!payload || !snap) return;

                        const described = describeGalleryDrag(snap.galleryEntries, payload);
                        if (described.entries.length === 0) return;

                        const position = pickGroundPosition(snap.scene, e.clientX, e.clientY);
                        dropMarkerRef.current?.show(position, described.entries.length);
                        setGalleryDragHover({label: described.label, count: described.entries.length});
                    }}
                    onDrop={(e) => {
                        if (!e.dataTransfer.types.includes(GALLERY_DRAG_MIME)) return;
                        e.preventDefault();
                        galleryDragDepthRef.current = 0;
                        placeGalleryDropRef.current(e.clientX, e.clientY, e.dataTransfer);
                    }}
                >
                    <canvas ref={canvasRef} style={{width: '100%', height: '100%', display: 'block', touchAction: 'none', outline: 'none'}} />
                    <div
                        style={{
                            position: 'absolute',
                            bottom: 12,
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
                    {galleryDragHover && (
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
                                    bottom: 18,
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
                                Drop {galleryDragHover.count === 1 ? 'effect' : `${galleryDragHover.count} effects`} — {galleryDragHover.label}
                            </div>
                        </div>
                    )}
                    {galleryLoading && (
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
                            <div style={{background: theme.panelBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: '16px 22px', textAlign: 'center'}}>
                                <div style={{fontWeight: 600, marginBottom: 6}}>Loading gallery…</div>
                                <div style={{fontSize: 13, color: theme.textDim}}>
                                    {galleryLoading.done} / {galleryLoading.total || '…'} files
                                    {galleryLoading.failed > 0 ? ` · ${galleryLoading.failed} skipped` : ''}
                                </div>
                            </div>
                        </div>
                    )}
                    {props.backLink && (
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
                    <div style={{position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6}}>
                        <div style={{display: 'flex', gap: 4, background: theme.panelBg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 4}}>
                            <button className="qe-hover" style={squareButtonStyle} title="Undo (Ctrl+Z)" disabled={!state?.history.canUndo || !binding} onClick={() => historyAction(state!.history.undo())}>
                                <ArrowUturnLeftIcon style={iconStyle(14)} />
                            </button>
                            <button className="qe-hover" style={squareButtonStyle} title="Redo (Ctrl+Shift+Z)" disabled={!state?.history.canRedo || !binding} onClick={() => historyAction(state!.history.redo())}>
                                <ArrowUturnRightIcon style={iconStyle(14)} />
                            </button>
                        </div>
                        <div style={{display: 'flex', flexDirection: 'column', gap: 4, background: theme.panelBg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 4}}>
                            {GIZMO_MODE_BUTTONS.map((m) => (
                                <button
                                    key={m.value}
                                    className="qe-hover"
                                    style={{...squareButtonStyle, ...(gizmoMode === m.value ? activeSquareButtonStyle : {})}}
                                    title={m.title}
                                    onClick={() => setGizmoMode(m.value)}
                                >
                                    <m.Icon style={iconStyle(14)} />
                                </button>
                            ))}
                        </div>
                        <div style={{display: 'flex', flexDirection: 'column', gap: 4, background: theme.panelBg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 4}}>
                            <button
                                className="qe-hover"
                                style={{...squareButtonStyle, ...(showEmitterWireframes ? activeSquareButtonStyle : {})}}
                                title="Show emitter shape wireframes"
                                disabled={!binding}
                                onClick={() => setShowEmitterWireframes((on) => !on)}
                            >
                                <CubeTransparentIcon style={iconStyle(14)} />
                            </button>
                        </div>
                    </div>
                </div>
                <aside style={{width: 340, flexShrink: 0, borderLeft: `1px solid ${theme.border}`, background: theme.panelBg, display: 'flex', flexDirection: 'column', minHeight: 0}}>
                    <div style={{padding: '12px 14px 10px', borderBottom: `1px solid ${theme.border}`}}>
                        <div style={{fontSize: 11, fontWeight: 600, color: theme.textDim, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6}}>
                            Inspector
                        </div>
                        <div
                            className="qe-hover-bg"
                            title={binding ? 'Rename effect' : undefined}
                            style={{fontSize: 16, fontWeight: 600, cursor: binding ? 'pointer' : 'default', borderRadius: 6, padding: '2px 4px', margin: '-2px -4px'}}
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
                                    const blob = new Blob([binding.exportJSON('EditorEffect')], {type: 'application/json'});
                                    const link = document.createElement('a');
                                    link.href = URL.createObjectURL(blob);
                                    link.download = 'effect.json';
                                    link.click();
                                    URL.revokeObjectURL(link.href);
                                }}
                            >
                                Export
                            </button>
                            {props.onSave && (
                                <button className="qe-hover" style={buttonStyle} disabled={!binding} onClick={() => binding && props.onSave!(binding.exportJSON('EditorEffect'))}>
                                    Save
                                </button>
                            )}
                        </div>
                    </div>
                    <div style={{flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 14px 20px'}}>
                        {binding && activeSystem && gizmoNode ? (
                            <EffectEditor
                                binding={binding}
                                selectedSystem={activeSystem}
                                gizmoTargetNode={gizmoNode}
                                gizmoTargetLabel={gizmoTargetLabel}
                                textureOptions={props.textureOptions}
                                geometryOptions={props.geometryOptions}
                                resolveTexture={props.resolveTexture && state ? (url) => props.resolveTexture!(url, state.scene) : undefined}
                                resolveGeometry={props.resolveGeometry && state ? (file) => props.resolveGeometry!(file, state.scene) : undefined}
                            />
                        ) : (
                            <div style={{fontSize: 13, color: theme.textDim, lineHeight: 1.5}}>No effect selected.</div>
                        )}
                    </div>
                </aside>
            </div>
            {showTimeline && binding && activeSystem && state && (
                <TimelinePanel
                    binding={binding}
                    selectedNode={selectedNode}
                    onSelectNode={setSelectedNode}
                    scene={state.scene}
                    renderer={state.renderer}
                    playbackRef={playbackRef}
                    playheadRef={playheadRef}
                    counterRef={counterRef}
                    paused={paused}
                    setPaused={setPaused}
                    speed={speed}
                    setSpeed={setSpeed}
                    playbackEnabled={timelinePlaybackEnabled}
                />
            )}
            {messageDialog && (
                <MessageDialog title={messageDialog.title} message={messageDialog.message} onClose={() => setMessageDialog(null)} />
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
