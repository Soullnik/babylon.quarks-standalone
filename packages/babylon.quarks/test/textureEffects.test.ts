import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleEmitter} from '../src/ParticleEmitter';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import {QuarksLoader} from '../src/QuarksLoader';
import meshVertGLSL from '../src/shaders/local_particle_physics_vert.glsl';
import meshVertWGSL from '../src/shaders/local_particle_physics_vert.wgsl';
import particleFragGLSL from '../src/shaders/particle_frag.glsl';
import particleFragWGSL from '../src/shaders/particle_frag.wgsl';
import physicsFragGLSL from '../src/shaders/particle_physics_frag.glsl';
import physicsFragWGSL from '../src/shaders/particle_physics_frag.wgsl';
import particleVertGLSL from '../src/shaders/particle_vert.glsl';
import particleVertWGSL from '../src/shaders/particle_vert.wgsl';
import stretchedVertGLSL from '../src/shaders/stretched_bb_particle_vert.glsl';
import stretchedVertWGSL from '../src/shaders/stretched_bb_particle_vert.wgsl';
import trailFragGLSL from '../src/shaders/trail_frag.glsl';
import trailFragWGSL from '../src/shaders/trail_frag.wgsl';
import trailVertGLSL from '../src/shaders/trail_vert.glsl';
import trailVertWGSL from '../src/shaders/trail_vert.wgsl';
import {
    normalizeErosion,
    normalizeGradientMap,
    normalizeMapUV,
    normalizeTextureUV,
    normalizeUVDistortion,
    RenderMode,
} from '../src/VFXBatch';

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

function system(overrides: Partial<ParticleSystemParameters> = {}) {
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
        ...overrides,
    });
}

const materialOf = (renderer: BatchedRenderer, s: ParticleSystem) =>
    renderer.batches[renderer.systemToBatchIndex.get(s)!].mesh.material as ShaderMaterial;
const defines = (mat: ShaderMaterial) => (mat as any).options.defines as string[];
const uniforms = (mat: ShaderMaterial) => (mat as any).options.uniforms as string[];
const samplers = (mat: ShaderMaterial) => (mat as any).options.samplers as string[];

describe('texture effects', () => {
    it('are off unless set', () => {
        const renderer = new BatchedRenderer('none', scene);
        const s = system();
        renderer.addSystem(s);
        const mat = materialOf(renderer, s);
        for (const define of ['MAP_TRANSFORM', 'UV1', 'GRADIENT_MAP', 'EROSION', 'EROSION_MASK']) {
            expect(defines(mat)).not.toContain(define);
        }
        expect(s.mapUV).toBeUndefined();
        expect(s.gradientMap).toBeUndefined();
        expect(s.erosion).toBeUndefined();
    });

    it('normalise their settings', () => {
        expect(normalizeMapUV({scroll: [0, 0], tiling: [1, 1]})).toBeUndefined();
        expect(normalizeMapUV({scroll: [0.5, NaN] as [number, number]})).toEqual({
            channel: 0,
            tiling: [1, 1],
            offset: [0, 0],
            scroll: [0.5, 0],
        });
        expect(normalizeErosion({})).toEqual({
            mask: null,
            maskUV: {channel: 0, tiling: [1, 1], offset: [0, 0], scroll: [0, 0]},
            softness: 0.05,
            edgeWidth: 0,
            edgeColor: [1, 1, 1],
        });
        expect(normalizeTextureUV({channel: 1, tiling: [2, NaN] as [number, number]}, {scroll: [0, 1]})).toEqual({
            channel: 1,
            tiling: [2, 1],
            offset: [0, 0],
            scroll: [0, 1],
        });
        expect(normalizeTextureUV({channel: 3 as any}).channel).toBe(0);
        const ramp = new Texture(null, scene);
        expect(normalizeGradientMap({ramp})).toEqual({ramp, channel: 'r'});
        expect(normalizeGradientMap({ramp, channel: 'x' as any})!.channel).toBe('r');
        expect(normalizeGradientMap({channel: 'a'})).toBeUndefined();
        expect(normalizeErosion({softness: -1, edgeWidth: -2})).toMatchObject({softness: 0.0001, edgeWidth: 0});
        expect(normalizeErosion(undefined)).toBeUndefined();
    });

    it('lay the map by its transform, its scroll wrapped over two repeats so a mirrored map never flips', () => {
        const renderer = new BatchedRenderer('scroll', scene);
        const s = system({mapUV: {tiling: [2, 1], offset: [0.25, -3], scroll: [0.6, -0.5]}});
        renderer.addSystem(s);
        renderer.update(3);
        const mat = materialOf(renderer, s);
        expect(defines(mat)).toContain('MAP_TRANSFORM');
        expect(defines(mat)).not.toContain('MAP_UV1');
        expect(uniforms(mat)).toContain('mapTransform');
        mat.onBindObservable.notifyObservers(undefined as any);
        const t = (mat as any)._vectors4.mapTransform;
        expect([t.x, t.y]).toEqual([2, 1]);
        // The scroll's share wraps (1.8, and -1.5 to 0.5); the offset is kept as given.
        expect(t.z).toBeCloseTo(0.25 + 1.8, 6);
        expect(t.w).toBeCloseTo(-3 + 0.5, 6);
    });

    it('compile the gradient map and erosion in, on sprites, meshes and trails', () => {
        const ramp = new Texture(null, scene);
        const mask = new Texture(null, scene);
        const renderer = new BatchedRenderer('fx', scene);
        const settings = {
            gradientMap: {ramp},
            erosion: {mask, softness: 0.1, edgeWidth: 0.2, edgeColor: [2, 1, 0] as [number, number, number]},
        };
        const all = [RenderMode.BillBoard, RenderMode.Mesh, RenderMode.Trail].map((renderMode) =>
            system({renderMode, ...settings})
        );
        all.forEach((s) => renderer.addSystem(s));
        renderer.update(1 / 60);
        for (const s of all) {
            const mat = materialOf(renderer, s);
            expect(defines(mat)).toEqual(expect.arrayContaining(['GRADIENT_MAP', 'EROSION', 'EROSION_MASK']));
            expect(samplers(mat)).toEqual(expect.arrayContaining(['gradientMap', 'erosionMask']));
            expect(uniforms(mat)).toEqual(expect.arrayContaining(['erosionParams', 'erosionEdgeColor']));
            expect((mat as any)._textures.gradientMap).toBe(ramp);
            expect((mat as any)._textures.erosionMask).toBe(mask);
            const params = (mat as any)._vectors2.erosionParams;
            expect([params.x, params.y]).toEqual([0.1, 0.2].map((v) => expect.closeTo(v, 6)));
            const channel = (mat as any)._vectors4.gradientMapChannel;
            expect([channel.x, channel.y, channel.z, channel.w]).toEqual([1, 0, 0, 0]);
            // Channel 0 everywhere: nothing reads the particle's own UV.
            expect(defines(mat)).not.toContain('UV1');
        }
        for (const source of [
            particleFragGLSL,
            particleFragWGSL,
            physicsFragGLSL,
            physicsFragWGSL,
            trailFragGLSL,
            trailFragWGSL,
        ]) {
            expect(source).toContain('#ifdef EROSION');
            expect(source).toContain('#ifdef GRADIENT_MAP');
            expect(source).toContain('defined(MAP_TRANSFORM)');
        }
    });

    it('erode by the map alpha when no mask is given', () => {
        const renderer = new BatchedRenderer('alphaMask', scene);
        const s = system({erosion: {}});
        renderer.addSystem(s);
        expect(defines(materialOf(renderer, s))).toContain('EROSION');
        expect(defines(materialOf(renderer, s))).not.toContain('EROSION_MASK');
    });

    it('batch different effects apart and equal ones together', () => {
        const ramp = new Texture(null, scene);
        const renderer = new BatchedRenderer('batching', scene);
        const a = system({mapUV: {scroll: [1, 0]}, gradientMap: {ramp}, erosion: {softness: 0.1}});
        const b = system({mapUV: {scroll: [1, 0]}, gradientMap: {ramp, channel: 'r'}, erosion: {softness: 0.1}});
        const c = system({mapUV: {scroll: [2, 0]}, gradientMap: {ramp}, erosion: {softness: 0.1}});
        const d = system({mapUV: {scroll: [1, 0]}, erosion: {softness: 0.1}});
        const e = system({mapUV: {scroll: [1, 0]}, gradientMap: {ramp}, erosion: {softness: 0.2}});
        const f = system({mapUV: {scroll: [1, 0]}, gradientMap: {ramp, channel: 'a'}, erosion: {softness: 0.1}});
        const g = system({
            mapUV: {scroll: [1, 0]},
            gradientMap: {ramp},
            erosion: {softness: 0.1, maskUV: {scroll: [0, 1]}},
        });
        [a, b, c, d, e, f, g].forEach((s) => renderer.addSystem(s));
        const index = (s: ParticleSystem) => renderer.systemToBatchIndex.get(s);
        expect(index(a)).toBe(index(b));
        expect(new Set([a, c, d, e, f, g].map(index)).size).toBe(6);
    });

    it('re-batch when assigned at runtime', () => {
        const renderer = new BatchedRenderer('switch', scene);
        const s = system();
        renderer.addSystem(s);
        s.erosion = {edgeWidth: 0.1};
        renderer.update(1 / 60);
        expect(defines(materialOf(renderer, s))).toContain('EROSION');
    });

    it('round-trip through toJSON / fromJSON, clone and the loader', () => {
        const ramp = new Texture(null, scene);
        const mask = new Texture(null, scene);
        const maskUV = {
            channel: 1 as const,
            tiling: [0.125, 1] as [number, number],
            scroll: [0, 0.3] as [number, number],
        };
        const s = system({
            mapUV: {scroll: [0.5, 1]},
            gradientMap: {ramp, channel: 'a'},
            erosion: {mask, maskUV, softness: 0.2, edgeWidth: 0.1, edgeColor: [1, 0, 0]},
        });
        const meta = {geometries: {}, materials: {}, textures: {}} as any;
        const json = s.toJSON(meta);
        const material = meta.materials[json.material!];
        expect(material.mapUV).toEqual({scroll: [0.5, 1]});
        expect(meta.textures[material.gradientMap.ramp]).toBe(ramp);
        expect(material.gradientMap.channel).toBe('a');
        expect(meta.textures[material.erosion.mask]).toBe(mask);
        // Only the fields that differ from the default layout are written.
        expect(material.erosion.maskUV).toEqual(maskUV);

        for (const copy of [ParticleSystem.fromJSON(json, meta, {}, scene), s.clone()]) {
            expect(copy.mapUV).toEqual({channel: 0, tiling: [1, 1], offset: [0, 0], scroll: [0.5, 1]});
            expect(copy.gradientMap).toEqual({ramp, channel: 'a'});
            expect(copy.erosion).toEqual({
                mask,
                maskUV: {...maskUV, offset: [0, 0]},
                softness: 0.2,
                edgeWidth: 0.1,
                edgeColor: [1, 0, 0],
            });
        }

        const loader = new QuarksLoader(scene);
        const root = loader.parse({
            textures: [],
            materials: [
                {
                    uuid: 'm',
                    type: 'QuarksMaterial',
                    mapUV: {scroll: [0, 2]},
                    gradientMap: {ramp: 'missing', channel: 'g'},
                    erosion: {edgeWidth: 0.3, maskUV: {offset: [0.5, 0]}},
                },
            ],
            object: {uuid: 'e', type: 'ParticleEmitter', ps: {...system().toJSON(), material: 'm'}},
        });
        const loaded = (root as ParticleEmitter).system as ParticleSystem;
        expect(loaded.mapUV!.scroll).toEqual([0, 2]);
        expect(loaded.erosion).toMatchObject({mask: null, edgeWidth: 0.3, softness: 0.05});
        expect(loaded.erosion!.maskUV.offset).toEqual([0.5, 0]);
        // A ramp the file does not carry leaves no gradient map.
        expect(loaded.gradientMap).toBeUndefined();

        const plain = {geometries: {}, materials: {}, textures: {}} as any;
        const plainMaterial = plain.materials[system().toJSON(plain).material!];
        for (const key of ['mapUV', 'gradientMap', 'erosion']) {
            expect(key in plainMaterial).toBe(false);
        }
        const still = {geometries: {}, materials: {}, textures: {}} as any;
        const stillMaterial = still.materials[system({erosion: {mask}, gradientMap: {ramp}}).toJSON(still).material!];
        expect('maskUV' in stillMaterial.erosion).toBe(false);
        // The default channel is not written either.
        expect('channel' in stillMaterial.gradientMap).toBe(false);
    });

    it('look the ramp up by the channel asked for, its alpha replacing the map’s for alpha', () => {
        const ramp = new Texture(null, scene);
        const renderer = new BatchedRenderer('channels', scene);
        const weights = (channel: any) => {
            const s = system({gradientMap: {ramp, channel}});
            renderer.addSystem(s);
            const v = (materialOf(renderer, s) as any)._vectors4.gradientMapChannel;
            return [v.x, v.y, v.z, v.w];
        };
        expect(weights('g')).toEqual([0, 1, 0, 0]);
        expect(weights('a')).toEqual([0, 0, 0, 1]);
        expect(weights('luminance')).toEqual([0.2126, 0.7152, 0.0722, 0].map((v) => expect.closeTo(v, 6)));
        for (const source of [particleFragGLSL, physicsFragGLSL, trailFragGLSL]) {
            expect(source).toContain('dot(texColor, gradientMapChannel)');
            expect(source).toContain('mix(texColor.a, 1.0, gradientMapChannel.a)');
        }
        for (const source of [particleFragWGSL, physicsFragWGSL, trailFragWGSL]) {
            expect(source).toContain('dot(texColor, uniforms.gradientMapChannel)');
        }
    });

    it('lay the mask by its own transform, its scroll wrapped into the offset', () => {
        const mask = new Texture(null, scene);
        const renderer = new BatchedRenderer('maskUV', scene);
        const s = system({erosion: {mask, maskUV: {tiling: [0.125, 2], offset: [0.25, 0], scroll: [0.5, 0.75]}}});
        renderer.addSystem(s);
        renderer.update(3);
        const mat = materialOf(renderer, s);
        expect(uniforms(mat)).toContain('erosionMaskTransform');
        mat.onBindObservable.notifyObservers(undefined as any);
        const t = (mat as any)._vectors4.erosionMaskTransform;
        expect([t.x, t.y]).toEqual([0.125, 2]);
        // 0.25 + 0.5 × 3 = 1.75; 0.75 × 3 = 2.25, over two repeats 0.25.
        expect(t.z).toBeCloseTo(1.75, 6);
        expect(t.w).toBeCloseTo(0.25, 6);
        expect(defines(mat)).not.toContain('EROSION_MASK_UV1');
    });

    describe('UV channel 1', () => {
        const mask = () => new Texture(null, scene);
        const quad = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
        const quadUVs = new Float32Array([0, 0, 4, 0, 4, 1, 0, 1]);
        const quadUVs2 = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);

        it('reads a mesh’s second UV set, batching by it', () => {
            const renderer = new BatchedRenderer('meshUV2', scene);
            const erosion = {mask: mask(), maskUV: {channel: 1 as const}};
            const geometry = {instancingGeometry: quad, instancingUVs: quadUVs, renderMode: RenderMode.Mesh};
            const withUV2 = system({...geometry, instancingUVs2: quadUVs2, erosion});
            const without = system({...geometry, erosion});
            [withUV2, without].forEach((s) => renderer.addSystem(s));
            expect(renderer.systemToBatchIndex.get(withUV2)).not.toBe(renderer.systemToBatchIndex.get(without));
            const mat = materialOf(renderer, withUV2);
            expect(defines(mat)).toEqual(expect.arrayContaining(['UV1', 'EROSION_MASK_UV1', 'MESH_UV2']));
            expect((mat as any).options.attributes).toContain('uv2');
            const batch = renderer.batches[renderer.systemToBatchIndex.get(withUV2)!];
            expect(Array.from(batch.mesh.getVerticesData('uv2')!)).toEqual(Array.from(quadUVs2));
            // Without a second set, channel 1 reads the first.
            const plain = materialOf(renderer, without);
            expect(defines(plain)).toContain('UV1');
            expect(defines(plain)).not.toContain('MESH_UV2');
            expect((plain as any).options.attributes).not.toContain('uv2');
        });

        it('takes the whole quad on billboards and beams, along and across on trails', () => {
            const renderer = new BatchedRenderer('uv1', scene);
            const noise = mask();
            const sprites = system({uTileCount: 4, uvDistortion: {map: noise, mapUV: {channel: 1}}});
            const trail = system({
                renderMode: RenderMode.Trail,
                rendererEmitterSettings: {startLength: new ConstantValue(4), followLocalOrigin: false},
                erosion: {mask: noise, maskUV: {channel: 1}},
            });
            [sprites, trail].forEach((s) => renderer.addSystem(s));
            renderer.update(0.1);
            renderer.update(0.1);
            expect(defines(materialOf(renderer, sprites))).toEqual(
                expect.arrayContaining(['UV1', 'UV_DISTORTION_UV1'])
            );
            const trailMat = materialOf(renderer, trail);
            expect(defines(trailMat)).toEqual(expect.arrayContaining(['UV1', 'EROSION_MASK_UV1']));
            expect((trailMat as any).options.attributes).toContain('uv2');
            const uv1 = (renderer.batches[renderer.systemToBatchIndex.get(trail)!] as any).uv1Buffer as Float32Array;
            // Each pair: one vertex at V 0, its partner at V 1, both at the same U in 0…1.
            expect([uv1[1], uv1[3]]).toEqual([0, 1]);
            expect(uv1[0]).toBe(uv1[2]);
            expect(uv1[0]).toBeGreaterThanOrEqual(0);
            expect(uv1[0]).toBeLessThanOrEqual(1);
        });

        it('declares the varying in every shader, and saves the second UV set with the geometry', () => {
            for (const source of [particleFragGLSL, physicsFragGLSL, trailFragGLSL]) {
                expect(source).toContain('varying vec2 vUV1;');
            }
            for (const source of [particleFragWGSL, physicsFragWGSL, trailFragWGSL]) {
                expect(source).toContain('varying vUV1: vec2f;');
            }
            const s = system({renderMode: RenderMode.Mesh, instancingGeometry: quad, instancingUVs2: quadUVs2});
            const meta = {geometries: {}, materials: {}, textures: {}} as any;
            const json = s.toJSON(meta);
            expect(meta.geometries[json.instancingGeometry as string].uvs2).toEqual(Array.from(quadUVs2));
            const copy = ParticleSystem.fromJSON(json, meta, {}, scene);
            expect(Array.from((copy as any).rendererSettings.instancingUVs2)).toEqual(Array.from(quadUVs2));
            expect((s.clone() as any).rendererSettings.instancingUVs2).toBe(quadUVs2);
            const plain = {geometries: {}, materials: {}, textures: {}} as any;
            const plainJSON = system({renderMode: RenderMode.Mesh, instancingGeometry: quad}).toJSON(plain);
            expect('uvs2' in plain.geometries[plainJSON.instancingGeometry as string]).toBe(false);
        });

        it('loads a three.js second UV set, named uv1 or uv2, plain or interleaved', () => {
            const loader = new QuarksLoader(scene) as any;
            const positions = Array.from(quad);
            const uv2 = Array.from(quadUVs2);
            for (const name of ['uv1', 'uv2']) {
                const plain = loader.parseBufferGeometry({
                    attributes: {position: {itemSize: 3, array: positions}, [name]: {itemSize: 2, array: uv2}},
                });
                expect(Array.from(plain.uvs2)).toEqual(uv2);
            }
            // One buffer of (x, y, z, u2, v2) per vertex.
            const interleaved: number[] = [];
            for (let i = 0; i < 4; i++)
                interleaved.push(...positions.slice(i * 3, i * 3 + 3), ...uv2.slice(i * 2, i * 2 + 2));
            const parsed = loader.parseBufferGeometry({
                arrayBuffers: {buf: new Float32Array(interleaved).buffer},
                interleavedBuffers: {ib: {buffer: 'buf', stride: 5}},
                attributes: {
                    position: {isInterleavedBufferAttribute: true, data: 'ib', offset: 0, itemSize: 3},
                    uv1: {isInterleavedBufferAttribute: true, data: 'ib', offset: 3, itemSize: 2},
                },
            });
            expect(Array.from(parsed.positions)).toEqual(positions);
            expect(Array.from(parsed.uvs2)).toEqual(uv2);
        });

        it('passes the varying from every vertex shader, the stretched ones from their mirrored quad', () => {
            for (const source of [particleVertGLSL, meshVertGLSL, stretchedVertGLSL, trailVertGLSL]) {
                expect(source).toContain('varying vec2 vUV1;');
                expect(source).toMatch(/vUV1 = \w+;/);
            }
            for (const source of [particleVertWGSL, meshVertWGSL, stretchedVertWGSL, trailVertWGSL]) {
                expect(source).toContain('varying vUV1: vec2f;');
                expect(source).toMatch(/vertexOutputs\.vUV1 = [\w.]+;/);
            }
            expect(stretchedVertGLSL).toContain('vec2 quadUV =');
            expect(stretchedVertWGSL).toContain('let quadUV =');
            expect(stretchedVertGLSL).toContain('vUV1 = quadUV;');
            expect(stretchedVertWGSL).toContain('vertexOutputs.vUV1 = quadUV;');
        });

        it('lays the map on channel 1, where the sheet never moves it', () => {
            const renderer = new BatchedRenderer('mapUV1', scene);
            const s = system({uTileCount: 4, mapUV: {channel: 1, scroll: [0.5, 0]}});
            renderer.addSystem(s);
            expect(defines(materialOf(renderer, s))).toEqual(
                expect.arrayContaining(['UV1', 'MAP_TRANSFORM', 'MAP_UV1'])
            );
            expect(normalizeMapUV({channel: 1})).toEqual({channel: 1, tiling: [1, 1], offset: [0, 0], scroll: [0, 0]});
        });

        it('keeps an offset outside 0…1 as given', () => {
            expect(normalizeTextureUV({offset: [2.5, -7]}).offset).toEqual([2.5, -7]);
            const renderer = new BatchedRenderer('offset', scene);
            const s = system({mapUV: {offset: [2.5, -7]}});
            renderer.addSystem(s);
            const mat = materialOf(renderer, s);
            mat.onBindObservable.notifyObservers(undefined as any);
            const t = (mat as any)._vectors4.mapTransform;
            expect([t.z, t.w]).toEqual([2.5, -7]);
        });

        it('ignores the second UV set in batching when nothing reads channel 1', () => {
            const renderer = new BatchedRenderer('uv2Key', scene);
            const geometry = {instancingGeometry: quad, instancingUVs: quadUVs, renderMode: RenderMode.Mesh};
            const a = system({...geometry, instancingUVs2: quadUVs2});
            const b = system({...geometry, instancingUVs2: new Float32Array(quadUVs2)});
            const c = system({...geometry});
            [a, b, c].forEach((s) => renderer.addSystem(s));
            expect(renderer.systemToBatchIndex.get(a)).toBe(renderer.systemToBatchIndex.get(b));
            expect(renderer.systemToBatchIndex.get(a)).toBe(renderer.systemToBatchIndex.get(c));
            expect(defines(materialOf(renderer, a))).not.toContain('MESH_UV2');
        });

        it('warns once and reads the first set when the second has the wrong length', () => {
            const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                for (const uvs2 of [new Float32Array(6), new Float32Array(10)]) {
                    warn.mockClear();
                    const renderer = new BatchedRenderer('uv2Length', scene);
                    const s = system({
                        renderMode: RenderMode.Mesh,
                        instancingGeometry: quad,
                        instancingUVs2: uvs2,
                        erosion: {mask: mask(), maskUV: {channel: 1}},
                    });
                    renderer.addSystem(s);
                    const mat = materialOf(renderer, s);
                    expect(defines(mat)).toContain('UV1');
                    expect(defines(mat)).not.toContain('MESH_UV2');
                    expect((mat as any).options.attributes).not.toContain('uv2');
                    (renderer.batches[renderer.systemToBatchIndex.get(s)!] as any).rebuildMaterial();
                    expect(warn).toHaveBeenCalledTimes(1);
                }
            } finally {
                warn.mockRestore();
            }
        });

        it('drops UV sets that no longer fit a new geometry, and keeps ones that do', () => {
            const s = system({
                renderMode: RenderMode.Mesh,
                instancingGeometry: quad,
                instancingUVs: quadUVs,
                instancingUVs2: quadUVs2,
            });
            expect(s.instancingUVs).toBe(quadUVs);
            expect(s.instancingUVs2).toBe(quadUVs2);
            s.instancingGeometry = new Float32Array(quad);
            expect(s.instancingUVs).toBe(quadUVs);
            expect(s.instancingUVs2).toBe(quadUVs2);
            const triangle = new Float32Array(9);
            s.instancingGeometry = triangle;
            expect(s.instancingUVs).toHaveLength(6);
            expect(Array.from(s.instancingUVs)).toEqual([0, 0, 0, 0, 0, 0]);
            expect(s.instancingUVs).toBe(s.instancingUVs);
            expect(s.instancingUVs2).toBeUndefined();
        });

        it('batches meshes by their normals and trails regardless of the instanced UVs', () => {
            const renderer = new BatchedRenderer('normalsKey', scene);
            const mesh = {renderMode: RenderMode.Mesh, instancingGeometry: quad, instancingUVs: quadUVs};
            const a = system({...mesh});
            const b = system({...mesh});
            const lit = system({...mesh, instancingNormals: new Float32Array(12).fill(1)});
            const trailSettings = {startLength: new ConstantValue(4), followLocalOrigin: false};
            const t1 = system({renderMode: RenderMode.Trail, rendererEmitterSettings: trailSettings});
            const t2 = system({renderMode: RenderMode.Trail, rendererEmitterSettings: trailSettings});
            t2.instancingUVs = new Float32Array(8);
            [a, b, lit, t1, t2].forEach((s) => renderer.addSystem(s));
            const batch = (s: ParticleSystem) => renderer.systemToBatchIndex.get(s);
            expect(batch(a)).toBe(batch(b));
            expect(batch(lit)).not.toBe(batch(a));
            expect(batch(t1)).toBe(batch(t2));
        });

        it('moves fallback UVs and normals to a new geometry of the same size', () => {
            const s = system({renderMode: RenderMode.Mesh, instancingGeometry: quad});
            const other = new Float32Array(quad);
            s.instancingGeometry = other;
            const fresh = system({renderMode: RenderMode.Mesh, instancingGeometry: other});
            expect(s.instancingUVs).toBe(fresh.instancingUVs);
            expect((s as any).rendererSettings.instancingNormals).toBe(
                (fresh as any).rendererSettings.instancingNormals
            );
            const renderer = new BatchedRenderer('sameSize', scene);
            [s, fresh].forEach((x) => renderer.addSystem(x));
            expect(renderer.systemToBatchIndex.get(s)).toBe(renderer.systemToBatchIndex.get(fresh));
        });

        it('keeps the trail’s channel 1 when the trail grows, running it from the head under uvFromHead', () => {
            const renderer = new BatchedRenderer('trailGrow', scene);
            const trail = system({
                renderMode: RenderMode.Trail,
                rendererEmitterSettings: {startLength: new ConstantValue(4), followLocalOrigin: false},
                erosion: {mask: mask(), maskUV: {channel: 1}},
            });
            renderer.addSystem(trail);
            const batch = renderer.batches[renderer.systemToBatchIndex.get(trail)!] as any;
            const before = batch.maxParticles;
            batch.expandBuffers(before * 3);
            expect(batch.uv1Buffer).toBeInstanceOf(Float32Array);
            expect(batch.uv1Buffer.length).toBe(batch.maxParticles * 2);
            expect(batch.mesh.getVerticesData('uv2')).toBeTruthy();

            const along = (uvFromHead: boolean) => {
                const r = new BatchedRenderer('trailHead' + uvFromHead, scene);
                const s = system({
                    renderMode: RenderMode.Trail,
                    rendererEmitterSettings: {startLength: new ConstantValue(4), followLocalOrigin: false, uvFromHead},
                    erosion: {mask: mask(), maskUV: {channel: 1}},
                });
                r.addSystem(s);
                r.update(0.1);
                r.update(0.1);
                return (r.batches[r.systemToBatchIndex.get(s)!] as any).uv1Buffer[0] as number;
            };
            expect(along(true)).toBeCloseTo(1 - along(false), 6);
        });
    });

    it('multiply each system by its tint as drawn, leaving its particles and its batch alone', () => {
        const renderer = new BatchedRenderer('tint', scene);
        const startColor = new ConstantColor(new Vector4(1, 0.5, 0.25, 1));
        const tinted = system({startColor, emissionOverTime: new ConstantValue(0)});
        const plain = system({startColor, emissionOverTime: new ConstantValue(0)});
        tinted.tint = new Vector4(0.5, 1, 1, 0.25);
        for (const s of [tinted, plain]) {
            s.emissionBursts = [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}];
            renderer.addSystem(s);
        }
        renderer.update(1 / 60);
        expect(renderer.systemToBatchIndex.get(tinted)).toBe(renderer.systemToBatchIndex.get(plain));
        const batch = renderer.batches[renderer.systemToBatchIndex.get(tinted)!] as any;
        const colors = Array.from(batch.colorBuffer.subarray(0, 8) as Float32Array).map(
            (v) => Math.round(v * 1e4) / 1e4
        );
        // One particle each, in whichever order the batch draws them.
        expect([colors.slice(0, 4), colors.slice(4, 8)]).toEqual(
            expect.arrayContaining([
                [0.5, 0.5, 0.25, 0.25],
                [1, 0.5, 0.25, 1],
            ])
        );
        const particle = tinted.particles[0];
        expect([particle.color.x, particle.color.w]).toEqual([1, 1]);
        const copy = tinted.clone();
        expect(copy.tint).toEqual(tinted.tint);
        expect(copy.tint).not.toBe(tinted.tint);
        expect(plain.clone().tint).toBeUndefined();
    });

    describe('UV distortion', () => {
        it('needs a map, and fills in defaults', () => {
            const noise = new Texture(null, scene);
            expect(normalizeUVDistortion(undefined)).toBeUndefined();
            expect(normalizeUVDistortion({strength: 0.2})).toBeUndefined();
            expect(normalizeUVDistortion({map: noise})).toEqual({
                map: noise,
                mapUV: {channel: 0, tiling: [1, 1], offset: [0, 0], scroll: [0, 0.5]},
                strength: 0.05,
            });
            expect(normalizeUVDistortion({map: noise, strength: -1})?.strength).toBe(0);
        });

        it('compiles in on sprites, meshes and trails, and scrolls its noise on the renderer clock', () => {
            const noise = new Texture(null, scene);
            const renderer = new BatchedRenderer('distortion', scene);
            const modes = [RenderMode.BillBoard, RenderMode.Mesh, RenderMode.Trail];
            const systems = modes.map((renderMode) =>
                system({
                    renderMode,
                    uvDistortion: {map: noise, strength: 0.1, mapUV: {tiling: [2, 2], scroll: [0.25, 0.5]}},
                })
            );
            systems.forEach((s) => renderer.addSystem(s));
            renderer.update(3);
            for (const s of systems) {
                const mat = materialOf(renderer, s);
                expect(defines(mat)).toContain('UV_DISTORTION');
                expect(samplers(mat)).toContain('distortionMap');
                expect(uniforms(mat)).toEqual(expect.arrayContaining(['distortionTransform', 'distortionStrength']));
                mat.onBindObservable.notifyObservers(undefined as any);
                expect((mat as any)._floats.distortionStrength).toBeCloseTo(0.1, 6);
                const t = (mat as any)._vectors4.distortionTransform;
                expect([t.x, t.y]).toEqual([2, 2]);
                expect(t.z).toBeCloseTo(0.75, 6);
                expect(t.w).toBeCloseTo(1.5, 6);
            }
            for (const source of [
                particleFragGLSL,
                particleFragWGSL,
                physicsFragGLSL,
                physicsFragWGSL,
                trailFragGLSL,
                trailFragWGSL,
            ]) {
                expect(source).toContain('#ifdef UV_DISTORTION');
            }
        });

        it('batches different distortions apart, and round-trips through JSON, clone and the loader', () => {
            const noise = new Texture(null, scene);
            const renderer = new BatchedRenderer('distortionBatch', scene);
            const a = system({uvDistortion: {map: noise, strength: 0.1}});
            const b = system({uvDistortion: {map: noise, strength: 0.1}});
            const c = system({uvDistortion: {map: noise, strength: 0.2}});
            const none = system();
            [a, b, c, none].forEach((s) => renderer.addSystem(s));
            const index = (s: ParticleSystem) => renderer.systemToBatchIndex.get(s);
            expect(index(a)).toBe(index(b));
            expect(new Set([a, c, none].map(index)).size).toBe(3);

            const meta = {geometries: {}, materials: {}, textures: {}} as any;
            const json = a.toJSON(meta);
            const material = meta.materials[json.material!];
            expect(meta.textures[material.uvDistortion.map]).toBe(noise);
            for (const copy of [ParticleSystem.fromJSON(json, meta, {}, scene), a.clone()]) {
                expect(copy.uvDistortion).toEqual({
                    map: noise,
                    mapUV: {channel: 0, tiling: [1, 1], offset: [0, 0], scroll: [0, 0.5]},
                    strength: 0.1,
                });
            }
            {
                const plainJSON = meta.materials[a.toJSON(meta).material!].uvDistortion;
                expect('mapUV' in plainJSON).toBe(false);
            }
            const loader = new QuarksLoader(scene);
            const root = loader.parse({
                textures: [],
                materials: [{uuid: 'm', type: 'QuarksMaterial', uvDistortion: {map: 'missing', strength: 0.3}}],
                object: {uuid: 'e', type: 'ParticleEmitter', ps: {...system().toJSON(), material: 'm'}},
            });
            // A map the file does not carry leaves no distortion.
            expect(((root as ParticleEmitter).system as ParticleSystem).uvDistortion).toBeUndefined();
            const plain = {geometries: {}, materials: {}, textures: {}} as any;
            expect('uvDistortion' in plain.materials[none.toJSON(plain).material!]).toBe(false);
        });
    });
});
