import {Constants} from '@babylonjs/core/Engines/constants';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {RawTexture} from '@babylonjs/core/Materials/Textures/rawTexture';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import {TrailBatch} from '../src/TrailBatch';
import {RenderMode} from '../src/VFXBatch';

describe('TrailBatch', () => {
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

    const createTrailSystem = (overrides: Partial<ConstructorParameters<typeof ParticleSystem>[0]> = {}) =>
        new ParticleSystem({
            scene,
            duration: 5,
            looping: true,
            startLife: new ConstantValue(5),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(1),
            startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
            emissionOverTime: new ConstantValue(200),
            shape: new PointEmitter(),
            renderMode: RenderMode.Trail,
            rendererEmitterSettings: {
                startLength: new ConstantValue(8),
                followLocalOrigin: false,
            },
            ...overrides,
        });

    const getTrailBatch = (renderer: BatchedRenderer): TrailBatch => renderer.batches[0] as TrailBatch;

    it('keeps trail mesh disabled when emitter is hidden', () => {
        const renderer = new BatchedRenderer('trail-hidden', scene);
        const system = createTrailSystem();
        renderer.addSystem(system);
        system.emitter.visible = false;

        for (let i = 0; i < 30; i++) {
            renderer.update(1 / 60);
        }

        const batch = getTrailBatch(renderer);
        expect(batch.mesh.isEnabled()).toBe(true);
        // Nothing reaches the screen, but the draw is not submitted with zero
        // indices — WebGPU warns about that once per frame. The batch parks on a
        // triangle whose corners are all the same vertex instead.
        expect(batch.mesh.subMeshes[0].indexCount).toBeGreaterThan(0);
        expect(Array.from(batch.mesh.getIndices()!.slice(0, 6))).toEqual([0, 0, 0, 0, 0, 0]);

        renderer.dispose();
        system.dispose();
    });

    it('builds trail geometry for visible particles in local space', () => {
        const renderer = new BatchedRenderer('trail-visible', scene);
        const system = createTrailSystem({worldSpace: false});
        system.emitter.scaling.set(2, 3, 4);
        renderer.addSystem(system);

        for (let i = 0; i < 30; i++) {
            renderer.update(1 / 60);
        }

        const batch = getTrailBatch(renderer);
        const widthBuffer = (batch as any).widthBuffer as Float32Array;
        expect(system.particleNum).toBeGreaterThan(0);
        expect(batch.mesh.isEnabled()).toBe(true);
        expect(batch.mesh.subMeshes[0].indexCount).toBeGreaterThan(0);
        expect(batch.mesh.subMeshes[0].verticesCount).toBeGreaterThan(0);
        expect(widthBuffer[0]).toBeGreaterThan(1);

        renderer.dispose();
        system.dispose();
    });

    it('expands buffers when dense trails exceed the initial capacity', () => {
        const renderer = new BatchedRenderer('trail-expand', scene);
        const system = createTrailSystem({
            emissionOverTime: new ConstantValue(4000),
            rendererEmitterSettings: {
                startLength: new ConstantValue(12),
                followLocalOrigin: false,
            },
            worldSpace: true,
        });
        renderer.addSystem(system);

        const batch = getTrailBatch(renderer);
        const initialCapacity = (batch as any).maxParticles as number;

        for (let i = 0; i < 90; i++) {
            renderer.update(1 / 60);
        }

        expect((batch as any).maxParticles).toBeGreaterThan(initialCapacity);
        expect(batch.mesh.isEnabled()).toBe(true);
        expect(batch.mesh.subMeshes[0].indexCount).toBeGreaterThan(0);

        renderer.dispose();
        system.dispose();
    });

    it('configures shader material flags for opaque trails', () => {
        const renderer = new BatchedRenderer('trail-opaque', scene);
        const system = createTrailSystem({
            transparent: false,
            depthWrite: true,
        });
        renderer.addSystem(system);

        const batch = getTrailBatch(renderer);
        const material = batch.mesh.material as ShaderMaterial;
        expect(material.alphaMode).toBe(Constants.ALPHA_DISABLE);
        expect(material.forceDepthWrite).toBe(true);
        expect(material.disableDepthWrite).toBe(false);

        renderer.dispose();
        system.dispose();
    });

    it('includes USE_MAP define when trail uses a texture', () => {
        const tex = RawTexture.CreateRGBTexture(new Uint8Array([255, 0, 0, 255]), 1, 1, scene);
        const renderer = new BatchedRenderer('trail-texture', scene);
        const system = createTrailSystem({texture: tex});
        renderer.addSystem(system);
        renderer.update(1 / 60);
        const mat = getTrailBatch(renderer).mesh.material as ShaderMaterial;
        expect((mat.options.defines as string[]).includes('USE_MAP')).toBe(true);
        expect((mat as any)._textures.map).toBe(tex);
        renderer.dispose();
        system.dispose();
        tex.dispose();
    });

    it('uses transparent blending mode for trail materials when configured', () => {
        const renderer = new BatchedRenderer('trail-transparent', scene);
        const system = createTrailSystem({transparent: true, blendMode: Constants.ALPHA_ADD});
        renderer.addSystem(system);
        renderer.update(1 / 60);
        const mat = getTrailBatch(renderer).mesh.material as ShaderMaterial;
        expect(mat.alphaMode).toBe(Constants.ALPHA_ADD);
        renderer.dispose();
        system.dispose();
    });

    it('runs U from the tail by default and from the particle with uvFromHead', () => {
        const firstU = (uvFromHead: boolean) => {
            const renderer = new BatchedRenderer('trail-uv', scene);
            const system = createTrailSystem({
                rendererEmitterSettings: {startLength: new ConstantValue(8), followLocalOrigin: false, uvFromHead},
            });
            renderer.addSystem(system);
            for (let i = 0; i < 30; i++) {
                renderer.update(1 / 60);
            }
            // The first vertex pair is the oldest sample of the first trail.
            const u = ((getTrailBatch(renderer) as any).uvBuffer as Float32Array)[0];
            renderer.dispose();
            system.dispose();
            return u;
        };
        expect(firstU(false)).toBe(0);
        expect(firstU(true)).toBe(1);
    });

    it('picks the sprite-sheet cell like billboards do: columns by uTileCount, whole frames only', () => {
        const cellUVs = (tile: number) => {
            const renderer = new BatchedRenderer('trail-tile', scene);
            const system = createTrailSystem({uTileCount: 4, vTileCount: 2, startTileIndex: new ConstantValue(tile)});
            renderer.addSystem(system);
            for (let i = 0; i < 30; i++) {
                renderer.update(1 / 60);
            }
            const uv = (getTrailBatch(renderer) as any).uvBuffer as Float32Array;
            const n = (system.particles[0] as any).historyCount as number;
            const us: number[] = [];
            for (let i = 0; i < n; i++) us.push(uv[i * 4], uv[i * 4 + 2]);
            const vs = [uv[1], uv[3]];
            renderer.dispose();
            system.dispose();
            return {us, vs};
        };
        // Frame 5 of a 4×2 sheet is column 1 of row 1: U in [0.25, 0.5], V in [0, 0.5].
        const cell = cellUVs(5);
        for (const u of cell.us) {
            expect(u).toBeGreaterThanOrEqual(0.25 - 1e-6);
            expect(u).toBeLessThanOrEqual(0.5 + 1e-6);
        }
        expect(cell.vs[0]).toBeCloseTo(0);
        expect(cell.vs[1]).toBeCloseTo(0.5);
        // A fractional frame shows that whole frame, not a slice across two cells.
        expect(cellUVs(5.6)).toEqual(cell);
    });

    it('anchors U = 0 on the newest sample when no live tip is drawn', () => {
        const renderer = new BatchedRenderer('trail-uv-head', scene);
        // followLocalOrigin draws no live tip, so the recorded head is the ribbon's end.
        const system = createTrailSystem({
            rendererEmitterSettings: {startLength: new ConstantValue(8), followLocalOrigin: true, uvFromHead: true},
        });
        renderer.addSystem(system);
        for (let i = 0; i < 30; i++) {
            renderer.update(1 / 60);
        }
        const n = (system.particles[0] as any).historyCount as number;
        const uv = (getTrailBatch(renderer) as any).uvBuffer as Float32Array;
        expect(n).toBeGreaterThan(1);
        expect(uv[0]).toBe(1);
        expect(uv[(n - 1) * 4]).toBe(0);
        renderer.dispose();
        system.dispose();
    });

    it('keeps recorded points in place behind a moving local-space emitter with recordWorldSpace', () => {
        const oldestX = (recordWorldSpace: boolean) => {
            const renderer = new BatchedRenderer('trail-world', scene);
            const system = createTrailSystem({
                worldSpace: false,
                rendererEmitterSettings: {
                    startLength: new ConstantValue(8),
                    followLocalOrigin: false,
                    recordWorldSpace,
                },
            });
            renderer.addSystem(system);
            for (let i = 0; i < 30; i++) {
                renderer.update(1 / 60);
            }
            // Jump the emitter; points recorded before the jump stay at x = 0 only in world space.
            system.emitter.position.x = 10;
            renderer.update(1 / 60);
            const x = ((getTrailBatch(renderer) as any).positionBuffer as Float32Array)[0];
            renderer.dispose();
            system.dispose();
            return x;
        };
        expect(oldestX(false)).toBeCloseTo(10);
        expect(oldestX(true)).toBeCloseTo(0);
    });

    it('paints the whole trail in the current particle color with colorFromParticle', () => {
        const tailRed = (colorFromParticle: boolean) => {
            const renderer = new BatchedRenderer('trail-color', scene);
            const system = createTrailSystem({
                rendererEmitterSettings: {
                    startLength: new ConstantValue(8),
                    followLocalOrigin: false,
                    colorFromParticle,
                },
            });
            renderer.addSystem(system);
            for (let i = 0; i < 30; i++) {
                renderer.update(1 / 60);
            }
            // Samples recorded so far are white; turn the particles green now.
            for (let i = 0; i < system.particleNum; i++) {
                system.particles[i].color.set(0, 1, 0, 1);
            }
            renderer.update(1 / 60);
            const red = ((getTrailBatch(renderer) as any).colorBuffer as Float32Array)[0];
            renderer.dispose();
            system.dispose();
            return red;
        };
        expect(tailRed(false)).toBe(1);
        expect(tailRed(true)).toBe(0);
    });

    it('drops a trail as soon as its particle dies with dieWithParticle', () => {
        const survivors = (dieWithParticle: boolean) => {
            const renderer = new BatchedRenderer('trail-die', scene);
            const system = createTrailSystem({
                looping: false,
                duration: 0.05,
                startLife: new ConstantValue(0.1),
                rendererEmitterSettings: {startLength: new ConstantValue(8), followLocalOrigin: false, dieWithParticle},
            });
            renderer.addSystem(system);
            // The last particle dies around 0.15s; its trail would take another 8 steps to drain.
            for (let i = 0; i < 12; i++) {
                renderer.update(1 / 60);
            }
            const count = system.particleNum;
            renderer.dispose();
            system.dispose();
            return count;
        };
        expect(survivors(false)).toBeGreaterThan(0);
        expect(survivors(true)).toBe(0);
    });

    it('round-trips the trail flags through JSON and clone', () => {
        const system = createTrailSystem({
            rendererEmitterSettings: {
                startLength: new ConstantValue(8),
                followLocalOrigin: false,
                uvFromHead: true,
                colorFromParticle: true,
                dieWithParticle: true,
                recordWorldSpace: true,
            },
        });
        const meta: any = {textures: {}, materials: {}, geometries: {}};
        const json = system.toJSON(meta);
        expect(json.rendererEmitterSettings).toMatchObject({
            uvFromHead: true,
            colorFromParticle: true,
            dieWithParticle: true,
            recordWorldSpace: true,
        });
        for (const copy of [ParticleSystem.fromJSON(json, meta, {}, scene), system.clone()]) {
            expect(copy.rendererEmitterSettings).toMatchObject({
                uvFromHead: true,
                colorFromParticle: true,
                dieWithParticle: true,
                recordWorldSpace: true,
            });
            copy.dispose();
        }
        // Flags left off stay out of the JSON.
        const plain = createTrailSystem();
        expect(
            Object.keys(plain.toJSON({textures: {}, materials: {}, geometries: {}} as any).rendererEmitterSettings)
        ).toEqual(['startLength', 'followLocalOrigin']);
        plain.dispose();
        system.dispose();
    });

    it('disposes trail material safely', () => {
        const renderer = new BatchedRenderer('trail-dispose', scene);
        const system = createTrailSystem();
        renderer.addSystem(system);
        const batch = getTrailBatch(renderer);
        const disposeSpy = jest.spyOn(batch.mesh.material!, 'dispose');
        batch.dispose();
        expect(disposeSpy).toHaveBeenCalled();
        disposeSpy.mockRestore();
        system.dispose();
    });
});
