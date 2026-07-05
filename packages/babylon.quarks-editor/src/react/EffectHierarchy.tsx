import React from 'react';
import type {ParticleSystem} from 'babylon.quarks';
import {EffectBinding} from '../core/binding';
import type {EffectTreeNode} from '../core/effectTree';
import {createChildSystem} from '../core/systems';
import {theme} from './theme';

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
                    let created: ParticleSystem | undefined;
                    binding.apply(() => {
                        created = createChildSystem(binding.system, {name: `system ${binding.subSystems.length + 1}`});
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

    return (
        <>
            <div style={rowStyle} onClick={() => system && onSelect(system)}>
                <span style={{color: theme.accent, fontSize: 10, width: 10}}>{system ? '◆' : '▸'}</span>
                <span style={{flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                    {node.name}
                    {system?.onlyUsedByOther ? ' (sub)' : ''}
                </span>
                {system && (
                    <button
                        title="Rename"
                        style={{background: 'none', border: 'none', color: theme.textDim, cursor: 'pointer', fontSize: 11, padding: 0}}
                        onClick={(e) => {
                            e.stopPropagation();
                            const name = window.prompt('System name', system.emitter.name);
                            if (name) {
                                binding.apply(() => (system.emitter.name = name));
                            }
                        }}
                    >
                        ✎
                    </button>
                )}
                {system && !isRoot && binding.subSystems.includes(system) && (
                    <button
                        title="Remove system"
                        style={{background: 'none', border: 'none', color: '#e08c8c', cursor: 'pointer', fontSize: 12, padding: 0}}
                        onClick={(e) => {
                            e.stopPropagation();
                            binding.apply(() => {
                                system._renderer?.deleteSystem(system);
                                system.dispose();
                            });
                            binding.removeSubSystem(system);
                            onSelect(binding.system);
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
