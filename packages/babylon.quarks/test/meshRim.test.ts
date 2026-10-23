import {FreeCamera} from '@babylonjs/core/Cameras/freeCamera';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleEmitter} from '../src/ParticleEmitter';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import {QuarksLoader} from '../src/QuarksLoader';
import physicsFragGLSL from '../src/shaders/particle_physics_frag.glsl';
import physicsFragWGSL from '../src/shaders/particle_physics_frag.wgsl';
import {normalizeMeshRim, RenderMode} from '../src/VFXBatch';
import {emptyMeta, notifyBind} from './internals';

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

function meshSystem(overrides: Partial<ParticleSystemParameters> = {}) {
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
        renderMode: RenderMode.Mesh,
        ...overrides,
    });
}

function material(renderer: BatchedRenderer, index = 0): ShaderMaterial {
    return renderer.batches[index].mesh.material as ShaderMaterial;
}

const defines = (mat: ShaderMaterial) => mat['options'].defines as string[];
const uniformNames = (mat: ShaderMaterial) => mat['options'].uniforms as string[];

describe('mesh particle rim', () => {
    it('is off unless set', () => {
        const renderer = new BatchedRenderer('noRim', scene);
        const system = meshSystem();
        expect(system.rim).toBeUndefined();
        renderer.addSystem(system);
        expect(defines(material(renderer))).not.toContain('MESH_RIM');
        expect(uniformNames(material(renderer))).not.toContain('eyePosition');
    });

    it('fills in defaults and keeps the values in range', () => {
        expect(normalizeMeshRim({})).toEqual({color: [1, 1, 1], power: 2, strength: 1, mode: 'add'});
        expect(normalizeMeshRim({power: -3, strength: -1, mode: 'bogus' as never})).toEqual({
            color: [1, 1, 1],
            power: 0.01,
            strength: 0,
            mode: 'add',
        });
        expect(normalizeMeshRim(undefined)).toBeUndefined();
    });

    it('compiles the rim in and feeds it the camera position', () => {
        const camera = new FreeCamera('cam', new Vector3(1, 2, 3), scene);
        scene.activeCamera = camera;
        camera.computeWorldMatrix();
        const renderer = new BatchedRenderer('rimAdd', scene);
        renderer.addSystem(meshSystem({rim: {color: [0.2, 0.6, 1], power: 3, strength: 0.8}}));
        const mat = material(renderer);
        expect(defines(mat)).toContain('MESH_RIM');
        expect(defines(mat)).not.toContain('MESH_RIM_MIX');
        const color = mat['_vectors3'].rimColor as Vector3;
        expect([color.x, color.y, color.z]).toEqual([0.2, 0.6, 1]);
        const params = mat['_vectors2'].rimParams;
        expect(params.x).toBe(3);
        expect(params.y).toBeCloseTo(0.8, 6);
        notifyBind(mat);
        const eye = mat['_vectors3'].eyePosition as Vector3;
        expect([eye.x, eye.y, eye.z]).toEqual([1, 2, 3]);
        for (const source of [physicsFragGLSL, physicsFragWGSL]) {
            expect(source).toContain('#ifdef MESH_RIM');
            expect(source).toContain('#if defined(USE_ENVMAP_ATLAS) || defined(MESH_RIM)');
        }
    });

    it('mixes toward the colour in mix mode', () => {
        const renderer = new BatchedRenderer('rimMix', scene);
        renderer.addSystem(meshSystem({rim: {color: [0, 0, 0], mode: 'mix'}, lighting: 'unlit'}));
        expect(defines(material(renderer))).toEqual(expect.arrayContaining(['MESH_RIM', 'MESH_RIM_MIX', 'MESH_UNLIT']));
    });

    it('fades the faces in fade mode, a mode of its own', () => {
        expect(normalizeMeshRim({mode: 'fade'})?.mode).toBe('fade');
        const renderer = new BatchedRenderer('rimFade', scene);
        renderer.addSystem(meshSystem({rim: {mode: 'fade', strength: 0.6}, lighting: 'unlit'}));
        const list = defines(material(renderer));
        expect(list).toEqual(expect.arrayContaining(['MESH_RIM', 'MESH_RIM_FADE']));
        expect(list).not.toContain('MESH_RIM_MIX');
        for (const source of [physicsFragGLSL, physicsFragWGSL]) {
            expect(source).toContain('defined(MESH_RIM_FADE)');
        }
    });

    it('batches different rims apart and equal ones together', () => {
        const renderer = new BatchedRenderer('rimBatch', scene);
        const geometry = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
        const indices = new Uint32Array([0, 1, 2]);
        const shared = {instancingGeometry: geometry, instancingIndices: indices};
        const a = meshSystem({...shared, rim: {power: 2}});
        const b = meshSystem({...shared, rim: {}});
        const c = meshSystem({...shared, rim: {power: 4}});
        const none = meshSystem(shared);
        [a, b, c, none].forEach((s) => renderer.addSystem(s));
        expect(renderer.systemToBatchIndex.get(a)).toBe(renderer.systemToBatchIndex.get(b));
        expect(new Set([a, c, none].map((s) => renderer.systemToBatchIndex.get(s))).size).toBe(3);
    });

    it('re-batches when the rim is assigned', () => {
        const renderer = new BatchedRenderer('rimSwitch', scene);
        const system = meshSystem();
        renderer.addSystem(system);
        system.rim = {mode: 'mix'};
        renderer.update(1 / 60);
        const batch = renderer.batches[renderer.systemToBatchIndex.get(system)!];
        expect(defines(batch.mesh.material as ShaderMaterial)).toContain('MESH_RIM_MIX');
    });

    it('round-trips through toJSON / fromJSON, clone and the loader', () => {
        const rim = {color: [1, 0.5, 0] as [number, number, number], power: 1.5, strength: 0.5, mode: 'mix' as const};
        const system = meshSystem({rim});
        const meta = emptyMeta();
        const json = system.toJSON(meta);
        expect(meta.materials[json.material!].rim).toEqual(rim);
        expect(ParticleSystem.fromJSON(json, meta, {}, scene).rim).toEqual(rim);
        expect(system.clone().rim).toEqual(rim);

        const loader = new QuarksLoader(scene);
        const root = loader.parse({
            materials: [{uuid: 'm', type: 'QuarksMaterial', rim: {color: [0, 0, 0], mode: 'mix'}}],
            object: {uuid: 'e', type: 'ParticleEmitter', ps: {...meshSystem().toJSON(), material: 'm'}},
        });
        expect(((root as ParticleEmitter).system as ParticleSystem).rim).toEqual({
            color: [0, 0, 0],
            power: 2,
            strength: 1,
            mode: 'mix',
        });

        const plain = emptyMeta();
        const plainJSON = meshSystem().toJSON(plain);
        expect('rim' in plain.materials[plainJSON.material!]).toBe(false);
    });
});
