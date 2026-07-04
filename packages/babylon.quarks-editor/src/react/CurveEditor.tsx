import React, {useRef, useState} from 'react';
import {CurvePiece, mergePieces, sampleCurve, splitPieces} from '../core/values';
import {inputStyle, theme} from './theme';

const WIDTH = 218;
const HEIGHT = 84;
const PAD = 8;

interface PointRef {
    piece: number;
    /** 0 = segment start key, 1|2 = handles, 3 = final end key (last piece only). */
    idx: number;
}

/**
 * Multi-segment piecewise-bezier curve editor. Drag keys/handles vertically,
 * drag inner keys horizontally, double-click the curve to add a key, double-click
 * a key to remove it (Unity-like).
 */
export function CurveEditor(props: {pieces: CurvePiece[]; onChange: (pieces: CurvePiece[]) => void; maxValue?: number}) {
    const svgRef = useRef<SVGSVGElement>(null);
    const drag = useRef<PointRef | null>(null);
    const [selected, setSelected] = useState<PointRef | null>(null);

    const pieces = [...props.pieces].sort((a, b) => a.start - b.start);
    const allValues = pieces.flatMap((piece) => piece.p);
    const max = Math.max(props.maxValue ?? 1, ...allValues.map(Math.abs), 0.001);

    const spanEnd = (i: number) => (i + 1 < pieces.length ? pieces[i + 1].start : 1);
    const toX = (x: number) => PAD + x * (WIDTH - PAD * 2);
    const toY = (v: number) => HEIGHT - PAD - (v / max) * (HEIGHT - PAD * 2);
    const fromY = (y: number) => Math.round(Math.min(max, Math.max(0, ((HEIGHT - PAD - y) / (HEIGHT - PAD * 2)) * max)) * 1000) / 1000;
    const fromX = (px: number) => Math.min(1, Math.max(0, (px - PAD) / (WIDTH - PAD * 2)));

    // Control point positions: piece start key, two handles, plus the final end key.
    const points: Array<{ref: PointRef; x: number; y: number; isKey: boolean}> = [];
    pieces.forEach((piece, i) => {
        const end = spanEnd(i);
        const span = end - piece.start;
        points.push({ref: {piece: i, idx: 0}, x: piece.start, y: piece.p[0], isKey: true});
        points.push({ref: {piece: i, idx: 1}, x: piece.start + span / 3, y: piece.p[1], isKey: false});
        points.push({ref: {piece: i, idx: 2}, x: piece.start + (2 * span) / 3, y: piece.p[2], isKey: false});
        if (i === pieces.length - 1) {
            points.push({ref: {piece: i, idx: 3}, x: 1, y: piece.p[3], isKey: true});
        }
    });

    const samples: string[] = [];
    pieces.forEach((piece, i) => {
        const end = spanEnd(i);
        for (let s = 0; s <= 16; s++) {
            const t = s / 16;
            samples.push(`${toX(piece.start + t * (end - piece.start)).toFixed(1)},${toY(sampleCurve(piece.p, t)).toFixed(1)}`);
        }
    });

    const applyDrag = (clientX: number, clientY: number) => {
        const target = drag.current;
        if (!target || !svgRef.current) {
            return;
        }
        const rect = svgRef.current.getBoundingClientRect();
        const v = fromY(clientY - rect.top);
        const next = pieces.map((piece) => ({start: piece.start, p: [...piece.p] as CurvePiece['p']}));
        const {piece, idx} = target;
        if (idx === 0) {
            next[piece].p[0] = v;
            if (piece > 0) {
                next[piece - 1].p[3] = v;
                // Inner keys can also move horizontally between neighbours.
                const x = fromX(clientX - rect.left);
                const min = next[piece - 1].start + 0.02;
                const maxX = (piece + 1 < next.length ? next[piece + 1].start : 1) - 0.02;
                next[piece].start = Math.min(maxX, Math.max(min, x));
            }
        } else if (idx === 3) {
            next[piece].p[3] = v;
        } else {
            next[piece].p[idx] = v;
        }
        props.onChange(next);
    };

    const selectedPoint = selected ? points.find((pt) => pt.ref.piece === selected.piece && pt.ref.idx === selected.idx) : null;

    return (
        <div>
            <svg
                ref={svgRef}
                width={WIDTH}
                height={HEIGHT}
                style={{background: 'rgba(5, 8, 18, 0.85)', border: `1px solid ${theme.border}`, borderRadius: 8, touchAction: 'none', display: 'block'}}
                onPointerMove={(e) => applyDrag(e.clientX, e.clientY)}
                onPointerUp={(e) => {
                    drag.current = null;
                    (e.target as Element).releasePointerCapture?.(e.pointerId);
                }}
                onDoubleClick={(e) => {
                    if ((e.target as Element).tagName === 'circle') {
                        return;
                    }
                    const rect = svgRef.current!.getBoundingClientRect();
                    props.onChange(splitPieces(pieces, fromX(e.clientX - rect.left)));
                }}
            >
                {[0.25, 0.5, 0.75].map((f) => (
                    <line key={f} x1={PAD} x2={WIDTH - PAD} y1={PAD + f * (HEIGHT - PAD * 2)} y2={PAD + f * (HEIGHT - PAD * 2)} stroke="#1c274a" strokeWidth={1} />
                ))}
                <polyline points={samples.join(' ')} fill="none" stroke={theme.curveStroke} strokeWidth={2} />
                {points.map((pt) => (
                    <circle
                        key={`${pt.ref.piece}-${pt.ref.idx}`}
                        cx={toX(pt.x)}
                        cy={toY(pt.y)}
                        r={pt.isKey ? 5 : 4}
                        fill={pt.isKey ? theme.curveStroke : '#28407f'}
                        stroke={theme.curveStroke}
                        strokeWidth={1.5}
                        style={{cursor: pt.isKey && pt.ref.idx === 0 && pt.ref.piece > 0 ? 'move' : 'ns-resize'}}
                        onPointerDown={(e) => {
                            drag.current = pt.ref;
                            setSelected(pt.ref);
                            (e.target as Element).setPointerCapture(e.pointerId);
                        }}
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (pt.isKey && pt.ref.idx === 0 && pt.ref.piece > 0) {
                                setSelected(null);
                                props.onChange(mergePieces(pieces, pt.ref.piece));
                            }
                        }}
                    />
                ))}
            </svg>
            <div style={{display: 'flex', gap: 4, marginTop: 4, alignItems: 'center'}}>
                {selectedPoint ? (
                    <>
                        <span style={{fontSize: 10.5, color: theme.textDim}}>value</span>
                        <input
                            type="number"
                            step={0.05}
                            style={{...inputStyle, fontSize: 11, padding: '3px 5px', width: 70}}
                            value={Math.round(selectedPoint.y * 1000) / 1000}
                            onChange={(e) => {
                                const parsed = parseFloat(e.target.value);
                                if (Number.isNaN(parsed)) {
                                    return;
                                }
                                const next = pieces.map((piece) => ({start: piece.start, p: [...piece.p] as CurvePiece['p']}));
                                const {piece, idx} = selectedPoint.ref;
                                if (idx === 0 && piece > 0) {
                                    next[piece - 1].p[3] = parsed;
                                }
                                next[piece].p[idx === 3 ? 3 : idx] = parsed;
                                props.onChange(next);
                            }}
                        />
                        <span style={{fontSize: 10.5, color: theme.textDim}}>t={Math.round(selectedPoint.x * 100) / 100}</span>
                    </>
                ) : (
                    <span style={{fontSize: 10.5, color: theme.textDim}}>dbl-click curve: add key · dbl-click key: remove</span>
                )}
            </div>
        </div>
    );
}
