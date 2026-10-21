import type {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {
    ChevronDownIcon,
    ChevronRightIcon,
    EyeIcon,
    EyeSlashIcon,
    SparklesIcon,
    TrashIcon,
    ViewfinderCircleIcon,
} from '@heroicons/react/24/solid';
import React, {useEffect, useState} from 'react';
import {buildEffectTree} from '../core/effectTree.js';
import type {SceneEntry} from '../core/sceneEntries.js';
import {ContextMenu, type ContextMenuItem} from './ContextMenu.js';
import {EffectTreeView} from './EffectTreeView.js';
import {iconStyle} from './icons.js';
import {buttonStyle, theme} from './theme.js';

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
    /** Node shown in the inspector; highlighted in the expanded effect trees. */
    selectedNode?: TransformNode | null;
    /** Picks a group/emitter inside an effect (focusing the effect first when needed). */
    onSelectNode?: (entry: SceneEntry, node: TransformNode) => void;
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
    hasTree: boolean;
    expanded: boolean;
    onToggleExpanded: (entry: SceneEntry) => void;
}): React.ReactElement {
    const {
        entry,
        focused,
        visible,
        solo,
        onFocus,
        onToggleVisible,
        onToggleSolo,
        onDelete,
        onContextMenu,
        hasTree,
        expanded,
        onToggleExpanded,
    } = props;
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
                    padding: '0 8px 0 4px',
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
                <span
                    title={expanded ? 'Collapse' : 'Show its groups and emitters'}
                    style={{
                        width: 12,
                        flexShrink: 0,
                        display: 'inline-flex',
                        visibility: hasTree ? 'visible' : 'hidden',
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleExpanded(entry);
                    }}
                >
                    {expanded ? <ChevronDownIcon style={iconStyle(11)} /> : <ChevronRightIcon style={iconStyle(11)} />}
                </span>
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
        selectedNode = null,
        onSelectNode,
    } = props;
    const [menu, setMenu] = useState<{x: number; y: number; items: ContextMenuItem[]} | null>(null);
    const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
    // The focused effect opens its tree, so its sub-emitters are one click away.
    useEffect(() => {
        if (focusedRoot) {
            setExpanded((prev) => (prev.has(focusedRoot.uniqueId) ? prev : new Set(prev).add(focusedRoot.uniqueId)));
        }
    }, [focusedRoot]);
    const toggleExpanded = (entry: SceneEntry) =>
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(entry.root.uniqueId)) {
                next.delete(entry.root.uniqueId);
            } else {
                next.add(entry.root.uniqueId);
            }
            return next;
        });
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
                    {entries.map((entry) => {
                        const hasTree = onSelectNode !== undefined && buildEffectTree(entry.root).children.length > 0;
                        const open = hasTree && expanded.has(entry.root.uniqueId);
                        return (
                            <React.Fragment key={entry.root.uniqueId}>
                                <SceneRow
                                    entry={entry}
                                    hasTree={hasTree}
                                    expanded={open}
                                    onToggleExpanded={toggleExpanded}
                                    focused={focusedRoot === entry.root}
                                    visible={visibleRootIds.has(entry.root.uniqueId)}
                                    solo={soloRootId === entry.root.uniqueId}
                                    onFocus={onFocus}
                                    onToggleVisible={onToggleVisible}
                                    onToggleSolo={onToggleSolo}
                                    onDelete={onDelete}
                                    onContextMenu={openMenu}
                                />
                                {open && (
                                    <div style={{borderBottom: `1px solid ${theme.border}`, padding: '2px 0'}}>
                                        <EffectTreeView
                                            root={entry.root}
                                            selectedNode={selectedNode}
                                            indent={34}
                                            onSelect={(node) => onSelectNode!(entry, node)}
                                        />
                                    </div>
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            )}
            {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
        </div>
    );
}
