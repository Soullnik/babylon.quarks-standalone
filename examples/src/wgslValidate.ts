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
    const softOptions = [[], ['SOFT_PARTICLES']];
    const alphaOptions = [[], ['USE_ALPHATEST']];

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
                    for (const alpha of alphaOptions) {
                        const defines = [...extra, ...tile, ...map, ...soft, ...alpha];
                        const uniforms = [...baseUniforms];
                        const samplers: string[] = [];
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
    push(
        'stretched',
        stretchedVert,
        particleFrag,
        [...SPRITE_ATTRS, 'velocity'],
        [...SPRITE_UNIFORMS, 'speedFactor'],
        []
    );
    push(
        'mesh',
        meshVert,
        physicsFrag,
        [...SPRITE_ATTRS, 'normal'],
        [...SPRITE_UNIFORMS, 'lightDirection', 'lightColor', 'ambientColor'],
        []
    );

    for (const map of mapOptions) {
        out.push({
            name: `trail ${map.length ? '[USE_MAP]' : '[none]'}`,
            vertex: trailVert,
            fragment: trailFrag,
            attributes: ['position', 'previous', 'next', 'side', 'width', 'uv', 'color'],
            uniforms: ['world', 'view', 'projection', 'lineWidth', 'resolution', 'sizeAttenuation'],
            samplers: map.length ? ['map'] : [],
            defines: map,
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
