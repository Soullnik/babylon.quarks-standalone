import {Constants} from '@babylonjs/core/Engines/constants';
import {hasSizeLimits, takesPivotAndSizeLimits, tilesSheet} from './batchKey';
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
import {readsUV1, RenderMode, StoredBatchSettings} from './VFXBatch';

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

/** Whether the blend mode adds to the frame, in which case fog and fade darken instead of mixing. */
export function blendsAdditively(settings: {materialTransparent: boolean; materialBlendMode: number}): boolean {
    return (
        settings.materialTransparent &&
        (settings.materialBlendMode === Constants.ALPHA_ADD || settings.materialBlendMode === Constants.ALPHA_ONEONE)
    );
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

    const defines = fogDefines(settings);
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
    const defines = fogDefines(settings);
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
 * The fog defines: `FOG` when the settings apply the scene's fog, and `FOG_ADDITIVE` when the
 * particles add to the frame, so that they fade toward black instead of the fog colour, which
 * would fog the whole screen (what Unity does for additive materials).
 */
function fogDefines(settings: ShaderSettings): string[] {
    if (!settings.applyFog) {
        return [];
    }
    return blendsAdditively(settings) ? ['FOG', 'FOG_ADDITIVE'] : ['FOG'];
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
