import React, {useCallback, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

const TOOLTIP_MAX_WIDTH = 260;
const VIEWPORT_PAD = 8;

/** Positions a fixed tooltip beside the anchor, flipping when near the viewport edge. */
function placeTooltip(anchor: DOMRect): {left: number; top: number; placement: 'left' | 'right'} {
    const centerY = anchor.top + anchor.height / 2;
    const top = Math.min(Math.max(centerY, VIEWPORT_PAD + 24), window.innerHeight - VIEWPORT_PAD - 24);
    const preferRight = anchor.right + 8 + TOOLTIP_MAX_WIDTH <= window.innerWidth - VIEWPORT_PAD;
    if (preferRight) {
        return {left: anchor.right + 8, top, placement: 'right'};
    }
    return {left: anchor.left - 8, top, placement: 'left'};
}

/** Themed hover/focus tooltip rendered in a portal so it is not clipped by scroll containers. */
export function Tooltip(props: {content: string; children: React.ReactNode}): React.ReactElement {
    const {content, children} = props;
    const anchorRef = useRef<HTMLSpanElement>(null);
    const [open, setOpen] = useState(false);
    const [layout, setLayout] = useState<{left: number; top: number; placement: 'left' | 'right'} | null>(null);

    const updateLayout = useCallback(() => {
        const anchor = anchorRef.current?.getBoundingClientRect();
        if (!anchor) {
            return;
        }
        setLayout(placeTooltip(anchor));
    }, []);

    const show = () => {
        updateLayout();
        setOpen(true);
    };

    const hide = () => setOpen(false);

    useLayoutEffect(() => {
        if (!open) {
            return;
        }
        updateLayout();
        const onReflow = () => updateLayout();
        window.addEventListener('scroll', onReflow, true);
        window.addEventListener('resize', onReflow);
        return () => {
            window.removeEventListener('scroll', onReflow, true);
            window.removeEventListener('resize', onReflow);
        };
    }, [open, updateLayout]);

    const tooltipStyle: React.CSSProperties =
        layout?.placement === 'left'
            ? {
                  position: 'fixed',
                  left: layout.left,
                  top: layout.top,
                  transform: 'translate(-100%, -50%)',
                  maxWidth: TOOLTIP_MAX_WIDTH,
              }
            : {
                  position: 'fixed',
                  left: layout?.left,
                  top: layout?.top,
                  transform: 'translateY(-50%)',
                  maxWidth: TOOLTIP_MAX_WIDTH,
              };

    return (
        <>
            <span
                ref={anchorRef}
                style={{display: 'inline-flex', verticalAlign: 'middle'}}
                onMouseEnter={show}
                onMouseLeave={hide}
                onFocus={show}
                onBlur={hide}
            >
                {children}
            </span>
            {open && layout
                ? createPortal(
                      <div role="tooltip" className={`qe-tooltip qe-tooltip--${layout.placement}`} style={tooltipStyle}>
                          {content}
                      </div>,
                      document.body
                  )
                : null}
        </>
    );
}
