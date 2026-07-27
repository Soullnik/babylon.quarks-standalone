import {useRef, useState} from 'react';
import {GradientStop, hexToRgb, rgbToHex, stopsToCssGradient} from '../core/colors';
import {NumberField, Row} from './fields';
import {buttonStyle, theme} from './theme';

const BAR_WIDTH = 218;

/** Gradient editor: RGBA stops on a bar — click to add, drag to move, edit the selected stop. */
export function GradientEditor(props: {stops: GradientStop[]; onChange: (stops: GradientStop[]) => void}) {
    const [selected, setSelected] = useState(0);
    const barRef = useRef<HTMLDivElement>(null);
    const dragging = useRef(false);

    const stops = props.stops;
    const current = stops[Math.min(selected, stops.length - 1)];

    const posFromEvent = (clientX: number) => {
        const rect = barRef.current!.getBoundingClientRect();
        return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    };

    const updateStop = (index: number, patch: Partial<GradientStop>) => {
        const next = stops.map((s, i) => (i === index ? {...s, ...patch} : s));
        props.onChange(next);
    };

    return (
        <div>
            <div
                ref={barRef}
                className="qe-hover"
                style={{
                    position: 'relative',
                    width: BAR_WIDTH,
                    height: 20,
                    borderRadius: 6,
                    border: `1px solid ${theme.border}`,
                    background: `${stopsToCssGradient(stops)}, repeating-conic-gradient(#333 0% 25%, #555 0% 50%) 0 0 / 10px 10px`,
                    cursor: 'copy',
                }}
                onPointerDown={(e) => {
                    if (e.target !== barRef.current) {
                        return;
                    }
                    const pos = posFromEvent(e.clientX);
                    const base = current ?? {r: 1, g: 1, b: 1, a: 1, pos: 0};
                    const next = [...stops, {...base, pos}];
                    props.onChange(next);
                    setSelected(next.length - 1);
                }}
                onPointerMove={(e) => {
                    if (dragging.current) {
                        updateStop(selected, {pos: posFromEvent(e.clientX)});
                    }
                }}
                onPointerUp={() => {
                    dragging.current = false;
                }}
            >
                {stops.map((stop, i) => (
                    <div
                        key={i}
                        className="qe-hover"
                        style={{
                            position: 'absolute',
                            left: `calc(${stop.pos * 100}% - 6px)`,
                            top: -4,
                            width: 12,
                            height: 26,
                            borderRadius: 4,
                            background: rgbToHex(stop.r, stop.g, stop.b),
                            border: `2px solid ${i === selected ? theme.accent : '#0a1020'}`,
                            cursor: 'ew-resize',
                            boxSizing: 'border-box',
                        }}
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            setSelected(i);
                            dragging.current = true;
                            (e.currentTarget as Element).setPointerCapture(e.pointerId);
                        }}
                        onPointerMove={(e) => {
                            if (dragging.current && i === selected) {
                                updateStop(i, {pos: posFromEvent(e.clientX)});
                            }
                        }}
                        onPointerUp={(e) => {
                            dragging.current = false;
                            (e.currentTarget as Element).releasePointerCapture(e.pointerId);
                        }}
                    />
                ))}
            </div>
            {current && (
                <>
                    <Row label="Stop color">
                        <input
                            type="color"
                            className="qe-hover"
                            value={rgbToHex(current.r, current.g, current.b)}
                            onChange={(e) => updateStop(selected, hexToRgb(e.target.value))}
                            style={{
                                width: 42,
                                height: 24,
                                border: 'none',
                                background: 'transparent',
                                padding: 0,
                                cursor: 'pointer',
                            }}
                        />
                    </Row>
                    <Row label="Stop alpha">
                        <NumberField
                            value={current.a}
                            min={0}
                            step={0.05}
                            onChange={(a) => updateStop(selected, {a: Math.min(1, a)})}
                        />
                    </Row>
                    <Row label="Stop position">
                        <NumberField
                            value={current.pos}
                            min={0}
                            step={0.05}
                            onChange={(pos) => updateStop(selected, {pos: Math.min(1, pos)})}
                        />
                    </Row>
                    {stops.length > 2 && (
                        <button
                            className="qe-hover"
                            style={{...buttonStyle, marginTop: 6}}
                            onClick={() => {
                                props.onChange(stops.filter((_, i) => i !== selected));
                                setSelected(0);
                            }}
                        >
                            Remove stop
                        </button>
                    )}
                </>
            )}
        </div>
    );
}
