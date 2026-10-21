import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Vector3, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem} from '../src/ParticleSystem';
import stretchedGLSL from '../src/shaders/stretched_bb_particle_vert.glsl';
import stretchedWGSL from '../src/shaders/stretched_bb_particle_vert.wgsl';
import {normalizeBeam, RenderMode} from '../src/VFXBatch';

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

const velocities = (renderer: BatchedRenderer) => (renderer.batches[0] as any).velocityBuffer as Float32Array;

describe('beam render mode', () => {
    it('draws through the stretched shader under BEAM, with a velocity attribute', () => {
        const renderer = new BatchedRenderer('beam', scene);
        renderer.addSystem(beam());
        const mat = renderer.batches[0].mesh.material as ShaderMaterial;
        expect((mat as any).options.defines).toContain('BEAM');
        expect((mat as any).options.attributes).toContain('velocity');
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
        const meta = {geometries: {}, materials: {}, textures: {}} as any;
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

    it('ignores flip, so U always runs from the particle to the end', () => {
        const renderer = new BatchedRenderer('flip', scene);
        const system = beam();
        (system as any).flip = {x: 1, y: 0};
        system.beamEnd = new Vector3(1, 0, 0);
        renderer.addSystem(system);
        renderer.update(1 / 60);
        const size = (renderer.batches[0] as any).sizeBuffer as Float32Array;
        expect(size[0]).toBeGreaterThan(0);
    });

    describe('texture axis and width', () => {
        it('defaults to U along it and the size as its width, and normalises', () => {
            expect(beam().beam).toBeUndefined();
            expect(normalizeBeam({textureAxis: 'u', widthPerLength: 0})).toBeUndefined();
            expect(normalizeBeam({widthPerLength: -1})).toBeUndefined();
            expect(normalizeBeam({textureAxis: 'v'})).toEqual({textureAxis: 'v', widthPerLength: 0});
            expect(normalizeBeam({widthPerLength: 0.25})).toEqual({textureAxis: 'u', widthPerLength: 0.25});
        });

        it('compiles V along the beam and a width that follows its length', () => {
            const renderer = new BatchedRenderer('axis', scene);
            const system = beam();
            system.beam = {textureAxis: 'v', widthPerLength: 0.25};
            renderer.addSystem(system);
            const mat = renderer.batches[0].mesh.material as ShaderMaterial;
            const options = (mat as any).options;
            expect(options.defines).toEqual(expect.arrayContaining(['BEAM', 'BEAM_UV_V', 'BEAM_WIDTH_FROM_LENGTH']));
            expect(options.uniforms).toContain('beamWidthPerLength');
            expect((mat as any)._floats.beamWidthPerLength).toBe(0.25);
            for (const source of [stretchedGLSL, stretchedWGSL]) {
                expect(source).toContain('defined(BEAM_UV_V)');
                expect(source).toContain('defined(BEAM_WIDTH_FROM_LENGTH)');
            }
        });

        it('batches different beam settings apart', () => {
            const renderer = new BatchedRenderer('beamBatch', scene);
            const a = beam();
            const b = beam();
            b.beam = {textureAxis: 'v'};
            renderer.addSystem(a);
            renderer.addSystem(b);
            expect(renderer.systemToBatchIndex.get(a)).not.toBe(renderer.systemToBatchIndex.get(b));
        });

        it('widens its bounds by half the width it takes from its length', () => {
            const narrow = beam();
            const wide = beam();
            wide.beam = {widthPerLength: 1};
            const box = (system: ParticleSystem) => {
                system.beamEnd = new Vector3(0, 10, 0);
                system.update(1 / 60);
                const min = new Vector3();
                const max = new Vector3();
                expect(system.getWorldBounds(min, max)).toBe(true);
                return max.x - min.x;
            };
            // 10 long, size 0.5, one width per length: 5 wide, 2.5 to either side.
            expect(box(wide) - box(narrow)).toBeGreaterThanOrEqual(5 - 1e-6);
        });

        it('round-trips through JSON and clone, written only when set', () => {
            const system = beam();
            system.beam = {textureAxis: 'v', widthPerLength: 0.25};
            const json = system.toJSON();
            expect(json.beam).toEqual({textureAxis: 'v', widthPerLength: 0.25});
            const meta = {geometries: {}, materials: {}, textures: {}} as any;
            for (const copy of [ParticleSystem.fromJSON(system.toJSON(meta), meta, {}, scene), system.clone()]) {
                expect(copy.beam).toEqual({textureAxis: 'v', widthPerLength: 0.25});
            }
            expect('beam' in beam().toJSON()).toBe(false);
        });
    });
});
