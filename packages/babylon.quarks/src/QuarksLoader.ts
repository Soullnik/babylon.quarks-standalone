import {Scene} from '@babylonjs/core/scene';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Constants} from '@babylonjs/core/Engines/constants';
import {Matrix, Quaternion, Vector3} from '@babylonjs/core/Maths/math.vector';
import {
    Behavior,
    EmitSubParticleSystem,
} from 'quarks.core';
import {ParticleSystem} from './ParticleSystem';
import {ParticleEmitter} from './ParticleEmitter';
import {QuarksPrefab} from './QuarksPrefab';
import {ensureTriangleIndices} from './geometryUtil';

export interface QuarksLoaderOptions {
    baseUrl?: string;
}

interface ParsedGeometry {
    positions: Float32Array;
    indices: Uint32Array | Uint16Array;
    uvs?: Float32Array;
    normals?: Float32Array;
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
        return this.parse(json, baseUrl);
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
            }
        }
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
                    if (buf) positions = this.extractInterleavedAttribute(buf.data, buf.stride, attr.offset, attr.itemSize);
                }
                if (data.attributes.uv?.isInterleavedBufferAttribute) {
                    const attr = data.attributes.uv;
                    const buf = buffers[attr.data];
                    if (buf) uvs = this.extractInterleavedAttribute(buf.data, buf.stride, attr.offset, attr.itemSize);
                }
                if (data.attributes.normal?.isInterleavedBufferAttribute) {
                    const attr = data.attributes.normal;
                    const buf = buffers[attr.data];
                    if (buf) normals = this.extractInterleavedAttribute(buf.data, buf.stride, attr.offset, attr.itemSize);
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
            (this as any)._images[img.uuid] = img.url ? baseUrl + img.url : null;
        }
    }

    private parseTextures(textures: any[], meta: LoadedMeta): void {
        const images = (this as any)._images || {};
        for (const texDef of textures) {
            const imageUrl = images[texDef.image];
            if (imageUrl) {
                const texture = new Texture(imageUrl, this.scene);
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

            const blendingToAlphaMode: {[key: number]: number} = {
                1: Constants.ALPHA_COMBINE,
                2: Constants.ALPHA_ADD,
                3: Constants.ALPHA_SUBTRACT,
                4: Constants.ALPHA_MULTIPLY,
            };
            matInfo.alphaMode = blendingToAlphaMode[matDef.blending] || Constants.ALPHA_COMBINE;

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
                node.rotationQuaternion = new Quaternion(data.quaternion[0], data.quaternion[1], data.quaternion[2], data.quaternion[3]);
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
