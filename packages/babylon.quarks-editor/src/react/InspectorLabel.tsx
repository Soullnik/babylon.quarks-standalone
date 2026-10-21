import React from 'react';
import {getInspectorHint} from './inspectorHints.js';
import {InspectorInfoIcon} from './InspectorInfoIcon.js';
import {labelStyle} from './theme.js';

/** Inspector row label with an optional info icon tooltip. */
export function InspectorLabel(props: {label: string; hint?: string; hintKey?: string}): React.ReactElement | null {
    if (!props.label) {
        return null;
    }
    const tooltip = props.hint ?? getInspectorHint(props.hintKey ?? props.label);
    return (
        <span style={{...labelStyle, display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0}}>
            <span style={{overflow: 'hidden', textOverflow: 'ellipsis'}}>{props.label}</span>
            {tooltip ? <InspectorInfoIcon content={tooltip} /> : null}
        </span>
    );
}
