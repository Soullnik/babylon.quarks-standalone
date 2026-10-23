import React, {useEffect, useRef, useState} from 'react';
import {buttonStyle, inputStyle, theme} from './theme.js';

/** Props of {@link PromptDialog}. */
export interface PromptDialogProps {
    /** What to enter. */
    title: string;
    /** The text the field starts with, selected. */
    defaultValue?: string;
    /** Hint shown in the empty field. */
    placeholder?: string;
    /** The confirm button's text. Default `OK`. */
    confirmLabel?: string;
    /** Rejects empty/whitespace-only input by default (matches the old prompt() behavior). */
    allowEmpty?: boolean;
    /** Receives the entered text, trimmed. */
    onSubmit: (value: string) => void;
    /** Escape, the backdrop, Cancel, or an empty submit when empty is not allowed. */
    onCancel: () => void;
}

/** Modal replacement for `window.prompt` — matches the editor's dark theme, submits on
 * Enter, cancels on Escape or backdrop click. */
export function PromptDialog(props: PromptDialogProps): React.ReactElement {
    const {title, defaultValue = '', placeholder, confirmLabel = 'OK', allowEmpty = false, onSubmit, onCancel} = props;
    const [value, setValue] = useState(defaultValue);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const submit = () => {
        const trimmed = value.trim();
        if (trimmed || allowEmpty) {
            onSubmit(trimmed);
        } else {
            onCancel();
        }
    };

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(3, 5, 12, 0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                fontFamily: theme.font,
            }}
            onClick={onCancel}
        >
            <div
                style={{
                    background: theme.panelBg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 10,
                    padding: 16,
                    minWidth: 300,
                    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{fontSize: 13, color: theme.text, marginBottom: 10}}>{title}</div>
                <input
                    ref={inputRef}
                    className="qe-hover"
                    style={{...inputStyle, marginBottom: 14}}
                    value={value}
                    placeholder={placeholder}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') submit();
                        if (e.key === 'Escape') onCancel();
                    }}
                />
                <div style={{display: 'flex', justifyContent: 'flex-end', gap: 8}}>
                    <button className="qe-hover" style={buttonStyle} onClick={onCancel}>
                        Cancel
                    </button>
                    <button
                        className="qe-hover"
                        style={{...buttonStyle, background: theme.accent, color: '#0a1128', borderColor: theme.accent}}
                        onClick={submit}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
