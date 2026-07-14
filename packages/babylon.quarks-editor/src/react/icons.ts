import type {ComponentType, CSSProperties, SVGProps} from 'react';

export type HeroIcon = ComponentType<
    SVGProps<SVGSVGElement> & {
        title?: string;
        titleId?: string;
    }
>;

/** Shared size/style for toolbar and inline icon buttons. */
export function iconStyle(size = 14, extra?: CSSProperties): CSSProperties {
    return {
        width: size,
        height: size,
        flexShrink: 0,
        display: 'block',
        ...extra,
    };
}
