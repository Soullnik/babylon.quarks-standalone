import {Viewport} from '@babylonjs/core/Maths/math.viewport.js';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {useEffect, useRef, useState} from 'react';
import type {EditorSession} from '../../core/editorSession.js';
import {notifyTransformChanged} from '../../core/transformStore.js';
import {DRAWER_HEIGHT} from './hostStyles.js';
import type {GizmoMode} from './ViewportPane.js';

/** True for a field that takes typed text, where editor shortcuts stay out of the way. */
export function isTextInput(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

/**
 * Inspector value controls (numbers, checkboxes, selects): Ctrl+Z there means the effect's undo,
 * not the browser's per-field text undo. Free-text inputs (names, filters) keep the native one.
 */
export function isInspectorValueControl(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    if (el.tagName === 'SELECT') return true;
    return el.tagName === 'INPUT' && ['number', 'checkbox', 'range', 'color'].includes((el as HTMLInputElement).type);
}

/** What the editor's keyboard shortcuts do. */
export interface HostShortcuts {
    /** Ctrl+S: save the scene, or ask about the open prefab. */
    save(): void;
    /** Ctrl+Space: open or close the Assets drawer. */
    toggleAssets(): void;
    /** Space: play or pause the stage. */
    togglePlayback(): void;
    /** Escape: close the floating Assets drawer. */
    closeDrawer(): void;
    /** Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z. */
    historyStep(redo: boolean): void;
    /** Delete: remove the focused effect; returns whether it did. */
    deleteFocused(): boolean;
}

/** Handles a keydown on the editor's window; exported for tests. */
export function handleHostShortcut(e: KeyboardEvent, shortcuts: HostShortcuts): void {
    const key = e.key.toLowerCase();
    const command = e.ctrlKey || e.metaKey;
    if (command && key === 's') {
        e.preventDefault();
        shortcuts.save();
        return;
    }
    if (e.code === 'Space' && command) {
        e.preventDefault();
        shortcuts.toggleAssets();
        return;
    }
    const target = e.target as HTMLElement | null;
    if (e.code === 'Space' && !isTextInput(target) && target?.tagName !== 'BUTTON') {
        e.preventDefault();
        shortcuts.togglePlayback();
        return;
    }
    if (e.key === 'Escape') {
        shortcuts.closeDrawer();
    }
    if (command && (key === 'z' || key === 'y')) {
        if (isTextInput(e.target) && !isInspectorValueControl(e.target)) {
            return;
        }
        e.preventDefault();
        // Leave the field first so it shows the restored value instead of its draft text.
        (e.target as HTMLElement | null)?.blur?.();
        shortcuts.historyStep(key === 'y' || e.shiftKey);
        return;
    }
    if (e.key === 'Delete' && !isTextInput(e.target) && shortcuts.deleteFocused()) {
        e.preventDefault();
    }
}

/** Installs the editor's keyboard shortcuts on the window; the latest `shortcuts` are always used. */
export function useHostShortcuts(shortcuts: HostShortcuts): void {
    const ref = useRef(shortcuts);
    ref.current = shortcuts;
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => handleHostShortcut(e, ref.current);
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
}

/**
 * Puts the stage gizmo in `mode` and attaches it to `target`, leaving it where it is while
 * `paused`. One gizmo drag is one undo step: the binding snapshots at drag start, and the UI
 * refreshes at most once a frame while dragging.
 */
export function useStageGizmo(
    session: EditorSession | null,
    mode: GizmoMode,
    target: TransformNode | null,
    paused: boolean
): void {
    useEffect(() => {
        const gm = session?.gizmoManager;
        if (!gm) return;
        gm.positionGizmoEnabled = mode === 'position';
        gm.rotationGizmoEnabled = mode === 'rotation';
        gm.scaleGizmoEnabled = mode === 'scale';
        const activeGizmo =
            mode === 'position'
                ? gm.gizmos.positionGizmo
                : mode === 'rotation'
                  ? gm.gizmos.rotationGizmo
                  : mode === 'scale'
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
        const dragStartObserver = activeGizmo?.onDragStartObservable.add(() => session.binding?.onBeforeChange?.());
        const dragObserver = activeGizmo?.onDragObservable.add(scheduleTransformRefresh);
        const dragEndObserver = activeGizmo?.onDragEndObservable.add(() => {
            notifyTransformChanged();
            session.binding?.markChanged();
        });
        return () => {
            if (dragRaf !== 0) {
                cancelAnimationFrame(dragRaf);
            }
            if (activeGizmo) {
                activeGizmo.onDragStartObservable.remove(dragStartObserver ?? null);
                activeGizmo.onDragObservable.remove(dragObserver ?? null);
                activeGizmo.onDragEndObservable.remove(dragEndObserver ?? null);
            }
        };
    }, [session, mode]);

    useEffect(() => {
        if (!paused) {
            session?.gizmoManager.attachToNode(target);
        }
    }, [session, target, paused]);
}

/**
 * The floating drawer is opaque, so the scene renders only in the part of the viewport above it:
 * the view, and every "frame this effect" camera move, re-centres on what is visible. Measured
 * again when the drawer floats or docks and when the timeline collapses. Returns the pixels the
 * drawer covers.
 */
export function useViewportInset(
    session: EditorSession | null,
    canvasRef: React.RefObject<HTMLCanvasElement | null>,
    areaRef: React.RefObject<HTMLDivElement | null>,
    drawerFloating: boolean,
    timelineCollapsed: boolean
): number {
    const [inset, setInset] = useState(0);
    useEffect(() => {
        const update = () => {
            const camera = session?.camera;
            const canvas = canvasRef.current;
            const area = areaRef.current;
            if (!camera || !canvas || !area) return;
            const canvasRect = canvas.getBoundingClientRect();
            const drawerTop = area.getBoundingClientRect().bottom - DRAWER_HEIGHT;
            const covered = drawerFloating
                ? Math.max(0, Math.min(canvasRect.height * 0.8, canvasRect.bottom - drawerTop))
                : 0;
            const fraction = canvasRect.height > 0 ? covered / canvasRect.height : 0;
            camera.viewport = new Viewport(0, fraction, 1, 1 - fraction);
            setInset(covered);
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, [session, canvasRef, areaRef, drawerFloating, timelineCollapsed]);
    return inset;
}

/** Asks before the page unloads while `dirty`. */
export function useUnsavedChangesGuard(dirty: boolean): void {
    useEffect(() => {
        if (!dirty) return;
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [dirty]);
}
