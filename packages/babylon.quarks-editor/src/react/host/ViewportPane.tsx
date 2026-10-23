import {
    ArrowLeftIcon,
    ArrowPathIcon,
    ArrowsPointingOutIcon,
    ArrowUturnLeftIcon,
    ArrowUturnRightIcon,
    CubeTransparentIcon,
    CursorArrowRaysIcon,
    Square2StackIcon,
} from '@heroicons/react/24/solid';
import React from 'react';
import type {AssetLoadProgress} from '../../core/assets.js';
import type {PrefabInfo} from '../../core/editorSession.js';
import {iconStyle, type HeroIcon} from '../icons.js';
import {buttonStyle, theme} from '../theme.js';
import {activeSquareButtonStyle, floatingPanelStyle, saveButtonStyle, squareButtonStyle} from './hostStyles.js';

/** What the stage gizmo does: nothing, or move, rotate or scale the selected node. */
export type GizmoMode = 'none' | 'position' | 'rotation' | 'scale';

const GIZMO_MODE_BUTTONS: Array<{value: GizmoMode; Icon: HeroIcon; title: string}> = [
    {value: 'none', Icon: CursorArrowRaysIcon, title: 'Select (hide stage gizmo)'},
    {value: 'position', Icon: ArrowsPointingOutIcon, title: 'Move the stage node (position)'},
    {value: 'rotation', Icon: ArrowPathIcon, title: 'Rotate the stage node'},
    {value: 'scale', Icon: Square2StackIcon, title: 'Scale the stage node'},
];

/** Props of {@link ViewportPane}. */
export interface ViewportPaneProps {
    /** The canvas the engine draws into. */
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    /** The render loop writes the frame rate here. */
    fpsRef: React.RefObject<HTMLSpanElement | null>;
    /** Pixels at the bottom covered by the floating Assets drawer. */
    inset: number;
    /** The transport bar, once the scene exists. */
    transport: React.ReactNode;
    /** The asset drag hovering the viewport, if any. */
    dragHover: {label: string; count: number} | null;
    /** Asset import progress, while importing. */
    assetsLoading: AssetLoadProgress | null;
    /** The open prefab, if any. */
    prefabInfo: PrefabInfo | null;
    /** The open prefab has unsaved edits. */
    prefabDirty: boolean;
    /** Link shown in the top-left corner, outside prefab mode. */
    backLink?: {href: string; label: string};
    /** Undo is possible. */
    canUndo: boolean;
    /** Redo is possible. */
    canRedo: boolean;
    /** An effect is focused. */
    hasFocus: boolean;
    /** The stage gizmo's mode. */
    gizmoMode: GizmoMode;
    /** Emitter shape wireframes are shown. */
    showWireframes: boolean;
    /** Drag handlers of the viewport, for assets dropped from the drawer. */
    dragHandlers: Pick<React.HTMLAttributes<HTMLDivElement>, 'onDragEnter' | 'onDragLeave' | 'onDragOver' | 'onDrop'>;
    /** Undo (`false`) or redo. */
    onHistoryStep(redo: boolean): void;
    /** Pick the stage gizmo's mode. */
    onGizmoMode(mode: GizmoMode): void;
    /** Show or hide the emitter wireframes. */
    onToggleWireframes(): void;
    /** Back from the prefab to the scene. */
    onExitPrefab(): void;
    /** Save the open prefab. */
    onSavePrefab(): void;
}

/** The 3D viewport and what floats over it: toolbars, transport, drag and import feedback. */
export function ViewportPane({
    canvasRef,
    fpsRef,
    inset,
    transport,
    dragHover,
    assetsLoading,
    prefabInfo,
    prefabDirty,
    backLink,
    canUndo,
    canRedo,
    hasFocus,
    gizmoMode,
    showWireframes,
    dragHandlers,
    onHistoryStep,
    onGizmoMode,
    onToggleWireframes,
    onExitPrefab,
    onSavePrefab,
}: ViewportPaneProps): React.ReactElement {
    return (
        <div style={{position: 'relative', flex: 1, minWidth: 0}} {...dragHandlers}>
            <canvas
                ref={canvasRef}
                style={{width: '100%', height: '100%', display: 'block', touchAction: 'none', outline: 'none'}}
            />
            <div
                style={{
                    ...floatingPanelStyle,
                    position: 'absolute',
                    bottom: 12 + inset,
                    left: 12,
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
            {transport && (
                <div style={{position: 'absolute', bottom: 12 + inset, left: '50%', transform: 'translateX(-50%)'}}>
                    {transport}
                </div>
            )}
            {dragHover && (
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
                        Drop {dragHover.count === 1 ? 'effect' : `${dragHover.count} effects`} — {dragHover.label}
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
                    <div style={{...floatingPanelStyle, borderRadius: 10, padding: '16px 22px', textAlign: 'center'}}>
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
                        ...floatingPanelStyle,
                        position: 'absolute',
                        top: 12,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '4px 4px 4px 6px',
                        border: `1px solid ${theme.borderActive}`,
                        fontSize: 12.5,
                        zIndex: 5,
                    }}
                >
                    <button
                        type="button"
                        className="qe-hover"
                        title="Back to the scene"
                        style={{...buttonStyle, padding: '3px 10px'}}
                        onClick={onExitPrefab}
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
                        style={saveButtonStyle(prefabDirty, '3px 12px')}
                        onClick={onSavePrefab}
                    >
                        Save
                    </button>
                </div>
            )}
            {backLink && !prefabInfo && (
                <a
                    className="qe-hover"
                    href={backLink.href}
                    style={{
                        ...floatingPanelStyle,
                        position: 'absolute',
                        top: 12,
                        left: 12,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        fontSize: 13,
                        fontWeight: 500,
                        color: theme.text,
                        textDecoration: 'none',
                        fontFamily: theme.font,
                    }}
                >
                    <ArrowLeftIcon style={iconStyle(14)} />
                    {backLink.label.replace(/^←\s*/, '')}
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
                <div style={{...floatingPanelStyle, display: 'flex', gap: 4, padding: 4}}>
                    <button
                        className="qe-hover"
                        style={squareButtonStyle}
                        title="Undo (Ctrl+Z)"
                        disabled={!canUndo || !hasFocus}
                        onClick={() => onHistoryStep(false)}
                    >
                        <ArrowUturnLeftIcon style={iconStyle(14)} />
                    </button>
                    <button
                        className="qe-hover"
                        style={squareButtonStyle}
                        title="Redo (Ctrl+Shift+Z)"
                        disabled={!canRedo || !hasFocus}
                        onClick={() => onHistoryStep(true)}
                    >
                        <ArrowUturnRightIcon style={iconStyle(14)} />
                    </button>
                </div>
                <div style={{...floatingPanelStyle, display: 'flex', flexDirection: 'column', gap: 4, padding: 4}}>
                    {GIZMO_MODE_BUTTONS.map((m) => (
                        <button
                            key={m.value}
                            className="qe-hover"
                            style={{
                                ...squareButtonStyle,
                                ...(gizmoMode === m.value ? activeSquareButtonStyle : {}),
                            }}
                            title={m.title}
                            onClick={() => onGizmoMode(m.value)}
                        >
                            <m.Icon style={iconStyle(14)} />
                        </button>
                    ))}
                </div>
                <div style={{...floatingPanelStyle, display: 'flex', flexDirection: 'column', gap: 4, padding: 4}}>
                    <button
                        className="qe-hover"
                        style={{...squareButtonStyle, ...(showWireframes ? activeSquareButtonStyle : {})}}
                        title="Show emitter shape wireframes"
                        disabled={!hasFocus}
                        onClick={onToggleWireframes}
                    >
                        <CubeTransparentIcon style={iconStyle(14)} />
                    </button>
                </div>
            </div>
        </div>
    );
}
