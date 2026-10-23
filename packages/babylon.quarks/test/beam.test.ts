import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Vector2, Vector3, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import stretchedGLSL from '../src/shaders/stretched_bb_particle_vert.glsl';
import stretchedWGSL from '../src/shaders/stretched_bb_particle_vert.wgsl';
import {SpriteBatch} from '../src/SpriteBatch';
import {RenderMode} from '../src/VFXBatch';
import {emptyMeta} from './internals';

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

function beam(worldSpace = true) {
    const system = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new ConstantValue(10),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(0.5),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(1), probability: 1, interval: 0, cycle: 1}],
        shape: new PointEmitter(),
        renderMode: RenderMode.Beam,
        worldSpace,
    });
    return system;
}

const velocities = (renderer: BatchedRenderer) => (renderer.batches[0] as SpriteBatch)['velocityBuffer']!;

describe('beam render mode', () => {
    it('draws through the stretched shader under BEAM, with a velocity attribute', () => {
        const renderer = new BatchedRenderer('beam', scene);
        renderer.addSystem(beam());
        const mat = renderer.batches[0].mesh.material as ShaderMaterial;
        expect(mat['options'].defines).toContain('BEAM');
        expect(mat['options'].attributes).toContain('velocity');
        for (const source of [stretchedGLSL, stretchedWGSL]) {
            expect(source).toContain('#ifdef BEAM');
        }
    });

    it('lays each quad from its particle to a point end', () => {
        const renderer = new BatchedRenderer('point', scene);
        const system = beam();
        system.emitter.position = new BVector3(1, 2, 3);
        system.beamEnd = new Vector3(4, 2, -1);
        renderer.addSystem(system);
        renderer.update(1 / 60);
        const v = velocities(renderer);
        expect([v[0], v[1], v[2]].map((x) => Math.round(x * 1000) / 1000)).toEqual([3, 0, -4]);
    });

    it('follows a node end every frame, local space included', () => {
        const renderer = new BatchedRenderer('node', scene);
        const system = beam(false);
        const node = new TransformNode('end', scene);
        node.position.set(0, 5, 0);
        system.beamEnd = node;
        renderer.addSystem(system);
        renderer.update(1 / 60);
        expect(velocities(renderer)[1]).toBeCloseTo(5);
        node.position.set(2, 0, 0);
        node.computeWorldMatrix(true);
        renderer.update(1 / 60);
        const v = velocities(renderer);
        expect([v[0], v[1], v[2]].map((x) => Math.round(x * 1000) / 1000)).toEqual([2, 0, 0]);
    });

    it('has no length without an end', () => {
        const renderer = new BatchedRenderer('none', scene);
        renderer.addSystem(beam());
        renderer.update(1 / 60);
        const v = velocities(renderer);
        expect([v[0], v[1], v[2]]).toEqual([0, 0, 0]);
    });

    it('widens its bounds to reach the end', () => {
        const renderer = new BatchedRenderer('bounds', scene);
        const system = beam();
        system.beamEnd = new Vector3(10, 0, 0);
        renderer.addSystem(system);
        for (let i = 0; i < 5; i++) renderer.update(1 / 60);
        const min = new Vector3();
        const max = new Vector3();
        expect(system.getWorldBounds(min, max)).toBe(true);
        expect(max.x).toBeGreaterThanOrEqual(10);
        expect(min.x).toBeLessThanOrEqual(0);
    });

    it('survives toJSON / fromJSON as a render mode', () => {
        const meta = emptyMeta();
        const json = beam().toJSON(meta);
        expect(ParticleSystem.fromJSON(json, meta, {}, scene).renderMode).toBe(RenderMode.Beam);
    });
});

describe('beam review fixes', () => {
    it('without an end, keeps its particle bounds rather than none', () => {
        const renderer = new BatchedRenderer('noEnd', scene);
        const system = beam();
        renderer.addSystem(system);
        for (let i = 0; i < 5; i++) renderer.update(1 / 60);
        expect(system.getWorldBounds(new Vector3(), new Vector3())).toBe(true);
    });

    it('takes a Babylon Vector3 as its end', () => {
        const renderer = new BatchedRenderer('babylonEnd', scene);
        const system = beam();
        system.beamEnd = new BVector3(0, 0, 3);
        renderer.addSystem(system);
        renderer.update(1 / 60);
        expect(velocities(renderer)[2]).toBeCloseTo(3);
    });

    describe('clone()', () => {
        it.each([
            ['a quarks Vector3', () => new Vector3(1, 2, 3)],
            ['a Babylon Vector3', () => new BVector3(1, 2, 3)],
            ['a plain point', () => ({x: 1, y: 2, z: 3})],
        ])('copies %s end by value', (_, end) => {
            const system = beam();
            const point = end();
            system.beamEnd = point;
            const copy = system.clone();
            expect(copy.beamEnd).not.toBe(point);
            const out = new Vector3();
            expect(copy.getBeamEnd(out)).toBe(true);
            expect([out.x, out.y, out.z]).toEqual([1, 2, 3]);
            point.x = 9;
            copy.getBeamEnd(out);
            expect(out.x).toBe(1);
        });

        it('keeps following the same node', () => {
            const system = beam();
            const node = new TransformNode('cloneEnd', scene);
            system.beamEnd = node;
            expect(system.clone().beamEnd).toBe(node);
            node.dispose();
        });
    });

    it('ignores flip, so U always runs from the particle to the end', () => {
        const renderer = new BatchedRenderer('flip', scene);
        const system = beam();
        system['flip'] = new Vector2(1, 0);
        system.beamEnd = new Vector3(1, 0, 0);
        renderer.addSystem(system);
        renderer.update(1 / 60);
        const size = (renderer.batches[0] as SpriteBatch)['sizeBuffer'];
        expect(size[0]).toBeGreaterThan(0);
    });
});
