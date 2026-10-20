import {fogFragmentDeclarationGLSL, fogFragmentGLSL} from './chunks/fog';
import {surfaceColorGLSL, surfaceFragmentDeclarationGLSL} from './chunks/surface';

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

${fogFragmentDeclarationGLSL}
${surfaceFragmentDeclarationGLSL}
void main() {
${surfaceColorGLSL(true)}
#ifdef USE_COLOR_AS_ALPHA
    baseColor.a *= (baseColor.r + baseColor.g + baseColor.b) / 3.0;
#endif

#ifdef USE_ALPHATEST
    if (baseColor.a < alphaTest) discard;
#else
    if (baseColor.a < 0.01) discard;
#endif

${fogFragmentGLSL('baseColor.rgb')}
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
