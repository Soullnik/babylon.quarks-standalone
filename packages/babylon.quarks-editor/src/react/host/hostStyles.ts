import type React from 'react';
import {buttonStyle, theme} from '../theme.js';

/** Width of the Scene list on the left. */
export const SCENE_PANEL_WIDTH = 280;
/** Width of the inspector on the right. */
export const INSPECTOR_WIDTH = 340;
/** Height of the timeline dock when expanded. */
export const TIMELINE_HEIGHT = 200;
/** Height of the Assets drawer. */
export const DRAWER_HEIGHT = 280;

/** A square icon button of the viewport toolbars. */
export const squareButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    width: 28,
    height: 28,
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
};

/** Added to a toolbar button that is switched on. */
export const activeSquareButtonStyle: React.CSSProperties = {
    border: `1px solid ${theme.borderActive}`,
    background: 'rgba(120, 165, 255, 0.35)',
};

/** Title of a dock (Assets, Timeline). */
export const dockTitleStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: theme.text,
};

/** A small icon button in a dock's header. */
export const dockIconButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    width: 24,
    height: 22,
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
};

/** A floating panel over the viewport. */
export const floatingPanelStyle: React.CSSProperties = {
    background: theme.panelBg,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
};

/** A Save button, highlighted while there is something to save. */
export function saveButtonStyle(pending: boolean, padding: string): React.CSSProperties {
    return {
        ...buttonStyle,
        padding,
        ...(pending ? {background: theme.accent, color: '#0a1128', border: `1px solid ${theme.accent}`} : {}),
    };
}
