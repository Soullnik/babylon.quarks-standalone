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
