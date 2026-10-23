/**
 * The blend resolve for the particle shaders, in both shader languages.
 *
 * Every fade in the shaders (soft particles, erosion, a rim fade, alpha over life) lowers alpha
 * only, so that alpha means coverage. Blend modes that take the colour at full weight
 * (`BLEND_PREMULTIPLY`: one-one, premultiplied, screen, subtract, …) would ignore it, so the
 * resolve multiplies the colour by its alpha; modes that multiply the frame (`BLEND_MULTIPLY`)
 * move it toward white instead. It runs last, after fog and the soft fade. See `blendCategory`.
 */

/** Resolves the vec4 lvalue `color` for the blend mode, GLSL. */
export function blendFragmentGLSL(color: string): string {
    return /* glsl */ `
#if defined(BLEND_PREMULTIPLY)
    ${color}.rgb *= ${color}.a;
#elif defined(BLEND_MULTIPLY)
    ${color}.rgb = mix(vec3(1.0), ${color}.rgb, ${color}.a);
#endif
`;
}

/** Resolves the `var` vec4 `color` for the blend mode, WGSL. */
export function blendFragmentWGSL(color: string): string {
    return /* wgsl */ `
#if defined(BLEND_PREMULTIPLY)
    ${color} = vec4f(${color}.rgb * ${color}.a, ${color}.a);
#elif defined(BLEND_MULTIPLY)
    ${color} = vec4f(mix(vec3f(1.0), ${color}.rgb, ${color}.a), ${color}.a);
#endif
`;
}
