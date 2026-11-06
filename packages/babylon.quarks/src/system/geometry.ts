import type {BufferAttributeJSON, BufferGeometryDataJSON, GeometryArrays, GeometryEntry} from '../effectDocumentJSON';
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

/** `values` as a Float32Array: itself when it is one, else a copy. */
function floats(values: number[] | Float32Array | undefined): Float32Array | undefined {
    return values ? (values instanceof Float32Array ? values : new Float32Array(values)) : undefined;
}

/** The largest value of each integer array type, which a normalized attribute's 1 stands for. */
const NORMALIZED_MAX: {[type: string]: number} = {
    Uint8Array: 255,
    Uint8ClampedArray: 255,
    Int8Array: 127,
    Uint16Array: 65535,
    Int16Array: 32767,
    Uint32Array: 4294967295,
    Int32Array: 2147483647,
};

/**
 * A three.js colour attribute as {@link GeometryArrays.colors}: `r, g, b, a` per vertex from 0
 * to 1, alpha 1 where it holds `r, g, b` only, and normalized integers scaled as WebGL reads them.
 * `values` are the attribute's own (`array`) or read out of an interleaved buffer. Undefined for an
 * attribute of another size, or one that does not hold a whole number of vertices.
 * @internal
 */
export function colorAttributeRGBA(
    attribute: BufferAttributeJSON | undefined,
    values: ArrayLike<number> | undefined = attribute?.array
): Float32Array | undefined {
    const size = attribute?.itemSize ?? 4;
    if (!values || (size !== 3 && size !== 4) || values.length % size !== 0) {
        return undefined;
    }
    const max = attribute?.normalized ? NORMALIZED_MAX[attribute.type ?? ''] : undefined;
    const signed = attribute?.type?.startsWith('Int') ?? false;
    const count = values.length / size;
    const rgba = new Float32Array(count * 4);
    for (let v = 0; v < count; v++) {
        for (let c = 0; c < 4; c++) {
            let value = c < size ? values[v * size + c] : 1;
            if (max !== undefined && c < size) {
                value = signed ? Math.max(value / max, -1) : value / max;
            }
            rgba[v * 4 + c] = value;
        }
    }
    return rgba;
}

/**
 * Typed arrays from a geometry entry of an effect document: quarks' own `{positions, indices, uvs,
 * uvs2, normals, colors}`, or a three.js `BufferGeometry` JSON or its `data`. Anything else gives the
 * default quad.
 */
export function resolveGeometryData(entry: GeometryEntry | BufferGeometryDataJSON | undefined): GeometryArrays {
    if (entry && 'positions' in entry && entry.positions) {
        const positions = floats(entry.positions)!;
        const rawIndices =
            entry.indices instanceof Uint16Array || entry.indices instanceof Uint32Array
                ? entry.indices
                : entry.indices
                  ? new Uint32Array(entry.indices)
                  : undefined;
        return {
            positions,
            indices: ensureTriangleIndices(positions, rawIndices),
            uvs: floats(entry.uvs),
            uvs2: floats(entry.uvs2),
            normals: floats(entry.normals),
            colors: floats(entry.colors),
        };
    }

    const data = entry && 'data' in entry ? entry.data : entry;
    const attributes = data && 'attributes' in data ? data.attributes : undefined;
    const position = attributes?.position?.array;
    if (data && 'attributes' in data && attributes && position) {
        const positions = new Float32Array(position);
        let indices: Uint32Array | Uint16Array | undefined;
        if (data.index?.array) {
            const indexType = data.index.type === 'Uint16Array' ? Uint16Array : Uint32Array;
            indices = new indexType(data.index.array);
        }
        return {
            positions,
            indices: ensureTriangleIndices(positions, indices),
            uvs: floats(attributes.uv?.array),
            // three.js names the second set `uv1` (r151 on), `uv2` before.
            uvs2: floats((attributes.uv1 ?? attributes.uv2)?.array),
            normals: floats(attributes.normal?.array),
            colors: colorAttributeRGBA(attributes.color),
        };
    }

    return {
        positions: DEFAULT_POSITIONS,
        indices: DEFAULT_INDICES,
        uvs: DEFAULT_UVS,
    };
}
