import {blendFragmentGLSL} from './chunks/blend';
import {fogFragmentDeclarationGLSL, fogFragmentGLSL} from './chunks/fog';
import {imageProcessingDeclarationGLSL} from './chunks/imageProcessing';
import {softFragmentDeclarationGLSL, softFragmentGLSL} from './chunks/soft';
import {surfaceColorGLSL, surfaceFragmentDeclarationGLSL} from './chunks/surface';

export default /* glsl */ `
varying vec2 vUV;
varying vec4 vColor;
#ifdef UV1
varying vec2 vUV1;
#endif
varying vec3 vNormal;
varying vec3 vWorldPos;

#ifndef MESH_UNLIT
uniform vec3 lightDirection;
uniform vec3 lightColor;
uniform vec3 ambientColor;
#endif

#ifdef TILE_BLEND
varying vec2 vUV2;
varying float vTileBlend;
#endif

#ifdef USE_MAP
uniform sampler2D map;
#endif

#if defined(USE_ENVMAP_ATLAS) || defined(MESH_RIM)
uniform vec3 eyePosition;
#endif

#ifdef MESH_RIM
uniform vec3 rimColor;
uniform vec2 rimParams;
#endif

// One 3×2 atlas (px py pz / nx ny nz). Avoids samplerCube and multi-face
// sampler bindings that raise GL_INVALID_OPERATION on iOS WebKit.
#ifdef USE_ENVMAP_ATLAS
uniform sampler2D envAtlas;
uniform float reflectionLevel;

vec3 sampleEnvAtlas(vec3 r) {
    vec3 a = abs(r);
    vec2 localUV;
    float cellX;
    float cellY;
    // Atlas layout: +X +Y +Z on row 0, -X -Y -Z on row 1.
    if (a.x >= a.y && a.x >= a.z) {
        cellX = 0.0;
        if (r.x >= 0.0) {
            cellY = 0.0;
            localUV = vec2(-r.z, -r.y) / a.x * 0.5 + 0.5;
        } else {
            cellY = 1.0;
            localUV = vec2(r.z, -r.y) / a.x * 0.5 + 0.5;
        }
    } else if (a.y >= a.z) {
        cellX = 1.0;
        if (r.y >= 0.0) {
            cellY = 0.0;
            localUV = vec2(r.x, r.z) / a.y * 0.5 + 0.5;
        } else {
            cellY = 1.0;
            localUV = vec2(r.x, -r.z) / a.y * 0.5 + 0.5;
        }
    } else {
        cellX = 2.0;
        if (r.z >= 0.0) {
            cellY = 0.0;
            localUV = vec2(r.x, -r.y) / a.z * 0.5 + 0.5;
        } else {
            cellY = 1.0;
            localUV = vec2(-r.x, -r.y) / a.z * 0.5 + 0.5;
        }
    }
    vec2 uv = (vec2(cellX, cellY) + clamp(localUV, 0.0, 1.0)) / vec2(3.0, 2.0);
    return texture2D(envAtlas, uv).rgb;
}
#endif


#ifdef USE_ALPHATEST
uniform float alphaTest;
#endif

${fogFragmentDeclarationGLSL}
${imageProcessingDeclarationGLSL}
${softFragmentDeclarationGLSL}
${surfaceFragmentDeclarationGLSL}
void main() {
${surfaceColorGLSL(true)}
    // A back face lights, reflects and rims as the face the camera sees.
    vec3 N = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
#ifdef MESH_UNLIT
    vec3 color = baseColor.rgb;
#else
    vec3 L = normalize(-lightDirection);
    float NdotL = max(dot(N, L), 0.0);
    vec3 litColor = ambientColor + lightColor * NdotL;

    vec3 color = baseColor.rgb * litColor;
#endif

#ifdef USE_ENVMAP_ATLAS
    vec3 viewDir = normalize(vWorldPos - eyePosition);
    vec3 reflectionCoords = reflect(viewDir, N);
    color += sampleEnvAtlas(reflectionCoords) * reflectionLevel;
#endif

#ifdef MESH_RIM
    // Fresnel: strongest where the surface turns away from the camera.
    vec3 V = normalize(eyePosition - vWorldPos);
    float edgeTerm = pow(1.0 - abs(dot(N, V)), rimParams.x);
    #if defined(MESH_RIM_FADE)
    // Faces turned to the camera fade by the strength; edges stay.
    baseColor.a *= clamp(1.0 - rimParams.y * (1.0 - edgeTerm), 0.0, 1.0);
    #elif defined(MESH_RIM_MIX)
    color = mix(color, rimColor, clamp(edgeTerm * rimParams.y, 0.0, 1.0));
    #else
    color += rimColor * edgeTerm * rimParams.y;
    #endif
#endif

    // After the rim, so a fade that empties a face can discard it.
#ifdef USE_ALPHATEST
    if (baseColor.a < alphaTest) discard;
#else
    if (baseColor.a < 0.01) discard;
#endif

${fogFragmentGLSL('color')}
    vec4 finalColor = vec4(color, baseColor.a);
${softFragmentGLSL('finalColor')}
${blendFragmentGLSL('finalColor')}
    gl_FragColor = finalColor;
}
`;
