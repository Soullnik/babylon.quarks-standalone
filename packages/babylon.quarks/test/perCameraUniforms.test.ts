import {FreeCamera} from '@babylonjs/core/Cameras/freeCamera';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {DirectionalLight} from '@babylonjs/core/Lights/directionalLight';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {RawTexture} from '@babylonjs/core/Materials/Textures/rawTexture';
import {Vector4 as BVector4, Vector3} from '@babylonjs/core/Maths/math.vector';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import {softDepthParams} from '../src/softDepth';
import {RenderMode} from '../src/VFXBatch';

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

function system(overrides: Partial<ParticleSystemParameters> = {}): ParticleSystem {
    return new ParticleSystem({
        scene,
        startLife: new ConstantValue(1),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(10),
        shape: new PointEmitter(),
        ...overrides,
    });
}

/**
 * The effect a bind uploads to, recording what each uniform held when it was written. ShaderMaterial
 * uploads its stored values before its bind observers run, so a per-camera value must reach this
 * effect from inside the observer to be on the GPU for the draw that triggered it.
 */
function boundEffect(material: ShaderMaterial): Record<string, number[]> {
    const written: Record<string, number[]> = {};
    const record =
        (size: number) =>
        (name: string, value: {asArray(): number[]}): unknown => {
            written[name] = value.asArray().slice(0, size);
            return effect;
        };
    const effect = {
        setVector2: record(2),
        setVector3: record(3),
        setVector4: record(4),
        setFloat4: () => effect,
        setColor3: () => effect,
        isReady: () => true,
    };
    jest.spyOn(material, 'getEffect').mockReturnValue(effect as never);
    return written;
}

function bind(material: ShaderMaterial): void {
    material.onBindObservable.notifyObservers(undefined as never);
}

function camera(name: string, position: Vector3, minZ: number, maxZ: number): FreeCamera {
    const result = new FreeCamera(name, position, scene);
    result.minZ = minZ;
    result.maxZ = maxZ;
    result.computeWorldMatrix();
    return result;
}

describe('per-camera uniforms reach the effect of the draw they are for', () => {
    test('an effect still compiling is left alone, and gets the stored value later', () => {
        const a = camera('a', new Vector3(1, 2, 3), 0.1, 100);
        scene.activeCamera = a;
        const renderer = new BatchedRenderer('compiling', scene);
        renderer.addSystem(system({renderMode: RenderMode.Mesh, rim: {}}));
        const material = renderer.batches[0].mesh.material as ShaderMaterial;
        const setVector3 = jest.fn();
        jest.spyOn(material, 'getEffect').mockReturnValue({
            isReady: () => false,
            setVector3,
            setFloat4: jest.fn(),
            setColor3: jest.fn(),
            setVector4: jest.fn(),
            setVector2: jest.fn(),
        } as never);
        expect(() => bind(material)).not.toThrow();
        expect(setVector3).not.toHaveBeenCalled();
        expect((material as any)._vectors3.eyePosition.asArray()).toEqual([1, 2, 3]);
    });

    test('the eye position of each camera, in its own draw', () => {
        const a = camera('a', new Vector3(1, 2, 3), 0.1, 100);
        const b = camera('b', new Vector3(-4, 5, -6), 0.5, 50);
        const renderer = new BatchedRenderer('eye', scene);
        renderer.addSystem(system({renderMode: RenderMode.Mesh, rim: {}}));
        const material = renderer.batches[0].mesh.material as ShaderMaterial;
        const written = boundEffect(material);

        scene.activeCamera = a;
        bind(material);
        expect(written.eyePosition).toEqual([1, 2, 3]);
        scene.activeCamera = b;
        bind(material);
        expect(written.eyePosition).toEqual([-4, 5, -6]);
        // Stored for the next bind too.
        expect((material as any)._vectors3.eyePosition.asArray()).toEqual([-4, 5, -6]);
    });

    test('the depth decode for the clip planes of each camera, for soft particles', () => {
        const a = camera('a', new Vector3(0, 0, -10), 0.1, 100);
        const b = camera('b', new Vector3(0, 0, -20), 0.5, 50);
        const depth = RawTexture.CreateLuminanceTexture(new Uint8Array([200]), 1, 1, scene);
        const renderer = new BatchedRenderer('soft', scene);
        renderer.setDepthTexture(depth);
        renderer.addSystem(system({softParticles: true, softNearFade: 0, softFarFade: 1}));
        const material = renderer.batches[0].mesh.material as ShaderMaterial;
        const written = boundEffect(material);

        for (const current of [a, b]) {
            scene.activeCamera = current;
            bind(material);
            const expected = softDepthParams(current, 'linear', new BVector4()).asArray();
            written.projParams.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 4));
        }
        expect(written.projParams).not.toEqual(softDepthParams(a, 'linear', new BVector4()).asArray());
    });

    test('the scene light as it is at this draw, and the fixed light when there is none', () => {
        scene.activeCamera = camera('a', new Vector3(0, 0, -10), 0.1, 100);
        const sun = new DirectionalLight('sun', new Vector3(0, -1, 0), scene);
        const renderer = new BatchedRenderer('light', scene);
        renderer.addSystem(system({renderMode: RenderMode.Mesh, lighting: 'scene'}));
        const material = renderer.batches[0].mesh.material as ShaderMaterial;
        const written = boundEffect(material);

        bind(material);
        expect(written.lightDirection).toEqual([0, -1, 0]);
        sun.direction = new Vector3(1, 0, 0);
        bind(material);
        expect(written.lightDirection).toEqual([1, 0, 0]);
        sun.setEnabled(false);
        bind(material);
        expect(written.lightDirection).toEqual(renderer.getMeshLighting().direction.asArray());
        expect(written.lightColor).toBeDefined();
        expect(written.ambientColor).toBeDefined();
    });

    test('the depth decode of each camera, for a soft trail', () => {
        const a = camera('a', new Vector3(0, 0, -10), 0.1, 100);
        const b = camera('b', new Vector3(0, 0, -20), 0.5, 50);
        const renderer = new BatchedRenderer('trail', scene);
        renderer.setDepthTexture(RawTexture.CreateLuminanceTexture(new Uint8Array([200]), 1, 1, scene));
        renderer.addSystem(
            system({
                renderMode: RenderMode.Trail,
                softParticles: true,
                rendererEmitterSettings: {startLength: new ConstantValue(4), followLocalOrigin: false},
            })
        );
        const material = renderer.batches[0].mesh.material as ShaderMaterial;
        const written = boundEffect(material);
        for (const current of [a, b]) {
            scene.activeCamera = current;
            bind(material);
            const expected = softDepthParams(current, 'linear', new BVector4()).asArray();
            written.projParams.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 4));
        }
    });
});
