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
