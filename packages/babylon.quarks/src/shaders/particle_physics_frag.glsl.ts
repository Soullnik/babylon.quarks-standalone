export default /* glsl */ `
varying vec2 vUV;
varying vec4 vColor;
varying vec3 vNormal;
varying vec3 vWorldPos;

uniform vec3 lightDirection;
uniform vec3 lightColor;
uniform vec3 ambientColor;

#ifdef TILE_BLEND
varying vec2 vUV2;
varying float vTileBlend;
#endif

#ifdef USE_MAP
uniform sampler2D map;
#endif

// One 3×2 atlas (px py pz / nx ny nz). Avoids samplerCube and multi-face
// sampler bindings that raise GL_INVALID_OPERATION on iOS WebKit.
#ifdef USE_ENVMAP_ATLAS
uniform sampler2D envAtlas;
uniform vec3 eyePosition;
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

#ifdef SOFT_PARTICLES
uniform sampler2D depthTexture;
uniform vec2 softParams;
uniform vec4 projParams;
varying vec4 projPosition;
varying float linearDepth;
#endif

#ifdef USE_ALPHATEST
uniform float alphaTest;
#endif

void main() {
    vec4 baseColor = vColor;

#ifdef USE_MAP
    vec4 texColor = texture2D(map, vUV);
    #ifdef TILE_BLEND
        vec4 texColor2 = texture2D(map, vUV2);
        texColor = mix(texColor, texColor2, vTileBlend);
    #endif
    baseColor *= texColor;
#endif

#ifdef USE_ALPHATEST
    if (baseColor.a < alphaTest) discard;
#else
    if (baseColor.a < 0.01) discard;
#endif

    vec3 N = normalize(vNormal);
    vec3 L = normalize(-lightDirection);
    float NdotL = max(dot(N, L), 0.0);
    vec3 litColor = ambientColor + lightColor * NdotL;

    vec3 color = baseColor.rgb * litColor;

#ifdef USE_ENVMAP_ATLAS
    vec3 viewDir = normalize(vWorldPos - eyePosition);
    vec3 reflectionCoords = reflect(viewDir, N);
    color += sampleEnvAtlas(reflectionCoords) * reflectionLevel;
#endif

    gl_FragColor = vec4(color, baseColor.a);

#ifdef SOFT_PARTICLES
    vec2 p2 = projPosition.xy / projPosition.w;
    p2 = 0.5 * p2 + 0.5;
    float readDepth = texture2D(depthTexture, p2.xy).r;
    float zNear = projParams.x;
    float zFar = projParams.y;
    float viewDepth = (zFar * zNear) / (zFar - readDepth * (zFar - zNear));
    float fade = clamp(softParams.y * ((viewDepth - softParams.x) - linearDepth), 0.0, 1.0);
    gl_FragColor *= fade;
#endif
}
`;
