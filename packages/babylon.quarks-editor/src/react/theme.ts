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
    cursor: 'pointer',
    fontSize: 12.5,
    fontFamily: theme.font,
};

/** Visually hides a file input while keeping it activatable via an associated <label>. */
export const hiddenFileInputStyle: CSSProperties = {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
};

/**
 * Two hover conventions, applied via className (inline `style` can't express `:hover`):
 * - `qe-hover` — brightens elements that already have a solid inline background/border
 *   (buttons, icon buttons, bars, gradient/curve handles, module headers).
 * - `qe-hover-bg` — adds a background tint for elements left transparent by default (timeline
 *   rows), since brightening transparent does nothing. Must not be combined with an inline
 *   `background` on the same element or the tint would need `!important` to show through.
 */
export const globalEditorStyles = `
.qe-hover, .qe-hover-bg {
    transition: filter 0.12s ease, background 0.12s ease;
}
.qe-hover:hover:not(:disabled) {
    filter: brightness(1.3);
}
.qe-hover:active:not(:disabled) {
    filter: brightness(0.85);
}
.qe-hover:disabled {
    opacity: 0.45;
    cursor: default;
}
.qe-hover-bg:hover {
    background: rgba(255, 255, 255, 0.07);
}
select.qe-hover:hover, input.qe-hover:hover, select.qe-hover:focus, input.qe-hover:focus {
    border-color: ${theme.borderActive};
    filter: none;
}
.qe-root, .qe-root * {
    scrollbar-width: thin;
    scrollbar-color: ${theme.border} transparent;
}
.qe-root ::-webkit-scrollbar {
    width: 10px;
    height: 10px;
}
.qe-root ::-webkit-scrollbar-track {
    background: transparent;
}
.qe-root ::-webkit-scrollbar-thumb {
    background-color: ${theme.border};
    background-clip: padding-box;
    border: 2px solid transparent;
    border-radius: 8px;
}
.qe-root ::-webkit-scrollbar-thumb:hover {
    background-color: ${theme.borderActive};
}
.qe-root ::-webkit-scrollbar-corner {
    background: transparent;
}
.qe-tooltip {
    z-index: 100000;
    padding: 8px 10px;
    font-size: 11.5px;
    line-height: 1.45;
    color: ${theme.text};
    background: linear-gradient(180deg, rgba(18, 26, 52, 0.98), rgba(8, 12, 26, 0.98));
    border: 1px solid ${theme.borderActive};
    border-radius: 8px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
    pointer-events: none;
    font-family: ${theme.font};
    animation: qe-tooltip-in 0.12s ease;
}
.qe-tooltip--right::before,
.qe-tooltip--left::before {
    content: '';
    position: absolute;
    top: 50%;
    width: 0;
    height: 0;
    border: 5px solid transparent;
    transform: translateY(-50%);
}
.qe-tooltip--right::before {
    left: -10px;
    border-right-color: ${theme.borderActive};
}
.qe-tooltip--left::before {
    right: -10px;
    border-left-color: ${theme.borderActive};
}
@keyframes qe-tooltip-in {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}
`;
