import React from 'react';
import {InformationCircleIcon} from '@heroicons/react/24/solid';
import {iconStyle} from './icons';
import {theme} from './theme';
import {Tooltip} from './Tooltip';

/** Small info icon with a themed inspector tooltip. */
export function InspectorInfoIcon(props: {content: string; size?: number; onClick?: (e: React.MouseEvent) => void}): React.ReactElement {
    const size = props.size ?? 13;
    return (
        <Tooltip content={props.content}>
            <span
                tabIndex={0}
                role="button"
                aria-label={props.content}
                style={{
                    display: 'inline-flex',
                    flexShrink: 0,
                    color: theme.textDim,
                    cursor: 'help',
                    opacity: 0.85,
                    outline: 'none',
                }}
                onClick={props.onClick}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                }}
            >
                <InformationCircleIcon style={iconStyle(size)} />
            </span>
        </Tooltip>
    );
}
