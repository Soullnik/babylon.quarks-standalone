import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleEmitter} from '../src/ParticleEmitter';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import {QuarksLoader} from '../src/QuarksLoader';
import particleFragGLSL from '../src/shaders/particle_frag.glsl';
import particleFragWGSL from '../src/shaders/particle_frag.wgsl';
import physicsFragGLSL from '../src/shaders/particle_physics_frag.glsl';
import physicsFragWGSL from '../src/shaders/particle_physics_frag.wgsl';
import trailFragGLSL from '../src/shaders/trail_frag.glsl';
import trailFragWGSL from '../src/shaders/trail_frag.wgsl';
import {normalizeErosion, normalizeUVDistortion, normalizeUVScroll, RenderMode} from '../src/VFXBatch';

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
        for (const define of ['UV_SCROLL', 'GRADIENT_MAP', 'EROSION', 'EROSION_MASK']) {
            expect(defines(mat)).not.toContain(define);
        }
        expect(s.uvScroll).toBeUndefined();
        expect(s.gradientMap).toBeNull();
        expect(s.erosion).toBeUndefined();
    });

    it('normalise their settings', () => {
        expect(normalizeUVScroll([0, 0])).toBeUndefined();
        expect(normalizeUVScroll([0.5, NaN])).toEqual([0.5, 0]);
        expect(normalizeErosion({})).toEqual({
            mask: null,
            softness: 0.05,
            edgeWidth: 0,
            edgeColor: [1, 1, 1],
            maskScroll: [0, 0],
        });
        expect(normalizeErosion({softness: -1, edgeWidth: -2})).toMatchObject({softness: 0.0001, edgeWidth: 0});
        expect(normalizeErosion(undefined)).toBeUndefined();
    });

    it('scroll the map on the renderer clock, wrapped to 0…1', () => {
        const renderer = new BatchedRenderer('scroll', scene);
        const s = system({uvScroll: [0.25, -0.5]});
        renderer.addSystem(s);
        renderer.update(3);
        const mat = materialOf(renderer, s);
        expect(defines(mat)).toContain('UV_SCROLL');
        expect(uniforms(mat)).toContain('uvScrollOffset');
        mat.onBindObservable.notifyObservers(undefined as any);
        const offset = (mat as any)._vectors2.uvScrollOffset;
        expect(offset.x).toBeCloseTo(0.75);
        expect(offset.y).toBeCloseTo(0.5);
    });

    it('compile the gradient map and erosion in, on sprites, meshes and trails', () => {
        const ramp = new Texture(null, scene);
        const mask = new Texture(null, scene);
        const renderer = new BatchedRenderer('fx', scene);
        const settings = {
            gradientMap: ramp,
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
            const params = (mat as any)._vectors4.erosionParams;
            expect([params.x, params.y]).toEqual([0.1, 0.2].map((v) => expect.closeTo(v, 6)));
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
            expect(source).toContain('#ifdef UV_SCROLL');
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
        const a = system({uvScroll: [1, 0], gradientMap: ramp, erosion: {softness: 0.1}});
        const b = system({uvScroll: [1, 0], gradientMap: ramp, erosion: {softness: 0.1}});
        const c = system({uvScroll: [2, 0], gradientMap: ramp, erosion: {softness: 0.1}});
        const d = system({uvScroll: [1, 0], gradientMap: null, erosion: {softness: 0.1}});
        const e = system({uvScroll: [1, 0], gradientMap: ramp, erosion: {softness: 0.2}});
        [a, b, c, d, e].forEach((s) => renderer.addSystem(s));
        const index = (s: ParticleSystem) => renderer.systemToBatchIndex.get(s);
        expect(index(a)).toBe(index(b));
        expect(new Set([a, c, d, e].map(index)).size).toBe(4);
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
        const s = system({
            uvScroll: [0.5, 1],
            gradientMap: ramp,
            erosion: {mask, softness: 0.2, edgeWidth: 0.1, edgeColor: [1, 0, 0], maskScroll: [0, 0.3]},
        });
        const meta = {geometries: {}, materials: {}, textures: {}} as any;
        const json = s.toJSON(meta);
        const material = meta.materials[json.material!];
        expect(material.uvScroll).toEqual([0.5, 1]);
        expect(meta.textures[material.gradientMap]).toBe(ramp);
        expect(meta.textures[material.erosion.mask]).toBe(mask);

        for (const copy of [ParticleSystem.fromJSON(json, meta, {}, scene), s.clone()]) {
            expect(copy.uvScroll).toEqual([0.5, 1]);
            expect(copy.gradientMap).toBe(ramp);
            expect(copy.erosion).toEqual({
                mask,
                softness: 0.2,
                edgeWidth: 0.1,
                edgeColor: [1, 0, 0],
                maskScroll: [0, 0.3],
            });
        }

        const loader = new QuarksLoader(scene);
        const root = loader.parse({
            materials: [{uuid: 'm', type: 'QuarksMaterial', uvScroll: [0, 2], erosion: {edgeWidth: 0.3}}],
            object: {uuid: 'e', type: 'ParticleEmitter', ps: {...system().toJSON(), material: 'm'}},
        });
        const loaded = (root as ParticleEmitter).system as ParticleSystem;
        expect(loaded.uvScroll).toEqual([0, 2]);
        expect(loaded.erosion).toMatchObject({mask: null, edgeWidth: 0.3, softness: 0.05});

        const plain = {geometries: {}, materials: {}, textures: {}} as any;
        const plainMaterial = plain.materials[system().toJSON(plain).material!];
        for (const key of ['uvScroll', 'gradientMap', 'erosion']) {
            expect(key in plainMaterial).toBe(false);
        }
    });

    describe('UV distortion', () => {
        it('needs a map, and fills in defaults', () => {
            const noise = new Texture(null, scene);
            expect(normalizeUVDistortion(undefined)).toBeUndefined();
            expect(normalizeUVDistortion({strength: 0.2})).toBeUndefined();
            expect(normalizeUVDistortion({map: noise})).toEqual({
                map: noise,
                strength: 0.05,
                scale: 1,
                scroll: [0, 0.5],
            });
            expect(normalizeUVDistortion({map: noise, strength: -1})?.strength).toBe(0);
        });

        it('compiles in on sprites, meshes and trails, and scrolls its noise on the renderer clock', () => {
            const noise = new Texture(null, scene);
            const renderer = new BatchedRenderer('distortion', scene);
            const modes = [RenderMode.BillBoard, RenderMode.Mesh, RenderMode.Trail];
            const systems = modes.map((renderMode) =>
                system({renderMode, uvDistortion: {map: noise, strength: 0.1, scale: 2, scroll: [0.25, 0.5]}})
            );
            systems.forEach((s) => renderer.addSystem(s));
            renderer.update(3);
            for (const s of systems) {
                const mat = materialOf(renderer, s);
                expect(defines(mat)).toContain('UV_DISTORTION');
                expect(samplers(mat)).toContain('distortionMap');
                expect(uniforms(mat)).toContain('distortionParams');
                mat.onBindObservable.notifyObservers(undefined as any);
                const params = (mat as any)._vectors4.distortionParams;
                expect([params.x, params.y]).toEqual([0.1, 2]);
                expect(params.z).toBeCloseTo(0.75, 6);
                expect(params.w).toBeCloseTo(0.5, 6);
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
                expect(copy.uvDistortion).toEqual({map: noise, strength: 0.1, scale: 1, scroll: [0, 0.5]});
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
