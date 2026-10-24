import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, IntervalValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import {SpriteBatch} from '../src/SpriteBatch';
import {normalizeBurst} from '../src/system/normalize';
import {RenderMode} from '../src/VFXBatch';

/**
 * The lifecycle and settings traps the audit found on `ParticleSystem` and `BatchedRenderer`:
 * setters that unpaused a stopped system, a mesh without normals after a render-mode switch, stale
 * indices after a geometry switch, an unnormalised emission clock and multiplier, bursts that
 * differed between code and file, and a system drawn by two renderers.
 */
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

const STEP = 1 / 60;

function system(parameters: Partial<ConstructorParameters<typeof ParticleSystem>[0]> = {}): ParticleSystem {
    return new ParticleSystem({
        scene,
        duration: 2,
        looping: true,
        worldSpace: false,
        startLife: new ConstantValue(1),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(60),
        emissionBursts: [],
        shape: new PointEmitter(),
        ...parameters,
    });
}

function run(ps: ParticleSystem, seconds: number): void {
    for (let t = 0; t < seconds - 1e-9; t += STEP) {
        ps.update(STEP);
    }
}

describe('settings that rebuild the particles keep the pause', () => {
    it('renderMode keeps a stopped system stopped', () => {
        const ps = system();
        run(ps, 0.5);
        ps.stop();
        ps.renderMode = RenderMode.Trail;
        expect(ps.paused).toBe(true);
        ps.renderMode = RenderMode.BillBoard;
        expect(ps.paused).toBe(true);
        run(ps, 0.5);
        expect(ps.particleNum).toBe(0);
    });

    it('instancingGeometry keeps a paused system paused and a playing one playing', () => {
        const paused = system({renderMode: RenderMode.Mesh});
        paused.pause();
        paused.instancingGeometry = new Float32Array(9);
        expect(paused.paused).toBe(true);
        const playing = system({renderMode: RenderMode.Mesh});
        playing.instancingGeometry = new Float32Array(9);
        expect(playing.paused).toBe(false);
    });
});

describe('mesh render mode defaults', () => {
    it('gives a system switched to Mesh at runtime its normals', () => {
        const ps = system();
        expect(ps.getRendererSettings().instancingNormals).toBeUndefined();
        ps.renderMode = RenderMode.Mesh;
        const normals = ps.getRendererSettings().instancingNormals;
        expect(normals).toBeDefined();
        expect(normals!.length).toBe(ps.instancingGeometry.length);
    });

    it('replaces the indices with the new geometry when the old ones no longer fit', () => {
        const ps = system({renderMode: RenderMode.Mesh});
        // The default quad: 4 vertices, 6 indices.
        expect(ps.instancingIndices.length).toBe(6);
        ps.instancingGeometry = new Float32Array(24 * 3);
        expect(ps.instancingIndices.length).toBe(24);
        expect(Array.from(ps.instancingIndices.slice(0, 4))).toEqual([0, 1, 2, 3]);
        expect(ps.getRendererSettings().instancingNormals!.length).toBe(24 * 3);
    });

    it('keeps indices for a geometry with the same vertex count', () => {
        const ps = system({renderMode: RenderMode.Mesh});
        ps.instancingIndices = new Uint32Array([0, 1, 2]);
        ps.instancingGeometry = new Float32Array(4 * 3);
        expect(Array.from(ps.instancingIndices)).toEqual([0, 1, 2]);
        ps.instancingIndices = new Uint32Array([0, 1, 9]);
        ps.instancingGeometry = new Float32Array(4 * 3);
        expect(Array.from(ps.instancingIndices)).toEqual([0, 1, 2, 3]);
    });
});

describe('clear()', () => {
    it('removes the particles and leaves the clock and the pause where they were', () => {
        const ps = system();
        run(ps, 0.5);
        expect(ps.particleNum).toBeGreaterThan(0);
        const time = ps.time;
        ps.pause();
        ps.clear();
        expect(ps.particleNum).toBe(0);
        expect(ps.time).toBe(time);
        expect(ps.paused).toBe(true);
        ps.play();
        run(ps, 0.1);
        expect(ps.particleNum).toBeGreaterThan(0);
    });
});

describe('the emission clock', () => {
    const burstSystem = () =>
        system({
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 1, count: new ConstantValue(5), cycle: 1, interval: 0, probability: 1}],
        });

    it('does not fire a burst the clock was set past', () => {
        const ps = burstSystem();
        ps.time = 1.5;
        run(ps, 0.4);
        expect(ps.particleNum).toBe(0);
    });

    it('fires a burst the clock was set before', () => {
        const ps = burstSystem();
        ps.time = 1.5;
        run(ps, 0.4);
        ps.time = 0.9;
        run(ps, 0.2);
        expect(ps.particleNum).toBe(5);
    });

    it('normalises what it is set to', () => {
        const ps = system();
        ps.time = NaN;
        expect(ps.time).toBe(0);
        ps.time = -3;
        expect(ps.time).toBe(0);
        ps.time = 5;
        expect(ps.time).toBe(1);
        const once = system({looping: false});
        once.time = 5;
        expect(once.time).toBe(2);
        ps.time = 1.5;
        run(ps, 0.1);
        expect(ps.time).toBeCloseTo(1.6, 5);
    });

    it('counts the waves of a burst in progress the way emission fires them', () => {
        // 0.6 + 3 * 0.1 rounds to just over 0.9: the wave at 0.9 is still due when the clock is set to 0.9.
        const ps = system({
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0.6, count: new ConstantValue(1), cycle: 5, interval: 0.1, probability: 1}],
        });
        ps.time = 0.9;
        run(ps, 0.15);
        expect(ps.particleNum).toBe(2);
    });
});

describe('emissionMultiplier', () => {
    it('is kept at or above 0', () => {
        const ps = system();
        ps.emissionMultiplier = -2;
        expect(ps.emissionMultiplier).toBe(0);
        ps.emissionMultiplier = NaN;
        expect(ps.emissionMultiplier).toBe(0);
        ps.emissionMultiplier = Infinity;
        expect(ps.emissionMultiplier).toBe(0);
        ps.emissionMultiplier = 1.5;
        expect(ps.emissionMultiplier).toBe(1.5);
        run(ps, 0.1);
        ps.emissionMultiplier = 0;
        const count = ps.particleNum;
        run(ps, 0.1);
        expect(ps.particleNum).toBe(count);
    });
});

describe('bursts', () => {
    it('are normalised the same way from the constructor and from a file', () => {
        const loose = {time: 0.5, count: 2} as never;
        const ps = system({emissionOverTime: new ConstantValue(0), emissionBursts: [loose]});
        expect(ps.emissionBursts[0].interval).toBe(0.1);
        expect(ps.emissionBursts[0].probability).toBe(1);
        expect(ps.emissionBursts[0].count.genValue([], 0)).toBe(2);
        const meta = {geometries: {}, materials: {}, textures: {}};
        const loaded = ParticleSystem.fromJSON(ps.toJSON(meta), meta, scene);
        expect(loaded.emissionBursts).toEqual(ps.emissionBursts);
        const peakOf = (s: ParticleSystem) => {
            let peak = 0;
            for (let i = 0; i < 40; i++) {
                s.update(STEP);
                peak = Math.max(peak, s.particleNum);
            }
            return peak;
        };
        expect(peakOf(ps)).toBe(2);
        expect(peakOf(loaded)).toBe(2);
    });

    it('are kept in time order and in range', () => {
        const bursts = system({
            emissionBursts: [
                {time: 1.5, count: new ConstantValue(1), cycle: 0, interval: -1, probability: 4},
                {time: NaN, count: new IntervalValue(1, 2), cycle: 2, interval: 0.2, probability: 0.5},
            ],
        }).emissionBursts;
        expect(bursts.map((b) => b.time)).toEqual([0, 1.5]);
        expect(bursts[1]).toMatchObject({cycle: 1, interval: 0, probability: 1});
        expect(normalizeBurst({}).count.genValue([], 0)).toBe(0);
        expect(normalizeBurst({cycle: Infinity}).cycle).toBe(1);
    });

    it('edited in place are put back in order when the system restarts', () => {
        const ps = system({
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 1, count: new ConstantValue(3), cycle: 1, interval: 0, probability: 1}],
        });
        ps.emissionBursts.push({time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1});
        ps.restart();
        expect(ps.emissionBursts.map((b) => b.time)).toEqual([0, 1]);
        run(ps, 0.1);
        expect(ps.particleNum).toBe(1);
    });
});

describe('a system belongs to one renderer', () => {
    it('leaves the first renderer when added to a second', () => {
        const a = new BatchedRenderer('first', scene);
        const b = new BatchedRenderer('second', scene);
        const ps = system();
        a.addSystem(ps);
        b.addSystem(ps);
        expect(a.batches.filter((batch) => batch.systems.has(ps))).toHaveLength(0);
        expect(b.batches.filter((batch) => batch.systems.has(ps))).toHaveLength(1);
        expect(ps._renderer).toBe(b);
        a.dispose();
        b.dispose();
        ps.dispose();
    });

    it('is in one batch after being added again with changed settings', () => {
        const renderer = new BatchedRenderer('again', scene);
        const ps = system();
        renderer.addSystem(ps);
        ps.rendererSettings.renderOrder = 5;
        renderer.addSystem(ps);
        expect(renderer.batches.filter((batch) => batch.systems.has(ps))).toHaveLength(1);
        renderer.dispose();
        ps.dispose();
    });

    it('is let go by a disposed renderer, which creates no batch afterwards', () => {
        const renderer = new BatchedRenderer('gone', scene);
        const ps = system();
        renderer.addSystem(ps);
        renderer.update(STEP);
        const meshes = scene.meshes.length;
        renderer.dispose();
        expect(ps._renderer).toBeUndefined();
        ps.renderOrder = 3;
        ps.update(STEP);
        expect(renderer.batches).toHaveLength(0);
        expect(scene.meshes.length).toBeLessThan(meshes);
        expect(() => renderer.addSystem(ps)).toThrow(/disposed/);
        ps.dispose();
    });

    it('draws in world space whatever the renderer transform, under the renderer for enabled state', () => {
        const renderer = new BatchedRenderer('moved', scene);
        renderer.position.x = 10;
        renderer.rotation.y = 1;
        renderer.scaling.set(3, 3, 3);
        const ps = system();
        renderer.addSystem(ps);
        renderer.update(STEP);
        const mesh = renderer.batches[0].mesh;
        expect(mesh.parent).toBe(renderer);
        expect(mesh.computeWorldMatrix(true).isIdentity()).toBe(true);
        expect(mesh.isWorldMatrixFrozen).toBe(true);
        renderer.position.set(-4, 2, 7);
        renderer.computeWorldMatrix(true);
        renderer.update(STEP);
        expect(mesh.computeWorldMatrix(true).isIdentity()).toBe(true);
        // An explicit markAsDirty from a parent reaches the batch mesh too, and still moves nothing.
        const holder = new TransformNode('holder', scene);
        renderer.parent = holder;
        holder.computeWorldMatrix(true);
        holder.position.x = 5;
        holder.markAsDirty('position');
        expect(mesh.computeWorldMatrix().isIdentity()).toBe(true);
        expect(mesh.getWorldMatrix().isIdentity()).toBe(true);
        renderer.setEnabled(false);
        expect(mesh.isEnabled()).toBe(false);
        renderer.dispose();
        expect(mesh.isDisposed()).toBe(true);
        ps.dispose();
    });
});

describe('depth pre-pass', () => {
    const materialOf = (parameters: Partial<ConstructorParameters<typeof ParticleSystem>[0]>) => {
        const renderer = new BatchedRenderer('prepass', scene);
        const ps = system(parameters);
        renderer.addSystem(ps);
        renderer.update(STEP);
        const material = (renderer.batches[0] as SpriteBatch).mesh.material as {needDepthPrePass: boolean};
        const result = material.needDepthPrePass;
        renderer.dispose();
        ps.dispose();
        return result;
    };

    it('is only asked for by a transparent material that writes depth', () => {
        expect(materialOf({renderMode: RenderMode.Mesh, transparent: false, depthWrite: true})).toBe(false);
        expect(materialOf({renderMode: RenderMode.BillBoard, transparent: true, depthWrite: true})).toBe(true);
        expect(materialOf({renderMode: RenderMode.BillBoard, transparent: true, depthWrite: false})).toBe(false);
    });
});
