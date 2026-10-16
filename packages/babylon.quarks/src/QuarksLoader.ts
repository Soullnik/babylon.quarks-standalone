import {Constants} from '@babylonjs/core/Engines/constants';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Matrix, Quaternion, Vector3} from '@babylonjs/core/Maths/math.vector';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {Behavior, EmitSubParticleSystem} from 'quarks.core';
import {ParticleEmitter} from './ParticleEmitter';
import {ParticleSystem} from './ParticleSystem';
import {QuarksPrefab} from './QuarksPrefab';
import {ensureTriangleIndices} from './geometryUtil';

export interface QuarksLoaderOptions {
    baseUrl?: string;
    /**
     * Reuse one Texture per scene for every effect that references the same image with the same
     * sampling, and one copy of the data for identical mesh geometry. The renderer only batches
     * systems that share the texture (and geometry) object, so without this every loaded effect
     * gets batches — draw calls and buffer uploads — of its own even when its images are the same
     * as another effect's. Default true; turn off to give each effect private textures, e.g. to
     * change one effect's texture settings without touching the others.
     */
    shareResources?: boolean;
}

interface ParsedGeometry {
    positions: Float32Array;
    indices: Uint32Array | Uint16Array;
    uvs?: Float32Array;
    normals?: Float32Array;
}

/** Textures and geometries reused across loads, per scene. See QuarksLoaderOptions.shareResources. */
const sharedTextures = new WeakMap<Scene, Map<string, Texture>>();
const sharedGeometries = new WeakMap<Scene, Map<string, ParsedGeometry>>();

function sceneMap<T>(maps: WeakMap<Scene, Map<string, T>>, scene: Scene): Map<string, T> {
    let map = maps.get(scene);
    if (map === undefined) {
        map = new Map();
        maps.set(scene, map);
    }
    return map;
}

/** Content key for a geometry: two independent 32-bit hashes over every array's bytes, plus lengths. */
function geometryKey(geometry: ParsedGeometry): string {
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    const parts: Array<ArrayBufferView | undefined> = [
        geometry.positions,
        geometry.indices,
        geometry.uvs,
        geometry.normals,
    ];
    let lengths = '';
    for (const part of parts) {
        if (part === undefined) {
            lengths += '-,';
            continue;
        }
        const bytes = new Uint8Array(part.buffer, part.byteOffset, part.byteLength);
        lengths += bytes.length + ',';
        for (let i = 0; i < bytes.length; i++) {
            h1 = Math.imul(h1 ^ bytes[i], 0x01000193);
            h2 = Math.imul(h2 ^ bytes[i], 0x5bd1e995) ^ (h2 >>> 15);
        }
    }
    return `${lengths}${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
}

interface LoadedMeta {
    textures: {[uuid: string]: Texture | null};
    geometries: {[uuid: string]: ParsedGeometry};
    materials: {[uuid: string]: any};
}

export class QuarksLoader {
    private scene: Scene;
    private options: QuarksLoaderOptions;

    constructor(scene: Scene, options: QuarksLoaderOptions = {}) {
        this.scene = scene;
        this.options = options;
    }

    async load(url: string): Promise<TransformNode> {
        const baseUrl = this.options.baseUrl || url.substring(0, url.lastIndexOf('/') + 1);
        const response = await fetch(url);
        const json = await response.json();
        await QuarksLoader.resolveExternalGeometries(json, async (geometryUrl) => {
            const geometryResponse = await fetch(QuarksLoader.resolveUrl(baseUrl, geometryUrl));
            if (!geometryResponse.ok) {
                throw new Error(`HTTP ${geometryResponse.status}`);
            }
            return geometryResponse.json();
        });
        return this.parse(json, baseUrl);
    }

    /**
     * Inlines geometries that an export wrote to their own file (`{uuid, type: 'QuarksGeometry',
     * url}` — e.g. the Unity exporter's "geometries as files"): each `url` is passed to
     * `loadGeometry`, and the `positions / indices / uvs / normals` it returns replace the url in
     * place, so `parse()` (which is synchronous) sees an ordinary inline geometry. `load()` does
     * this with `fetch`; call it yourself before `parse()` when the files come from elsewhere.
     * A geometry that fails to load is left as is and warned about.
     */
    static async resolveExternalGeometries(json: any, loadGeometry: (url: string) => Promise<any>): Promise<void> {
        const geometries: any[] = Array.isArray(json?.geometries) ? json.geometries : [];
        await Promise.all(
            geometries
                .filter((geom) => typeof geom?.url === 'string' && !geom.positions)
                .map(async (geom) => {
                    try {
                        const data = await loadGeometry(geom.url);
                        for (const key of ['positions', 'indices', 'uvs', 'normals']) {
                            if (data?.[key] !== undefined) {
                                geom[key] = data[key];
                            }
                        }
                        delete geom.url;
                    } catch (err) {
                        console.warn(`[QuarksLoader] Could not load geometry "${geom.url}":`, err);
                    }
                })
        );
    }

    parse(json: any, baseUrl: string = ''): TransformNode {
        const meta: LoadedMeta = {
            textures: {},
            geometries: {},
            materials: {},
        };

        if (json.geometries) {
            this.parseGeometries(json.geometries, meta);
        }
        if (json.images) {
            this.parseImages(json.images, baseUrl, meta);
        }
        if (json.textures) {
            this.parseTextures(json.textures, meta);
        }
        if (json.materials) {
            this.parseMaterials(json.materials, meta);
        }

        const root = this.parseObject(json.object, meta);
        this.linkReferences(root);
        return root;
    }

    private parseGeometries(geometries: any[], meta: LoadedMeta): void {
        for (const geom of geometries) {
            if (geom.type === 'PlaneGeometry') {
                const w = geom.width || 1;
                const h = geom.height || 1;
                const hw = w / 2;
                const hh = h / 2;
                meta.geometries[geom.uuid] = {
                    positions: new Float32Array([-hw, -hh, 0, hw, -hh, 0, hw, hh, 0, -hw, hh, 0]),
                    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
                    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
                    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
                };
            } else if (geom.type === 'SphereGeometry') {
                meta.geometries[geom.uuid] = this.parseSphereGeometry(geom);
            } else if (geom.type === 'BufferGeometry' && geom.data) {
                const parsed = this.parseBufferGeometry(geom.data);
                meta.geometries[geom.uuid] = parsed;
            } else if (geom.type === 'QuarksGeometry') {
                if (typeof geom.url === 'string' && !geom.positions) {
                    console.warn(
                        `[QuarksLoader] Geometry "${geom.url}" is an external file; use load() or ` +
                            'QuarksLoader.resolveExternalGeometries() before parse().'
                    );
                }
                meta.geometries[geom.uuid] = this.share({
                    positions: new Float32Array(geom.positions ?? []),
                    indices: geom.indices ? new Uint32Array(geom.indices) : new Uint32Array(0),
                    uvs: geom.uvs ? new Float32Array(geom.uvs) : undefined,
                    normals: geom.normals ? new Float32Array(geom.normals) : undefined,
                });
            }
        }
    }

    /** The scene's copy of an identical geometry when resources are shared, else `geometry` itself. */
    private share(geometry: ParsedGeometry): ParsedGeometry {
        if (this.options.shareResources === false) {
            return geometry;
        }
        const geometries = sceneMap(sharedGeometries, this.scene);
        const key = geometryKey(geometry);
        const existing = geometries.get(key);
        if (existing !== undefined) {
            return existing;
        }
        geometries.set(key, geometry);
        return geometry;
    }

    /**
     * Forgets the textures and geometries shared between loads into `scene` (see
     * {@link QuarksLoaderOptions.shareResources}). Effects already loaded keep theirs; the next
     * load creates new ones. Textures are not disposed — they may still be in use.
     */
    static clearSharedResources(scene: Scene): void {
        sharedTextures.delete(scene);
        sharedGeometries.delete(scene);
    }

    private parseSphereGeometry(geom: any): ParsedGeometry {
        const radius = geom.radius ?? 0.5;
        const widthSegments = Math.max(3, Math.floor(geom.widthSegments ?? 16));
        const heightSegments = Math.max(2, Math.floor(geom.heightSegments ?? 8));
        const phiStart = geom.phiStart ?? 0;
        const phiLength = geom.phiLength ?? Math.PI * 2;
        const thetaStart = geom.thetaStart ?? 0;
        const thetaLength = geom.thetaLength ?? Math.PI;

        const positions: number[] = [];
        const normals: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        const grid: number[][] = [];

        let index = 0;

        for (let iy = 0; iy <= heightSegments; iy++) {
            const verticesRow: number[] = [];
            const v = iy / heightSegments;
            const theta = thetaStart + v * thetaLength;

            for (let ix = 0; ix <= widthSegments; ix++) {
                const u = ix / widthSegments;
                const phi = phiStart + u * phiLength;

                const x = -radius * Math.cos(phi) * Math.sin(theta);
                const y = radius * Math.cos(theta);
                const z = radius * Math.sin(phi) * Math.sin(theta);

                positions.push(x, y, z);
                const length = Math.hypot(x, y, z) || 1;
                normals.push(x / length, y / length, z / length);
                uvs.push(u, 1 - v);

                verticesRow.push(index++);
            }

            grid.push(verticesRow);
        }

        const thetaEnd = thetaStart + thetaLength;
        const isTopFull = thetaStart <= 0;
        const isBottomFull = thetaEnd >= Math.PI;

        for (let iy = 0; iy < heightSegments; iy++) {
            for (let ix = 0; ix < widthSegments; ix++) {
                const a = grid[iy][ix + 1];
                const b = grid[iy][ix];
                const c = grid[iy + 1][ix];
                const d = grid[iy + 1][ix + 1];

                if (iy !== 0 || !isTopFull) {
                    indices.push(a, b, d);
                }
                if (iy !== heightSegments - 1 || !isBottomFull) {
                    indices.push(b, c, d);
                }
            }
        }

        const typedIndices = positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
        return {
            positions: new Float32Array(positions),
            indices: typedIndices,
            uvs: new Float32Array(uvs),
            normals: new Float32Array(normals),
        };
    }

    private parseBufferGeometry(data: any): ParsedGeometry {
        let positions = new Float32Array(0);
        let indices: Uint32Array | Uint16Array = new Uint32Array(0);
        let uvs: Float32Array | undefined;
        let normals: Float32Array | undefined;

        if (data.interleavedBuffers && data.arrayBuffers) {
            const buffers: {[uuid: string]: {data: Float32Array; stride: number}} = {};
            for (const [uuid, ibDef] of Object.entries(data.interleavedBuffers) as any[]) {
                const arrayBuffer = data.arrayBuffers[ibDef.buffer];
                if (arrayBuffer) {
                    const floatArray = new Float32Array(
                        Array.isArray(arrayBuffer) ? this.int32ArrayToFloat32(arrayBuffer) : arrayBuffer
                    );
                    buffers[uuid] = {data: floatArray, stride: ibDef.stride};
                }
            }

            if (data.attributes) {
                if (data.attributes.position?.isInterleavedBufferAttribute) {
                    const attr = data.attributes.position;
                    const buf = buffers[attr.data];
                    if (buf)
                        positions = this.extractInterleavedAttribute(buf.data, buf.stride, attr.offset, attr.itemSize);
                }
                if (data.attributes.uv?.isInterleavedBufferAttribute) {
                    const attr = data.attributes.uv;
                    const buf = buffers[attr.data];
                    if (buf) uvs = this.extractInterleavedAttribute(buf.data, buf.stride, attr.offset, attr.itemSize);
                }
                if (data.attributes.normal?.isInterleavedBufferAttribute) {
                    const attr = data.attributes.normal;
                    const buf = buffers[attr.data];
                    if (buf)
                        normals = this.extractInterleavedAttribute(buf.data, buf.stride, attr.offset, attr.itemSize);
                }
            }
        } else if (data.attributes) {
            if (data.attributes.position?.array) {
                positions = new Float32Array(data.attributes.position.array);
            }
            if (data.attributes.uv?.array) {
                uvs = new Float32Array(data.attributes.uv.array);
            }
            if (data.attributes.normal?.array) {
                normals = new Float32Array(data.attributes.normal.array);
            }
        }

        if (data.index) {
            if (data.index.type === 'Uint16Array') {
                indices = new Uint16Array(data.index.array);
            } else {
                indices = new Uint32Array(data.index.array);
            }
        }

        indices = ensureTriangleIndices(positions, indices);

        return {positions, indices, uvs, normals};
    }

    private extractInterleavedAttribute(buffer: Float32Array, stride: number, offset: number, itemSize: number): any {
        const count = Math.floor(buffer.length / stride);
        const result = new Float32Array(count * itemSize);
        for (let i = 0; i < count; i++) {
            for (let j = 0; j < itemSize; j++) {
                result[i * itemSize + j] = buffer[i * stride + offset + j];
            }
        }
        return result;
    }

    private int32ArrayToFloat32(intArray: number[]): Float32Array {
        const buffer = new ArrayBuffer(intArray.length * 4);
        const int32View = new Int32Array(buffer);
        for (let i = 0; i < intArray.length; i++) {
            int32View[i] = intArray[i];
        }
        return new Float32Array(buffer) as any;
    }

    private parseImages(images: any[], baseUrl: string, _meta: LoadedMeta): void {
        (this as any)._images = {};
        for (const img of images) {
            if (img.url) {
                QuarksLoader.warnIfNotAnImageUrl(img.url);
            }
            (this as any)._images[img.uuid] = img.url ? QuarksLoader.resolveUrl(baseUrl, img.url) : null;
        }
    }

    /**
     * Flags an image entry that is plainly not an image, which otherwise only
     * shows up as a texture that silently fails to load.
     *
     * The case worth naming: an exporter that could not embed a texture falls
     * back to writing the source asset's path, and a Unity built-in texture
     * reports a virtual path such as `Resources/unity_builtin_extra` that no
     * file backs.
     */
    private static warnIfNotAnImageUrl(url: string): void {
        if (/^(data|blob):/i.test(url) || /\.(png|jpe?g|webp|gif|bmp|ktx2?|dds|env|basis)(\?|#|$)/i.test(url)) {
            return;
        }
        console.warn(
            `[QuarksLoader] Image "${url}" does not look like an image; its texture will fail to load. ` +
                'This usually means the effect was exported without embedding that texture.'
        );
    }

    /**
     * `img.url` is already absolute for data/blob URIs and full http(s) URLs — common for
     * "portable" exports that embed textures as base64 (see ensurePortableTextureUrl in
     * babylon.quarks-editor). Prepending baseUrl to those turns e.g.
     * "data:image/png;base64,AAAA" into an invalid path like "/some/dir/data:image/png;base64,AAAA".
     */
    private static resolveUrl(baseUrl: string, url: string): string {
        if (/^(data|blob):/i.test(url) || /^[a-z][a-z0-9+.-]*:\/\//i.test(url) || url.startsWith('/')) {
            return url;
        }
        return baseUrl + url;
    }

    private parseTextures(textures: any[], meta: LoadedMeta): void {
        const images = (this as any)._images || {};
        for (const texDef of textures) {
            const imageUrl = images[texDef.image];
            if (imageUrl) {
                const invertY = texDef.invertY !== undefined ? !!texDef.invertY : true;
                const noMipmap = !!texDef.noMipmap;
                // Everything below that ends up on the Texture object is part of the key, so a
                // shared texture always looks the way each of its effects asked for.
                const share = this.options.shareResources !== false;
                const key = share
                    ? [
                          invertY,
                          noMipmap,
                          texDef.samplingMode,
                          texDef.wrap,
                          texDef.repeat,
                          texDef.offset,
                          texDef.rotation,
                      ].join('|') +
                      '|' +
                      imageUrl
                    : '';
                const cache = share ? sceneMap(sharedTextures, this.scene) : undefined;
                const cached = cache?.get(key);
                if (cached !== undefined) {
                    meta.textures[texDef.uuid] = cached;
                    continue;
                }
                const texture = new Texture(imageUrl, this.scene, {
                    noMipmap,
                    invertY,
                    samplingMode: typeof texDef.samplingMode === 'number' ? texDef.samplingMode : undefined,
                });
                if (Array.isArray(texDef.wrap)) {
                    texture.wrapU = this.mapWrapMode(texDef.wrap[0]);
                    texture.wrapV = this.mapWrapMode(texDef.wrap[1] ?? texDef.wrap[0]);
                }
                if (Array.isArray(texDef.repeat)) {
                    texture.uScale = texDef.repeat[0] ?? 1;
                    texture.vScale = texDef.repeat[1] ?? 1;
                }
                if (Array.isArray(texDef.offset)) {
                    texture.uOffset = texDef.offset[0] ?? 0;
                    texture.vOffset = texDef.offset[1] ?? 0;
                }
                if (typeof texDef.rotation === 'number') {
                    texture.wAng = texDef.rotation;
                }
                if (cache !== undefined) {
                    cache.set(key, texture);
                    // Something outside the library may dispose it; never hand out a dead texture.
                    texture.onDisposeObservable.addOnce(() => {
                        if (cache.get(key) === texture) {
                            cache.delete(key);
                        }
                    });
                }
                meta.textures[texDef.uuid] = texture;
            } else {
                meta.textures[texDef.uuid] = null;
            }
        }
    }

    private mapWrapMode(wrapMode?: number): number {
        switch (wrapMode) {
            case 1001: // ClampToEdgeWrapping (three.js)
                return Texture.CLAMP_ADDRESSMODE;
            case 1002: // MirroredRepeatWrapping (three.js)
                return Texture.MIRROR_ADDRESSMODE;
            case 1000: // RepeatWrapping (three.js)
            default:
                return Texture.WRAP_ADDRESSMODE;
        }
    }

    private parseMaterials(materials: any[], meta: LoadedMeta): void {
        for (const matDef of materials) {
            const matInfo: any = {
                uuid: matDef.uuid,
                transparent: matDef.transparent ?? true,
                blending: matDef.blending ?? 1,
                side: matDef.side ?? 2,
                depthTest: matDef.depthTest ?? true,
                depthWrite: matDef.depthWrite ?? false,
                alphaTest: matDef.alphaTest ?? 0,
                texture: null,
            };

            // three.js MeshBasicMaterial uses `map`; QuarksMaterial (what ParticleSystem.toJSON
            // emits) uses `texture`. Accept both so library-exported effects round-trip.
            const textureRef = matDef.map ?? matDef.texture;
            if (textureRef) {
                matInfo.texture = meta.textures[textureRef] || null;
            }

            const reflectionAtlasRef = matDef.reflectionAtlas;
            if (reflectionAtlasRef) {
                matInfo.reflectionAtlas = meta.textures[reflectionAtlasRef] || null;
            }
            if (typeof matDef.reflectionLevel === 'number') {
                matInfo.reflectionLevel = matDef.reflectionLevel;
            }

            // QuarksMaterial (what ParticleSystem.ensureMaterialMeta emits) writes `alphaMode`
            // directly as a Babylon alpha-mode constant; three.js materials (MeshBasicMaterial
            // etc.) instead use `blending` with three.js's own 1..4 numbering, which does NOT
            // line up with Babylon's constants (e.g. three.js Additive=2 vs Babylon ALPHA_ADD=1)
            // — only convert through the table when there's no native alphaMode to trust.
            if (typeof matDef.alphaMode === 'number') {
                matInfo.alphaMode = matDef.alphaMode;
            } else {
                const blendingToAlphaMode: {[key: number]: number} = {
                    1: Constants.ALPHA_COMBINE,
                    2: Constants.ALPHA_ADD,
                    3: Constants.ALPHA_SUBTRACT,
                    4: Constants.ALPHA_MULTIPLY,
                };
                matInfo.alphaMode = blendingToAlphaMode[matDef.blending] || Constants.ALPHA_COMBINE;
            }

            meta.materials[matDef.uuid] = matInfo;
        }
    }

    private getGeometry(meta: LoadedMeta, geometryId: string | undefined): ParsedGeometry | undefined {
        if (!geometryId) return undefined;
        return meta.geometries[geometryId];
    }

    private getMaterial(meta: LoadedMeta, materialId: string | string[] | undefined): any | undefined {
        if (!materialId) return undefined;
        const selectedId = Array.isArray(materialId) ? materialId[0] : materialId;
        return meta.materials[selectedId];
    }

    private createPlaceholderNode(type: string, name?: string): TransformNode {
        const node = new TransformNode(name || type || 'node', this.scene);
        (node as any).quarksOriginalType = type;
        return node;
    }

    private createMeshNode(data: any, meta: LoadedMeta): Mesh {
        const mesh = new Mesh(data.name || data.type || 'mesh', this.scene);
        const geometry = this.getGeometry(meta, data.geometry);
        if (geometry && geometry.positions.length > 0 && geometry.indices.length > 0) {
            const vertexData = new VertexData();
            vertexData.positions = geometry.positions;
            vertexData.indices = geometry.indices;
            if (geometry.uvs && geometry.uvs.length > 0) {
                vertexData.uvs = geometry.uvs;
            }
            if (geometry.normals && geometry.normals.length > 0) {
                vertexData.normals = geometry.normals;
            }
            vertexData.applyToMesh(mesh, true);
        }

        const materialInfo = this.getMaterial(meta, data.material);
        if (materialInfo) {
            const material = new StandardMaterial(`quarks_loader_material_${materialInfo.uuid}`, this.scene);
            material.alphaMode = materialInfo.alphaMode ?? Constants.ALPHA_COMBINE;
            material.backFaceCulling = materialInfo.side !== 2;
            material.alphaCutOff = materialInfo.alphaTest ?? 0;
            material.disableDepthWrite = !(materialInfo.depthWrite ?? false);
            if (materialInfo.texture) {
                material.diffuseTexture = materialInfo.texture;
                material.opacityTexture = materialInfo.texture;
            }
            mesh.material = material;
        }
        return mesh;
    }

    private parseObject(data: any, meta: LoadedMeta): TransformNode {
        let node: TransformNode;
        switch (data.type) {
            case 'QuarksPrefab':
                node = QuarksPrefab.fromJSON(data, this.scene);
                break;
            case 'ParticleEmitter':
                if (data.ps) {
                    const ps = this.parseParticleSystem(data.ps, meta);
                    node = ps.emitter;
                    break;
                }
                node = this.createPlaceholderNode(data.type, data.name);
                break;
            case 'Mesh':
            case 'SkinnedMesh':
            case 'InstancedMesh':
            case 'BatchedMesh':
                node = this.createMeshNode(data, meta);
                break;
            case 'Scene':
            case 'Group':
            case 'Object3D':
            case 'PerspectiveCamera':
            case 'OrthographicCamera':
            case 'AmbientLight':
            case 'DirectionalLight':
            case 'PointLight':
            case 'RectAreaLight':
            case 'SpotLight':
            case 'HemisphereLight':
            case 'LightProbe':
            case 'LOD':
            case 'Line':
            case 'LineSegments':
            case 'LineLoop':
            case 'PointCloud':
            case 'Points':
            case 'Sprite':
            case 'Bone':
                node = this.createPlaceholderNode(data.type, data.name);
                break;
            default:
                node = new TransformNode(data.name || data.type || 'node', this.scene);
        }

        if (data.uuid) (node as any)._quarksUUID = data.uuid;
        if (data.name) node.name = data.name;

        if (data.matrix) {
            const matrix = Matrix.FromArray(data.matrix);
            const scaling = new Vector3(1, 1, 1);
            const rotation = Quaternion.Identity();
            const translation = new Vector3(0, 0, 0);
            matrix.decompose(scaling, rotation, translation);
            node.position.copyFrom(translation);
            node.scaling.copyFrom(scaling);
            node.rotationQuaternion = rotation;
        } else {
            if (data.position) node.position.set(data.position[0], data.position[1], data.position[2]);
            if (data.scale) node.scaling.set(data.scale[0], data.scale[1], data.scale[2]);
            if (data.quaternion) {
                node.rotationQuaternion = new Quaternion(
                    data.quaternion[0],
                    data.quaternion[1],
                    data.quaternion[2],
                    data.quaternion[3]
                );
            } else if (data.rotation) {
                node.rotation.set(data.rotation[0], data.rotation[1], data.rotation[2]);
            }
        }

        if (data.visible !== undefined) node.setEnabled(data.visible);

        if (data.children) {
            for (const childData of data.children) {
                const child = this.parseObject(childData, meta);
                child.parent = node;
            }
        }

        return node;
    }

    private parseParticleSystem(json: any, meta: LoadedMeta): ParticleSystem {
        const dependencies: {[uuid: string]: Behavior} = {};
        const ps = ParticleSystem.fromJSON(json, meta as any, dependencies, this.scene);
        (ps as any)._meshSurfaceReferenceUUID = json?.shape?.type === 'mesh_surface' ? json?.shape?.mesh : undefined;
        return ps;
    }

    private linkReferences(root: TransformNode): void {
        const nodesMap: {[uuid: string]: TransformNode} = {};

        const traverse = (node: TransformNode) => {
            if ((node as any)._quarksUUID) {
                nodesMap[(node as any)._quarksUUID] = node;
            }
            for (const child of node.getChildren()) {
                if (child instanceof TransformNode) {
                    traverse(child);
                }
            }
        };
        traverse(root);

        const linkNode = (node: TransformNode) => {
            if (node instanceof QuarksPrefab) {
                node.resolveReferences(root);
            }
            if (node instanceof ParticleEmitter) {
                const system = node.system as ParticleSystem;
                const meshSurfaceUUID = (system as any)._meshSurfaceReferenceUUID;
                if (meshSurfaceUUID && (system.emitterShape as any).type === 'mesh_surface') {
                    const targetNode = nodesMap[meshSurfaceUUID];
                    if (targetNode instanceof Mesh) {
                        (system.emitterShape as any).mesh = targetNode;
                    }
                }
                for (let i = 0; i < system.behaviors.length; i++) {
                    if (system.behaviors[i] instanceof EmitSubParticleSystem) {
                        const subEmitter = system.behaviors[i] as EmitSubParticleSystem;
                        const targetUUID = subEmitter.subParticleSystem as any;
                        if (typeof targetUUID === 'string' && nodesMap[targetUUID]) {
                            const resolved = nodesMap[targetUUID];
                            (subEmitter as any).subParticleSystem = resolved;
                            if (resolved instanceof ParticleEmitter) {
                                (resolved.system as ParticleSystem).onlyUsedByOther = true;
                            }
                        }
                    }
                }
            }
            for (const child of node.getChildren()) {
                if (child instanceof TransformNode) {
                    linkNode(child);
                }
            }
        };
        linkNode(root);
    }
}
