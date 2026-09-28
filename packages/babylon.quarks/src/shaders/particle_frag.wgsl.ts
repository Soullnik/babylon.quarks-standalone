export default /* wgsl */ `
varying vUV: vec2f;
varying vColor: vec4f;

#ifdef TILE_BLEND
varying vUV2: vec2f;
varying vTileBlend: f32;
#endif

#ifdef USE_MAP
var mapSampler: sampler;
var map: texture_2d<f32>;
#endif

#ifdef SOFT_PARTICLES
var depthTextureSampler: sampler;
var depthTexture: texture_2d<f32>;
uniform softParams: vec2f;
uniform projParams: vec4f;
varying projPosition: vec4f;
varying linearDepth: f32;
#endif

#ifdef USE_ALPHATEST
uniform alphaTest: f32;
#endif

#ifdef USE_TINT
uniform tint: vec4f;
#endif

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
    var baseColor = fragmentInputs.vColor;
    var texColor = vec4f(1.0);

#ifdef USE_MAP
    texColor = textureSample(map, mapSampler, fragmentInputs.vUV);
    #ifdef TILE_BLEND
        let texColor2 = textureSample(map, mapSampler, fragmentInputs.vUV2);
        texColor = mix(texColor, texColor2, fragmentInputs.vTileBlend);
    #endif
    baseColor *= texColor;
#endif

#if defined(USE_TINT) || defined(LINEAR_OUTPUT) || defined(LINEAR_VERTEX_COLOR)
    // Colours are authored in gamma space and the tint is a linear-space gain, as a Unity HDR
    // material colour is, so it applies between the two. The result stays linear when the
    // scene's image processing runs as a post-process, which converts it back itself.
    #ifdef LINEAR_VERTEX_COLOR
    // The particle colour is already a linear value — what a Unity project in Linear colour
    // space hands its shaders, unconverted. Only the texture needs decoding.
    var linearColor = pow(max(texColor.rgb, vec3f(0.0)), vec3f(2.2)) * fragmentInputs.vColor.rgb;
    #else
    var linearColor = pow(max(baseColor.rgb, vec3f(0.0)), vec3f(2.2));
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
    baseColor = vec4f(pow(linearColor, vec3f(1.0 / 2.2)), baseColor.a);
    #endif
#endif
#if defined(PREMULTIPLY_VERTEX_ALPHA) && !defined(USE_TINT) && !defined(LINEAR_OUTPUT) && !defined(LINEAR_VERTEX_COLOR)
    // Premultiplied blending takes the texture as premultiplied, but the particle colour is
    // straight: premultiply it too, or fading a particle's alpha would leave its colour lit.
    baseColor = vec4f(baseColor.rgb * fragmentInputs.vColor.a, baseColor.a);
#endif

#ifdef USE_COLOR_AS_ALPHA
    baseColor.a *= (baseColor.r + baseColor.g + baseColor.b) / 3.0;
#endif

#ifdef USE_ALPHATEST
    if (baseColor.a < uniforms.alphaTest) { discard; }
#else
    if (baseColor.a < 0.01) { discard; }
#endif

#ifdef SOFT_PARTICLES
    var p2 = fragmentInputs.projPosition.xy / fragmentInputs.projPosition.w;
    p2 = 0.5 * p2 + 0.5;
    let readDepth = textureSample(depthTexture, depthTextureSampler, p2).r;
    let zNear = uniforms.projParams.x;
    let zFar = uniforms.projParams.y;
    let viewDepth = (zFar * zNear) / (zFar - readDepth * (zFar - zNear));
    let fade = clamp(uniforms.softParams.y * ((viewDepth - uniforms.softParams.x) - fragmentInputs.linearDepth), 0.0, 1.0);
    baseColor *= fade;
#endif

    fragmentOutputs.color = baseColor;
}
`;
