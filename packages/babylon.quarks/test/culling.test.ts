import {FreeCamera} from '@babylonjs/core/Cameras/freeCamera';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Frustum} from '@babylonjs/core/Maths/math.frustum';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {Scene} from '@babylonjs/core/scene';
import {ConstantValue, PointEmitter, Vector3} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import {RenderMode} from '../src/VFXBatch';

/**
 * Bounds and visibility: each system measures its particles, the renderer
 * pauses systems no camera sees (when they ask for it), and the batch meshes
 * carry real bounds so Babylon can skip their draw.
 */
describe('visibility culling', () => {
    let engine: NullEngine;
    let scene: Scene;
    let camera: FreeCamera;
    const STEP = 1 / 60;

    beforeEach(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
        camera = new FreeCamera('cam', new BVector3(0, 0, -10), scene);
        lookAt(0, 0, 0);
    });

    afterEach(() => {
        engine.dispose();
    });

    function lookAt(x: number, y: number, z: number): void {
        camera.setTarget(new BVector3(x, y, z));
    }

    function makeSystem(parameters: Partial<ConstructorParameters<typeof ParticleSystem>[0]> = {}): ParticleSystem {
        return new ParticleSystem({
            scene,
            emissionOverTime: new ConstantValue(60),
            startLife: new ConstantValue(10),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(0.2),
            shape: new PointEmitter(),
            renderMode: RenderMode.BillBoard,
            texture: null,
            ...parameters,
        });
    }

    function oneParticle(parameters: Partial<ConstructorParameters<typeof ParticleSystem>[0]> = {}): ParticleSystem {
        return makeSystem({
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
            ...parameters,
        });
    }

    function frames(renderer: BatchedRenderer, count: number): void {
        for (let i = 0; i < count; i++) {
            renderer.update(STEP);
        }
    }

    it('measures world bounds from the store, through the emitter transform', () => {
        const min = new Vector3();
        const max = new Vector3();
        const local = makeSystem();
        expect(local.getWorldBounds(min, max)).toBe(false);
        local.emitter.position.set(5, 0, 0);
        local.update(STEP);
        local.update(STEP);
        expect(local.getWorldBounds(min, max)).toBe(true);
        // Half a quad's diagonal of padding around the one point every particle sits at.
        expect(min.x).toBeCloseTo(5 - 0.15, 5);
        expect(max.x).toBeCloseTo(5 + 0.15, 5);
        expect(min.y).toBeCloseTo(-0.15, 5);
        expect(max.z).toBeCloseTo(0.15, 5);

        const world = makeSystem({worldSpace: true});
        world.emitter.position.set(0, 3, 0);
        world.update(STEP);
        world.update(STEP);
        expect(world.getWorldBounds(min, max)).toBe(true);
        expect(min.y).toBeCloseTo(3 - 0.15, 5);
        expect(max.y).toBeCloseTo(3 + 0.15, 5);

        // The emitter's scale reaches the padding too.
        local.emitter.scaling.set(2, 2, 2);
        local.emitter.computeWorldMatrix(true);
        expect(local.getWorldBounds(min, max)).toBe(true);
        expect(min.x).toBeCloseTo(5 - 0.3, 5);
        expect(max.x).toBeCloseTo(5 + 0.3, 5);
    });

    it('gives the batch mesh real bounds, so Babylon culls the draw', () => {
        const renderer = new BatchedRenderer('r', scene);
        const system = makeSystem();
        renderer.addSystem(system);
        const mesh = renderer.batches[0].mesh;
        expect(mesh.alwaysSelectAsActiveMesh).toBe(true);
        frames(renderer, 2);
        expect(mesh.alwaysSelectAsActiveMesh).toBe(false);
        const box = mesh.getBoundingInfo().boundingBox;
        expect(box.minimumWorld.x).toBeCloseTo(-0.15, 5);
        expect(box.maximumWorld.x).toBeCloseTo(0.15, 5);

        const planes = () => {
            camera.getViewMatrix(true);
            camera.getProjectionMatrix(true);
            return Frustum.GetPlanes(camera.getTransformationMatrix());
        };
        expect(mesh.isInFrustum(planes())).toBe(true);
        lookAt(0, 0, -20);
        expect(mesh.isInFrustum(planes())).toBe(false);
        renderer.dispose();
    });

    it("'pause' freezes a system no camera sees and resumes it in view", () => {
        const renderer = new BatchedRenderer('r', scene);
        const system = oneParticle({cullingMode: 'pause'});
        renderer.addSystem(system);
        frames(renderer, 5);
        const particle = system.particles[0];
        expect(particle.age).toBeCloseTo(5 * STEP, 6);
        expect(renderer.batches[0].mesh.forcedInstanceCount).toBe(1);

        lookAt(0, 0, -20);
        frames(renderer, 10);
        expect(system.culled).toBe(true);
        expect(particle.age).toBeCloseTo(5 * STEP, 6);
        // Culled particles are not filled in either.
        expect(renderer.batches[0].mesh.forcedInstanceCount).toBe(0);

        lookAt(0, 0, 0);
        frames(renderer, 1);
        expect(system.culled).toBe(false);
        expect(particle.age).toBeCloseTo(6 * STEP, 6);
        expect(renderer.batches[0].mesh.forcedInstanceCount).toBe(1);
        renderer.dispose();
    });

    it("counts only cameras that render the system's layer", () => {
        const renderer = new BatchedRenderer('r', scene);
        const system = oneParticle({cullingMode: 'pause', layerMask: 0x10000000});
        renderer.addSystem(system);
        frames(renderer, 2);
        // The camera looks at it, but its default mask does not take the system's layer.
        expect(camera.layerMask & 0x10000000).toBe(0);
        expect(system.culled).toBe(true);
        camera.layerMask = 0x10000000;
        frames(renderer, 1);
        expect(system.culled).toBe(false);
        renderer.dispose();
    });

    it('is seen when any of several active cameras sees it, and reuses its planes', () => {
        const renderer = new BatchedRenderer('r', scene);
        const system = oneParticle({cullingMode: 'pause'});
        renderer.addSystem(system);
        const away = new FreeCamera('away', new BVector3(0, 0, -10), scene);
        away.setTarget(new BVector3(0, 0, -20));
        scene.activeCameras = [away];
        frames(renderer, 2);
        expect(system.culled).toBe(true);
        scene.activeCameras = [away, camera];
        frames(renderer, 1);
        const planes = (renderer as unknown as {cameraPlanes: unknown[][]}).cameraPlanes;
        const second = planes[1];
        expect(system.culled).toBe(false);
        frames(renderer, 1);
        expect(planes[1]).toBe(second);
        scene.activeCameras = [away];
        frames(renderer, 1);
        expect(system.culled).toBe(true);
        renderer.dispose();
    });

    it("'pauseAndCatchUp' replays the missed time, within the catch-up budget", () => {
        const renderer = new BatchedRenderer('r', scene);
        renderer.catchUpBudgetMs = Infinity;
        const system = oneParticle({cullingMode: 'pauseAndCatchUp'});
        renderer.addSystem(system);
        frames(renderer, 5);
        const particle = system.particles[0];

        lookAt(0, 0, -20);
        frames(renderer, 12);
        expect(particle.age).toBeCloseTo(5 * STEP, 6);

        lookAt(0, 0, 0);
        frames(renderer, 1);
        expect(particle.age).toBeCloseTo(18 * STEP, 6);

        // A zero budget still runs one missed step and drops the rest.
        renderer.catchUpBudgetMs = 0;
        lookAt(0, 0, -20);
        frames(renderer, 12);
        lookAt(0, 0, 0);
        frames(renderer, 1);
        expect(particle.age).toBeCloseTo(20 * STEP, 6);
        renderer.dispose();
    });

    it("never culls an 'always' system, a sub emitter target, or with culling disabled", () => {
        const renderer = new BatchedRenderer('r', scene);
        const always = oneParticle();
        const target = oneParticle({cullingMode: 'pause', onlyUsedByOther: true});
        const paused = oneParticle({cullingMode: 'pause'});
        renderer.addSystem(always);
        renderer.addSystem(target);
        renderer.addSystem(paused);
        frames(renderer, 2);
        lookAt(0, 0, -20);
        frames(renderer, 3);
        expect(always.culled).toBe(false);
        expect(always.particles[0].age).toBeCloseTo(5 * STEP, 6);
        expect(target.culled).toBe(false);
        expect(paused.culled).toBe(true);

        renderer.cullingEnabled = false;
        frames(renderer, 1);
        expect(paused.culled).toBe(false);
        renderer.dispose();
    });

    it('never culls an empty system, so it can start emitting off screen', () => {
        const renderer = new BatchedRenderer('r', scene);
        const system = makeSystem({cullingMode: 'pause'});
        renderer.addSystem(system);
        lookAt(0, 0, -20);
        frames(renderer, 1);
        expect(system.culled).toBe(false);
        expect(system.particleNum).toBeGreaterThan(0);
        frames(renderer, 1);
        expect(system.culled).toBe(true);
        renderer.dispose();
    });

    it('runs one step and drops the rest of a long frame past the simulation budget', () => {
        const renderer = new BatchedRenderer('r', scene);
        const system = oneParticle();
        renderer.addSystem(system);
        frames(renderer, 1);
        const particle = system.particles[0];

        renderer.update(0.1);
        expect(particle.age).toBeCloseTo(7 * STEP, 6);

        renderer.simulationBudgetMs = 0;
        renderer.update(0.1);
        expect(particle.age).toBeCloseTo(8 * STEP, 6);
        // The dropped time is consumed, not carried into the next frame.
        expect(Math.abs(system.simulationResidual)).toBeLessThan(STEP / 2);
        renderer.dispose();
    });

    it('measures a trail from the ribbon it draws', () => {
        const renderer = new BatchedRenderer('r', scene);
        const system = oneParticle({
            renderMode: RenderMode.Trail,
            startSpeed: new ConstantValue(6),
            rendererEmitterSettings: {startLength: new ConstantValue(30), followLocalOrigin: false},
        });
        renderer.addSystem(system);
        frames(renderer, 10);
        const min = new Vector3();
        const max = new Vector3();
        expect(system.getWorldBounds(min, max)).toBe(true);
        const head = system.particles[0].position;
        // The ribbon runs from near the emitter to the head.
        expect(min.z).toBeLessThanOrEqual(0.2);
        expect(max.z).toBeGreaterThanOrEqual(head.z - 0.2);
        expect(renderer.batches[0].mesh.alwaysSelectAsActiveMesh).toBe(false);
        renderer.dispose();
    });

    it('round-trips the culling mode through JSON only when set', () => {
        expect(makeSystem().toJSON().cullingMode).toBeUndefined();
        const json = makeSystem({cullingMode: 'pauseAndCatchUp'}).toJSON();
        expect(json.cullingMode).toBe('pauseAndCatchUp');
        const loaded = ParticleSystem.fromJSON(json, {textures: {}, materials: {}, geometries: {}}, {}, scene);
        expect(loaded.cullingMode).toBe('pauseAndCatchUp');
        expect(loaded.clone().cullingMode).toBe('pauseAndCatchUp');
        json.cullingMode = 'nonsense' as never;
        expect(
            ParticleSystem.fromJSON(json, {textures: {}, materials: {}, geometries: {}}, {}, scene).cullingMode
        ).toBe('always');
    });
});
