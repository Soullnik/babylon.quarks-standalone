import {getRegisteredShaderChunks, getShaderChunk, registerShaderChunks} from '../src';

describe('shader chunks registry', () => {
    it('registers chunk names for shader parity surface', () => {
        registerShaderChunks();
        const chunks = getRegisteredShaderChunks();
        expect(Object.keys(chunks).length).toBeGreaterThanOrEqual(8);
        expect(getShaderChunk('soft_fragment')).toBeDefined();
        expect(getShaderChunk('tile_vertex')).toBeDefined();
    });

    it('is idempotent and returns undefined for unknown chunk names', () => {
        registerShaderChunks();
        const first = getRegisteredShaderChunks();
        registerShaderChunks();
        expect(getRegisteredShaderChunks()).toBe(first);
        expect(getShaderChunk('__no_such_chunk__')).toBeUndefined();
    });
});
