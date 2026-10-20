/**
 * Texture effects shared by the sprite, mesh and trail fragment shaders, in
 * both shader languages: UV scrolling, a gradient map and alpha erosion.
 *
 * - `UV_SCROLL`: `uvScrollOffset` (already wrapped to 0…1 on the CPU, so it
 *   never loses precision) is added to the map's UV. The texture should wrap
 *   (repeat); scrolling a tile of a sheet runs into its neighbours.
 * - `GRADIENT_MAP`: the map's red channel picks a colour along U of
 *   `gradientMap`, whose alpha multiplies the map's. A greyscale texture is
 *   then recoloured by a ramp, and the particle colour still tints it.
 *   `gradientMapRange` keeps the lookup between the first and last texel
 *   centres. Make the ramp without mipmaps: the lookup's UV jumps with the
 *   map's detail, and the hardware would pick a blurred mip for it.
 * - `EROSION`: the particle's alpha stops being a transparency and becomes how
 *   much of the shape is left. A fragment shows where the mask (the red
 *   channel of `erosionMask` under `EROSION_MASK`, the map's alpha otherwise)
 *   is above the cut that alpha sets: alpha 1 shows everything the map shows,
 *   alpha 0 nothing, and on the way down the shape eats away from its lowest
 *   mask values first — a noise mask dissolves it, a gradient mask wipes it.
 *   `erosionParams` is (softness, edge width, mask offset u, mask offset v),
 *   the edge band just above the cut glows in `erosionEdgeColor`. The mask is
 *   sampled with the particle's UV as drawn, which on a sprite sheet is the
 *   current tile's. Erosion only changes alpha, so blend modes that ignore
 *   alpha (one-one, premultiplied) show a hard cut.
 */

/** Fragment-side declarations, GLSL. */
export const surfaceFragmentDeclarationGLSL = /* glsl */ `
#ifdef UV_SCROLL
uniform vec2 uvScrollOffset;
#endif
#ifdef GRADIENT_MAP
uniform sampler2D gradientMap;
uniform vec2 gradientMapRange;
#endif
#ifdef EROSION
uniform vec4 erosionParams;
uniform vec3 erosionEdgeColor;
#ifdef EROSION_MASK
uniform sampler2D erosionMask;
#endif

vec4 quarksErode(vec4 color, float level, float mask) {
    float softness = erosionParams.x;
    float edgeWidth = erosionParams.y;
    // At level 1 the cut sits below the lowest mask value by the soft band
    // and the edge band, so nothing is cut and no edge shows; at level 0 above
    // the highest. The edge then grows in as the cut rises, rather than popping.
    float cut = mix(-(softness + edgeWidth), 1.0, 1.0 - level);
    float visible = smoothstep(cut, cut + softness, mask);
    if (edgeWidth > 0.0) {
        float edge = 1.0 - smoothstep(cut + softness, cut + softness + edgeWidth, mask);
        color.rgb += erosionEdgeColor * edge;
    }
    color.a *= visible;
    return color;
}
#endif
`;

/**
 * Declares `baseColor` from `vColor` and the map, with the effects applied,
 * GLSL. `tileBlend` adds the second tile of `TILE_BLEND`.
 */
export function surfaceColorGLSL(tileBlend: boolean): string {
    return /* glsl */ `
    vec4 baseColor = vColor;
#ifdef UV_SCROLL
    vec2 mapUV = vUV + uvScrollOffset;
#else
    vec2 mapUV = vUV;
#endif
#ifdef EROSION
    float erosionLevel = baseColor.a;
    baseColor.a = 1.0;
    float erosionMaskValue = 1.0;
#endif
#ifdef USE_MAP
    vec4 texColor = texture2D(map, mapUV);
    ${
        tileBlend
            ? `#ifdef TILE_BLEND
    #ifdef UV_SCROLL
        vec4 texColor2 = texture2D(map, vUV2 + uvScrollOffset);
    #else
        vec4 texColor2 = texture2D(map, vUV2);
    #endif
        texColor = mix(texColor, texColor2, vTileBlend);
    #endif`
            : ''
    }
    #ifdef GRADIENT_MAP
        vec4 ramp = texture2D(gradientMap, vec2(mix(gradientMapRange.x, gradientMapRange.y, clamp(texColor.r, 0.0, 1.0)), 0.5));
        texColor = vec4(ramp.rgb, ramp.a * texColor.a);
    #endif
    #ifdef EROSION
        erosionMaskValue = texColor.a;
    #endif
    baseColor *= texColor;
#endif
#ifdef EROSION
    #ifdef EROSION_MASK
        erosionMaskValue = texture2D(erosionMask, vUV + erosionParams.zw).r;
    #endif
    baseColor = quarksErode(baseColor, erosionLevel, erosionMaskValue);
#endif
`;
}

/** Fragment-side declarations, WGSL. */
export const surfaceFragmentDeclarationWGSL = /* wgsl */ `
#ifdef UV_SCROLL
uniform uvScrollOffset: vec2f;
#endif
#ifdef GRADIENT_MAP
var gradientMapSampler: sampler;
var gradientMap: texture_2d<f32>;
uniform gradientMapRange: vec2f;
#endif
#ifdef EROSION
uniform erosionParams: vec4f;
uniform erosionEdgeColor: vec3f;
#ifdef EROSION_MASK
var erosionMaskSampler: sampler;
var erosionMask: texture_2d<f32>;
#endif

fn quarksErode(colorIn: vec4f, level: f32, mask: f32) -> vec4f {
    var color = colorIn;
    let softness = uniforms.erosionParams.x;
    let edgeWidth = uniforms.erosionParams.y;
    let cut = mix(-(softness + edgeWidth), 1.0, 1.0 - level);
    let visible = smoothstep(cut, cut + softness, mask);
    if (edgeWidth > 0.0) {
        let edge = 1.0 - smoothstep(cut + softness, cut + softness + edgeWidth, mask);
        color = vec4f(color.rgb + uniforms.erosionEdgeColor * edge, color.a);
    }
    color.a *= visible;
    return color;
}
#endif
`;

/** Declares `baseColor` from `vColor` and the map, with the effects applied, WGSL. */
export function surfaceColorWGSL(tileBlend: boolean): string {
    return /* wgsl */ `
    var baseColor = fragmentInputs.vColor;
#ifdef UV_SCROLL
    let mapUV = fragmentInputs.vUV + uniforms.uvScrollOffset;
#else
    let mapUV = fragmentInputs.vUV;
#endif
#ifdef EROSION
    let erosionLevel = baseColor.a;
    baseColor.a = 1.0;
    var erosionMaskValue = 1.0;
#endif
#ifdef USE_MAP
    var texColor = textureSample(map, mapSampler, mapUV);
    ${
        tileBlend
            ? `#ifdef TILE_BLEND
    #ifdef UV_SCROLL
        let texColor2 = textureSample(map, mapSampler, fragmentInputs.vUV2 + uniforms.uvScrollOffset);
    #else
        let texColor2 = textureSample(map, mapSampler, fragmentInputs.vUV2);
    #endif
        texColor = mix(texColor, texColor2, fragmentInputs.vTileBlend);
    #endif`
            : ''
    }
    #ifdef GRADIENT_MAP
        let ramp = textureSample(gradientMap, gradientMapSampler, vec2f(mix(uniforms.gradientMapRange.x, uniforms.gradientMapRange.y, clamp(texColor.r, 0.0, 1.0)), 0.5));
        texColor = vec4f(ramp.rgb, ramp.a * texColor.a);
    #endif
    #ifdef EROSION
        erosionMaskValue = texColor.a;
    #endif
    baseColor *= texColor;
#endif
#ifdef EROSION
    #ifdef EROSION_MASK
        erosionMaskValue = textureSample(erosionMask, erosionMaskSampler, fragmentInputs.vUV + uniforms.erosionParams.zw).r;
    #endif
    baseColor = quarksErode(baseColor, erosionLevel, erosionMaskValue);
#endif
`;
}
