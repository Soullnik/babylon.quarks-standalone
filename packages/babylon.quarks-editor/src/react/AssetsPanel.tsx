import {
    ChevronDownIcon,
    ChevronRightIcon,
    ExclamationTriangleIcon,
    FolderIcon,
    FolderOpenIcon,
    SparklesIcon,
} from '@heroicons/react/24/solid';
import React, {useCallback, useMemo, useRef, useState} from 'react';
import {setAssetDragSession} from '../core/assetDragSession.js';
import {
    buildAssetTree,
    collectFolderAssets,
    folderChildren,
    searchAssets,
    writeAssetDrag,
    type AssetDragPayload,
    type AssetTreeFolder,
    type AssetTreeNode,
} from '../core/assetTree.js';
import {assetIconUrl, type AssetLoadProgress, type EffectAsset} from '../core/assets.js';
import {ContextMenu, type ContextMenuItem} from './ContextMenu.js';
import {iconStyle} from './icons.js';
import {buttonStyle, hiddenFileInputStyle, inputStyle, theme} from './theme.js';

const TREE_WIDTH = 200;
const TILE_WIDTH = 92;

export interface AssetsPanelProps {
    assets: EffectAsset[];
    /** Scene instance count per asset id. */
    instanceCounts: ReadonlyMap<number, number>;
    loading: AssetLoadProgress | null;
    folderInputRef: React.RefObject<HTMLInputElement | null>;
    onImportFiles: (files: FileList | File[]) => void;
    onImportFolder: () => void;
    /** Adds a new instance of each asset in the payload to the scene. */
    onAddToScene: (payload: AssetDragPayload) => void;
    onDelete: (payload: AssetDragPayload) => void;
    /** Opens the asset on its own to edit it (double-click). Without it, double-click adds to the scene. */
    onOpenPrefab?: (asset: EffectAsset) => void;
}

type MenuState = {x: number; y: number; items: ContextMenuItem[]} | null;

function beginAssetDrag(e: React.DragEvent, payload: AssetDragPayload): void {
    writeAssetDrag(e.dataTransfer, payload);
    setAssetDragSession(payload);
}

function endAssetDrag(): void {
    setAssetDragSession(null);
}

function folderName(path: string): string {
    return path.split('/').filter(Boolean).pop() ?? 'Assets';
}

/** Main texture of the effect, or a sparkle when it has none (or it fails to load). */
function AssetIcon(props: {asset: EffectAsset}): React.ReactElement {
    const url = assetIconUrl(props.asset);
    const [failed, setFailed] = useState(false);
    if (!url || failed) {
        return <SparklesIcon style={{...iconStyle(26), color: theme.accent, opacity: 0.8}} />;
    }
    return (
        <img
            src={url}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setFailed(true)}
            style={{maxWidth: '100%', maxHeight: '100%', objectFit: 'contain'}}
        />
    );
}

function Tile(props: {
    label: string;
    title: string;
    selected: boolean;
    icon: React.ReactNode;
    badge?: React.ReactNode;
    warning?: string;
    subtitle?: string;
    onSelect: () => void;
    onOpen: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
    onDragStart: (e: React.DragEvent) => void;
}): React.ReactElement {
    return (
        <button
            type="button"
            draggable
            className="qe-hover-bg"
            title={props.title}
            onClick={props.onSelect}
            onDoubleClick={props.onOpen}
            onContextMenu={props.onContextMenu}
            onDragStart={props.onDragStart}
            onDragEnd={endAssetDrag}
            style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 5,
                width: '100%',
                padding: '6px 4px',
                border: `1px solid ${props.selected ? theme.borderActive : 'transparent'}`,
                borderRadius: 8,
                background: props.selected ? 'rgba(120, 165, 255, 0.18)' : 'transparent',
                color: theme.text,
                cursor: 'grab',
                fontFamily: theme.font,
            }}
        >
            <span
                style={{
                    width: 56,
                    height: 56,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 6,
                    background: 'rgba(0, 0, 0, 0.35)',
                    overflow: 'hidden',
                }}
            >
                {props.icon}
            </span>
            <span
                style={{
                    width: '100%',
                    fontSize: 11.5,
                    lineHeight: 1.25,
                    textAlign: 'center',
                    wordBreak: 'break-word',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                }}
            >
                {props.label}
            </span>
            {props.subtitle && (
                <span
                    style={{
                        width: '100%',
                        fontSize: 10,
                        color: theme.textDim,
                        textAlign: 'center',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {props.subtitle}
                </span>
            )}
            {props.badge && (
                <span style={{position: 'absolute', top: 4, right: 6, fontSize: 10.5, color: theme.accent}}>
                    {props.badge}
                </span>
            )}
            {props.warning && (
                <span title={props.warning} style={{position: 'absolute', top: 4, left: 5, color: '#ffcc66'}}>
                    <ExclamationTriangleIcon style={iconStyle(12)} />
                </span>
            )}
        </button>
    );
}

function FolderTreeRow(props: {
    folder: AssetTreeFolder;
    depth: number;
    currentPath: string;
    collapsed: ReadonlySet<string>;
    onToggle: (path: string) => void;
    onOpen: (path: string) => void;
    onContextMenu: (e: React.MouseEvent, folder: AssetTreeFolder) => void;
}): React.ReactElement {
    const {folder, depth, currentPath, collapsed, onToggle, onOpen, onContextMenu} = props;
    const subfolders = folder.children.filter((node): node is AssetTreeFolder => node.kind === 'folder');
    const open = !collapsed.has(folder.path);
    const current = currentPath === folder.path;
    return (
        <>
            <div
                className="qe-hover-bg"
                title={folder.path}
                draggable
                onClick={() => onOpen(folder.path)}
                onContextMenu={(e) => onContextMenu(e, folder)}
                onDragStart={(e) => beginAssetDrag(e, {kind: 'folder', path: folder.path})}
                onDragEnd={endAssetDrag}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    height: 26,
                    padding: `0 8px 0 ${6 + depth * 12}px`,
                    fontSize: 12,
                    cursor: 'pointer',
                    color: current ? theme.text : theme.textDim,
                    background: current ? 'rgba(120, 165, 255, 0.2)' : undefined,
                }}
            >
                <span
                    style={{
                        width: 12,
                        display: 'inline-flex',
                        visibility: subfolders.length > 0 ? 'visible' : 'hidden',
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggle(folder.path);
                    }}
                >
                    {open ? <ChevronDownIcon style={iconStyle(11)} /> : <ChevronRightIcon style={iconStyle(11)} />}
                </span>
                <span style={{display: 'inline-flex', color: theme.accent}}>
                    {current ? <FolderOpenIcon style={iconStyle(13)} /> : <FolderIcon style={iconStyle(13)} />}
                </span>
                <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{folder.name}</span>
            </div>
            {open &&
                subfolders.map((child) => (
                    <FolderTreeRow key={child.path} {...props} folder={child} depth={depth + 1} />
                ))}
        </>
    );
}

/**
 * Bottom-dock asset browser: folder tree on the left, the open folder's effects as tiles on the
 * right. Drag a tile into the viewport (as many times as needed) or right-click it for actions.
 */
export function AssetsPanel(props: AssetsPanelProps): React.ReactElement {
    const {
        assets,
        instanceCounts,
        loading,
        folderInputRef,
        onImportFiles,
        onImportFolder,
        onAddToScene,
        onDelete,
        onOpenPrefab,
    } = props;
    const [query, setQuery] = useState('');
    const [currentPath, setCurrentPath] = useState('');
    const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [menu, setMenu] = useState<MenuState>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isLoading = loading !== null;
    const searching = query.trim().length > 0;

    const tree = useMemo(() => buildAssetTree(assets), [assets]);
    const rootFolder: AssetTreeFolder = useMemo(
        () => ({kind: 'folder', name: 'Assets', path: '', children: tree}),
        [tree]
    );
    // A deleted folder falls back to the top level.
    const children = folderChildren(tree, currentPath);
    const openPath = children ? currentPath : '';
    const content: AssetTreeNode[] = children ?? tree;
    const results = useMemo(() => (searching ? searchAssets(assets, query) : []), [assets, query, searching]);

    const closeMenu = useCallback(() => setMenu(null), []);
    const toggleFolder = useCallback((path: string) => {
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    }, []);
    const openFolder = useCallback((path: string) => {
        setCurrentPath(path);
        setQuery('');
        setSelectedKey(null);
    }, []);

    const showMenu = (e: React.MouseEvent, items: ContextMenuItem[]) => {
        e.preventDefault();
        e.stopPropagation();
        setMenu({x: e.clientX, y: e.clientY, items});
    };

    const assetMenu = (e: React.MouseEvent, asset: EffectAsset) => {
        setSelectedKey(`asset:${asset.id}`);
        showMenu(e, [
            ...(onOpenPrefab ? [{label: 'Open prefab', onSelect: () => onOpenPrefab(asset)}] : []),
            {label: 'Add to scene', onSelect: () => onAddToScene({kind: 'asset', id: asset.id})},
            {label: 'Delete from Assets', danger: true, onSelect: () => onDelete({kind: 'asset', id: asset.id})},
        ]);
    };

    const folderMenu = (e: React.MouseEvent, folder: AssetTreeFolder) => {
        const count = folder.path ? collectFolderAssets(folder).length : assets.length;
        setSelectedKey(`folder:${folder.path}`);
        const items: ContextMenuItem[] = [
            {label: 'Open', onSelect: () => openFolder(folder.path)},
            {
                label: `Add all to scene (${count})`,
                disabled: count === 0 || !folder.path,
                onSelect: () => onAddToScene({kind: 'folder', path: folder.path}),
            },
        ];
        if (folder.path) {
            items.push({
                label: 'Delete folder from Assets',
                danger: true,
                onSelect: () => onDelete({kind: 'folder', path: folder.path}),
            });
        }
        showMenu(e, items);
    };

    const backgroundMenu = (e: React.MouseEvent) =>
        showMenu(e, [
            {label: 'Import effect…', disabled: isLoading, onSelect: () => fileInputRef.current?.click()},
            {label: 'Import folder…', disabled: isLoading, onSelect: onImportFolder},
        ]);

    const assetTile = (asset: EffectAsset, subtitle?: string) => {
        const key = `asset:${asset.id}`;
        const instances = instanceCounts.get(asset.id) ?? 0;
        return (
            <Tile
                key={key}
                label={asset.name}
                subtitle={subtitle}
                title={`${asset.path}\nDrag into the viewport · double-click ${onOpenPrefab ? 'opens the prefab' : 'adds to the scene'}`}
                selected={selectedKey === key}
                icon={<AssetIcon asset={asset} />}
                badge={instances > 0 ? `×${instances}` : undefined}
                warning={
                    asset.missingFiles.length > 0
                        ? `References files that were not imported — import the whole export folder:\n${asset.missingFiles.join('\n')}`
                        : undefined
                }
                onSelect={() => setSelectedKey(key)}
                onOpen={() => (onOpenPrefab ? onOpenPrefab(asset) : onAddToScene({kind: 'asset', id: asset.id}))}
                onContextMenu={(e) => assetMenu(e, asset)}
                onDragStart={(e) => beginAssetDrag(e, {kind: 'asset', id: asset.id})}
            />
        );
    };

    const folderTile = (folder: AssetTreeFolder) => {
        const key = `folder:${folder.path}`;
        const count = collectFolderAssets(folder).length;
        return (
            <Tile
                key={key}
                label={folder.name}
                title={`${folder.path} — ${count} effect(s)\nDouble-click to open · drag to place them all`}
                selected={selectedKey === key}
                icon={<FolderIcon style={{...iconStyle(34), color: theme.accent}} />}
                badge={String(count)}
                onSelect={() => setSelectedKey(key)}
                onOpen={() => openFolder(folder.path)}
                onContextMenu={(e) => folderMenu(e, folder)}
                onDragStart={(e) => beginAssetDrag(e, {kind: 'folder', path: folder.path})}
            />
        );
    };

    const fileLabelStyle: React.CSSProperties = {
        ...buttonStyle,
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        cursor: isLoading ? 'not-allowed' : 'pointer',
        opacity: isLoading ? 0.5 : 1,
    };
    const takeFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Snapshot before clearing — FileList is live and empties with value=''.
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        if (files.length > 0) {
            onImportFiles(files);
        }
    };

    const crumbs = openPath ? ['', ...openPath.split('/').map((_, i, parts) => parts.slice(0, i + 1).join('/'))] : [''];
    const gridItems = searching
        ? results.map((asset) => assetTile(asset, asset.path.split('/').slice(0, -1).join('/') || undefined))
        : content.map((node) => (node.kind === 'folder' ? folderTile(node) : assetTile(node.asset)));

    return (
        <div style={{display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px'}}>
                <label
                    className="qe-hover"
                    style={fileLabelStyle}
                    title="Effect .json files (plus any texture files they use)"
                >
                    Import effect
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".json,image/*"
                        disabled={isLoading}
                        tabIndex={-1}
                        style={hiddenFileInputStyle}
                        onChange={takeFiles}
                    />
                </label>
                <label
                    className="qe-hover"
                    style={fileLabelStyle}
                    title="A folder of effects — subfolders and shared asset files are kept"
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
                            }
                        }}
                        type="file"
                        multiple
                        disabled={isLoading}
                        tabIndex={-1}
                        style={hiddenFileInputStyle}
                        onChange={takeFiles}
                    />
                </label>
                <input
                    className="qe-hover"
                    style={{...inputStyle, width: 220, padding: '4px 8px'}}
                    placeholder="Search all folders…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
                <span style={{fontSize: 12, color: theme.textDim, marginLeft: 'auto', whiteSpace: 'nowrap'}}>
                    {isLoading
                        ? `Loading… ${loading.done} / ${loading.total || '…'} files`
                        : `${assets.length} asset(s) · drag into the viewport · right-click for actions`}
                </span>
            </div>
            <div style={{display: 'flex', flex: 1, minHeight: 0, borderTop: `1px solid ${theme.border}`}}>
                <div
                    style={{
                        width: TREE_WIDTH,
                        flexShrink: 0,
                        overflowY: 'auto',
                        borderRight: `1px solid ${theme.border}`,
                        padding: '4px 0',
                    }}
                    onContextMenu={backgroundMenu}
                >
                    <FolderTreeRow
                        folder={rootFolder}
                        depth={0}
                        currentPath={searching ? '\0' : openPath}
                        collapsed={collapsed}
                        onToggle={toggleFolder}
                        onOpen={openFolder}
                        onContextMenu={folderMenu}
                    />
                </div>
                <div
                    style={{flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column'}}
                    onClick={() => setSelectedKey(null)}
                    onContextMenu={backgroundMenu}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '5px 12px',
                            fontSize: 12,
                            color: theme.textDim,
                            borderBottom: `1px solid ${theme.border}`,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                        }}
                    >
                        {searching ? (
                            <span>
                                {results.length} result(s) for “{query.trim()}”
                            </span>
                        ) : (
                            crumbs.map((path, i) => (
                                <React.Fragment key={path || 'root'}>
                                    {i > 0 && <span style={{opacity: 0.5}}>/</span>}
                                    <span
                                        className="qe-hover-bg"
                                        style={{
                                            padding: '1px 4px',
                                            borderRadius: 4,
                                            cursor: 'pointer',
                                            color: i === crumbs.length - 1 ? theme.text : theme.textDim,
                                        }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openFolder(path);
                                        }}
                                    >
                                        {folderName(path)}
                                    </span>
                                </React.Fragment>
                            ))
                        )}
                    </div>
                    <div style={{flex: 1, minHeight: 0, overflowY: 'auto', padding: 8}}>
                        {assets.length === 0 && !isLoading ? (
                            <div style={{padding: '4px 6px', fontSize: 12, color: theme.textDim, lineHeight: 1.5}}>
                                No assets yet. <strong>Import effect</strong> or <strong>Import folder</strong> — then
                                drag an effect into the viewport as many times as you need.
                            </div>
                        ) : gridItems.length === 0 ? (
                            <div style={{padding: '4px 6px', fontSize: 12, color: theme.textDim}}>
                                {searching ? 'No matches.' : 'This folder is empty.'}
                            </div>
                        ) : (
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: `repeat(auto-fill, minmax(${TILE_WIDTH}px, 1fr))`,
                                    gap: 6,
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {gridItems}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />}
        </div>
    );
}
