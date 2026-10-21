import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {Constants} from '@babylonjs/core/Engines/constants';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Matrix, Quaternion} from '@babylonjs/core/Maths/math.vector';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {quarksNodeId} from './nodeId';
import {ParticleEmitter} from './ParticleEmitter';
import type {BabylonMetaData, ParticleSystem, ParticleSystemJSONParameters} from './ParticleSystem';
import {QuarksPrefab} from './QuarksPrefab';

/**
 * The version of the effect file format this library writes, in `metadata.quarksFormat`. It goes
 * up when a release writes something an older loader would read wrongly. `QuarksLoader`
 * reads every earlier version, and files written before the field existed, and warns about a
 * file from a newer version.
 */
export const QUARKS_FORMAT_VERSION = 1;

/** An image a texture reads: a url, a root-relative path, or a `data:` URI. */
export interface QuarksImageJSON {
    uuid: string;
    url: string;
}

/**
 * A texture and its sampler state. Every field after `image` is written only when it differs from
 * Babylon's default for a `Texture`. `wrap` uses the three.js codes the format inherited: 1000
 * repeat, 1001 clamp, 1002 mirror.
 */
export interface QuarksTextureJSON {
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
    uuid: string;
    type: 'QuarksGeometry';
    positions: number[];
    indices: number[];
    uvs?: number[];
    uvs2?: number[];
    normals?: number[];
}

/** A node of an effect: a group, an emitter, a mesh or a prefab, with its children. */
export interface QuarksNodeJSON {
    uuid: string;
    type: 'Group' | 'ParticleEmitter' | 'Mesh' | 'QuarksPrefab' | string;
    name?: string;
    /** Local transform, column-major, as Babylon's `Matrix.asArray()`. */
    matrix: number[];
    /** Written only when the node is disabled, or is a mesh that is not visible. */
    visible?: false;
    children?: QuarksNodeJSON[];
    /** `ParticleEmitter`: the system. */
    ps?: ParticleSystemJSONParameters;
    /** `Mesh`: the {@link QuarksGeometryJSON} uuid. */
    geometry?: string;
    /** `Mesh`: the material uuid. */
    material?: string;
    [key: string]: unknown;
}

/** A whole effect, as {@link serializeEffect} writes it and `QuarksLoader` reads it. */
export interface QuarksEffectJSON {
    metadata: {
        /** The three.js object format version the envelope follows. */
        version: number;
        type: 'Object3D';
        generator: string;
        /** See {@link QUARKS_FORMAT_VERSION}. */
        quarksFormat: number;
    };
    geometries: QuarksGeometryJSON[];
    materials: Array<Record<string, unknown>>;
    textures: QuarksTextureJSON[];
    images: QuarksImageJSON[];
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
    private readonly meshMaterials: Array<Record<string, unknown>> = [];
    private readonly meshMaterialIds = new Map<StandardMaterial, string>();
    private readonly extraTextures = new Map<BaseTexture, string>();
    private nextId = 0;

    constructor(private readonly options: SerializeEffectOptions) {}

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
        // A mesh hidden with isVisible (a mesh surface shape's source) loads disabled, which hides it too.
        if (!node.isEnabled(false) || (node instanceof Mesh && !node.isVisible)) {
            json.visible = false;
        }

        if (node instanceof ParticleEmitter) {
            json.type = 'ParticleEmitter';
            json.ps = (node.system as ParticleSystem).toJSON(this.meta);
        } else if (node instanceof QuarksPrefab) {
            const {type: _type, name: _name, ...prefab} = node.toJSON();
            Object.assign(json, prefab);
            json.type = 'QuarksPrefab';
            if (node.timeScale !== 1) {
                json.timeScale = node.timeScale;
            }
        } else if (node instanceof Mesh) {
            json.type = 'Mesh';
            json.geometry = this.meshGeometry(node);
            json.material = this.meshMaterial(node);
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
        const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
        const indices = mesh.getIndices();
        if (!positions || !indices) {
            return undefined;
        }
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
        const map = material.diffuseTexture ? this.texture(material.diffuseTexture) : undefined;
        this.meshMaterials.push({
            uuid,
            type: 'MeshBasicMaterial',
            alphaMode: material.alphaMode,
            side: material.backFaceCulling ? 0 : 2,
            alphaTest: material.alphaCutOff,
            depthWrite: !material.disableDepthWrite,
            ...(map ? {map} : {}),
        });
        return uuid;
    }

    /** A texture referenced outside a particle system's meta (a mesh node's diffuse). */
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
            const url = texture instanceof Texture ? texture.url : null;
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
            const {sourceMaterial: _sourceMaterial, ...serializable} = material as Record<string, unknown>;
            return serializable;
        });

        return {
            metadata: {
                version: 4.5,
                type: 'Object3D',
                generator: this.options.generator ?? 'babylon.quarks',
                quarksFormat: QUARKS_FORMAT_VERSION,
            },
            geometries: [...Object.values(this.meta.geometries), ...this.meshGeometries.values()],
            materials: [...materials, ...this.meshMaterials],
            textures,
            images,
            object,
        };
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
