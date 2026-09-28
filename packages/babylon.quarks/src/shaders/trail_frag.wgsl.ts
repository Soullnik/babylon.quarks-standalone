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
    #ifdef PREMULTIPLY_VERTEX_ALPHA
    linearColor *= fragmentInputs.vColor.a;
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
#if defined(PREMULTIPLY_VERTEX_ALPHA) && !defined(USE_TINT) && !defined(LINEAR_OUTPUT) && !defined(LINEAR_VERTEX_COLOR)
    // Premultiplied blending takes the texture as premultiplied, but the particle colour is
    // straight: premultiply it too, or fading a particle's alpha would leave its colour lit.
    baseColor = vec4f(baseColor.rgb * fragmentInputs.vColor.a, baseColor.a);
#endif

    if (baseColor.a < 0.01) { discard; }

    fragmentOutputs.color = baseColor;
}
`;
