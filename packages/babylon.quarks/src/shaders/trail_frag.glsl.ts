export default /* glsl */ `
varying vec2 vUV;
varying vec4 vColor;

#ifdef USE_MAP
uniform sampler2D map;
#endif

#ifdef USE_TINT
uniform vec4 tint;
#endif

void main() {
    vec4 baseColor = vColor;
    vec4 texColor = vec4(1.0);

#ifdef USE_MAP
    texColor = texture2D(map, vUV);
    baseColor *= texColor;
#endif

#if defined(USE_TINT) || defined(LINEAR_OUTPUT) || defined(LINEAR_VERTEX_COLOR)
    // Colours are authored in gamma space and the tint is a linear-space gain, as a Unity HDR
    // material colour is, so it applies between the two. The result stays linear when the
    // scene's image processing runs as a post-process, which converts it back itself.
    #ifdef LINEAR_VERTEX_COLOR
    // The particle colour is already a linear value — what a Unity project in Linear colour
    // space hands its shaders, unconverted. Only the texture needs decoding.
    vec3 linearColor = pow(max(texColor.rgb, vec3(0.0)), vec3(2.2)) * vColor.rgb;
    #else
    vec3 linearColor = pow(max(baseColor.rgb, vec3(0.0)), vec3(2.2));
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
    baseColor.rgb = pow(linearColor, vec3(1.0 / 2.2));
    #endif
#endif
#if defined(PREMULTIPLY_VERTEX_ALPHA) && !defined(USE_TINT) && !defined(LINEAR_OUTPUT) && !defined(LINEAR_VERTEX_COLOR)
    // Premultiplied blending takes the texture as premultiplied, but the particle colour is
    // straight: premultiply it too, or fading a particle's alpha would leave its colour lit.
    baseColor = vec4(baseColor.rgb * vColor.a, baseColor.a);
#endif

    if (baseColor.a < 0.01) discard;

    gl_FragColor = baseColor;
}
`;
