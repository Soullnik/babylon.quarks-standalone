import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {RawTexture} from '@babylonjs/core/Materials/Textures/rawTexture';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {storedBatchSettings} from '../src/batchKey';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import {shaderProgram, ShaderProgram} from '../src/shaderProgram';
import {sheetCell} from '../src/shaders/chunks/sheet';
import {shaderVariants} from '../src/shaderVariants';
import {RenderMode} from '../src/VFXBatch';

/**
 * The shader variants are the library's own account of what it compiles: every define, uniform,
 * sampler and attribute the shaders know must be reachable from a batch's settings, and a batch
 * must build exactly the program `shaderProgram` describes, so that compiling the variants (the
 * `validate:shaders` job) proves the batches' materials compile.
 */
const variants = shaderVariants();
const programs = variants.map((v) => v.program);

/** The identifiers after `#ifdef`, `#ifndef`, `#if defined(` and `#elif defined(` in a source. */
function definesReferenced(source: string): Set<string> {
    const out = new Set<string>();
    for (const [, name] of source.matchAll(/#(?:ifdef|ifndef)\s+([A-Z_0-9]+)/g)) out.add(name);
    for (const [, name] of source.matchAll(/defined\(\s*([A-Z_0-9]+)\s*\)/g)) out.add(name);
    return out;
}

/** The uniform names a GLSL source declares. */
function uniformsDeclared(glsl: string): Set<string> {
    const out = new Set<string>();
    for (const [, name] of glsl.matchAll(/^\s*uniform\s+(?!sampler)\w+\s+(\w+)\s*;/gm)) out.add(name);
    return out;
}

/** The sampler names a GLSL source declares. */
function samplersDeclared(glsl: string): Set<string> {
    const out = new Set<string>();
    for (const [, name] of glsl.matchAll(/^\s*uniform\s+sampler\w+\s+(\w+)\s*;/gm)) out.add(name);
    return out;
}

/** The attribute names a GLSL vertex source declares. */
function attributesDeclared(glsl: string): Set<string> {
    const out = new Set<string>();
    for (const [, name] of glsl.matchAll(/^\s*attribute\s+\w+\s+(\w+)\s*;/gm)) out.add(name);
    return out;
}

const union = <T>(sets: Iterable<Set<T>>): Set<T> => {
    const out = new Set<T>();
    for (const set of sets) for (const item of set) out.add(item);
    return out;
};

describe('the shader variants cover the shaders', () => {
    it('are distinct and plentiful', () => {
        const keys = new Set(programs.map((p) => p.name + p.defines.join(',')));
        expect(keys.size).toBe(programs.length);
        expect(programs.length).toBeGreaterThan(1000);
    });

    it('emit every define the shaders test, and no define they do not', () => {
        const sources = programs.flatMap((p) => [p.vertex.glsl, p.vertex.wgsl, p.fragment.glsl, p.fragment.wgsl]);
        const referenced = union(sources.map(definesReferenced));
        const emitted = union(programs.map((p) => new Set(p.defines)));
        expect([...emitted].sort()).toEqual([...referenced].sort());
    });

    it('list only uniforms, samplers and attributes the program source declares, and all of them', () => {
        const declaredUniforms = new Set<string>();
        const declaredSamplers = new Set<string>();
        const declaredAttributes = new Set<string>();
        const listedUniforms = new Set<string>();
        const listedSamplers = new Set<string>();
        const listedAttributes = new Set<string>();
        for (const program of programs) {
            const source = program.vertex.glsl + '\n' + program.fragment.glsl;
            const uniforms = uniformsDeclared(source);
            const samplers = samplersDeclared(source);
            const attributes = attributesDeclared(program.vertex.glsl);
            for (const name of program.uniforms) {
                expect(uniforms).toContain(name);
                listedUniforms.add(name);
            }
            for (const name of program.samplers) {
                expect(samplers).toContain(name);
                listedSamplers.add(name);
            }
            for (const name of program.attributes) {
                expect(attributes).toContain(name);
                listedAttributes.add(name);
            }
            uniforms.forEach((name) => declaredUniforms.add(name));
            samplers.forEach((name) => declaredSamplers.add(name));
            attributes.forEach((name) => declaredAttributes.add(name));
        }
        // A declared name no program lists is dead: either the shader or the program is wrong.
        expect([...declaredUniforms].sort()).toEqual([...listedUniforms].sort());
        expect([...declaredSamplers].sort()).toEqual([...listedSamplers].sort());
        expect([...declaredAttributes].sort()).toEqual([...listedAttributes].sort());
    });

    it('never blend a second cell without a sheet', () => {
        for (const program of programs) {
            if (program.defines.includes('TILE_BLEND')) {
                expect(program.defines).toContain('UV_TILE');
            }
        }
    });

    it('reach the combinations the audit found uncompiled', () => {
        const has = (...defines: string[]) => programs.some((p) => defines.every((d) => p.defines.includes(d)));
        expect(has('USE_ENVMAP_ATLAS', 'MESH_RIM')).toBe(true);
        expect(has('MESH_UV2', 'UV_TILE')).toBe(true);
        expect(has('EROSION', 'SOFT_PARTICLES', 'USE_ALPHATEST', 'FOG')).toBe(true);
        expect(has('PIVOT', 'SIZE_LIMITS')).toBe(true);
        expect(
            programs.some(
                (p) => p.name === `quarksParticle_${RenderMode.StretchedBillBoard}` && p.defines.includes('UV1')
            )
        ).toBe(true);
        expect(
            programs.some(
                (p) =>
                    !p.defines.includes('MESH_UNLIT') &&
                    p.name === `quarksParticle_${RenderMode.Mesh}` &&
                    p.defines.includes('GRADIENT_MAP')
            )
        ).toBe(true);
    });
});

let engine: NullEngine;
let scene: Scene;

beforeAll(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
});

afterAll(() => {
    scene.dispose();
    engine.dispose();
});

function system(parameters: Partial<ParticleSystemParameters> = {}): ParticleSystem {
    return new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new ConstantValue(1),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(10),
        shape: new PointEmitter(),
        ...parameters,
    });
}

/** The material a renderer builds for `parameters`, drawn once so the batch exists. */
function materialOf(parameters: Partial<ParticleSystemParameters>): {
    material: ShaderMaterial;
    program: ShaderProgram;
} {
    const renderer = new BatchedRenderer('variants', scene);
    const ps = system(parameters);
    renderer.addSystem(ps);
    renderer.update(1 / 60);
    const batch = renderer.batches[0];
    const material = batch.mesh.material as ShaderMaterial;
    const program = shaderProgram(batch.settings, {depth: null, envAtlasReady: false, meshUV2: false});
    renderer.dispose();
    ps.dispose();
    return {material, program};
}

describe('a batch builds the program shaderProgram describes', () => {
    const texture = () => RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, scene);
    it.each([
        ['billboard', {}],
        [
            'tiled blended sheet with alpha test',
            {texture: texture(), uTileCount: 4, vTileCount: 2, blendTiles: true, alphaTest: 0.5},
        ],
        ['stretched with erosion', {renderMode: RenderMode.StretchedBillBoard, erosion: {}}],
        ['trail with a map', {renderMode: RenderMode.Trail, texture: texture()}],
    ] as Array<[string, Partial<ParticleSystemParameters>]>)('%s', (_name, parameters) => {
        const {material, program} = materialOf(parameters);
        expect(material.options.defines).toEqual(program.defines);
        expect(material.options.uniforms).toEqual(program.uniforms);
        expect(material.options.samplers).toEqual(program.samplers);
        expect(material.options.attributes).toEqual(program.attributes);
        expect(material.name).toBe(program.name);
    });

    it('blends no second cell on a 1×1 sheet, in the material and in the batch key', () => {
        const {material} = materialOf({texture: texture(), blendTiles: true});
        expect(material.options.defines).not.toContain('TILE_BLEND');
        const stored = storedBatchSettings(system({blendTiles: true}).getRendererSettings());
        expect(stored.blendTiles).toBe(false);
        expect(storedBatchSettings(system({blendTiles: true, uTileCount: 2}).getRendererSettings()).blendTiles).toBe(
            true
        );
    });
});

describe('the sheet and soft fade inputs are normalised', () => {
    it('keeps tile counts to whole numbers of at least 1', () => {
        const ps = system({uTileCount: 2.7, vTileCount: 0});
        expect(ps.uTileCount).toBe(2);
        expect(ps.vTileCount).toBe(1);
        ps.uTileCount = NaN;
        ps.vTileCount = -3;
        expect(ps.uTileCount).toBe(1);
        expect(ps.vTileCount).toBe(1);
        const meta = {geometries: {}, materials: {}, textures: {}};
        const loaded = ParticleSystem.fromJSON(
            {...ps.toJSON(meta), uTileCount: 3.9, vTileCount: Infinity},
            meta,
            {},
            scene
        );
        expect(loaded.uTileCount).toBe(3);
        expect(loaded.vTileCount).toBe(1);
    });

    it('fades over one unit by default and never over a negative distance', () => {
        const ps = system({softParticles: true});
        expect(ps.softNearFade).toBe(0);
        expect(ps.softFarFade).toBe(1);
        ps.softFarFade = -2;
        expect(ps.softFarFade).toBe(1);
        ps.softNearFade = NaN;
        expect(ps.softNearFade).toBe(0);
        ps.softFarFade = 0.25;
        const meta = {geometries: {}, materials: {}, textures: {}};
        const json = ps.toJSON(meta);
        expect(json.softFarFade).toBe(0.25);
        expect(json.softNearFade).toBeUndefined();
        const loaded = ParticleSystem.fromJSON({...json, softNearFade: -1}, meta, {}, scene);
        expect(loaded.softNearFade).toBe(0);
        expect(loaded.softFarFade).toBe(0.25);
    });
});

describe('the sheet cell', () => {
    it('wraps a frame into the sheet in both directions', () => {
        expect(sheetCell(0, 4, 2)).toEqual({column: 0, row: 0});
        expect(sheetCell(5.9, 4, 2)).toEqual({column: 1, row: 1});
        expect(sheetCell(8, 4, 2)).toEqual({column: 0, row: 0});
        expect(sheetCell(-1, 4, 2)).toEqual({column: 3, row: 1});
        expect(sheetCell(-0.5, 4, 2)).toEqual({column: 3, row: 1});
    });

    it('is the formula the vertex shaders use, in both languages', () => {
        for (const program of programs) {
            if (program.defines.includes('UV_TILE') && program.name !== 'quarksTrail') {
                expect(program.vertex.glsl).toContain('mod(floor(uvTile), tileTotal)');
                expect(program.vertex.wgsl).toContain('quarksWrap(floor(vertexInputs.uvTile), tileTotal)');
                expect(program.vertex.glsl).toContain('mod(baseTile + 1.0, tileTotal)');
                expect(program.vertex.wgsl).toContain('quarksWrap(baseTile + 1.0, tileTotal)');
            }
        }
    });
});
