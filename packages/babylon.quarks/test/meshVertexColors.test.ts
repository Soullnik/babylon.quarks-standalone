import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import {QuarksLoader} from '../src/QuarksLoader';
import type {QuarksGeometryJSON} from '../src/QuarksSerializer';
import meshVertGLSL from '../src/shaders/local_particle_physics_vert.glsl';
import meshVertWGSL from '../src/shaders/local_particle_physics_vert.wgsl';
import {shaderVariants} from '../src/shaderVariants';
import {resolveGeometryData} from '../src/system/geometry';
import {RenderMode} from '../src/VFXBatch';
import {emptyMeta} from './internals';

/**
 * Unity multiplies a particle's colour by the vertex colours of the mesh it is drawn with, taken as
 * they are: in its Linear colour space the particle colour is converted from gamma space and the
 * vertex colours are not. A charge-up stream drawn on a spiral whose vertex
 * colours go to black at both ends fades out there instead of ending in a hard edge where the
 * mesh ends.
 */
let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
});

afterEach(() => {
    scene.dispose();
    engine.dispose();
});

const quad = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
const quadColors = new Float32Array([0, 0, 0, 1, 0.25, 0.25, 0.25, 1, 1, 1, 1, 0.5, 0.5, 0.5, 0.5, 1]);

function system(overrides: Partial<ParticleSystemParameters> = {}) {
    return new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new ConstantValue(1),
        startSpeed: new ConstantValue(1),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(10),
        shape: new PointEmitter(),
        renderMode: RenderMode.Mesh,
        instancingGeometry: quad,
        ...overrides,
    });
}

function batchOf(renderer: BatchedRenderer, s: ParticleSystem) {
    return renderer.batches[renderer.systemToBatchIndex.get(s)!];
}

function materialOf(renderer: BatchedRenderer, s: ParticleSystem): ShaderMaterial {
    return batchOf(renderer, s).mesh.material as ShaderMaterial;
}

describe('mesh vertex colours', () => {
    it('multiply the particle colour, as they are, in the mesh shader', () => {
        const glslMain = meshVertGLSL.slice(meshVertGLSL.indexOf('void main()'));
        expect(meshVertGLSL).toMatch(/#ifdef MESH_COLOR\s*\/\/[^\n]*\nattribute vec4 meshColor;/);
        // After the particle colour comes into the working space, and not through it.
        expect(glslMain).toMatch(
            /vColor = quarksParticleColor\(color\);\s*#ifdef MESH_COLOR[^#]*vColor \*= meshColor;/
        );
        const wgslMain = meshVertWGSL.slice(meshVertWGSL.indexOf('fn main('));
        expect(meshVertWGSL).toContain('attribute meshColor: vec4f;');
        expect(wgslMain).toMatch(
            /vColor = quarksParticleColor\(vertexInputs\.color\);\s*#ifdef MESH_COLOR[^#]*vColor \*= vertexInputs\.meshColor;/
        );
    });

    it('go up with the geometry, in its one binding, and compile the shader that reads them', () => {
        const renderer = new BatchedRenderer('colors', scene);
        const erosion = {mask: new Texture(null, scene), maskUV: {channel: 1 as const}};
        const uvs2 = new Float32Array(8);
        const s = system({instancingColors: quadColors, instancingUVs2: uvs2, erosion});
        renderer.addSystem(s);
        const batch = batchOf(renderer, s);
        const material = materialOf(renderer, s);
        expect(material.options.defines).toContain('MESH_COLOR');
        const attributes = material.options.attributes;
        // The geometry's attributes in the order of its interleaved buffer, then the instances'.
        expect(attributes.slice(0, 5)).toEqual(['position', 'uv', 'normal', 'uv2', 'meshColor']);
        const colorBuffer = batch.mesh.getVertexBuffer('meshColor')!;
        expect(colorBuffer.getBuffer()).toBe(batch.mesh.getVertexBuffer('position')!.getBuffer());
        expect(colorBuffer.getSize()).toBe(4);
        expect(Array.from(batch.mesh.getVerticesData('meshColor')!)).toEqual(Array.from(quadColors));
        renderer.dispose();
    });

    it('batch a mesh apart from the same mesh without them, and reach no other render mode', () => {
        const renderer = new BatchedRenderer('colorKey', scene);
        const colored = system({instancingColors: quadColors});
        const plain = system();
        renderer.addSystem(colored);
        renderer.addSystem(plain);
        expect(renderer.systemToBatchIndex.get(colored)).not.toBe(renderer.systemToBatchIndex.get(plain));
        expect(materialOf(renderer, plain).options.defines).not.toContain('MESH_COLOR');
        expect(materialOf(renderer, plain).options.attributes).not.toContain('meshColor');

        const billboard = system({renderMode: RenderMode.BillBoard, instancingColors: quadColors});
        const billboardPlain = system({renderMode: RenderMode.BillBoard});
        renderer.addSystem(billboard);
        renderer.addSystem(billboardPlain);
        expect(renderer.systemToBatchIndex.get(billboard)).toBe(renderer.systemToBatchIndex.get(billboardPlain));
        expect(materialOf(renderer, billboard).options.attributes).not.toContain('meshColor');
        renderer.dispose();
    });

    it('of the wrong length are left out, with one warning', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const renderer = new BatchedRenderer('colorLength', scene);
            const s = system({instancingColors: new Float32Array(12)});
            renderer.addSystem(s);
            const material = materialOf(renderer, s);
            expect(material.options.defines).not.toContain('MESH_COLOR');
            expect(material.options.attributes).not.toContain('meshColor');
            expect(batchOf(renderer, s).mesh.getVertexBuffer('meshColor')).toBeFalsy();
            renderer.update(0.1);
            renderer.update(0.1);
            const warnings = warn.mock.calls.filter(([message]) => String(message).includes('instancingColors'));
            expect(warnings).toHaveLength(1);
            renderer.dispose();
        } finally {
            warn.mockRestore();
        }
    });

    it('are dropped by a geometry of another vertex count, kept by one of the same', () => {
        const s = system({instancingColors: quadColors});
        s.instancingGeometry = new Float32Array(quad);
        expect(s.instancingColors).toBe(quadColors);
        s.instancingGeometry = quad.slice(0, 9);
        expect(s.instancingColors).toBeUndefined();
    });

    it('are kept by a clone and saved with the geometry, only when there are any', () => {
        const s = system({instancingColors: quadColors});
        expect(s.clone().instancingColors).toBe(quadColors);
        const meta = emptyMeta();
        const json = s.toJSON(meta);
        const geometry = meta.geometries[json.instancingGeometry as string] as QuarksGeometryJSON;
        expect(geometry.colors).toEqual(Array.from(quadColors));
        const copy = ParticleSystem.fromJSON(json, meta, scene);
        expect(Array.from(copy.instancingColors!)).toEqual(Array.from(quadColors));

        const plain = emptyMeta();
        const plainJSON = system().toJSON(plain);
        expect('colors' in plain.geometries[plainJSON.instancingGeometry as string]).toBe(false);
    });

    it("load from an effect's QuarksGeometry", () => {
        const loader = new QuarksLoader(scene);
        // Only the geometries are read; the rest of a loaded document's meta is left out.
        const meta = {geometries: {}} as unknown as Parameters<QuarksLoader['parseGeometries']>[1];
        loader['parseGeometries'](
            [
                {
                    uuid: 'g',
                    type: 'QuarksGeometry',
                    positions: Array.from(quad),
                    indices: [0, 1, 2, 0, 2, 3],
                    colors: Array.from(quadColors),
                },
            ],
            meta
        );
        expect(Array.from(meta.geometries.g.colors!)).toEqual(Array.from(quadColors));
    });

    it('load from a three.js colour attribute: RGB with alpha 1, normalized integers, interleaved', () => {
        const loader = new QuarksLoader(scene);
        const positions = Array.from(quad);
        const rgb = [0, 0, 0, 0.25, 0.25, 0.25, 1, 1, 1, 0.5, 0.5, 0.5];
        const rgba = [0, 0, 0, 1, 0.25, 0.25, 0.25, 1, 1, 1, 1, 1, 0.5, 0.5, 0.5, 1];
        const attributes = {position: {itemSize: 3, array: positions}, color: {itemSize: 3, array: rgb}};
        expect(Array.from(loader['parseBufferGeometry']({attributes}).colors!)).toEqual(rgba);
        // A system's inline geometry reads the same attribute.
        expect(Array.from(resolveGeometryData({attributes}).colors!)).toEqual(rgba);

        const bytes = [0, 0, 0, 255, 51, 51, 51, 255, 255, 255, 255, 0, 102, 102, 102, 255];
        const normalized = loader['parseBufferGeometry']({
            attributes: {
                position: {itemSize: 3, array: positions},
                color: {itemSize: 4, array: bytes, type: 'Uint8Array', normalized: true},
            },
        });
        expect(Array.from(normalized.colors!)).toEqual(bytes.map((b) => Math.fround(b / 255)));

        // One buffer of (x, y, z, r, g, b, a) per vertex.
        const interleaved: number[] = [];
        for (let i = 0; i < 4; i++)
            interleaved.push(...positions.slice(i * 3, i * 3 + 3), ...rgba.slice(i * 4, i * 4 + 4));
        const parsed = loader['parseBufferGeometry']({
            arrayBuffers: {buf: new Float32Array(interleaved).buffer},
            interleavedBuffers: {ib: {buffer: 'buf', stride: 7}},
            attributes: {
                position: {isInterleavedBufferAttribute: true, data: 'ib', offset: 0, itemSize: 3},
                color: {isInterleavedBufferAttribute: true, data: 'ib', offset: 3, itemSize: 4},
            },
        });
        expect(Array.from(parsed.colors!)).toEqual(rgba);

        // A colour attribute of another size is not one.
        const odd = loader['parseBufferGeometry']({
            attributes: {position: {itemSize: 3, array: positions}, color: {itemSize: 2, array: new Array(8).fill(1)}},
        });
        expect(odd.colors).toBeUndefined();
    });

    it('are among the variants the shader check compiles, alone and after a second UV set', () => {
        const meshVariants = shaderVariants().filter((v) => v.program.name === `quarksParticle_${RenderMode.Mesh}`);
        const colored = meshVariants.filter((v) => v.program.defines.includes('MESH_COLOR'));
        expect(colored.some((v) => !v.program.attributes.includes('uv2'))).toBe(true);
        const both = colored.find((v) => v.program.attributes.includes('uv2'))!;
        const attributes = both.program.attributes;
        expect(attributes.indexOf('meshColor')).toBe(attributes.indexOf('uv2') + 1);
    });
});
