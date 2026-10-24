/**
 * The scene's image processing for the particle shaders, in both shader languages.
 *
 * Babylon's own includes do the work (`imageProcessingDeclaration`, `helperFunctions`,
 * `imageProcessingFunctions`), so the particles are tone mapped, graded and vignetted exactly as
 * the scene's standard and PBR materials and its built-in particle systems are. The defines come
 * from `ImageProcessingConfiguration.prepareDefines`, see `imageProcessingDefines` in
 * `shaderProgram.ts`:
 *
 * - `IMAGEPROCESSING`: the material applies the configuration. The colour, authored in gamma
 *   space, is brought to linear space and `applyImageProcessing` returns it to gamma space with
 *   the configuration's effects on the way.
 * - `IMAGEPROCESSINGPOSTPROCESS`: a post process applies it later, to the frame; the material only
 *   leaves its colour in the linear space that post process expects.
 *
 * The step runs on the straight colour, after the fog and the soft fade and before the blend
 * resolve (`blend.ts`), so the resolve's meaning of alpha survives it: a premultiplied colour is
 * the processed colour times its coverage. Particles that multiply the frame (`BLEND_MULTIPLY`)
 * are a factor, not light, so `shaderProgram` compiles no in-material processing for them, and
 * under a post process their resolved factor is brought to linear space after the resolve: white,
 * which leaves the frame as it is, stays white.
 */

import {ShaderStore} from '@babylonjs/core/Engines/shaderStore';
import '@babylonjs/core/Shaders/ShadersInclude/helperFunctions';
import '@babylonjs/core/Shaders/ShadersInclude/imageProcessingDeclaration';
import '@babylonjs/core/Shaders/ShadersInclude/imageProcessingFunctions';
import '@babylonjs/core/ShadersWGSL/ShadersInclude/helperFunctions';
import '@babylonjs/core/ShadersWGSL/ShadersInclude/imageProcessingDeclaration';
import '@babylonjs/core/ShadersWGSL/ShadersInclude/imageProcessingFunctions';

/**
 * Babylon's WGSL `imageProcessingFunctions` samples a 2D colour grading texture (a LUT laid out as
 * slices) with a `textureSample` overload WGSL does not have, so it does not compile; its GLSL
 * reads the slices through a `sampleTexture3D` polyfill. This is that polyfill in WGSL, and the
 * include with the call routed through it, registered as `quarksImageProcessingFunctions`. When a
 * Babylon release fixes the call, the include is registered as it comes.
 */
const SAMPLE_TEXTURE_3D_WGSL = /* wgsl */ `
#if defined(COLORGRADING) && !defined(COLORGRADING3D)
fn quarksSampleTexture3D(colorTransform: texture_2d<f32>, colorTransformSampler: sampler, colorIn: vec3f, sampler3dSetting: vec2f) -> vec3f {
    let sliceSize = 2.0 * sampler3dSetting.x;
#ifdef SAMPLER3DGREENDEPTH
    let sliceContinuous = (colorIn.g - sampler3dSetting.x) * sampler3dSetting.y;
    var sliceUV = colorIn.rb;
#else
    let sliceContinuous = (colorIn.b - sampler3dSetting.x) * sampler3dSetting.y;
    var sliceUV = colorIn.rg;
#endif
    let sliceInteger = floor(sliceContinuous);
    let sliceFraction = sliceContinuous - sliceInteger;
    sliceUV.x = sliceUV.x * sliceSize + sliceInteger * sliceSize;
    let slice0Color = textureSample(colorTransform, colorTransformSampler, clamp(sliceUV, vec2f(0.0), vec2f(1.0)));
    let slice1Color = textureSample(colorTransform, colorTransformSampler, clamp(sliceUV + vec2f(sliceSize, 0.0), vec2f(0.0), vec2f(1.0)));
    let result = mix(slice0Color.rgb, slice1Color.rgb, sliceFraction);
#ifdef SAMPLER3DBGRMAP
    return result.rgb;
#else
    return result.bgr;
#endif
}
#endif
`;

const BROKEN_2D_SAMPLE =
    'textureSample(txColorTransform,txColorTransformSampler,colorTransformInput,uniforms.colorTransformSettings.yz).rgb';

ShaderStore.IncludesShadersStoreWGSL['quarksImageProcessingFunctions'] =
    SAMPLE_TEXTURE_3D_WGSL +
    ShaderStore.IncludesShadersStoreWGSL['imageProcessingFunctions'].replace(
        BROKEN_2D_SAMPLE,
        'quarksSampleTexture3D(txColorTransform,txColorTransformSampler,colorTransformInput,uniforms.colorTransformSettings.yz)'
    );

/** Fragment-side declaration, GLSL. */
export const imageProcessingDeclarationGLSL = /* glsl */ `
#if defined(IMAGEPROCESSING) || defined(IMAGEPROCESSINGPOSTPROCESS)
#include<imageProcessingDeclaration>
#include<helperFunctions>
#include<imageProcessingFunctions>
#endif
`;

/** Processes the straight vec4 lvalue `color`, before the blend resolve, GLSL. */
export function imageProcessingFragmentGLSL(color: string): string {
    return /* glsl */ `
#if defined(IMAGEPROCESSINGPOSTPROCESS) && !defined(BLEND_MULTIPLY)
    ${color}.rgb = toLinearSpace(${color}.rgb);
#elif defined(IMAGEPROCESSING)
    ${color}.rgb = toLinearSpace(${color}.rgb);
    ${color} = applyImageProcessing(${color});
#endif
`;
}

/** Brings a resolved multiply factor in `color` to linear space for a post process, GLSL. */
export function imageProcessingResolvedGLSL(color: string): string {
    return /* glsl */ `
#if defined(IMAGEPROCESSINGPOSTPROCESS) && defined(BLEND_MULTIPLY)
    ${color}.rgb = toLinearSpace(${color}.rgb);
#endif
`;
}

/** Fragment-side declaration, WGSL. */
export const imageProcessingDeclarationWGSL = /* wgsl */ `
#if defined(IMAGEPROCESSING) || defined(IMAGEPROCESSINGPOSTPROCESS)
#include<imageProcessingDeclaration>
#include<helperFunctions>
#include<quarksImageProcessingFunctions>
#endif
`;

/** Processes the straight `var` vec4 `color`, before the blend resolve, WGSL. */
export function imageProcessingFragmentWGSL(color: string): string {
    return /* wgsl */ `
#if defined(IMAGEPROCESSINGPOSTPROCESS) && !defined(BLEND_MULTIPLY)
    ${color} = vec4f(toLinearSpaceVec3(${color}.rgb), ${color}.a);
#elif defined(IMAGEPROCESSING)
    ${color} = applyImageProcessing(vec4f(toLinearSpaceVec3(${color}.rgb), ${color}.a));
#endif
`;
}

/** Brings a resolved multiply factor in `color` to linear space for a post process, WGSL. */
export function imageProcessingResolvedWGSL(color: string): string {
    return /* wgsl */ `
#if defined(IMAGEPROCESSINGPOSTPROCESS) && defined(BLEND_MULTIPLY)
    ${color} = vec4f(toLinearSpaceVec3(${color}.rgb), ${color}.a);
#endif
`;
}
