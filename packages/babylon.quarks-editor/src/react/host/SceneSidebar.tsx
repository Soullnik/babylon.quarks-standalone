import type {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {ArrowLeftIcon} from '@heroicons/react/24/solid';
import React from 'react';
import type {PrefabInfo} from '../../core/editorSession.js';
import type {SceneEntry} from '../../core/sceneEntries.js';
import {EffectTreeView} from '../EffectTreeView.js';
import {iconStyle} from '../icons.js';
import {ScenePanel} from '../ScenePanel.js';
import {buttonStyle, theme} from '../theme.js';
import {dockIconButtonStyle, saveButtonStyle, SCENE_PANEL_WIDTH} from './hostStyles.js';

/** Props of {@link SceneSidebar}. */
export interface SceneSidebarProps {
    /** The open project, for its header; none in memory-only mode. */
    projectName?: string;
    /** Shows the back button in the project header. */
    canExitProject: boolean;
    /** The scene has unsaved changes. */
    sceneDirty: boolean;
    /** The project's scene is still loading. */
    projectLoading: boolean;
    /** The open prefab, if any. */
    prefabInfo: PrefabInfo | null;
    /** The open prefab has unsaved edits. */
    prefabDirty: boolean;
    /** The scene's entries. */
    entries: SceneEntry[];
    /** The focused entry's root. */
    focusedRoot: TransformNode | null;
    /** Shown entries, by root `uniqueId`. */
    visibleRootIds: ReadonlySet<number>;
    /** The entry shown alone, if any. */
    soloRootId: number | null;
    /** The node selected in the focused effect. */
    selectedNode: TransformNode | null;
    /** Back to the projects list. */
    onExitProject(): void;
    /** Save (the scene, or the open prefab). */
    onSave(): void;
    /** Back from the prefab to the scene. */
    onExitPrefab(): void;
    /** Save the open prefab. */
    onSavePrefab(): void;
    /** Focus an entry. */
    onFocus(entry: SceneEntry): void;
    /** Show or hide an entry. */
    onToggleVisible(entry: SceneEntry): void;
    /** Show an entry alone. */
    onToggleSolo(entry: SceneEntry): void;
    /** Save an entry as a new asset. */
    onSaveAsAsset(entry: SceneEntry): void;
    /** Remove an entry. */
    onDelete(entry: SceneEntry): void;
    /** Add a default effect. */
    onCreateDefault(): void;
    /** Select a node, focusing its entry first when needed. */
    onSelectNode(entry: SceneEntry | null, node: TransformNode): void;
}

/** The editor's left column: the project header, then the Scene list or the open prefab. */
export function SceneSidebar(props: SceneSidebarProps): React.ReactElement {
    const {prefabInfo, prefabDirty, entries} = props;
    return (
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
            {props.projectName !== undefined && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 10px',
                        borderBottom: `1px solid ${theme.border}`,
                    }}
                >
                    {props.canExitProject && (
                        <button
                            type="button"
                            className="qe-hover"
                            title="Back to projects"
                            style={{...dockIconButtonStyle, width: 26, height: 26}}
                            onClick={props.onExitProject}
                        >
                            <ArrowLeftIcon style={iconStyle(13)} />
                        </button>
                    )}
                    <span
                        title={props.projectName}
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
                        {props.projectName}
                        {props.sceneDirty ? ' *' : ''}
                    </span>
                    <button
                        type="button"
                        className="qe-hover"
                        title="Save the scene (Ctrl+S) — assets are not changed"
                        disabled={props.projectLoading}
                        style={saveButtonStyle(props.sceneDirty, '4px 12px')}
                        onClick={props.onSave}
                    >
                        Save
                    </button>
                </div>
            )}
            <div style={{padding: '12px 14px 10px', borderBottom: `1px solid ${theme.border}`}}>
                <div style={{fontSize: 14, fontWeight: 600}}>
                    {prefabInfo ? 'Prefab' : `Scene${entries.length > 0 ? ` · ${entries.length}` : ''}`}
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
                                Save (Ctrl+S) overwrites this asset. Effects already placed in the scene keep their own
                                copy and do not change.
                            </div>
                            <div style={{display: 'flex', gap: 6}}>
                                <button
                                    type="button"
                                    className="qe-hover"
                                    style={buttonStyle}
                                    onClick={props.onExitPrefab}
                                >
                                    ← Scene
                                </button>
                                <button
                                    type="button"
                                    className="qe-hover"
                                    style={buttonStyle}
                                    onClick={props.onSavePrefab}
                                >
                                    Save prefab
                                </button>
                            </div>
                        </div>
                        {entries[0] && (
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
                                    root={entries[0].root}
                                    selectedNode={props.selectedNode}
                                    onSelect={(node) => props.onSelectNode(null, node)}
                                />
                            </div>
                        )}
                    </div>
                ) : (
                    <ScenePanel
                        entries={entries}
                        focusedRoot={props.focusedRoot}
                        visibleRootIds={props.visibleRootIds}
                        onFocus={props.onFocus}
                        onToggleVisible={props.onToggleVisible}
                        soloRootId={props.soloRootId}
                        onToggleSolo={props.onToggleSolo}
                        onSaveAsAsset={props.onSaveAsAsset}
                        onDelete={props.onDelete}
                        onCreateDefault={props.onCreateDefault}
                        selectedNode={props.selectedNode}
                        onSelectNode={props.onSelectNode}
                    />
                )}
            </div>
        </aside>
    );
}
