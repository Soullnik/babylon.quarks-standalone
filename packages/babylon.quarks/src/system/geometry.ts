import {ensureTriangleIndices} from '../geometryUtil';

/** Positions of the unit quad billboards are drawn with, and the default mesh. */
export const DEFAULT_POSITIONS = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
/** UVs of the default quad. */
export const DEFAULT_UVS = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
/** Indices of the default quad's two triangles. */
export const DEFAULT_INDICES = new Uint32Array([0, 1, 2, 0, 2, 3]);

/** Zero UVs sized to a position buffer — missing/mismatched uv attrs → GL_INVALID_OPERATION on iOS. */
const fallbackUVs = new WeakMap<Float32Array, Float32Array>();
const fallbackNormals = new WeakMap<Float32Array, Float32Array>();

/**
 * Zero UVs for a geometry given without any, one array per geometry: batches
 * are keyed by the UV array too, so systems sharing a geometry share it.
 */
export function fallbackUVsForPositions(positions: Float32Array): Float32Array {
    let uvs = fallbackUVs.get(positions);
    if (uvs === undefined || uvs.length !== (positions.length / 3) * 2) {
        uvs = new Float32Array((positions.length / 3) * 2);
        fallbackUVs.set(positions, uvs);
    }
    return uvs;
}

/** Whether `uvs` are the ones {@link fallbackUVsForPositions} made for `positions`. */
export function isFallbackUVs(uvs: Float32Array | undefined, positions: Float32Array): boolean {
    return uvs !== undefined && uvs === fallbackUVs.get(positions);
}

/** Normals facing +Z, one array per geometry so systems sharing it still batch together. */
export function fallbackNormalsForPositions(positions: Float32Array): Float32Array {
    let normals = fallbackNormals.get(positions);
    if (!normals) {
        normals = new Float32Array(positions.length);
        for (let i = 2; i < normals.length; i += 3) {
            normals[i] = 1;
        }
        fallbackNormals.set(positions, normals);
    }
    return normals;
}

/** Whether `normals` are the ones {@link fallbackNormalsForPositions} made for `positions`. */
export function isFallbackNormals(normals: Float32Array | undefined, positions: Float32Array): boolean {
    return normals !== undefined && normals === fallbackNormals.get(positions);
}

/**
 * Typed arrays from a geometry entry of an effect document: quarks' own `{positions, indices, uvs,
 * uvs2, normals}`, or a three.js `BufferGeometry` JSON. Anything else gives the default quad.
 */
export function resolveGeometryData(entry: any): {
    positions: Float32Array;
    indices: Uint32Array | Uint16Array;
    uvs?: Float32Array;
    uvs2?: Float32Array;
    normals?: Float32Array;
} {
    if (entry?.positions) {
        const positions = entry.positions instanceof Float32Array ? entry.positions : new Float32Array(entry.positions);
        const rawIndices =
            entry.indices instanceof Uint16Array || entry.indices instanceof Uint32Array
                ? entry.indices
                : entry.indices
                  ? new Uint32Array(entry.indices)
                  : undefined;
        return {
            positions,
            indices: ensureTriangleIndices(positions, rawIndices),
            uvs: entry.uvs ? (entry.uvs instanceof Float32Array ? entry.uvs : new Float32Array(entry.uvs)) : undefined,
            uvs2: entry.uvs2
                ? entry.uvs2 instanceof Float32Array
                    ? entry.uvs2
                    : new Float32Array(entry.uvs2)
                : undefined,
            normals: entry.normals
                ? entry.normals instanceof Float32Array
                    ? entry.normals
                    : new Float32Array(entry.normals)
                : undefined,
        };
    }

    const data = entry?.data ?? entry;
    if (data?.attributes?.position?.array) {
        const positions = new Float32Array(data.attributes.position.array);
        let indices: Uint32Array | Uint16Array | undefined;
        if (data.index?.array) {
            const indexType = data.index.type === 'Uint16Array' ? Uint16Array : Uint32Array;
            indices = new indexType(data.index.array);
        }
        return {
            positions,
            indices: ensureTriangleIndices(positions, indices),
            uvs: data.attributes.uv?.array ? new Float32Array(data.attributes.uv.array) : undefined,
            // three.js names the second set `uv1` (r151 on), `uv2` before.
            uvs2: (data.attributes.uv1 ?? data.attributes.uv2)?.array
                ? new Float32Array((data.attributes.uv1 ?? data.attributes.uv2).array)
                : undefined,
            normals: data.attributes.normal?.array ? new Float32Array(data.attributes.normal.array) : undefined,
        };
    }

    return {
        positions: DEFAULT_POSITIONS,
        indices: DEFAULT_INDICES,
        uvs: DEFAULT_UVS,
    };
}
