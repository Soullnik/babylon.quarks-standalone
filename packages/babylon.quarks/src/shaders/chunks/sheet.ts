/**
 * The flipbook (sprite sheet) cell for the sprite, stretched and mesh vertex
 * shaders, in both shader languages: Unity's Texture Sheet Animation, Unreal's
 * SubUV.
 *
 * `uvTile` is the particle's frame, counted along the rows from the top-left
 * cell; `tileCountX` and `tileCountY` are the sheet's columns and rows. The
 * frame is wrapped into the sheet, so a frame past the last cell starts over
 * and a negative one counts back from the end, in both languages alike (the
 * WGSL `%` truncates where GLSL's `mod` floors, so the wrap is spelled out).
 * Under `TILE_BLEND` the next frame, wrapped the same way, is passed with the
 * fraction between the two, for the fragment to cross-fade (Unity's flipbook
 * blending).
 */

/**
 * The cell of `frame` on a sheet of `columns` × `rows`, counted along the rows
 * from the top-left cell and wrapped into the sheet, as the shaders count it.
 * For a host that lays its cells out on the CPU, such as the trail.
 */
export function sheetCell(frame: number, columns: number, rows: number): {column: number; row: number} {
    const total = columns * rows;
    const tile = wrap(Math.floor(frame), total);
    return {column: wrap(tile, columns), row: Math.floor(tile / columns)};
}

/** A floored modulo, as GLSL's `mod`: never negative for a positive divisor. */
function wrap(value: number, divisor: number): number {
    return value - divisor * Math.floor(value / divisor);
}

/** Vertex-side declarations, GLSL: the sheet's size and the cell varyings. */
export const sheetVertexDeclarationGLSL = /* glsl */ `
#ifdef UV_TILE
uniform float tileCountX;
uniform float tileCountY;
#endif
#ifdef TILE_BLEND
varying vec2 vUV2;
varying float vTileBlend;
#endif
`;

/**
 * Writes `vUV` (and the blend varyings) from the quad UV expression `uv` and the
 * frame `uvTile`, GLSL.
 */
export function sheetVertexGLSL(uv: string): string {
    return /* glsl */ `
#ifdef UV_TILE
    {
        vec2 tc = vec2(tileCountX, tileCountY);
        float tileTotal = tc.x * tc.y;
        float baseTile = mod(floor(uvTile), tileTotal);
        vec2 tileUV = vec2(mod(baseTile, tc.x), tc.y - 1.0 - floor(baseTile / tc.x)) / tc;
        vUV = ${uv} / tc + tileUV;
#ifdef TILE_BLEND
        float nextTile = mod(baseTile + 1.0, tileTotal);
        vec2 nextUV = vec2(mod(nextTile, tc.x), tc.y - 1.0 - floor(nextTile / tc.x)) / tc;
        vUV2 = ${uv} / tc + nextUV;
        vTileBlend = fract(uvTile);
#endif
    }
#else
    vUV = ${uv};
#endif
`;
}

/** Vertex-side declarations, WGSL: the sheet's size and the cell varyings. */
export const sheetVertexDeclarationWGSL = /* wgsl */ `
#ifdef UV_TILE
uniform tileCountX: f32;
uniform tileCountY: f32;

// A floored modulo, as GLSL's mod: never negative for a positive divisor.
fn quarksWrap(value: f32, divisor: f32) -> f32 {
    return value - divisor * floor(value / divisor);
}
#endif
#ifdef TILE_BLEND
varying vUV2: vec2f;
varying vTileBlend: f32;
#endif
`;

/**
 * Writes `vertexOutputs.vUV` (and the blend varyings) from the quad UV
 * expression `uv` and the frame `vertexInputs.uvTile`, WGSL.
 */
export function sheetVertexWGSL(uv: string): string {
    return /* wgsl */ `
#ifdef UV_TILE
    {
        let tc = vec2f(uniforms.tileCountX, uniforms.tileCountY);
        let tileTotal = tc.x * tc.y;
        let baseTile = quarksWrap(floor(vertexInputs.uvTile), tileTotal);
        let tileUV = vec2f(quarksWrap(baseTile, tc.x), tc.y - 1.0 - floor(baseTile / tc.x)) / tc;
        vertexOutputs.vUV = ${uv} / tc + tileUV;
#ifdef TILE_BLEND
        let nextTile = quarksWrap(baseTile + 1.0, tileTotal);
        let nextUV = vec2f(quarksWrap(nextTile, tc.x), tc.y - 1.0 - floor(nextTile / tc.x)) / tc;
        vertexOutputs.vUV2 = ${uv} / tc + nextUV;
        vertexOutputs.vTileBlend = fract(vertexInputs.uvTile);
#endif
    }
#else
    vertexOutputs.vUV = ${uv};
#endif
`;
}
