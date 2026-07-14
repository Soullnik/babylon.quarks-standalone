import React, {useMemo, useRef, useState} from 'react';
import {
    ArrowPathIcon,
    ForwardIcon,
    PauseIcon,
    PlayIcon,
    RectangleGroupIcon,
} from '@heroicons/react/24/solid';
import type {ParticleSystem} from 'babylon.quarks';
import type {Scene} from '@babylonjs/core/scene';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {EffectBinding} from '../core/binding';
import {
    clearFocusFinished,
    getFocusElapsed,
    isFocusFinished,
    markFocusFinished,
    setFocusElapsed,
    type PlaybackState,
} from '../core/playback';
import {groupNodes} from '../core/groups';
import {scrubFocusTo} from '../core/scrub';
import {computeTimelineRows, computeTimelineSpan} from '../core/timeline';
import {TimelineTrackRow} from './TimelineTrackRow';
import {iconStyle} from './icons';
import {buttonStyle, theme} from './theme';

export type {PlaybackState} from '../core/playback';

export interface TimelinePanelProps {
    binding: EffectBinding;
    selectedNode: TransformNode | null;
    onSelectNode: (node: TransformNode | null) => void;
    scene: Scene;
    playbackRef: React.MutableRefObject<PlaybackState>;
    playheadRef: React.RefObject<HTMLDivElement>;
    counterRef: React.RefObject<HTMLSpanElement>;
    stagePlaying: boolean;
    setStagePlaying: (playing: boolean) => void;
    speed: number;
    setSpeed: (speed: number) => void;
    /** False when a catalog entry is selected but not yet dropped into the viewport. */
    playbackEnabled?: boolean;
}

const LABEL_WIDTH = 200;
const RULER_HEIGHT = 22;
const STAGE_ROW_HEIGHT = 26;
const PANEL_HEIGHT = 220;
/** Small gap between the label column and the first pixel of the time axis. */
export const TIMELINE_INSET = 10;
/** Gap reserved at the right edge so the full-duration mark doesn't sit flush against the panel edge. */
const RIGHT_PADDING = 16;

function pickTickInterval(pxPerSecond: number): number {
    if (pxPerSecond >= 60) return 1;
    if (pxPerSecond >= 24) return 2;
    if (pxPerSecond >= 10) return 5;
    return 10;
}

/**
 * Bottom-docked timeline: stage Play/Pause drives all preview effects; playhead/scrub/restart
 * apply only to the focused effect without stopping other previews.
 */
export function TimelinePanel(props: TimelinePanelProps): React.ReactElement {
    const {binding, selectedNode, onSelectNode, scene, playbackRef, playheadRef, counterRef, stagePlaying, setStagePlaying, speed, setSpeed, playbackEnabled = true} = props;

    const [bodyWidthPx, setBodyWidthPx] = useState(600);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<TransformNode>>(() => new Set());
    const [hiddenSystems, setHiddenSystems] = useState<Set<ParticleSystem>>(() => new Set());
    const [groupSelection, setGroupSelection] = useState<Set<TransformNode>>(() => new Set());
    const bodyRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{raf: number | null; pendingTime: number | null}>({raf: null, pendingTime: null});

    const focusRootId = binding.root.uniqueId;

    React.useEffect(() => {
        setHiddenSystems(new Set());
        setGroupSelection(new Set());
    }, [binding]);

    const toggleGroupSelect = (node: TransformNode) => {
        setGroupSelection((prev) => {
            const next = new Set(prev);
            if (next.has(node)) {
                next.delete(node);
            } else {
                next.add(node);
            }
            return next;
        });
    };

    const groupSelectedNodes = () => {
        if (groupSelection.size < 2) {
            return;
        }
        const nodes = [...groupSelection];
        binding.apply(() => {
            groupNodes(nodes, `Group ${rows.filter((r) => r.kind === 'group').length + 1}`);
        });
        setGroupSelection(new Set());
    };

    const toggleVisible = (system: ParticleSystem) => {
        setHiddenSystems((prev) => {
            const next = new Set(prev);
            if (next.has(system)) {
                next.delete(system);
                system.emitter.visible = true;
            } else {
                next.add(system);
                system.emitter.visible = false;
            }
            return next;
        });
    };

    React.useLayoutEffect(() => {
        const el = bodyRef.current;
        if (!el) return;
        const observer = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width;
            if (width) setBodyWidthPx(Math.max(1, width - LABEL_WIDTH));
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const rows = useMemo(() => computeTimelineRows(binding), [binding, binding.getRevision()]);
    const timelineSpan = useMemo(() => computeTimelineSpan(rows), [rows]);
    const pxPerSecond = Math.max(1, bodyWidthPx - TIMELINE_INSET - RIGHT_PADDING) / timelineSpan;
    const anyLooping = useMemo(() => rows.some((r) => r.kind === 'track' && r.looping), [rows]);
    const prevElapsedRef = useRef(0);

    React.useEffect(() => {
        if (!playbackEnabled) {
            return;
        }
        let raf: number;
        const tick = () => {
            const state = playbackRef.current;
            const elapsed = getFocusElapsed(state, focusRootId);
            let shown = elapsed;
            if (anyLooping) {
                shown = timelineSpan > 0 ? elapsed % timelineSpan : 0;
            } else if (elapsed >= timelineSpan || isFocusFinished(state, focusRootId)) {
                shown = timelineSpan;
                const justFinishedPlaying =
                    !state.scrubbing && state.stagePlaying && prevElapsedRef.current < timelineSpan && elapsed >= timelineSpan;
                if (justFinishedPlaying) {
                    markFocusFinished(state, focusRootId);
                    setFocusElapsed(state, focusRootId, timelineSpan);
                }
            }
            prevElapsedRef.current = elapsed;
            if (playheadRef.current) {
                playheadRef.current.style.left = `${LABEL_WIDTH + TIMELINE_INSET + shown * pxPerSecond}px`;
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [pxPerSecond, timelineSpan, anyLooping, playbackRef, playheadRef, focusRootId, playbackEnabled]);

    const visibleRows = useMemo(() => {
        let hideUntilDepth: number | null = null;
        const visible = rows.filter((row) => {
            if (hideUntilDepth !== null) {
                if (row.depth > hideUntilDepth) return false;
                hideUntilDepth = null;
            }
            if (row.kind === 'group' && collapsedGroups.has(row.node)) {
                hideUntilDepth = row.depth;
            }
            return true;
        });
        return visible;
    }, [rows, collapsedGroups]);

    const toggleCollapse = (node: TransformNode) => {
        setCollapsedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(node)) {
                next.delete(node);
            } else {
                next.add(node);
            }
            return next;
        });
    };

    const pixelToTime = (clientX: number): number => {
        const rect = bodyRef.current!.getBoundingClientRect();
        const x = clientX - rect.left - LABEL_WIDTH - TIMELINE_INSET;
        return Math.min(timelineSpan, Math.max(0, x / pxPerSecond));
    };

    const applyScrub = (time: number) => {
        scrubFocusTo(binding, time);
        const state = playbackRef.current;
        setFocusElapsed(state, focusRootId, time);
        if (time < timelineSpan) {
            clearFocusFinished(state, focusRootId);
        } else if (!anyLooping) {
            markFocusFinished(state, focusRootId);
        }
        if (playheadRef.current) {
            playheadRef.current.style.left = `${LABEL_WIDTH + TIMELINE_INSET + time * pxPerSecond}px`;
        }
        scene.render();
    };

    const queueScrub = (clientX: number) => {
        dragRef.current.pendingTime = pixelToTime(clientX);
        if (dragRef.current.raf == null) {
            dragRef.current.raf = requestAnimationFrame(() => {
                dragRef.current.raf = null;
                const t = dragRef.current.pendingTime;
                if (t != null) applyScrub(t);
            });
        }
    };

    const restartFocus = () => {
        scrubFocusTo(binding, 0);
        const state = playbackRef.current;
        setFocusElapsed(state, focusRootId, 0);
        clearFocusFinished(state, focusRootId);
        if (playheadRef.current) {
            playheadRef.current.style.left = `${LABEL_WIDTH + TIMELINE_INSET}px`;
        }
        scene.render();
    };

    const handleStagePlayPause = () => {
        const state = playbackRef.current;
        if (!stagePlaying) {
            if (isFocusFinished(state, focusRootId)) {
                binding.restart();
                clearFocusFinished(state, focusRootId);
                setFocusElapsed(state, focusRootId, 0);
                scene.render();
            }
            state.stagePlaying = true;
            setStagePlaying(true);
            return;
        }
        state.stagePlaying = false;
        setStagePlaying(false);
    };

    const ticks: number[] = [];
    for (let t = 0; t <= timelineSpan; t += pickTickInterval(pxPerSecond)) {
        ticks.push(t);
    }

    const overlayButton: React.CSSProperties = {
        ...buttonStyle,
        padding: '5px 9px',
        minWidth: 32,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    };

    return (
        <div
            style={{
                flexShrink: 0,
                height: PANEL_HEIGHT,
                borderTop: `1px solid ${theme.border}`,
                background: theme.panelBg,
                display: 'flex',
                flexDirection: 'column',
                fontFamily: theme.font,
                color: theme.text,
            }}
        >
            <div style={{display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: `1px solid ${theme.border}`}}>
                <button
                    className="qe-hover"
                    style={{...overlayButton, opacity: playbackEnabled ? 1 : 0.45}}
                    title={stagePlaying ? 'Pause stage preview' : 'Play stage preview'}
                    disabled={!playbackEnabled}
                    onClick={handleStagePlayPause}
                >
                    {stagePlaying ? <PauseIcon style={iconStyle(14)} /> : <PlayIcon style={iconStyle(14)} />}
                </button>
                <button
                    className="qe-hover"
                    style={{...overlayButton, opacity: playbackEnabled ? 1 : 0.45}}
                    title="Step one frame (stage)"
                    disabled={!playbackEnabled || stagePlaying}
                    onClick={() => (playbackRef.current.stepQueued = true)}
                >
                    <ForwardIcon style={iconStyle(14)} />
                </button>
                <button
                    className="qe-hover"
                    style={{...overlayButton, opacity: playbackEnabled ? 1 : 0.45}}
                    title="Restart focused effect only"
                    disabled={!playbackEnabled}
                    onClick={restartFocus}
                >
                    <ArrowPathIcon style={iconStyle(14)} />
                </button>
                <select
                    className="qe-hover"
                    style={{...overlayButton, padding: '5px 4px', opacity: playbackEnabled ? 1 : 0.45}}
                    title="Playback speed"
                    value={speed}
                    disabled={!playbackEnabled}
                    onChange={(e) => {
                        const next = Number(e.target.value);
                        playbackRef.current.speed = next;
                        setSpeed(next);
                    }}
                >
                    {[0.1, 0.25, 0.5, 1, 2, 4].map((s) => (
                        <option key={s} value={s}>
                            ×{s}
                        </option>
                    ))}
                </select>
                <span ref={counterRef} style={{fontSize: 12, color: theme.textDim, fontVariantNumeric: 'tabular-nums', paddingLeft: 4, minWidth: 120}} />
                {groupSelection.size >= 2 && (
                    <button className="qe-hover" style={overlayButton} title="Group the checked rows" onClick={groupSelectedNodes}>
                        <RectangleGroupIcon style={iconStyle(14)} />
                        Group ({groupSelection.size})
                    </button>
                )}
            </div>
            <div ref={bodyRef} style={{position: 'relative', flex: 1, minHeight: 0}}>
                {!playbackEnabled ? (
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0 24px',
                            textAlign: 'center',
                            fontSize: 13,
                            color: theme.textDim,
                            lineHeight: 1.5,
                        }}
                    >
                        Selected effect is not in the scene. Drag it into the viewport to preview playback.
                    </div>
                ) : (
                    <>
                        <div
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                height: RULER_HEIGHT,
                                display: 'grid',
                                gridTemplateColumns: `${LABEL_WIDTH}px 1fr`,
                                background: theme.panelBg,
                                zIndex: 2,
                            }}
                        >
                            <div style={{height: RULER_HEIGHT}} />
                            <div
                                className="qe-hover-bg"
                                style={{position: 'relative', height: RULER_HEIGHT, cursor: 'ew-resize', overflow: 'hidden'}}
                                onPointerDown={(e) => {
                                    playbackRef.current.scrubbing = true;
                                    (e.target as Element).setPointerCapture(e.pointerId);
                                    queueScrub(e.clientX);
                                }}
                                onPointerMove={(e) => {
                                    if (playbackRef.current.scrubbing) queueScrub(e.clientX);
                                }}
                                onPointerUp={(e) => {
                                    playbackRef.current.scrubbing = false;
                                    (e.target as Element).releasePointerCapture?.(e.pointerId);
                                }}
                            >
                                {ticks.map((t) => (
                                    <div key={t} style={{position: 'absolute', left: TIMELINE_INSET + t * pxPerSecond, top: 0, bottom: 0, borderLeft: `1px solid ${theme.border}`, fontSize: 10, color: theme.textDim, paddingLeft: 3}}>
                                        {t}s
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div
                            className="qe-hover-bg"
                            title="Preview parent — simulates effect.parent = someNode; not saved in the exported JSON"
                            style={{
                                position: 'absolute',
                                top: RULER_HEIGHT,
                                left: 0,
                                right: 0,
                                height: STAGE_ROW_HEIGHT,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '0 8px',
                                fontSize: 12.5,
                                fontStyle: 'italic',
                                cursor: 'pointer',
                                color: selectedNode === null ? theme.text : theme.textDim,
                                borderBottom: `1px solid ${theme.border}`,
                                ...(selectedNode === null ? {background: 'rgba(60, 105, 209, 0.3)'} : {}),
                            }}
                            onClick={() => onSelectNode(null)}
                        >
                            <span style={{fontSize: 10, width: 10}}>◎</span>
                            <span>Stage (preview parent)</span>
                        </div>
                        <div
                            style={{
                                position: 'absolute',
                                top: RULER_HEIGHT + STAGE_ROW_HEIGHT,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                overflowY: 'auto',
                                overflowX: 'hidden',
                            }}
                        >
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: `${LABEL_WIDTH}px 1fr`,
                                    gridAutoRows: 'min-content',
                                }}
                            >
                                {visibleRows.map((row) => (
                                    <TimelineTrackRow
                                        key={row.node.uniqueId}
                                        row={row}
                                        binding={binding}
                                        selected={row.node === selectedNode}
                                        onSelectNode={onSelectNode}
                                        pxPerSecond={pxPerSecond}
                                        offsetPx={TIMELINE_INSET}
                                        collapsed={row.kind === 'group' && collapsedGroups.has(row.node)}
                                        onToggleCollapse={row.kind === 'group' ? () => toggleCollapse(row.node) : undefined}
                                        hidden={row.kind === 'track' && hiddenSystems.has(row.system)}
                                        onToggleVisible={row.kind === 'track' ? () => toggleVisible(row.system) : undefined}
                                        groupSelected={groupSelection.has(row.node)}
                                        onToggleGroupSelect={() => toggleGroupSelect(row.node)}
                                    />
                                ))}
                            </div>
                        </div>
                        <div style={{position: 'absolute', top: 0, bottom: 0, left: LABEL_WIDTH, width: 1, background: theme.border, pointerEvents: 'none', zIndex: 3}} />
                        <div
                            ref={playheadRef}
                            style={{
                                position: 'absolute',
                                top: 0,
                                bottom: 0,
                                left: LABEL_WIDTH + TIMELINE_INSET,
                                width: 1,
                                background: theme.accent,
                                pointerEvents: 'none',
                                zIndex: 3,
                            }}
                        />
                    </>
                )}
            </div>
        </div>
    );
}
