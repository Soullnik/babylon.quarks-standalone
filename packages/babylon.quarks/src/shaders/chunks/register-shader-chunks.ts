import softFragment from './soft_fragment.glsl';
import softParsFragment from './soft_pars_fragment.glsl';
import softParsVertex from './soft_pars_vertex.glsl';
import softVertex from './soft_vertex.glsl';
import tileFragment from './tile_fragment.glsl';
import tileParsFragment from './tile_pars_fragment.glsl';
import tileParsVertex from './tile_pars_vertex.glsl';
import tileVertex from './tile_vertex.glsl';

const shaderChunks: Record<string, string> = {};
let registered = false;

export function registerShaderChunks(): void {
    if (registered) return;
    shaderChunks.tile_pars_vertex = tileParsVertex;
    shaderChunks.tile_vertex = tileVertex;
    shaderChunks.tile_pars_fragment = tileParsFragment;
    shaderChunks.tile_fragment = tileFragment;
    shaderChunks.soft_pars_vertex = softParsVertex;
    shaderChunks.soft_vertex = softVertex;
    shaderChunks.soft_pars_fragment = softParsFragment;
    shaderChunks.soft_fragment = softFragment;
    registered = true;
}

export function getShaderChunk(chunkName: string): string | undefined {
    return shaderChunks[chunkName];
}

export function getRegisteredShaderChunks(): Readonly<Record<string, string>> {
    return shaderChunks;
}
