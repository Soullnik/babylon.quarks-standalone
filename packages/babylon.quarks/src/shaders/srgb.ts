/**
 * sRGB ↔ linear for the fragment shaders, following the engine as Babylon's own materials and
 * image processing do: the exact sRGB curves when it was created with useExactSrgbConversions
 * (Babylon then defines USE_EXACT_SRGB_CONVERSIONS in every shader), the 2.2 power otherwise.
 * Decoding and encoding with the same curve keeps a colour that is only passed through unchanged.
 */
export const srgbGlsl = /* glsl */ `
vec3 quarksToLinear(vec3 color) {
    vec3 c = max(color, vec3(0.0));
#ifdef USE_EXACT_SRGB_CONVERSIONS
    return mix(pow((c + vec3(0.055)) / 1.055, vec3(2.4)), c / 12.92, step(c, vec3(0.04045)));
#else
    return pow(c, vec3(2.2));
#endif
}

vec3 quarksToGamma(vec3 color) {
    vec3 c = max(color, vec3(0.0));
#ifdef USE_EXACT_SRGB_CONVERSIONS
    return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - vec3(0.055), c * 12.92, step(c, vec3(0.0031308)));
#else
    return pow(c, vec3(1.0 / 2.2));
#endif
}
`;

export const srgbWgsl = /* wgsl */ `
fn quarksToLinear(color: vec3f) -> vec3f {
    let c = max(color, vec3f(0.0));
#ifdef USE_EXACT_SRGB_CONVERSIONS
    return mix(pow((c + vec3f(0.055)) / 1.055, vec3f(2.4)), c / 12.92, step(c, vec3f(0.04045)));
#else
    return pow(c, vec3f(2.2));
#endif
}

fn quarksToGamma(color: vec3f) -> vec3f {
    let c = max(color, vec3f(0.0));
#ifdef USE_EXACT_SRGB_CONVERSIONS
    return mix(1.055 * pow(c, vec3f(1.0 / 2.4)) - vec3f(0.055), c * 12.92, step(c, vec3f(0.0031308)));
#else
    return pow(c, vec3f(1.0 / 2.2));
#endif
}
`;
