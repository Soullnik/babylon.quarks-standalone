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
