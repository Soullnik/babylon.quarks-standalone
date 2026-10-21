/**
 * Compiles every batch shader, in every combination of defines the library can
 * produce, on a real WebGPU device. Babylon does its own WGSL processing and
 * then hands the result to the browser's shader compiler, so anything that
 * reaches here has been validated by the same path a real frame would take.
 *
 * Reports into window.__wgslResults for the Playwright runner to read.
 */
import {ShaderStore} from '@babylonjs/core/Engines/shaderStore';
import '@babylonjs/core/Engines/WebGPU/Extensions/index';
import {WebGPUEngine} from '@babylonjs/core/Engines/webgpuEngine';
import {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage';
import {Scene} from '@babylonjs/core/scene';

import meshVert from '../../packages/babylon.quarks/src/shaders/local_particle_physics_vert.wgsl';
import particleFrag from '../../packages/babylon.quarks/src/shaders/particle_frag.wgsl';
import physicsFrag from '../../packages/babylon.quarks/src/shaders/particle_physics_frag.wgsl';
import particleVert from '../../packages/babylon.quarks/src/shaders/particle_vert.wgsl';
import stretchedVert from '../../packages/babylon.quarks/src/shaders/stretched_bb_particle_vert.wgsl';
import trailFrag from '../../packages/babylon.quarks/src/shaders/trail_frag.wgsl';
import trailVert from '../../packages/babylon.quarks/src/shaders/trail_vert.wgsl';

type Case = {
    name: string;
    vertex: string;
    fragment: string;
    attributes: string[];
    uniforms: string[];
    samplers: string[];
    defines: string[];
};

const canvas = document.getElementById('c') as HTMLCanvasElement;
const engine = new WebGPUEngine(canvas);
await engine.initAsync();
const scene = new Scene(engine);

const SPRITE_ATTRS = ['position', 'uv', 'offset', 'color', 'size', 'rotation', 'uvTile'];
const SPRITE_UNIFORMS = ['world', 'view', 'projection'];

/** Every define combination rebuildMaterial can emit, per shader pair. */
function cases(): Case[] {
    const out: Case[] = [];
    const tileOptions = [[], ['UV_TILE'], ['UV_TILE', 'TILE_BLEND']];
    const mapOptions = [[], ['USE_MAP']];
    const softOptions = [[], ['SOFT_PARTICLES'], ['SOFT_PARTICLES', 'SOFT_DEPTH_PACKED']];
    const alphaOptions = [[], ['USE_ALPHATEST']];
    const fogOptions = [[], ['FOG'], ['FOG', 'FOG_ADDITIVE']];

    const push = (
        name: string,
        vertex: string,
        fragment: string,
        attributes: string[],
        baseUniforms: string[],
        extra: string[]
    ) => {
        for (const tile of tileOptions)
            for (const map of mapOptions)
                for (const soft of softOptions)
                    for (const alpha of alphaOptions)
                        for (const fog of fogOptions) {
                            const defines = [...extra, ...tile, ...map, ...soft, ...alpha, ...fog];
                            const uniforms = [...baseUniforms];
                            const samplers: string[] = [];
                            if (fog.length) uniforms.push('vFogInfos', 'vFogColor');
                            if (tile.length) uniforms.push('tileCountX', 'tileCountY');
                            if (map.length) samplers.push('map');
                            if (soft.length) {
                                uniforms.push('softParams', 'projParams');
                                samplers.push('depthTexture');
                            }
                            if (alpha.length) uniforms.push('alphaTest');
                            out.push({
                                name: `${name}${defines.length ? ' [' + defines.join(',') + ']' : ' [none]'}`,
                                vertex,
                                fragment,
                                attributes,
                                uniforms,
                                samplers,
                                defines,
                            });
                        }
    };

    push('billboard', particleVert, particleFrag, SPRITE_ATTRS, SPRITE_UNIFORMS, []);
    push('vertical billboard', particleVert, particleFrag, SPRITE_ATTRS, SPRITE_UNIFORMS, ['VERTICAL']);
    push('horizontal billboard', particleVert, particleFrag, SPRITE_ATTRS, SPRITE_UNIFORMS, ['HORIZONTAL']);
    const LIMIT_UNIFORMS = [...SPRITE_UNIFORMS, 'sizeLimits'];
    push('billboard size limits', particleVert, particleFrag, SPRITE_ATTRS, LIMIT_UNIFORMS, ['SIZE_LIMITS']);
    push('vertical billboard size limits', particleVert, particleFrag, SPRITE_ATTRS, LIMIT_UNIFORMS, [
        'VERTICAL',
        'SIZE_LIMITS',
    ]);
    push('horizontal billboard size limits', particleVert, particleFrag, SPRITE_ATTRS, LIMIT_UNIFORMS, [
        'HORIZONTAL',
        'SIZE_LIMITS',
    ]);
    push(
        'stretched size limits',
        stretchedVert,
        particleFrag,
        [...SPRITE_ATTRS, 'velocity'],
        [...LIMIT_UNIFORMS, 'speedFactor'],
        ['SIZE_LIMITS']
    );
    const PIVOT_UNIFORMS = [...SPRITE_UNIFORMS, 'pivot'];
    push('billboard pivot', particleVert, particleFrag, SPRITE_ATTRS, PIVOT_UNIFORMS, ['PIVOT']);
    push('vertical billboard pivot', particleVert, particleFrag, SPRITE_ATTRS, PIVOT_UNIFORMS, ['VERTICAL', 'PIVOT']);
    push('horizontal billboard pivot', particleVert, particleFrag, SPRITE_ATTRS, PIVOT_UNIFORMS, [
        'HORIZONTAL',
        'PIVOT',
    ]);
    push(
        'stretched pivot',
        stretchedVert,
        particleFrag,
        [...SPRITE_ATTRS, 'velocity'],
        [...PIVOT_UNIFORMS, 'speedFactor'],
        ['PIVOT']
    );
    push(
        'stretched',
        stretchedVert,
        particleFrag,
        [...SPRITE_ATTRS, 'velocity'],
        [...SPRITE_UNIFORMS, 'speedFactor'],
        []
    );
    push(
        'beam',
        stretchedVert,
        particleFrag,
        [...SPRITE_ATTRS, 'velocity'],
        [...SPRITE_UNIFORMS, 'speedFactor'],
        ['BEAM']
    );
    push(
        'beam tiled',
        stretchedVert,
        particleFrag,
        [...SPRITE_ATTRS, 'velocity'],
        [...SPRITE_UNIFORMS, 'speedFactor', 'tileCountX', 'tileCountY'],
        ['BEAM', 'UV_TILE', 'USE_MAP']
    );
    push(
        'mesh',
        meshVert,
        physicsFrag,
        [...SPRITE_ATTRS, 'normal'],
        [...SPRITE_UNIFORMS, 'lightDirection', 'lightColor', 'ambientColor'],
        []
    );
    push('mesh unlit', meshVert, physicsFrag, [...SPRITE_ATTRS, 'normal'], SPRITE_UNIFORMS, ['MESH_UNLIT']);
    const RIM_UNIFORMS = ['eyePosition', 'rimColor', 'rimParams'];
    push(
        'mesh rim',
        meshVert,
        physicsFrag,
        [...SPRITE_ATTRS, 'normal'],
        [...SPRITE_UNIFORMS, 'lightDirection', 'lightColor', 'ambientColor', ...RIM_UNIFORMS],
        ['MESH_RIM']
    );
    push(
        'mesh unlit rim mix',
        meshVert,
        physicsFrag,
        [...SPRITE_ATTRS, 'normal'],
        [...SPRITE_UNIFORMS, ...RIM_UNIFORMS],
        ['MESH_UNLIT', 'MESH_RIM', 'MESH_RIM_MIX']
    );
    push(
        'mesh unlit rim fade',
        meshVert,
        physicsFrag,
        [...SPRITE_ATTRS, 'normal'],
        [...SPRITE_UNIFORMS, ...RIM_UNIFORMS],
        ['MESH_UNLIT', 'MESH_RIM', 'MESH_RIM_FADE']
    );

    // Texture effects (chunks/surface.ts), with and without a map and a blended second tile.
    const surfaceOptions = [
        ['MAP_TRANSFORM'],
        ['UV1', 'MAP_TRANSFORM', 'MAP_UV1'],
        ['UV1', 'MAP_TRANSFORM', 'MAP_UV1', 'UV_DISTORTION', 'GRADIENT_MAP', 'EROSION'],
        ['GRADIENT_MAP'],
        ['EROSION'],
        ['EROSION', 'EROSION_MASK'],
        ['MAP_TRANSFORM', 'GRADIENT_MAP', 'EROSION', 'EROSION_MASK'],
        ['UV_DISTORTION'],
        ['MAP_TRANSFORM', 'UV_DISTORTION', 'GRADIENT_MAP', 'EROSION', 'EROSION_MASK'],
        ['UV1', 'UV_DISTORTION', 'UV_DISTORTION_UV1'],
        ['UV1', 'EROSION', 'EROSION_MASK', 'EROSION_MASK_UV1'],
        [
            'UV1',
            'MAP_TRANSFORM',
            'UV_DISTORTION',
            'UV_DISTORTION_UV1',
            'GRADIENT_MAP',
            'EROSION',
            'EROSION_MASK',
            'EROSION_MASK_UV1',
        ],
    ];
    const surfaceTargets = [
        {name: 'billboard', vertex: particleVert, fragment: particleFrag, attributes: SPRITE_ATTRS, extra: []},
        {
            name: 'mesh unlit',
            vertex: meshVert,
            fragment: physicsFrag,
            attributes: [...SPRITE_ATTRS, 'normal'],
            extra: ['MESH_UNLIT'],
        },
        {
            name: 'mesh unlit uv2',
            vertex: meshVert,
            fragment: physicsFrag,
            attributes: [...SPRITE_ATTRS, 'normal', 'uv2'],
            extra: ['MESH_UNLIT', 'MESH_UV2'],
        },
        {
            name: 'beam',
            vertex: stretchedVert,
            fragment: particleFrag,
            attributes: [...SPRITE_ATTRS, 'velocity'],
            extra: ['BEAM'],
        },
        {
            name: 'trail',
            vertex: trailVert,
            fragment: trailFrag,
            attributes: ['position', 'previous', 'next', 'side', 'width', 'uv', 'color'],
            extra: [],
        },
    ];
    for (const target of surfaceTargets)
        for (const surface of surfaceOptions.filter(
            // The second UV set is only read under UV1.
            (options) => !target.extra.includes('MESH_UV2') || options.includes('UV1')
        ))
            for (const map of mapOptions)
                for (const tile of target.name === 'trail' ? [[]] : [[], ['UV_TILE', 'TILE_BLEND']]) {
                    const defines = [...target.extra, ...surface, ...map, ...tile];
                    const uniforms =
                        target.name === 'trail'
                            ? ['view', 'projection']
                            : [...SPRITE_UNIFORMS, ...(target.name === 'beam' ? ['speedFactor'] : [])];
                    const samplers: string[] = [...map.map(() => 'map')];
                    if (tile.length) uniforms.push('tileCountX', 'tileCountY');
                    if (surface.includes('MAP_TRANSFORM')) uniforms.push('mapTransform');
                    if (surface.includes('UV_DISTORTION')) {
                        uniforms.push('distortionTransform', 'distortionStrength');
                        samplers.push('distortionMap');
                    }
                    if (surface.includes('GRADIENT_MAP')) {
                        uniforms.push('gradientMapRange', 'gradientMapChannel');
                        samplers.push('gradientMap');
                    }
                    if (surface.includes('EROSION')) uniforms.push('erosionParams', 'erosionEdgeColor');
                    if (surface.includes('EROSION_MASK')) {
                        samplers.push('erosionMask');
                        uniforms.push('erosionMaskTransform');
                    }
                    // A trail's channel 1 arrives as its own vertex buffer.
                    const attributes =
                        target.name === 'trail' && surface.includes('UV1')
                            ? [...target.attributes, 'uv2']
                            : target.attributes;
                    out.push({
                        name: `${target.name} surface [${defines.join(',')}]`,
                        vertex: target.vertex,
                        fragment: target.fragment,
                        attributes,
                        uniforms,
                        samplers,
                        defines,
                    });
                }

    const trailSoft = [[], ['SOFT_PARTICLES'], ['SOFT_PARTICLES', 'SOFT_DEPTH_PACKED']];
    const trailAlpha = [[], ['USE_ALPHATEST']];
    const trailFog = [[], ['FOG'], ['FOG', 'FOG_ADDITIVE']];
    for (const map of mapOptions)
        for (const soft of trailSoft)
            for (const alpha of trailAlpha)
                for (const fog of trailFog) {
                    const defines = [...map, ...soft, ...alpha, ...fog];
                    const uniforms = ['view', 'projection'];
                    const samplers: string[] = map.length ? ['map'] : [];
                    if (soft.length) {
                        uniforms.push('softParams', 'projParams');
                        samplers.push('depthTexture');
                    }
                    if (alpha.length) uniforms.push('alphaTest');
                    if (fog.length) uniforms.push('vFogInfos', 'vFogColor');
                    out.push({
                        name: `trail [${defines.join(',') || 'none'}]`,
                        vertex: trailVert,
                        fragment: trailFrag,
                        attributes: ['position', 'previous', 'next', 'side', 'width', 'uv', 'color'],
                        uniforms,
                        samplers,
                        defines,
                    });
                }
    return out;
}

const results: Array<{name: string; vertex: string; fragment: string; error?: string}> = [];

// Self-test: deliberately invalid WGSL. If this reports ok, the harness is not
// actually compiling anything and every other result is meaningless.
const selfTest: Case = {
    name: 'SELF-TEST (must fail)',
    vertex: `@vertex\nfn main(input: VertexInputs) -> FragmentInputs { this is not wgsl }`,
    fragment: trailFrag,
    attributes: ['position'],
    uniforms: ['world'],
    samplers: [],
    defines: [],
};

for (const [i, c] of [selfTest, ...cases()].entries()) {
    const name = `probe${i}`;
    ShaderStore.ShadersStoreWGSL[name + 'VertexShader'] = c.vertex;
    ShaderStore.ShadersStoreWGSL[name + 'FragmentShader'] = c.fragment;
    try {
        // createEffect rather than ShaderMaterial: the material only builds its
        // effect when something asks it to draw, and its isReady() is no proof
        // of anything anyway — a WebGPU shader module is created without
        // throwing, so Babylon happily reports ready for source that does not
        // compile. Here we take the WGSL Babylon actually produced and compile
        // it ourselves, where getCompilationInfo() gives the browser's verdict.
        const effect = engine.createEffect(
            {vertex: name, fragment: name},
            {
                attributes: c.attributes,
                uniformsNames: c.uniforms,
                samplers: c.samplers,
                defines: c.defines.map((d) => `#define ${d}`).join('\n'),
                shaderLanguage: ShaderLanguage.WGSL,
            },
            engine
        );

        const deadline = Date.now() + 10000;
        while (!effect.vertexSourceCode && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 25));
        }
        results.push({
            name: c.name,
            vertex: effect.vertexSourceCode,
            fragment: effect.fragmentSourceCode,
            error: effect.vertexSourceCode ? undefined : effect.getCompilationError() || 'Babylon produced no source',
        });
    } catch (e) {
        results.push({name: c.name, vertex: '', fragment: '', error: String(e)});
    }
}

(window as any).__wgslSources = results;
