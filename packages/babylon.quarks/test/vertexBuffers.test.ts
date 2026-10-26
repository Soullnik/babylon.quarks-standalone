import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import {SpriteBatch} from '../src/SpriteBatch';
import {RenderMode} from '../src/VFXBatch';

/**
 * WebGPU allows 8 vertex buffers per pipeline by default (`maxVertexBuffers`), and a batch past it
 * gets no pipeline: nothing it draws reaches the frame. Babylon's WebGPU engine binds a run of
 * attributes once when they come one after another in the effect's attribute list and are views
 * of the same buffer. These tests count the bindings that way for every render mode, with the
 * heaviest geometry each one takes.
 */
const MAX_VERTEX_BUFFERS = 8;

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
        startSpeed: new ConstantValue(1),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(10),
        shape: new PointEmitter(),
        ...overrides,
    });
}

const quad = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
const quadUVs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
const quadUVs2 = new Float32Array([0, 0, 2, 0, 2, 2, 0, 2]);
const quadNormals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);

/** The bindings a batch's material takes on WebGPU, and the attributes each one carries. */
function bindingsOf(renderer: BatchedRenderer, s: ParticleSystem): string[][] {
    const batch = renderer.batches[renderer.systemToBatchIndex.get(s)!];
    const attributes = (batch.mesh.material as ShaderMaterial).options.attributes;
    const runs: string[][] = [];
    let last: unknown = undefined;
    let lastStride = -1;
    for (const attribute of attributes) {
        const vb = batch.mesh.getVertexBuffer(attribute);
        expect(vb).toBeTruthy();
        const buffer = vb!.getBuffer();
        if (runs.length > 0 && buffer === last && vb!.byteStride === lastStride) {
            runs[runs.length - 1].push(attribute);
        } else {
            runs.push([attribute]);
        }
        last = buffer;
        lastStride = vb!.byteStride;
    }
    return runs;
}

describe('vertex buffer bindings', () => {
    const erosion = () => ({mask: new Texture(null, scene), maskUV: {channel: 1 as const}});
    const cases: Array<[string, () => Partial<ParticleSystemParameters>]> = [
        ['billboard', () => ({renderMode: RenderMode.BillBoard})],
        ['stretched billboard', () => ({renderMode: RenderMode.StretchedBillBoard})],
        ['horizontal billboard', () => ({renderMode: RenderMode.HorizontalBillBoard})],
        ['beam', () => ({renderMode: RenderMode.Beam})],
        [
            'mesh with normals and a second UV set',
            () => ({
                renderMode: RenderMode.Mesh,
                instancingGeometry: quad,
                instancingUVs: quadUVs,
                instancingNormals: quadNormals,
                instancingUVs2: quadUVs2,
                erosion: erosion(),
            }),
        ],
        ['mesh without UVs', () => ({renderMode: RenderMode.Mesh, instancingGeometry: quad})],
        [
            'trail with a second UV set',
            () => ({
                renderMode: RenderMode.Trail,
                rendererEmitterSettings: {startLength: new ConstantValue(4), followLocalOrigin: false},
                erosion: erosion(),
            }),
        ],
    ];

    it.each(cases)('stay within WebGPU’s limit: %s', (_, overrides) => {
        const renderer = new BatchedRenderer('bindings', scene);
        const s = system(overrides());
        renderer.addSystem(s);
        renderer.update(0.1);
        renderer.update(0.1);
        expect(bindingsOf(renderer, s).length).toBeLessThanOrEqual(MAX_VERTEX_BUFFERS);
    });

    it('bind a mesh’s geometry once, and keep its data', () => {
        const renderer = new BatchedRenderer('geometry', scene);
        const s = system(cases[4][1]());
        renderer.addSystem(s);
        const runs = bindingsOf(renderer, s);
        expect(runs[0]).toEqual(['position', 'uv', 'normal', 'uv2']);
        expect(runs.length).toBe(6);
        const mesh = renderer.batches[renderer.systemToBatchIndex.get(s)!].mesh;
        expect(Array.from(mesh.getVerticesData('position')!)).toEqual(Array.from(quad));
        expect(Array.from(mesh.getVerticesData('uv')!)).toEqual(Array.from(quadUVs));
        expect(Array.from(mesh.getVerticesData('normal')!)).toEqual(Array.from(quadNormals));
        expect(Array.from(mesh.getVerticesData('uv2')!)).toEqual(Array.from(quadUVs2));
        expect(mesh.getTotalVertices()).toBe(4);
    });

    it('fill missing UVs with zeros', () => {
        const renderer = new BatchedRenderer('zeros', scene);
        const s = system({renderMode: RenderMode.Mesh, instancingGeometry: quad});
        renderer.addSystem(s);
        const mesh = renderer.batches[renderer.systemToBatchIndex.get(s)!].mesh;
        expect(Array.from(mesh.getVerticesData('uv')!)).toEqual(new Array(8).fill(0));
    });

    it('free the geometry buffer with the batch', () => {
        const renderer = new BatchedRenderer('free', scene);
        const s = system({renderMode: RenderMode.BillBoard});
        renderer.addSystem(s);
        const batch = renderer.batches[renderer.systemToBatchIndex.get(s)!] as SpriteBatch;
        const geometry = batch['geometryBuffer'] as {dispose(): void};
        const dispose = jest.spyOn(geometry, 'dispose');
        renderer.deleteSystem(s);
        batch.dispose();
        expect(dispose).toHaveBeenCalled();
        expect(batch['geometryBuffer']).toBeUndefined();
    });
});
