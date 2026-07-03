import React, {useCallback, useRef} from 'react';
import {sampleCurve} from '../core/values';
import {theme} from './theme';

const WIDTH = 218;
const HEIGHT = 84;
const PAD = 8;

/**
 * Editor for a single cubic bezier over normalized lifetime: four control values
 * at t = 0, 1/3, 2/3, 1, draggable vertically (Unity-like simplified curve).
 */
export function CurveEditor(props: {
    curve: [number, number, number, number];
    onChange: (curve: [number, number, number, number]) => void;
    maxValue?: number;
}) {
    const svgRef = useRef<SVGSVGElement>(null);
    const dragIndex = useRef(-1);
    const max = Math.max(props.maxValue ?? 1, ...props.curve.map((v) => Math.abs(v)), 0.001);

    const toY = useCallback((v: number) => HEIGHT - PAD - (v / max) * (HEIGHT - PAD * 2), [max]);
    const toX = (t: number) => PAD + t * (WIDTH - PAD * 2);
    const fromY = useCallback(
        (y: number) => {
            const v = ((HEIGHT - PAD - y) / (HEIGHT - PAD * 2)) * max;
            return Math.round(Math.min(max, Math.max(0, v)) * 1000) / 1000;
        },
        [max]
    );

    const samples: string[] = [];
    for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        samples.push(`${toX(t).toFixed(1)},${toY(sampleCurve(props.curve, t)).toFixed(1)}`);
    }

    const onPointerMove = (e: React.PointerEvent) => {
        if (dragIndex.current < 0 || !svgRef.current) {
            return;
        }
        const rect = svgRef.current.getBoundingClientRect();
        const next = [...props.curve] as [number, number, number, number];
        next[dragIndex.current] = fromY(e.clientY - rect.top);
        props.onChange(next);
    };

    return (
        <svg
            ref={svgRef}
            width={WIDTH}
            height={HEIGHT}
            style={{
                background: 'rgba(5, 8, 18, 0.85)',
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                touchAction: 'none',
                display: 'block',
            }}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => {
                dragIndex.current = -1;
                (e.target as Element).releasePointerCapture?.(e.pointerId);
            }}
        >
            {[0.25, 0.5, 0.75].map((f) => (
                <line
                    key={f}
                    x1={PAD}
                    x2={WIDTH - PAD}
                    y1={PAD + f * (HEIGHT - PAD * 2)}
                    y2={PAD + f * (HEIGHT - PAD * 2)}
                    stroke="#1c274a"
                    strokeWidth={1}
                />
            ))}
            <polyline points={samples.join(' ')} fill="none" stroke={theme.curveStroke} strokeWidth={2} />
            {props.curve.map((v, i) => (
                <circle
                    key={i}
                    cx={toX(i / 3)}
                    cy={toY(v)}
                    r={5}
                    fill={i === 0 || i === 3 ? theme.curveStroke : '#28407f'}
                    stroke={theme.curveStroke}
                    strokeWidth={1.5}
                    style={{cursor: 'ns-resize'}}
                    onPointerDown={(e) => {
                        dragIndex.current = i;
                        (e.target as Element).setPointerCapture(e.pointerId);
                    }}
                />
            ))}
        </svg>
    );
}
