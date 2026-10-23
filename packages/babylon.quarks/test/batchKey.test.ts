import {Constants} from '@babylonjs/core/Engines/constants';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {RawTexture} from '@babylonjs/core/Materials/Textures/rawTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Scene} from '@babylonjs/core/scene';
import {ConstantValue, PointEmitter, Vector3} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import {BabylonMetaData} from '../src/system/types';
import {RenderMode} from '../src/VFXBatch';

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
        emissionOverTime: new ConstantValue(10),
        shape: new PointEmitter(),
        renderMode: RenderMode.BillBoard,
        ...parameters,
    });
}

const cube = new Float32Array(24 * 3);
const cubeIndices = new Uint32Array(36);
const otherIndices = new Uint32Array(36);
const normals = new Float32Array(24 * 3);
const otherNormals = new Float32Array(24 * 3);

function batchOf(renderer: BatchedRenderer, s: ParticleSystem) {
    return renderer.batches[renderer.systemToBatchIndex.get(s)!];
}

function materialOf(renderer: BatchedRenderer, s: ParticleSystem): ShaderMaterial {
    return batchOf(renderer, s).mesh.material as ShaderMaterial;
}

/** The uniform values a ShaderMaterial holds for its next bind. */
interface UniformStore {
    _floats: Record<string, number>;
    _vectors2: Record<string, {x: number; y: number}>;
    _vectors3: Record<string, {x: number; y: number; z: number}>;
    _vectors4: Record<string, {x: number; y: number; z: number; w: number}>;
    _options: {defines: string[]};
}

function uniforms(material: ShaderMaterial): UniformStore {
    return material as unknown as UniformStore;
}

/** Runs a frame, which takes the systems' changed settings to the renderer. */
function frame(renderer: BatchedRenderer): void {
    renderer.update(1 / 60);
}

describe('batch key: only the settings a render mode reads count', () => {
    it('billboards share a batch whatever their mesh-only settings say', () => {
        const renderer = new BatchedRenderer('key-billboard', scene);
        const a = system();
        const b = system({lighting: 'unlit', rim: {color: [1, 0, 0]}, instancingNormals: otherNormals});
        renderer.addSystem(a);
        renderer.addSystem(b);
        expect(renderer.batches).toHaveLength(1);
        renderer.dispose();
    });

    it('meshes share a batch whatever their billboard-only pivot and size limits say', () => {
        const renderer = new BatchedRenderer('key-mesh', scene);
        const a = system({renderMode: RenderMode.Mesh, instancingGeometry: cube, instancingIndices: cubeIndices});
        const b = system({
            renderMode: RenderMode.Mesh,
            instancingGeometry: cube,
            instancingIndices: cubeIndices,
            pivot: new Vector3(0.5, 0, 0),
            minParticleSize: 0.1,
            maxParticleSize: 0.5,
        });
        renderer.addSystem(a);
        renderer.addSystem(b);
        expect(renderer.batches).toHaveLength(1);

        const c = system({pivot: new Vector3(0.5, 0, 0)});
        const d = system({minParticleSize: 0.1});
        renderer.addSystem(system());
        renderer.addSystem(c);
        renderer.addSystem(d);
        expect(renderer.batches).toHaveLength(4);
        renderer.dispose();
    });

    it('meshes that share positions but not indices or normals draw apart', () => {
        const renderer = new BatchedRenderer('key-indices', scene);
        const a = system({renderMode: RenderMode.Mesh, instancingGeometry: cube, instancingIndices: cubeIndices});
        const b = system({renderMode: RenderMode.Mesh, instancingGeometry: cube, instancingIndices: otherIndices});
        const c = system({
            renderMode: RenderMode.Mesh,
            instancingGeometry: cube,
            instancingIndices: cubeIndices,
            instancingNormals: normals,
        });
        renderer.addSystem(a);
        renderer.addSystem(b);
        renderer.addSystem(c);
        expect(renderer.batches).toHaveLength(3);
        expect(batchOf(renderer, b).mesh.getTotalIndices()).toBe(36);

        // Assigning the other list moves the system to that batch.
        b.instancingIndices = cubeIndices;
        expect(b.instancingIndices).toBe(cubeIndices);
        expect(b.clone().instancingIndices).toBe(cubeIndices);
        frame(renderer);
        expect(batchOf(renderer, a)).toBe(batchOf(renderer, b));
        renderer.dispose();
    });

    it('the second UV set counts on meshes only while a texture reads channel 1', () => {
        const renderer = new BatchedRenderer('key-uv2', scene);
        const uvs2 = new Float32Array(24 * 2);
        const otherUvs2 = new Float32Array(24 * 2);
        const mesh = (parameters: Partial<ParticleSystemParameters>) =>
            system({
                renderMode: RenderMode.Mesh,
                instancingGeometry: cube,
                instancingIndices: cubeIndices,
                ...parameters,
            });
        const a = mesh({instancingUVs2: uvs2});
        const b = mesh({instancingUVs2: otherUvs2});
        const c = mesh({instancingUVs2: uvs2, mapUV: {channel: 1, tiling: [2, 2]}});
        const d = mesh({instancingUVs2: otherUvs2, mapUV: {channel: 1, tiling: [2, 2]}});
        [a, b, c, d].forEach((s) => renderer.addSystem(s));
        expect(batchOf(renderer, a)).toBe(batchOf(renderer, b));
        expect(batchOf(renderer, c)).not.toBe(batchOf(renderer, a));
        expect(batchOf(renderer, c)).not.toBe(batchOf(renderer, d));
        renderer.dispose();
    });

    it('stretched billboards and beams ignore mesh-only settings, and beams the pivot and size limits', () => {
        const renderer = new BatchedRenderer('key-stretched', scene);
        const a = system({renderMode: RenderMode.StretchedBillBoard});
        const b = system({renderMode: RenderMode.StretchedBillBoard, lighting: 'scene', rim: {}});
        const c = system({renderMode: RenderMode.Beam});
        const d = system({renderMode: RenderMode.Beam, pivot: new Vector3(1, 0, 0), maxParticleSize: 0.2, rim: {}});
        const e = system({renderMode: RenderMode.StretchedBillBoard, pivot: new Vector3(1, 0, 0)});
        [a, b, c, d, e].forEach((s) => renderer.addSystem(s));
        expect(batchOf(renderer, a)).toBe(batchOf(renderer, b));
        expect(batchOf(renderer, c)).toBe(batchOf(renderer, d));
        expect(renderer.batches).toHaveLength(3);
        renderer.dispose();
    });

    it('soft fade distances only count while soft particles are on', () => {
        const renderer = new BatchedRenderer('key-soft', scene);
        const a = system({softNearFade: 0.1, softFarFade: 1});
        const b = system({softNearFade: 0.5, softFarFade: 2});
        renderer.addSystem(a);
        renderer.addSystem(b);
        expect(renderer.batches).toHaveLength(1);
        a.softParticles = true;
        b.softParticles = true;
        frame(renderer);
        expect(batchOf(renderer, a)).not.toBe(batchOf(renderer, b));
        renderer.dispose();
    });

    it('the blend mode only counts while the particles are transparent', () => {
        const renderer = new BatchedRenderer('key-blend', scene);
        const a = system({transparent: false, blendMode: Constants.ALPHA_ADD});
        const b = system({transparent: false, blendMode: Constants.ALPHA_COMBINE});
        renderer.addSystem(a);
        renderer.addSystem(b);
        expect(renderer.batches).toHaveLength(1);
        expect(batchOf(renderer, a).settings.materialBlendMode).toBe(Constants.ALPHA_DISABLE);
        expect(materialOf(renderer, a).alphaMode).toBe(Constants.ALPHA_DISABLE);
        a.transparent = true;
        b.transparent = true;
        frame(renderer);
        expect(batchOf(renderer, a)).not.toBe(batchOf(renderer, b));
        // The system keeps its own blend mode through the opaque spell.
        expect(b.blending).toBe(Constants.ALPHA_COMBINE);
        expect(materialOf(renderer, b).alphaMode).toBe(Constants.ALPHA_COMBINE);
        renderer.dispose();
    });

    it('trails ignore the instanced geometry and flipbook blending', () => {
        const renderer = new BatchedRenderer('key-trail', scene);
        const a = system({renderMode: RenderMode.Trail});
        const b = system({renderMode: RenderMode.Trail, instancingGeometry: cube, blendTiles: true});
        renderer.addSystem(a);
        renderer.addSystem(b);
        expect(renderer.batches).toHaveLength(1);
        renderer.dispose();
    });
});

describe('live parameters: uniform values change in place', () => {
    it('an erosion edge on a system alone in its batch keeps the batch and material', () => {
        const renderer = new BatchedRenderer('live-erosion', scene);
        const s = system({erosion: {softness: 0.1, edgeWidth: 0.2, edgeColor: [1, 0, 0]}});
        renderer.addSystem(s);
        const batch = batchOf(renderer, s);
        const material = materialOf(renderer, s);
        s.erosion = {softness: 0.3, edgeWidth: 0.4, edgeColor: [0, 1, 0]};
        frame(renderer);
        expect(renderer.batches).toHaveLength(1);
        expect(batchOf(renderer, s)).toBe(batch);
        expect(materialOf(renderer, s)).toBe(material);
        const params = uniforms(material)._vectors2.erosionParams;
        expect([params.x, params.y]).toEqual([0.3, 0.4]);
        const color = uniforms(material)._vectors3.erosionEdgeColor;
        expect([color.x, color.y, color.z]).toEqual([0, 1, 0]);
        expect(batch.settings.erosion?.edgeWidth).toBe(0.4);
        renderer.dispose();
    });

    it('a texture layout is read on the next bind', () => {
        const renderer = new BatchedRenderer('live-layout', scene);
        const s = system({mapUV: {tiling: [2, 2]}});
        renderer.addSystem(s);
        const material = materialOf(renderer, s);
        s.mapUV = {tiling: [3, 2], offset: [0.5, 0]};
        frame(renderer);
        expect(materialOf(renderer, s)).toBe(material);
        material.onBindObservable.notifyObservers(batchOf(renderer, s).mesh);
        const t = uniforms(material)._vectors4.mapTransform;
        expect([t.x, t.y, t.z, t.w]).toEqual([3, 2, 0.5, 0]);
        renderer.dispose();
    });

    it('distortion strength and the gradient channel are written in place', () => {
        const noise = new Texture(null, scene);
        const ramp = new Texture(null, scene);
        const renderer = new BatchedRenderer('live-surface', scene);
        const s = system({uvDistortion: {map: noise, strength: 0.05}, gradientMap: {ramp, channel: 'r'}});
        renderer.addSystem(s);
        const material = materialOf(renderer, s);
        s.uvDistortion = {map: noise, strength: 0.2};
        s.gradientMap = {ramp, channel: 'a'};
        frame(renderer);
        expect(materialOf(renderer, s)).toBe(material);
        expect(uniforms(material)._floats.distortionStrength).toBeCloseTo(0.2, 6);
        const channel = uniforms(material)._vectors4.gradientMapChannel;
        expect([channel.x, channel.y, channel.z, channel.w]).toEqual([0, 0, 0, 1]);
        renderer.dispose();
    });

    it('soft fade distances are written in place while the depth texture stays', () => {
        const renderer = new BatchedRenderer('live-soft', scene);
        renderer.setDepthTexture(RawTexture.CreateLuminanceTexture(new Uint8Array([200]), 1, 1, scene));
        const s = system({softParticles: true, softNearFade: 0.1, softFarFade: 1.1});
        renderer.addSystem(s);
        const material = materialOf(renderer, s);
        s.softNearFade = 0.5;
        s.softFarFade = 2.5;
        frame(renderer);
        expect(materialOf(renderer, s)).toBe(material);
        const params = uniforms(material)._vectors2.softParams;
        expect(params.x).toBe(0.5);
        expect(params.y).toBeCloseTo(1 / 2, 6);
        renderer.dispose();
    });

    it('a rim colour on a mesh is written in place', () => {
        const renderer = new BatchedRenderer('live-rim', scene);
        const s = system({
            renderMode: RenderMode.Mesh,
            instancingGeometry: cube,
            instancingIndices: cubeIndices,
            rim: {color: [1, 0, 0], power: 2, strength: 1},
        });
        renderer.addSystem(s);
        const material = materialOf(renderer, s);
        s.rim = {color: [0, 0, 1], power: 4, strength: 0.5};
        frame(renderer);
        expect(materialOf(renderer, s)).toBe(material);
        const color = uniforms(material)._vectors3.rimColor;
        expect([color.x, color.y, color.z]).toEqual([0, 0, 1]);
        const params = uniforms(material)._vectors2.rimParams;
        expect([params.x, params.y]).toEqual([4, 0.5]);
        // A different rim mode is a different shader.
        s.rim = {color: [0, 0, 1], mode: 'mix'};
        frame(renderer);
        expect(materialOf(renderer, s)).not.toBe(material);
        renderer.dispose();
    });

    it('a pivot, size limits and an alpha cutoff are written in place, and switching one on or off rebuilds', () => {
        const renderer = new BatchedRenderer('live-quad', scene);
        const s = system({pivot: new Vector3(0.5, 0, 0), minParticleSize: 0.1, alphaTest: 0.3});
        renderer.addSystem(s);
        const material = materialOf(renderer, s);
        s.pivot = new Vector3(0, 0.25, 0);
        s.minParticleSize = 0.2;
        s.maxParticleSize = 0.9;
        s.alphaTest = 0.6;
        frame(renderer);
        expect(materialOf(renderer, s)).toBe(material);
        const pivot = uniforms(material)._vectors3.pivot;
        expect([pivot.x, pivot.y, pivot.z]).toEqual([0, 0.25, 0]);
        const limits = uniforms(material)._vectors2.sizeLimits;
        expect([limits.x, limits.y]).toEqual([0.2, 0.9]);
        expect(uniforms(material)._floats.alphaTest).toBe(0.6);

        s.alphaTest = 0;
        frame(renderer);
        const rebuilt = materialOf(renderer, s);
        expect(rebuilt).not.toBe(material);
        expect(uniforms(rebuilt)._options.defines).not.toContain('USE_ALPHATEST');

        s.pivot = undefined;
        frame(renderer);
        expect(materialOf(renderer, s)).not.toBe(rebuilt);
        expect(uniforms(materialOf(renderer, s))._options.defines).not.toContain('PIVOT');
        renderer.dispose();
    });

    it('a system that shares its batch moves out, and the others keep theirs', () => {
        const renderer = new BatchedRenderer('live-shared', scene);
        const a = system({erosion: {softness: 0.1}});
        const b = system({erosion: {softness: 0.1}});
        renderer.addSystem(a);
        renderer.addSystem(b);
        const batch = batchOf(renderer, a);
        const material = materialOf(renderer, a);
        b.erosion = {softness: 0.5};
        frame(renderer);
        expect(batchOf(renderer, a)).toBe(batch);
        expect(materialOf(renderer, a)).toBe(material);
        expect(batchOf(renderer, b)).not.toBe(batch);
        expect(uniforms(materialOf(renderer, a))._vectors2.erosionParams.x).toBe(0.1);
        expect(uniforms(materialOf(renderer, b))._vectors2.erosionParams.x).toBe(0.5);
        renderer.dispose();
    });

    it('a system whose values move away and back rejoins its old batch', () => {
        const renderer = new BatchedRenderer('live-back', scene);
        const a = system({erosion: {softness: 0.1}});
        const b = system({erosion: {softness: 0.1}});
        renderer.addSystem(a);
        renderer.addSystem(b);
        b.erosion = {softness: 0.5};
        frame(renderer);
        expect(batchOf(renderer, b)).not.toBe(batchOf(renderer, a));
        b.erosion = {softness: 0.1};
        frame(renderer);
        expect(batchOf(renderer, b)).toBe(batchOf(renderer, a));
        expect(renderer.batches.filter((batch) => batch.systems.size > 0)).toHaveLength(1);
        renderer.dispose();
    });

    it('the reflection level of a mesh with a loaded atlas is written in place', () => {
        const renderer = new BatchedRenderer('live-reflection', scene);
        const atlas = RawTexture.CreateRGBATexture(new Uint8Array(4 * 6), 3, 2, scene);
        jest.spyOn(atlas, 'isReady').mockReturnValue(true);
        const s = system({renderMode: RenderMode.Mesh, instancingGeometry: cube, instancingIndices: cubeIndices});
        s.getRendererSettings().reflectionAtlas = atlas;
        s.getRendererSettings().reflectionLevel = 0.5;
        renderer.addSystem(s);
        const material = materialOf(renderer, s);
        expect(uniforms(material)._options.defines).toContain('USE_ENVMAP_ATLAS');
        expect(uniforms(material)._floats.reflectionLevel).toBe(0.5);
        s.getRendererSettings().reflectionLevel = 0.25;
        s.neededToUpdateRender = true;
        frame(renderer);
        expect(materialOf(renderer, s)).toBe(material);
        expect(uniforms(material)._floats.reflectionLevel).toBe(0.25);
        renderer.dispose();
    });

    it('a trail takes live parameters the same way', () => {
        const renderer = new BatchedRenderer('live-trail', scene);
        const s = system({renderMode: RenderMode.Trail, erosion: {softness: 0.1}});
        renderer.addSystem(s);
        const material = materialOf(renderer, s);
        s.erosion = {softness: 0.7};
        frame(renderer);
        expect(materialOf(renderer, s)).toBe(material);
        expect(uniforms(material)._vectors2.erosionParams.x).toBe(0.7);
        renderer.dispose();
    });
});

describe('material flags after construction', () => {
    it('default to a transparent, depth-tested, non-writing, untested material', () => {
        const s = system();
        expect([s.transparent, s.depthTest, s.depthWrite, s.alphaTest]).toEqual([true, true, false, 0]);
    });

    it('reach the batch material', () => {
        const renderer = new BatchedRenderer('flags', scene);
        const s = system();
        renderer.addSystem(s);
        s.transparent = false;
        s.depthTest = false;
        s.depthWrite = true;
        s.alphaTest = 0.5;
        frame(renderer);
        expect([s.transparent, s.depthTest, s.depthWrite, s.alphaTest]).toEqual([false, false, true, 0.5]);
        const material = materialOf(renderer, s);
        expect(material.alphaMode).toBe(Constants.ALPHA_DISABLE);
        expect(material.depthFunction).toBe(Constants.ALWAYS);
        expect(material.disableDepthWrite).toBe(false);
        expect(uniforms(material)._options.defines).toContain('USE_ALPHATEST');
        renderer.dispose();
    });

    it('keep the alpha cutoff to 0…1', () => {
        const s = system();
        s.alphaTest = 2;
        expect(s.alphaTest).toBe(1);
        s.alphaTest = -1;
        expect(s.alphaTest).toBe(0);
        s.alphaTest = Number.NaN;
        expect(s.alphaTest).toBe(0);
        expect(system({alphaTest: 3}).alphaTest).toBe(1);
    });

    it('are written to JSON only when set, and read back', () => {
        const meta: BabylonMetaData = {geometries: {}, materials: {}, textures: {}};
        expect(system().toJSON(meta)).not.toMatchObject({transparent: expect.anything()});
        const s = system();
        s.transparent = false;
        s.depthTest = false;
        s.depthWrite = true;
        s.alphaTest = 0.25;
        const json = s.toJSON(meta);
        expect(json).toMatchObject({transparent: false, depthTest: false, depthWrite: true, alphaTest: 0.25});
        const loaded = ParticleSystem.fromJSON(json, meta, {}, scene);
        expect([loaded.transparent, loaded.depthTest, loaded.depthWrite, loaded.alphaTest]).toEqual([
            false,
            false,
            true,
            0.25,
        ]);
        const copy = s.clone();
        expect([copy.transparent, copy.depthTest, copy.depthWrite, copy.alphaTest]).toEqual([false, false, true, 0.25]);
    });
});
