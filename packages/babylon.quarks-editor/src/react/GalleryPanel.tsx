import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {
    CheckCircleIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    FolderIcon,
    FolderOpenIcon,
    SparklesIcon,
    XMarkIcon,
} from '@heroicons/react/24/solid';
import {useVirtualizer} from '@tanstack/react-virtual';
import React, {useCallback, useMemo, useRef, useState} from 'react';
import {setGalleryDragSession} from '../core/galleryDragSession';
import {
    buildGalleryTree,
    filterGalleryTree,
    flattenVisibleGalleryRows,
    writeGalleryDrag,
    type GalleryFlatRow,
    type GalleryTreeFolder,
} from '../core/galleryTree';
import type {GalleryEntry, GalleryLoadProgress} from '../core/loadEffectGallery';
import {iconStyle} from './icons';
import {buttonStyle, hiddenFileInputStyle, inputStyle, theme} from './theme';

const GALLERY_ROW_HEIGHT = 34;

export interface GalleryPanelProps {
    entries: GalleryEntry[];
    /** Effect shown in the inspector and timeline. */
    focusedRoot: TransformNode | null;
    /** In-scene effects that keep simulating while transport plays. */
    previewRootIds: ReadonlySet<number>;
    loading: GalleryLoadProgress | null;
    folderInputRef: React.RefObject<HTMLInputElement | null>;
    onFocus: (entry: GalleryEntry) => void;
    onTogglePreview: (entry: GalleryEntry) => void;
    onRemoveFromScene: (entry: GalleryEntry) => void;
    onImportFiles: (files: FileList | File[]) => void;
    onImportFolder: () => void;
    onCreateDefault: () => void;
}

function beginGalleryDrag(e: React.DragEvent, payload: Parameters<typeof writeGalleryDrag>[1]): void {
    writeGalleryDrag(e.dataTransfer, payload);
    setGalleryDragSession(payload);
}

function endGalleryDrag(): void {
    setGalleryDragSession(null);
}

function EffectRow(props: {
    entry: GalleryEntry;
    depth: number;
    focused: boolean;
    inPreview: boolean;
    onFocus: (entry: GalleryEntry) => void;
    onTogglePreview: (entry: GalleryEntry) => void;
    onRemoveFromScene: (entry: GalleryEntry) => void;
}): React.ReactElement {
    const {entry, depth, focused, inPreview, onFocus, onTogglePreview, onRemoveFromScene} = props;
    const isLooping = entry.systems.some((system) => system.looping);
    const parkedOnStage = entry.inScene && !inPreview;
    const rowBackground = focused
        ? 'rgba(120, 165, 255, 0.22)'
        : inPreview
          ? 'rgba(120, 165, 255, 0.1)'
          : parkedOnStage
            ? 'rgba(120, 165, 255, 0.04)'
            : 'transparent';
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'stretch',
                width: '100%',
                height: GALLERY_ROW_HEIGHT,
                borderBottom: `1px solid ${theme.border}`,
                background: rowBackground,
                boxSizing: 'border-box',
            }}
        >
            {entry.inScene ? (
                <button
                    type="button"
                    className="qe-hover"
                    title={
                        inPreview
                            ? 'Remove from stage preview — stops group playback and clears particles; effect stays on stage'
                            : 'Add to stage preview — plays with Stage Play/Pause'
                    }
                    style={{
                        flexShrink: 0,
                        width: 28,
                        border: 'none',
                        borderRight: `1px solid ${theme.border}`,
                        background: 'transparent',
                        color: inPreview ? theme.accent : theme.textDim,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        onTogglePreview(entry);
                    }}
                >
                    {inPreview ? (
                        <CheckCircleIcon style={iconStyle(14)} />
                    ) : (
                        <span
                            style={{
                                width: 10,
                                height: 10,
                                border: `1px solid currentColor`,
                                borderRadius: 2,
                                boxSizing: 'border-box',
                            }}
                        />
                    )}
                </button>
            ) : (
                <span style={{width: 28, flexShrink: 0, borderRight: `1px solid ${theme.border}`}} />
            )}
            <button
                type="button"
                draggable
                className="qe-hover-bg"
                title={
                    entry.inScene
                        ? `${entry.path} — on stage${inPreview ? ' · previewing' : ' · parked'} · Ctrl+click toggles preview`
                        : `${entry.path} — catalog only · drag into viewport to place`
                }
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flex: 1,
                    minWidth: 0,
                    height: '100%',
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    color: focused ? theme.text : theme.textDim,
                    padding: `0 8px 0 ${8 + depth * 14}px`,
                    fontSize: 12.5,
                    cursor: 'grab',
                    fontFamily: theme.font,
                }}
                onClick={(e) => {
                    if ((e.ctrlKey || e.metaKey) && entry.inScene) {
                        onTogglePreview(entry);
                        return;
                    }
                    onFocus(entry);
                }}
                onDragStart={(e) => beginGalleryDrag(e, {kind: 'effect', id: entry.root.uniqueId})}
                onDragEnd={endGalleryDrag}
            >
                <span
                    style={{
                        width: 14,
                        flexShrink: 0,
                        opacity: entry.inScene ? 1 : 0.35,
                        color: inPreview ? theme.accent : entry.inScene ? theme.text : theme.textDim,
                        display: 'inline-flex',
                    }}
                    title={entry.inScene ? 'On stage' : 'Catalog only'}
                >
                    <SparklesIcon style={iconStyle(14)} />
                </span>
                <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{entry.name}</span>
                {parkedOnStage && (
                    <span
                        title="On stage but not in preview"
                        style={{flexShrink: 0, fontSize: 10, color: theme.textDim, letterSpacing: 0.3}}
                    >
                        parked
                    </span>
                )}
                {isLooping && (
                    <span title="Looping effect" style={{flexShrink: 0, fontSize: 11, color: theme.textDim}}>
                        ⟳
                    </span>
                )}
            </button>
            {entry.inScene ? (
                <button
                    type="button"
                    className="qe-hover"
                    title="Remove from scene — returns to catalog; drag into viewport to place again"
                    style={{
                        flexShrink: 0,
                        width: 28,
                        border: 'none',
                        borderLeft: `1px solid ${theme.border}`,
                        background: 'transparent',
                        color: theme.textDim,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemoveFromScene(entry);
                    }}
                >
                    <XMarkIcon style={iconStyle(13)} />
                </button>
            ) : null}
        </div>
    );
}

function FolderRow(props: {
    node: GalleryTreeFolder;
    depth: number;
    effectCount: number;
    open: boolean;
    onToggle: (path: string) => void;
}): React.ReactElement {
    const {node, depth, effectCount, open, onToggle} = props;
    return (
        <button
            type="button"
            draggable={effectCount > 0}
            className="qe-hover-bg"
            title={
                effectCount > 0
                    ? `${node.path} — drag ${effectCount} effect(s) into viewport`
                    : `${node.path} — empty folder`
            }
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                width: '100%',
                height: GALLERY_ROW_HEIGHT,
                boxSizing: 'border-box',
                textAlign: 'left',
                border: 'none',
                borderBottom: `1px solid ${theme.border}`,
                background: 'transparent',
                color: theme.textDim,
                padding: `0 12px 0 ${12 + depth * 14}px`,
                fontSize: 12,
                fontWeight: 600,
                cursor: effectCount > 0 ? 'grab' : 'pointer',
                fontFamily: theme.font,
            }}
            onClick={() => onToggle(node.path)}
            onDragStart={(e) => {
                if (effectCount === 0) {
                    e.preventDefault();
                    return;
                }
                beginGalleryDrag(e, {kind: 'folder', path: node.path});
            }}
            onDragEnd={endGalleryDrag}
        >
            <span style={{width: 14, display: 'inline-flex', color: theme.textDim}}>
                {open ? <ChevronDownIcon style={iconStyle(12)} /> : <ChevronRightIcon style={iconStyle(12)} />}
            </span>
            <span style={{width: 14, display: 'inline-flex', color: theme.accent}}>
                {open ? <FolderOpenIcon style={iconStyle(14)} /> : <FolderIcon style={iconStyle(14)} />}
            </span>
            <span style={{flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                {node.name}
            </span>
            {effectCount > 0 && (
                <span style={{fontSize: 11, fontWeight: 500, color: theme.textDim, flexShrink: 0}}>{effectCount}</span>
            )}
        </button>
    );
}

function flatRowKey(row: GalleryFlatRow): string {
    return row.kind === 'folder' ? `folder:${row.node.path}` : `effect:${row.node.entry.root.uniqueId}`;
}

function VirtualGalleryTree(props: {
    rows: GalleryFlatRow[];
    closedFolders: ReadonlySet<string>;
    focusedRoot: TransformNode | null;
    previewRootIds: ReadonlySet<number>;
    onFocus: (entry: GalleryEntry) => void;
    onTogglePreview: (entry: GalleryEntry) => void;
    onRemoveFromScene: (entry: GalleryEntry) => void;
    onToggleFolder: (path: string) => void;
}): React.ReactElement {
    const {
        rows,
        closedFolders,
        focusedRoot,
        previewRootIds,
        onFocus,
        onTogglePreview,
        onRemoveFromScene,
        onToggleFolder,
    } = props;
    const scrollRef = useRef<HTMLDivElement>(null);
    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => GALLERY_ROW_HEIGHT,
        overscan: 10,
    });

    return (
        <div
            ref={scrollRef}
            style={{
                flex: 1,
                minHeight: 120,
                overflowY: 'auto',
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                background: theme.sectionBg,
            }}
        >
            <div style={{height: virtualizer.getTotalSize(), position: 'relative', width: '100%'}}>
                {virtualizer.getVirtualItems().map((virtualRow) => {
                    const row = rows[virtualRow.index];
                    const open = row.kind === 'folder' && !closedFolders.has(row.node.path);
                    return (
                        <div
                            key={flatRowKey(row)}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: virtualRow.size,
                                transform: `translateY(${virtualRow.start}px)`,
                            }}
                        >
                            {row.kind === 'folder' ? (
                                <FolderRow
                                    node={row.node}
                                    depth={row.depth}
                                    effectCount={row.effectCount}
                                    open={open}
                                    onToggle={onToggleFolder}
                                />
                            ) : (
                                <EffectRow
                                    entry={row.node.entry}
                                    depth={row.depth}
                                    focused={focusedRoot === row.node.entry.root}
                                    inPreview={previewRootIds.has(row.node.entry.root.uniqueId)}
                                    onFocus={onFocus}
                                    onTogglePreview={onTogglePreview}
                                    onRemoveFromScene={onRemoveFromScene}
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/** Folder-tree catalog; import effects here and drag them into the viewport. */
export function GalleryPanel(props: GalleryPanelProps): React.ReactElement {
    const {
        entries,
        focusedRoot,
        previewRootIds,
        loading,
        folderInputRef,
        onFocus,
        onTogglePreview,
        onRemoveFromScene,
        onImportFiles,
        onImportFolder,
        onCreateDefault,
    } = props;
    const [query, setQuery] = useState('');
    const [closedFolders, setClosedFolders] = useState<Set<string>>(() => new Set());
    const fileInputRef = useRef<HTMLInputElement>(null);

    const tree = useMemo(() => buildGalleryTree(entries), [entries]);
    const filtered = useMemo(() => filterGalleryTree(tree, query), [tree, query]);
    const expandAll = query.trim().length > 0;
    const flatRows = useMemo(
        () => flattenVisibleGalleryRows(filtered, closedFolders, expandAll),
        [filtered, closedFolders, expandAll]
    );
    const inSceneCount = useMemo(() => entries.filter((entry) => entry.inScene).length, [entries]);
    const previewCount = useMemo(
        () => entries.filter((entry) => entry.inScene && previewRootIds.has(entry.root.uniqueId)).length,
        [entries, previewRootIds]
    );
    const isLoading = loading !== null;

    const toggleFolder = useCallback((path: string) => {
        setClosedFolders((prev) => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    }, []);

    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: 10, height: '100%', minHeight: 0}}>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: 6}}>
                <button
                    type="button"
                    className="qe-hover"
                    style={buttonStyle}
                    disabled={isLoading}
                    onClick={onCreateDefault}
                >
                    New effect
                </button>
                <label
                    className="qe-hover"
                    style={{
                        ...buttonStyle,
                        position: 'relative',
                        display: 'inline-flex',
                        alignItems: 'center',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        opacity: isLoading ? 0.5 : 1,
                    }}
                >
                    Import effect
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        disabled={isLoading}
                        tabIndex={-1}
                        style={hiddenFileInputStyle}
                        onChange={(e) => {
                            // Snapshot before clearing — FileList is live and empties with value=''.
                            const files = Array.from(e.target.files ?? []);
                            e.target.value = '';
                            if (files.length === 0) return;
                            onImportFiles(files);
                        }}
                    />
                </label>
                <label
                    className="qe-hover"
                    style={{
                        ...buttonStyle,
                        position: 'relative',
                        display: 'inline-flex',
                        alignItems: 'center',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        opacity: isLoading ? 0.5 : 1,
                    }}
                    onClick={(e) => {
                        if (
                            typeof (window as Window & {showDirectoryPicker?: unknown}).showDirectoryPicker ===
                            'function'
                        ) {
                            e.preventDefault();
                            onImportFolder();
                        }
                    }}
                >
                    Import folder
                    <input
                        ref={(el) => {
                            folderInputRef.current = el;
                            if (el) {
                                el.setAttribute('webkitdirectory', '');
                                el.setAttribute('directory', '');
                                el.multiple = true;
                            }
                        }}
                        type="file"
                        multiple
                        disabled={isLoading}
                        tabIndex={-1}
                        style={hiddenFileInputStyle}
                        onChange={(e) => {
                            const files = Array.from(e.target.files ?? []);
                            e.target.value = '';
                            if (files.length === 0) return;
                            onImportFiles(files);
                        }}
                    />
                </label>
            </div>
            <div style={{fontSize: 12, color: theme.textDim, lineHeight: 1.45}}>
                {isLoading
                    ? `Loading… ${loading.done} / ${loading.total || '…'} files`
                    : `${previewCount} previewing · ${inSceneCount} on stage · ${entries.length} in catalog`}
            </div>
            <div style={{fontSize: 11, color: theme.textDim, lineHeight: 1.45}}>
                ✓ stage preview · ✨ on stage · drag to place · × remove from stage
                <br />
                Click = edit · Ctrl+click = toggle preview
            </div>
            <input
                className="qe-hover"
                style={inputStyle}
                placeholder="Filter by name or path…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
            />
            {entries.length === 0 && !isLoading ? (
                <div
                    style={{
                        flex: 1,
                        minHeight: 120,
                        padding: '14px 12px',
                        fontSize: 12,
                        color: theme.textDim,
                        lineHeight: 1.5,
                        border: `1px solid ${theme.border}`,
                        borderRadius: 8,
                        background: theme.sectionBg,
                    }}
                >
                    Catalog is empty. Click <strong>New effect</strong>, or <strong>Import effect</strong> /{' '}
                    <strong>Import folder</strong>.
                </div>
            ) : filtered.length === 0 ? (
                <div
                    style={{
                        flex: 1,
                        minHeight: 120,
                        padding: '10px 12px',
                        fontSize: 12,
                        color: theme.textDim,
                        border: `1px solid ${theme.border}`,
                        borderRadius: 8,
                        background: theme.sectionBg,
                    }}
                >
                    No matches.
                </div>
            ) : (
                <VirtualGalleryTree
                    rows={flatRows}
                    closedFolders={closedFolders}
                    focusedRoot={focusedRoot}
                    previewRootIds={previewRootIds}
                    onFocus={onFocus}
                    onTogglePreview={onTogglePreview}
                    onRemoveFromScene={onRemoveFromScene}
                    onToggleFolder={toggleFolder}
                />
            )}
        </div>
    );
}
