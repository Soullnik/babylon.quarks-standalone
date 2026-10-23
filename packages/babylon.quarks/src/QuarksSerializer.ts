import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Matrix, Quaternion} from '@babylonjs/core/Maths/math.vector';
import {Geometry} from '@babylonjs/core/Meshes/geometry';
import {InstancedMesh} from '@babylonjs/core/Meshes/instancedMesh';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {GeometryEntry, QuarksMaterialJSON} from './effectDocumentJSON';
import {ensureTriangleIndices} from './geometryUtil';
import {quarksNodeId} from './nodeId';
import {ParticleEmitter} from './ParticleEmitter';
import type {BabylonMetaData, ParticleSystem, ParticleSystemJSONParameters} from './ParticleSystem';
import type {AnimationJSON} from './QuarksPrefab';
import {QuarksPrefab} from './QuarksPrefab';
import {textureSourceUrl} from './textureSource';

/**
 * The version of the effect file format this library writes, in `metadata.quarksFormat`. It goes
 * up when a release writes something an older loader would read wrongly. `QuarksLoader`
 * reads every earlier version, and files written before the field existed, and warns about a
 * file from a newer version.
 */
export const QUARKS_FORMAT_VERSION = 1;

/** An image a texture reads: a url, a root-relative path, or a `data:` URI. */
export interface QuarksImageJSON {
    /** Unique within the file; other entries refer to it by this. */
    uuid: string;
    /** Relative to the file's base url, absolute, or a `data:` url. */
    url: string;
}

/**
 * A texture and its sampler state. Every field after `image` is written only when it differs from
 * Babylon's default for a `Texture`. `wrap` uses the three.js codes the format inherited: 1000
 * repeat, 1001 clamp, 1002 mirror.
 */
export interface QuarksTextureJSON {
    /** Unique within the file; other entries refer to it by this. */
    uuid: string;
    /** The {@link QuarksImageJSON} uuid; absent when the texture had no url a file can point at. */
    image?: string;
    /** Default true. */
    invertY?: boolean;
    /** Default false. */
    noMipmap?: boolean;
    /** A Babylon sampling mode constant. Default trilinear. */
    samplingMode?: number;
    /** `[u, v]`. Default repeat on both. */
    wrap?: [number, number];
    /** `[uScale, vScale]`. Default `[1, 1]`. */
    repeat?: [number, number];
    /** `[uOffset, vOffset]`. Default `[0, 0]`. */
    offset?: [number, number];
    /** `wAng`, in radians. Default 0. */
    rotation?: number;
}

/** Mesh data, inline. */
export interface QuarksGeometryJSON {
    /** Unique within the file; other entries refer to it by this. */
    uuid: string;
    /** Always `'QuarksGeometry'`. */
    type: 'QuarksGeometry';
    /** `x, y, z` per vertex. */
    positions: number[];
    /** Three per triangle. */
    indices: number[];
    /** First UV set, `u, v` per vertex. */
    uvs?: number[];
    /** Second UV set, `u, v` per vertex. */
    uvs2?: number[];
    /** `x, y, z` per vertex. */
    normals?: number[];
}

/** A node of an effect: a group, an emitter, a mesh or a prefab, with its children. */
export interface QuarksNodeJSON {
    /** Unique within the file; other entries refer to it by this. */
    uuid: string;
    /** What the node is; a type the loader does not know loads as an empty node. */
    type: 'Group' | 'ParticleEmitter' | 'Mesh' | 'QuarksPrefab' | string;
    /** The node's name. */
    name?: string;
    /**
     * Local transform, column-major, as Babylon's `Matrix.asArray()`. Always written; a three.js
     * file without it places the node by `position`, `quaternion` or `rotation`, and `scale`.
     */
    matrix?: number[];
    /** Written only when the node is disabled (false); loads it disabled, with everything under it. */
    visible?: boolean;
    /** `Mesh`: written only when the mesh is not drawn (`isVisible`), which leaves its children drawn. */
    isVisible?: false;
    /** Child nodes, in order. */
    children?: QuarksNodeJSON[];
    /** `ParticleEmitter`: the system. */
    ps?: ParticleSystemJSONParameters;
    /** `Mesh`: the {@link QuarksGeometryJSON} uuid. */
    geometry?: string;
    /** `Mesh`: the material uuid; a three.js mesh may list several, of which the first is used. */
    material?: string | string[];
    /** `QuarksPrefab`: the timeline's speed, written only when not 1. */
    timeScale?: number;
    /** `QuarksPrefab`: the timeline's tracks. */
    animationData?: AnimationJSON[];
    /** three.js files without `matrix`: the position as `[x, y, z]`. */
    position?: number[];
    /** three.js files without `matrix`: the scale as `[x, y, z]`. */
    scale?: number[];
    /** three.js files without `matrix`: the rotation as a quaternion `[x, y, z, w]`. */
    quaternion?: number[];
    /** three.js files without `matrix` or `quaternion`: Euler angles `[x, y, z]` in radians. */
    rotation?: number[];
}

/** A whole effect, as {@link serializeEffect} writes it and `QuarksLoader` reads it. */
export interface QuarksEffectJSON {
    /** What wrote the file, and which format version it follows. */
    metadata: {
        /** The three.js object format version the envelope follows. */
        version: number;
        /** Always `'Object3D'`. */
        type: 'Object3D';
        /** The tool that wrote the file, from {@link SerializeEffectOptions.generator}. */
        generator: string;
        /** See {@link QUARKS_FORMAT_VERSION}. */
        quarksFormat: number;
    };
    /** Meshes the nodes and particle systems use. */
    geometries: QuarksGeometryJSON[];
    /** Materials the particle systems and `Mesh` nodes use, referred to by uuid. */
    materials: QuarksMaterialJSON[];
    /** Textures the particle systems use. */
    textures: QuarksTextureJSON[];
    /** Image files the textures load. */
    images: QuarksImageJSON[];
    /** The effect's root node. */
    object: QuarksNodeJSON;
}

/** Options for {@link serializeEffect}. */
export interface SerializeEffectOptions {
    /** Written to `metadata.generator`. Default `'babylon.quarks'`. */
    generator?: string;
    /**
     * Leaves a node and everything under it out of the file when it returns false, e.g. helpers an
     * editor parents under an effect.
     */
    filter?: (node: TransformNode) => boolean;
    /**
     * Called for each part of the effect the file cannot hold as it is, such as a texture with no
     * url a file can point at. Default: `console.warn`.
     */
    onWarning?: (message: string) => void;
    /** Several roots are written as children of one group; its name. Default `'effect'`. */
    name?: string;
    /**
     * The url written for a texture's image. Default: the url the texture's image had in the file
     * it was loaded from (see {@link textureSourceUrl}), so a file saved next to its source loads
     * the same images; for a texture made in code, its `url`. Return a path relative to where the
     * file will be saved when that differs from the source, or give a texture made in code a url or
     * a `data:` URI. Return `null` to write the texture without an image.
     */
    imageUrl?: (texture: Texture) => string | null | undefined;
}

/** three.js wrap codes, as the loader reads them. */
const WRAP_TO_JSON: {[mode: number]: number} = {
    [Texture.WRAP_ADDRESSMODE]: 1000,
    [Texture.CLAMP_ADDRESSMODE]: 1001,
    [Texture.MIRROR_ADDRESSMODE]: 1002,
};

/**
 * Whether a file can name `url` and get the image back elsewhere. A `blob:` url lives only in the
 * page that made it, and Babylon's glTF loader names embedded images with a `data:` placeholder
 * that has no payload.
 */
function isPortableUrl(url: string | null | undefined): url is string {
    if (!url) {
        return false;
    }
    if (/^blob:/i.test(url)) {
        return false;
    }
    return !/^data:/i.test(url) || url.includes(',');
}

function localMatrix(node: TransformNode): number[] {
    const rotation = node.rotationQuaternion ?? Quaternion.FromEulerVector(node.rotation);
    return Array.from(Matrix.Compose(node.scaling, rotation, node.position).asArray());
}

class EffectWriter {
    readonly meta: BabylonMetaData = {geometries: {}, materials: {}, textures: {}};
    private readonly meshGeometries = new Map<string, QuarksGeometryJSON>();
    private readonly geometryIds = new Map<Geometry, string>();
    private readonly meshMaterials: Array<{json: QuarksMaterialJSON; map: BaseTexture | null}> = [];
    private readonly meshMaterialIds = new Map<StandardMaterial, string>();
    private readonly extraTextures = new Map<BaseTexture, string>();
    private nextId = 0;

    constructor(private readonly options: SerializeEffectOptions) {}

    /** Reports links to nodes the file does not hold: they load unresolved. */
    private warnDanglingLinks(object: QuarksNodeJSON): void {
        const written = new Set<string>();
        const nodes: QuarksNodeJSON[] = [];
        const walk = (node: QuarksNodeJSON) => {
            written.add(node.uuid);
            nodes.push(node);
            node.children?.forEach(walk);
        };
        walk(object);
        for (const node of nodes) {
            for (const [kind, target] of links(node)) {
                if (target !== '' && !written.has(target)) {
                    this.warn(
                        `"${node.name}" has ${kind} on node "${target}", which is not in what is written; ` +
                            'it loads without that link.'
                    );
                }
            }
        }
    }

    warn(message: string): void {
        (this.options.onWarning ?? ((m: string) => console.warn(`[quarks] ${m}`)))(message);
    }

    node(node: TransformNode): QuarksNodeJSON {
        const children = node
            .getChildren((child) => child instanceof TransformNode, true)
            .filter((child) => this.options.filter?.(child as TransformNode) !== false)
            .map((child) => this.node(child as TransformNode));
        const json: QuarksNodeJSON = {
            uuid: quarksNodeId(node),
            type: 'Group',
            name: node.name,
            matrix: localMatrix(node),
        };
        if (!node.isEnabled(false)) {
            json.visible = false;
        }
        // A mesh that is not drawn, such as a mesh surface shape's source, may still parent emitters.
        if (node instanceof Mesh && !node.isVisible) {
            json.isVisible = false;
        }

        if (node instanceof ParticleEmitter) {
            json.type = 'ParticleEmitter';
            json.ps = (node.system as ParticleSystem).toJSON(this.meta);
        } else if (node instanceof QuarksPrefab) {
            const {type: _type, name: _name, ...prefab} = node.toJSON();
            Object.assign(json, prefab);
            json.type = 'QuarksPrefab';
        } else if (node instanceof Mesh) {
            json.type = 'Mesh';
            json.geometry = this.meshGeometry(node);
            json.material = this.meshMaterial(node);
        } else if (node instanceof InstancedMesh) {
            this.warn(`"${node.name}" is an instance of "${node.sourceMesh.name}"; it is written as a group.`);
        }
        if (children.length > 0) {
            json.children = children;
        }
        return json;
    }

    private id(prefix: string): string {
        this.nextId += 1;
        return `${prefix}_${this.nextId}`;
    }

    private meshGeometry(mesh: Mesh): string | undefined {
        // Meshes sharing one Geometry (clones) share one entry.
        const shared = mesh.geometry ? this.geometryIds.get(mesh.geometry) : undefined;
        if (shared !== undefined) {
            return shared;
        }
        const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
        if (!positions || positions.length === 0) {
            this.warn(`Mesh "${mesh.name}" has no vertices; it is written without geometry.`);
            return undefined;
        }
        // An unindexed mesh draws its vertices in order, as the loader does for a file without indices.
        const indexed = mesh.getIndices();
        const indices = ensureTriangleIndices(
            positions instanceof Float32Array ? positions : new Float32Array(positions),
            indexed && indexed.length > 0 ? Uint32Array.from(indexed) : undefined
        );
        const read = (kind: string) => {
            const data = mesh.getVerticesData(kind);
            return data ? Array.from(data) : undefined;
        };
        const geometry: QuarksGeometryJSON = {
            uuid: this.id('quarks_mesh_geometry'),
            type: 'QuarksGeometry',
            positions: Array.from(positions),
            indices: Array.from(indices),
        };
        const uvs = read(VertexBuffer.UVKind);
        const uvs2 = read(VertexBuffer.UV2Kind);
        const normals = read(VertexBuffer.NormalKind);
        if (uvs) geometry.uvs = uvs;
        if (uvs2) geometry.uvs2 = uvs2;
        if (normals) geometry.normals = normals;
        this.meshGeometries.set(geometry.uuid, geometry);
        if (mesh.geometry) {
            this.geometryIds.set(mesh.geometry, geometry.uuid);
        }
        return geometry.uuid;
    }

    /**
     * A mesh node's material, as far as the loader rebuilds one: blend, culling, alpha cutoff,
     * depth write and the diffuse texture of a StandardMaterial. A source mesh for a mesh surface
     * shape is usually hidden and needs none.
     */
    private meshMaterial(mesh: Mesh): string | undefined {
        const material = mesh.material;
        if (!material) {
            return undefined;
        }
        if (!(material instanceof StandardMaterial)) {
            this.warn(
                `Mesh "${mesh.name}" has a ${material.getClassName()}; only a StandardMaterial's blend, ` +
                    'culling and diffuse texture are written, so it loads without a material.'
            );
            return undefined;
        }
        let uuid = this.meshMaterialIds.get(material);
        if (uuid !== undefined) {
            return uuid;
        }
        uuid = this.id('quarks_mesh_material');
        this.meshMaterialIds.set(material, uuid);
        const white = material.diffuseColor.r === 1 && material.diffuseColor.g === 1 && material.diffuseColor.b === 1;
        const black =
            material.emissiveColor.r === 0 && material.emissiveColor.g === 0 && material.emissiveColor.b === 0;
        if (material.alpha !== 1 || !white || !black) {
            this.warn(`Mesh "${mesh.name}": its material's alpha and colours are not written; it loads opaque white.`);
        }
        // Each field only when it differs from what the loader gives a material without it.
        const json: QuarksMaterialJSON = {uuid, type: 'MeshBasicMaterial'};
        if (material.alphaMode !== Constants.ALPHA_COMBINE) json.alphaMode = material.alphaMode;
        if (material.backFaceCulling) json.side = 0;
        if (material.alphaCutOff !== 0) json.alphaTest = material.alphaCutOff;
        if (!material.disableDepthWrite) json.depthWrite = true;
        // The texture's uuid is settled in finish(), once the systems have written theirs.
        this.meshMaterials.push({json, map: material.diffuseTexture});
        return uuid;
    }

    /** The uuid of a texture a mesh node uses: the systems' entry for it, or one of its own. */
    private texture(texture: BaseTexture): string {
        for (const [uuid, known] of Object.entries(this.meta.textures)) {
            if (known === texture) {
                return uuid;
            }
        }
        let uuid = this.extraTextures.get(texture);
        if (uuid === undefined) {
            uuid = this.id('quarks_mesh_texture');
            this.extraTextures.set(texture, uuid);
        }
        return uuid;
    }

    finish(object: QuarksNodeJSON): QuarksEffectJSON {
        const meshMaterials = this.meshMaterials.map(({json, map}) => (map ? {...json, map: this.texture(map)} : json));
        this.warnDanglingLinks(object);
        const images: QuarksImageJSON[] = [];
        const imageIds = new Map<string, string>();
        const textures: QuarksTextureJSON[] = [];
        const entries: Array<[string, BaseTexture | null]> = [
            ...Object.entries(this.meta.textures),
            ...[...this.extraTextures].map(([texture, uuid]) => [uuid, texture] as [string, BaseTexture]),
        ];
        for (const [uuid, texture] of entries) {
            if (texture === null) {
                continue;
            }
            const json: QuarksTextureJSON = {uuid};
            const url =
                texture instanceof Texture
                    ? this.options.imageUrl
                        ? this.options.imageUrl(texture)
                        : (textureSourceUrl(texture) ?? texture.url)
                    : null;
            if (isPortableUrl(url)) {
                let image = imageIds.get(url);
                if (image === undefined) {
                    image = `quarks_image_${imageIds.size + 1}`;
                    imageIds.set(url, image);
                    images.push({uuid: image, url});
                }
                json.image = image;
            } else {
                this.warn(
                    `Texture "${texture.name}" has no url a file can point at (made in code, a blob: url, ` +
                        'or an image embedded in a glTF); it is written without its image and loads as no ' +
                        'texture. Give it a file url or a data: URI before saving.'
                );
            }
            if (texture instanceof Texture) {
                Object.assign(json, samplerJSON(texture));
            }
            textures.push(json);
        }

        const materials = Object.values(this.meta.materials).map((material) => {
            // The live Babylon material is for in-memory reuse only.
            const {sourceMaterial: _sourceMaterial, ...serializable} = material;
            return serializable;
        });

        return {
            metadata: {
                version: 4.5,
                type: 'Object3D',
                generator: this.options.generator ?? 'babylon.quarks',
                quarksFormat: QUARKS_FORMAT_VERSION,
            },
            geometries: [
                ...Object.values(this.meta.geometries).filter(isQuarksGeometryJSON),
                ...this.meshGeometries.values(),
            ],
            materials: [...materials, ...meshMaterials],
            textures,
            images,
            object,
        };
    }
}

/** Whether a system's geometry entry is inline quarks data, the form its `toJSON` writes. */
function isQuarksGeometryJSON(entry: GeometryEntry): entry is QuarksGeometryJSON {
    return 'type' in entry && entry.type === 'QuarksGeometry' && Array.isArray(entry.positions);
}

/** Ids a written document links to by uuid, by the kind of link. */
function* links(node: QuarksNodeJSON): Generator<[string, string]> {
    const ps = node.ps;
    for (const behavior of ps?.behaviors ?? []) {
        if (
            behavior.type === 'EmitSubParticleSystem' &&
            'subParticleSystem' in behavior &&
            typeof behavior.subParticleSystem === 'string'
        ) {
            yield ['a sub emitter', behavior.subParticleSystem];
        }
    }
    if (ps?.shape?.type === 'mesh_surface' && typeof ps.shape.mesh === 'string') {
        yield ['a mesh surface shape', ps.shape.mesh];
    }
    for (const animation of node.animationData ?? []) {
        if (typeof animation.targetUUID === 'string') {
            yield ['a prefab animation', animation.targetUUID];
        }
    }
}

/** A texture's sampler state, each field only when it differs from a new Texture's. */
function samplerJSON(texture: Texture): Partial<QuarksTextureJSON> {
    const json: Partial<QuarksTextureJSON> = {};
    if (!texture.invertY) json.invertY = false;
    if (texture.noMipmap) json.noMipmap = true;
    if (texture.samplingMode !== Constants.TEXTURE_TRILINEAR_SAMPLINGMODE) json.samplingMode = texture.samplingMode;
    if (texture.wrapU !== Texture.WRAP_ADDRESSMODE || texture.wrapV !== Texture.WRAP_ADDRESSMODE) {
        json.wrap = [WRAP_TO_JSON[texture.wrapU] ?? 1000, WRAP_TO_JSON[texture.wrapV] ?? 1000];
    }
    if (texture.uScale !== 1 || texture.vScale !== 1) json.repeat = [texture.uScale, texture.vScale];
    if (texture.uOffset !== 0 || texture.vOffset !== 0) json.offset = [texture.uOffset, texture.vOffset];
    if (texture.wAng !== 0) json.rotation = texture.wAng;
    return json;
}

/**
 * Writes an effect, the node tree under `root` with its emitters, meshes and prefabs, as one JSON
 * document `QuarksLoader` loads back: the counterpart of `loader.load()`. The result holds
 * only plain data, so `JSON.stringify` takes it as is. Nodes keep their ids
 * ({@link quarksNodeId}), so sub emitters, mesh surface shapes and prefab animations still find
 * their targets, and a loaded effect saved again writes the same file.
 *
 * Textures are written by url, with their sampler state. One with no url a file can point at is
 * written without its image and reported through `onWarning`. Several roots are written as
 * children of one group.
 */
export function serializeEffect(
    root: TransformNode | TransformNode[],
    options: SerializeEffectOptions = {}
): QuarksEffectJSON {
    const writer = new EffectWriter(options);
    let object: QuarksNodeJSON;
    if (Array.isArray(root)) {
        const name = options.name ?? 'effect';
        object = {
            uuid: `${name}-root`,
            type: 'Group',
            name,
            matrix: Matrix.Identity().asArray().slice(),
            children: root.map((node) => writer.node(node)),
        };
    } else {
        object = writer.node(root);
    }
    return writer.finish(object);
}
