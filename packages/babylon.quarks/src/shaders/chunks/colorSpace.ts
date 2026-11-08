/**
 * The colour space the particle shaders work in, in both shader languages.
 *
 * Under the scene's image processing (`IMAGEPROCESSING` or `IMAGEPROCESSINGPOSTPROCESS`, see
 * `imageProcessing.ts`) the shaders work in linear space: every colour is brought there on its
 * own, as it comes in, and only then are they multiplied, added, mixed and fogged, as Unity's
 * Linear colour space does. The particle colour is brought there in the vertex shader, so it is
 * interpolated in linear space too; each texel as it is sampled; a uniform colour (fog, light,
 * rim, erosion edge) where it is read. Without image processing they work in gamma space, as
 * Unity's Gamma colour space does, and nothing is converted.
 *
 * - `quarksFromGamma`: a colour authored in gamma space (sRGB), the way particle, fog, light and
 *   effect colours are given, into the working space.
 * - `quarksFromLinear`: a colour in linear space into the working space: a texel of a texture
 *   whose `gammaSpace` is false, which an sRGB GPU buffer (`useSRGBBuffer`) reads as, decoding
 *   and filtering it in linear space in the hardware (see `MAP_LINEAR`, `GRADIENT_MAP_LINEAR`).
 *
 * The vertex shaders take the particle colour in through `quarksParticleColor`, which multiplies
 * it by the material colour (`materialColor`, in gamma space like the particle's) once both are in
 * the working space, and the result by `materialColorScale`, alpha included: Unity's material
 * Color and Tint Color, its legacy shaders' doubling a scale of 2. With `NO_PARTICLE_COLOR` (a
 * system's `particleColor` off) the particle colour is left out, alpha included, and only the
 * material colour comes through, as Unity's mesh shaders draw a particle.
 *
 * The conversions are Babylon's (`helperFunctions`), so they follow the engine's
 * `useExactSrgbConversions`: the exact sRGB curve, as Unity converts with and as the GPU decodes an
 * sRGB texture, when it is on; a 2.2 power, cheaper but too dark in the shadows, when it is off.
 * The same flag picks the curve the image processing returns the frame to gamma space with, so a
 * colour drawn alone leaves the frame as it came in either way.
 */

/** Declaration for the vertex and fragment shaders, GLSL. Includes Babylon's `helperFunctions`. */
export const colorSpaceDeclarationGLSL = /* glsl */ `
#include<helperFunctions>
#if defined(IMAGEPROCESSING) || defined(IMAGEPROCESSINGPOSTPROCESS)
vec3 quarksFromGamma(vec3 color) { return toLinearSpace(color); }
vec3 quarksFromLinear(vec3 color) { return color; }
#else
vec3 quarksFromGamma(vec3 color) { return color; }
vec3 quarksFromLinear(vec3 color) { return toGammaSpace(color); }
#endif
`;

/** The vertex shaders' material colour and the particle colour in the working space, GLSL. */
export const particleColorVertexDeclarationGLSL = /* glsl */ `
uniform vec4 materialColor;
uniform float materialColorScale;

vec4 quarksParticleColor(vec4 color) {
#ifdef NO_PARTICLE_COLOR
    color = vec4(1.0);
#endif
    return vec4(quarksFromGamma(color.rgb) * quarksFromGamma(materialColor.rgb), color.a * materialColor.a) * materialColorScale;
}
`;

/** Declaration for the vertex and fragment shaders, WGSL. Includes Babylon's `helperFunctions`. */
export const colorSpaceDeclarationWGSL = /* wgsl */ `
#include<helperFunctions>
#if defined(IMAGEPROCESSING) || defined(IMAGEPROCESSINGPOSTPROCESS)
fn quarksFromGamma(color: vec3f) -> vec3f { return toLinearSpaceVec3(color); }
fn quarksFromLinear(color: vec3f) -> vec3f { return color; }
#else
fn quarksFromGamma(color: vec3f) -> vec3f { return color; }
fn quarksFromLinear(color: vec3f) -> vec3f { return toGammaSpaceVec3(color); }
#endif
`;

/** The vertex shaders' material colour and the particle colour in the working space, WGSL. */
export const particleColorVertexDeclarationWGSL = /* wgsl */ `
uniform materialColor: vec4f;
uniform materialColorScale: f32;

fn quarksParticleColor(particle: vec4f) -> vec4f {
#ifdef NO_PARTICLE_COLOR
    let color = vec4f(1.0);
#else
    let color = particle;
#endif
    return vec4f(quarksFromGamma(color.rgb) * quarksFromGamma(uniforms.materialColor.rgb), color.a * uniforms.materialColor.a) * uniforms.materialColorScale;
}
`;
