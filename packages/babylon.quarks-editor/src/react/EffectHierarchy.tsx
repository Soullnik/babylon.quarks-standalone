import React from 'react';
import type {ParticleSystem} from 'babylon.quarks';
import {EffectBinding} from '../core/binding';
import {collectSystems} from '../core/effectTree';
import type {EffectTreeNode} from '../core/effectTree';
import {createChildSystem, unlinkSubEmitterReferences} from '../core/systems';
import {theme} from './theme';

const iconButton: React.CSSProperties = {background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: 0};

/** Disposes the given systems, first unlinking any sub-emitter behaviors that target them. */
function removeSystems(binding: EffectBinding, targets: ParticleSystem[], onSelect: (system: ParticleSystem) => void) {
    const removable = targets.filter((system) => binding.subSystems.includes(system));
    if (removable.length === 0) {
        return;
    }
    binding.apply(() => {
        unlinkSubEmitterReferences([binding.system, ...binding.subSystems], removable);
        for (const system of removable) {
            system._renderer?.deleteSystem(system);
            system.dispose();
        }
    });
    for (const system of removable) {
        binding.removeSubSystem(system);
    }
    onSelect(binding.system);
}

/**
 * Unity-style effect hierarchy: the loaded group/emitter tree. Selecting an emitter row
 * points the module stack at that system; groups are organizational containers.
 */
export function EffectHierarchy(props: {
    binding: EffectBinding;
    selectedSystem: ParticleSystem;
    onSelect: (system: ParticleSystem) => void;
}) {
    const {binding, selectedSystem, onSelect} = props;
    const tree = binding.getTree();

    return (
        <section
            style={{
                border: `1px solid ${theme.border}`,
                borderRadius: 10,
                background: theme.sectionBg,
                marginTop: 8,
                padding: 6,
            }}
        >
            <TreeRow node={tree} binding={binding} selectedSystem={selectedSystem} onSelect={onSelect} />
            <button
                style={{
                    marginTop: 4,
                    width: '100%',
                    background: 'none',
                    border: `1px dashed #34477f`,
                    color: theme.accent,
                    borderRadius: 6,
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontSize: 12,
                }}
                onClick={() => {
                    // New systems nest under the current selection (Unity: child of the selected effect).
                    let created: ParticleSystem | undefined;
                    binding.apply(() => {
                        created = createChildSystem(selectedSystem, {name: `system ${binding.subSystems.length + 1}`});
                        binding.system._renderer?.addSystem(created);
                    });
                    if (created) {
                        binding.addSubSystem(created);
                        onSelect(created);
                    }
                }}
            >
                + Add system
            </button>
        </section>
    );
}

function TreeRow(props: {
    node: EffectTreeNode;
    binding: EffectBinding;
    selectedSystem: ParticleSystem;
    onSelect: (system: ParticleSystem) => void;
}): React.ReactElement {
    const {node, binding, selectedSystem, onSelect} = props;
    const system = node.system;
    const selected = system === selectedSystem;
    const isRoot = node.node === binding.root;

    const rowStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 8px',
        paddingLeft: 8 + node.depth * 14,
        borderRadius: 6,
        cursor: system ? 'pointer' : 'default',
        fontSize: 12.5,
        color: selected ? theme.text : theme.textDim,
        background: selected ? 'rgba(60, 105, 209, 0.3)' : 'transparent',
    };

    const rename = () => {
        const name = window.prompt('Name', node.name);
        if (name) {
            binding.apply(() => (node.node.name = name));
        }
    };

    return (
        <>
            <div style={rowStyle} onClick={() => system && onSelect(system)}>
                <span style={{color: theme.accent, fontSize: 10, width: 10}}>{system ? '◆' : '▸'}</span>
                <span style={{flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                    {node.name}
                    {system?.onlyUsedByOther ? ' (sub)' : ''}
                </span>
                {!isRoot && (
                    <button title="Rename" style={{...iconButton, color: theme.textDim}} onClick={(e) => {
                        e.stopPropagation();
                        rename();
                    }}>
                        ✎
                    </button>
                )}
                {/* Emitter removal (#1: unlink referencing sub-emitters first). */}
                {system && !isRoot && binding.subSystems.includes(system) && (
                    <button
                        title="Remove system"
                        style={{...iconButton, color: '#e08c8c', fontSize: 12}}
                        onClick={(e) => {
                            e.stopPropagation();
                            removeSystems(binding, [system], onSelect);
                        }}
                    >
                        ✕
                    </button>
                )}
                {/* Group removal (#6: tear down every emitter beneath it, then the group node). */}
                {!system && !isRoot && (
                    <button
                        title="Remove group"
                        style={{...iconButton, color: '#e08c8c', fontSize: 12}}
                        onClick={(e) => {
                            e.stopPropagation();
                            removeSystems(binding, collectSystems(node), onSelect);
                            binding.apply(() => node.node.dispose(true, false));
                        }}
                    >
                        ✕
                    </button>
                )}
            </div>
            {node.children.map((child, i) => (
                <TreeRow key={i} node={child} binding={binding} selectedSystem={selectedSystem} onSelect={onSelect} />
            ))}
        </>
    );
}
