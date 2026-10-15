import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {EyeIcon, EyeSlashIcon, SparklesIcon, TrashIcon, ViewfinderCircleIcon} from '@heroicons/react/24/solid';
import React, {useState} from 'react';
import type {SceneEntry} from '../core/sceneEntries';
import {ContextMenu, type ContextMenuItem} from './ContextMenu';
import {iconStyle} from './icons';
import {buttonStyle, theme} from './theme';

const ROW_HEIGHT = 34;

export interface ScenePanelProps {
    entries: SceneEntry[];
    /** Effect shown in the inspector and timeline. */
    focusedRoot: TransformNode | null;
    /** Visible entries — they render and play with the stage transport. */
    visibleRootIds: ReadonlySet<number>;
    onFocus: (entry: SceneEntry) => void;
    onToggleVisible: (entry: SceneEntry) => void;
    /** Root of the entry shown alone, or null. */
    soloRootId: number | null;
    onToggleSolo: (entry: SceneEntry) => void;
    onDelete: (entry: SceneEntry) => void;
    /** "Save as new asset…" in the row's right-click menu. */
    onSaveAsAsset?: (entry: SceneEntry) => void;
    onCreateDefault: () => void;
}

export const rowIconButtonStyle: React.CSSProperties = {
    flexShrink: 0,
    width: 28,
    border: 'none',
    background: 'transparent',
    color: theme.textDim,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
};

function SceneRow(props: {
    entry: SceneEntry;
    focused: boolean;
    visible: boolean;
    solo: boolean;
    onFocus: (entry: SceneEntry) => void;
    onToggleVisible: (entry: SceneEntry) => void;
    onToggleSolo: (entry: SceneEntry) => void;
    onDelete: (entry: SceneEntry) => void;
    onContextMenu: (e: React.MouseEvent, entry: SceneEntry) => void;
}): React.ReactElement {
    const {entry, focused, visible, solo, onFocus, onToggleVisible, onToggleSolo, onDelete, onContextMenu} = props;
    const isLooping = entry.systems.some((system) => system.looping);
    return (
        <div
            onContextMenu={(e) => onContextMenu(e, entry)}
            style={{
                display: 'flex',
                alignItems: 'stretch',
                height: ROW_HEIGHT,
                borderBottom: `1px solid ${theme.border}`,
                background: focused ? 'rgba(120, 165, 255, 0.22)' : 'transparent',
                boxSizing: 'border-box',
            }}
        >
            <button
                type="button"
                className="qe-hover"
                title={visible ? 'Hide — stops and clears this effect' : 'Show — plays with the stage transport'}
                style={{
                    ...rowIconButtonStyle,
                    borderRight: `1px solid ${theme.border}`,
                    color: visible ? theme.accent : theme.textDim,
                    opacity: visible ? 1 : 0.6,
                }}
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleVisible(entry);
                }}
            >
                {visible ? <EyeIcon style={iconStyle(14)} /> : <EyeSlashIcon style={iconStyle(14)} />}
            </button>
            <button
                type="button"
                className="qe-hover-bg"
                title={`${entry.name}${entry.assetId != null ? ` — from ${entry.path}` : ''} · Ctrl+click toggles visibility`}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flex: 1,
                    minWidth: 0,
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    color: focused ? theme.text : visible ? theme.textDim : 'rgba(183, 198, 234, 0.5)',
                    padding: '0 8px',
                    fontSize: 12.5,
                    cursor: 'pointer',
                    fontFamily: theme.font,
                }}
                onClick={(e) => {
                    if (e.ctrlKey || e.metaKey) {
                        onToggleVisible(entry);
                        return;
                    }
                    onFocus(entry);
                }}
            >
                <span style={{width: 14, flexShrink: 0, display: 'inline-flex', opacity: visible ? 1 : 0.4}}>
                    <SparklesIcon style={iconStyle(14)} />
                </span>
                <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{entry.name}</span>
                {isLooping && (
                    <span title="Looping effect" style={{flexShrink: 0, fontSize: 11, color: theme.textDim}}>
                        ⟳
                    </span>
                )}
            </button>
            <button
                type="button"
                className="qe-hover"
                title={solo ? 'Exit solo — show the other effects again' : 'Solo — hide every other effect'}
                style={{
                    ...rowIconButtonStyle,
                    borderLeft: `1px solid ${theme.border}`,
                    color: solo ? '#ffcc66' : theme.textDim,
                }}
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleSolo(entry);
                }}
            >
                <ViewfinderCircleIcon style={iconStyle(14)} />
            </button>
            <button
                type="button"
                className="qe-hover"
                title="Delete from scene (Delete)"
                style={{...rowIconButtonStyle, borderLeft: `1px solid ${theme.border}`}}
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete(entry);
                }}
            >
                <TrashIcon style={iconStyle(13)} />
            </button>
        </div>
    );
}

/** Lists the effect instances that are in the scene right now. */
export function ScenePanel(props: ScenePanelProps): React.ReactElement {
    const {
        entries,
        focusedRoot,
        visibleRootIds,
        soloRootId,
        onFocus,
        onToggleVisible,
        onToggleSolo,
        onDelete,
        onSaveAsAsset,
        onCreateDefault,
    } = props;
    const [menu, setMenu] = useState<{x: number; y: number; items: ContextMenuItem[]} | null>(null);
    const openMenu = (e: React.MouseEvent, entry: SceneEntry) => {
        e.preventDefault();
        const visible = visibleRootIds.has(entry.root.uniqueId);
        const items: ContextMenuItem[] = [];
        if (onSaveAsAsset) {
            items.push({label: 'Save as new asset…', onSelect: () => onSaveAsAsset(entry)});
        }
        items.push(
            {label: visible ? 'Hide' : 'Show', onSelect: () => onToggleVisible(entry)},
            {
                label: soloRootId === entry.root.uniqueId ? 'Exit solo' : 'Solo',
                onSelect: () => onToggleSolo(entry),
            },
            {label: 'Delete', danger: true, onSelect: () => onDelete(entry)}
        );
        setMenu({x: e.clientX, y: e.clientY, items});
    };
    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: 10, height: '100%', minHeight: 0}}>
            <div style={{display: 'flex', gap: 6}}>
                <button type="button" className="qe-hover" style={buttonStyle} onClick={onCreateDefault}>
                    New effect
                </button>
            </div>
            {entries.length === 0 ? (
                <div
                    style={{
                        padding: '14px 12px',
                        fontSize: 12,
                        color: theme.textDim,
                        lineHeight: 1.5,
                        border: `1px solid ${theme.border}`,
                        borderRadius: 8,
                        background: theme.sectionBg,
                    }}
                >
                    The scene is empty. Click <strong>New effect</strong>, or drag effects from the{' '}
                    <strong>Assets</strong> tab below into the viewport.
                </div>
            ) : (
                <div
                    style={{
                        flex: 1,
                        minHeight: 0,
                        overflowY: 'auto',
                        border: `1px solid ${theme.border}`,
                        borderRadius: 8,
                        background: theme.sectionBg,
                    }}
                >
                    {entries.map((entry) => (
                        <SceneRow
                            key={entry.root.uniqueId}
                            entry={entry}
                            focused={focusedRoot === entry.root}
                            visible={visibleRootIds.has(entry.root.uniqueId)}
                            solo={soloRootId === entry.root.uniqueId}
                            onFocus={onFocus}
                            onToggleVisible={onToggleVisible}
                            onToggleSolo={onToggleSolo}
                            onDelete={onDelete}
                            onContextMenu={openMenu}
                        />
                    ))}
                </div>
            )}
            {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
        </div>
    );
}
