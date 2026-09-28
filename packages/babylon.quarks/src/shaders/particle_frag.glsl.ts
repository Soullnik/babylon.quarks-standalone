import {srgbGlsl} from './srgb';

export default /* glsl */ `
varying vec2 vUV;
varying vec4 vColor;

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

#ifdef USE_TINT
uniform vec4 tint;
#endif

${srgbGlsl}
void main() {
    vec4 baseColor = vColor;
    vec4 texColor = vec4(1.0);

#ifdef USE_MAP
    texColor = texture2D(map, vUV);
    #ifdef TILE_BLEND
        vec4 texColor2 = texture2D(map, vUV2);
        texColor = mix(texColor, texColor2, vTileBlend);
    #endif
    baseColor *= texColor;
#endif

#if defined(USE_TINT) || defined(LINEAR_OUTPUT) || defined(LINEAR_VERTEX_COLOR)
    // Colours are authored in gamma space and the tint is a linear-space gain, as a Unity HDR
    // material colour is, so it applies between the two. The result stays linear when the
    // scene's image processing runs as a post-process, which converts it back itself.
    #ifdef LINEAR_VERTEX_COLOR
    // The particle colour is already a linear value — what a Unity project in Linear colour
    // space hands its shaders, unconverted. Only the texture needs decoding.
    vec3 linearColor = quarksToLinear(texColor.rgb) * vColor.rgb;
    #else
    vec3 linearColor = quarksToLinear(baseColor.rgb);
    #endif
    #ifdef PREMULTIPLY_VERTEX_ALPHA
    linearColor *= vColor.a;
    #endif
    #ifdef USE_TINT
    linearColor *= tint.rgb;
    baseColor.a *= tint.a;
    #endif
    #ifdef LINEAR_OUTPUT
    baseColor.rgb = linearColor;
    #else
    baseColor.rgb = quarksToGamma(linearColor);
    #endif
#endif
#if defined(PREMULTIPLY_VERTEX_ALPHA) && !defined(USE_TINT) && !defined(LINEAR_OUTPUT) && !defined(LINEAR_VERTEX_COLOR)
    // Premultiplied blending takes the texture as premultiplied, but the particle colour is
    // straight: premultiply it too, or fading a particle's alpha would leave its colour lit.
    baseColor = vec4(baseColor.rgb * vColor.a, baseColor.a);
#endif

#ifdef USE_COLOR_AS_ALPHA
    baseColor.a *= (baseColor.r + baseColor.g + baseColor.b) / 3.0;
#endif

#ifdef USE_ALPHATEST
    if (baseColor.a < alphaTest) discard;
#else
    if (baseColor.a < 0.01) discard;
#endif

    gl_FragColor = baseColor;

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
