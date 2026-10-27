import React, {useEffect, useState} from 'react';
import {InspectorLabel} from './InspectorLabel.js';
import {inputStyle, rowStyle} from './theme.js';

/** An inspector row: a label, with an optional hint, and its controls. */
export function Row(props: {label: string; hint?: string; hintKey?: string; children: React.ReactNode}) {
    return (
        <div style={rowStyle}>
            {props.label ? (
                <>
                    <InspectorLabel label={props.label} hint={props.hint} hintKey={props.hintKey} />
                    {props.children}
                </>
            ) : (
                // A row without a label continues the one above it across the whole width, rather
                // than squeezing its fields into the label column.
                <div style={{gridColumn: '1 / -1', minWidth: 0}}>{props.children}</div>
            )}
        </div>
    );
}

/** Number input that keeps focus-friendly local text state and commits parsed values. */
export function NumberField(props: {
    value: number;
    onChange: (value: number) => void;
    step?: number;
    min?: number;
    max?: number;
}) {
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
            max={props.max}
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

/** A checkbox bound to a boolean. */
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

/** A select bound to a value, from a list of options. */
export function SelectField<T extends string | number>(props: {
    /** The selected value. */
    value: T;
    /** The options, in menu order. */
    options: Array<{
        /** The option's value. */
        value: T;
        /** Its text. */
        label: string;
    }>;
    /** Receives the picked value, a number when the values are numbers. */
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
