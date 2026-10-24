/**
 * The editor's headless session: scene, camera, gizmos, history, scene entries, assets, prefab
 * mode and project save/load, without React. It builds the whole viewport (grid, gizmos, markers),
 * so it has its own entry point and the UI-free `babylon.quarks-editor` entry stays light.
 *
 * @packageDocumentation
 */
export {createEditorSession} from './core/editorSession.js';
export type {
    EditorFrameStats,
    EditorProject,
    EditorSession,
    EditorSessionOptions,
    EditorSessionView,
    EffectEditorHostHandle,
    PrefabInfo,
} from './core/editorSession.js';
// The types the session's own signatures use, so a host can name them from this entry point too.
export type {AssetLoadProgress, EffectAsset} from './core/assets.js';
export type {AssetDragPayload} from './core/assetTree.js';
export type {EditorListener, EffectBinding} from './core/binding.js';
export type {EffectTreeNode} from './core/effectTree.js';
export type {EffectHistory, HistoryStacks} from './core/history.js';
export type {PlaybackState} from './core/playback.js';
export type {
    ProjectMeta,
    ProjectStore,
    StorageEstimate,
    StoredAsset,
    StoredScene,
    StoredSceneEntry,
} from './core/projectStore.js';
export type {SceneEntry} from './core/sceneEntries.js';
