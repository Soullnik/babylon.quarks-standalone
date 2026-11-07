import {RawTexture} from '@babylonjs/core/Materials/Textures/rawTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Color3} from '@babylonjs/core/Maths/math.color';
import type {Scene} from '@babylonjs/core/scene';

/**
 * The examples' base texture set, `public/textures/base/`: greyscale (value in RGB, coverage in
 * alpha), so a particle's colour or a gradient map tints them. Made outside this repository: the
 * smoke and dust puffs, fire, flash, bolts, streak, glint, ring, swirl, fibers and aura strip from
 * Kenney's CC0 particle packs (kenney.nl), the plain shapes (glow, spark, disc, leaf, glyphs) drawn
 * with numpy; each sheet's grid is listed here.
 */
export const BASE = {
    glow: {cols: 1, rows: 1},
    spark: {cols: 1, rows: 1},
    ring: {cols: 1, rows: 1},
    streak: {cols: 1, rows: 1},
    glint: {cols: 1, rows: 1},
    swirl: {cols: 1, rows: 1},
    fibers: {cols: 1, rows: 1},
    disc: {cols: 1, rows: 1},
    leaf: {cols: 1, rows: 1},
    bolts: {cols: 1, rows: 8},
    aura_strip: {cols: 1, rows: 1},
    smoke_puff: {cols: 4, rows: 4},
    dust_puff: {cols: 4, rows: 4},
    flash: {cols: 4, rows: 2},
    fire: {cols: 4, rows: 4},
    glyphs: {cols: 4, rows: 4},
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
 * The VFX set made from Kenney's CC0 packs (kenney.nl), `public/textures/kenney/`: smoke, flame,
 * lightning and light photographed and painted for effects, cut into sheets outside this
 * repository. Greyscale as the base set: light in the alpha of white for the glows, bolts, webs,
 * stars and streaks; the value in RGB and alpha for the gas, which a gradient map colours; shading
 * and coverage for the puffs.
 */
export const KENNEY = {
    /** Gas streaming along U, brightest at V = 0; tiles along U, for a disk scrolled round. */
    gas: {cols: 1, rows: 1},
    /** Four wisps of flame and smoke. */
    wisps: {cols: 2, rows: 2},
    /** Four webs of crackling electricity. */
    webs: {cols: 2, rows: 2},
    /** Four bolts across the cell, from the left edge to the right, one per row. */
    bolts: {cols: 1, rows: 4},
    /** Four wavering streaks along U, one per row, for stretched billboards. */
    traces: {cols: 1, rows: 4},
    /** Four stars and a flare. */
    stars: {cols: 2, rows: 2},
    /** Twenty-five smoke puffs, for a random one each. */
    puffs: {cols: 5, rows: 5},
    /** Four shafts of light rising from the bottom edge, tall cells side by side. */
    shafts: {cols: 4, rows: 1},
    /**
     * Streaks and cracks running up a spike or crystal, brighter toward the tip (V = 1); seamless
     * round it (U), for a gradient map.
     */
    veins: {cols: 1, rows: 1},
} as const;

export type KenneyTexture = keyof typeof KENNEY;

/** A texture of the Kenney set, clamped unless `wrap` (U) or `wrapV`. */
export function kenneyTexture(scene: Scene, name: KenneyTexture, wrap = false, wrapV = false): Texture {
    const texture = new Texture(`textures/kenney/${name}.png`, scene);
    texture.name = `kenney/${name}`;
    texture.wrapU = wrap ? Texture.WRAP_ADDRESSMODE : Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = wrapV ? Texture.WRAP_ADDRESSMODE : Texture.CLAMP_ADDRESSMODE;
    return texture;
}

/** The sheet layout of a Kenney texture, as a system's tile settings. */
export function kenneySheet(name: KenneyTexture): {uTileCount: number; vTileCount: number} {
    return {uTileCount: KENNEY[name].cols, vTileCount: KENNEY[name].rows};
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
