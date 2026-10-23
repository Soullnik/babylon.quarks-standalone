import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {
    ConstantColor,
    ConstantValue,
    IntervalValue,
    PointEmitter,
    TrailParticle,
    TrailSettings,
    Vector3,
    Vector4,
} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleEmitter} from '../src/ParticleEmitter';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import {QuarksLoader} from '../src/QuarksLoader';
import {serializeEffect} from '../src/QuarksSerializer';
import type {BabylonMetaData} from '../src/system/types';
import {trailLifetime, trailMinVertexDistance, trailTextureMode, trailTextureScale} from '../src/trailSettings';
import {RenderMode} from '../src/VFXBatch';

/**
 * How a trail samples its path and lays its texture along it: Unity's TrailRenderer texture
 * modes and scale, minimum vertex distance and time, and clearing the trails (`Clear()`).
 */
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

const STEP = 1 / 60;
const SPEED = 6;
const META = (): BabylonMetaData => ({geometries: {}, materials: {}, textures: {}});
/** The system's clock, to draw a frame between steps. */
const clockOf = (system: ParticleSystem) => (system as unknown as {clock: {accumulator: number}}).clock;

/** One trail particle in world space, speed 6 along +Z, with the trail `settings`. */
function trailSystem(
    settings: Partial<TrailSettings> = {},
    overrides: Partial<ParticleSystemParameters> = {}
): ParticleSystem {
    return new ParticleSystem({
        scene,
        duration: 100,
        looping: true,
        worldSpace: true,
        startLife: new ConstantValue(50),
        startSpeed: new ConstantValue(SPEED),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
        shape: new PointEmitter(),
        renderMode: RenderMode.Trail,
        rendererEmitterSettings: {startLength: new ConstantValue(30), followLocalOrigin: false, ...settings},
        ...overrides,
    });
}

/** The system in a renderer, its one particle sent straight along +Z, stepped `steps` times. */
function flown(settings: Partial<TrailSettings> = {}, steps = 10, overrides: Partial<ParticleSystemParameters> = {}) {
    const system = trailSystem(settings, overrides);
    const renderer = new BatchedRenderer('trail', scene);
    renderer.addSystem(system);
    renderer.update(STEP);
    const particle = system.particles[0] as TrailParticle;
    particle.position.set(0, 0, 0);
    particle.velocity.set(0, 0, SPEED);
    particle.resetHistory();
    for (let i = 0; i < steps; i++) renderer.update(STEP);
    return {system, renderer, particle};
}

const buffers = (renderer: BatchedRenderer) =>
    renderer.batches[0] as unknown as {
        uvBuffer: Float32Array;
        positionBuffer: Float32Array;
        colorBuffer: Float32Array;
        maxParticles: number;
    };
/** U of drawn pair k. */
const drawnU = (renderer: BatchedRenderer, k: number) => buffers(renderer).uvBuffer[k * 4];
/** Z of drawn pair k. */
const drawnZ = (renderer: BatchedRenderer, k: number) => buffers(renderer).positionBuffer[k * 6 + 2];
/** How many pairs the batch drew. */
const drawnPairs = (renderer: BatchedRenderer) => {
    const mesh = renderer.batches[0].mesh;
    return (mesh.subMeshes?.[0]?.indexCount ?? 0) / 6 + 1;
};
const recordedZ = (particle: TrailParticle, i: number) =>
    particle.historyPositions[particle.getHistoryIndex(i) * 3 + 2];
const recordedDistance = (particle: TrailParticle, i: number) => particle.historyDistances[particle.getHistoryIndex(i)];

/**
 * A trail pinned to the emitter (`followLocalOrigin`), the emitter moved along +Z by `moves`
 * one step at a time, so the samples lie unevenly apart and no live tip is drawn.
 */
function walked(settings: Partial<TrailSettings>, moves: number[]) {
    const system = trailSystem({followLocalOrigin: true, ...settings}, {startSpeed: new ConstantValue(0)});
    const renderer = new BatchedRenderer('walk', scene);
    renderer.addSystem(system);
    renderer.update(STEP);
    (system.particles[0] as TrailParticle).resetHistory();
    for (const move of moves) {
        system.emitter.position.z += move;
        // The simulation reads the emitter's matrix as it stands, so bring it up to date as a frame would.
        system.emitter.computeWorldMatrix(true);
        renderer.update(STEP);
    }
    return {system, renderer, particle: system.particles[0] as TrailParticle};
}

describe('the texture along a trail', () => {
    // Four short steps then four long ones: 8 samples, the second half of them three times as far apart.
    const MOVES = [0, 1, 1, 1, 1, 3, 3, 3];

    it('stretches once along the ribbon by distance by default', () => {
        const {renderer, particle} = walked({}, MOVES);
        expect(particle.historyCount).toBe(MOVES.length);
        expect(drawnPairs(renderer)).toBe(MOVES.length);
        // 13 units in all: the middle sample, 4 units in, sits at 4/13, not at the half way of the samples.
        expect(drawnU(renderer, 0)).toBeCloseTo(0);
        expect(drawnU(renderer, 4)).toBeCloseTo(4 / 13);
        expect(drawnU(renderer, 7)).toBeCloseTo(1);
        renderer.dispose();
    });

    it('distributes the texture per segment when asked, as it did before', () => {
        const {renderer} = walked({textureMode: 'distributePerSegment'}, MOVES);
        expect(drawnU(renderer, 4)).toBeCloseTo(4 / 7);
        expect(drawnU(renderer, 7)).toBeCloseTo(1);
        renderer.dispose();
    });

    it('tiles the texture per world unit, anchored where the particle was born', () => {
        const {renderer} = walked({textureMode: 'tile', textureScale: 0.5}, MOVES);
        expect(drawnU(renderer, 0)).toBeCloseTo(0);
        expect(drawnU(renderer, 4)).toBeCloseTo(4 * 0.5);
        expect(drawnU(renderer, 7)).toBeCloseTo(13 * 0.5);
        renderer.dispose();
    });

    it('tiles from the particle back with uvFromHead', () => {
        const {renderer} = walked({textureMode: 'tile', uvFromHead: true}, MOVES);
        expect(drawnU(renderer, 7)).toBeCloseTo(0);
        expect(drawnU(renderer, 4)).toBeCloseTo(9);
        expect(drawnU(renderer, 0)).toBeCloseTo(13);
        renderer.dispose();
    });

    it('keeps a tiled sample at its U while the trail grows', () => {
        const {system, renderer} = flown({textureMode: 'tile'}, 10);
        const before = [drawnU(renderer, 0), drawnU(renderer, 3)];
        for (let i = 0; i < 5; i++) renderer.update(STEP);
        expect(drawnU(renderer, 0)).toBeCloseTo(before[0]);
        expect(drawnU(renderer, 3)).toBeCloseTo(before[1]);
        // One repeat every unit of the particle's travel.
        expect(drawnU(renderer, 10) - drawnU(renderer, 0)).toBeCloseTo(SPEED * STEP * 10, 4);
        renderer.dispose();
        system.dispose();
    });

    it('tiles in world units behind a scaled local-space emitter recording in world space', () => {
        const system = trailSystem(
            {textureMode: 'tile', recordWorldSpace: true},
            {worldSpace: false, startSpeed: new ConstantValue(0)}
        );
        system.emitter.scaling.setAll(2);
        system.emitter.computeWorldMatrix(true);
        const renderer = new BatchedRenderer('scaled', scene);
        renderer.addSystem(system);
        renderer.update(STEP);
        const particle = system.particles[0] as TrailParticle;
        particle.position.set(0, 0, 0);
        particle.velocity.set(0, 0, 1); // 1 local unit a second: 2 world units
        particle.resetHistory();
        for (let i = 0; i < 10; i++) renderer.update(STEP);
        // The ribbon spans 9 steps, 0.3 world units: U counts world units, not local ones doubled.
        expect(drawnZ(renderer, 9) - drawnZ(renderer, 0)).toBeCloseTo(0.3, 4);
        expect(drawnU(renderer, 9) - drawnU(renderer, 0)).toBeCloseTo(0.3, 4);
        renderer.dispose();
        system.dispose();
    });

    it('keeps tile U small however far the particle has travelled', () => {
        const {system, renderer, particle} = flown({textureMode: 'tile', lifetime: 0.1}, 10);
        // 10 000 units behind the tail already: U starts within the first repeat.
        for (let i = 0; i < particle.historyCapacity; i++) particle.historyDistances[i] += 10000.25;
        renderer.batches[0].update();
        expect(drawnU(renderer, 0)).toBeGreaterThanOrEqual(0);
        expect(drawnU(renderer, 0)).toBeLessThan(1);
        // Within the float32 resolution of a distance in the ten thousands.
        expect(drawnU(renderer, 6) - drawnU(renderer, 0)).toBeCloseTo(6 * SPEED * STEP, 2);
        renderer.dispose();
        system.dispose();
    });

    it('runs tile U on through a tessellated ribbon', () => {
        const {system, renderer} = flown({textureMode: 'tile', tessellation: 3}, 10);
        const pairs = drawnPairs(renderer);
        expect(pairs).toBe(9 * 4 + 1);
        for (let k = 1; k < pairs; k++) {
            expect(drawnU(renderer, k) - drawnU(renderer, k - 1)).toBeCloseTo((SPEED * STEP) / 4, 4);
        }
        renderer.dispose();
        system.dispose();
    });

    it('repeats the texture once per segment, scaled', () => {
        const {renderer} = walked({textureMode: 'repeatPerSegment', textureScale: 2}, MOVES);
        expect(drawnU(renderer, 0)).toBeCloseTo(0);
        expect(drawnU(renderer, 3)).toBeCloseTo(6);
        expect(drawnU(renderer, 7)).toBeCloseTo(14);
        renderer.dispose();
    });

    it('scales the stretched texture over the ribbon', () => {
        const {renderer} = walked({textureScale: 3}, MOVES);
        expect(drawnU(renderer, 7)).toBeCloseTo(3);
        const head = walked({textureScale: 3, uvFromHead: true}, MOVES);
        expect(drawnU(head.renderer, 0)).toBeCloseTo(3);
        expect(drawnU(head.renderer, 7)).toBeCloseTo(0);
        renderer.dispose();
        head.renderer.dispose();
    });

    it('records each sample its distance along the trail, the live tip included', () => {
        const {system, renderer, particle} = flown({}, 10);
        const perStep = SPEED * STEP;
        expect(recordedDistance(particle, 0)).toBe(0);
        expect(recordedDistance(particle, 5)).toBeCloseTo(5 * perStep, 4);
        // Drawn between steps, the tip runs ahead by the residual and the stretch spans it too.
        clockOf(system).accumulator = STEP / 2;
        renderer.batches[0].update();
        const pairs = drawnPairs(renderer);
        expect(pairs).toBe(particle.historyCount + 1);
        expect(drawnU(renderer, pairs - 1)).toBeCloseTo(1);
        // Nine segments recorded and half a step of tip: the head sits at 9 / 9.5.
        expect(drawnU(renderer, pairs - 2)).toBeCloseTo(9 / 9.5, 3);
        renderer.dispose();
        system.dispose();
    });

    it('lays a ribbon that has not moved out per segment rather than at one U', () => {
        const {system, renderer} = flown({uvFromHead: true}, 10, {startSpeed: new ConstantValue(0)});
        const particle = system.particles[0] as TrailParticle;
        particle.velocity.set(0, 0, 0);
        for (let i = 0; i < 5; i++) renderer.update(STEP);
        expect(drawnU(renderer, 0)).toBeCloseTo(1);
        expect(drawnU(renderer, drawnPairs(renderer) - 1)).toBeCloseTo(0);
        renderer.dispose();
        system.dispose();
    });
});

describe('how a trail samples its path', () => {
    it('records a sample every step by default', () => {
        const {system, renderer, particle} = flown({}, 10);
        expect(particle.historyCount).toBe(10);
        renderer.dispose();
        system.dispose();
    });

    it('fixes a sample only every minVertexDistance, the head following the particle meanwhile', () => {
        // 0.1 a step; a sample is fixed once the particle is 0.25 from the last fixed one: every
        // third step, so 30 steps fix ten samples 0.3 apart, and the head follows.
        const {system, renderer, particle} = flown({minVertexDistance: 0.25}, 30);
        const count = particle.historyCount;
        expect(count).toBe(11);
        for (let i = 1; i + 1 < count; i++) {
            expect(recordedZ(particle, i) - recordedZ(particle, i - 1)).toBeCloseTo(0.3, 4);
        }
        // The newest sample is where the particle is now, whatever its distance from the one before.
        expect(recordedZ(particle, count - 1)).toBeCloseTo(particle.position.z, 5);
        // Distances follow the moves, not the steps.
        expect(recordedDistance(particle, count - 1)).toBeCloseTo(particle.position.z - recordedZ(particle, 0), 4);
        renderer.dispose();
        system.dispose();
    });

    it('draws the head back by the step that ran ahead, not by the segment it is following', () => {
        // The head follows the particle over 1 unit; a frame half a step behind the last step pulls
        // it back half a step (0.05), not half the segment.
        const {system, renderer, particle} = flown({minVertexDistance: 1}, 8);
        expect(particle.historyCount).toBe(2);
        const head = particle.position.z;
        clockOf(system).accumulator = -STEP / 2;
        renderer.batches[0].update();
        const pairs = drawnPairs(renderer);
        expect(pairs).toBe(2);
        expect(drawnZ(renderer, 1)).toBeCloseTo(head - (SPEED * STEP) / 2, 4);
        renderer.dispose();
        system.dispose();
    });

    it('keeps a standing particle at two samples instead of filling its history', () => {
        const {system, renderer, particle} = flown({minVertexDistance: 0.15}, 2);
        particle.velocity.set(0, 0, 0);
        for (let i = 0; i < 40; i++) renderer.update(STEP);
        expect(particle.historyCount).toBe(2);
        renderer.dispose();
        system.dispose();
    });

    it('drops samples older than the lifetime', () => {
        // Samples a step apart: 0.1 s keeps the last seven (ages 0 to 6 steps) of the 30 the history could hold.
        const {system, renderer, particle} = flown({lifetime: 0.1}, 20);
        expect(particle.historyCount).toBe(7);
        // The oldest kept is 6 steps behind the head.
        expect(recordedZ(particle, 6) - recordedZ(particle, 0)).toBeCloseTo(6 * SPEED * STEP, 4);
        renderer.dispose();
        system.dispose();
    });

    it('keeps aging a dead particle out, samples expiring as they would alive', () => {
        const {system, renderer, particle} = flown({lifetime: 0.05}, 10, {startLife: new ConstantValue(0.3)});
        expect(particle.historyCount).toBe(4);
        // Dead at 0.3 s: the samples left expire within the lifetime, and the particle with them.
        for (let i = 0; i < 12; i++) renderer.update(STEP);
        expect(system.particleNum).toBe(0);
        renderer.dispose();
        system.dispose();
    });

    it('records nothing at the end of life, and fades from then on', () => {
        const particle = new TrailParticle();
        particle.length = 4;
        particle.life = 1;
        particle.age = 0;
        particle.update();
        particle.update();
        expect(particle.historyCount).toBe(2);
        particle.age = 1;
        particle.update();
        expect(particle.historyCount).toBe(1);
        expect(particle.died).toBe(true);
    });

    it('keeps the history buffers it has for a shorter or random length', () => {
        const particle = new TrailParticle();
        expect(particle.length).toBe(30);
        particle.ensureHistoryCapacity(40);
        const buffers = [
            particle.historyPositions,
            particle.historySizes,
            particle.historyColors,
            particle.historyAges,
        ];
        particle.ensureHistoryCapacity(20);
        expect(particle.historyCapacity).toBe(20);
        expect([
            particle.historyPositions,
            particle.historySizes,
            particle.historyColors,
            particle.historyAges,
        ]).toEqual(buffers);
        particle.ensureHistoryCapacity(50);
        expect(particle.historyPositions).not.toBe(buffers[0]);
        expect(particle.historyPositions.length).toBe(150);
    });

    it('re-emits a trail of random length without reallocating its history', () => {
        const system = trailSystem(
            {startLength: new IntervalValue(5, 20)},
            {
                startLife: new ConstantValue(0.05),
                emissionOverTime: new ConstantValue(60),
                emissionBursts: [],
            }
        );
        const renderer = new BatchedRenderer('random-length', scene);
        renderer.addSystem(system);
        for (let i = 0; i < 30; i++) renderer.update(STEP);
        const particle = system.particles[0] as TrailParticle;
        let sizes = particle.historySizes;
        let changes = 0;
        for (let i = 0; i < 120; i++) {
            renderer.update(STEP);
            if (particle.historySizes !== sizes) {
                // Only ever a longer buffer, never one per emission.
                expect(particle.historySizes.length).toBeGreaterThan(sizes.length);
                changes++;
                sizes = particle.historySizes;
            }
        }
        expect(changes).toBeLessThan(10);
        expect(particle.historySizes.length).toBeLessThanOrEqual(20);
        renderer.dispose();
        system.dispose();
    });

    it('walks a tessellated straight segment evenly at tension 1', () => {
        const {system, renderer} = flown({tessellation: 3, curveTension: 1}, 10);
        const z = [0, 1, 2, 3, 4].map((k) => drawnZ(renderer, k));
        const step = z[4] - z[0];
        for (let k = 1; k <= 4; k++) {
            expect(z[k] - z[0]).toBeCloseTo((step * k) / 4, 5);
        }
        renderer.dispose();
        system.dispose();
    });
});

describe('clearing the trails', () => {
    it('drops every ribbon and keeps the particles, which start new ones where they are', () => {
        const {system, renderer, particle} = flown({}, 10);
        expect(particle.historyCount).toBe(10);
        system.clearTrails();
        expect(particle.historyCount).toBe(0);
        expect(system.particleNum).toBe(1);
        renderer.update(STEP);
        expect(particle.historyCount).toBe(1);
        expect(recordedZ(particle, 0)).toBeCloseTo(particle.position.z);
        renderer.dispose();
        system.dispose();
    });

    it('draws no ribbon across a teleport: pause, move, play, clear', () => {
        const {system, renderer, particle} = flown({}, 10);
        system.pause();
        system.emitter.position.x += 100;
        particle.position.x += 100;
        system.play();
        system.clearTrails();
        renderer.update(STEP);
        renderer.update(STEP);
        const positions = buffers(renderer).positionBuffer;
        const pairs = drawnPairs(renderer);
        expect(pairs).toBeGreaterThan(1);
        for (let k = 1; k < pairs; k++) {
            const dx = positions[k * 6] - positions[(k - 1) * 6];
            const dz = positions[k * 6 + 2] - positions[(k - 1) * 6 + 2];
            expect(Math.sqrt(dx * dx + dz * dz)).toBeLessThanOrEqual(SPEED * STEP * 2);
        }
        renderer.dispose();
        system.dispose();
    });

    it('does nothing on a system that draws no trails', () => {
        const system = new ParticleSystem({scene, emissionOverTime: new ConstantValue(0)});
        expect(() => system.clearTrails()).not.toThrow();
        system.dispose();
    });
});

describe('trail settings in JSON, clones and the loader', () => {
    it('normalise their inputs', () => {
        expect(trailTextureMode({textureMode: 'tile'} as TrailSettings)).toBe('tile');
        expect(trailTextureMode({textureMode: 'wrap'} as unknown as TrailSettings)).toBe('stretch');
        expect(trailTextureMode(undefined)).toBe('stretch');
        expect(trailTextureScale({textureScale: 0} as TrailSettings)).toBe(1);
        expect(trailTextureScale({textureScale: NaN} as TrailSettings)).toBe(1);
        expect(trailTextureScale({textureScale: 2.5} as TrailSettings)).toBe(2.5);
        expect(trailMinVertexDistance({minVertexDistance: -1} as TrailSettings)).toBe(0);
        expect(trailMinVertexDistance({minVertexDistance: Infinity} as TrailSettings)).toBe(0);
        expect(trailMinVertexDistance({minVertexDistance: 0.3} as TrailSettings)).toBe(0.3);
        expect(trailLifetime({lifetime: NaN} as TrailSettings)).toBe(Infinity);
        expect(trailLifetime({lifetime: 0} as TrailSettings)).toBe(Infinity);
        expect(trailLifetime({lifetime: -2} as TrailSettings)).toBe(Infinity);
        expect(trailLifetime({lifetime: 0.5} as TrailSettings)).toBe(0.5);
    });

    it('write only the settings that are set, and read them back through fromJSON and clone', () => {
        const system = trailSystem({
            textureMode: 'tile',
            textureScale: 0.5,
            minVertexDistance: 0.2,
            lifetime: 0.4,
            followLocalOrigin: true,
        });
        const json = system.toJSON(META()).rendererEmitterSettings as Record<string, unknown>;
        expect(json).toEqual({
            startLength: {type: 'ConstantValue', value: 30},
            followLocalOrigin: true,
            textureMode: 'tile',
            textureScale: 0.5,
            minVertexDistance: 0.2,
            lifetime: 0.4,
        });
        for (const copy of [ParticleSystem.fromJSON(system.toJSON(META()), META(), {}, scene), system.clone()]) {
            expect(copy.rendererEmitterSettings).toMatchObject({
                textureMode: 'tile',
                textureScale: 0.5,
                minVertexDistance: 0.2,
                lifetime: 0.4,
                followLocalOrigin: true,
            });
            copy.dispose();
        }
        // Defaults, spelled out or not, stay out of the file.
        const plain = trailSystem({textureMode: 'stretch', textureScale: 1, minVertexDistance: 0, lifetime: 0});
        expect(Object.keys(plain.toJSON(META()).rendererEmitterSettings as Record<string, unknown>)).toEqual([
            'startLength',
        ]);
        plain.dispose();
        system.dispose();
    });

    it('round-trip through serializeEffect and QuarksLoader', () => {
        const system = trailSystem({
            textureMode: 'repeatPerSegment',
            textureScale: 2,
            minVertexDistance: 0.1,
            lifetime: 1.5,
            uvFromHead: true,
            recordWorldSpace: true,
            tessellation: 4,
            curveTension: 0.5,
            sideAxis: new Vector3(0, 1, 0),
        });
        const root = new QuarksLoader(scene).parse(JSON.parse(JSON.stringify(serializeEffect(system.emitter))));
        const loaded = (root as ParticleEmitter).system as ParticleSystem;
        expect(loaded.renderMode).toBe(RenderMode.Trail);
        const settings = loaded.rendererEmitterSettings as TrailSettings;
        expect(settings).toMatchObject({
            textureMode: 'repeatPerSegment',
            textureScale: 2,
            minVertexDistance: 0.1,
            lifetime: 1.5,
            uvFromHead: true,
            recordWorldSpace: true,
            tessellation: 4,
            curveTension: 0.5,
        });
        expect([settings.sideAxis!.x, settings.sideAxis!.y, settings.sideAxis!.z]).toEqual([0, 1, 0]);
        expect((settings.startLength as ConstantValue).value).toBe(30);
        loaded.dispose();
        system.dispose();
    });

    it('drop a side axis that is not a direction, with a warning', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const json = trailSystem().toJSON(META());
        const load = (sideAxis: unknown) =>
            ParticleSystem.fromJSON(
                {...json, rendererEmitterSettings: {...json.rendererEmitterSettings, sideAxis}},
                META(),
                {},
                scene
            );
        for (const bad of [[0, 0, 0], {x: 'a'}, [1, NaN, 0], 'up', [1]]) {
            const loaded = load(bad);
            expect((loaded.rendererEmitterSettings as TrailSettings).sideAxis).toBeUndefined();
            loaded.dispose();
        }
        expect(warn).toHaveBeenCalledTimes(5);
        expect(warn.mock.calls[0][0]).toContain('[quarks] sideAxis');
        const good = load({x: 0, y: 0, z: 2});
        expect((good.rendererEmitterSettings as TrailSettings).sideAxis!.z).toBe(2);
        good.dispose();
        warn.mockRestore();
    });
});

describe('the trail batch', () => {
    it("tints a system's ribbons and leaves another's alone", () => {
        const tinted = trailSystem();
        const plain = trailSystem();
        tinted.tint = new Vector4(1, 0.5, 0.25, 0.5);
        const renderer = new BatchedRenderer('tint', scene);
        renderer.addSystem(tinted);
        renderer.addSystem(plain);
        for (let i = 0; i < 5; i++) renderer.update(STEP);
        expect(renderer.batches.length).toBe(1);
        const colors = buffers(renderer).colorBuffer;
        const tintedVertices = (tinted.particles[0] as TrailParticle).historyCount * 2;
        const plainVertices = (plain.particles[0] as TrailParticle).historyCount * 2;
        expect(tintedVertices).toBeGreaterThan(2);
        const vertexColors: string[] = [];
        for (let v = 0; v < tintedVertices + plainVertices; v++) {
            vertexColors.push(Array.from(colors.subarray(v * 4, v * 4 + 4)).join(','));
        }
        // One system's ribbon then the other's, whichever the batch draws first.
        expect(vertexColors.filter((c) => c === '1,0.5,0.25,0.5').length).toBe(tintedVertices);
        expect(vertexColors.filter((c) => c === '1,1,1,1').length).toBe(plainVertices);
        renderer.dispose();
        tinted.dispose();
        plain.dispose();
    });

    it('sizes its buffers in vertices, two per drawn point', () => {
        const {system, renderer} = flown({}, 10);
        const batch = buffers(renderer);
        expect(batch.positionBuffer.length).toBe(batch.maxParticles * 3);
        expect(batch.uvBuffer.length).toBe(batch.maxParticles * 2);
        expect(batch.colorBuffer.length).toBe(batch.maxParticles * 4);
        const dense = trailSystem({}, {emissionOverTime: new ConstantValue(1000), emissionBursts: []});
        renderer.addSystem(dense);
        for (let i = 0; i < 30; i++) renderer.update(STEP);
        let vertices = 0;
        for (const s of [system, dense]) {
            for (let i = 0; i < s.particleNum; i++) vertices += (s.particles[i] as TrailParticle).historyCount * 2;
        }
        expect(vertices).toBeGreaterThan(1024);
        expect(batch.maxParticles).toBeGreaterThanOrEqual(vertices);
        expect(batch.positionBuffer.length).toBe(batch.maxParticles * 3);
        renderer.dispose();
        system.dispose();
        dense.dispose();
    });
});
