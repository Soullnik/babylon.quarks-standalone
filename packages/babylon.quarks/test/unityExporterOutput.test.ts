/**
 * What the Unity exporter writes, read back by the runtime. The exporter's own tests
 * (`tools/unity-quarks-exporter/Tests~`, run with `npm run test:exporter`) export Shuriken effects
 * built in code and keep the JSON as golden files. Here every one of those files must load with a
 * strict loader, so a shape, behavior or value the runtime cannot read fails, and must carry what
 * the effect was set up with in Unity.
 */
import {Constants} from '@babylonjs/core/Engines/constants';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import type {Node} from '@babylonjs/core/node';
import {Scene} from '@babylonjs/core/scene';
import * as fs from 'fs';
import * as path from 'path';
import {ConeEmitFrom, ConeEmitter, loadPlugin} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {MeshSurfaceEmitterPlugin} from '../src/MeshSurfaceEmitter';
import type {ParticleEmitter} from '../src/ParticleEmitter';
import type {ParticleSystem} from '../src/ParticleSystem';
import {QuarksLoader} from '../src/QuarksLoader';
import {QUARKS_FORMAT_VERSION} from '../src/QuarksSerializer';
import {QuarksUtil} from '../src/QuarksUtil';
import {RenderMode} from '../src/VFXBatch';

const GOLDEN = path.join(__dirname, '../../../tools/unity-quarks-exporter/Tests~/golden');
const inline = fs.readdirSync(GOLDEN).filter((name) => name.endsWith('.json'));
const read = (file: string): unknown => JSON.parse(fs.readFileSync(path.join(GOLDEN, file), 'utf8'));

describe('Unity exporter output', () => {
    let engine: NullEngine;
    let scene: Scene;
    let roots: Node[];

    beforeAll(() => loadPlugin(MeshSurfaceEmitterPlugin));

    beforeEach(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
        roots = [];
    });

    afterEach(() => {
        roots.forEach((root) => QuarksLoader.disposeEffect(root as never));
        scene.dispose();
        engine.dispose();
    });

    /** The effect in `file`, loaded strictly, and its systems by name. */
    const load = (file: string) => {
        const root = new QuarksLoader(scene, {strict: true}).parse(read(file));
        roots.push(root);
        const systems = new Map<string, ParticleSystem>();
        QuarksUtil.runOnAllParticleEmitters(root, (emitter: ParticleEmitter) =>
            systems.set(emitter.name, emitter.system as ParticleSystem)
        );
        return {root, systems, system: (name: string) => systems.get(name)!};
    };

    it('has the golden files of every fixture', () => {
        expect(inline.sort()).toEqual(['billboard.json', 'blending.json', 'mesh.json', 'trails.json']);
        const files = (dir: string): string[] =>
            fs
                .readdirSync(path.join(GOLDEN, dir), {withFileTypes: true})
                .flatMap((entry) => (entry.isDirectory() ? files(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]));
        expect(files('files').sort()).toEqual([
            'files/mesh.json',
            'files/shared/geometries/Quad.json',
            'files/shared/geometries/Quad_2.json',
            'files/shared/textures/spark.png.size.txt',
            'files/trails.json',
        ]);
    });

    it.each(inline)('%s loads strictly and simulates', (file) => {
        const {root, systems} = load(file);
        expect(systems.size).toBeGreaterThan(0);
        const renderer = new BatchedRenderer('renderer', scene);
        QuarksUtil.addToBatchRenderer(root, renderer);
        QuarksUtil.play(root);
        for (let i = 0; i < 30; i++) renderer.update(1 / 60);
        renderer.dispose();
    });

    it('names the exporter and the format', () => {
        const json = read('billboard.json') as {metadata: Record<string, unknown>};
        expect(json.metadata.generator).toBe('babylon.quarks Unity exporter {version}');
        expect(json.metadata.quarksFormat).toBe(QUARKS_FORMAT_VERSION);
    });

    it('keeps a billboard effect: shape arc, material map layout and soft particles', () => {
        const sparks = load('billboard.json').system('Sparks');
        expect(sparks.renderMode).toBe(RenderMode.BillBoard);
        expect(sparks.blending).toBe(Constants.ALPHA_ADD);
        expect(sparks.worldSpace).toBe(true);
        expect(sparks.seed).toBe(4000000001);
        expect(sparks.cullingMode).toBe('pause');
        expect(sparks.sortMode).toBe('distance');
        expect(sparks.mapUV).toEqual({channel: 0, tiling: [2, 1], offset: [0.5, 0], scroll: [0, 0]});
        const texture = sparks.texture as Texture;
        expect(texture.wrapU).toBe(Texture.WRAP_ADDRESSMODE);
        expect(sparks.softParticles).toBe(true);
        expect(sparks.softNearFade).toBeCloseTo(0.1);
        expect(sparks.softFarFade).toBe(2);
        expect(sparks.uTileCount).toBe(2);
        expect(sparks.emitterShape.toJSON()).toMatchObject({
            type: 'cone',
            mode: 1,
            spread: 0.25,
            arc: expect.any(Number),
        });
        expect(sparks.behaviors.map((b) => b.type)).toEqual([
            'FrameOverLife',
            'ForceOverLife',
            'ColorOverLife',
            'SizeOverLife',
            'RotationOverLife',
            'Noise',
        ]);
    });

    it('keeps mesh particles: opaque cutout surface, render face, hierarchy scaling and both UV sets', () => {
        const {system} = load('mesh.json');
        const chunks = system('Chunks');
        expect(chunks.renderMode).toBe(RenderMode.Mesh);
        expect(chunks.transparent).toBe(false);
        expect(chunks.depthWrite).toBe(true);
        expect(chunks.alphaTest).toBeCloseTo(0.3);
        expect(chunks.renderFace).toBe('front');
        expect(chunks.scalingMode).toBe('hierarchy');
        expect(chunks.playbackSpeed).toBe(1.5);
        expect(chunks.instancingUVs2).toHaveLength(8);
        // The mesh had no normals; the runtime gives it its own.
        expect(chunks.getRendererSettings().instancingNormals).toHaveLength(12);
        expect(chunks.behaviors.map((b) => b.type)).toEqual(
            expect.arrayContaining(['Rotation3DOverLife', 'LimitSpeedOverLife'])
        );
        const dust = system('Dust');
        expect(dust.transparent).toBe(true);
        expect(dust.blending).toBe(Constants.ALPHA_COMBINE);
        // Local is Hierarchy without the parents' scale; the scaled parent warns.
        expect(dust.scalingMode).toBe('hierarchy');
        // Cone Volume, with its Length.
        const cone = dust.emitterShape as ConeEmitter;
        expect(cone.type).toBe('cone');
        expect(cone.emitFrom).toBe(ConeEmitFrom.Volume);
        expect(cone.length).toBe(2);
    });

    it('keeps trails, sub-emitters and a hidden mesh emitter source', () => {
        const {root, system} = load('trails.json');
        const rocket = system('Rocket');
        expect(rocket.renderMode).toBe(RenderMode.StretchedBillBoard);
        expect(rocket.blending).toBe(Constants.ALPHA_PREMULTIPLIED);
        expect(rocket.emitterShape.type).toBe('mesh_surface');
        expect(rocket.behaviors.filter((b) => b.type === 'EmitSubParticleSystem')).toHaveLength(2);
        const smoke = system('Smoke');
        expect(smoke.renderMode).toBe(RenderMode.Trail);
        expect(smoke.blending).toBe(Constants.ALPHA_SUBTRACT);
        expect(smoke.onlyUsedByOther).toBe(true);
        const source = root.getChildMeshes(false).find((mesh) => mesh.name.endsWith('(emitter source)')) as Mesh;
        expect(source.isVisible).toBe(false);
    });

    it('reads each Unity blend set-up as the Babylon alpha mode that blends the same way', () => {
        const {system} = load('blending.json');
        const blending = (name: string) => ({
            blending: system(name).blending,
            transparent: system(name).transparent,
        });
        expect(blending('UrpAlpha')).toEqual({blending: Constants.ALPHA_COMBINE, transparent: true});
        expect(blending('UrpPremultiply')).toEqual({blending: Constants.ALPHA_PREMULTIPLIED, transparent: true});
        expect(blending('UrpAdditive')).toEqual({blending: Constants.ALPHA_ADD, transparent: true});
        expect(blending('UrpMultiply')).toEqual({blending: Constants.ALPHA_MULTIPLY, transparent: true});
        expect(blending('UrpOpaque')).toEqual({blending: Constants.ALPHA_DISABLE, transparent: false});
        expect(blending('UrpOdd')).toEqual({blending: Constants.ALPHA_COMBINE, transparent: true});
        expect(blending('LegacyAdditive')).toEqual({blending: Constants.ALPHA_ADD, transparent: true});
        expect(blending('LegacySoftAdditive')).toEqual({blending: Constants.ALPHA_SCREENMODE, transparent: true});
        expect(blending('LegacyMultiply')).toEqual({blending: Constants.ALPHA_MULTIPLY, transparent: true});
        expect(blending('NoMaterial')).toEqual({blending: Constants.ALPHA_COMBINE, transparent: true});
        // Built-in Standard Particles, one system per Rendering Mode.
        expect(blending('StdOpaque')).toEqual({blending: Constants.ALPHA_DISABLE, transparent: false});
        expect(blending('StdCutout')).toEqual({blending: Constants.ALPHA_DISABLE, transparent: false});
        expect(system('StdCutout').alphaTest).toBeCloseTo(0.4);
        expect(blending('StdFade')).toEqual({blending: Constants.ALPHA_COMBINE, transparent: true});
        expect(blending('StdTransparent')).toEqual({blending: Constants.ALPHA_PREMULTIPLIED, transparent: true});
        expect(blending('StdAdditive')).toEqual({blending: Constants.ALPHA_ADD, transparent: true});
        expect(blending('StdSubtractive')).toEqual({blending: Constants.ALPHA_SUBTRACT, transparent: true});
        expect(blending('StdModulate')).toEqual({blending: Constants.ALPHA_MULTIPLY, transparent: true});
    });

    it('clamps a baked reflection atlas and keeps the map wrap', () => {
        const reflective = load('blending.json').system('Reflective');
        const atlas = reflective.getRendererSettings().reflectionAtlas as Texture;
        expect(atlas).toBeTruthy();
        expect(atlas.wrapU).toBe(Texture.CLAMP_ADDRESSMODE);
        expect(atlas.wrapV).toBe(Texture.CLAMP_ADDRESSMODE);
        expect((reflective.texture as Texture).wrapU).toBe(Texture.MIRROR_ADDRESSMODE);
    });

    it('references asset files that the export wrote', () => {
        for (const effect of ['mesh.json', 'trails.json']) {
            const json = read(`files/${effect}`) as {images: Array<{url: string}>; geometries: Array<{url?: string}>};
            const urls = [...json.images.map((image) => image.url), ...json.geometries.map((g) => g.url!)];
            expect(urls.length).toBeGreaterThan(0);
            for (const url of urls) {
                const file = path.join(GOLDEN, 'files', url);
                expect(fs.existsSync(file) || fs.existsSync(`${file}.size.txt`)).toBe(true);
            }
        }
    });
});
