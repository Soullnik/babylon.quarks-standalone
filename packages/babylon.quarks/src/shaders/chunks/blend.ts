/**
 * The blend resolve for the particle shaders, in both shader languages.
 *
 * Every fade in the shaders (soft particles, erosion, a rim fade, alpha over life) lowers alpha
 * only, so that alpha means coverage. Blend modes that take the colour at full weight
 * (`BLEND_PREMULTIPLY`: one-one, premultiplied, screen, subtract, …) would ignore it, so the
 * resolve multiplies the colour by its alpha; modes that multiply the frame (`BLEND_MULTIPLY`)
 * move it toward white instead. It runs last, after fog and the soft fade, with the scene's image
 * processing (`imageProcessing.ts`) around it. See `blendCategory`.
 *
 * A premultiplied map (`MAP_PREMULTIPLIED`, with premultiplied blending) has its colour already
 * multiplied by its alpha, and may carry light where its alpha is 0. The surface leaves the map's
 * alpha out of the coverage, so the colour is taken times the vertex alpha and the fades only, as
 * Unity's Alpha Blended Premultiply draws it, and the map's alpha goes onto the output alpha here,
 * after the colour, where it only lets the frame through.
 */

import {imageProcessingFragmentGLSL, imageProcessingFragmentWGSL} from './imageProcessing';

/** Processes and resolves the vec4 lvalue `color` for the blend mode, GLSL. */
export function blendFragmentGLSL(color: string): string {
    return /* glsl */ `${imageProcessingFragmentGLSL(color)}
#if defined(BLEND_PREMULTIPLY)
    ${color}.rgb *= ${color}.a;
    #ifdef MAP_PREMULTIPLIED
    ${color}.a *= quarksMapAlpha;
    #endif
#elif defined(BLEND_MULTIPLY)
    ${color}.rgb = mix(vec3(1.0), ${color}.rgb, ${color}.a);
#endif
`;
}

/** Processes and resolves the `var` vec4 `color` for the blend mode, WGSL. */
export function blendFragmentWGSL(color: string): string {
    return /* wgsl */ `${imageProcessingFragmentWGSL(color)}
#if defined(BLEND_PREMULTIPLY)
    ${color} = vec4f(${color}.rgb * ${color}.a, ${color}.a);
    #ifdef MAP_PREMULTIPLIED
    ${color}.a *= quarksMapAlpha;
    #endif
#elif defined(BLEND_MULTIPLY)
    ${color} = vec4f(mix(vec3f(1.0), ${color}.rgb, ${color}.a), ${color}.a);
#endif
`;
}
