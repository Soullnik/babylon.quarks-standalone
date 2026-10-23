/**
 * Texture effects shared by the sprite, mesh and trail fragment shaders, in
 * both shader languages: UV scrolling, UV distortion, a gradient map and
 * alpha erosion.
 *
 * - `UV1`: the vertex shader passes `vUV1`, the particle's own UV that the
 *   sprite sheet never moves (see `UVChannel`). The distortion noise and the
 *   erosion mask read it under `UV_DISTORTION_UV1` / `EROSION_MASK_UV1`, the
 *   map's UV (`vUV`) otherwise.
 * - Each texture can be laid by a transform, `(tiling u, tiling v, offset u,
 *   offset v)`: sampled at `uv * transform.xy + transform.zw`, the offset
 *   holding its scroll, wrapped on the CPU so it never loses precision (see
 *   `TextureUV`).
 * - `MAP_TRANSFORM`: the map is laid by `mapTransform`, on `vUV1` under
 *   `MAP_UV1` (where the sheet's second tile is not blended, the sheet not
 *   applying), on the sheet's UV otherwise, where a scroll runs into the
 *   neighbouring tiles.
 * - `UV_DISTORTION`: the map's UV is pushed about by a noise texture
 *   (`distortionMap`, red and green around 0.5, laid by `distortionTransform`)
 *   by up to `distortionStrength` UV units: the heat shimmer, licking and
 *   breathing of fire and auras. On a sprite sheet the pushed UV can reach
 *   the neighbouring tile.
 * - `GRADIENT_MAP`: the map's texel dotted with `gradientMapChannel` (one
 *   channel, or luminance weights) picks a colour along U of `gradientMap`.
 *   The ramp's alpha multiplies the map's, or replaces it when the lookup is
 *   by alpha (`gradientMapChannel.a` 1). The particle colour still tints the
 *   result. `gradientMapRange` keeps the lookup between the first and last
 *   texel centres. Make the ramp without mipmaps: the lookup's UV jumps with
 *   the map's detail, and the hardware would pick a blurred mip for it.
 * - `EROSION`: the particle's alpha stops being a transparency and becomes how
 *   much of the shape is left. A fragment shows where the mask (the red
 *   channel of `erosionMask` under `EROSION_MASK`, laid by
 *   `erosionMaskTransform`; the map's alpha otherwise) is above the cut that
 *   alpha sets: alpha 1 shows everything the map shows, alpha 0 nothing, and
 *   on the way down the shape eats away from its lowest mask values first — a
 *   noise mask dissolves it, a gradient mask wipes it. `erosionParams` is
 *   (softness, edge width); the edge band just above the cut glows in
 *   `erosionEdgeColor`. Erosion only changes alpha, which the blend resolve
 *   (`blend.ts`) turns into coverage in every blend mode.
 */

/** Fragment-side declarations, GLSL. */
export const surfaceFragmentDeclarationGLSL = /* glsl */ `
#ifdef MAP_TRANSFORM
uniform vec4 mapTransform;
#endif
#ifdef UV_DISTORTION
uniform sampler2D distortionMap;
uniform vec4 distortionTransform;
uniform float distortionStrength;
#endif
#ifdef GRADIENT_MAP
uniform sampler2D gradientMap;
uniform vec2 gradientMapRange;
uniform vec4 gradientMapChannel;
#endif
#ifdef EROSION
uniform vec2 erosionParams;
uniform vec3 erosionEdgeColor;
#ifdef EROSION_MASK
uniform sampler2D erosionMask;
uniform vec4 erosionMaskTransform;
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
#if defined(MAP_TRANSFORM) && defined(MAP_UV1)
    vec2 mapUV = vUV1 * mapTransform.xy + mapTransform.zw;
#elif defined(MAP_TRANSFORM)
    vec2 mapUV = vUV * mapTransform.xy + mapTransform.zw;
#else
    vec2 mapUV = vUV;
#endif
#ifdef UV_DISTORTION
    #ifdef UV_DISTORTION_UV1
        vec2 distortionUV = vUV1;
    #else
        vec2 distortionUV = vUV;
    #endif
    vec2 distortion = (texture2D(distortionMap, distortionUV * distortionTransform.xy + distortionTransform.zw).rg - 0.5) * 2.0 * distortionStrength;
    mapUV += distortion;
#endif
#ifdef EROSION
    float erosionLevel = baseColor.a;
    baseColor.a = 1.0;
    float erosionMaskValue = 1.0;
#endif
#if defined(USE_MAP) || defined(GRADIENT_MAP)
#ifdef USE_MAP
    vec4 texColor = texture2D(map, mapUV);
    ${
        tileBlend
            ? `#ifdef TILE_BLEND
    #if defined(MAP_TRANSFORM) && defined(MAP_UV1)
        vec2 mapUV2 = mapUV;
    #else
        #ifdef MAP_TRANSFORM
            vec2 mapUV2 = vUV2 * mapTransform.xy + mapTransform.zw;
        #else
            vec2 mapUV2 = vUV2;
        #endif
        #ifdef UV_DISTORTION
            mapUV2 += distortion;
        #endif
    #endif
        vec4 texColor2 = texture2D(map, mapUV2);
        texColor = mix(texColor, texColor2, vTileBlend);
    #endif`
            : ''
    }
#else
    // No map: the ramp is looked up at white, its far end.
    vec4 texColor = vec4(1.0);
#endif
    #ifdef GRADIENT_MAP
        float rampAt = clamp(dot(texColor, gradientMapChannel), 0.0, 1.0);
        vec4 ramp = texture2D(gradientMap, vec2(mix(gradientMapRange.x, gradientMapRange.y, rampAt), 0.5));
        texColor = vec4(ramp.rgb, ramp.a * mix(texColor.a, 1.0, gradientMapChannel.a));
    #endif
    #ifdef EROSION
        erosionMaskValue = texColor.a;
    #endif
    baseColor *= texColor;
#endif
#ifdef EROSION
    #ifdef EROSION_MASK
        #ifdef EROSION_MASK_UV1
            vec2 erosionUV = vUV1;
        #else
            vec2 erosionUV = vUV;
        #endif
        erosionMaskValue = texture2D(erosionMask, erosionUV * erosionMaskTransform.xy + erosionMaskTransform.zw).r;
    #endif
    baseColor = quarksErode(baseColor, erosionLevel, erosionMaskValue);
#endif
`;
}

/** Fragment-side declarations, WGSL. */
export const surfaceFragmentDeclarationWGSL = /* wgsl */ `
#ifdef MAP_TRANSFORM
uniform mapTransform: vec4f;
#endif
#ifdef UV_DISTORTION
var distortionMapSampler: sampler;
var distortionMap: texture_2d<f32>;
uniform distortionTransform: vec4f;
uniform distortionStrength: f32;
#endif
#ifdef GRADIENT_MAP
var gradientMapSampler: sampler;
var gradientMap: texture_2d<f32>;
uniform gradientMapRange: vec2f;
uniform gradientMapChannel: vec4f;
#endif
#ifdef EROSION
uniform erosionParams: vec2f;
uniform erosionEdgeColor: vec3f;
#ifdef EROSION_MASK
var erosionMaskSampler: sampler;
var erosionMask: texture_2d<f32>;
uniform erosionMaskTransform: vec4f;
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
#if defined(MAP_TRANSFORM) && defined(MAP_UV1)
    var mapUV = fragmentInputs.vUV1 * uniforms.mapTransform.xy + uniforms.mapTransform.zw;
#elif defined(MAP_TRANSFORM)
    var mapUV = fragmentInputs.vUV * uniforms.mapTransform.xy + uniforms.mapTransform.zw;
#else
    var mapUV = fragmentInputs.vUV;
#endif
#ifdef UV_DISTORTION
    #ifdef UV_DISTORTION_UV1
        let distortionUV = fragmentInputs.vUV1;
    #else
        let distortionUV = fragmentInputs.vUV;
    #endif
    let distortion = (textureSample(distortionMap, distortionMapSampler, distortionUV * uniforms.distortionTransform.xy + uniforms.distortionTransform.zw).rg - 0.5) * 2.0 * uniforms.distortionStrength;
    mapUV += distortion;
#endif
#ifdef EROSION
    let erosionLevel = baseColor.a;
    baseColor.a = 1.0;
    var erosionMaskValue = 1.0;
#endif
#if defined(USE_MAP) || defined(GRADIENT_MAP)
#ifdef USE_MAP
    var texColor = textureSample(map, mapSampler, mapUV);
    ${
        tileBlend
            ? `#ifdef TILE_BLEND
    #if defined(MAP_TRANSFORM) && defined(MAP_UV1)
        let mapUV2 = mapUV;
    #else
        #ifdef MAP_TRANSFORM
            var mapUV2 = fragmentInputs.vUV2 * uniforms.mapTransform.xy + uniforms.mapTransform.zw;
        #else
            var mapUV2 = fragmentInputs.vUV2;
        #endif
        #ifdef UV_DISTORTION
            mapUV2 += distortion;
        #endif
    #endif
        let texColor2 = textureSample(map, mapSampler, mapUV2);
        texColor = mix(texColor, texColor2, fragmentInputs.vTileBlend);
    #endif`
            : ''
    }
#else
    // No map: the ramp is looked up at white, its far end.
    var texColor = vec4f(1.0);
#endif
    #ifdef GRADIENT_MAP
        let rampAt = clamp(dot(texColor, uniforms.gradientMapChannel), 0.0, 1.0);
        let ramp = textureSample(gradientMap, gradientMapSampler, vec2f(mix(uniforms.gradientMapRange.x, uniforms.gradientMapRange.y, rampAt), 0.5));
        texColor = vec4f(ramp.rgb, ramp.a * mix(texColor.a, 1.0, uniforms.gradientMapChannel.a));
    #endif
    #ifdef EROSION
        erosionMaskValue = texColor.a;
    #endif
    baseColor *= texColor;
#endif
#ifdef EROSION
    #ifdef EROSION_MASK
        #ifdef EROSION_MASK_UV1
            let erosionUV = fragmentInputs.vUV1;
        #else
            let erosionUV = fragmentInputs.vUV;
        #endif
        erosionMaskValue = textureSample(erosionMask, erosionMaskSampler, erosionUV * uniforms.erosionMaskTransform.xy + uniforms.erosionMaskTransform.zw).r;
    #endif
    baseColor = quarksErode(baseColor, erosionLevel, erosionMaskValue);
#endif
`;
}
