import type {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import type {ParticleSystem} from 'babylon.quarks';
import React, {useState} from 'react';
import type {EffectBinding} from '../../core/binding.js';
import {EffectEditor, type EffectEditorProps} from '../EffectEditor.js';
import {PromptDialog} from '../PromptDialog.js';
import {buttonStyle, theme} from '../theme.js';
import {INSPECTOR_WIDTH} from './hostStyles.js';

/**
 * The effect's JSON, with a warning when it points at object URLs: a texture
 * dropped in from disk lives at a `blob:` URL that dies with the page, so the
 * exported effect would load without it.
 */
export function exportEffectJSON(binding: EffectBinding, warn: (message: string) => void): string {
    const json = binding.exportJSON('EditorEffect');
    if (json.includes('"blob:')) {
        warn(
            'This effect references blob: textures, which will not load after a reload. Re-pick them from a hosted URL.'
        );
    }
    return json;
}

/** Props of {@link InspectorSidebar}. */
export interface InspectorSidebarProps extends Pick<
    EffectEditorProps,
    'textureOptions' | 'geometryOptions' | 'resolveTexture' | 'resolveGeometry'
> {
    /** The focused effect, for the header and its actions. */
    binding: EffectBinding | null;
    /** The binding, system and node the inspector shows (they may lag a selection change). */
    inspector: {binding: EffectBinding; system: ParticleSystem; node: TransformNode} | null;
    /** Header shown when the effect has no name. */
    title?: string;
    /** Called after the effect is renamed. */
    onRenamed(name: string): void;
    /** Shows a Save button that receives the effect's JSON. */
    onSave?: (json: string) => void;
    /** A short notice. */
    toast(text: string): void;
}

/** The editor's right column: the effect's name, Export and Save, and the module inspector. */
export function InspectorSidebar(props: InspectorSidebarProps): React.ReactElement {
    const {binding, inspector, onSave} = props;
    const [renaming, setRenaming] = useState(false);
    return (
        <aside
            style={{
                width: INSPECTOR_WIDTH,
                flexShrink: 0,
                borderLeft: `1px solid ${theme.border}`,
                background: theme.panelBg,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
            }}
        >
            <div style={{padding: '12px 14px 10px', borderBottom: `1px solid ${theme.border}`}}>
                <div
                    style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: theme.textDim,
                        textTransform: 'uppercase',
                        letterSpacing: 0.4,
                        marginBottom: 6,
                    }}
                >
                    Inspector
                </div>
                <div
                    className="qe-hover-bg"
                    title={binding ? 'Rename effect' : undefined}
                    style={{
                        fontSize: 16,
                        fontWeight: 600,
                        cursor: binding ? 'pointer' : 'default',
                        borderRadius: 6,
                        padding: '2px 4px',
                        margin: '-2px -4px',
                    }}
                    onClick={() => binding && setRenaming(true)}
                >
                    {(binding?.root.name || props.title) ?? 'Effect editor'}
                </div>
                {renaming && binding && (
                    <PromptDialog
                        title="Rename effect"
                        defaultValue={binding.root.name}
                        onSubmit={(name) => {
                            binding.apply(() => (binding.root.name = name));
                            props.onRenamed(name);
                            setRenaming(false);
                        }}
                        onCancel={() => setRenaming(false)}
                    />
                )}
                <div style={{display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10}}>
                    <button
                        className="qe-hover"
                        style={buttonStyle}
                        disabled={!binding}
                        onClick={() => {
                            if (!binding) return;
                            const blob = new Blob([exportEffectJSON(binding, props.toast)], {type: 'application/json'});
                            const link = document.createElement('a');
                            link.href = URL.createObjectURL(blob);
                            link.download = `${binding.root.name || 'effect'}.json`;
                            link.click();
                            URL.revokeObjectURL(link.href);
                        }}
                    >
                        Export
                    </button>
                    {onSave && (
                        <button
                            className="qe-hover"
                            style={buttonStyle}
                            disabled={!binding}
                            onClick={() => binding && onSave(exportEffectJSON(binding, props.toast))}
                        >
                            Save
                        </button>
                    )}
                </div>
            </div>
            <div style={{flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 14px 20px'}}>
                {inspector ? (
                    <EffectEditor
                        binding={inspector.binding}
                        selectedSystem={inspector.system}
                        gizmoTargetNode={inspector.node}
                        gizmoTargetLabel={inspector.node.name || 'Node'}
                        textureOptions={props.textureOptions}
                        geometryOptions={props.geometryOptions}
                        resolveTexture={props.resolveTexture}
                        resolveGeometry={props.resolveGeometry}
                    />
                ) : (
                    <div style={{fontSize: 13, color: theme.textDim, lineHeight: 1.5}}>No effect selected.</div>
                )}
            </div>
        </aside>
    );
}
