import type {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import type {
    MeshLighting,
    MeshRim,
    ParticleErosionOptions,
    ParticleGradientMap,
    ParticleUVDistortionOptions,
    TextureUV,
} from './batchSettings';
import type {QuarksEffectJSON, QuarksNodeJSON, QuarksTextureJSON} from './QuarksSerializer';
import type {ParticleMaterialSource} from './system/materialResolve';

// The parts of an effect document `QuarksLoader` reads: what `serializeEffect` writes, and the
// three.js object format three.quarks files use. Every field a file may leave out is optional; the
// loader checks what it reads, so a field of the wrong kind warns or is skipped, never throws.

/** Mesh data as typed arrays, the form a loaded geometry takes. */
export interface GeometryArrays {
    /** `x, y, z` per vertex. */
    positions: Float32Array;
    /** Three per triangle. */
    indices: Uint32Array | Uint16Array;
    /** First UV set, `u, v` per vertex. */
    uvs?: Float32Array;
    /** Second UV set, `u, v` per vertex. */
    uvs2?: Float32Array;
    /** `x, y, z` per vertex. */
    normals?: Float32Array;
}

/** A three.js `BufferAttribute`, inline or as a view into an interleaved buffer. */
export interface BufferAttributeJSON {
    /** The values, when the attribute holds its own. */
    array?: number[];
    /** Components per vertex. */
    itemSize?: number;
    /** The typed array type, e.g. `'Float32Array'` or `'Uint16Array'`. */
    type?: string;
    /** Set when the attribute reads an interleaved buffer. */
    isInterleavedBufferAttribute?: boolean;
    /** The interleaved buffer's uuid. */
    data?: string;
    /** Where the attribute starts in each interleaved vertex. */
    offset?: number;
}

/** A three.js interleaved buffer: a stride over one of the geometry's array buffers. */
export interface InterleavedBufferJSON {
    /** The array buffer's uuid. */
    buffer: string;
    /** Floats per vertex. */
    stride: number;
}

/** The vertex attributes of a three.js `BufferGeometry` that quarks reads. */
export interface BufferGeometryAttributesJSON {
    /** Positions, `x, y, z` per vertex. */
    position?: BufferAttributeJSON;
    /** The first UV set. */
    uv?: BufferAttributeJSON;
    /** The second UV set, as three.js r151 on names it. */
    uv1?: BufferAttributeJSON;
    /** The second UV set, as three.js before r151 names it. */
    uv2?: BufferAttributeJSON;
    /** Normals, `x, y, z` per vertex. */
    normal?: BufferAttributeJSON;
}

/** The index of a three.js `BufferGeometry`. */
export interface BufferIndexJSON {
    /** `'Uint16Array'` or `'Uint32Array'`; 32-bit when absent. */
    type?: string;
    /** Three per triangle. */
    array: number[];
}

/** The `data` of a three.js `BufferGeometry`. */
export interface BufferGeometryDataJSON {
    /** The vertex attributes. */
    attributes?: BufferGeometryAttributesJSON;
    /** The triangle indices. */
    index?: BufferIndexJSON;
    /** Interleaved buffers by uuid. */
    interleavedBuffers?: {[uuid: string]: InterleavedBufferJSON};
    /** The bytes of the interleaved buffers by uuid, as 32-bit words. */
    arrayBuffers?: {[uuid: string]: number[] | ArrayBuffer};
}

/** A three.js `BufferGeometry`. */
export interface BufferGeometryJSON {
    /** Unique within the file. */
    uuid: string;
    /** Always `'BufferGeometry'`. */
    type: 'BufferGeometry';
    /** The vertex data. */
    data?: BufferGeometryDataJSON;
}

/** A three.js `PlaneGeometry`: a quad in XY. */
export interface PlaneGeometryJSON {
    /** Unique within the file. */
    uuid: string;
    /** Always `'PlaneGeometry'`. */
    type: 'PlaneGeometry';
    /** Default 1. */
    width?: number;
    /** Default 1. */
    height?: number;
}

/** A three.js `SphereGeometry`. */
export interface SphereGeometryJSON {
    /** Unique within the file. */
    uuid: string;
    /** Always `'SphereGeometry'`. */
    type: 'SphereGeometry';
    /** Default 0.5. */
    radius?: number;
    /** Default 16, at least 3. */
    widthSegments?: number;
    /** Default 8, at least 2. */
    heightSegments?: number;
    /** Default 0. */
    phiStart?: number;
    /** Default 2π. */
    phiLength?: number;
    /** Default 0. */
    thetaStart?: number;
    /** Default π. */
    thetaLength?: number;
}

/**
 * Quarks' own mesh data, inline (see `QuarksGeometryJSON`) or in its own file at `url`, which
 * `QuarksLoader.resolveResources` inlines before parsing.
 */
export interface QuarksGeometryEntryJSON {
    /** Unique within the file. */
    uuid: string;
    /** Always `'QuarksGeometry'`. */
    type: 'QuarksGeometry';
    /** The file that holds the data, until it is inlined. */
    url?: string;
    /** `x, y, z` per vertex. */
    positions?: number[];
    /** Three per triangle. */
    indices?: number[];
    /** First UV set. */
    uvs?: number[];
    /** Second UV set. */
    uvs2?: number[];
    /** `x, y, z` per vertex. */
    normals?: number[];
}

/** A geometry entry of an effect document. */
export type EffectGeometryJSON = QuarksGeometryEntryJSON | BufferGeometryJSON | PlaneGeometryJSON | SphereGeometryJSON;

/** An image entry of an effect document. */
export interface EffectImageJSON {
    /** Unique within the file. */
    uuid: string;
    /** Relative to the file's base url, absolute, or a `data:` url; absent for an image with no file. */
    url?: string;
}

/**
 * A texture slot of a {@link QuarksMaterialJSON}: a texture uuid in a file, the texture itself once
 * a loader resolved it, or null for a texture that could not be made.
 */
export type MaterialTextureRef = string | BaseTexture | null;

/** The gradient mapping of a {@link QuarksMaterialJSON}; see `ParticleSystem.gradientMap`. */
export interface GradientMapJSON extends Omit<Partial<ParticleGradientMap>, 'ramp'> {
    /** The ramp texture. */
    ramp?: MaterialTextureRef;
}

/** The erosion of a {@link QuarksMaterialJSON}; see `ParticleSystem.erosion`. */
export type ErosionJSON = Omit<ParticleErosionOptions, 'mask'> & {
    /** The mask texture. */
    mask?: MaterialTextureRef;
};

/** The UV distortion of a {@link QuarksMaterialJSON}; see `ParticleSystem.uvDistortion`. */
export type UVDistortionJSON = Omit<ParticleUVDistortionOptions, 'map'> & {
    /** The distortion texture. */
    map?: MaterialTextureRef;
};

/**
 * A material entry of an effect document: what a particle system's material writes (`type`
 * `'QuarksMaterial'`), or a three.js material, whose `map` and `blending` the loader reads too.
 */
export interface QuarksMaterialJSON {
    /** Unique within the file. */
    uuid: string;
    /** `'QuarksMaterial'`, or the three.js material type. */
    type?: string;
    /** Whether the particles blend. Default true. */
    transparent?: boolean;
    /** A Babylon alpha mode constant. */
    alphaMode?: number;
    /** A three.js blending code (1 normal, 2 additive, 3 subtractive, 4 multiply), read without `alphaMode`. */
    blending?: number;
    /** A three.js side code; 2 draws both faces. */
    side?: number;
    /** Default true. */
    depthTest?: boolean;
    /** Default false. */
    depthWrite?: boolean;
    /** Default 0. */
    alphaTest?: number;
    /** The particle texture. */
    texture?: MaterialTextureRef;
    /** A three.js material's texture, read when there is no `texture`. */
    map?: string;
    /** A 3×2 environment atlas for reflections. */
    reflectionAtlas?: MaterialTextureRef;
    /** How strong the reflection is. */
    reflectionLevel?: number;
    /** Mesh particle lighting; `'fixed'` when absent. */
    lighting?: MeshLighting;
    /** Mesh particle rim. */
    rim?: Partial<MeshRim>;
    /** The particle texture's UV transform. */
    mapUV?: Partial<TextureUV>;
    /** Gradient mapping. */
    gradientMap?: GradientMapJSON;
    /** Erosion. */
    erosion?: ErosionJSON;
    /** UV distortion. */
    uvDistortion?: UVDistortionJSON;
    /** While writing: the material the system read its settings from. Never written to a file. */
    sourceMaterial?: ParticleMaterialSource;
}

/**
 * A geometry as an effect's resources hold it: an entry of the document, or, once loaded, its
 * typed arrays.
 */
export type GeometryEntry = EffectGeometryJSON | GeometryArrays;

/**
 * An effect document as `QuarksLoader` reads it: what `serializeEffect` writes
 * (`QuarksEffectJSON`), or a three.quarks / three.js object file. Only `object` is required.
 */
export interface EffectDocumentJSON {
    /** What wrote the file. */
    metadata?: Partial<QuarksEffectJSON['metadata']>;
    /** Meshes the nodes and particle systems use. */
    geometries?: EffectGeometryJSON[];
    /** Materials, referred to by uuid. */
    materials?: QuarksMaterialJSON[];
    /** Textures, referred to by uuid. */
    textures?: QuarksTextureJSON[];
    /** Image files the textures load. */
    images?: EffectImageJSON[];
    /** The effect's root node. */
    object: QuarksNodeJSON;
}
