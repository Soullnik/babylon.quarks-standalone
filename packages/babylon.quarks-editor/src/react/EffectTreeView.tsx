import type {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {ChevronDownIcon, ChevronRightIcon, FolderIcon, SparklesIcon} from '@heroicons/react/24/solid';
import React, {useState} from 'react';
import {buildEffectTree, type EffectTreeNode} from '../core/effectTree.js';
import {iconStyle} from './icons.js';
import {theme} from './theme.js';

/** Props of {@link EffectTreeView}. */
export interface EffectTreeViewProps {
    /** The effect's root. */
    root: TransformNode;
    /** Node shown in the inspector (and moved by the gizmo). */
    selectedNode: TransformNode | null;
    /** Selects a group or emitter. */
    onSelect: (node: TransformNode) => void;
    /** Show the root itself as the first row (default: only its descendants). */
    includeRoot?: boolean;
    /** Left indent of the first level, in px. */
    indent?: number;
}

const ROW_HEIGHT = 26;

function TreeRow(props: {
    item: EffectTreeNode;
    level: number;
    indent: number;
    selectedNode: TransformNode | null;
    collapsed: ReadonlySet<TransformNode>;
    onToggle: (node: TransformNode) => void;
    onSelect: (node: TransformNode) => void;
}): React.ReactElement {
    const {item, level, indent, selectedNode, collapsed, onToggle, onSelect} = props;
    const open = !collapsed.has(item.node);
    const selected = item.node === selectedNode;
    const hasChildren = item.children.length > 0;
    return (
        <>
            <div
                className="qe-hover-bg"
                title={item.system ? `${item.name} — particle system` : `${item.name} — group`}
                onClick={() => onSelect(item.node)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    height: ROW_HEIGHT,
                    padding: `0 8px 0 ${indent + level * 14}px`,
                    fontSize: 12,
                    cursor: 'pointer',
                    color: selected ? theme.text : theme.textDim,
                    background: selected ? 'rgba(120, 165, 255, 0.2)' : undefined,
                }}
            >
                <span
                    style={{width: 12, display: 'inline-flex', visibility: hasChildren ? 'visible' : 'hidden'}}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggle(item.node);
                    }}
                >
                    {open ? <ChevronDownIcon style={iconStyle(11)} /> : <ChevronRightIcon style={iconStyle(11)} />}
                </span>
                <span style={{display: 'inline-flex', color: item.system ? theme.accent : theme.textDim}}>
                    {item.system ? <SparklesIcon style={iconStyle(12)} /> : <FolderIcon style={iconStyle(12)} />}
                </span>
                <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{item.name}</span>
                {item.system?.looping && (
                    <span title="Looping" style={{flexShrink: 0, fontSize: 10.5}}>
                        ⟳
                    </span>
                )}
            </div>
            {open &&
                item.children.map((child) => (
                    <TreeRow key={child.node.uniqueId} {...props} item={child} level={level + 1} />
                ))}
        </>
    );
}

/**
 * The effect's group/emitter hierarchy — the same tree as the timeline's label column — so a
 * sub-emitter can be picked for the inspector without opening the timeline.
 */
export function EffectTreeView(props: EffectTreeViewProps): React.ReactElement | null {
    const {root, selectedNode, onSelect, includeRoot = false, indent = 8} = props;
    const [collapsed, setCollapsed] = useState<Set<TransformNode>>(() => new Set());
    if (root.isDisposed()) {
        return null;
    }
    const tree = buildEffectTree(root);
    const items = includeRoot ? [tree] : tree.children;
    const toggle = (node: TransformNode) =>
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(node)) {
                next.delete(node);
            } else {
                next.add(node);
            }
            return next;
        });
    return (
        <div>
            {items.map((item) => (
                <TreeRow
                    key={item.node.uniqueId}
                    item={item}
                    level={0}
                    indent={indent}
                    selectedNode={selectedNode}
                    collapsed={collapsed}
                    onToggle={toggle}
                    onSelect={onSelect}
                />
            ))}
        </div>
    );
}
