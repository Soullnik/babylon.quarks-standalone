import React from 'react';
import type {ParticleSystem} from 'babylon.quarks';
import {EffectBinding} from '../core/binding';
import {createChildSystem} from '../core/systems';
import {theme} from './theme';

/**
 * Unity-style effect hierarchy: root system + child systems. Selecting a row points
 * the module stack at that system.
 */
export function EffectHierarchy(props: {
    binding: EffectBinding;
    selectedIndex: number;
    onSelect: (index: number) => void;
}) {
    const {binding, selectedIndex, onSelect} = props;
    const systems: ParticleSystem[] = [binding.system, ...binding.subSystems];

    const rowStyle = (index: number): React.CSSProperties => ({
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 8px',
        paddingLeft: index === 0 ? 8 : 22,
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 12.5,
        color: index === selectedIndex ? theme.text : theme.textDim,
        background: index === selectedIndex ? 'rgba(60, 105, 209, 0.3)' : 'transparent',
    });

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
            {systems.map((system, index) => (
                <div key={index} style={rowStyle(index)} onClick={() => onSelect(index)}>
                    <span style={{color: theme.accent, fontSize: 10}}>{index === 0 ? '◆' : '◇'}</span>
                    <span style={{flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                        {system.emitter.name || (index === 0 ? 'root' : `system ${index}`)}
                        {system.onlyUsedByOther ? ' (sub)' : ''}
                    </span>
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
                    {index > 0 && (
                        <button
                            title="Remove system"
                            style={{background: 'none', border: 'none', color: '#e08c8c', cursor: 'pointer', fontSize: 12, padding: 0}}
                            onClick={(e) => {
                                e.stopPropagation();
                                binding.apply((root) => {
                                    root._renderer?.deleteSystem(system);
                                    system.dispose();
                                });
                                binding.removeSubSystem(system);
                                onSelect(0);
                            }}
                        >
                            ✕
                        </button>
                    )}
                </div>
            ))}
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
                    binding.apply((root) => {
                        const child = createChildSystem(root, {name: `system ${binding.subSystems.length + 1}`});
                        root._renderer?.addSystem(child);
                        binding.addSubSystem(child);
                    });
                    onSelect(binding.subSystems.length);
                }}
            >
                + Add system
            </button>
        </section>
    );
}
