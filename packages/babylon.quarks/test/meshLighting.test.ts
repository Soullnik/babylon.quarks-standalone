import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {DirectionalLight} from '@babylonjs/core/Lights/directionalLight';
import {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleEmitter} from '../src/ParticleEmitter';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import {QuarksLoader} from '../src/QuarksLoader';
import physicsFragGLSL from '../src/shaders/particle_physics_frag.glsl';
import physicsFragWGSL from '../src/shaders/particle_physics_frag.wgsl';
import {MeshLighting, RenderMode} from '../src/VFXBatch';
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

function defines(mat: ShaderMaterial): string[] {
    return mat['options'].defines as string[];
}

function uniformNames(mat: ShaderMaterial): string[] {
    return mat['options'].uniforms as string[];
}

function vector3(mat: ShaderMaterial, name: string): Vector3 {
    return mat['_vectors3'][name] as Vector3;
}

function expectVector(actual: Vector3, x: number, y: number, z: number) {
    expect(actual.x).toBeCloseTo(x, 5);
    expect(actual.y).toBeCloseTo(y, 5);
    expect(actual.z).toBeCloseTo(z, 5);
}

describe('mesh particle lighting', () => {
    it('defaults to the fixed light mesh particles have always had', () => {
        const renderer = new BatchedRenderer('fixed', scene);
        const system = meshSystem();
        expect(system.lighting).toBe('fixed');
        renderer.addSystem(system);
        const mat = material(renderer);
        expect(defines(mat)).not.toContain('MESH_UNLIT');
        expectVector(vector3(mat, 'lightDirection'), 0.4, -1, 0.6);
        expectVector(vector3(mat, 'lightColor'), 1, 1, 1);
        expectVector(vector3(mat, 'ambientColor'), 0.35, 0.35, 0.35);
    });

    it('compiles the lighting term out when unlit', () => {
        const renderer = new BatchedRenderer('unlit', scene);
        renderer.addSystem(meshSystem({lighting: 'unlit'}));
        const mat = material(renderer);
        expect(defines(mat)).toContain('MESH_UNLIT');
        expect(uniformNames(mat)).not.toContain('lightDirection');
        expect(physicsFragGLSL).toContain('#ifdef MESH_UNLIT');
        expect(physicsFragWGSL).toContain('#ifdef MESH_UNLIT');
    });

    it('keeps systems with different lighting in different batches', () => {
        const renderer = new BatchedRenderer('split', scene);
        const geometry = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
        const indices = new Uint32Array([0, 1, 2]);
        const fixed = meshSystem({instancingGeometry: geometry, instancingIndices: indices});
        const alsoFixed = meshSystem({instancingGeometry: geometry, instancingIndices: indices});
        const unlit = meshSystem({instancingGeometry: geometry, instancingIndices: indices, lighting: 'unlit'});
        renderer.addSystem(fixed);
        renderer.addSystem(alsoFixed);
        renderer.addSystem(unlit);
        expect(renderer.batches).toHaveLength(2);
        expect(renderer.systemToBatchIndex.get(fixed)).toBe(renderer.systemToBatchIndex.get(alsoFixed));
        expect(renderer.systemToBatchIndex.get(unlit)).not.toBe(renderer.systemToBatchIndex.get(fixed));
    });

    it('re-batches a system whose lighting changes', () => {
        const renderer = new BatchedRenderer('switch', scene);
        const system = meshSystem();
        renderer.addSystem(system);
        system.lighting = 'unlit';
        renderer.update(1 / 60);
        const batch = renderer.batches[renderer.systemToBatchIndex.get(system)!];
        expect(defines(batch.mesh.material as ShaderMaterial)).toContain('MESH_UNLIT');
    });

    it('applies the renderer light to existing batches and to ones created later', () => {
        const renderer = new BatchedRenderer('setLight', scene);
        renderer.addSystem(meshSystem());
        renderer.setMeshLighting({direction: new Vector3(0, -1, 0), color: new Color3(1, 0.5, 0.25)});
        let mat = material(renderer);
        expectVector(vector3(mat, 'lightDirection'), 0, -1, 0);
        expectVector(vector3(mat, 'lightColor'), 1, 0.5, 0.25);
        // Left out: unchanged.
        expectVector(vector3(mat, 'ambientColor'), 0.35, 0.35, 0.35);

        renderer.addSystem(meshSystem({lighting: 'scene', uTileCount: 2}));
        mat = material(renderer, 1);
        // No scene light yet: the scene mode falls back to the renderer light.
        notifyBind(mat);
        expectVector(vector3(mat, 'lightDirection'), 0, -1, 0);

        const copy = renderer.getMeshLighting();
        copy.direction.x = 99;
        expect(renderer.getMeshLighting().direction.x).toBe(0);
    });

    it('follows the scene’s directional light in scene mode', () => {
        scene.ambientColor = new Color3(0.1, 0.2, 0.3);
        const disabled = new DirectionalLight('off', new Vector3(1, 0, 0), scene);
        disabled.setEnabled(false);
        const sun = new DirectionalLight('sun', new Vector3(0, -1, 1), scene);
        sun.diffuse = new Color3(1, 0.8, 0.6);
        sun.intensity = 2;
        const renderer = new BatchedRenderer('sceneDir', scene);
        renderer.addSystem(meshSystem({lighting: 'scene'}));
        const mat = material(renderer);
        notifyBind(mat);
        expectVector(vector3(mat, 'lightDirection'), 0, -1, 1);
        expectVector(vector3(mat, 'lightColor'), 2, 1.6, 1.2);
        expectVector(vector3(mat, 'ambientColor'), 0.1, 0.2, 0.3);

        // Every frame: a change to the light shows on the next bind.
        sun.direction = new Vector3(1, -1, 0);
        notifyBind(mat);
        expectVector(vector3(mat, 'lightDirection'), 1, -1, 0);
    });

    it('lights from the sky side of a hemispheric light and adds its ground colour to the ambient', () => {
        const sky = new HemisphericLight('sky', new Vector3(0, 1, 0), scene);
        sky.diffuse = new Color3(1, 1, 1);
        sky.groundColor = new Color3(0.2, 0.1, 0);
        sky.intensity = 0.5;
        const renderer = new BatchedRenderer('sceneHemi', scene);
        renderer.addSystem(meshSystem({lighting: 'scene'}));
        const mat = material(renderer);
        notifyBind(mat);
        expectVector(vector3(mat, 'lightDirection'), 0, -1, 0);
        expectVector(vector3(mat, 'lightColor'), 0.5, 0.5, 0.5);
        expectVector(vector3(mat, 'ambientColor'), 0.1, 0.05, 0);
    });

    it('round-trips through toJSON / fromJSON and clone, writing nothing for the default', () => {
        for (const lighting of ['unlit', 'scene'] as MeshLighting[]) {
            const system = meshSystem({lighting});
            const meta = emptyMeta();
            const json = system.toJSON(meta);
            expect(meta.materials[json.material!].lighting).toBe(lighting);
            expect(ParticleSystem.fromJSON(json, meta, {}, scene).lighting).toBe(lighting);
            expect(system.clone().lighting).toBe(lighting);
        }
        const meta = emptyMeta();
        const json = meshSystem().toJSON(meta);
        expect('lighting' in meta.materials[json.material!]).toBe(false);
    });

    it('is read from the effect material by the loader', () => {
        const loader = new QuarksLoader(scene);
        const root = loader.parse({
            materials: [{uuid: 'm', type: 'QuarksMaterial', lighting: 'unlit'}],
            object: {
                uuid: 'e',
                type: 'ParticleEmitter',
                ps: {
                    ...meshSystem().toJSON(),
                    material: 'm',
                },
            },
        });
        expect(((root as ParticleEmitter).system as ParticleSystem).lighting).toBe('unlit');
    });

    it('treats an unknown mode as fixed', () => {
        const system = meshSystem({lighting: 'bright' as never});
        expect(system.lighting).toBe('fixed');
    });
});
