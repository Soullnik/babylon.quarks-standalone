/**
 * The logo's two rings round the hero window, drawn to the window's measured size.
 *
 * Each ring is a tilted ellipse centred on the window and wider than it, so it leaves the window
 * at its sides. Only the ring outside the window is drawn: each arc leaves the window's edge,
 * swings out and comes back to the edge, and is drawn over the window's frame line, so it lands on
 * the frame rather than slipping under it. The rings keep inside the window's height, clear of the
 * take row above and the data row below, and on narrow screens inside the viewport. One gradient
 * laid out in the frame's pixels colours both rings, cyan on the left to magenta on the right.
 */

const SVG = 'http://www.w3.org/2000/svg';
const RAMP_ID = 'orbit-ramp';
const CLIP_ID = 'orbit-outside';

interface Ring {
    /** Tilt in degrees; negative lifts the right end, as in the logo. */
    tilt: number;
    /** How far the ends reach past the window's sides, as a fraction of its width. */
    reach: number;
    /** The ring's half-height, as a fraction of what the tilt leaves inside the window's height. */
    depth: number;
}

const RINGS: Ring[] = [
    {tilt: -14, reach: 0.09, depth: 0.85},
    {tilt: -24, reach: 0.06, depth: 0.7},
];

/** The widest the ends reach past the window, px, and the least, so they always clear its sides. */
const MAX_REACH = 40;
const MIN_REACH = 6;
/** The share of the window's half-height the rings may use. */
const HEIGHT_USE = 0.94;

interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * A ring's path for the window: its ends clear the window's sides, its height stays inside the
 * window's, and its width (the ends plus the bulge past them) stays inside the room.
 */
function ringPath(win: Box, ring: Ring, room: number) {
    const theta = (ring.tilt * Math.PI) / 180;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const fit = (win.w / 2 + room) * cos - win.w / 2;
    const over = Math.max(MIN_REACH, Math.min(ring.reach * win.w, MAX_REACH, fit));
    const a = (win.w / 2 + over) / cos;
    const limitY = (win.h / 2) * HEIGHT_USE;
    const spare = limitY * limitY - a * a * sin * sin;
    const b = Math.max(win.h * 0.06, (ring.depth * Math.sqrt(Math.max(0, spare))) / cos);
    const cx = win.x + win.w / 2;
    const cy = win.y + win.h / 2;
    const arc = `A${a.toFixed(2)} ${b.toFixed(2)} ${ring.tilt} 0 1`;
    const right = `${(cx + a * cos).toFixed(2)} ${(cy + a * sin).toFixed(2)}`;
    const left = `${(cx - a * cos).toFixed(2)} ${(cy - a * sin).toFixed(2)}`;
    return {d: `M${right}${arc} ${left}${arc} ${right}Z`, span: a};
}

function element<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string>) {
    const node = document.createElementNS(SVG, name);
    for (const [key, value] of Object.entries(attrs)) {
        node.setAttribute(key, value);
    }
    return node;
}

/** Draws the rings into the stage frame's `.orbit` layer and keeps them fitted to the window. */
export function setupOrbits(frame: HTMLElement) {
    const layer = frame.querySelector<SVGSVGElement>('.orbit');
    const view = frame.querySelector<HTMLElement>('.stage-view');
    if (!layer || !view) {
        return;
    }

    const ramp = element('linearGradient', {
        id: RAMP_ID,
        gradientUnits: 'userSpaceOnUse',
        x1: '0',
        y1: '0',
        x2: '1',
        y2: '0',
    });
    for (const [offset, token] of [
        ['0', '--cyan'],
        ['0.55', '--violet'],
        ['1', '--magenta'],
    ]) {
        ramp.append(element('stop', {offset, style: `stop-color: var(${token})`}));
    }
    // Everything but the window: a large box with the window cut out of it.
    const outside = element('path', {'clip-rule': 'evenodd'});
    const clip = element('clipPath', {id: CLIP_ID});
    clip.append(outside);
    const defs = element('defs', {});
    defs.append(ramp, clip);
    layer.append(defs);
    const group = layer.appendChild(element('g', {'clip-path': `url(#${CLIP_ID})`}));
    const paths = RINGS.map(() => group.appendChild(element('path', {})));

    const fit = () => {
        const f = frame.getBoundingClientRect();
        const v = view.getBoundingClientRect();
        if (v.width === 0) {
            return;
        }
        const win: Box = {x: v.left - f.left, y: v.top - f.top, w: v.width, h: v.height};
        layer.setAttribute('viewBox', `0 0 ${f.width.toFixed(2)} ${f.height.toFixed(2)}`);
        const far = 1e4;
        outside.setAttribute(
            'd',
            `M${-far} ${-far}H${far}V${far}H${-far}Z` +
                `M${win.x.toFixed(2)} ${win.y.toFixed(2)}h${win.w.toFixed(2)}v${win.h.toFixed(2)}h${(-win.w).toFixed(2)}Z`
        );
        // The room the ends may take: up to the viewport's edge on either side, less a hair.
        const page = document.documentElement.clientWidth;
        const room = Math.max(0, Math.min(v.left, page - v.right) - 2);
        let span = 0;
        RINGS.forEach((ring, i) => {
            const path = ringPath(win, ring, room);
            paths[i].setAttribute('d', path.d);
            span = Math.max(span, path.span);
        });
        const cx = win.x + win.w / 2;
        ramp.setAttribute('x1', (cx - span).toFixed(2));
        ramp.setAttribute('x2', (cx + span).toFixed(2));
    };

    fit();
    new ResizeObserver(fit).observe(view);
    window.addEventListener('resize', fit);
}
