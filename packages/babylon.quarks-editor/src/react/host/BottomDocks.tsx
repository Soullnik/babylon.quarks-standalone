import {ChevronDownIcon, ChevronUpIcon, MapPinIcon, XMarkIcon} from '@heroicons/react/24/solid';
import React from 'react';
import {AssetsPanel, type AssetsPanelProps} from '../AssetsPanel.js';
import {iconStyle} from '../icons.js';
import {buttonStyle, theme} from '../theme.js';
import {
    activeSquareButtonStyle,
    dockIconButtonStyle,
    dockTitleStyle,
    DRAWER_HEIGHT,
    TIMELINE_HEIGHT,
} from './hostStyles.js';

/** Props of {@link AssetsDrawer}. */
export interface AssetsDrawerProps {
    /** The drawer is shown. */
    open: boolean;
    /** The drawer is docked above the timeline instead of floating over the viewport. */
    pinned: boolean;
    /** Pin or unpin it (it stays open). */
    onTogglePin(): void;
    /** Close and unpin it. */
    onClose(): void;
    /** The Assets browser inside. */
    panel: AssetsPanelProps;
}

/** The Assets browser, floating over the viewport or pinned above the timeline. */
export function AssetsDrawer(props: AssetsDrawerProps): React.ReactElement {
    const {open, pinned} = props;
    return (
        <div
            aria-hidden={!open && !pinned}
            style={{
                height: DRAWER_HEIGHT,
                display: 'flex',
                flexDirection: 'column',
                background: theme.panelBg,
                borderTop: `1px solid ${theme.border}`,
                ...(pinned
                    ? {flexShrink: 0}
                    : {
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          bottom: 0,
                          zIndex: 20,
                          background: '#0a0f20',
                          boxShadow: '0 -10px 30px rgba(0, 0, 0, 0.5)',
                          transform: open ? 'none' : 'translateY(100%)',
                          opacity: open ? 1 : 0,
                          pointerEvents: open ? 'auto' : 'none',
                          transition: 'transform 0.18s ease, opacity 0.18s ease',
                      }),
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 6px 4px 12px',
                    borderBottom: `1px solid ${theme.border}`,
                }}
            >
                <span style={dockTitleStyle}>Assets</span>
                <span style={{fontSize: 11, color: theme.textDim}}>Ctrl+Space</span>
                <span style={{flex: 1}} />
                <button
                    type="button"
                    className="qe-hover"
                    title={pinned ? 'Unpin — float over the viewport again' : 'Pin — keep it docked above the timeline'}
                    style={{...dockIconButtonStyle, ...(pinned ? activeSquareButtonStyle : {})}}
                    onClick={props.onTogglePin}
                >
                    <MapPinIcon style={iconStyle(13)} />
                </button>
                <button
                    type="button"
                    className="qe-hover"
                    title="Close (Esc)"
                    style={dockIconButtonStyle}
                    onClick={props.onClose}
                >
                    <XMarkIcon style={iconStyle(13)} />
                </button>
            </div>
            <AssetsPanel {...props.panel} />
        </div>
    );
}

/** Props of {@link TimelineDock}. */
export interface TimelineDockProps {
    /** The timeline is collapsed to its header. */
    collapsed: boolean;
    /** Collapse or expand it. */
    onToggleCollapsed(): void;
    /** Name of the focused effect, if any. */
    effectName?: string;
    /** Assets in the project, counted on the Assets button. */
    assetCount: number;
    /** The Assets button shows as switched on. */
    assetsActive: boolean;
    /** The Assets button. */
    onToggleAssets(): void;
    /** The timeline, or `null` when nothing is focused. */
    children: React.ReactNode;
}

/** The bottom dock: the focused effect's timeline, and the Assets button. */
export function TimelineDock(props: TimelineDockProps): React.ReactElement {
    const {collapsed} = props;
    return (
        <div
            style={{
                flexShrink: 0,
                borderTop: `1px solid ${theme.border}`,
                background: theme.panelBg,
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <div style={{display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px'}}>
                <button
                    type="button"
                    className="qe-hover-bg"
                    title={collapsed ? 'Expand timeline' : 'Collapse timeline'}
                    style={{...dockIconButtonStyle, border: 'none', background: 'transparent'}}
                    onClick={props.onToggleCollapsed}
                >
                    {collapsed ? <ChevronUpIcon style={iconStyle(13)} /> : <ChevronDownIcon style={iconStyle(13)} />}
                </button>
                <span style={dockTitleStyle}>Timeline</span>
                {props.effectName !== undefined && (
                    <span
                        style={{
                            fontSize: 12,
                            color: theme.textDim,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {props.effectName}
                    </span>
                )}
                <span style={{flex: 1}} />
                <button
                    type="button"
                    className="qe-hover"
                    title="Assets (Ctrl+Space)"
                    style={{
                        ...buttonStyle,
                        padding: '3px 10px',
                        ...(props.assetsActive ? activeSquareButtonStyle : {}),
                    }}
                    onClick={props.onToggleAssets}
                >
                    Assets{props.assetCount > 0 ? ` · ${props.assetCount}` : ''}
                </button>
            </div>
            <div
                style={{
                    height: TIMELINE_HEIGHT,
                    display: collapsed ? 'none' : 'flex',
                    borderTop: `1px solid ${theme.border}`,
                }}
            >
                {props.children ?? (
                    <div style={{padding: '14px', fontSize: 12, color: theme.textDim}}>
                        Select an effect in the Scene to see its timeline.
                    </div>
                )}
            </div>
        </div>
    );
}
