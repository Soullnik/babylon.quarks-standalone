import {blendFragmentWGSL} from './chunks/blend';
import {fogFragmentDeclarationWGSL, fogFragmentWGSL} from './chunks/fog';
import {softFragmentDeclarationWGSL, softFragmentWGSL} from './chunks/soft';
import {surfaceColorWGSL, surfaceFragmentDeclarationWGSL} from './chunks/surface';

export default /* wgsl */ `
varying vUV: vec2f;
varying vColor: vec4f;
#ifdef UV1
varying vUV1: vec2f;
#endif

#ifdef USE_MAP
var mapSampler: sampler;
var map: texture_2d<f32>;
#endif

#ifdef USE_ALPHATEST
uniform alphaTest: f32;
#endif

${fogFragmentDeclarationWGSL}
${softFragmentDeclarationWGSL}
${surfaceFragmentDeclarationWGSL}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
${surfaceColorWGSL(false)}
#ifdef USE_ALPHATEST
    if (baseColor.a < uniforms.alphaTest) { discard; }
#else
    if (baseColor.a < 0.01) { discard; }
#endif

${fogFragmentWGSL('baseColor')}
${softFragmentWGSL('baseColor')}
${blendFragmentWGSL('baseColor')}
    fragmentOutputs.color = baseColor;
}
`;
