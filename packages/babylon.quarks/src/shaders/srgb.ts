/**
 * sRGB ↔ linear for the fragment shaders: the 2.2 power, as Babylon's own shaders use by default.
 * Decoding and encoding with the same curve keeps a colour that is only passed through unchanged.
 */
export const srgbGlsl = /* glsl */ `
vec3 quarksToLinear(vec3 color) {
    return pow(max(color, vec3(0.0)), vec3(2.2));
}

vec3 quarksToGamma(vec3 color) {
    return pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
}
`;

export const srgbWgsl = /* wgsl */ `
fn quarksToLinear(color: vec3f) -> vec3f {
    return pow(max(color, vec3f(0.0)), vec3f(2.2));
}

fn quarksToGamma(color: vec3f) -> vec3f {
    return pow(max(color, vec3f(0.0)), vec3f(1.0 / 2.2));
}
`;
