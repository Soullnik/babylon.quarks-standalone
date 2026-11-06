/**
 * The scene's image processing for the particle shaders, in both shader languages.
 *
 * Babylon's own includes do the work (`imageProcessingDeclaration`, `helperFunctions`,
 * `imageProcessingFunctions`), so the particles are tone mapped, graded and vignetted exactly as
 * the scene's standard and PBR materials and its built-in particle systems are. The defines come
 * from `ImageProcessingConfiguration.prepareDefines`, see `imageProcessingDefines` in
 * `shaderProgram.ts`:
 *
 * - `IMAGEPROCESSING`: the material applies the configuration. The colour, worked out in linear
 *   space (see `colorSpace.ts`), is returned to gamma space by `applyImageProcessing` with the
 *   configuration's effects on the way.
 * - `IMAGEPROCESSINGPOSTPROCESS`: a post process applies it later, to the frame; the material
 *   leaves its colour in the linear space that post process expects.
 *
 * The step runs on the straight colour, after the fog and the soft fade and before the blend
 * resolve (`blend.ts`), so the resolve's meaning of alpha survives it: a premultiplied colour is
 * the processed colour times its coverage. Particles that multiply the frame (`BLEND_MULTIPLY`)
 * are a factor, not light, so `shaderProgram` compiles no in-material processing for them; under
 * a post process their colour is in linear space when the resolve moves it toward white by its
 * coverage, as Unity's Linear colour space does (white, which leaves the frame as it is, stays
 * white). Mixing in gamma space first darkened a part-covered factor's weak channels more than its
 * strong ones, tinting a multiplied smoke toward its strongest colour.
 */

import {ShaderStore} from '@babylonjs/core/Engines/shaderStore';
import '@babylonjs/core/Shaders/ShadersInclude/helperFunctions';
import '@babylonjs/core/Shaders/ShadersInclude/imageProcessingDeclaration';
import '@babylonjs/core/Shaders/ShadersInclude/imageProcessingFunctions';
import '@babylonjs/core/ShadersWGSL/ShadersInclude/helperFunctions';
import '@babylonjs/core/ShadersWGSL/ShadersInclude/imageProcessingDeclaration';
import '@babylonjs/core/ShadersWGSL/ShadersInclude/imageProcessingFunctions';
import {colorSpaceDeclarationGLSL, colorSpaceDeclarationWGSL} from './colorSpace';

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

const babylonFunctionsWGSL = ShaderStore.IncludesShadersStoreWGSL['imageProcessingFunctions'];

/**
 * Whether Babylon's WGSL include still has the broken call, and so is registered patched. The
 * tests pin this for the Babylon version the library is built against, and the shader validation
 * compiles 2D colour grading in WGSL, so a Babylon release that changes the include is noticed.
 * @internal
 */
export const PATCHES_IMAGE_PROCESSING_WGSL = babylonFunctionsWGSL.includes(BROKEN_2D_SAMPLE);

ShaderStore.IncludesShadersStoreWGSL['quarksImageProcessingFunctions'] = PATCHES_IMAGE_PROCESSING_WGSL
    ? SAMPLE_TEXTURE_3D_WGSL +
      babylonFunctionsWGSL.replace(
          BROKEN_2D_SAMPLE,
          'quarksSampleTexture3D(txColorTransform,txColorTransformSampler,colorTransformInput,uniforms.colorTransformSettings.yz)'
      )
    : babylonFunctionsWGSL;

/** Fragment-side declaration, with the colour space's (`colorSpace.ts`), GLSL. */
export const imageProcessingDeclarationGLSL = /* glsl */ `
${colorSpaceDeclarationGLSL}
#if defined(IMAGEPROCESSING) || defined(IMAGEPROCESSINGPOSTPROCESS)
#include<imageProcessingDeclaration>
#include<imageProcessingFunctions>
#endif
`;

/**
 * Processes the straight vec4 lvalue `color`, already in linear space, before the blend resolve,
 * GLSL. Under a post process it is left as it is.
 */
export function imageProcessingFragmentGLSL(color: string): string {
    return /* glsl */ `
#if defined(IMAGEPROCESSING) && !defined(IMAGEPROCESSINGPOSTPROCESS)
    ${color} = applyImageProcessing(${color});
#endif
`;
}

/** Fragment-side declaration, with the colour space's (`colorSpace.ts`), WGSL. */
export const imageProcessingDeclarationWGSL = /* wgsl */ `
${colorSpaceDeclarationWGSL}
#if defined(IMAGEPROCESSING) || defined(IMAGEPROCESSINGPOSTPROCESS)
#include<imageProcessingDeclaration>
#include<quarksImageProcessingFunctions>
#endif
`;

/**
 * Processes the straight `var` vec4 `color`, already in linear space, before the blend resolve,
 * WGSL. Under a post process it is left as it is.
 */
export function imageProcessingFragmentWGSL(color: string): string {
    return /* wgsl */ `
#if defined(IMAGEPROCESSING) && !defined(IMAGEPROCESSINGPOSTPROCESS)
    ${color} = applyImageProcessing(${color});
#endif
`;
}
