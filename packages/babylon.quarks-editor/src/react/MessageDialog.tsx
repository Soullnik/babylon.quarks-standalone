import React from 'react';
import {buttonStyle, theme} from './theme';

export interface MessageDialogProps {
    title: string;
    message: string;
    confirmLabel?: string;
    onClose: () => void;
}

/** Modal for info and error messages — same chrome as PromptDialog, no text input. */
export function MessageDialog(props: MessageDialogProps): React.ReactElement {
    const {title, message, confirmLabel = 'OK', onClose} = props;

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
            onClick={onClose}
        >
            <div
                style={{
                    background: theme.panelBg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 10,
                    padding: 16,
                    minWidth: 320,
                    maxWidth: 480,
                    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 8}}>{title}</div>
                <div style={{fontSize: 13, lineHeight: 1.5, color: theme.textDim, marginBottom: 14, whiteSpace: 'pre-wrap'}}>
                    {message}
                </div>
                <div style={{display: 'flex', justifyContent: 'flex-end'}}>
                    <button
                        className="qe-hover"
                        style={{...buttonStyle, background: theme.accent, color: '#0a1128', borderColor: theme.accent}}
                        onClick={onClose}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
