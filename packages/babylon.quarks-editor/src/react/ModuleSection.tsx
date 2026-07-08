import React, {useState} from 'react';
import {theme} from './theme';

/** Unity-style module foldout with an optional enable checkbox. */
export function ModuleSection(props: {
    title: string;
    children: React.ReactNode;
    enabled?: boolean;
    onToggle?: (enabled: boolean) => void;
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(props.defaultOpen ?? true);
    const toggleable = props.onToggle !== undefined;
    const dimmed = toggleable && props.enabled === false;
    return (
        <section
            style={{
                border: `1px solid ${theme.border}`,
                borderRadius: 10,
                background: theme.sectionBg,
                marginTop: 8,
                overflow: 'hidden',
            }}
        >
            <header
                className="qe-hover"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 10px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    background: 'rgba(20, 30, 60, 0.5)',
                }}
                onClick={() => setOpen(!open)}
            >
                <span style={{color: theme.accent, fontSize: 10, width: 10}}>{open ? '▼' : '►'}</span>
                {toggleable && (
                    <input
                        type="checkbox"
                        className="qe-hover"
                        checked={props.enabled}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => props.onToggle?.(e.target.checked)}
                        style={{width: 14, height: 14, accentColor: '#78a5ff', cursor: 'pointer'}}
                    />
                )}
                <span style={{color: dimmed ? theme.textDim : theme.text, fontSize: 13, fontWeight: 600}}>{props.title}</span>
            </header>
            {open && !dimmed && <div style={{padding: '4px 10px 10px'}}>{props.children}</div>}
        </section>
    );
}
