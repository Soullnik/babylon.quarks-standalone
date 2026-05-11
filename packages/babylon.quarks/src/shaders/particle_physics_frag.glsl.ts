export default /* glsl */ `
varying vec2 vUV;
varying vec4 vColor;
varying vec3 vNormal;

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

    gl_FragColor = vec4(baseColor.rgb * litColor, baseColor.a);

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
