export default /* wgsl */ `
varying vUV: vec2f;
varying vColor: vec4f;
varying vNormal: vec3f;
varying vWorldPos: vec3f;

uniform lightDirection: vec3f;
uniform lightColor: vec3f;
uniform ambientColor: vec3f;

#ifdef TILE_BLEND
varying vUV2: vec2f;
varying vTileBlend: f32;
#endif

#ifdef USE_MAP
var mapSampler: sampler;
var map: texture_2d<f32>;
#endif

#ifdef USE_ENVMAP_FACES
var envPosXSampler: sampler;
var envPosX: texture_2d<f32>;
var envPosYSampler: sampler;
var envPosY: texture_2d<f32>;
var envPosZSampler: sampler;
var envPosZ: texture_2d<f32>;
var envNegXSampler: sampler;
var envNegX: texture_2d<f32>;
var envNegYSampler: sampler;
var envNegY: texture_2d<f32>;
var envNegZSampler: sampler;
var envNegZ: texture_2d<f32>;
uniform eyePosition: vec3f;
uniform reflectionLevel: f32;

fn sampleEnvFaces(r: vec3f) -> vec3f {
    let a = abs(r);
    var uv: vec2f;
    if (a.x >= a.y && a.x >= a.z) {
        if (r.x >= 0.0) {
            uv = vec2f(-r.z, -r.y) / a.x * 0.5 + 0.5;
            return textureSample(envPosX, envPosXSampler, uv).rgb;
        }
        uv = vec2f(r.z, -r.y) / a.x * 0.5 + 0.5;
        return textureSample(envNegX, envNegXSampler, uv).rgb;
    }
    if (a.y >= a.z) {
        if (r.y >= 0.0) {
            uv = vec2f(r.x, r.z) / a.y * 0.5 + 0.5;
            return textureSample(envPosY, envPosYSampler, uv).rgb;
        }
        uv = vec2f(r.x, -r.z) / a.y * 0.5 + 0.5;
        return textureSample(envNegY, envNegYSampler, uv).rgb;
    }
    if (r.z >= 0.0) {
        uv = vec2f(r.x, -r.y) / a.z * 0.5 + 0.5;
        return textureSample(envPosZ, envPosZSampler, uv).rgb;
    }
    uv = vec2f(-r.x, -r.y) / a.z * 0.5 + 0.5;
    return textureSample(envNegZ, envNegZSampler, uv).rgb;
}
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

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
    var baseColor = fragmentInputs.vColor;

#ifdef USE_MAP
    var texColor = textureSample(map, mapSampler, fragmentInputs.vUV);
    #ifdef TILE_BLEND
        let texColor2 = textureSample(map, mapSampler, fragmentInputs.vUV2);
        texColor = mix(texColor, texColor2, fragmentInputs.vTileBlend);
    #endif
    baseColor *= texColor;
#endif

#ifdef USE_ALPHATEST
    if (baseColor.a < uniforms.alphaTest) { discard; }
#else
    if (baseColor.a < 0.01) { discard; }
#endif

    let N = normalize(fragmentInputs.vNormal);
    let L = normalize(-uniforms.lightDirection);
    let NdotL = max(dot(N, L), 0.0);
    let litColor = uniforms.ambientColor + uniforms.lightColor * NdotL;

    var color = baseColor.rgb * litColor;

#ifdef USE_ENVMAP_FACES
    let viewDir = normalize(fragmentInputs.vWorldPos - uniforms.eyePosition);
    let reflectionCoords = reflect(viewDir, N);
    color += sampleEnvFaces(reflectionCoords) * uniforms.reflectionLevel;
#endif

    var finalColor = vec4f(color, baseColor.a);

#ifdef SOFT_PARTICLES
    var p2 = fragmentInputs.projPosition.xy / fragmentInputs.projPosition.w;
    p2 = 0.5 * p2 + 0.5;
    let readDepth = textureSample(depthTexture, depthTextureSampler, p2).r;
    let zNear = uniforms.projParams.x;
    let zFar = uniforms.projParams.y;
    let viewDepth = (zFar * zNear) / (zFar - readDepth * (zFar - zNear));
    let fade = clamp(uniforms.softParams.y * ((viewDepth - uniforms.softParams.x) - fragmentInputs.linearDepth), 0.0, 1.0);
    finalColor *= fade;
#endif

    fragmentOutputs.color = finalColor;
}
`;
