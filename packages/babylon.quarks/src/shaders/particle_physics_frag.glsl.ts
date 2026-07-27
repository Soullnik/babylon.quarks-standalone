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

// Six cube faces as 2D samplers — samplerCube on ShaderMaterial raises
// GL_INVALID_OPERATION (1282) on iOS WebKit and the draw is dropped.
#ifdef USE_ENVMAP_FACES
uniform sampler2D envPosX;
uniform sampler2D envPosY;
uniform sampler2D envPosZ;
uniform sampler2D envNegX;
uniform sampler2D envNegY;
uniform sampler2D envNegZ;
uniform vec3 eyePosition;
uniform float reflectionLevel;

vec3 sampleEnvFaces(vec3 r) {
    vec3 a = abs(r);
    vec2 uv;
    if (a.x >= a.y && a.x >= a.z) {
        if (r.x >= 0.0) {
            uv = vec2(-r.z, -r.y) / a.x * 0.5 + 0.5;
            return texture2D(envPosX, uv).rgb;
        }
        uv = vec2(r.z, -r.y) / a.x * 0.5 + 0.5;
        return texture2D(envNegX, uv).rgb;
    }
    if (a.y >= a.z) {
        if (r.y >= 0.0) {
            uv = vec2(r.x, r.z) / a.y * 0.5 + 0.5;
            return texture2D(envPosY, uv).rgb;
        }
        uv = vec2(r.x, -r.z) / a.y * 0.5 + 0.5;
        return texture2D(envNegY, uv).rgb;
    }
    if (r.z >= 0.0) {
        uv = vec2(r.x, -r.y) / a.z * 0.5 + 0.5;
        return texture2D(envPosZ, uv).rgb;
    }
    uv = vec2(-r.x, -r.y) / a.z * 0.5 + 0.5;
    return texture2D(envNegZ, uv).rgb;
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

#ifdef USE_ENVMAP_FACES
    vec3 viewDir = normalize(vWorldPos - eyePosition);
    vec3 reflectionCoords = reflect(viewDir, N);
    color += sampleEnvFaces(reflectionCoords) * reflectionLevel;
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
