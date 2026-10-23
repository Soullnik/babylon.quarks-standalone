import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {theme} from './theme.js';

/** One entry of a {@link ContextMenu}. */
export interface ContextMenuItem {
    /** The entry's text. */
    label: string;
    /** Runs when the entry is picked; the menu closes first. */
    onSelect: () => void;
    /** Shows the entry in red, for a destructive action. */
    danger?: boolean;
    /** Shows the entry greyed out and unpickable. */
    disabled?: boolean;
}

/** Props of {@link ContextMenu}. */
export interface ContextMenuProps {
    /** Client X of the right-click. */
    x: number;
    /** Client Y of the right-click. */
    y: number;
    /** The entries, top to bottom. */
    items: ContextMenuItem[];
    /** Closes the menu: the host stops rendering it. */
    onClose: () => void;
}

/** Right-click menu at the pointer; closes on outside click, Escape, scroll or window blur. */
export function ContextMenu(props: ContextMenuProps): React.ReactElement {
    const {x, y, items, onClose} = props;
    const ref = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({left: x, top: y});

    // Keep the menu on screen near the right/bottom edges.
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const {width, height} = el.getBoundingClientRect();
        setPosition({
            left: Math.max(4, Math.min(x, window.innerWidth - width - 4)),
            top: Math.max(4, Math.min(y, window.innerHeight - height - 4)),
        });
    }, [x, y]);

    useEffect(() => {
        const onPointerDown = (e: PointerEvent) => {
            if (!ref.current?.contains(e.target as Node)) onClose();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('pointerdown', onPointerDown, true);
        window.addEventListener('keydown', onKey);
        window.addEventListener('wheel', onClose, true);
        window.addEventListener('blur', onClose);
        return () => {
            window.removeEventListener('pointerdown', onPointerDown, true);
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('wheel', onClose, true);
            window.removeEventListener('blur', onClose);
        };
    }, [onClose]);

    return createPortal(
        <div
            ref={ref}
            role="menu"
            onContextMenu={(e) => e.preventDefault()}
            style={{
                position: 'fixed',
                left: position.left,
                top: position.top,
                zIndex: 1000,
                minWidth: 170,
                padding: 4,
                background: '#0c1226',
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
                fontFamily: theme.font,
            }}
        >
            {items.map((item) => (
                <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    className="qe-hover-bg"
                    disabled={item.disabled}
                    style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        border: 'none',
                        borderRadius: 5,
                        background: 'transparent',
                        color: item.danger ? '#ff8a8a' : theme.text,
                        opacity: item.disabled ? 0.45 : 1,
                        padding: '6px 10px',
                        fontSize: 12.5,
                        cursor: item.disabled ? 'default' : 'pointer',
                        fontFamily: theme.font,
                    }}
                    onClick={() => {
                        onClose();
                        item.onSelect();
                    }}
                >
                    {item.label}
                </button>
            ))}
        </div>,
        document.body
    );
}
