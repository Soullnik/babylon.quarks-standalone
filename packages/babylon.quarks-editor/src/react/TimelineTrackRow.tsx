import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {
    CheckIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    EyeIcon,
    EyeSlashIcon,
    PencilSquareIcon,
    PlusIcon,
    SparklesIcon,
    SquaresPlusIcon,
    XMarkIcon,
} from '@heroicons/react/24/solid';
import type {ParticleSystem} from 'babylon.quarks';
import React, {useState} from 'react';
import type {EffectBinding} from '../core/binding';
import {buildEffectTree, collectSystems} from '../core/effectTree';
import {ungroupNode} from '../core/groups';
import {createChildSystem, removeSystems} from '../core/systems';
import type {TimelineRow} from '../core/timeline';
import {PromptDialog} from './PromptDialog';
import {iconStyle} from './icons';
import {theme} from './theme';

const iconButton: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
};

const ROW_HEIGHT = 28;

export interface TimelineTrackRowProps {
    row: TimelineRow;
    binding: EffectBinding;
    selected: boolean;
    onSelectNode: (node: TransformNode | null) => void;
    pxPerSecond: number;
    /** Matches the ruler's left gutter so bars line up under the correct tick. */
    offsetPx: number;
    collapsed: boolean;
    onToggleCollapse?: () => void;
    /** Preview-only visibility (toggles `system.emitter.visible`); lets you isolate one track. */
    hidden?: boolean;
    onToggleVisible?: () => void;
    /** Membership in the "group selected rows together" set (unrelated to inspector selection). */
    groupSelected: boolean;
    onToggleGroupSelect: () => void;
}

const checkboxButton: React.CSSProperties = {...iconButton, width: 12, height: 12};

/** One row of the timeline: a label cell (name + actions) and, for tracks, a bar cell. */
export function TimelineTrackRow(props: TimelineTrackRowProps): React.ReactElement {
    const {
        row,
        binding,
        selected,
        onSelectNode,
        pxPerSecond,
        offsetPx,
        collapsed,
        onToggleCollapse,
        hidden,
        onToggleVisible,
        groupSelected,
        onToggleGroupSelect,
    } = props;
    const [renaming, setRenaming] = useState(false);

    const isRoot = row.node === binding.root;

    const labelStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        height: ROW_HEIGHT,
        padding: '0 8px',
        paddingLeft: 8 + row.depth * 14,
        borderRadius: 6,
        cursor: row.kind === 'track' ? 'pointer' : onToggleCollapse ? 'pointer' : 'default',
        fontSize: 12.5,
        color: selected ? theme.text : theme.textDim,
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
        // Left unset (rather than 'transparent') when not selected so the .qe-row-bg hover
        // tint isn't shadowed by an inline background of the same property.
        ...(selected ? {background: 'rgba(60, 105, 209, 0.3)'} : {}),
    };

    if (row.kind === 'group') {
        return (
            <>
                <div
                    className="qe-hover-bg"
                    style={{...labelStyle, borderTop: `1px solid ${theme.border}`}}
                    onClick={() => onSelectNode(row.node)}
                >
                    {!isRoot && (
                        <button
                            className="qe-hover"
                            title={groupSelected ? 'Remove from group selection' : 'Select for grouping'}
                            style={{...checkboxButton, color: groupSelected ? theme.accent : theme.textDim}}
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleGroupSelect();
                            }}
                        >
                            {groupSelected ? (
                                <CheckIcon style={iconStyle(12)} />
                            ) : (
                                <span
                                    style={{
                                        width: 10,
                                        height: 10,
                                        border: `1px solid currentColor`,
                                        borderRadius: 2,
                                        display: 'block',
                                        boxSizing: 'border-box',
                                    }}
                                />
                            )}
                        </button>
                    )}
                    <span
                        className="qe-hover"
                        title={collapsed ? 'Expand' : 'Collapse'}
                        style={{color: theme.textDim, width: 12, cursor: 'pointer', display: 'inline-flex'}}
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleCollapse?.();
                        }}
                    >
                        {collapsed ? (
                            <ChevronRightIcon style={iconStyle(12)} />
                        ) : (
                            <ChevronDownIcon style={iconStyle(12)} />
                        )}
                    </span>
                    <span style={{flex: 1, overflow: 'hidden', textOverflow: 'ellipsis'}}>{row.name}</span>
                    <button
                        className="qe-hover"
                        title="Add system to this group"
                        style={{...iconButton, color: theme.accent}}
                        onClick={(e) => {
                            e.stopPropagation();
                            let created: ParticleSystem | undefined;
                            binding.apply(() => {
                                created = createChildSystem(binding.system, {
                                    name: `system ${binding.subSystems.length + 1}`,
                                    parentNode: row.node,
                                });
                                binding.system._renderer?.addSystem(created);
                            });
                            if (created) {
                                binding.addSubSystem(created);
                                onSelectNode(created.emitter);
                            }
                        }}
                    >
                        <PlusIcon style={iconStyle(13)} />
                    </button>
                    {!isRoot && (
                        <button
                            className="qe-hover"
                            title="Rename"
                            style={{...iconButton, color: theme.textDim}}
                            onClick={(e) => {
                                e.stopPropagation();
                                setRenaming(true);
                            }}
                        >
                            <PencilSquareIcon style={iconStyle(12)} />
                        </button>
                    )}
                    {!isRoot && (
                        <button
                            className="qe-hover"
                            title="Ungroup (moves its contents up a level)"
                            style={{...iconButton, color: theme.textDim}}
                            onClick={(e) => {
                                e.stopPropagation();
                                binding.apply(() => ungroupNode(row.node));
                            }}
                        >
                            <SquaresPlusIcon style={iconStyle(12)} />
                        </button>
                    )}
                    {!isRoot && (
                        <button
                            className="qe-hover"
                            title="Remove group"
                            style={{...iconButton, color: '#e08c8c'}}
                            onClick={(e) => {
                                e.stopPropagation();
                                removeSystems(binding, collectSystems(buildEffectTree(row.node)), (s) =>
                                    onSelectNode(s.emitter)
                                );
                                binding.apply(() => row.node.dispose(true, false));
                            }}
                        >
                            <XMarkIcon style={iconStyle(12)} />
                        </button>
                    )}
                </div>
                <div
                    className="qe-hover-bg"
                    style={{height: ROW_HEIGHT, borderTop: `1px solid ${theme.border}`}}
                    onClick={() => onSelectNode(row.node)}
                />
                {renaming && (
                    <PromptDialog
                        title="Rename"
                        defaultValue={row.name}
                        onSubmit={(name) => {
                            binding.apply(() => (row.node.name = name));
                            setRenaming(false);
                        }}
                        onCancel={() => setRenaming(false)}
                    />
                )}
            </>
        );
    }

    const {system} = row;
    const barLeft = offsetPx + row.startOffset * pxPerSecond;
    const barWidth = Math.max(2, row.duration * pxPerSecond);

    return (
        <>
            <div
                className="qe-hover-bg"
                style={{...labelStyle, opacity: hidden ? 0.5 : 1}}
                onClick={() => onSelectNode(row.node)}
            >
                {!isRoot && (
                    <button
                        className="qe-hover"
                        title={groupSelected ? 'Remove from group selection' : 'Select for grouping'}
                        style={{...checkboxButton, color: groupSelected ? theme.accent : theme.textDim}}
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleGroupSelect();
                        }}
                    >
                        {groupSelected ? (
                            <CheckIcon style={iconStyle(12)} />
                        ) : (
                            <span
                                style={{
                                    width: 10,
                                    height: 10,
                                    border: `1px solid currentColor`,
                                    borderRadius: 2,
                                    display: 'block',
                                    boxSizing: 'border-box',
                                }}
                            />
                        )}
                    </button>
                )}
                <button
                    className="qe-hover"
                    title={hidden ? 'Show in viewport' : 'Hide in viewport'}
                    style={{...iconButton, color: hidden ? theme.textDim : theme.accent}}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleVisible?.();
                    }}
                >
                    {hidden ? <EyeSlashIcon style={iconStyle(12)} /> : <EyeIcon style={iconStyle(12)} />}
                </button>
                <span style={{color: theme.accent, display: 'inline-flex'}}>
                    <SparklesIcon style={iconStyle(11)} />
                </span>
                <span style={{flex: 1, overflow: 'hidden', textOverflow: 'ellipsis'}}>
                    {row.name}
                    {system.onlyUsedByOther ? ' (sub)' : ''}
                </span>
                {!isRoot && (
                    <button
                        className="qe-hover"
                        title="Rename"
                        style={{...iconButton, color: theme.textDim}}
                        onClick={(e) => {
                            e.stopPropagation();
                            setRenaming(true);
                        }}
                    >
                        <PencilSquareIcon style={iconStyle(12)} />
                    </button>
                )}
                {!isRoot && row.removable && (
                    <button
                        className="qe-hover"
                        title="Remove system"
                        style={{...iconButton, color: '#e08c8c'}}
                        onClick={(e) => {
                            e.stopPropagation();
                            removeSystems(binding, [system], (s) => onSelectNode(s.emitter));
                        }}
                    >
                        <XMarkIcon style={iconStyle(12)} />
                    </button>
                )}
                {selected && (
                    <button
                        className="qe-hover"
                        title="Add child system"
                        style={{...iconButton, color: theme.accent}}
                        onClick={(e) => {
                            e.stopPropagation();
                            let created: ParticleSystem | undefined;
                            binding.apply(() => {
                                created = createChildSystem(system, {name: `system ${binding.subSystems.length + 1}`});
                                binding.system._renderer?.addSystem(created);
                            });
                            if (created) {
                                binding.addSubSystem(created);
                                onSelectNode(created.emitter);
                            }
                        }}
                    >
                        <PlusIcon style={iconStyle(13)} />
                    </button>
                )}
            </div>
            <div
                className="qe-hover-bg"
                style={{position: 'relative', height: ROW_HEIGHT}}
                onClick={() => onSelectNode(row.node)}
            >
                <div
                    className="qe-hover"
                    title={row.startOffsetVariable ? 'Start time varies per spawn' : undefined}
                    style={{
                        position: 'absolute',
                        left: barLeft,
                        width: barWidth,
                        top: 5,
                        height: ROW_HEIGHT - 10,
                        borderRadius: 4,
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                        background: system.onlyUsedByOther
                            ? 'repeating-linear-gradient(135deg, rgba(158,185,255,0.25), rgba(158,185,255,0.25) 4px, rgba(158,185,255,0.4) 4px, rgba(158,185,255,0.4) 8px)'
                            : selected
                              ? theme.accent
                              : '#3c5aa0',
                        border: system.onlyUsedByOther ? `1px dashed ${theme.accent}` : `1px solid ${theme.border}`,
                        opacity: hidden ? 0.3 : system.onlyUsedByOther ? 0.75 : 1,
                    }}
                >
                    {row.looping && (
                        <span style={{position: 'absolute', right: 4, top: -1, fontSize: 10, color: theme.text}}>
                            ⟳
                        </span>
                    )}
                </div>
            </div>
            {renaming && (
                <PromptDialog
                    title="Rename"
                    defaultValue={row.name}
                    onSubmit={(name) => {
                        binding.apply(() => (row.node.name = name));
                        setRenaming(false);
                    }}
                    onCancel={() => setRenaming(false)}
                />
            )}
        </>
    );
}
