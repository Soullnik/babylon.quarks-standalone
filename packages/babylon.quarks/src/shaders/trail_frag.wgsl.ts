import {fogFragmentDeclarationWGSL, fogFragmentWGSL} from './chunks/fog';
import {surfaceColorWGSL, surfaceFragmentDeclarationWGSL} from './chunks/surface';

export default /* wgsl */ `
varying vUV: vec2f;
varying vColor: vec4f;

#ifdef USE_MAP
var mapSampler: sampler;
var map: texture_2d<f32>;
#endif

${fogFragmentDeclarationWGSL}
${surfaceFragmentDeclarationWGSL}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
${surfaceColorWGSL(false)}
    if (baseColor.a < 0.01) { discard; }

${fogFragmentWGSL('baseColor')}
    fragmentOutputs.color = baseColor;
}
`;
