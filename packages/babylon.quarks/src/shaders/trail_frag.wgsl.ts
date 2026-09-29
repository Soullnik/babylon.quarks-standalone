import {srgbWgsl} from './srgb';

export default /* wgsl */ `
varying vUV: vec2f;
varying vColor: vec4f;

#ifdef USE_MAP
var mapSampler: sampler;
var map: texture_2d<f32>;
#endif

#ifdef USE_TINT
uniform tint: vec4f;
#endif

${srgbWgsl}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
    var baseColor = fragmentInputs.vColor;
    var texColor = vec4f(1.0);

#ifdef USE_MAP
    texColor = textureSample(map, mapSampler, fragmentInputs.vUV);
    baseColor *= texColor;
#endif

#if defined(USE_TINT) || defined(LINEAR_OUTPUT) || defined(LINEAR_VERTEX_COLOR)
    // Colours are authored in gamma space and the tint is a linear-space gain, as a Unity HDR
    // material colour is, so it applies between the two. The result stays linear when the
    // scene's image processing runs as a post-process, which converts it back itself.
    #ifdef LINEAR_VERTEX_COLOR
    // The particle colour is already a linear value — what a Unity project in Linear colour
    // space hands its shaders, unconverted. Only the texture needs decoding.
    var linearColor = quarksToLinear(texColor.rgb) * fragmentInputs.vColor.rgb;
    #else
    var linearColor = quarksToLinear(baseColor.rgb);
    #endif
    #ifdef USE_TINT
    linearColor *= uniforms.tint.rgb;
    baseColor.a *= uniforms.tint.a;
    #endif
    #ifdef LINEAR_OUTPUT
    baseColor = vec4f(linearColor, baseColor.a);
    #else
    baseColor = vec4f(quarksToGamma(linearColor), baseColor.a);
    #endif
#endif
#ifdef PREMULTIPLY_VERTEX_ALPHA
    // Premultiplied blending takes the texture as premultiplied, but the particle colour is
    // straight: premultiply it too, or fading a particle's alpha would leave its colour lit.
    // In the space the blending runs in, so after any conversion to gamma: premultiplied in
    // linear and then encoded, a faint particle would add far more colour (alpha^(1/2.2)) than
    // its alpha takes away from what is behind it, and pop in instead of fading in.
    baseColor = vec4f(baseColor.rgb * fragmentInputs.vColor.a, baseColor.a);
#endif
#ifdef SQUARE_VERTEX_ALPHA
    // The alpha that covers what is behind takes the particle alpha once more, as Unity's legacy
    // premultiply shaders multiply the whole colour, alpha included, by it: a particle fading in
    // over another barely hides it, and the two add up to one glow instead of a ring.
    baseColor.a *= fragmentInputs.vColor.a;
#endif

#ifdef PREMULTIPLY_VERTEX_ALPHA
    // Premultiplied colour shows even where alpha is nearly zero: only drop what adds nothing.
    if (baseColor.a < 0.01 && max(baseColor.r, max(baseColor.g, baseColor.b)) < 0.002) { discard; }
#else
    if (baseColor.a < 0.01) { discard; }
#endif

    fragmentOutputs.color = baseColor;
}
`;
