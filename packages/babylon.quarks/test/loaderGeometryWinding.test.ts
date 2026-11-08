/**
 * The geometries QuarksLoader builds itself (three.js' PlaneGeometry and SphereGeometry) wind
 * their triangles as Babylon does: a triangle's front face, the one Babylon draws with back-face
 * culling on (renderFace 'front') and a lit mesh lights, is the side (c - a) x (b - a) points to,
 * and it must be the side the geometry's normals face, as in three.js. A mesh_surface shape on
 * them emits out of that face.
 */
import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import type {Mesh} from '@babylonjs/core/Meshes/mesh';
import {Scene} from '@babylonjs/core/scene';
import {SpriteParticle} from 'quarks.core';
import {MeshSurfaceEmitter} from '../src/MeshSurfaceEmitter';
import {QuarksLoader} from '../src/QuarksLoader';

describe('QuarksLoader geometry winding', () => {
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

    /** The Mesh node the loader makes from a geometry entry. */
    const meshOf = (geometry: object): Mesh => {
        const root = new QuarksLoader(scene).parse({
            geometries: [{uuid: 'g', ...geometry}],
            object: {uuid: 'root', type: 'Group', children: [{uuid: 'm', type: 'Mesh', geometry: 'g'}]},
        });
        return root.getChildMeshes()[0] as Mesh;
    };

    /** For every triangle, (c - a) x (b - a) dotted with the normal at its first corner, normalized. */
    const frontAgainstNormals = (mesh: Mesh): number[] => {
        const p = mesh.getVerticesData(VertexBuffer.PositionKind)!;
        const n = mesh.getVerticesData(VertexBuffer.NormalKind)!;
        const indices = mesh.getIndices()!;
        const dots: number[] = [];
        for (let t = 0; t < indices.length; t += 3) {
            const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
            const u = [p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]];
            const w = [p[c * 3] - p[a * 3], p[c * 3 + 1] - p[a * 3 + 1], p[c * 3 + 2] - p[a * 3 + 2]];
            const front = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
            const length = Math.hypot(front[0], front[1], front[2]);
            if (length < 1e-9) continue;
            dots.push((front[0] * n[a * 3] + front[1] * n[a * 3 + 1] + front[2] * n[a * 3 + 2]) / length);
        }
        return dots;
    };

    it("winds a PlaneGeometry's front face to +Z, where its normals and three.js' plane face", () => {
        const plane = meshOf({type: 'PlaneGeometry', width: 2, height: 1});
        const dots = frontAgainstNormals(plane);
        expect(dots).toHaveLength(2);
        for (const dot of dots) expect(dot).toBeCloseTo(1, 5);

        const emitter = new MeshSurfaceEmitter(plane);
        const particle = new SpriteParticle();
        particle.startSpeed = 1;
        for (let i = 0; i < 20; i++) {
            emitter.initialize(particle);
            expect(particle.velocity.z).toBeCloseTo(1, 5);
        }
    });

    it("winds a SphereGeometry's front faces outwards, where its normals face", () => {
        const sphere = meshOf({type: 'SphereGeometry', radius: 1, widthSegments: 8, heightSegments: 6});
        const dots = frontAgainstNormals(sphere);
        expect(dots.length).toBeGreaterThan(0);
        for (const dot of dots) expect(dot).toBeGreaterThan(0.5);

        const emitter = new MeshSurfaceEmitter(sphere);
        const particle = new SpriteParticle();
        particle.startSpeed = 1;
        for (let i = 0; i < 60; i++) {
            emitter.initialize(particle);
            const {x, y, z} = particle.position;
            const v = particle.velocity;
            // Out of the sphere: along the position, away from the centre.
            expect((x * v.x + y * v.y + z * v.z) / Math.hypot(x, y, z)).toBeGreaterThan(0.5);
        }
    });

    it('keeps the indices a file gives as they are', () => {
        const mesh = meshOf({
            type: 'QuarksGeometry',
            positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
            indices: [0, 2, 1],
        });
        expect(Array.from(mesh.getIndices()!)).toEqual([0, 2, 1]);
        const buffer = meshOf({
            type: 'BufferGeometry',
            data: {
                attributes: {position: {itemSize: 3, type: 'Float32Array', array: [0, 0, 0, 1, 0, 0, 0, 1, 0]}},
                index: {type: 'Uint16Array', array: [0, 2, 1]},
            },
        });
        expect(Array.from(buffer.getIndices()!)).toEqual([0, 2, 1]);
    });
});
