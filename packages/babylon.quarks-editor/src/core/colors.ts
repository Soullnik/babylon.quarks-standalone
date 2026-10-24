import type {Behavior} from 'babylon.quarks';
import {ColorOverLife, Gradient} from 'babylon.quarks';

/** One RGBA stop of the editable gradient (all channels 0..1, pos 0..1). */
export interface GradientStop {
    /** Where the stop sits over the particle's life, 0..1. */
    pos: number;
    /** Red, 0..1. */
    r: number;
    /** Green, 0..1. */
    g: number;
    /** Blue, 0..1. */
    b: number;
    /** Alpha, 0..1. */
    a: number;
}

/** The gradient a new Color over Lifetime starts with: warm yellow fading out through red. */
export const DEFAULT_GRADIENT_STOPS: GradientStop[] = [
    {pos: 0, r: 1, g: 0.85, b: 0.4, a: 1},
    {pos: 1, r: 1, g: 0.25, b: 0.05, a: 0},
];

/** A quarks gradient through `stops`, sorted by position; colour and alpha share the stops. */
export function buildGradient(stops: GradientStop[]): Gradient {
    const sorted = [...stops].sort((a, b) => a.pos - b.pos);
    return new Gradient(
        sorted.map((s) => [{r: s.r, g: s.g, b: s.b}, s.pos] as [{r: number; g: number; b: number}, number]),
        sorted.map((s) => [s.a, s.pos] as [number, number])
    );
}

/** A Color over Lifetime behavior through `stops`. */
export function buildColorOverLife(stops: GradientStop[]): ColorOverLife {
    return new ColorOverLife(buildGradient(stops));
}

/** A stop's colour as CSS `rgba()`. */
export function stopToCss(stop: GradientStop): string {
    const c = (v: number) => Math.round(v * 255);
    return `rgba(${c(stop.r)}, ${c(stop.g)}, ${c(stop.b)}, ${stop.a.toFixed(2)})`;
}

/** The stops as a left-to-right CSS `linear-gradient`, for a gradient preview. */
export function stopsToCssGradient(stops: GradientStop[]): string {
    const sorted = [...stops].sort((a, b) => a.pos - b.pos);
    const parts = sorted.map((s) => `${stopToCss(s)} ${(s.pos * 100).toFixed(1)}%`);
    return `linear-gradient(90deg, ${parts.join(', ')})`;
}

/** A `#rrggbb` colour as channels 0..1. */
export function hexToRgb(hex: string): {
    /** Red, 0..1. */
    r: number;
    /** Green, 0..1. */
    g: number;
    /** Blue, 0..1. */
    b: number;
} {
    const value = hex.replace('#', '');
    return {
        r: parseInt(value.slice(0, 2), 16) / 255,
        g: parseInt(value.slice(2, 4), 16) / 255,
        b: parseInt(value.slice(4, 6), 16) / 255,
    };
}

/** Channels 0..1, clamped, as a `#rrggbb` colour. */
export function rgbToHex(r: number, g: number, b: number): string {
    const c = (v: number) =>
        Math.round(Math.min(1, Math.max(0, v)) * 255)
            .toString(16)
            .padStart(2, '0');
    return `#${c(r)}${c(g)}${c(b)}`;
}

/** Reads RGBA stops back from a Gradient (union of color/alpha key positions). */
export function readGradientStops(gradient: Gradient): GradientStop[] {
    const positions = new Set<number>();
    for (const [, pos] of gradient.color.keys) {
        positions.add(Math.round(pos * 1000) / 1000);
    }
    for (const [, pos] of gradient.alpha.keys) {
        positions.add(Math.round(pos * 1000) / 1000);
    }
    return [...positions]
        .sort((a, b) => a - b)
        .map((pos) => {
            const {r, g, b, a} = gradient.evaluate(pos);
            return {pos, r, g, b, a};
        });
}

/** Finds a behavior of the given quarks type string (e.g. 'ColorOverLife'). */
export function findBehavior<T extends Behavior>(behaviors: Behavior[], type: string): T | undefined {
    return behaviors.find((b) => (b as {type?: string}).type === type) as T | undefined;
}
