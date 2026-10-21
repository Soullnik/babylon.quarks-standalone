/**
 * Soft particles for the particle shaders, in both shader languages.
 *
 * The fragment reads the scene depth behind it from `depthTexture`, turns it into view depth with
 * the coefficients in `projParams` (see `softDepthParams`), and fades out over the distance in
 * `softParams` as it nears the scene, as Unity's soft particles and Unreal's Depth Fade do. The
 * fade runs last, after fog, so both languages produce the same colour.
 *
 * `SOFT_DEPTH_PACKED` reads a depth packed into four 8-bit channels, as a Babylon
 * `DepthRenderer` of type `UNSIGNED_BYTE` writes it.
 */

/** Fragment-side declaration and depth decode, GLSL. */
export const softFragmentDeclarationGLSL = /* glsl */ `
#ifdef SOFT_PARTICLES
uniform sampler2D depthTexture;
uniform vec2 softParams;
uniform vec4 projParams;
varying vec4 projPosition;
varying float linearDepth;

float quarksSceneDepth(vec4 texel) {
#ifdef SOFT_DEPTH_PACKED
    float d = dot(texel, vec4(1.0 / (255.0 * 255.0 * 255.0), 1.0 / (255.0 * 255.0), 1.0 / 255.0, 1.0));
#else
    float d = texel.r;
#endif
    float denominator = projParams.z * d + projParams.w;
    float depth = abs(denominator) > 1e-8 ? abs((projParams.x * d + projParams.y) / denominator) : 0.0;
    // Nothing drawn there reads as infinitely far.
    return depth > 0.0 ? depth : 1e30;
}
#endif
`;

/** Fades `target` as the fragment nears the scene behind it, GLSL. */
export function softFragmentGLSL(target: string): string {
    return /* glsl */ `
#ifdef SOFT_PARTICLES
    {
        vec2 softUV = 0.5 * (projPosition.xy / projPosition.w) + 0.5;
        float sceneDepth = quarksSceneDepth(texture2D(depthTexture, softUV));
        ${target} *= clamp(softParams.y * ((sceneDepth - softParams.x) - linearDepth), 0.0, 1.0);
    }
#endif
`;
}

/** Fragment-side declaration and depth decode, WGSL. */
export const softFragmentDeclarationWGSL = /* wgsl */ `
#ifdef SOFT_PARTICLES
var depthTextureSampler: sampler;
var depthTexture: texture_2d<f32>;
uniform softParams: vec2f;
uniform projParams: vec4f;
varying projPosition: vec4f;
varying linearDepth: f32;

fn quarksSceneDepth(texel: vec4f) -> f32 {
#ifdef SOFT_DEPTH_PACKED
    let d = dot(texel, vec4f(1.0 / (255.0 * 255.0 * 255.0), 1.0 / (255.0 * 255.0), 1.0 / 255.0, 1.0));
#else
    let d = texel.r;
#endif
    let denominator = uniforms.projParams.z * d + uniforms.projParams.w;
    let depth = select(0.0, abs((uniforms.projParams.x * d + uniforms.projParams.y) / denominator), abs(denominator) > 1e-8);
    // Nothing drawn there reads as infinitely far.
    return select(1e30, depth, depth > 0.0);
}
#endif
`;

/** Fades `target` as the fragment nears the scene behind it, WGSL. */
export function softFragmentWGSL(target: string): string {
    return /* wgsl */ `
#ifdef SOFT_PARTICLES
    {
        let softUV = 0.5 * (fragmentInputs.projPosition.xy / fragmentInputs.projPosition.w) + 0.5;
        let sceneDepth = quarksSceneDepth(textureSample(depthTexture, depthTextureSampler, softUV));
        ${target} *= clamp(uniforms.softParams.y * ((sceneDepth - uniforms.softParams.x) - fragmentInputs.linearDepth), 0.0, 1.0);
    }
#endif
`;
}
