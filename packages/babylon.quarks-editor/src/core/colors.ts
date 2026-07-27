import type {Behavior} from 'babylon.quarks';
import {ColorOverLife, Gradient, Vector3, Vector4} from 'babylon.quarks';

/** One RGBA stop of the editable gradient (all channels 0..1, pos 0..1). */
export interface GradientStop {
    pos: number;
    r: number;
    g: number;
    b: number;
    a: number;
}

export const DEFAULT_GRADIENT_STOPS: GradientStop[] = [
    {pos: 0, r: 1, g: 0.85, b: 0.4, a: 1},
    {pos: 1, r: 1, g: 0.25, b: 0.05, a: 0},
];

export function buildGradient(stops: GradientStop[]): Gradient {
    const sorted = [...stops].sort((a, b) => a.pos - b.pos);
    return new Gradient(
        sorted.map((s) => [new Vector3(s.r, s.g, s.b), s.pos] as [Vector3, number]),
        sorted.map((s) => [s.a, s.pos] as [number, number])
    );
}

export function buildColorOverLife(stops: GradientStop[]): ColorOverLife {
    return new ColorOverLife(buildGradient(stops));
}

export function rgbaToVector4(stop: {r: number; g: number; b: number; a: number}): Vector4 {
    return new Vector4(stop.r, stop.g, stop.b, stop.a);
}

export function stopToCss(stop: GradientStop): string {
    const c = (v: number) => Math.round(v * 255);
    return `rgba(${c(stop.r)}, ${c(stop.g)}, ${c(stop.b)}, ${stop.a.toFixed(2)})`;
}

export function stopsToCssGradient(stops: GradientStop[]): string {
    const sorted = [...stops].sort((a, b) => a.pos - b.pos);
    const parts = sorted.map((s) => `${stopToCss(s)} ${(s.pos * 100).toFixed(1)}%`);
    return `linear-gradient(90deg, ${parts.join(', ')})`;
}

export function hexToRgb(hex: string): {r: number; g: number; b: number} {
    const value = hex.replace('#', '');
    return {
        r: parseInt(value.slice(0, 2), 16) / 255,
        g: parseInt(value.slice(2, 4), 16) / 255,
        b: parseInt(value.slice(4, 6), 16) / 255,
    };
}

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
    const color = new Vector3();
    return [...positions]
        .sort((a, b) => a - b)
        .map((pos) => {
            gradient.color.genValue(color, pos);
            const alpha = gradient.alpha.genValue(0, pos);
            return {pos, r: color.x, g: color.y, b: color.z, a: alpha};
        });
}

/** Finds a behavior of the given quarks type string (e.g. 'ColorOverLife'). */
export function findBehavior<T extends Behavior>(behaviors: Behavior[], type: string): T | undefined {
    return behaviors.find((b) => (b as {type?: string}).type === type) as T | undefined;
}
