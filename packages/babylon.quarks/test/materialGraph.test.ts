/**
 * Material graphs — a material's own shading compiled from a Unity Shader Graph: the fragment
 * shader generated from one, and how it travels through the loader, serialization and batching.
 */
import {FreeCamera} from '@babylonjs/core/Cameras/freeCamera';
import {Constants} from '@babylonjs/core/Engines/constants';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {Scene} from '@babylonjs/core/scene';
import {ConstantValue, PointEmitter} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {buildGraphFragment, MaterialGraph, sourceHash} from '../src/materialGraph';
import {ParticleSystem} from '../src/ParticleSystem';
import {QuarksLoader} from '../src/QuarksLoader';
import particleFragShader from '../src/shaders/particle_frag.glsl';
import particleFragShaderWgsl from '../src/shaders/particle_frag.wgsl';
import {SpriteBatch} from '../src/SpriteBatch';
import {RenderMode} from '../src/VFXBatch';
import {kitchenSinkGraph, minimalGraph} from './materialGraphFixtures';

let engine: NullEngine;
let scene: Scene;

beforeAll(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    new FreeCamera('camera', new Vector3(0, 0, -10), scene);
});

afterAll(() => {
    scene.dispose();
    engine.dispose();
});

describe('buildGraphFragment', () => {
    it('writes the same graph in GLSL and WGSL, with a sampler per real texture', () => {
        const fragment = buildGraphFragment(kitchenSinkGraph());
        // Slot 2 holds only a colour: folded into the code, no sampler.
        expect(fragment.samplers).toEqual(['graphTex0', 'graphTex1', 'depthTexture']);
        expect(fragment.usesScreen).toBe(true);
        expect(fragment.usesDepth).toBe(true);
        expect(fragment.uniforms).toEqual(['graphTime', 'graphCamera', 'graphEye', 'graphForward']);
        for (const code of [fragment.glsl, fragment.wgsl]) {
            expect(code).toContain('graphTex0');
            expect(code).not.toContain('graphTex2');
            expect(code).toContain('discard');
            expect(code).toContain('LINEAR_OUTPUT');
        }
        expect(fragment.glsl).toContain('varying vec4 projPosition;');
        expect(fragment.wgsl).toContain('var depthTexture: texture_2d<f32>;');
        // The sRGB texture is decoded, the linear one is not.
        expect(fragment.glsl).toMatch(/graphDecode\(texture2D\(graphTex0,/);
        expect(fragment.glsl).not.toMatch(/graphDecode\(texture2D\(graphTex1,/);
        expect(fragment.glsl).toContain('vec4(1.0, 0.5, 0.25, 1.0)');
        // WGSL reads uniforms and varyings through Babylon's structs.
        expect(fragment.wgsl).toContain('uniforms.graphTime');
        expect(fragment.wgsl).toContain('fragmentInputs.vUV');
        expect(fragment.wgsl).not.toContain('graphRawDepth()');
    });

    it('drops the nodes nothing reads', () => {
        const graph = kitchenSinkGraph();
        const unused = graph.nodes.length - 2;
        expect(graph.nodes[unused].op).toBe('sin');
        expect(buildGraphFragment(graph).glsl).not.toContain(`n${unused} =`);
    });

    it('leaves out the screen and depth when the graph does not read them', () => {
        const fragment = buildGraphFragment(minimalGraph());
        expect(fragment.usesScreen).toBe(false);
        expect(fragment.usesDepth).toBe(false);
        expect(fragment.samplers).toEqual(['graphTex0']);
        expect(fragment.glsl).not.toContain('projPosition');
        expect(fragment.wgsl).not.toContain('projPosition');
        expect(fragment.glsl).not.toContain('discard');
    });

    it('converts a gamma-space graph the other way round', () => {
        const linear = buildGraphFragment(kitchenSinkGraph());
        const gamma = buildGraphFragment(kitchenSinkGraph('gamma'));
        const tail = (code: string) => code.slice(code.lastIndexOf('#ifdef LINEAR_OUTPUT'));
        expect(tail(linear.glsl)).toMatch(/#ifdef LINEAR_OUTPUT\s+gl_FragColor = vec4\(graphColor, graphAlpha\);/);
        expect(tail(gamma.glsl)).toMatch(/#ifdef LINEAR_OUTPUT\s+gl_FragColor = vec4\(quarksToLinear\(graphColor\)/);
        expect(tail(linear.glsl)).toMatch(/#else\s+gl_FragColor = vec4\(quarksToGamma\(graphColor\)/);
        expect(tail(gamma.wgsl)).toMatch(/#else\s+fragmentOutputs.color = vec4f\(graphColor, graphAlpha\);/);
    });

    it('refuses a graph that does not hold together', () => {
        const broken = (edit: (g: MaterialGraph) => void) => {
            const graph = minimalGraph();
            edit(graph);
            return () => buildGraphFragment(graph);
        };
        expect(broken((g) => (g.color = 99))).toThrow('out of range');
        expect(broken((g) => (g.nodes[0] = {op: 'cast', type: 2, arg: 3}))).toThrow('comes after it');
        expect(broken((g) => (g.color = g.alpha))).toThrow('not a 3-vector');
        expect(broken((g) => (g.alpha = g.color))).toThrow('not a scalar');
        expect(broken((g) => (g.nodes[g.alpha] = {op: 'bogus', type: 1}))).toThrow("unknown operation 'bogus'");
        expect(broken((g) => (g.textures = []))).toThrow('texture 0 missing');
    });

    it('decodes and encodes with the same curve as the particle shaders', () => {
        const fragment = buildGraphFragment(minimalGraph());
        for (const code of [fragment.glsl, fragment.wgsl, particleFragShader, particleFragShaderWgsl]) {
            expect(code).toContain('quarksToLinear(');
            expect(code).not.toContain('USE_EXACT_SRGB_CONVERSIONS');
        }
    });

    it('names a shader after its source', () => {
        expect(sourceHash('a')).toBe(sourceHash('a'));
        expect(sourceHash('a')).not.toBe(sourceHash('b'));
        expect(sourceHash('')).toMatch(/^[0-9a-z]+$/);
    });
});

/** The texture a batch binds where it has none. */
const white = () => (SpriteBatch as any).whiteTexture(scene);

describe('material graph in an effect', () => {
    const effect = (graph: unknown, renderMode = 0) => ({
        metadata: {version: 4.5, type: 'Object3D'},
        geometries: [],
        textures: [{uuid: 'tex', image: 'img', wrapS: 1001, wrapT: 1001}],
        images: [{uuid: 'img', url: 'data:image/png;base64,iVBORw0KGgo='}],
        materials: [{uuid: 'm', type: 'QuarksMaterial', transparent: true, alphaMode: Constants.ALPHA_ADD, graph}],
        object: {
            uuid: 'root',
            type: 'ParticleEmitter',
            name: 'fx',
            matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            ps: {
                version: '3.0',
                autoDestroy: false,
                looping: true,
                prewarm: false,
                duration: 1,
                shape: {type: 'point'},
                startLife: {type: 'ConstantValue', value: 1},
                startSpeed: {type: 'ConstantValue', value: 0},
                startRotation: {type: 'ConstantValue', value: 0},
                startSize: {type: 'ConstantValue', value: 1},
                startColor: {type: 'ConstantColor', color: {r: 1, g: 1, b: 1, a: 1}},
                emissionOverTime: {type: 'ConstantValue', value: 10},
                emissionOverDistance: {type: 'ConstantValue', value: 0},
                onlyUsedByOther: false,
                rendererEmitterSettings: {},
                renderMode,
                material: 'm',
                startTileIndex: 0,
                uTileCount: 1,
                vTileCount: 1,
                behaviors: [],
                worldSpace: false,
            },
        },
    });

    /** The kitchen-sink graph as the exporter writes it: textures by uuid, empty slots as colours. */
    const exported = () => ({
        ...kitchenSinkGraph('gamma'),
        textures: [{texture: 'tex', srgb: true}, {texture: 'tex', srgb: false}, {color: [1, 0.5, 0.25, 1]}],
    });

    function load(graph: unknown, renderMode = 0): ParticleSystem {
        const root = new QuarksLoader(scene).parse(effect(graph, renderMode), '');
        return (root as any).system as ParticleSystem;
    }

    it('resolves the textures on load and writes the graph back', () => {
        const system = load(exported());
        const graph = system.getRendererSettings().materialGraph!;
        expect(graph.textures[0].texture).toBeInstanceOf(Texture);
        expect(graph.textures[1]).toMatchObject({srgb: false});
        expect(graph.textures[2]).toEqual({color: [1, 0.5, 0.25, 1]});
        expect(graph.space).toBe('gamma');

        const meta: any = {textures: {}, materials: {}, geometries: {}};
        const json = system.toJSON(meta);
        const written = meta.materials[json.material!].graph;
        expect(meta.textures[written.textures[0].texture]).toBe(graph.textures[0].texture);
        expect(written.textures[1].srgb).toBe(false);
        expect(written.textures[2]).toEqual({color: [1, 0.5, 0.25, 1]});
        expect(written.nodes).toEqual(graph.nodes);
        expect(written).toMatchObject({color: graph.color, alpha: graph.alpha, alphaClip: graph.alphaClip});
        expect(written.space).toBe('gamma');
        system.dispose();
    });

    it('ignores a graph without nodes', () => {
        const system = load({textures: []});
        expect(system.getRendererSettings().materialGraph).toBeNull();
        system.dispose();
    });

    function material(renderer: BatchedRenderer): ShaderMaterial {
        return renderer.batches[0].mesh.material as ShaderMaterial;
    }

    it('draws a billboard with the graph, binding its textures, time and camera', () => {
        const renderer = new BatchedRenderer('graph', scene);
        const system = load(exported());
        renderer.addSystem(system);
        const mat = material(renderer);
        const options = mat.options;
        expect(options.samplers).toEqual(expect.arrayContaining(['graphTex0', 'graphTex1', 'depthTexture']));
        expect(options.samplers).not.toContain('map');
        expect(options.uniforms).toEqual(expect.arrayContaining(['graphTime', 'graphCamera']));
        expect(options.defines).toContain('SOFT_PARTICLES');
        expect(options.defines).not.toContain('USE_MAP');
        expect(mat.getClassName()).toBe('ShaderMaterial');

        const textures = (mat as any)._textures;
        expect(textures.graphTex0).toBe(system.getRendererSettings().materialGraph!.textures[0].texture);
        // No scene depth yet: white stands in, and the shader is told so.
        expect(textures.depthTexture).toBe(white());
        mat.onBindObservable.notifyObservers(renderer.batches[0].mesh);
        expect((mat as any)._vectors4.graphCamera.w).toBe(0);
        expect((mat as any)._vectors4.graphTime.x).toBeGreaterThanOrEqual(0);
        expect((mat as any)._vectors3.graphForward.z).toBeCloseTo(1);

        // A depth texture arriving later reaches the graph on its next draw.
        const depth = new Texture(null, scene);
        renderer.batches[0].applyDepthTexture(depth);
        mat.onBindObservable.notifyObservers(renderer.batches[0].mesh);
        expect((material(renderer) as any)._textures.depthTexture).toBe(depth);
        expect((material(renderer) as any)._vectors4.graphCamera.w).toBe(1);
        renderer.batches[0].applyDepthTexture(null);
        expect((material(renderer) as any)._textures.depthTexture).toBe(white());
        depth.dispose();
        renderer.dispose();
        system.dispose();
    });

    it('shares one shader between batches of the same graph', () => {
        const a = new BatchedRenderer('a', scene);
        const b = new BatchedRenderer('b', scene);
        const graph = exported();
        const first = load(graph);
        const second = load(graph);
        a.addSystem(first);
        b.addSystem(second);
        expect(material(a).name).toMatch(/^quarksParticle_0_g[0-9a-z]+$/);
        expect(material(b).name).toBe(material(a).name);
        for (const x of [a, b, first, second]) x.dispose();
    });

    it('draws mesh particles with the graph alone, unlit', () => {
        const renderer = new BatchedRenderer('mesh', scene);
        const system = new ParticleSystem({
            scene,
            renderMode: RenderMode.Mesh,
            startLife: new ConstantValue(1),
            startSpeed: new ConstantValue(0),
            emissionOverTime: new ConstantValue(10),
            shape: new PointEmitter(),
            material: {graph: {...minimalGraph(), textures: [{texture: new Texture(null, scene), srgb: true}]}},
        });
        renderer.addSystem(system);
        const mat = material(renderer);
        expect(mat.name).toMatch(/^quarksParticle_2_g/);
        expect(mat.options.samplers).toContain('graphTex0');
        expect(mat.options.samplers).not.toContain('map');
        expect(mat.options.uniforms).not.toContain('lightDirection');
        expect(mat.options.attributes).toContain('normal');
        renderer.dispose();
        system.dispose();
    });

    it('falls back to texture × colour for a graph that does not build', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const renderer = new BatchedRenderer('broken', scene);
        const broken = load({...exported(), color: 999});
        renderer.addSystem(broken);
        expect(material(renderer).name).toBe('quarksParticle_0');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('out of range'));
        warn.mockRestore();
        renderer.dispose();
        broken.dispose();
    });
});
