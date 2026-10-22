import type {Scene} from '@babylonjs/core/scene.js';
import {ArrowPathIcon, ForwardIcon, PauseIcon, PlayIcon} from '@heroicons/react/24/solid';
import type {BatchedRenderer} from 'babylon.quarks';
import React from 'react';
import type {EffectBinding} from '../core/binding.js';
import type {PlaybackState} from '../core/playback.js';
import {PLAYBACK_SPEEDS, restartFocusPlayback, toggleStagePlayback} from '../core/transport.js';
import {iconStyle} from './icons.js';
import {buttonStyle, theme} from './theme.js';

export interface TransportBarProps {
    binding: EffectBinding | null;
    scene: Scene;
    renderer: BatchedRenderer;
    playbackRef: React.MutableRefObject<PlaybackState>;
    /** The host's render loop writes time and particle count here. */
    counterRef: React.RefObject<HTMLSpanElement | null>;
    stagePlaying: boolean;
    setStagePlaying: (playing: boolean) => void;
    speed: number;
    setSpeed: (speed: number) => void;
    /** False when the focused effect is hidden. */
    enabled: boolean;
}

const barButton: React.CSSProperties = {
    ...buttonStyle,
    width: 28,
    height: 26,
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
};

/**
 * Floating playback controls in the viewport (like Unity's Particle Effect overlay), so playing
 * and restarting never needs the timeline open.
 */
export function TransportBar(props: TransportBarProps): React.ReactElement {
    const {binding, scene, renderer, playbackRef, counterRef, stagePlaying, setStagePlaying, speed, setSpeed} = props;
    const enabled = props.enabled && binding !== null;
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: 4,
                background: theme.panelBg,
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                fontFamily: theme.font,
            }}
        >
            <button
                className="qe-hover"
                style={barButton}
                title={stagePlaying ? 'Pause (Space)' : 'Play (Space)'}
                disabled={!enabled}
                onClick={() => toggleStagePlayback(binding, scene, playbackRef.current, stagePlaying, setStagePlaying)}
            >
                {stagePlaying ? <PauseIcon style={iconStyle(14)} /> : <PlayIcon style={iconStyle(14)} />}
            </button>
            <button
                className="qe-hover"
                style={barButton}
                title="Step one frame"
                disabled={!enabled || stagePlaying}
                onClick={() => (playbackRef.current.stepQueued = true)}
            >
                <ForwardIcon style={iconStyle(14)} />
            </button>
            <button
                className="qe-hover"
                style={barButton}
                title="Restart the focused effect"
                disabled={!enabled}
                onClick={() => binding && restartFocusPlayback(binding, renderer, scene, playbackRef.current)}
            >
                <ArrowPathIcon style={iconStyle(14)} />
            </button>
            <select
                className="qe-hover"
                style={{...barButton, width: 'auto', padding: '0 4px'}}
                title="Playback speed"
                value={speed}
                disabled={!enabled}
                onChange={(e) => {
                    const next = Number(e.target.value);
                    playbackRef.current.speed = next;
                    setSpeed(next);
                }}
            >
                {PLAYBACK_SPEEDS.map((s) => (
                    <option key={s} value={s}>
                        ×{s}
                    </option>
                ))}
            </select>
            <span
                ref={counterRef}
                style={{
                    fontSize: 12,
                    color: theme.textDim,
                    fontVariantNumeric: 'tabular-nums',
                    padding: '0 6px',
                    minWidth: 150,
                    whiteSpace: 'nowrap',
                }}
            />
        </div>
    );
}
