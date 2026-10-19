import {FreeCamera} from '@babylonjs/core/Cameras/freeCamera';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {Scene} from '@babylonjs/core/scene';
import {ConstantValue, PointEmitter} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {gather, sortByKey, SortScratch} from '../src/instanceSort';
import {ParticleSystem} from '../src/ParticleSystem';
import {SpriteBatch} from '../src/SpriteBatch';
import {RenderMode} from '../src/VFXBatch';

describe('instance sorting', () => {
    it('radix sorts indices by key, ascending, for any key spread', () => {
        const scratch = new SortScratch(8);
        const values = [3.5, 0.25, 1e6, 0, 7, 0.0001, 42, 2];
        for (let i = 0; i < values.length; i++) {
            scratch.keys[i] = scratch.floatKey(values[i], false);
        }
        const order = Array.from(sortByKey(scratch, values.length));
        expect(order.map((i) => values[i])).toEqual([...values].sort((a, b) => a - b));
        for (let i = 0; i < values.length; i++) {
            scratch.keys[i] = scratch.floatKey(values[i], true);
        }
        const descending = Array.from(sortByKey(scratch, values.length));
        expect(descending.map((i) => values[i])).toEqual([...values].sort((a, b) => b - a));
    });

    it('sorts a long sequence and gathers attributes in that order', () => {
        const count = 5000;
        const scratch = new SortScratch(count);
        const values = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            values[i] = ((i * 7919) % 1013) * 0.37;
            scratch.keys[i] = scratch.floatKey(values[i], false);
        }
        const order = sortByKey(scratch, count);
        for (let i = 1; i < count; i++) {
            expect(values[order[i]]).toBeGreaterThanOrEqual(values[order[i - 1]]);
        }
        const source = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            source[i * 3] = values[i];
            source[i * 3 + 1] = i;
            source[i * 3 + 2] = -i;
        }
        const target = new Float32Array(count * 3);
        gather(source, target, order, count, 3);
        expect(target[0]).toBe(values[order[0]]);
        expect(target[1]).toBe(order[0]);
        expect(target[(count - 1) * 3 + 2]).toBe(-order[count - 1]);
    });
});

describe('sort mode and screen-size limits', () => {
    let engine: NullEngine;
    let scene: Scene;
    let camera: FreeCamera;
    const STEP = 1 / 60;

    beforeEach(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
        camera = new FreeCamera('cam', new BVector3(0, 0, -10), scene);
        camera.setTarget(BVector3.Zero());
    });

    afterEach(() => {
        engine.dispose();
    });

    function makeSystem(parameters: Partial<ConstructorParameters<typeof ParticleSystem>[0]> = {}): ParticleSystem {
        return new ParticleSystem({
            scene,
            looping: false,
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [{time: 0, count: new ConstantValue(3), cycle: 1, interval: 0, probability: 1}],
            startLife: new ConstantValue(10),
            startSpeed: new ConstantValue(0),
            startSize: new ConstantValue(0.2),
            shape: new PointEmitter(),
            renderMode: RenderMode.BillBoard,
            texture: null,
            ...parameters,
        });
    }

    /** The batch's instance buffers, which are private to it. */
    function buffers(batch: SpriteBatch): {offsetBuffer: Float32Array; colorBuffer: Float32Array} {
        return batch as unknown as {offsetBuffer: Float32Array; colorBuffer: Float32Array};
    }

    /** z of each drawn instance, in draw order. */
    function drawnZ(renderer: BatchedRenderer): number[] {
        const batch = renderer.batches[0] as SpriteBatch;
        const count = batch.mesh.forcedInstanceCount ?? 0;
        const offsets = buffers(batch).offsetBuffer;
        const out: number[] = [];
        for (let i = 0; i < count; i++) {
            out.push(offsets[i * 3 + 2]);
        }
        return out;
    }

    it("draws the farthest particles first with 'distance'", () => {
        const renderer = new BatchedRenderer('r', scene);
        // Three systems at z = 0, 5 and -5 added in that order; the camera is at z = -10.
        for (const z of [0, 5, -5]) {
            const system = makeSystem({sortMode: 'distance'});
            system.emitter.position.z = z;
            renderer.addSystem(system);
        }
        expect(renderer.batches).toHaveLength(1);
        renderer.update(STEP);
        const zs = drawnZ(renderer);
        expect(zs).toHaveLength(9);
        expect(zs.slice(0, 3)).toEqual([5, 5, 5]);
        expect(zs.slice(3, 6)).toEqual([0, 0, 0]);
        expect(zs.slice(6)).toEqual([-5, -5, -5]);
        // The colours travelled with their particles.
        expect(buffers(renderer.batches[0] as SpriteBatch).colorBuffer[3]).toBe(1);
        renderer.dispose();
    });

    it('draws by age in either direction, and not at all by default', () => {
        const make = (mode: 'none' | 'oldestInFront' | 'youngestInFront') => {
            const renderer = new BatchedRenderer('r', scene);
            const older = makeSystem({sortMode: mode});
            older.emitter.position.z = 1;
            renderer.addSystem(older);
            renderer.update(STEP);
            renderer.update(STEP);
            const younger = makeSystem({sortMode: mode});
            younger.emitter.position.z = 2;
            renderer.addSystem(younger);
            renderer.update(STEP);
            const zs = drawnZ(renderer);
            renderer.dispose();
            return zs;
        };
        // Insertion order: the older system was added first.
        expect(make('none')).toEqual([1, 1, 1, 2, 2, 2]);
        // The oldest are drawn last, so they are in front.
        expect(make('oldestInFront')).toEqual([2, 2, 2, 1, 1, 1]);
        expect(make('youngestInFront')).toEqual([1, 1, 1, 2, 2, 2]);
    });

    it('batches systems with different sort modes or size limits apart', () => {
        const renderer = new BatchedRenderer('r', scene);
        renderer.addSystem(makeSystem());
        renderer.addSystem(makeSystem({sortMode: 'distance'}));
        renderer.addSystem(makeSystem({maxParticleSize: 0.5}));
        renderer.addSystem(makeSystem({maxParticleSize: 0.5}));
        expect(renderer.batches).toHaveLength(3);
        renderer.dispose();
    });

    it('compiles the size limits into billboard and stretched shaders only', () => {
        const renderer = new BatchedRenderer('r', scene);
        const defines = (parameters: Partial<ConstructorParameters<typeof ParticleSystem>[0]>) => {
            renderer.addSystem(makeSystem(parameters));
            const batch = renderer.batches[renderer.batches.length - 1];
            return (batch.mesh.material as ShaderMaterial).options.defines;
        };
        expect(defines({})).not.toContain('SIZE_LIMITS');
        expect(defines({minParticleSize: 0.01})).toContain('SIZE_LIMITS');
        expect(defines({maxParticleSize: 0.5, renderMode: RenderMode.StretchedBillBoard})).toContain('SIZE_LIMITS');
        expect(defines({maxParticleSize: 0.5, renderMode: RenderMode.HorizontalBillBoard})).toContain('SIZE_LIMITS');
        expect(defines({maxParticleSize: 0.5, renderMode: RenderMode.Mesh})).not.toContain('SIZE_LIMITS');
        renderer.dispose();
    });

    it('round-trips sort mode and size limits through JSON only when set', () => {
        const defaults = makeSystem().toJSON();
        expect(defaults.sortMode).toBeUndefined();
        expect(defaults.minParticleSize).toBeUndefined();
        expect(defaults.maxParticleSize).toBeUndefined();
        const json = makeSystem({sortMode: 'oldestInFront', minParticleSize: 0.02, maxParticleSize: 0.5}).toJSON();
        expect(json.sortMode).toBe('oldestInFront');
        expect(json.minParticleSize).toBe(0.02);
        expect(json.maxParticleSize).toBe(0.5);
        const loaded = ParticleSystem.fromJSON(json, {textures: {}, materials: {}, geometries: {}}, {}, scene);
        expect(loaded.sortMode).toBe('oldestInFront');
        expect(loaded.minParticleSize).toBe(0.02);
        expect(loaded.maxParticleSize).toBe(0.5);
        const cloned = loaded.clone();
        expect(cloned.sortMode).toBe('oldestInFront');
        expect(cloned.maxParticleSize).toBe(0.5);
        json.sortMode = 'sideways' as never;
        expect(ParticleSystem.fromJSON(json, {textures: {}, materials: {}, geometries: {}}, {}, scene).sortMode).toBe(
            'none'
        );
    });
});
