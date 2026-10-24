import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Quaternion as BQuaternion, Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {InstancedMesh} from '@babylonjs/core/Meshes/instancedMesh';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {
    Behavior,
    ConstantValue,
    EmitSubParticleSystem,
    Noise,
    ParticleSystemEvent,
    PointEmitter,
    SpriteParticle,
    SubParticleEmitMode,
} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {EffectPool} from '../src/EffectPool';
import {disposeEffect, retainEffectResources} from '../src/effectResources';
import {MeshSurfaceEmitter} from '../src/MeshSurfaceEmitter';
import {ParticleEmitter} from '../src/ParticleEmitter';
import {ParticleSystem} from '../src/ParticleSystem';
import {QuarksPrefab} from '../src/QuarksPrefab';
import {QuarksUtil} from '../src/QuarksUtil';
import {RenderMode} from '../src/VFXBatch';

const STEP = 1 / 60;

describe('lifecycle API', () => {
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

    function makeSystem(parameters: Partial<ConstructorParameters<typeof ParticleSystem>[0]> = {}): ParticleSystem {
        return new ParticleSystem({
            scene,
            looping: false,
            duration: 0.2,
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(4), cycle: 1, interval: 0, probability: 1}],
            startLife: new ConstantValue(0.3),
            startSpeed: new ConstantValue(1),
            startSize: new ConstantValue(0.1),
            shape: new PointEmitter(),
            renderMode: RenderMode.BillBoard,
            texture: null,
            ...parameters,
        });
    }

    function run(system: ParticleSystem, seconds: number): void {
        for (let t = 0; t < seconds - 1e-9; t += STEP) {
            system.update(STEP);
        }
    }

    describe('events', () => {
        it('calls every listener of a firing even when one removes itself', () => {
            const system = makeSystem();
            const calls: string[] = [];
            const a = (): void => {
                calls.push('a');
                system.removeEventListener('finished', a);
            };
            system.addEventListener('finished', a);
            system.addEventListener('finished', () => calls.push('b'));
            run(system, 1);
            expect(calls).toEqual(['a', 'b']);
        });

        it('calls a listener added while firing from the next event only', () => {
            const system = makeSystem({
                emissionBursts: [{time: 0, count: new ConstantValue(2), cycle: 1, interval: 0, probability: 1}],
            });
            const calls: string[] = [];
            const late = (): void => {
                calls.push('late');
            };
            let added = false;
            system.addEventListener('particleDied', () => {
                calls.push('first');
                if (!added) {
                    added = true;
                    system.addEventListener('particleDied', late);
                }
            });
            run(system, 1);
            expect(calls).toEqual(['first', 'first', 'late']);
        });

        it('reuses one particleDied event, with the particle set only while listeners run', () => {
            const system = makeSystem();
            const events: ParticleSystemEvent[] = [];
            let particlesSeen = 0;
            system.addEventListener('particleDied', (event) => {
                events.push(event);
                if (event.particle !== undefined) particlesSeen++;
            });
            run(system, 1);
            expect(events).toHaveLength(4);
            expect(new Set(events).size).toBe(1);
            expect(particlesSeen).toBe(4);
            expect(events[0].particle).toBeUndefined();
            expect(events[0].particleSystem).toBe(system);
        });

        it('removeAllEventListeners with no type drops every listener', () => {
            const system = makeSystem();
            const calls: string[] = [];
            system.addEventListener('particleDied', () => calls.push('died'));
            system.addEventListener('finished', () => calls.push('finished'));
            system.removeAllEventListeners();
            run(system, 1);
            expect(calls).toEqual([]);
        });

        it('removeAllEventListeners with a type keeps the others', () => {
            const system = makeSystem();
            const calls: string[] = [];
            system.addEventListener('particleDied', () => calls.push('died'));
            system.addEventListener('finished', () => calls.push('finished'));
            system.removeAllEventListeners('particleDied');
            system.removeEventListener('emitEnd', () => undefined);
            run(system, 1);
            expect(calls).toEqual(['finished']);
        });
    });

    describe('play()', () => {
        it('replays a system that has finished, like Unity Play', () => {
            const system = makeSystem();
            run(system, 1);
            expect(system.isFinished()).toBe(true);
            system.play();
            run(system, STEP);
            expect(system.particleNum).toBe(4);
        });

        it('only resumes a paused system that has not finished', () => {
            const system = makeSystem({looping: true, emissionBursts: [], emissionOverTime: new ConstantValue(60)});
            run(system, 0.1);
            const time = system.emissionState.time;
            system.pause();
            system.play();
            expect(system.emissionState.time).toBe(time);
            expect(system.particleNum).toBeGreaterThan(0);
        });

        it('does nothing on a disposed system', () => {
            const system = makeSystem();
            system.dispose();
            system.play();
            run(system, STEP);
            expect(system.particleNum).toBe(0);
        });
    });

    describe('behavior reset', () => {
        it('resets behaviors on restart, not on every loop', () => {
            const system = makeSystem({looping: true, duration: 0.1});
            const noise = new Noise(new ConstantValue(1), new ConstantValue(1), new ConstantValue(0.1));
            system.addBehavior(noise);
            const reset = jest.spyOn(noise, 'reset');
            run(system, 0.5);
            expect(reset).not.toHaveBeenCalled();
            system.restart();
            expect(reset).toHaveBeenCalledTimes(1);
        });

        it('EmitSubParticleSystem.reset drops the running emissions', () => {
            const child = makeSystem({onlyUsedByOther: true, duration: 1, emissionOverTime: new ConstantValue(60)});
            const parent = makeSystem({startLife: new ConstantValue(1)});
            const behavior = new EmitSubParticleSystem(parent, false, child.emitter, SubParticleEmitMode.Frame, 1);
            parent.addBehavior(behavior);
            run(parent, 0.1);
            const running = (): number => (behavior as unknown as {subEmissions: unknown[]}).subEmissions.length;
            expect(running()).toBeGreaterThan(0);
            (behavior as Behavior).reset();
            expect(running()).toBe(0);
        });
    });

    describe('timeDilation', () => {
        it('scales the simulated time on top of playbackSpeed and is never saved or cloned', () => {
            const a = makeSystem({looping: true, duration: 10, emissionBursts: []});
            const b = makeSystem({looping: true, duration: 10, emissionBursts: []});
            b.playbackSpeed = 2;
            b.timeDilation = 0.25;
            run(a, 0.5);
            run(b, 1);
            expect(b.emissionState.time).toBeCloseTo(a.emissionState.time, 5);
            expect(b.clone().timeDilation).toBe(1);
            expect(JSON.stringify(b.toJSON())).not.toContain('timeDilation');
        });

        it('reads negative, NaN and infinite values as 0', () => {
            const system = makeSystem();
            for (const value of [-1, NaN, Infinity]) {
                system.timeDilation = value;
                expect(system.timeDilation).toBe(0);
            }
            system.timeDilation = 0.5;
            expect(system.timeDilation).toBe(0.5);
        });
    });

    describe('ParticleEmitter.toJSON', () => {
        it('writes the emitter its own enabled flag, not the one inherited from a disabled parent', () => {
            const parent = new TransformNode('disabled', scene);
            parent.setEnabled(false);
            const system = makeSystem();
            const emitter = system.emitter as ParticleEmitter;
            emitter.parent = parent;
            expect(emitter.toJSON().visible).toBe(true);
            emitter.setEnabled(false);
            expect(emitter.toJSON().visible).toBe(false);
        });
    });

    describe('MeshSurfaceEmitter on a mesh without indices', () => {
        function triangleList(): Mesh {
            const mesh = new Mesh('soup', scene);
            const data = new VertexData();
            // Two triangles in the z = 0 plane, x in [0, 2]; a stray eighth vertex is no triangle.
            data.positions = [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 2, 0, 0, 1, 1, 0, 9, 9, 9];
            data.applyToMesh(mesh);
            mesh.setIndices([]);
            return mesh;
        }

        it('reads the positions as a triangle list and samples its surface', () => {
            const mesh = triangleList();
            expect(mesh.getIndices()?.length ?? 0).toBe(0);
            const shape = new MeshSurfaceEmitter(mesh);
            const particle = new SpriteParticle();
            particle.startSpeed = 1;
            let right = 0;
            for (let i = 0; i < 400; i++) {
                shape.initialize(particle);
                expect(particle.position.z).toBeCloseTo(0, 6);
                expect(particle.position.x).toBeGreaterThanOrEqual(-1e-6);
                expect(particle.position.x).toBeLessThanOrEqual(2 + 1e-6);
                expect(particle.position.y).toBeLessThanOrEqual(1 + 1e-6);
                if (particle.position.x > 1) right++;
                expect(Math.abs(particle.velocity.z)).toBeCloseTo(1, 6);
            }
            // Both triangles are sampled.
            expect(right).toBeGreaterThan(0);
        });

        it('emits from the origin for a mesh with fewer than three vertices', () => {
            const mesh = new Mesh('point', scene);
            const data = new VertexData();
            data.positions = [5, 5, 5, 6, 6, 6];
            data.applyToMesh(mesh);
            const shape = new MeshSurfaceEmitter(mesh);
            const particle = new SpriteParticle();
            particle.startSpeed = 2;
            shape.initialize(particle);
            expect(particle.position.length()).toBe(0);
            expect(particle.velocity.z).toBe(2);
        });
    });

    describe('QuarksUtil.instantiate with meshes', () => {
        function meshEffect(): {root: TransformNode; mesh: Mesh; system: ParticleSystem} {
            const root = new TransformNode('fx', scene);
            const mesh = MeshBuilder.CreateBox('surface', {size: 2}, scene);
            mesh.material = new StandardMaterial('surface-material', scene);
            mesh.position.set(0, 1, 0);
            mesh.parent = root;
            const system = makeSystem({shape: new MeshSurfaceEmitter(mesh)});
            system.emitter.parent = root;
            retainEffectResources(root, [], [mesh.material]);
            return {root, mesh, system};
        }

        it('copies a mesh as a mesh sharing its geometry, and relinks the surface shape to it', () => {
            const {root, mesh} = meshEffect();
            const copy = QuarksUtil.instantiate(root);
            const meshCopy = copy.getChildren().find((node) => node instanceof Mesh) as Mesh;
            expect(meshCopy).toBeDefined();
            expect(meshCopy).not.toBe(mesh);
            expect(meshCopy.geometry).toBe(mesh.geometry);
            expect(meshCopy.material).toBe(mesh.material);
            expect(meshCopy.position.y).toBe(1);
            let shape: MeshSurfaceEmitter | undefined;
            QuarksUtil.runOnAllParticleEmitters(copy, (emitter) => {
                shape = (emitter.system as unknown as ParticleSystem).emitterShape as MeshSurfaceEmitter;
            });
            expect(shape!.mesh).toBe(meshCopy);
        });

        it('keeps the copy whole after the source is disposed, and frees the material with the last holder', () => {
            const {root, mesh} = meshEffect();
            const material = mesh.material!;
            const copy = QuarksUtil.instantiate(root);
            const meshCopy = copy.getChildren().find((node) => node instanceof Mesh) as Mesh;
            disposeEffect(root);
            expect(meshCopy.isDisposed()).toBe(false);
            expect(meshCopy.geometry).not.toBeNull();
            expect(scene.materials).toContain(material);
            disposeEffect(copy);
            expect(scene.materials).not.toContain(material);
        });

        it('keeps a shape pointing at a mesh outside the copied tree', () => {
            const outside = MeshBuilder.CreateBox('outside', {size: 1}, scene);
            const root = new TransformNode('fx', scene);
            const system = makeSystem({shape: new MeshSurfaceEmitter(outside)});
            system.emitter.parent = root;
            const copy = QuarksUtil.instantiate(root);
            QuarksUtil.runOnAllParticleEmitters(copy, (emitter) => {
                const shape = (emitter.system as unknown as ParticleSystem).emitterShape as MeshSurfaceEmitter;
                expect(shape.mesh).toBe(outside);
            });
        });
    });

    describe('EffectPool placement and outside disposal', () => {
        function poolEffect(): TransformNode {
            const root = new TransformNode('fx', scene);
            root.rotation.set(0, 0.5, 0);
            root.scaling.set(2, 2, 2);
            const system = makeSystem({looping: true, emissionBursts: [], emissionOverTime: new ConstantValue(30)});
            system.emitter.parent = root;
            root.setEnabled(false);
            return root;
        }

        it('puts the template transform back on every acquire', () => {
            const renderer = new BatchedRenderer('r', scene);
            const pool = new EffectPool(poolEffect(), {renderer});
            const copy = pool.acquire({
                position: new BVector3(1, 2, 3),
                rotationQuaternion: BQuaternion.RotationAxis(BVector3.Up(), 1),
                scaling: new BVector3(5, 5, 5),
            })!;
            expect(copy.rotationQuaternion).not.toBeNull();
            expect(copy.scaling.x).toBe(5);
            pool.release(copy);

            const again = pool.acquire()!;
            expect(again).toBe(copy);
            expect(again.position.asArray()).toEqual([0, 0, 0]);
            expect(again.rotationQuaternion).toBeNull();
            expect(again.rotation.y).toBe(0.5);
            expect(again.scaling.asArray()).toEqual([2, 2, 2]);
            pool.dispose();
            renderer.dispose();
        });

        it('takes Euler rotation and a parent from a placement', () => {
            const renderer = new BatchedRenderer('r', scene);
            const pool = new EffectPool(poolEffect(), {renderer});
            const anchor = new TransformNode('anchor', scene);
            const copy = pool.acquire({rotation: new BVector3(0, 0, 1), parent: anchor})!;
            expect(copy.parent).toBe(anchor);
            expect(copy.rotation.asArray()).toEqual([0, 0, 1]);
            // The position form keeps its parent argument; it is ignored with a placement object.
            pool.release(copy);
            const positioned = pool.acquire(new BVector3(1, 0, 0), anchor)!;
            expect(positioned.parent).toBe(anchor);
            expect(positioned.position.x).toBe(1);
            pool.dispose();
            renderer.dispose();
        });

        it('never hands out a copy disposed from outside', () => {
            const renderer = new BatchedRenderer('r', scene);
            const pool = new EffectPool(poolEffect(), {renderer, prewarm: 1, maxSize: 1});
            const copy = pool.acquire()!;
            pool.release(copy);
            copy.dispose();
            expect(pool.idleCount).toBe(0);
            const fresh = pool.acquire()!;
            expect(fresh).not.toBe(copy);
            expect(fresh.isDisposed()).toBe(false);
            expect(pool.activeCount).toBe(1);
            pool.dispose();
            renderer.dispose();
        });

        it('lets go of a playing copy disposed with the parent it was placed under', () => {
            const renderer = new BatchedRenderer('r', scene);
            const pool = new EffectPool(poolEffect(), {renderer, maxSize: 1});
            const anchor = new TransformNode('anchor', scene);
            const copy = pool.acquire(undefined, anchor)!;
            for (let i = 0; i < 5; i++) renderer.update(STEP);
            anchor.dispose();
            expect(copy.isDisposed()).toBe(true);
            expect(pool.activeCount).toBe(0);
            // Releasing it now is harmless, and the pool has room for a new one.
            pool.release(copy);
            pool.stop(copy);
            expect(pool.acquire()).not.toBeNull();
            pool.dispose();
            renderer.dispose();
        });
    });

    describe('QuarksPrefab timeline', () => {
        function emitterSystem(
            parameters: Partial<ConstructorParameters<typeof ParticleSystem>[0]> = {}
        ): ParticleSystem {
            return makeSystem({
                looping: true,
                duration: 1,
                emissionBursts: [],
                emissionOverTime: new ConstantValue(60),
                startLife: new ConstantValue(0.5),
                ...parameters,
            });
        }

        it('plays a window a single update stepped over, then ends its emission', () => {
            const burst = makeSystem({looping: true, duration: 1});
            const prefab = new QuarksPrefab('skip', scene);
            prefab.addParticleSystemAnimation(burst.emitter as ParticleEmitter, 0.1, 0.05);
            prefab.addClipAnimation(new TransformNode('t', scene), {play: jest.fn(), stop: jest.fn()}, 0, 1);
            const clip = {play: jest.fn(), stop: jest.fn()};
            prefab.addClipAnimation(new TransformNode('c', scene), clip, 0.2, 0.01);
            prefab.play();
            prefab.update(0.5);
            expect(clip.play).toHaveBeenCalledTimes(1);
            expect(clip.stop).toHaveBeenCalledTimes(1);
            burst.update(STEP);
            expect(burst.particleNum).toBe(4);
            expect(burst.isEmitEnded).toBe(false);
            prefab.update(0.01);
            expect(burst.isEmitEnded).toBe(true);
        });

        it('ends emission at the end of the timeline and lets particles die out, then replays', () => {
            const system = emitterSystem();
            const prefab = new QuarksPrefab('end', scene);
            const clip = {play: jest.fn(), stop: jest.fn(), pause: jest.fn()};
            prefab.addParticleSystemAnimation(system.emitter as ParticleEmitter, 0, 1);
            prefab.addClipAnimation(new TransformNode('t', scene), clip, 0, 1, true);
            prefab.play();
            prefab.update(0.01);
            run(system, 0.3);
            const alive = system.particleNum;
            expect(alive).toBeGreaterThan(0);
            prefab.update(2);
            expect(prefab.isPlaying).toBe(false);
            expect(prefab.currentTime).toBeLessThan(0);
            expect(system.isEmitEnded).toBe(true);
            expect(system.particleNum).toBe(alive);
            // A looping clip stops at the end instead of starting over.
            expect(clip.stop).toHaveBeenCalledTimes(1);
            expect(clip.play).toHaveBeenCalledTimes(1);
            run(system, 1);
            expect(system.isFinished()).toBe(true);

            prefab.play();
            prefab.update(0.01);
            expect(system.isEmitEnded).toBe(false);
            expect(clip.play).toHaveBeenCalledTimes(2);
        });

        it('treats the end of a window the same way in update and setTime', () => {
            const system = emitterSystem();
            const prefab = new QuarksPrefab('edges', scene);
            prefab.addParticleSystemAnimation(system.emitter as ParticleEmitter, 0, 0.5);
            prefab.addClipAnimation(new TransformNode('t', scene), {}, 0, 2);
            prefab.setTime(0.25);
            expect(system.isEmitEnded).toBe(false);
            prefab.setTime(0.5);
            expect(system.isEmitEnded).toBe(true);

            prefab.setTime(-1);
            prefab.play();
            prefab.update(1.25);
            prefab.update(0.25);
            expect(prefab.currentTime).toBeCloseTo(0.5, 9);
            expect(system.isEmitEnded).toBe(true);
        });

        it('does not pause itself when a track is added', () => {
            const prefab = new QuarksPrefab('add', scene);
            prefab.play();
            prefab.addParticleSystemAnimation(emitterSystem().emitter as ParticleEmitter, 0, 1);
            expect(prefab.isPlaying).toBe(true);
        });

        it('does not replay a finished system when resumed', () => {
            const system = makeSystem();
            const prefab = new QuarksPrefab('resume', scene);
            prefab.addParticleSystemAnimation(system.emitter as ParticleEmitter, 0, 2);
            prefab.play();
            prefab.update(0.01);
            run(system, 1);
            expect(system.isFinished()).toBe(true);
            prefab.pause();
            prefab.play();
            run(system, STEP);
            expect(system.particleNum).toBe(0);
        });

        it('passes timeScale to its systems as time dilation and normalises it', () => {
            const system = emitterSystem();
            const prefab = new QuarksPrefab('scale', scene);
            prefab.timeScale = 0.5;
            prefab.addParticleSystemAnimation(system.emitter as ParticleEmitter, 0, 1);
            expect(system.timeDilation).toBe(0.5);
            prefab.timeScale = 2;
            expect(system.timeDilation).toBe(2);
            expect(system.playbackSpeed).toBe(1);
            prefab.play();
            prefab.update(0.1);
            expect(prefab.currentTime).toBeCloseTo(0.2, 4);
            prefab.timeScale = NaN;
            expect(prefab.timeScale).toBe(0);
            prefab.removeAnimation(0);
            expect(system.timeDilation).toBe(1);
        });

        it('advances with the scene when autoUpdate is on, by the engine frame time', () => {
            const prefab = new QuarksPrefab('auto', scene);
            prefab.addClipAnimation(new TransformNode('t', scene), {}, 0, 10);
            jest.spyOn(engine, 'getDeltaTime').mockReturnValue(100);
            prefab.play();
            prefab.autoUpdate = true;
            prefab.autoUpdate = true;
            expect(prefab.autoUpdate).toBe(true);
            scene.onBeforeRenderObservable.notifyObservers(scene);
            expect(prefab.currentTime).toBeCloseTo(0.1, 4);
            prefab.autoUpdate = false;
            scene.onBeforeRenderObservable.notifyObservers(scene);
            expect(prefab.currentTime).toBeCloseTo(0.1, 4);

            prefab.autoUpdate = true;
            prefab.dispose();
            expect(prefab.autoUpdate).toBe(false);
            expect(scene.onBeforeRenderObservable.hasObservers()).toBe(false);
        });

        it('stop clears what a stepped-over window left pending', () => {
            const burst = makeSystem({looping: true, duration: 1});
            const prefab = new QuarksPrefab('pending', scene);
            prefab.addParticleSystemAnimation(burst.emitter as ParticleEmitter, 0.1, 0.05);
            prefab.addClipAnimation(new TransformNode('t', scene), {}, 0, 1);
            prefab.play();
            prefab.update(0.5);
            prefab.stop();
            prefab.update(0.01);
            expect(burst.isEmitEnded).toBe(false);
        });
    });

    describe('review follow-ups', () => {
        function looping(parameters: Partial<ConstructorParameters<typeof ParticleSystem>[0]> = {}): ParticleSystem {
            return makeSystem({
                looping: true,
                duration: 1,
                emissionBursts: [],
                emissionOverTime: new ConstantValue(60),
                startLife: new ConstantValue(0.5),
                ...parameters,
            });
        }

        it('resume() and QuarksUtil.resume leave a finished system finished; QuarksUtil.play replays it', () => {
            const root = new TransformNode('fx', scene);
            const short = makeSystem();
            const long = looping();
            short.emitter.parent = root;
            long.emitter.parent = root;
            for (let i = 0; i < 60; i++) {
                short.update(STEP);
                long.update(STEP);
            }
            expect(short.isFinished()).toBe(true);
            QuarksUtil.pause(root);
            QuarksUtil.resume(root);
            short.update(STEP);
            expect(short.particleNum).toBe(0);
            expect(long.paused).toBe(false);
            QuarksUtil.play(root);
            short.update(STEP);
            expect(short.particleNum).toBe(4);
            short.dispose();
            short.resume();
            expect(short.paused).toBe(false);
        });

        it('copies an instance of a mesh in the tree as an instance of its copy', () => {
            const root = new TransformNode('fx', scene);
            const box = MeshBuilder.CreateBox('box', {size: 1}, scene);
            box.parent = root;
            const instance = box.createInstance('instance');
            instance.parent = root;
            const system = makeSystem();
            system.emitter.parent = instance;
            const copy = QuarksUtil.instantiate(root);
            const copiedInstance = copy.getChildren().find((node) => node instanceof InstancedMesh) as InstancedMesh;
            expect(copiedInstance.sourceMesh).not.toBe(box);
            expect(copy.getChildren()).toContain(copiedInstance.sourceMesh);
            disposeEffect(root);
            expect(copiedInstance.isDisposed()).toBe(false);
            let emitters = 0;
            QuarksUtil.runOnAllParticleEmitters(copy, () => emitters++);
            expect(emitters).toBe(1);
        });

        it('keeps an instance of a mesh outside the tree on that mesh', () => {
            const outside = MeshBuilder.CreateBox('outside', {size: 1}, scene);
            const root = new TransformNode('fx', scene);
            const instance = outside.createInstance('instance');
            instance.parent = root;
            const copy = QuarksUtil.instantiate(root);
            const copiedInstance = copy.getChildren().find((node) => node instanceof InstancedMesh) as InstancedMesh;
            expect(copiedInstance.sourceMesh).toBe(outside);
        });

        it('ends a looping track restarted before the end of the timeline when the timeline ends', () => {
            const a = looping();
            const b = looping();
            const prefab = new QuarksPrefab('loops', scene);
            prefab.addParticleSystemAnimation(a.emitter as ParticleEmitter, 0, 0.5, true);
            prefab.addParticleSystemAnimation(b.emitter as ParticleEmitter, 0, 2);
            prefab.play();
            for (let i = 0; i < 200 && prefab.isPlaying; i++) prefab.update(STEP);
            expect(prefab.isPlaying).toBe(false);
            expect(a.isEmitEnded).toBe(true);
            expect(b.isEmitEnded).toBe(true);
        });

        it('resumes a system dying out after its window when the prefab is paused and played', () => {
            const a = looping({startLife: new ConstantValue(2)});
            const prefab = new QuarksPrefab('dying', scene);
            prefab.addParticleSystemAnimation(a.emitter as ParticleEmitter, 0, 0.3);
            prefab.addClipAnimation(new TransformNode('t', scene), {}, 0, 3);
            prefab.play();
            for (let i = 0; i < 30; i++) {
                prefab.update(STEP);
                a.update(STEP);
            }
            expect(a.isEmitEnded).toBe(true);
            prefab.pause();
            expect(a.paused).toBe(true);
            prefab.play();
            expect(a.paused).toBe(false);
        });

        it('setTime on a paused prefab leaves the system it starts paused until play', () => {
            const a = looping();
            const prefab = new QuarksPrefab('scrub', scene);
            prefab.addParticleSystemAnimation(a.emitter as ParticleEmitter, 0.5, 1);
            prefab.setTime(0.75);
            expect(a.paused).toBe(true);
            prefab.play();
            expect(a.paused).toBe(false);
        });

        it('removing a track ends an emission still due, and keeps the dilation of a system on another track', () => {
            const burst = looping();
            const prefab = new QuarksPrefab('remove', scene);
            prefab.timeScale = 0.5;
            prefab.addParticleSystemAnimation(burst.emitter as ParticleEmitter, 0.1, 0.05);
            prefab.addParticleSystemAnimation(burst.emitter as ParticleEmitter, 2, 0.5);
            prefab.play();
            prefab.update(1);
            prefab.removeAnimation(0);
            expect(burst.timeDilation).toBe(0.5);
            prefab.removeAnimation(0);
            expect(burst.timeDilation).toBe(1);
            expect(burst.isEmitEnded).toBe(true);
        });

        it('ends a window stepped over on the last frame after the next render, without another update', () => {
            const burst = looping();
            const prefab = new QuarksPrefab('last', scene);
            prefab.addParticleSystemAnimation(burst.emitter as ParticleEmitter, 0.1, 0.01);
            prefab.play();
            prefab.update(1);
            expect(prefab.isPlaying).toBe(false);
            scene.onAfterRenderObservable.notifyObservers(scene);
            expect(burst.isEmitEnded).toBe(false);
            burst.update(STEP);
            expect(burst.particleNum).toBeGreaterThan(0);
            scene.onAfterRenderObservable.notifyObservers(scene);
            expect(burst.isEmitEnded).toBe(true);
            expect(scene.onAfterRenderObservable.hasObservers()).toBe(false);
        });

        it('ends a pending emission when disposed', () => {
            const burst = looping();
            const prefab = new QuarksPrefab('dispose', scene);
            prefab.addParticleSystemAnimation(burst.emitter as ParticleEmitter, 0.1, 0.01);
            prefab.addClipAnimation(new TransformNode('t', scene), {}, 0, 1);
            prefab.play();
            prefab.update(0.5);
            prefab.dispose();
            expect(burst.isEmitEnded).toBe(true);
        });

        it('acquire takes a position from any vector with x, y and z', () => {
            const renderer = new BatchedRenderer('r', scene);
            const root = new TransformNode('fx', scene);
            looping().emitter.parent = root;
            const pool = new EffectPool(root, {renderer});
            const copy = pool.acquire({x: 3, y: 2, z: 1} as unknown as BVector3)!;
            expect(copy.position.asArray()).toEqual([3, 2, 1]);
            pool.dispose();
            renderer.dispose();
        });
    });
});
