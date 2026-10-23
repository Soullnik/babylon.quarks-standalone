import React, {useEffect, useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {IndexedDbProjectStore} from '../core/indexedDbProjectStore.js';
import type {ProjectMeta, ProjectStore} from '../core/projectStore.js';
import {EffectEditorHost, type EffectEditorHostProps} from './EffectEditorHost.js';
import {ProjectsPage} from './ProjectsPage.js';
import {theme} from './theme.js';

/** Props of {@link EditorWorkspace}: the editor's, plus where projects live. */
export interface EditorWorkspaceProps extends Omit<EffectEditorHostProps, 'project' | 'onExitProject' | 'effectJson'> {
    /** Where projects are kept; defaults to the browser's IndexedDB. */
    store?: ProjectStore;
    /** Project to open right away (e.g. from the url); the projects page is shown otherwise. */
    projectId?: string | null;
    /** Called when a project is opened or closed — e.g. to mirror it in the url. */
    onProjectChange?: (projectId: string | null) => void;
}

/** Projects page → editor for the chosen project, with assets and scene saved in `store`. */
export function EditorWorkspace(props: EditorWorkspaceProps): React.ReactElement {
    const {store: storeProp, projectId, onProjectChange, ...hostProps} = props;
    const store = useMemo(() => storeProp ?? new IndexedDbProjectStore(), [storeProp]);
    const [project, setProject] = useState<ProjectMeta | null>(null);
    const [resolving, setResolving] = useState(Boolean(projectId));

    useEffect(() => {
        if (!projectId) {
            setResolving(false);
            return;
        }
        let cancelled = false;
        void store.getProject(projectId).then((meta) => {
            if (cancelled) return;
            setProject(meta);
            setResolving(false);
            if (!meta) onProjectChange?.(null);
        });
        return () => {
            cancelled = true;
        };
        // Only the initial project id is honoured; later navigation goes through onProjectChange.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store]);

    if (resolving) {
        return (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    background: '#070b16',
                    color: theme.textDim,
                    fontFamily: theme.font,
                    padding: 24,
                }}
            >
                Opening project…
            </div>
        );
    }

    if (!project) {
        return (
            <ProjectsPage
                store={store}
                title={hostProps.title}
                backLink={hostProps.backLink}
                onOpen={(meta) => {
                    setProject(meta);
                    onProjectChange?.(meta.id);
                }}
            />
        );
    }

    return (
        <EffectEditorHost
            key={project.id}
            {...hostProps}
            project={{store, id: project.id, name: project.name}}
            onExitProject={() => {
                setProject(null);
                onProjectChange?.(null);
            }}
        />
    );
}

/** Imperative entry point, like QuarksEffectEditor.Show, for the project-based workspace. */
export const QuarksEditorWorkspace = {
    /**
     * Mounts an {@link EditorWorkspace} into `hostElement`.
     *
     * @returns A handle whose `dispose()` unmounts it.
     */
    Show(options: EditorWorkspaceProps & {hostElement: HTMLElement}): {
        /** Unmounts the workspace. */
        dispose: () => void;
    } {
        const {hostElement, ...props} = options;
        const root = createRoot(hostElement);
        root.render(<EditorWorkspace {...props} />);
        return {dispose: () => root.unmount()};
    },
};
