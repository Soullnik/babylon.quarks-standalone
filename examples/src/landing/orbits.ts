/**
 * The logo's two rings round the hero window, drawn to the window's measured size.
 *
 * Each ring is a tilted ellipse centred on the window and wider than it, so both its ends lie
 * outside the window, left and right. The back layer sits under the window and draws the whole
 * ellipse: the window hides what crosses it, and what shows is the ring outside. The front layer
 * sits over the window and draws the near half only, clipped to the window, so it starts and ends
 * exactly where the ring crosses the window's edge and runs on, unbroken, into the part outside.
 * Both layers share one gradient laid out in the frame's pixels, so the colour runs on across the
 * edge as well.
 *
 * The rings keep inside the window's height, clear of the take row above and the data row below,
 * and on narrow screens inside the viewport. A slow sway turns each ring a degree or two either
 * way, its shape unchanged, while the stage is on screen; under reduced motion they hold still.
 */

const SVG = 'http://www.w3.org/2000/svg';
const RAMP_ID = 'orbit-ramp';
const CLIP_ID = 'orbit-window';

interface Ring {
    /** Tilt in degrees; negative lifts the right end, as in the logo. */
    tilt: number;
    /** How far the ends reach past the window's sides, as a fraction of its width. */
    reach: number;
    /** The ring's half-height, as a fraction of what the tilt leaves inside the window's height. */
    depth: number;
    /** Sway of the tilt, degrees either way, and its period in seconds. */
    sway: number;
    period: number;
    phase: number;
}

const RINGS: Ring[] = [
    {tilt: -14, reach: 0.09, depth: 0.85, sway: 1.5, period: 26, phase: 0},
    {tilt: -24, reach: 0.06, depth: 0.7, sway: 1.2, period: 34, phase: 1.7},
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

interface RingSize {
    /** Semi-axes, px. */
    a: number;
    b: number;
}

/**
 * A ring's size, fixed for the window's size: the sway only turns it, so it never changes shape.
 * Sized for the extremes of the sway: its ends clear the window's sides at the steepest tilt (the
 * ends come furthest in there), its height stays inside the window's at the steepest tilt (it is
 * tallest there), and its width stays inside the room at no tilt (it is widest there).
 */
function ringSize(win: Box, ring: Ring, room: number): RingSize {
    const steep = ((Math.abs(ring.tilt) + ring.sway) * Math.PI) / 180;
    const cos = Math.cos(steep);
    const sin = Math.sin(steep);
    const fit = (win.w / 2 + room) * cos - win.w / 2;
    const over = Math.max(MIN_REACH, Math.min(ring.reach * win.w, MAX_REACH, fit));
    const a = (win.w / 2 + over) / cos;
    const limitY = (win.h / 2) * HEIGHT_USE;
    const spare = limitY * limitY - a * a * sin * sin;
    const b = Math.max(win.h * 0.06, (ring.depth * Math.sqrt(Math.max(0, spare))) / cos);
    return {a, b};
}

/** A ring's path data at a tilt: the whole ellipse, and its near (lower) half. */
function ringPaths(win: Box, {a, b}: RingSize, tiltDeg: number) {
    const theta = (tiltDeg * Math.PI) / 180;
    const cx = win.x + win.w / 2;
    const cy = win.y + win.h / 2;
    const dx = a * Math.cos(theta);
    const dy = a * Math.sin(theta);
    const arc = `A${a.toFixed(2)} ${b.toFixed(2)} ${tiltDeg.toFixed(3)} 0 1`;
    const right = `${(cx + dx).toFixed(2)} ${(cy + dy).toFixed(2)}`;
    const left = `${(cx - dx).toFixed(2)} ${(cy - dy).toFixed(2)}`;
    // From the right end, clockwise on screen, is through the lower (near) side to the left end.
    return {
        whole: `M${right}${arc} ${left}${arc} ${right}Z`,
        near: `M${right}${arc} ${left}`,
    };
}

function element<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string>) {
    const node = document.createElementNS(SVG, name);
    for (const [key, value] of Object.entries(attrs)) {
        node.setAttribute(key, value);
    }
    return node;
}

/** Draws the rings into the stage frame's two `.orbit` layers and keeps them fitted. */
export function setupOrbits(frame: HTMLElement) {
    const back = frame.querySelector<SVGSVGElement>('.orbit-back');
    const front = frame.querySelector<SVGSVGElement>('.orbit-front');
    const view = frame.querySelector<HTMLElement>('.stage-view');
    if (!back || !front || !view) {
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
    const clipRect = element('rect', {});
    const clip = element('clipPath', {id: CLIP_ID});
    clip.append(clipRect);
    back.append(element('defs', {}));
    back.firstElementChild!.append(ramp);
    front.append(element('defs', {}));
    front.firstElementChild!.append(clip);

    const backPaths = RINGS.map(() => back.appendChild(element('path', {})));
    const frontGroup = front.appendChild(element('g', {'clip-path': `url(#${CLIP_ID})`}));
    const frontPaths = RINGS.map(() => frontGroup.appendChild(element('path', {})));

    let win: Box = {x: 0, y: 0, w: 0, h: 0};
    let sizes: RingSize[] = [];

    const measure = () => {
        const f = frame.getBoundingClientRect();
        const v = view.getBoundingClientRect();
        win = {x: v.left - f.left, y: v.top - f.top, w: v.width, h: v.height};
        for (const svg of [back, front]) {
            svg.setAttribute('viewBox', `0 0 ${f.width.toFixed(2)} ${f.height.toFixed(2)}`);
        }
        clipRect.setAttribute('x', win.x.toFixed(2));
        clipRect.setAttribute('y', win.y.toFixed(2));
        clipRect.setAttribute('width', win.w.toFixed(2));
        clipRect.setAttribute('height', win.h.toFixed(2));
        // The room the ends may take: up to the viewport's edge on either side, less a hair.
        const page = document.documentElement.clientWidth;
        const room = Math.max(0, Math.min(v.left, page - v.right) - 2);
        sizes = RINGS.map((ring) => ringSize(win, ring, room));
        const span = Math.max(...sizes.map((size) => size.a));
        const cx = win.x + win.w / 2;
        ramp.setAttribute('x1', (cx - span).toFixed(2));
        ramp.setAttribute('x2', (cx + span).toFixed(2));
    };

    const draw = (seconds: number) => {
        if (win.w === 0) {
            return;
        }
        RINGS.forEach((ring, i) => {
            const tilt = ring.tilt + ring.sway * Math.sin((2 * Math.PI * seconds) / ring.period + ring.phase);
            const paths = ringPaths(win, sizes[i], tilt);
            backPaths[i].setAttribute('d', paths.whole);
            frontPaths[i].setAttribute('d', paths.near);
        });
    };

    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let onScreen = true;
    let frameId = 0;
    const tick = (now: number) => {
        draw(now / 1000);
        frameId = onScreen && !still?.matches ? requestAnimationFrame(tick) : 0;
    };
    const restart = () => {
        if (frameId) {
            cancelAnimationFrame(frameId);
            frameId = 0;
        }
        tick(performance.now());
    };

    measure();
    restart();
    new ResizeObserver(() => {
        measure();
        draw(performance.now() / 1000);
    }).observe(view);
    window.addEventListener('resize', () => {
        measure();
        draw(performance.now() / 1000);
    });
    still?.addEventListener('change', restart);
    new IntersectionObserver((entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting);
        if (onScreen && !frameId) {
            restart();
        }
    }).observe(frame);
}
