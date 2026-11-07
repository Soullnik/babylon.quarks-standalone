import {RawTexture} from '@babylonjs/core/Materials/Textures/rawTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Color3} from '@babylonjs/core/Maths/math.color';
import type {Scene} from '@babylonjs/core/scene';

/**
 * The examples' base texture set, `public/textures/base/`: greyscale (value in RGB, coverage in
 * alpha), so a particle's colour or a gradient map tints them. Made outside this repository by
 * the quarks-base generators (Blender and numpy); each sheet's grid is listed here.
 */
export const BASE = {
    glow: {cols: 1, rows: 1},
    spark: {cols: 1, rows: 1},
    ring: {cols: 1, rows: 1},
    streak: {cols: 1, rows: 1},
    glint: {cols: 1, rows: 1},
    swirl: {cols: 1, rows: 1},
    fibers: {cols: 1, rows: 1},
    ring_fibers: {cols: 1, rows: 1},
    disc: {cols: 1, rows: 1},
    leaf: {cols: 1, rows: 1},
    bolts: {cols: 1, rows: 8},
    aura_strip: {cols: 1, rows: 1},
    smoke_puff: {cols: 4, rows: 4},
    dust_puff: {cols: 4, rows: 4},
    flash: {cols: 4, rows: 2},
    fire: {cols: 4, rows: 4},
} as const;

export type BaseTexture = keyof typeof BASE;

/**
 * A texture of the base set. Clamped by default, as sprites and sheets want; `wrap` repeats it,
 * for a tile scrolled with `mapUV`, and `wrapV` (as `wrap` by default) decides V apart: a strip
 * that tiles round a band but must not repeat up it.
 */
export function baseTexture(scene: Scene, name: BaseTexture, wrap = false, wrapV = wrap): Texture {
    const texture = new Texture(`textures/base/${name}.png`, scene);
    texture.name = name;
    texture.wrapU = wrap ? Texture.WRAP_ADDRESSMODE : Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = wrapV ? Texture.WRAP_ADDRESSMODE : Texture.CLAMP_ADDRESSMODE;
    return texture;
}

/** The sheet layout of a base texture, as a system's tile settings. */
export function sheetOf(name: BaseTexture): {uTileCount: number; vTileCount: number} {
    return {uTileCount: BASE[name].cols, vTileCount: BASE[name].rows};
}

/**
 * A colour ramp for `gradientMap`: a row of `width` texels through the stops `[t, '#rrggbb',
 * alpha]`, straight between them, clamped.
 */
export function rampTexture(
    scene: Scene,
    name: string,
    stops: readonly (readonly [number, string, number?])[],
    width = 256
): RawTexture {
    const data = new Uint8Array(width * 4);
    for (let x = 0; x < width; x++) {
        const t = x / (width - 1);
        let i = 0;
        while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
        const [t0, c0, a0 = 1] = stops[i];
        const [t1, c1, a1 = 1] = stops[Math.min(i + 1, stops.length - 1)];
        const k = t1 > t0 ? Math.min(Math.max((t - t0) / (t1 - t0), 0), 1) : 0;
        const from = Color3.FromHexString(c0);
        const to = Color3.FromHexString(c1);
        data[x * 4] = Math.round((from.r + (to.r - from.r) * k) * 255);
        data[x * 4 + 1] = Math.round((from.g + (to.g - from.g) * k) * 255);
        data[x * 4 + 2] = Math.round((from.b + (to.b - from.b) * k) * 255);
        data[x * 4 + 3] = Math.round((a0 + (a1 - a0) * k) * 255);
    }
    const texture = RawTexture.CreateRGBATexture(data, width, 1, scene, false, false, Texture.BILINEAR_SAMPLINGMODE);
    texture.name = name;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    return texture;
}
