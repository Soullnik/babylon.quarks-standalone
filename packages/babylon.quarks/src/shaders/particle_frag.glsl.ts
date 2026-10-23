import {fogFragmentDeclarationGLSL, fogFragmentGLSL} from './chunks/fog';
import {softFragmentDeclarationGLSL, softFragmentGLSL} from './chunks/soft';
import {surfaceColorGLSL, surfaceFragmentDeclarationGLSL} from './chunks/surface';

export default /* glsl */ `
varying vec2 vUV;
varying vec4 vColor;
#ifdef UV1
varying vec2 vUV1;
#endif

#ifdef TILE_BLEND
varying vec2 vUV2;
varying float vTileBlend;
#endif

#ifdef USE_MAP
uniform sampler2D map;
#endif


#ifdef USE_ALPHATEST
uniform float alphaTest;
#endif

${fogFragmentDeclarationGLSL}
${softFragmentDeclarationGLSL}
${surfaceFragmentDeclarationGLSL}
void main() {
${surfaceColorGLSL(true)}
#ifdef USE_ALPHATEST
    if (baseColor.a < alphaTest) discard;
#else
    if (baseColor.a < 0.01) discard;
#endif

${fogFragmentGLSL('baseColor.rgb')}
    gl_FragColor = baseColor;
${softFragmentGLSL('gl_FragColor')}
}
`;
