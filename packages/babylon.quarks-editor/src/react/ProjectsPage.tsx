import {ArrowLeftIcon, FolderIcon, PlusIcon} from '@heroicons/react/24/solid';
import React, {useCallback, useEffect, useState} from 'react';
import {formatBytes, type ProjectMeta, type ProjectStore, type StorageEstimate} from '../core/projectStore.js';
import {ChoiceDialog} from './ChoiceDialog.js';
import {ContextMenu, type ContextMenuItem} from './ContextMenu.js';
import {iconStyle} from './icons.js';
import {PromptDialog} from './PromptDialog.js';
import {buttonStyle, globalEditorStyles, theme} from './theme.js';

export interface ProjectsPageProps {
    store: ProjectStore;
    onOpen: (project: ProjectMeta) => void;
    title?: string;
    /** Optional link back to the page that hosts the editor (e.g. a gallery), shown above the title. */
    backLink?: {href: string; label: string};
}

type Dialog =
    | {kind: 'create'}
    | {kind: 'rename'; project: ProjectMeta}
    | {kind: 'duplicate'; project: ProjectMeta}
    | {kind: 'delete'; project: ProjectMeta}
    | null;

function formatDate(time: number): string {
    return new Date(time).toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'});
}

function StorageBar(props: {estimate: StorageEstimate | null; onPersist: () => void}): React.ReactElement {
    const {estimate, onPersist} = props;
    const ratio = estimate?.usage != null && estimate.quota ? Math.min(1, estimate.usage / estimate.quota) : 0;
    return (
        <div
            style={{
                border: `1px solid ${theme.border}`,
                borderRadius: 10,
                background: theme.sectionBg,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
            }}
        >
            <div style={{display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5}}>
                <span style={{fontWeight: 600}}>Browser storage</span>
                <span style={{color: theme.textDim}}>
                    {estimate
                        ? `${formatBytes(estimate.usage)} used of ~${formatBytes(estimate.quota)} available`
                        : 'Checking…'}
                </span>
                <span style={{flex: 1}} />
                {estimate?.persisted ? (
                    <span style={{color: '#8fe3a8', fontSize: 12}}>✓ Persistent — the browser will not clear it</span>
                ) : (
                    <button
                        className="qe-hover"
                        style={{...buttonStyle, padding: '4px 10px'}}
                        title="Ask the browser not to clear project data when the disk runs low"
                        onClick={onPersist}
                    >
                        Make storage persistent
                    </button>
                )}
            </div>
            <div style={{height: 6, borderRadius: 3, background: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden'}}>
                <div
                    style={{
                        width: `${Math.max(ratio * 100, ratio > 0 ? 1 : 0)}%`,
                        height: '100%',
                        background: theme.accent,
                    }}
                />
            </div>
            <div style={{fontSize: 11.5, color: theme.textDim, lineHeight: 1.5}}>
                Projects are saved in this browser only (IndexedDB). Clearing site data removes them, and Safari deletes
                data of sites not opened for 7 days — export projects you care about.
            </div>
        </div>
    );
}

/** Start page: the projects saved in the store, plus storage usage. */
export function ProjectsPage(props: ProjectsPageProps): React.ReactElement {
    const {store, onOpen, title = 'Effect editor', backLink} = props;
    const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
    const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
    const [dialog, setDialog] = useState<Dialog>(null);
    const [menu, setMenu] = useState<{x: number; y: number; items: ContextMenuItem[]} | null>(null);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        try {
            const [list, storage] = await Promise.all([store.listProjects(), store.estimate()]);
            setProjects(list);
            setEstimate(storage);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setProjects([]);
        }
    }, [store]);

    useEffect(() => {
        void reload();
    }, [reload]);

    const run = (action: () => Promise<unknown>) => {
        setDialog(null);
        action()
            .then(reload)
            .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    };

    const projectMenu = (e: React.MouseEvent, project: ProjectMeta) => {
        e.preventDefault();
        setMenu({
            x: e.clientX,
            y: e.clientY,
            items: [
                {label: 'Open', onSelect: () => onOpen(project)},
                {label: 'Rename…', onSelect: () => setDialog({kind: 'rename', project})},
                {label: 'Duplicate…', onSelect: () => setDialog({kind: 'duplicate', project})},
                {label: 'Delete…', danger: true, onSelect: () => setDialog({kind: 'delete', project})},
            ],
        });
    };

    return (
        <div
            className="qe-root"
            style={{
                width: '100%',
                height: '100%',
                overflowY: 'auto',
                background: '#070b16',
                color: theme.text,
                fontFamily: theme.font,
            }}
        >
            <style>{globalEditorStyles}</style>
            <div
                style={{
                    maxWidth: 960,
                    margin: '0 auto',
                    padding: '32px 24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 18,
                }}
            >
                {backLink && (
                    <a
                        className="qe-hover"
                        href={backLink.href}
                        style={{
                            alignSelf: 'flex-start',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            background: theme.panelBg,
                            border: `1px solid ${theme.border}`,
                            borderRadius: 8,
                            padding: '6px 12px',
                            fontSize: 13,
                            fontWeight: 500,
                            color: theme.text,
                            textDecoration: 'none',
                        }}
                    >
                        <ArrowLeftIcon style={iconStyle(14)} />
                        {backLink.label.replace(/^←\s*/, '')}
                    </a>
                )}
                <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                    <div>
                        <div style={{fontSize: 22, fontWeight: 700}}>{title}</div>
                        <div style={{fontSize: 13, color: theme.textDim, marginTop: 4}}>
                            Projects keep their assets and scene between sessions.
                        </div>
                    </div>
                    <span style={{flex: 1}} />
                    <button
                        className="qe-hover"
                        style={{
                            ...buttonStyle,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '8px 14px',
                        }}
                        onClick={() => setDialog({kind: 'create'})}
                    >
                        <PlusIcon style={iconStyle(14)} /> New project
                    </button>
                </div>
                <StorageBar
                    estimate={estimate}
                    onPersist={() => {
                        void store.requestPersistence().then((granted) => {
                            if (!granted) {
                                setError(
                                    'The browser did not grant persistent storage. Chrome grants it more readily to sites you visit often or have bookmarked.'
                                );
                            }
                            return reload();
                        });
                    }}
                />
                {projects === null ? (
                    <div style={{color: theme.textDim, fontSize: 13}}>Loading projects…</div>
                ) : projects.length === 0 ? (
                    <div
                        style={{
                            border: `1px dashed ${theme.border}`,
                            borderRadius: 10,
                            padding: '36px 20px',
                            textAlign: 'center',
                            color: theme.textDim,
                            fontSize: 13,
                        }}
                    >
                        No projects yet. Create one to start building effects.
                    </div>
                ) : (
                    <div
                        style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12}}
                    >
                        {projects.map((project) => (
                            <button
                                key={project.id}
                                className="qe-hover"
                                title="Open · right-click for more"
                                onClick={() => onOpen(project)}
                                onContextMenu={(e) => projectMenu(e, project)}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'flex-start',
                                    gap: 6,
                                    textAlign: 'left',
                                    padding: 14,
                                    borderRadius: 10,
                                    border: `1px solid ${theme.border}`,
                                    background: theme.panelBg,
                                    color: theme.text,
                                    cursor: 'pointer',
                                    fontFamily: theme.font,
                                }}
                            >
                                <span
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        fontSize: 14,
                                        fontWeight: 600,
                                    }}
                                >
                                    <FolderIcon style={{...iconStyle(16), color: theme.accent}} />
                                    {project.name}
                                </span>
                                <span style={{fontSize: 12, color: theme.textDim}}>
                                    {project.assetCount} asset(s) · {formatBytes(project.sizeBytes)}
                                </span>
                                <span style={{fontSize: 11.5, color: theme.textDim}}>
                                    Edited {formatDate(project.updatedAt)}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
            {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
            {dialog?.kind === 'create' && (
                <PromptDialog
                    title="New project"
                    defaultValue="My effects"
                    confirmLabel="Create"
                    onSubmit={(name) => {
                        setDialog(null);
                        store
                            .createProject(name)
                            .then(onOpen)
                            .catch((err) => setError(err instanceof Error ? err.message : String(err)));
                    }}
                    onCancel={() => setDialog(null)}
                />
            )}
            {dialog?.kind === 'rename' && (
                <PromptDialog
                    title="Rename project"
                    defaultValue={dialog.project.name}
                    confirmLabel="Rename"
                    onSubmit={(name) => run(() => store.renameProject(dialog.project.id, name))}
                    onCancel={() => setDialog(null)}
                />
            )}
            {dialog?.kind === 'duplicate' && (
                <PromptDialog
                    title="Duplicate project"
                    defaultValue={`${dialog.project.name} copy`}
                    confirmLabel="Duplicate"
                    onSubmit={(name) => run(() => store.duplicateProject(dialog.project.id, name))}
                    onCancel={() => setDialog(null)}
                />
            )}
            {dialog?.kind === 'delete' && (
                <ChoiceDialog
                    title={`Delete “${dialog.project.name}”?`}
                    message={`Its ${dialog.project.assetCount} asset(s) and saved scene are removed from this browser. This cannot be undone.`}
                    actions={[
                        {label: 'Cancel', onSelect: () => setDialog(null)},
                        {
                            label: 'Delete',
                            danger: true,
                            onSelect: () => run(() => store.deleteProject(dialog.project.id)),
                        },
                    ]}
                    onCancel={() => setDialog(null)}
                />
            )}
            {error && (
                <ChoiceDialog
                    title="Projects"
                    message={error}
                    actions={[{label: 'OK', primary: true, onSelect: () => setError(null)}]}
                    onCancel={() => setError(null)}
                />
            )}
        </div>
    );
}
