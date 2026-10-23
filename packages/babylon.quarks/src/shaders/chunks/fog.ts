/**
 * Scene fog for the particle shaders, in both shader languages.
 *
 * Babylon's own fog includes expect variables the particle shaders do not have
 * (`worldPos`, a `color` the fragment writes), so the few lines involved live
 * here instead and are spliced into each shader. The maths is Babylon's
 * (`fogFragmentDeclaration`): the fog mode, start, end and density arrive in
 * `vFogInfos`, the colour in `vFogColor`, and the distance is the view-space
 * position's length. Mode 0 is "no fog", so a scene that turns its fog off
 * needs no recompile — the uniform does it.
 *
 * Additive particles cannot fade toward a fog colour (that would add fog to
 * the whole screen), so under `FOG_ADDITIVE` they fade toward black instead,
 * and multiplying particles (`FOG_MULTIPLY`) toward white, which leaves the
 * frame as it is: what Unity does for additive and multiply materials.
 */

/** Vertex-side declaration, GLSL. */
export const fogVertexDeclarationGLSL = /* glsl */ `
#ifdef FOG
varying vec3 vFogDistance;
#endif
`;

/** Writes the view-space position the fragment measures its distance from, GLSL. */
export function fogVertexGLSL(viewPosition: string): string {
    return /* glsl */ `
#ifdef FOG
    vFogDistance = ${viewPosition};
#endif
`;
}

/** Fragment-side declaration and fog factor, GLSL. */
export const fogFragmentDeclarationGLSL = /* glsl */ `
#ifdef FOG
uniform vec4 vFogInfos;
uniform vec3 vFogColor;
varying vec3 vFogDistance;

float quarksFogFactor() {
    float fogCoeff = 1.0;
    float fogStart = vFogInfos.y;
    float fogEnd = vFogInfos.z;
    float fogDensity = vFogInfos.w;
    float fogDistance = length(vFogDistance);
    if (vFogInfos.x == 3.0) {
        // A zero-width band is a cut at its distance, not a division by zero.
        fogCoeff = (fogEnd - fogDistance) / max(fogEnd - fogStart, 1e-6);
    } else if (vFogInfos.x == 1.0) {
        fogCoeff = exp(-fogDistance * fogDensity);
    } else if (vFogInfos.x == 2.0) {
        fogCoeff = exp(-fogDistance * fogDistance * fogDensity * fogDensity);
    }
    return clamp(fogCoeff, 0.0, 1.0);
}
#endif
`;

/** Applies the fog to an rgb lvalue (`color` or `baseColor.rgb`), GLSL. */
export function fogFragmentGLSL(rgb: string): string {
    return /* glsl */ `
#ifdef FOG
    {
        float fogFactor = quarksFogFactor();
#if defined(FOG_ADDITIVE)
        ${rgb} *= fogFactor;
#elif defined(FOG_MULTIPLY)
        ${rgb} = mix(vec3(1.0), ${rgb}, fogFactor);
#else
        ${rgb} = mix(vFogColor, ${rgb}, fogFactor);
#endif
    }
#endif
`;
}

/** Vertex-side declaration, WGSL. */
export const fogVertexDeclarationWGSL = /* wgsl */ `
#ifdef FOG
varying vFogDistance: vec3f;
#endif
`;

/** Writes the view-space position the fragment measures its distance from, WGSL. */
export function fogVertexWGSL(viewPosition: string): string {
    return /* wgsl */ `
#ifdef FOG
    vertexOutputs.vFogDistance = ${viewPosition};
#endif
`;
}

/** Fragment-side declaration and fog function, WGSL. */
export const fogFragmentDeclarationWGSL = /* wgsl */ `
#ifdef FOG
uniform vFogInfos: vec4f;
uniform vFogColor: vec3f;
varying vFogDistance: vec3f;

fn quarksFog(rgb: vec3f, fogDistanceVector: vec3f) -> vec3f {
    var fogCoeff = 1.0;
    let fogStart = uniforms.vFogInfos.y;
    let fogEnd = uniforms.vFogInfos.z;
    let fogDensity = uniforms.vFogInfos.w;
    let fogDistance = length(fogDistanceVector);
    if (uniforms.vFogInfos.x == 3.0) {
        // A zero-width band is a cut at its distance, not a division by zero.
        fogCoeff = (fogEnd - fogDistance) / max(fogEnd - fogStart, 1e-6);
    } else if (uniforms.vFogInfos.x == 1.0) {
        fogCoeff = exp(-fogDistance * fogDensity);
    } else if (uniforms.vFogInfos.x == 2.0) {
        fogCoeff = exp(-fogDistance * fogDistance * fogDensity * fogDensity);
    }
    let fogFactor = clamp(fogCoeff, 0.0, 1.0);
#if defined(FOG_ADDITIVE)
    return rgb * fogFactor;
#elif defined(FOG_MULTIPLY)
    return mix(vec3f(1.0), rgb, fogFactor);
#else
    return mix(uniforms.vFogColor, rgb, fogFactor);
#endif
}
#endif
`;

/** Applies the fog to a `var` vec4 colour, WGSL. */
export function fogFragmentWGSL(color: string): string {
    return /* wgsl */ `
#ifdef FOG
    ${color} = vec4f(quarksFog(${color}.rgb, fragmentInputs.vFogDistance), ${color}.a);
#endif
`;
}
