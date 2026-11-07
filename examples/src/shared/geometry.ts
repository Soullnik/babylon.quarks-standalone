import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import type {Mesh} from '@babylonjs/core/Meshes/mesh';

/**
 * Geometry for mesh particles, as the `instancing*` arrays a system takes. A particle of size 1
 * draws it at the sizes below.
 */
export interface InstancingGeometry {
    instancingGeometry: Float32Array;
    instancingNormals: Float32Array;
    instancingUVs: Float32Array;
    instancingIndices: Uint32Array;
}

/**
 * A faceted solid round the y axis: `profile` is its outline from the bottom up, `[y, radius]`
 * pairs (radius 0 for a point), turned round in `sides` flat faces, each lit by its own normal as
 * a cut stone or an ice shard is. U goes round it (once round from +x), V up it, 0 at the lowest y
 * to 1 at the highest, so a texture runs along its length.
 */
export function faceted(profile: readonly (readonly [number, number])[], sides: number): InstancingGeometry {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const low = profile[0][0];
    const span = profile[profile.length - 1][0] - low || 1;
    const at = (ring: number, side: number) => {
        const [y, radius] = profile[ring];
        const a = (side / sides) * Math.PI * 2;
        return [Math.cos(a) * radius, y, Math.sin(a) * radius];
    };
    for (let ring = 0; ring < profile.length - 1; ring++) {
        for (let side = 0; side < sides; side++) {
            const a0 = at(ring, side);
            const a1 = at(ring, side + 1);
            const b0 = at(ring + 1, side);
            const b1 = at(ring + 1, side + 1);
            // The face's normal from its diagonals, which holds for a triangle (a point at one end).
            const d1 = [b1[0] - a0[0], b1[1] - a0[1], b1[2] - a0[2]];
            const d2 = [b0[0] - a1[0], b0[1] - a1[1], b0[2] - a1[2]];
            let n = [d1[1] * d2[2] - d1[2] * d2[1], d1[2] * d2[0] - d1[0] * d2[2], d1[0] * d2[1] - d1[1] * d2[0]];
            const mid = ((side + 0.5) / sides) * Math.PI * 2;
            if (n[0] * Math.cos(mid) + n[2] * Math.sin(mid) < 0) n = n.map((c) => -c);
            const length = Math.hypot(n[0], n[1], n[2]) || 1;
            n = n.map((c) => c / length);
            const first = positions.length / 3;
            for (const [p, u, ringOf] of [
                [a0, side / sides, ring],
                [a1, (side + 1) / sides, ring],
                [b1, (side + 1) / sides, ring + 1],
                [b0, side / sides, ring + 1],
            ] as const) {
                positions.push(p[0], p[1], p[2]);
                normals.push(n[0], n[1], n[2]);
                uvs.push(u, (profile[ringOf][0] - low) / span);
            }
            // Wound as Babylon's front faces are, so renderFace 'front' keeps the outside.
            indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
        }
    }
    return {
        instancingGeometry: new Float32Array(positions),
        instancingNormals: new Float32Array(normals),
        instancingUVs: new Float32Array(uvs),
        instancingIndices: new Uint32Array(indices),
    };
}

/** A crystal a unit long, centred: a six-sided prism pointed at both ends. */
export function crystal(radius = 0.2): InstancingGeometry {
    return faceted(
        [
            [-0.5, 0],
            [-0.3, radius],
            [0.28, radius],
            [0.5, 0],
        ],
        6
    );
}

/** A spike a unit tall standing on its base at y = 0, five-sided, swelling a little before its point. */
export function spike(radius = 0.16): InstancingGeometry {
    return faceted(
        [
            [-0.08, radius * 0.85],
            [0.12, radius],
            [0.45, radius * 0.72],
            [1, 0],
        ],
        5
    );
}

/** The arrays a mesh particle takes, read off a Babylon mesh, which is then hidden. */
export function geometryOf(mesh: Mesh): InstancingGeometry {
    mesh.isVisible = false;
    mesh.setEnabled(false);
    return {
        instancingGeometry: new Float32Array(mesh.getVerticesData(VertexBuffer.PositionKind)!),
        instancingNormals: new Float32Array(mesh.getVerticesData(VertexBuffer.NormalKind)!),
        instancingUVs: new Float32Array(mesh.getVerticesData(VertexBuffer.UVKind)!),
        instancingIndices: new Uint32Array(mesh.getIndices()!),
    };
}

export interface BandShape {
    /** Radius at the bottom and at the top; different radii flare the band. */
    bottom: number;
    top: number;
    /** From the bottom to the top along y; 0 lays the band flat, a ring in the xz plane. */
    height: number;
    /** Where the bottom sits, y; default 0. */
    base?: number;
    /** Degrees round, default 360. A partial band is centred on `center`. */
    arc?: number;
    /** Degrees round y from +x toward +z that a partial band is centred on; default -90, -z. */
    center?: number;
    /** Segments round, default 48, and rows up, default 1. */
    segments?: number;
    rows?: number;
    /**
     * Shears U by V: U at the top (or outer rim) runs `twist` ahead of the bottom, so stripes along
     * U wind round as spiral arms. Default 0. Needs rows to curve smoothly.
     */
    twist?: number;
}

/**
 * An open band round the y axis: a ring, a shockwave, a column, or flat (no height) a disk's ring
 * or a sword's crescent. U goes across it (once round a full band, from +x), V from its bottom (or,
 * flat, its inner rim) to its top: a painted strip stands on the band, a tile scrolled along U
 * flows round it.
 */
export function band(shape: BandShape): InstancingGeometry {
    const segments = shape.segments ?? 48;
    const rows = shape.rows ?? 1;
    const base = shape.base ?? 0;
    const span = ((shape.arc ?? 360) * Math.PI) / 180;
    const full = (shape.arc ?? 360) >= 360;
    const start = full ? 0 : ((shape.center ?? -90) * Math.PI) / 180 - span / 2;
    // The normal leans with the flare: outward on an upright band, up on a flat one.
    const rise = shape.height;
    const run = shape.top - shape.bottom;
    const length = Math.hypot(rise, run) || 1;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let r = 0; r <= rows; r++) {
        const v = r / rows;
        const radius = shape.bottom + run * v;
        const y = base + rise * v;
        for (let s = 0; s <= segments; s++) {
            const u = s / segments;
            const a = start + u * span;
            const c = Math.cos(a);
            const n = Math.sin(a);
            positions.push(c * radius, y, n * radius);
            normals.push((c * rise) / length, -run / length, (n * rise) / length);
            uvs.push(u + v * (shape.twist ?? 0), v);
        }
    }
    const row = segments + 1;
    for (let r = 0; r < rows; r++) {
        for (let s = 0; s < segments; s++) {
            const a = r * row + s;
            const b = a + row;
            indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
    }
    return {
        instancingGeometry: new Float32Array(positions),
        instancingNormals: new Float32Array(normals),
        instancingUVs: new Float32Array(uvs),
        instancingIndices: new Uint32Array(indices),
    };
}
