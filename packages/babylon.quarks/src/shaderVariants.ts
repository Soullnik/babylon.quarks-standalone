import {Constants} from '@babylonjs/core/Engines/constants';
import type {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {Vector3} from 'quarks.core';
import {ShaderContext, shaderProgram, ShaderProgram, ShaderSettings} from './shaderProgram';
import {
    normalizeErosion,
    normalizeGradientMap,
    normalizeMapUV,
    normalizeMeshRim,
    normalizeUVDistortion,
    RenderMode,
} from './VFXBatch';

/**
 * One shader the library can compile: a {@link ShaderProgram} with the settings that produce it,
 * named for the renderer's benefit. See {@link shaderVariants}.
 */
export interface ShaderVariant {
    /** The render mode and the features compiled in, for a report. */
    name: string;
    /** The program a batch with these settings builds. */
    program: ShaderProgram;
}

/** A texture reference for settings that only ask whether one is set; it is never sampled. */
const TEXTURE = {} as BaseTexture;

/** The settings of a bare batch in `renderMode`: no texture, no effects, fog off, 1×1 sheet. */
function bare(renderMode: RenderMode): ShaderSettings {
    return {
        renderMode,
        texture: null,
        reflectionAtlas: null,
        uTileCount: 1,
        vTileCount: 1,
        blendTiles: false,
        softParticles: false,
        materialAlphaTest: 0,
        materialTransparent: true,
        materialBlendMode: Constants.ALPHA_COMBINE,
        applyFog: false,
        pivot: undefined,
        minParticleSize: 0,
        maxParticleSize: Infinity,
        lighting: renderMode === RenderMode.Mesh ? 'fixed' : undefined,
        rim: undefined,
        mapUV: undefined,
        uvDistortion: undefined,
        gradientMap: undefined,
        erosion: undefined,
    };
}

/** A settings change with the name it adds to the variant. */
interface Axis {
    name: string;
    settings?: Partial<ShaderSettings>;
    context?: Partial<ShaderContext>;
}

const NONE: Axis = {name: ''};

/** The render modes and the mode-specific features: quad pivot and size limits, mesh lighting, rim and reflection. */
const TARGETS: Axis[] = [
    {name: 'billboard', settings: {renderMode: RenderMode.BillBoard}},
    {name: 'vertical billboard', settings: {renderMode: RenderMode.VerticalBillBoard}},
    {name: 'horizontal billboard', settings: {renderMode: RenderMode.HorizontalBillBoard}},
    {name: 'stretched', settings: {renderMode: RenderMode.StretchedBillBoard}},
    {name: 'beam', settings: {renderMode: RenderMode.Beam}},
    {name: 'mesh', settings: {renderMode: RenderMode.Mesh}},
    {name: 'mesh scene lit', settings: {renderMode: RenderMode.Mesh, lighting: 'scene'}},
    {name: 'mesh unlit', settings: {renderMode: RenderMode.Mesh, lighting: 'unlit'}},
    {name: 'mesh rim', settings: {renderMode: RenderMode.Mesh, rim: normalizeMeshRim({mode: 'add'})}},
    {
        name: 'mesh unlit rim mix',
        settings: {renderMode: RenderMode.Mesh, lighting: 'unlit', rim: normalizeMeshRim({mode: 'mix'})},
    },
    {
        name: 'mesh unlit rim fade',
        settings: {renderMode: RenderMode.Mesh, lighting: 'unlit', rim: normalizeMeshRim({mode: 'fade'})},
    },
    {
        name: 'mesh reflecting',
        settings: {renderMode: RenderMode.Mesh, reflectionAtlas: TEXTURE},
        context: {envAtlasReady: true},
    },
    {
        name: 'mesh unlit reflecting rim fade',
        settings: {
            renderMode: RenderMode.Mesh,
            lighting: 'unlit',
            reflectionAtlas: TEXTURE,
            rim: normalizeMeshRim({mode: 'fade'}),
        },
        context: {envAtlasReady: true},
    },
    {name: 'trail', settings: {renderMode: RenderMode.Trail}},
];

/** Pivot and screen-size limits, which only the quad modes read. */
const QUAD: Axis[] = [
    NONE,
    {name: 'pivot', settings: {pivot: new Vector3(0.5, 0, 0)}},
    {name: 'size limits', settings: {minParticleSize: 0.01}},
    {name: 'pivot size limits', settings: {pivot: new Vector3(0, 0.5, 0.5), maxParticleSize: 0.5}},
];

const TILE: Axis[] = [
    NONE,
    {name: 'sheet', settings: {uTileCount: 4, vTileCount: 2}},
    {name: 'sheet blend', settings: {uTileCount: 4, vTileCount: 2, blendTiles: true}},
];
const MAP: Axis[] = [NONE, {name: 'map', settings: {texture: TEXTURE}}];
const SOFT: Axis[] = [
    NONE,
    {name: 'soft', settings: {softParticles: true}, context: {depth: {packed: false}}},
    {name: 'soft packed', settings: {softParticles: true}, context: {depth: {packed: true}}},
];
const ALPHA_TEST: Axis[] = [NONE, {name: 'alpha test', settings: {materialAlphaTest: 0.5}}];
const FOG: Axis[] = [
    NONE,
    {name: 'fog', settings: {applyFog: true}},
    {name: 'fog additive', settings: {applyFog: true, materialBlendMode: Constants.ALPHA_ADD}},
];

/** Texture effects (`chunks/surface.ts`), alone and together, on both UV channels. */
const SURFACE: Axis[] = (() => {
    const uv0 = normalizeMapUV({tiling: [2, 2]});
    const uv1 = normalizeMapUV({channel: 1, tiling: [2, 2]});
    const distortion0 = normalizeUVDistortion({map: TEXTURE});
    const distortion1 = normalizeUVDistortion({map: TEXTURE, mapUV: {channel: 1}});
    const gradient = normalizeGradientMap({ramp: TEXTURE});
    const erosion = normalizeErosion({});
    const erosionMask0 = normalizeErosion({mask: TEXTURE});
    const erosionMask1 = normalizeErosion({mask: TEXTURE, maskUV: {channel: 1}});
    return [
        {name: 'map transform', settings: {mapUV: uv0}},
        {name: 'map transform uv1', settings: {mapUV: uv1}},
        {name: 'gradient map', settings: {gradientMap: gradient}},
        {name: 'erosion', settings: {erosion}},
        {name: 'erosion mask', settings: {erosion: erosionMask0}},
        {name: 'erosion mask uv1', settings: {erosion: erosionMask1}},
        {name: 'distortion', settings: {uvDistortion: distortion0}},
        {name: 'distortion uv1', settings: {uvDistortion: distortion1}},
        {
            name: 'map transform distortion gradient erosion mask',
            settings: {mapUV: uv0, uvDistortion: distortion0, gradientMap: gradient, erosion: erosionMask0},
        },
        {
            name: 'map transform uv1 distortion gradient erosion',
            settings: {mapUV: uv1, uvDistortion: distortion0, gradientMap: gradient, erosion},
        },
        {
            name: 'every effect on uv1',
            settings: {mapUV: uv1, uvDistortion: distortion1, gradientMap: gradient, erosion: erosionMask1},
        },
    ];
})();

/** The targets the texture effects are tried on: one per vertex shader and fragment family. */
const SURFACE_TARGETS = [
    'billboard',
    'stretched',
    'beam',
    'mesh',
    'mesh unlit',
    'mesh unlit rim mix',
    'mesh reflecting',
    'trail',
];

/** A mesh batch whose geometry has a second UV set. */
const MESH_UV2: Axis = {name: 'uv2', context: {meshUV2: true}};

/** Soft, alpha-tested and fogged at once, to try the effects with the rest of the fragment. */
const EVERYTHING_ELSE: Axis = {
    name: 'soft packed alpha test fog additive',
    settings: {softParticles: true, materialAlphaTest: 0.5, applyFog: true, materialBlendMode: Constants.ALPHA_ADD},
    context: {depth: {packed: true}},
};

/**
 * Every shader program the library can compile, one per distinct set of defines: every render
 * mode with every combination of sheet, map, soft particles, alpha test and fog, and the texture
 * effects alone and together on each shader family. What a shader validator compiles, and what
 * an application can warm the shader cache with before its first frame (Unity's
 * ShaderVariantCollection). Built by {@link shaderProgram}, so a variant here is a material a
 * batch would build.
 */
export function shaderVariants(): ShaderVariant[] {
    const seen = new Set<string>();
    const out: ShaderVariant[] = [];
    const add = (axes: Axis[]) => {
        const settings = bare(RenderMode.BillBoard);
        const context: ShaderContext = {depth: null, envAtlasReady: false, meshUV2: false};
        for (const axis of axes) {
            Object.assign(settings, axis.settings);
            Object.assign(context, axis.context);
        }
        const program = shaderProgram(settings, context);
        const key = program.name + ' ' + program.defines.join(',');
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        const features = axes.map((axis) => axis.name).filter((name) => name !== '');
        out.push({name: `${features.join(', ')} [${program.defines.join(',') || 'none'}]`, program});
    };

    for (const target of TARGETS)
        for (const quad of QUAD)
            for (const tile of TILE)
                for (const map of MAP)
                    for (const soft of SOFT)
                        for (const alphaTest of ALPHA_TEST)
                            for (const fog of FOG) add([target, quad, tile, map, soft, alphaTest, fog]);

    for (const target of TARGETS.filter((t) => SURFACE_TARGETS.includes(t.name)))
        for (const uv2 of target.settings?.renderMode === RenderMode.Mesh ? [NONE, MESH_UV2] : [NONE])
            for (const surface of SURFACE)
                for (const map of MAP)
                    for (const tile of [NONE, TILE[2]])
                        for (const rest of [NONE, EVERYTHING_ELSE]) add([target, uv2, surface, map, tile, rest]);
    return out;
}
