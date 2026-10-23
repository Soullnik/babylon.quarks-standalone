import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {EmitterShape, IParticleSystem, Particle, Plugin, random, ShapeJSON, ShapeTransform, Vector3} from 'quarks.core';
import {ensureTriangleIndices} from './geometryUtil';
import {quarksNodeId} from './nodeId';

/**
 * Emits from the surface of a Babylon mesh (Unity's Shape: Mesh, Unreal's Skeletal/Static Mesh
 * Location): a point picked at random over the triangles, weighted by their area, moving along the
 * triangle's normal at the particle's start speed. The mesh's vertices are read once, when it is
 * set, in the mesh's own space, and laid in the emitter's space as they are, moved by
 * {@link transform}; moving the mesh node afterwards does not move the shape. A mesh without an
 * index buffer is read as a plain triangle list. A shape without a mesh emits from the origin
 * along +Z.
 */
export class MeshSurfaceEmitter implements EmitterShape {
    /** The shape's type in effect files. */
    type = 'mesh_surface';

    private _triangleIndexToArea: number[] = [];
    private _mesh?: Mesh;
    private _positions?: Float32Array;
    private _indices?: Uint32Array | Int32Array;
    private _meshReferenceId?: string;
    /** Offset, rotation and scale of the mesh within the particle system. */
    transform?: ShapeTransform;

    /**
     * The mesh emitted from. Setting it reads its positions and indices; a mesh without indices is
     * read as a triangle list (vertices 0-1-2, 3-4-5, ...), and a mesh without positions, or with
     * no whole triangle, emits from the origin.
     */
    get mesh(): Mesh | undefined {
        return this._mesh;
    }

    set mesh(mesh: Mesh | undefined) {
        this._mesh = mesh;
        this._positions = undefined;
        this._indices = undefined;
        this._triangleIndexToArea.length = 0;
        if (!mesh) return;

        const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
        if (!positions || positions.length < 9) return;
        const vertexPositions = new Float32Array(positions);
        const read = mesh.getIndices();
        const indices = ensureTriangleIndices(
            vertexPositions,
            read && read.length > 0 ? Uint32Array.from(read) : undefined
        );
        const triCount = Math.floor(indices.length / 3);
        if (triCount === 0) return;

        this._positions = vertexPositions;
        this._indices = new Int32Array(indices.subarray(0, triCount * 3));

        let area = 0;
        this._triangleIndexToArea.push(0);

        const a = new Vector3();
        const b = new Vector3();
        const c = new Vector3();
        const cross = new Vector3();

        for (let i = 0; i < triCount; i++) {
            const i0 = indices[i * 3];
            const i1 = indices[i * 3 + 1];
            const i2 = indices[i * 3 + 2];

            a.set(positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2]);
            b.set(positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]);
            c.set(positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]);

            b.sub(a);
            c.sub(a);
            cross.crossVectors(b, c);
            area += cross.length() * 0.5;
            this._triangleIndexToArea.push(area);
        }
    }

    /**
     * @param mesh The mesh to emit from.
     * @param meshReferenceId The id of a mesh node in the effect file, kept until the loader links it.
     * @param transform Offset, rotation and scale of the mesh within the system.
     */
    constructor(mesh?: Mesh, meshReferenceId?: string, transform?: ShapeTransform) {
        this._meshReferenceId = meshReferenceId;
        this.transform = transform;
        if (mesh) this.mesh = mesh;
    }

    /** Places a new particle on the surface and sets its velocity along the triangle's normal. */
    initialize(p: Particle): void {
        if (!this._positions || !this._indices) {
            p.position.set(0, 0, 0);
            p.velocity.set(0, 0, 1).multiplyScalar(p.startSpeed);
            this.transform?.apply(p);
            return;
        }

        const triCount = this._triangleIndexToArea.length - 1;
        let left = 0,
            right = triCount;
        const target = random() * this._triangleIndexToArea[triCount];

        while (left + 1 < right) {
            const mid = Math.floor((left + right) / 2);
            if (target < this._triangleIndexToArea[mid]) {
                right = mid;
            } else {
                left = mid;
            }
        }

        let u1 = random();
        let u2 = random();
        if (u1 + u2 > 1) {
            u1 = 1 - u1;
            u2 = 1 - u2;
        }

        const idx0 = this._indices[left * 3];
        const idx1 = this._indices[left * 3 + 1];
        const idx2 = this._indices[left * 3 + 2];

        const ax = this._positions[idx0 * 3],
            ay = this._positions[idx0 * 3 + 1],
            az = this._positions[idx0 * 3 + 2];
        const bx = this._positions[idx1 * 3] - ax,
            by = this._positions[idx1 * 3 + 1] - ay,
            bz = this._positions[idx1 * 3 + 2] - az;
        const cx = this._positions[idx2 * 3] - ax,
            cy = this._positions[idx2 * 3 + 1] - ay,
            cz = this._positions[idx2 * 3 + 2] - az;

        p.position.set(ax + bx * u1 + cx * u2, ay + by * u1 + cy * u2, az + bz * u1 + cz * u2);

        const nx = by * cz - bz * cy;
        const ny = bz * cx - bx * cz;
        const nz = bx * cy - by * cx;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        p.velocity.set(nx / len, ny / len, nz / len).multiplyScalar(p.startSpeed);
        this.transform?.apply(p);
    }

    /** The shape in effect-file form; the mesh is written as its node id. */
    toJSON(): ShapeJSON {
        return {
            type: 'mesh_surface',
            mesh: this._mesh ? quarksNodeId(this._mesh) : (this._meshReferenceId ?? ''),
            ...ShapeTransform.toShapeJSON(this.transform),
        };
    }

    /** Reads {@link toJSON} output; the mesh stays an id until `QuarksLoader` links it. */
    static fromJSON(json: ShapeJSON | undefined): MeshSurfaceEmitter {
        return new MeshSurfaceEmitter(undefined, json?.mesh, ShapeTransform.fromJSON(json?.transform));
    }

    /** A copy emitting from the same mesh. */
    clone(): EmitterShape {
        return new MeshSurfaceEmitter(this._mesh, this._meshReferenceId, this.transform?.clone());
    }

    /** Does nothing: the shape keeps no state between steps. */
    update(_system: IParticleSystem, _delta: number): void {}
}

/** Registers {@link MeshSurfaceEmitter} with quarks.core's shape table; loaded when the package is imported. */
export const MeshSurfaceEmitterPlugin: Plugin = {
    id: 'babylon.quarks',
    initialize: () => {},
    emitterShapes: [
        {
            type: 'mesh_surface',
            params: [['mesh', ['mesh']]],
            constructor: MeshSurfaceEmitter,
            loadJSON: (json: ShapeJSON) => MeshSurfaceEmitter.fromJSON(json),
        },
    ],
    behaviors: [],
};
