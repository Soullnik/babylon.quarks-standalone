export default /* wgsl */ `
varying vUV: vec2f;
varying vColor: vec4f;

#ifdef USE_MAP
var mapSampler: sampler;
var map: texture_2d<f32>;
#endif

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
    var baseColor = fragmentInputs.vColor;

#ifdef USE_MAP
    let texColor = textureSample(map, mapSampler, fragmentInputs.vUV);
    baseColor *= texColor;
#endif

    if (baseColor.a < 0.01) { discard; }

    fragmentOutputs.color = baseColor;
}
`;
