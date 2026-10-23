import React from 'react';
import type {EditorSession, PrefabInfo} from '../../core/editorSession.js';
import type {SceneEntry} from '../../core/sceneEntries.js';
import {ChoiceDialog} from '../ChoiceDialog.js';
import {MessageDialog} from '../MessageDialog.js';
import {PromptDialog} from '../PromptDialog.js';
import {theme} from '../theme.js';

/** Which prefab question is open: overwrite on save, save before leaving, or a new asset path. */
export type PrefabDialog = 'overwrite' | 'exit' | 'saveAs' | null;

/** The host's dialog and notice state, with its setters. */
export interface HostDialogState {
    /** Name of the project being opened, while it loads. */
    loadingProject: string | null;
    /** The short notice shown, if any. */
    toast: string | null;
    /** Entry being saved as a new asset. */
    saveAsTarget: SceneEntry | null;
    setSaveAsTarget(entry: SceneEntry | null): void;
    /** The open prefab, if any. */
    prefabInfo: PrefabInfo | null;
    /** The open prefab question. */
    prefabDialog: PrefabDialog;
    setPrefabDialog(dialog: PrefabDialog): void;
    /** Asset waiting to replace an open prefab that has unsaved edits. */
    prefabSwitch: {id: number; name: string} | null;
    setPrefabSwitch(asset: {id: number; name: string} | null): void;
    /** "Save changes to the scene?" before leaving the project. */
    exitPrompt: boolean;
    setExitPrompt(open: boolean): void;
    /** The notice the user dismisses, if any. */
    message: {title: string; message: string} | null;
    setMessage(message: {title: string; message: string} | null): void;
}

/** Props of {@link HostDialogs}. */
export interface HostDialogsProps extends HostDialogState {
    /** The session the dialogs act on. */
    session: EditorSession | null;
    /** Leaves the project, once the scene is dealt with. */
    onExitProject?: () => void;
}

/** The host's modal dialogs, the project loading screen and the toast. */
export function HostDialogs(props: HostDialogsProps): React.ReactElement {
    const {session, prefabInfo, prefabDialog, setPrefabDialog, prefabSwitch, setPrefabSwitch} = props;
    return (
        <>
            {props.loadingProject !== null && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(7, 11, 22, 0.8)',
                        zIndex: 900,
                        color: theme.text,
                        fontSize: 14,
                    }}
                >
                    Opening {props.loadingProject}…
                </div>
            )}
            {props.toast && (
                <div
                    role="status"
                    style={{
                        position: 'fixed',
                        top: 16,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 950,
                        background: '#13204a',
                        border: `1px solid ${theme.borderActive}`,
                        borderRadius: 8,
                        padding: '8px 14px',
                        fontSize: 12.5,
                        color: theme.text,
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                        pointerEvents: 'none',
                    }}
                >
                    {props.toast}
                </div>
            )}
            {props.saveAsTarget && (
                <PromptDialog
                    title="Save as new asset — Folder/Name"
                    defaultValue={props.saveAsTarget.name}
                    placeholder="Fire/Big explosion"
                    confirmLabel="Save"
                    onSubmit={(path) => {
                        const entry = props.saveAsTarget!;
                        props.setSaveAsTarget(null);
                        session?.saveEntryAsAsset(entry, path);
                    }}
                    onCancel={() => props.setSaveAsTarget(null)}
                />
            )}
            {prefabDialog === 'overwrite' && prefabInfo && (
                <ChoiceDialog
                    title={`Overwrite prefab “${prefabInfo.name}”?`}
                    message={(() => {
                        const count = session?.prefabInstanceCount() ?? 0;
                        return count > 0
                            ? `The asset is replaced with your edits. The ${count} “${prefabInfo.name}” effect(s) already in the scene will not change.`
                            : 'The asset is replaced with your edits. Effects already in the scene will not change.';
                    })()}
                    actions={[
                        {label: 'Cancel', onSelect: () => setPrefabDialog(null)},
                        {label: 'Save as new…', onSelect: () => setPrefabDialog('saveAs')},
                        {
                            label: 'Overwrite',
                            primary: true,
                            onSelect: () => {
                                setPrefabDialog(null);
                                session?.overwritePrefab();
                            },
                        },
                    ]}
                    onCancel={() => setPrefabDialog(null)}
                />
            )}
            {prefabSwitch && prefabInfo && (
                <ChoiceDialog
                    title={`Save changes to prefab “${prefabInfo.name}”?`}
                    message={`Before opening “${prefabSwitch.name}”. Saving overwrites the prefab asset; effects already in the scene will not change.`}
                    actions={[
                        {label: 'Cancel', onSelect: () => setPrefabSwitch(null)},
                        {
                            label: "Don't save",
                            danger: true,
                            onSelect: () => {
                                setPrefabSwitch(null);
                                session?.openPrefab(prefabSwitch.id, true);
                            },
                        },
                        {
                            label: 'Save',
                            primary: true,
                            onSelect: () => {
                                setPrefabSwitch(null);
                                session?.overwritePrefab();
                                session?.openPrefab(prefabSwitch.id, true);
                            },
                        },
                    ]}
                    onCancel={() => setPrefabSwitch(null)}
                />
            )}
            {prefabDialog === 'exit' && prefabInfo && (
                <ChoiceDialog
                    title={`Save changes to prefab “${prefabInfo.name}”?`}
                    message="Saving overwrites the prefab asset. Effects already in the scene will not change."
                    actions={[
                        {label: 'Cancel', onSelect: () => setPrefabDialog(null)},
                        {
                            label: "Don't save",
                            danger: true,
                            onSelect: () => {
                                setPrefabDialog(null);
                                session?.closePrefab();
                            },
                        },
                        {
                            label: 'Save',
                            primary: true,
                            onSelect: () => {
                                setPrefabDialog(null);
                                session?.overwritePrefab();
                                session?.closePrefab();
                            },
                        },
                    ]}
                    onCancel={() => setPrefabDialog(null)}
                />
            )}
            {prefabDialog === 'saveAs' && prefabInfo && (
                <PromptDialog
                    title="Save prefab as new asset — Folder/Name"
                    defaultValue={prefabInfo.path.replace(/\.json$/i, '')}
                    confirmLabel="Save"
                    onSubmit={(path) => {
                        setPrefabDialog(null);
                        session?.savePrefabAsNew(path);
                    }}
                    onCancel={() => setPrefabDialog(null)}
                />
            )}
            {props.exitPrompt && (
                <ChoiceDialog
                    title="Save changes to the scene?"
                    message="The scene has changes that are not saved. Assets are already saved."
                    actions={[
                        {label: 'Cancel', onSelect: () => props.setExitPrompt(false)},
                        {
                            label: "Don't save",
                            danger: true,
                            onSelect: () => {
                                props.setExitPrompt(false);
                                props.onExitProject?.();
                            },
                        },
                        {
                            label: 'Save',
                            primary: true,
                            onSelect: () => {
                                props.setExitPrompt(false);
                                void session?.saveScene().then((saved) => saved && props.onExitProject?.());
                            },
                        },
                    ]}
                    onCancel={() => props.setExitPrompt(false)}
                />
            )}
            {props.message && (
                <MessageDialog
                    title={props.message.title}
                    message={props.message.message}
                    onClose={() => props.setMessage(null)}
                />
            )}
        </>
    );
}
