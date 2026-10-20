import {fogFragmentDeclarationGLSL, fogFragmentGLSL} from './chunks/fog';
import {surfaceColorGLSL, surfaceFragmentDeclarationGLSL} from './chunks/surface';

export default /* glsl */ `
varying vec2 vUV;
varying vec4 vColor;

#ifdef USE_MAP
uniform sampler2D map;
#endif

${fogFragmentDeclarationGLSL}
${surfaceFragmentDeclarationGLSL}
void main() {
${surfaceColorGLSL(false)}
    if (baseColor.a < 0.01) discard;

${fogFragmentGLSL('baseColor.rgb')}
    gl_FragColor = baseColor;
}
`;
