import type {CSSProperties} from 'react';

export const theme = {
    panelBg: 'linear-gradient(180deg, rgba(12, 18, 38, 0.92), rgba(6, 10, 22, 0.94))',
    sectionBg: 'rgba(10, 16, 34, 0.6)',
    border: '#2a365f',
    borderActive: '#4f6fbe',
    text: '#eef3ff',
    textDim: '#b7c6ea',
    accent: '#9eb9ff',
    inputBg: 'rgba(7, 11, 22, 0.82)',
    curveStroke: '#78a5ff',
    font: 'Inter, Segoe UI, Roboto, sans-serif',
};

export const inputStyle: CSSProperties = {
    background: theme.inputBg,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    color: theme.text,
    fontSize: 12.5,
    padding: '5px 8px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: theme.font,
};

export const rowStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '110px 1fr',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
};

export const labelStyle: CSSProperties = {
    color: theme.textDim,
    fontSize: 12,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
};

export const buttonStyle: CSSProperties = {
    border: `1px solid #4563ad`,
    background: 'rgba(28, 48, 98, 0.55)',
    color: '#d8e3ff',
    padding: '6px 10px',
    borderRadius: 8,
    fontSize: 12.5,
    cursor: 'pointer',
    fontFamily: theme.font,
};
