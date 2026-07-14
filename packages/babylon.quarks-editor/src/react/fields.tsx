import React, {useEffect, useState} from 'react';
import {InspectorLabel} from './InspectorLabel';
import {inputStyle, rowStyle} from './theme';

export function Row(props: {label: string; hint?: string; hintKey?: string; children: React.ReactNode}) {
    return (
        <div style={rowStyle}>
            <InspectorLabel label={props.label} hint={props.hint} hintKey={props.hintKey} />
            {props.children}
        </div>
    );
}

/** Number input that keeps focus-friendly local text state and commits parsed values. */
export function NumberField(props: {value: number; onChange: (value: number) => void; step?: number; min?: number}) {
    const [text, setText] = useState(String(round(props.value)));
    const focusedRef = React.useRef(false);
    useEffect(() => {
        if (!focusedRef.current) {
            setText(String(round(props.value)));
        }
    }, [props.value]);
    return (
        <input
            type="number"
            className="qe-hover"
            style={inputStyle}
            value={text}
            step={props.step ?? 0.1}
            min={props.min}
            onFocus={() => {
                focusedRef.current = true;
            }}
            onBlur={() => {
                focusedRef.current = false;
                setText(String(round(props.value)));
            }}
            onChange={(e) => {
                setText(e.target.value);
                const parsed = parseFloat(e.target.value);
                if (!Number.isNaN(parsed)) {
                    props.onChange(props.min !== undefined ? Math.max(props.min, parsed) : parsed);
                }
            }}
        />
    );
}

export function CheckboxField(props: {value: boolean; onChange: (value: boolean) => void}) {
    return (
        <input
            type="checkbox"
            className="qe-hover"
            checked={props.value}
            onChange={(e) => props.onChange(e.target.checked)}
            style={{justifySelf: 'start', width: 15, height: 15, accentColor: '#78a5ff', cursor: 'pointer'}}
        />
    );
}

export function SelectField<T extends string | number>(props: {
    value: T;
    options: Array<{value: T; label: string}>;
    onChange: (value: T) => void;
}) {
    const numeric = typeof props.value === 'number';
    return (
        <select
            className="qe-hover"
            style={{...inputStyle, cursor: 'pointer'}}
            value={String(props.value)}
            onChange={(e) => props.onChange((numeric ? Number(e.target.value) : e.target.value) as T)}
        >
            {props.options.map((o) => (
                <option key={String(o.value)} value={String(o.value)}>
                    {o.label}
                </option>
            ))}
        </select>
    );
}

function round(v: number): number {
    return Math.round(v * 1000) / 1000;
}
