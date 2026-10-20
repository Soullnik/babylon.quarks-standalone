import {fogFragmentDeclarationWGSL, fogFragmentWGSL} from './chunks/fog';
import {surfaceColorWGSL, surfaceFragmentDeclarationWGSL} from './chunks/surface';

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

${fogFragmentDeclarationWGSL}
${surfaceFragmentDeclarationWGSL}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
${surfaceColorWGSL(true)}
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

${fogFragmentWGSL('baseColor')}
    fragmentOutputs.color = baseColor;
}
`;
