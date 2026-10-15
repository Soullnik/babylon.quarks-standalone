import React, {useEffect} from 'react';
import {buttonStyle, theme} from './theme';

export interface ChoiceDialogAction {
    label: string;
    onSelect: () => void;
    /** Accent button — also what Enter picks. */
    primary?: boolean;
    danger?: boolean;
}

export interface ChoiceDialogProps {
    title: string;
    message: React.ReactNode;
    /** Shown left to right; put the cancel action first. */
    actions: ChoiceDialogAction[];
    /** Escape / backdrop click. */
    onCancel: () => void;
}

/** Confirmation modal with several outcomes (e.g. Save / Don't save / Cancel). */
export function ChoiceDialog(props: ChoiceDialogProps): React.ReactElement {
    const {title, message, actions, onCancel} = props;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onCancel();
            } else if (e.key === 'Enter') {
                const primary = actions.find((action) => action.primary);
                if (primary) {
                    e.preventDefault();
                    primary.onSelect();
                }
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [actions, onCancel]);

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
                role="dialog"
                aria-label={title}
                style={{
                    background: theme.panelBg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 10,
                    padding: 16,
                    width: 380,
                    maxWidth: 'calc(100vw - 32px)',
                    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 8}}>{title}</div>
                <div style={{fontSize: 12.5, color: theme.textDim, lineHeight: 1.5, marginBottom: 16}}>{message}</div>
                <div style={{display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap'}}>
                    {actions.map((action) => (
                        <button
                            key={action.label}
                            className="qe-hover"
                            style={{
                                ...buttonStyle,
                                ...(action.primary
                                    ? {background: theme.accent, color: '#0a1128', border: `1px solid ${theme.accent}`}
                                    : {}),
                                ...(action.danger ? {border: '1px solid #b04a4a', color: '#ffb0b0'} : {}),
                            }}
                            onClick={action.onSelect}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
