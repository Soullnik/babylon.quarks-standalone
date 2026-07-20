import React, {useState} from 'react';
import {buttonStyle, theme} from './theme';
import {Row, CheckboxField} from './fields';

export interface ExportSettings {
    /** When true, exported JSON has no indentation (smaller file, not human-readable). */
    minify: boolean;
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {minify: false};

export interface ExportSettingsDialogProps {
    value: ExportSettings;
    onApply: (settings: ExportSettings) => void;
    onCancel: () => void;
}

/** Settings for the whole-effect JSON export — same chrome as MessageDialog/PromptDialog. */
export function ExportSettingsDialog(props: ExportSettingsDialogProps): React.ReactElement {
    const {value, onApply, onCancel} = props;
    const [minify, setMinify] = useState(value.minify);

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
                    minWidth: 320,
                    maxWidth: 420,
                    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{fontSize: 14, fontWeight: 600, color: theme.text, marginBottom: 10}}>Export settings</div>
                <Row label="Minify JSON" hint="Strips indentation for a smaller file. Not human-readable.">
                    <CheckboxField value={minify} onChange={setMinify} />
                </Row>
                <div style={{display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14}}>
                    <button className="qe-hover" style={buttonStyle} onClick={onCancel}>
                        Cancel
                    </button>
                    <button
                        className="qe-hover"
                        style={{...buttonStyle, background: theme.accent, color: '#0a1128', borderColor: theme.accent}}
                        onClick={() => onApply({minify})}
                    >
                        Apply
                    </button>
                </div>
            </div>
        </div>
    );
}
