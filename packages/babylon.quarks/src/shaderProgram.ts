import {Constants} from '@babylonjs/core/Engines/constants';
import {hasSizeLimits, takesPivotAndSizeLimits, tilesSheet} from './batchKey';
import {readsUV1, RenderMode, StoredBatchSettings} from './batchSettings';
import local_particle_physics_vert from './shaders/local_particle_physics_vert.glsl';
import local_particle_physics_vert_wgsl from './shaders/local_particle_physics_vert.wgsl';
import particle_frag from './shaders/particle_frag.glsl';
import particle_frag_wgsl from './shaders/particle_frag.wgsl';
import particle_physics_frag from './shaders/particle_physics_frag.glsl';
import particle_physics_frag_wgsl from './shaders/particle_physics_frag.wgsl';
import particle_vert from './shaders/particle_vert.glsl';
import particle_vert_wgsl from './shaders/particle_vert.wgsl';
import type {ShaderSources} from './shaders/shaderLanguageSupport';
import stretched_bb_particle_vert from './shaders/stretched_bb_particle_vert.glsl';
import stretched_bb_particle_vert_wgsl from './shaders/stretched_bb_particle_vert.wgsl';
import trail_frag from './shaders/trail_frag.glsl';
import trail_frag_wgsl from './shaders/trail_frag.wgsl';
import trail_vert from './shaders/trail_vert.glsl';
import trail_vert_wgsl from './shaders/trail_vert.wgsl';

/**
 * The part of a batch's settings that decides its shader: the render mode, which textures and
 * effects are compiled in, and the blend state the fog and the fade read. Everything else a
 * batch holds (geometry, draw order, the effects' parameters) is a buffer or a uniform value.
 */
export type ShaderSettings = Pick<
    StoredBatchSettings,
    | 'renderMode'
    | 'texture'
    | 'reflectionAtlas'
    | 'uTileCount'
    | 'vTileCount'
    | 'blendTiles'
    | 'softParticles'
    | 'materialAlphaTest'
    | 'materialTransparent'
    | 'materialBlendMode'
    | 'applyFog'
    | 'pivot'
    | 'minParticleSize'
    | 'maxParticleSize'
    | 'lighting'
    | 'rim'
    | 'mapUV'
    | 'uvDistortion'
    | 'gradientMap'
    | 'erosion'
>;

/** What the material needs to know about the depth texture soft particles read. */
export interface ShaderDepth {
    /** Whether the depth is packed into four 8-bit channels, as a `DepthRenderer` of type `UNSIGNED_BYTE` writes it. */
    packed: boolean;
}

/**
 * What a batch knows at compile time that its settings do not say: whether the textures it
 * depends on are there to be sampled.
 */
export interface ShaderContext {
    /**
     * The depth texture soft particles read, when one is attached to the renderer. Soft particles
     * compile only with a depth texture.
     */
    depth: ShaderDepth | null;
    /** Whether the mesh batch's reflection atlas has finished loading; it is sampled only then. */
    envAtlasReady: boolean;
    /** Whether the mesh batch has a second UV set to read for {@link UVChannel} 1. */
    meshUV2: boolean;
}

/**
 * One compiled shader of the library: the sources in both languages and the defines, attributes,
 * uniforms and samplers the material is built with. Built by {@link shaderProgram} from a
 * batch's settings, so a batch and a shader validator describe the same material.
 */
export interface ShaderProgram {
    /** The name the sources are registered under in Babylon's shader store, one per render mode. */
    name: string;
    /** The vertex shader in both languages. */
    vertex: ShaderSources;
    /** The fragment shader in both languages. */
    fragment: ShaderSources;
    /** The preprocessor defines, without the `#define`. */
    defines: string[];
    /** The vertex attributes the material binds. */
    attributes: string[];
    /** The uniforms the material declares. */
    uniforms: string[];
    /** The texture samplers the material declares. */
    samplers: string[];
}

/** The vertex attributes every sprite shader reads. */
const SPRITE_ATTRIBUTES = ['position', 'uv', 'offset', 'color', 'size', 'rotation', 'uvTile'];
/** The vertex attributes the trail shader reads. */
const TRAIL_ATTRIBUTES = ['position', 'previous', 'next', 'side', 'width', 'uv', 'color'];
/** The fog uniforms, declared on every material so a scene can turn its fog on without a recompile. */
export const FOG_UNIFORMS = ['vFogInfos', 'vFogColor'];

/** Whether `renderMode` is drawn by the stretched shader: along a per-instance vector. */
export function drawsAlongVelocity(renderMode: RenderMode): boolean {
    return renderMode === RenderMode.StretchedBillBoard || renderMode === RenderMode.Beam;
}

/**
 * Whether the material samples a map: the settings' texture, or the white placeholder a mesh
 * batch gets, since a mesh effect with no sampler at all often never becomes drawable on iOS
 * WebKit.
 */
export function samplesMap(settings: {renderMode: RenderMode; texture: unknown}): boolean {
    return settings.texture !== null || settings.renderMode === RenderMode.Mesh;
}

/**
 * How a particle's colour has to leave the fragment shader for its blend mode, so that its alpha
 * means coverage: alpha 0 leaves the frame as it was, alpha 1 draws the colour in full, and the
 * fades (soft particles, erosion, a rim fade, alpha over life) only lower alpha. Unity's particle
 * shaders do the same for their Alpha, Premultiply, Additive and Multiply modes. Alpha has no
 * such meaning for an opaque material, nor under `ALPHA_INTERPOLATE` (constant blend colour),
 * `ALPHA_REPLACE_COLOR` (replaces the frame) and `ALPHA_DUAL_SRC0_ADD_SRC1xDST` (reads a second
 * shader output the particle shaders do not write); these leave the colour as it is.
 *
 * - `'straight'`: the blend weighs the colour by its alpha itself (Babylon's `ALPHA_COMBINE`,
 *   `ALPHA_ADD`, `ALPHA_LAYER_ACCUMULATE`, …) or does not blend; the colour leaves as it is.
 * - `'premultiply'`: the blend takes the colour at full weight, or the frame by one minus the
 *   colour (`ALPHA_PREMULTIPLIED`, `ALPHA_ONEONE`, `ALPHA_SCREENMODE`, `ALPHA_SUBTRACT`,
 *   `ALPHA_MAXIMIZED`, `ALPHA_MAX`, …), so the shader multiplies it by its alpha: black, which
 *   these modes leave the frame alone with, at alpha 0. Textures stay straight alpha, as in
 *   Unity's Premultiply mode. The fade is linear in alpha except under `ALPHA_MAXIMIZED`, whose
 *   blend weighs the colour by alpha once more, and `ALPHA_MAX`.
 * - `'multiply'`: the blend multiplies the frame by the colour (`ALPHA_MULTIPLY`, `ALPHA_MIN`), so
 *   the shader moves it toward white, which leaves the frame alone, as alpha falls. `ALPHA_MIN`
 *   clamps a frame brighter than 1 (an HDR target) to 1 where a particle draws, even at alpha 0.
 */
export type BlendOutput = 'straight' | 'premultiply' | 'multiply';

/**
 * What the scene's fog turns a particle's colour into with distance: the fog colour where the
 * particle covers the frame (`'color'`), black where it adds to it (`'black'`, or the fog would
 * add itself to the whole screen), white where it multiplies it (`'white'`). Unity fogs its
 * additive and multiply particles toward black and white for the same reason.
 */
export type FogTarget = 'color' | 'black' | 'white';

/** The {@link BlendOutput} and {@link FogTarget} of a blend mode. */
export interface BlendCategory {
    /** How the colour leaves the shader. */
    output: BlendOutput;
    /** Where the fog takes the colour. */
    fogTarget: FogTarget;
}

const PREMULTIPLY_MODES = new Set<number>([
    Constants.ALPHA_SUBTRACT,
    Constants.ALPHA_MAXIMIZED,
    Constants.ALPHA_ONEONE,
    Constants.ALPHA_PREMULTIPLIED,
    Constants.ALPHA_PREMULTIPLIED_PORTERDUFF,
    Constants.ALPHA_SCREENMODE,
    Constants.ALPHA_ONEONE_ONEONE,
    Constants.ALPHA_ALPHATOCOLOR,
    Constants.ALPHA_REVERSEONEMINUS,
    Constants.ALPHA_SRC_DSTONEMINUSSRCALPHA,
    Constants.ALPHA_ONEONE_ONEZERO,
    Constants.ALPHA_EXCLUSION,
    Constants.ALPHA_MAX,
]);
const MULTIPLY_MODES = new Set<number>([Constants.ALPHA_MULTIPLY, Constants.ALPHA_MIN]);
/** The modes whose fog is the fog colour: those that lay the colour over the frame or replace it. */
const OVER_MODES = new Set<number>([
    Constants.ALPHA_COMBINE,
    Constants.ALPHA_PREMULTIPLIED,
    Constants.ALPHA_PREMULTIPLIED_PORTERDUFF,
    Constants.ALPHA_INTERPOLATE,
    Constants.ALPHA_SRC_DSTONEMINUSSRCALPHA,
    Constants.ALPHA_LAYER_ACCUMULATE,
    Constants.ALPHA_REPLACE_COLOR,
]);

/**
 * The {@link BlendCategory} of a material: an opaque one (`materialTransparent` false, or
 * `ALPHA_DISABLE`) is straight and fogs toward the fog colour; a transparent one by its Babylon
 * alpha mode. A mode this table does not know is straight and fogs toward the fog colour.
 */
export function blendCategory(settings: {materialTransparent: boolean; materialBlendMode: number}): BlendCategory {
    const mode = settings.materialBlendMode;
    if (!settings.materialTransparent || mode === Constants.ALPHA_DISABLE) {
        return {output: 'straight', fogTarget: 'color'};
    }
    const output: BlendOutput = PREMULTIPLY_MODES.has(mode)
        ? 'premultiply'
        : MULTIPLY_MODES.has(mode)
          ? 'multiply'
          : 'straight';
    const fogTarget: FogTarget =
        output === 'multiply'
            ? 'white'
            : OVER_MODES.has(mode) || (output === 'straight' && mode !== Constants.ALPHA_ADD)
              ? 'color'
              : 'black';
    return {output, fogTarget};
}

/** The shader program a batch with `settings` compiles, given what it knows about its textures. */
export function shaderProgram(settings: ShaderSettings, context: ShaderContext): ShaderProgram {
    return settings.renderMode === RenderMode.Trail
        ? trailShaderProgram(settings, context)
        : spriteShaderProgram(settings, context);
}

/** The program of a sprite, stretched or mesh batch. */
function spriteShaderProgram(settings: ShaderSettings, context: ShaderContext): ShaderProgram {
    const renderMode = settings.renderMode;
    const isMesh = renderMode === RenderMode.Mesh;
    // The sources only depend on the render mode, so the store entry is registered once per
    // mode: a unique name per material would leak store entries and defeat the effect cache.
    const name = `quarksParticle_${renderMode}`;
    let vertex: ShaderSources;
    let fragment: ShaderSources;
    if (isMesh) {
        vertex = {glsl: local_particle_physics_vert, wgsl: local_particle_physics_vert_wgsl};
        fragment = {glsl: particle_physics_frag, wgsl: particle_physics_frag_wgsl};
    } else if (drawsAlongVelocity(renderMode)) {
        vertex = {glsl: stretched_bb_particle_vert, wgsl: stretched_bb_particle_vert_wgsl};
        fragment = {glsl: particle_frag, wgsl: particle_frag_wgsl};
    } else {
        vertex = {glsl: particle_vert, wgsl: particle_vert_wgsl};
        fragment = {glsl: particle_frag, wgsl: particle_frag_wgsl};
    }

    const defines = blendDefines(settings);
    const attributes = [...SPRITE_ATTRIBUTES];
    const uniforms = ['world', 'view', 'projection', ...FOG_UNIFORMS];
    const samplers: string[] = [];

    if (samplesMap(settings)) {
        defines.push('USE_MAP');
        samplers.push('map');
    }
    const envAtlas = isMesh && settings.reflectionAtlas !== null && context.envAtlasReady;
    if (envAtlas) {
        defines.push('USE_ENVMAP_ATLAS');
        samplers.push('envAtlas');
        uniforms.push('reflectionLevel');
    }
    if (tilesSheet(settings)) {
        defines.push('UV_TILE');
        uniforms.push('tileCountX', 'tileCountY');
        // The second cell only exists on a sheet; a 1×1 sheet has nothing to blend into.
        if (settings.blendTiles) {
            defines.push('TILE_BLEND');
        }
    }
    softDefines(settings, context, defines, uniforms, samplers);
    if (renderMode === RenderMode.VerticalBillBoard) {
        defines.push('VERTICAL');
    }
    if (renderMode === RenderMode.HorizontalBillBoard) {
        defines.push('HORIZONTAL');
    }
    if (renderMode === RenderMode.Beam) {
        defines.push('BEAM');
    }
    if (takesPivotAndSizeLimits(renderMode)) {
        if (settings.pivot) {
            defines.push('PIVOT');
            uniforms.push('pivot');
        }
        if (hasSizeLimits(settings)) {
            defines.push('SIZE_LIMITS');
            uniforms.push('sizeLimits');
        }
    }
    const lit = isMesh && (settings.lighting ?? 'fixed') !== 'unlit';
    if (isMesh && !lit) {
        defines.push('MESH_UNLIT');
    }
    if (lit) {
        uniforms.push('lightDirection', 'lightColor', 'ambientColor');
    }
    const rim = isMesh ? settings.rim : undefined;
    if (rim) {
        defines.push('MESH_RIM');
        if (rim.mode === 'fade') {
            defines.push('MESH_RIM_FADE');
        } else if (rim.mode === 'mix') {
            defines.push('MESH_RIM_MIX');
        }
        uniforms.push('rimColor', 'rimParams');
    }
    if (envAtlas || rim) {
        uniforms.push('eyePosition');
    }
    surfaceDefines(settings, defines, uniforms, samplers);
    if (isMesh) {
        attributes.push('normal');
        if (readsUV1(settings) && context.meshUV2) {
            defines.push('MESH_UV2');
            attributes.push('uv2');
        }
    }
    if (drawsAlongVelocity(renderMode)) {
        attributes.push('velocity');
    }
    return {name, vertex, fragment, defines, attributes, uniforms, samplers};
}

/** The program of a trail batch. */
function trailShaderProgram(settings: ShaderSettings, context: ShaderContext): ShaderProgram {
    const defines = blendDefines(settings);
    const attributes = [...TRAIL_ATTRIBUTES];
    const uniforms = ['view', 'projection', ...FOG_UNIFORMS];
    const samplers: string[] = [];
    if (settings.texture !== null) {
        defines.push('USE_MAP');
        samplers.push('map');
    }
    surfaceDefines(settings, defines, uniforms, samplers);
    softDefines(settings, context, defines, uniforms, samplers);
    if (readsUV1(settings)) {
        // A trail's channel 1 arrives as its own vertex buffer.
        attributes.push('uv2');
    }
    return {
        name: 'quarksTrail',
        vertex: {glsl: trail_vert, wgsl: trail_vert_wgsl},
        fragment: {glsl: trail_frag, wgsl: trail_frag_wgsl},
        defines,
        attributes,
        uniforms,
        samplers,
    };
}

/**
 * The blend defines: `BLEND_PREMULTIPLY` or `BLEND_MULTIPLY` for how the colour leaves the shader,
 * and with `FOG` (when the settings apply the scene's fog) `FOG_ADDITIVE` or `FOG_MULTIPLY` for a
 * fog toward black or white. See {@link blendCategory}.
 */
function blendDefines(settings: ShaderSettings): string[] {
    const {output, fogTarget} = blendCategory(settings);
    const defines: string[] = [];
    if (output === 'premultiply') {
        defines.push('BLEND_PREMULTIPLY');
    } else if (output === 'multiply') {
        defines.push('BLEND_MULTIPLY');
    }
    if (settings.applyFog) {
        defines.push('FOG');
        if (fogTarget === 'black') {
            defines.push('FOG_ADDITIVE');
        } else if (fogTarget === 'white') {
            defines.push('FOG_MULTIPLY');
        }
    }
    return defines;
}

/** Soft particles, when on and a depth texture is there to read, and the alpha test. */
function softDefines(
    settings: ShaderSettings,
    context: ShaderContext,
    defines: string[],
    uniforms: string[],
    samplers: string[]
): void {
    if (settings.softParticles && context.depth !== null) {
        defines.push('SOFT_PARTICLES');
        if (context.depth.packed) {
            defines.push('SOFT_DEPTH_PACKED');
        }
        uniforms.push('softParams', 'projParams');
        samplers.push('depthTexture');
    }
    if (settings.materialAlphaTest > 0) {
        defines.push('USE_ALPHATEST');
        uniforms.push('alphaTest');
    }
}

/** The texture effects of `chunks/surface.ts`: the map's layout, distortion, gradient map and erosion. */
function surfaceDefines(settings: ShaderSettings, defines: string[], uniforms: string[], samplers: string[]): void {
    const {mapUV, uvDistortion, gradientMap, erosion} = settings;
    if (readsUV1(settings)) {
        defines.push('UV1');
    }
    if (mapUV) {
        defines.push('MAP_TRANSFORM');
        if (mapUV.channel === 1) {
            defines.push('MAP_UV1');
        }
        uniforms.push('mapTransform');
    }
    if (uvDistortion) {
        defines.push('UV_DISTORTION');
        if (uvDistortion.mapUV.channel === 1) {
            defines.push('UV_DISTORTION_UV1');
        }
        samplers.push('distortionMap');
        uniforms.push('distortionTransform', 'distortionStrength');
    }
    if (gradientMap) {
        defines.push('GRADIENT_MAP');
        samplers.push('gradientMap');
        uniforms.push('gradientMapRange', 'gradientMapChannel');
    }
    if (erosion) {
        defines.push('EROSION');
        uniforms.push('erosionParams', 'erosionEdgeColor');
        if (erosion.mask) {
            defines.push('EROSION_MASK');
            if (erosion.maskUV.channel === 1) {
                defines.push('EROSION_MASK_UV1');
            }
            samplers.push('erosionMask');
            uniforms.push('erosionMaskTransform');
        }
    }
}
