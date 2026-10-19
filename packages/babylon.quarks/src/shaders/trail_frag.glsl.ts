import {fogFragmentDeclarationGLSL, fogFragmentGLSL} from './chunks/fog';

export default /* glsl */ `
varying vec2 vUV;
varying vec4 vColor;

#ifdef USE_MAP
uniform sampler2D map;
#endif

${fogFragmentDeclarationGLSL}
void main() {
    vec4 baseColor = vColor;

#ifdef USE_MAP
    vec4 texColor = texture2D(map, vUV);
    baseColor *= texColor;
#endif

    if (baseColor.a < 0.01) discard;

${fogFragmentGLSL('baseColor.rgb')}
    gl_FragColor = baseColor;
}
`;
