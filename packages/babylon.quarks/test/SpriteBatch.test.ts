import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Constants} from '@babylonjs/core/Engines/constants';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {RawTexture} from '@babylonjs/core/Materials/Textures/rawTexture';
import {FreeCamera} from '@babylonjs/core/Cameras/freeCamera';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {ConstantColor, ConstantValue, Matrix4, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import {SpriteBatch} from '../src/SpriteBatch';
import {RenderMode} from '../src/VFXBatch';

describe('SpriteBatch', () => {
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

    const createSpriteSystem = (overrides: Partial<ConstructorParameters<typeof ParticleSystem>[0]> = {}) =>
        new ParticleSystem({
            scene,
            duration: 5,
            looping: true,
            startLife: new ConstantValue(5),
            startSpeed: new ConstantValue(1),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(200),
            shape: new PointEmitter(),
            renderMode: RenderMode.BillBoard,
            ...overrides,
        });

    const getSpriteBatch = (renderer: BatchedRenderer): SpriteBatch => renderer.batches[0] as SpriteBatch;

    it('skips hidden emitter systems during update', () => {
        const renderer = new BatchedRenderer('sprite-hidden', scene);
        const system = createSpriteSystem();
        renderer.addSystem(system);
        system.emitter.visible = false;

        for (let i = 0; i < 30; i++) {
            renderer.update(1 / 60);
        }

        const batch = getSpriteBatch(renderer);
        expect(batch).toBeInstanceOf(SpriteBatch);
        expect(batch.mesh.forcedInstanceCount).toBe(0);
        // Mesh stays enabled to avoid one-frame visibility toggles when particle count hits zero.
        expect(batch.mesh.isEnabled()).toBe(true);

        renderer.dispose();
        system.dispose();
    });

    it('populates instance buffers and applies local-space scale', () => {
        const renderer = new BatchedRenderer('sprite-local-space', scene);
        const system = createSpriteSystem({worldSpace: false});
        system.emitter.scaling.set(2, 3, 4);
        renderer.addSystem(system);

        for (let i = 0; i < 30; i++) {
            renderer.update(1 / 60);
        }

        const batch = getSpriteBatch(renderer);
        const sizeBuffer = (batch as any).sizeBuffer as Float32Array;
        expect(system.particleNum).toBeGreaterThan(0);
        expect(batch.mesh.forcedInstanceCount).toBe(system.particleNum);
        expect(sizeBuffer[0]).toBeGreaterThan(1);

        renderer.dispose();
        system.dispose();
    });

    it('expands dynamic sprite buffers for dense particle counts', () => {
        const renderer = new BatchedRenderer('sprite-expand', scene);
        const system = createSpriteSystem({
            emissionOverTime: new ConstantValue(4000),
            startLife: new ConstantValue(8),
        });
        renderer.addSystem(system);

        const batch = getSpriteBatch(renderer);
        expect((batch as any).maxParticles).toBe(1000);

        for (let i = 0; i < 60; i++) {
            renderer.update(1 / 60);
        }

        expect(system.particleNum).toBeGreaterThan(1000);
        expect((batch as any).maxParticles).toBeGreaterThan(1000);

        renderer.dispose();
        system.dispose();
    });

    it('handles stretched billboard velocity buffers and speedFactor clamping', () => {
        const renderer = new BatchedRenderer('sprite-stretched', scene);
        const system = createSpriteSystem({
            renderMode: RenderMode.StretchedBillBoard,
            rendererEmitterSettings: {
                speedFactor: 0,
                lengthFactor: 3,
            },
            worldSpace: true,
        });
        renderer.addSystem(system);
        renderer.update(1 / 60);
        renderer.update(1 / 60);

        for (let i = 0; i < system.particleNum; i++) {
            system.particles[i].velocity.set(3, 0, 0);
        }

        renderer.update(1 / 60);

        const batch = getSpriteBatch(renderer);
        const velocityBuffer = (batch as any).velocityBuffer as Float32Array;
        const material = batch.mesh.material as ShaderMaterial;
        expect(velocityBuffer[0]).toBeCloseTo(0.003, 6);
        expect(velocityBuffer[3]).toBe(3);
        expect((material as any)._floats.speedFactor).toBe(0.001);

        renderer.dispose();
        system.dispose();
    });

    it('applies opaque mesh material depth settings', () => {
        const renderer = new BatchedRenderer('sprite-mesh-material', scene);
        const system = createSpriteSystem({
            renderMode: RenderMode.Mesh,
            transparent: false,
            depthWrite: true,
            worldSpace: false,
        });
        renderer.addSystem(system);
        renderer.update(1 / 60);

        const batch = getSpriteBatch(renderer);
        const material = batch.mesh.material as ShaderMaterial;
        const rotationBuffer = (batch as any).rotationBuffer as Float32Array;
        expect(rotationBuffer.length % 4).toBe(0);
        expect(material.alphaMode).toBe(Constants.ALPHA_DISABLE);
        expect(material.forceDepthWrite).toBe(true);
        expect(material.disableDepthWrite).toBe(false);

        renderer.dispose();
        system.dispose();
    });

    const expectShaderDefines = (mat: ShaderMaterial, subset: string[]) => {
        const defs = mat.options.defines as string[];
        for (const d of subset) {
            expect(defs).toContain(d);
        }
    };

    it('enables USE_MAP when a texture is bound', () => {
        const tex = RawTexture.CreateRGBTexture(new Uint8Array([255, 0, 0, 255]), 1, 1, scene);
        const renderer = new BatchedRenderer('sprite-map', scene);
        const system = createSpriteSystem({texture: tex});
        renderer.addSystem(system);
        renderer.update(1 / 60);
        const mat = getSpriteBatch(renderer).mesh.material as ShaderMaterial;
        expectShaderDefines(mat, ['USE_MAP']);
        renderer.dispose();
        system.dispose();
        tex.dispose();
    });

    it('enables UV_TILE and TILE_BLEND for multi-tile atlases', () => {
        const renderer = new BatchedRenderer('sprite-tiles', scene);
        const system = createSpriteSystem({uTileCount: 4, vTileCount: 2, blendTiles: true});
        renderer.addSystem(system);
        renderer.update(1 / 60);
        const mat = getSpriteBatch(renderer).mesh.material as ShaderMaterial;
        expectShaderDefines(mat, ['UV_TILE', 'TILE_BLEND']);
        expect((mat as any)._floats.tileCountX).toBe(4);
        expect((mat as any)._floats.tileCountY).toBe(2);
        renderer.dispose();
        system.dispose();
    });

    it('enables SOFT_PARTICLES and USE_ALPHATEST with depth and camera', () => {
        scene.activeCamera = new FreeCamera('cam-soft', new Vector3(0, 0, -10), scene);
        const depthTex = RawTexture.CreateLuminanceTexture(new Uint8Array([200]), 1, 1, scene);
        const renderer = new BatchedRenderer('sprite-soft', scene);
        renderer.setDepthTexture(depthTex);
        const system = createSpriteSystem({
            softParticles: true,
            softNearFade: 0.05,
            softFarFade: 2,
            alphaTest: 0.35,
        });
        renderer.addSystem(system);
        renderer.update(1 / 60);
        const mat = getSpriteBatch(renderer).mesh.material as ShaderMaterial;
        expectShaderDefines(mat, ['SOFT_PARTICLES', 'USE_ALPHATEST']);
        expect((mat as any)._floats.alphaTest).toBeCloseTo(0.35, 5);
        mat.onBindObservable.notifyObservers(undefined as any);
        expect((mat as any)._vectors4.projParams).toBeDefined();
        renderer.dispose();
        system.dispose();
        depthTex.dispose();
    });

    it('uses VERTICAL and HORIZONTAL billboard defines', () => {
        const rendererV = new BatchedRenderer('sprite-vert', scene);
        const sysV = createSpriteSystem({renderMode: RenderMode.VerticalBillBoard});
        rendererV.addSystem(sysV);
        rendererV.update(1 / 60);
        expectShaderDefines(getSpriteBatch(rendererV).mesh.material as ShaderMaterial, ['VERTICAL']);
        rendererV.dispose();
        sysV.dispose();

        const rendererH = new BatchedRenderer('sprite-horiz', scene);
        const sysH = createSpriteSystem({renderMode: RenderMode.HorizontalBillBoard});
        rendererH.addSystem(sysH);
        rendererH.update(1 / 60);
        expectShaderDefines(getSpriteBatch(rendererH).mesh.material as ShaderMaterial, ['HORIZONTAL']);
        rendererH.dispose();
        sysH.dispose();
    });

    it('uses softNearFade as stretched speedFactor when greater than zero', () => {
        const renderer = new BatchedRenderer('sprite-stretch-softnear', scene);
        const system = createSpriteSystem({
            renderMode: RenderMode.StretchedBillBoard,
            rendererEmitterSettings: {speedFactor: 0, lengthFactor: 2},
            softNearFade: 0.4,
            worldSpace: true,
        });
        renderer.addSystem(system);
        const matBeforeUpdate = getSpriteBatch(renderer).mesh.material as ShaderMaterial;
        expect((matBeforeUpdate as any)._floats.speedFactor).toBe(0.4);
        renderer.update(1 / 60);
        const mat = getSpriteBatch(renderer).mesh.material as ShaderMaterial;
        expect((mat as any)._floats.speedFactor).toBe(0.001);
        renderer.dispose();
        system.dispose();
    });

    it('covers mesh rotation with parent matrix in local space', () => {
        const renderer = new BatchedRenderer('sprite-mesh-parent', scene);
        const system = createSpriteSystem({
            renderMode: RenderMode.Mesh,
            worldSpace: false,
            emissionOverTime: new ConstantValue(50),
            startLife: new ConstantValue(3),
        });
        renderer.addSystem(system);
        renderer.update(1 / 60);
        const batch = getSpriteBatch(renderer);
        const babylonWorld = system.emitter.getWorldMatrix();
        const parentMat = new Matrix4();
        for (let i = 0; i < 16; i++) {
            (parentMat as any).elements[i] = babylonWorld.m[i];
        }
        for (let i = 0; i < system.particleNum; i++) {
            (system.particles[i] as any).parentMatrix = parentMat;
        }
        renderer.update(1 / 60);
        expect(batch.mesh.forcedInstanceCount).toBeGreaterThan(0);
        renderer.dispose();
        system.dispose();
    });

    it('covers stretched velocity with parent matrix in local space', () => {
        const renderer = new BatchedRenderer('sprite-stretch-parent', scene);
        const system = createSpriteSystem({
            renderMode: RenderMode.StretchedBillBoard,
            rendererEmitterSettings: {speedFactor: 1, lengthFactor: 2},
            worldSpace: false,
            emissionOverTime: new ConstantValue(80),
            startLife: new ConstantValue(3),
        });
        renderer.addSystem(system);
        renderer.update(1 / 60);
        const babylonWorld = system.emitter.getWorldMatrix();
        const parentMat = new Matrix4();
        for (let i = 0; i < 16; i++) {
            (parentMat as any).elements[i] = babylonWorld.m[i];
        }
        for (let i = 0; i < system.particleNum; i++) {
            (system.particles[i] as any).parentMatrix = parentMat;
            system.particles[i].velocity.set(0, 1, 0);
        }
        renderer.update(1 / 60);
        expect(getSpriteBatch(renderer).mesh.forcedInstanceCount).toBeGreaterThan(0);
        renderer.dispose();
        system.dispose();
    });

    it('updates stretched speedFactor uniform when rendererEmitterSettings change', () => {
        const renderer = new BatchedRenderer('sprite-stretch-speed', scene);
        const system = createSpriteSystem({
            renderMode: RenderMode.StretchedBillBoard,
            rendererEmitterSettings: {speedFactor: 2, lengthFactor: 1},
            worldSpace: true,
        });
        renderer.addSystem(system);
        renderer.update(1 / 60);
        const batch = getSpriteBatch(renderer);
        (system.rendererEmitterSettings as any).speedFactor = 0.5;
        renderer.update(1 / 60);
        const mat = batch.mesh.material as ShaderMaterial;
        expect((mat as any)._floats.speedFactor).toBe(0.5);
        renderer.dispose();
        system.dispose();
    });

    it('mesh world-space path reads particle quaternion without parent matrix', () => {
        const renderer = new BatchedRenderer('sprite-mesh-ws', scene);
        const system = createSpriteSystem({
            renderMode: RenderMode.Mesh,
            worldSpace: true,
            emissionOverTime: new ConstantValue(120),
            startLife: new ConstantValue(3),
        });
        renderer.addSystem(system);
        renderer.update(1 / 60);
        expect(getSpriteBatch(renderer).mesh.forcedInstanceCount).toBeGreaterThan(0);
        renderer.dispose();
        system.dispose();
    });
});
