/** `indices` when there are some, else `0..N-1`: each three vertices of `positions` one triangle. */
export function ensureTriangleIndices(
    positions: Float32Array,
    indices?: Uint32Array | Uint16Array
): Uint32Array | Uint16Array {
    if (indices && indices.length > 0) {
        return indices;
    }
    const vertexCount = positions.length / 3;
    const out = new Uint32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
        out[i] = i;
    }
    return out;
}
