import {fogFragmentDeclarationWGSL, fogFragmentWGSL} from './chunks/fog';
import {surfaceColorWGSL, surfaceFragmentDeclarationWGSL} from './chunks/surface';

export default /* wgsl */ `
varying vUV: vec2f;
varying vColor: vec4f;
varying vNormal: vec3f;
varying vWorldPos: vec3f;

#ifndef MESH_UNLIT
uniform lightDirection: vec3f;
uniform lightColor: vec3f;
uniform ambientColor: vec3f;
#endif

#ifdef TILE_BLEND
varying vUV2: vec2f;
varying vTileBlend: f32;
#endif

#ifdef USE_MAP
var mapSampler: sampler;
var map: texture_2d<f32>;
#endif

#if defined(USE_ENVMAP_ATLAS) || defined(MESH_RIM)
uniform eyePosition: vec3f;
#endif

#ifdef MESH_RIM
uniform rimColor: vec3f;
uniform rimParams: vec2f;
#endif

#ifdef USE_ENVMAP_ATLAS
var envAtlasSampler: sampler;
var envAtlas: texture_2d<f32>;
uniform reflectionLevel: f32;

fn sampleEnvAtlas(r: vec3f) -> vec3f {
    let a = abs(r);
    var localUV: vec2f;
    var cellX: f32;
    var cellY: f32;
    if (a.x >= a.y && a.x >= a.z) {
        cellX = 0.0;
        if (r.x >= 0.0) {
            cellY = 0.0;
            localUV = vec2f(-r.z, -r.y) / a.x * 0.5 + 0.5;
        } else {
            cellY = 1.0;
            localUV = vec2f(r.z, -r.y) / a.x * 0.5 + 0.5;
        }
    } else if (a.y >= a.z) {
        cellX = 1.0;
        if (r.y >= 0.0) {
            cellY = 0.0;
            localUV = vec2f(r.x, r.z) / a.y * 0.5 + 0.5;
        } else {
            cellY = 1.0;
            localUV = vec2f(r.x, -r.z) / a.y * 0.5 + 0.5;
        }
    } else {
        cellX = 2.0;
        if (r.z >= 0.0) {
            cellY = 0.0;
            localUV = vec2f(r.x, -r.y) / a.z * 0.5 + 0.5;
        } else {
            cellY = 1.0;
            localUV = vec2f(-r.x, -r.y) / a.z * 0.5 + 0.5;
        }
    }
    let uv = (vec2f(cellX, cellY) + clamp(localUV, vec2f(0.0), vec2f(1.0))) / vec2f(3.0, 2.0);
    return textureSample(envAtlas, envAtlasSampler, uv).rgb;
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

${fogFragmentDeclarationWGSL}
${surfaceFragmentDeclarationWGSL}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
${surfaceColorWGSL(true)}
#ifdef USE_ALPHATEST
    if (baseColor.a < uniforms.alphaTest) { discard; }
#else
    if (baseColor.a < 0.01) { discard; }
#endif

    let N = normalize(fragmentInputs.vNormal);
#ifdef MESH_UNLIT
    var color = baseColor.rgb;
#else
    let L = normalize(-uniforms.lightDirection);
    let NdotL = max(dot(N, L), 0.0);
    let litColor = uniforms.ambientColor + uniforms.lightColor * NdotL;

    var color = baseColor.rgb * litColor;
#endif

#ifdef USE_ENVMAP_ATLAS
    let viewDir = normalize(fragmentInputs.vWorldPos - uniforms.eyePosition);
    let reflectionCoords = reflect(viewDir, N);
    color += sampleEnvAtlas(reflectionCoords) * uniforms.reflectionLevel;
#endif

#ifdef MESH_RIM
    // Fresnel: strongest where the surface turns away from the camera.
    let V = normalize(uniforms.eyePosition - fragmentInputs.vWorldPos);
    let edgeTerm = pow(1.0 - abs(dot(N, V)), uniforms.rimParams.x);
    #if defined(MESH_RIM_FADE)
    // Faces turned to the camera fade by the strength; edges stay.
    baseColor.a *= clamp(1.0 - uniforms.rimParams.y * (1.0 - edgeTerm), 0.0, 1.0);
    #elif defined(MESH_RIM_MIX)
    color = mix(color, uniforms.rimColor, clamp(edgeTerm * uniforms.rimParams.y, 0.0, 1.0));
    #else
    color += uniforms.rimColor * edgeTerm * uniforms.rimParams.y;
    #endif
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

${fogFragmentWGSL('finalColor')}
    fragmentOutputs.color = finalColor;
}
`;
