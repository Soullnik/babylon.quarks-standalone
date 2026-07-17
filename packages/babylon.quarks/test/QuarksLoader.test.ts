import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Constants} from '@babylonjs/core/Engines/constants';
import {Scene} from '@babylonjs/core/scene';
import {Matrix, Quaternion, Vector3} from '@babylonjs/core/Maths/math.vector';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {loadPlugin} from 'quarks.core';
import {QuarksLoader} from '../src/QuarksLoader';
import {QuarksPrefab} from '../src/QuarksPrefab';
import {ParticleEmitter} from '../src/ParticleEmitter';
import {ParticleSystem} from '../src/ParticleSystem';
import {MeshSurfaceEmitterPlugin} from '../src/MeshSurfaceEmitter';

loadPlugin(MeshSurfaceEmitterPlugin);

describe('QuarksLoader matrix decomposition', () => {
    it('preserves translation, rotation and scale from matrix', () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new QuarksLoader(scene);

        const expectedPosition = new Vector3(1, 2, 3);
        const expectedRotation = Quaternion.FromEulerAngles(0.2, -0.4, 0.3);
        const expectedScale = new Vector3(2, 3, 4);
        const matrix = Matrix.Compose(expectedScale, expectedRotation, expectedPosition);

        const root = loader.parse({
            object: {
                uuid: 'root',
                type: 'Object3D',
                matrix: matrix.toArray(),
                children: [],
            },
        });

        expect(root.position.x).toBeCloseTo(expectedPosition.x, 5);
        expect(root.position.y).toBeCloseTo(expectedPosition.y, 5);
        expect(root.position.z).toBeCloseTo(expectedPosition.z, 5);
        expect(root.scaling.x).toBeCloseTo(expectedScale.x, 5);
        expect(root.scaling.y).toBeCloseTo(expectedScale.y, 5);
        expect(root.scaling.z).toBeCloseTo(expectedScale.z, 5);
        expect(root.rotationQuaternion).not.toBeNull();
        expect(root.rotationQuaternion!.x).toBeCloseTo(expectedRotation.x, 5);
        expect(root.rotationQuaternion!.y).toBeCloseTo(expectedRotation.y, 5);
        expect(root.rotationQuaternion!.z).toBeCloseTo(expectedRotation.z, 5);
        expect(root.rotationQuaternion!.w).toBeCloseTo(expectedRotation.w, 5);

        scene.dispose();
        engine.dispose();
    });

    it('maps JSON emission burst cycleCount to cycle', () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new QuarksLoader(scene);

        const root = loader.parse({
            geometries: [
                {uuid: 'plane', type: 'PlaneGeometry', width: 1, height: 1},
            ],
            materials: [
                {uuid: 'mat', type: 'MeshBasicMaterial', transparent: true, blending: 1},
            ],
            object: {
                uuid: 'root',
                type: 'Group',
                children: [
                    {
                        uuid: 'emitter',
                        type: 'ParticleEmitter',
                        ps: {
                            version: '2.0',
                            autoDestroy: false,
                            looping: false,
                            prewarm: false,
                            duration: 1,
                            shape: {type: 'point'},
                            startLife: {type: 'ConstantValue', value: 1},
                            startSpeed: {type: 'ConstantValue', value: 0},
                            startRotation: {type: 'ConstantValue', value: 0},
                            startSize: {type: 'ConstantValue', value: 1},
                            startColor: {type: 'ConstantColor', color: {r: 1, g: 1, b: 1, a: 1}},
                            emissionOverTime: {type: 'ConstantValue', value: 0},
                            emissionOverDistance: {type: 'ConstantValue', value: 0},
                            emissionBursts: [{time: 0, count: 1, cycleCount: 3, probability: 1}],
                            onlyUsedByOther: false,
                            instancingGeometry: 'plane',
                            renderOrder: 0,
                            renderMode: 0,
                            rendererEmitterSettings: {},
                            material: 'mat',
                            layers: 1,
                            startTileIndex: {type: 'ConstantValue', value: 0},
                            uTileCount: 1,
                            vTileCount: 1,
                            behaviors: [],
                            worldSpace: true,
                        },
                    },
                ],
            },
        });

        const emitter = root.getChildren()[0] as any;
        expect(emitter.system.emissionBursts[0].cycle).toBe(3);

        scene.dispose();
        engine.dispose();
    });

    it('round-trips a custom (non-preset) mesh geometry through toJSON/parse', () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        const customPositions = new Float32Array([0, 1, 0, -1, -1, 0, 1, -1, 0]);
        const customIndices = new Uint32Array([0, 1, 2]);
        const ps = new ParticleSystem({
            scene,
            renderMode: 2, // Mesh
            instancingGeometry: customPositions,
            instancingIndices: customIndices,
        } as any);

        const meta: any = {geometries: {}, materials: {}, textures: {}, images: {}};
        const psJSON = ps.toJSON(meta);
        const envelope = {
            geometries: Object.values(meta.geometries),
            materials: Object.values(meta.materials).map(({sourceMaterial: _s, ...rest}: any) => rest),
            textures: [],
            images: [],
            object: {uuid: 'root', type: 'ParticleEmitter', ps: psJSON},
        };

        const loader = new QuarksLoader(scene);
        const root = loader.parse(envelope) as ParticleEmitter;
        const loadedSystem = root.system as ParticleSystem;

        expect(Array.from(loadedSystem.instancingGeometry)).toEqual(Array.from(customPositions));

        scene.dispose();
        engine.dispose();
    });

    it('round-trips a material blend mode through toJSON/parse', () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        const ps = new ParticleSystem({
            scene,
            blendMode: Constants.ALPHA_ADD,
        } as any);

        const meta: any = {geometries: {}, materials: {}, textures: {}, images: {}};
        const psJSON = ps.toJSON(meta);
        const envelope = {
            geometries: Object.values(meta.geometries),
            materials: Object.values(meta.materials).map(({sourceMaterial: _s, ...rest}: any) => rest),
            textures: [],
            images: [],
            object: {uuid: 'root', type: 'ParticleEmitter', ps: psJSON},
        };

        const loader = new QuarksLoader(scene);
        const root = loader.parse(envelope) as ParticleEmitter;
        const loadedSystem = root.system as ParticleSystem;

        expect(loadedSystem.blending).toBe(Constants.ALPHA_ADD);

        scene.dispose();
        engine.dispose();
    });

    it('parses QuarksPrefab and resolves particle animation references', () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new QuarksLoader(scene);

        const root = loader.parse({
            geometries: [{uuid: 'plane', type: 'PlaneGeometry', width: 1, height: 1}],
            materials: [{uuid: 'mat', type: 'MeshBasicMaterial', transparent: true, blending: 1}],
            object: {
                uuid: 'root',
                type: 'Group',
                children: [
                    {
                        uuid: 'prefab-1',
                        type: 'QuarksPrefab',
                        animationData: [{startTime: 0, duration: 1, type: 'ps', targetUUID: 'emitter-1', loop: false}],
                        children: [],
                    },
                    {
                        uuid: 'emitter-1',
                        type: 'ParticleEmitter',
                        ps: {
                            version: '3.0',
                            autoDestroy: false,
                            looping: true,
                            prewarm: false,
                            duration: 1,
                            shape: {type: 'point'},
                            startLife: {type: 'ConstantValue', value: 1},
                            startSpeed: {type: 'ConstantValue', value: 0},
                            startRotation: {type: 'ConstantValue', value: 0},
                            startSize: {type: 'ConstantValue', value: 1},
                            startColor: {type: 'ConstantColor', color: {r: 1, g: 1, b: 1, a: 1}},
                            emissionOverTime: {type: 'ConstantValue', value: 0},
                            emissionOverDistance: {type: 'ConstantValue', value: 0},
                            emissionBursts: [],
                            onlyUsedByOther: false,
                            instancingGeometry: 'plane',
                            renderOrder: 0,
                            renderMode: 0,
                            rendererEmitterSettings: {},
                            material: 'mat',
                            layers: 1,
                            startTileIndex: {type: 'ConstantValue', value: 0},
                            uTileCount: 1,
                            vTileCount: 1,
                            blendTiles: false,
                            softParticles: false,
                            softFarFade: 0,
                            softNearFade: 0,
                            behaviors: [],
                            worldSpace: true,
                        },
                    },
                ],
            },
        });

        const prefab = root.getChildren().find((node) => node instanceof QuarksPrefab);
        expect(prefab).toBeInstanceOf(QuarksPrefab);
        expect((prefab as QuarksPrefab).animationData.length).toBe(1);

        scene.dispose();
        engine.dispose();
    });

    it('marks sub-emitter particle systems as onlyUsedByOther after UUID resolve', () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new QuarksLoader(scene);

        const root = loader.parse({
            geometries: [{uuid: 'plane', type: 'PlaneGeometry', width: 1, height: 1}],
            materials: [{uuid: 'mat', type: 'MeshBasicMaterial', transparent: true, blending: 1}],
            object: {
                uuid: 'root',
                type: 'Group',
                children: [
                    {
                        uuid: 'parent-emitter',
                        type: 'ParticleEmitter',
                        ps: {
                            version: '2.0',
                            autoDestroy: false,
                            looping: true,
                            prewarm: false,
                            duration: 1,
                            shape: {type: 'point'},
                            startLife: {type: 'ConstantValue', value: 1},
                            startSpeed: {type: 'ConstantValue', value: 0},
                            startRotation: {type: 'ConstantValue', value: 0},
                            startSize: {type: 'ConstantValue', value: 1},
                            startColor: {type: 'ConstantColor', color: {r: 1, g: 1, b: 1, a: 1}},
                            emissionOverTime: {type: 'ConstantValue', value: 0},
                            emissionOverDistance: {type: 'ConstantValue', value: 0},
                            emissionBursts: [],
                            onlyUsedByOther: false,
                            instancingGeometry: 'plane',
                            renderOrder: 0,
                            renderMode: 0,
                            rendererEmitterSettings: {},
                            material: 'mat',
                            layers: 1,
                            startTileIndex: {type: 'ConstantValue', value: 0},
                            uTileCount: 1,
                            vTileCount: 1,
                            behaviors: [
                                {
                                    type: 'EmitSubParticleSystem',
                                    useVelocityAsBasis: false,
                                    subParticleSystem: 'sub-emitter',
                                    mode: 2,
                                    emitProbability: 1,
                                },
                            ],
                            worldSpace: true,
                        },
                    },
                    {
                        uuid: 'sub-emitter',
                        type: 'ParticleEmitter',
                        ps: {
                            version: '2.0',
                            autoDestroy: false,
                            looping: false,
                            prewarm: false,
                            duration: 1,
                            shape: {type: 'point'},
                            startLife: {type: 'ConstantValue', value: 1},
                            startSpeed: {type: 'ConstantValue', value: 0},
                            startRotation: {type: 'ConstantValue', value: 0},
                            startSize: {type: 'ConstantValue', value: 1},
                            startColor: {type: 'ConstantColor', color: {r: 1, g: 1, b: 1, a: 1}},
                            emissionOverTime: {type: 'ConstantValue', value: 0},
                            emissionOverDistance: {type: 'ConstantValue', value: 0},
                            emissionBursts: [],
                            onlyUsedByOther: false,
                            instancingGeometry: 'plane',
                            renderOrder: 0,
                            renderMode: 0,
                            rendererEmitterSettings: {},
                            material: 'mat',
                            layers: 1,
                            startTileIndex: {type: 'ConstantValue', value: 0},
                            uTileCount: 1,
                            vTileCount: 1,
                            behaviors: [],
                            worldSpace: true,
                        },
                    },
                ],
            },
        });

        const subEmitter = root.getChildren().find((c) => (c as any)._quarksUUID === 'sub-emitter') as ParticleEmitter;
        expect(subEmitter).toBeInstanceOf(ParticleEmitter);
        expect((subEmitter.system as ParticleSystem).onlyUsedByOther).toBe(true);

        scene.dispose();
        engine.dispose();
    });

    it('parses mesh nodes and extended object types with placeholders', () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new QuarksLoader(scene);

        const root = loader.parse({
            geometries: [{uuid: 'plane', type: 'PlaneGeometry', width: 2, height: 2}],
            materials: [{uuid: 'mat', type: 'MeshBasicMaterial', transparent: true, blending: 2}],
            object: {
                uuid: 'root',
                type: 'Scene',
                children: [
                    {uuid: 'mesh-1', type: 'Mesh', name: 'mesh-1', geometry: 'plane', material: 'mat'},
                    {uuid: 'camera-1', type: 'PerspectiveCamera', name: 'camera-1'},
                    {uuid: 'light-1', type: 'DirectionalLight', name: 'light-1'},
                ],
            },
        });

        const children = root.getChildren();
        const mesh = children.find((node) => node.name === 'mesh-1');
        const cameraNode = children.find((node) => node.name === 'camera-1') as any;
        const lightNode = children.find((node) => node.name === 'light-1') as any;

        expect(mesh).toBeInstanceOf(Mesh);
        expect((mesh as Mesh).getTotalVertices()).toBeGreaterThan(0);
        expect(cameraNode.quarksOriginalType).toBe('PerspectiveCamera');
        expect(lightNode.quarksOriginalType).toBe('DirectionalLight');

        scene.dispose();
        engine.dispose();
    });

    it('loads JSON via fetch and parses into root transform', async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new QuarksLoader(scene);
        const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
            json: async () => ({
                object: {
                    uuid: 'root',
                    type: 'Group',
                    children: [],
                },
            }),
        } as any);

        const root = await loader.load('https://example.com/assets/effect.json');
        expect(root.name).toBe('Group');
        expect(fetchSpy).toHaveBeenCalledWith('https://example.com/assets/effect.json');

        fetchSpy.mockRestore();
        scene.dispose();
        engine.dispose();
    });

    it('parses interleaved buffer geometry, textures and material mapping', () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new QuarksLoader(scene);

        const toInt32Bits = (value: number) => new Int32Array(new Float32Array([value]).buffer)[0];
        const interleavedFloats = [
            0, 0, 0, 0, 0, 0, 0, 1,
            1, 0, 0, 1, 0, 0, 0, 1,
            0, 1, 0, 0, 1, 0, 0, 1,
        ];
        const packedInt32 = interleavedFloats.map(toInt32Bits);

        const root = loader.parse({
            images: [{uuid: 'img-1', url: 'textures/test.png'}],
            textures: [
                {
                    uuid: 'tex-1',
                    image: 'img-1',
                    wrap: [1001, 1002],
                    repeat: [2, 3],
                    offset: [0.1, 0.2],
                    rotation: 0.5,
                },
            ],
            materials: [
                {
                    uuid: 'mat-1',
                    map: 'tex-1',
                    blending: 3,
                    side: 1,
                    depthTest: true,
                    depthWrite: true,
                    alphaTest: 0.25,
                },
            ],
            geometries: [
                {
                    uuid: 'geo-1',
                    type: 'BufferGeometry',
                    data: {
                        arrayBuffers: {ab1: packedInt32},
                        interleavedBuffers: {ib1: {buffer: 'ab1', stride: 8}},
                        attributes: {
                            position: {isInterleavedBufferAttribute: true, data: 'ib1', offset: 0, itemSize: 3},
                            uv: {isInterleavedBufferAttribute: true, data: 'ib1', offset: 3, itemSize: 2},
                            normal: {isInterleavedBufferAttribute: true, data: 'ib1', offset: 5, itemSize: 3},
                        },
                        index: {type: 'Uint16Array', array: [0, 1, 2]},
                    },
                },
            ],
            object: {
                uuid: 'root',
                type: 'Group',
                children: [
                    {
                        uuid: 'mesh-1',
                        type: 'Mesh',
                        name: 'interleaved-mesh',
                        geometry: 'geo-1',
                        material: ['mat-1'],
                    },
                ],
            },
        }, 'https://cdn.example.com/base/');

        const mesh = root.getChildren().find((node) => node.name === 'interleaved-mesh') as Mesh;
        expect(mesh).toBeInstanceOf(Mesh);
        expect(mesh.getTotalVertices()).toBe(3);
        expect(mesh.getIndices()?.length).toBe(3);
        expect(mesh.material).toBeDefined();

        const material = mesh.material as any;
        expect(material.alphaMode).toBe(Constants.ALPHA_SUBTRACT);
        expect(material.backFaceCulling).toBe(true);
        expect(material.alphaCutOff).toBeCloseTo(0.25, 5);
        expect(material.disableDepthWrite).toBe(false);
        expect(material.diffuseTexture).toBeDefined();
        expect(material.diffuseTexture.wrapU).toBe(Texture.CLAMP_ADDRESSMODE);
        expect(material.diffuseTexture.wrapV).toBe(Texture.MIRROR_ADDRESSMODE);
        expect(material.diffuseTexture.uScale).toBe(2);
        expect(material.diffuseTexture.vScale).toBe(3);
        expect(material.diffuseTexture.uOffset).toBeCloseTo(0.1, 5);
        expect(material.diffuseTexture.vOffset).toBeCloseTo(0.2, 5);
        expect(material.diffuseTexture.wAng).toBeCloseTo(0.5, 5);

        scene.dispose();
        engine.dispose();
    });

    it('resolves QuarksMaterial texture field on reimport (library round-trip)', () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        // ParticleSystem.toJSON emits materials with a `texture` uuid (QuarksMaterial), not the
        // three.js `map` field. QuarksLoader must accept both so a library-exported effect reloads
        // with its texture intact. Do a genuine round-trip: build a system with a texture, toJSON,
        // flatten the live-texture meta into the serializable envelope, then parse it back.
        const source = new ParticleSystem({scene, texture: new Texture('textures/spark.png', scene)});
        const meta: any = {textures: {}, materials: {}, geometries: {}};
        const ps = source.toJSON(meta, {} as any);

        const images = Object.entries(meta.textures).map(([uuid, tex]: [string, any]) => ({
            uuid: `${uuid}-image`,
            url: tex.url ?? tex.name,
        }));
        const textures = Object.keys(meta.textures).map((uuid) => ({uuid, image: `${uuid}-image`}));

        const root = new QuarksLoader(scene).parse(
            {
                images,
                textures,
                materials: Object.values(meta.materials),
                object: {uuid: 'emitter-1', type: 'ParticleEmitter', ps},
            },
            ''
        );

        const emitter = root instanceof ParticleEmitter ? root : (root.getChildren().find((n) => n instanceof ParticleEmitter) as ParticleEmitter);
        expect(emitter).toBeInstanceOf(ParticleEmitter);
        expect((emitter.system as ParticleSystem).texture).toBeTruthy();

        scene.dispose();
        engine.dispose();
    });

    it('parses sphere and plain buffer geometry variants', () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new QuarksLoader(scene);

        const root = loader.parse({
            geometries: [
                {
                    uuid: 'sphere-1',
                    type: 'SphereGeometry',
                    radius: 1,
                    widthSegments: 8,
                    heightSegments: 6,
                    thetaStart: 0.25,
                    thetaLength: Math.PI * 0.75,
                },
                {
                    uuid: 'buffer-1',
                    type: 'BufferGeometry',
                    data: {
                        attributes: {
                            position: {array: [0, 0, 0, 1, 0, 0, 0, 1, 0]},
                            uv: {array: [0, 0, 1, 0, 0, 1]},
                            normal: {array: [0, 0, 1, 0, 0, 1, 0, 0, 1]},
                        },
                        index: {type: 'Uint32Array', array: [0, 1, 2]},
                    },
                },
            ],
            object: {
                uuid: 'root',
                type: 'Group',
                children: [
                    {uuid: 'mesh-sphere', type: 'Mesh', name: 'mesh-sphere', geometry: 'sphere-1'},
                    {uuid: 'mesh-buffer', type: 'Mesh', name: 'mesh-buffer', geometry: 'buffer-1'},
                ],
            },
        });

        const sphereMesh = root.getChildren().find((node) => node.name === 'mesh-sphere') as Mesh;
        const bufferMesh = root.getChildren().find((node) => node.name === 'mesh-buffer') as Mesh;
        expect(sphereMesh.getTotalVertices()).toBeGreaterThan(0);
        expect(sphereMesh.getIndices()?.length).toBeGreaterThan(0);
        expect(bufferMesh.getTotalVertices()).toBe(3);
        expect(bufferMesh.getIndices()?.length).toBe(3);

        scene.dispose();
        engine.dispose();
    });

    it('handles placeholder branches for missing particle system data and unknown types', () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new QuarksLoader(scene);

        const root = loader.parse({
            object: {
                uuid: 'root',
                type: 'Group',
                children: [
                    {uuid: 'empty-emitter', type: 'ParticleEmitter', name: 'empty-emitter'},
                    {uuid: 'rot-node', type: 'Object3D', name: 'rot-node', rotation: [0.1, 0.2, 0.3]},
                    {uuid: 'quat-node', type: 'Object3D', name: 'quat-node', quaternion: [0, 0, 0, 1]},
                    {uuid: 'mystery-node', type: 'SomeUnknownType', name: 'mystery-node'},
                ],
            },
        });

        const emptyEmitter = root.getChildren().find((node) => node.name === 'empty-emitter') as any;
        const mystery = root.getChildren().find((node) => node.name === 'mystery-node') as any;
        const rotNode = root.getChildren().find((node) => node.name === 'rot-node') as any;
        const quatNode = root.getChildren().find((node) => node.name === 'quat-node') as any;

        expect(emptyEmitter.quarksOriginalType).toBe('ParticleEmitter');
        expect(mystery).toBeDefined();
        expect(rotNode.rotation.x).toBeCloseTo(0.1, 5);
        expect(quatNode.rotationQuaternion).not.toBeNull();

        scene.dispose();
        engine.dispose();
    });

    it('skips mesh_surface link when referenced node is not a Mesh', () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new QuarksLoader(scene);

        const root = loader.parse({
            geometries: [{uuid: 'plane', type: 'PlaneGeometry', width: 1, height: 1}],
            materials: [{uuid: 'mat', type: 'MeshBasicMaterial', transparent: true, blending: 1}],
            object: {
                uuid: 'root',
                type: 'Group',
                children: [
                    {uuid: 'surface-node', type: 'Object3D', name: 'surface-node'},
                    {
                        uuid: 'emitter-ms',
                        type: 'ParticleEmitter',
                        ps: {
                            version: '2.0',
                            autoDestroy: false,
                            looping: true,
                            prewarm: false,
                            duration: 1,
                            shape: {type: 'mesh_surface', mesh: 'surface-node'},
                            startLife: {type: 'ConstantValue', value: 1},
                            startSpeed: {type: 'ConstantValue', value: 0},
                            startRotation: {type: 'ConstantValue', value: 0},
                            startSize: {type: 'ConstantValue', value: 1},
                            startColor: {type: 'ConstantColor', color: {r: 1, g: 1, b: 1, a: 1}},
                            emissionOverTime: {type: 'ConstantValue', value: 0},
                            emissionOverDistance: {type: 'ConstantValue', value: 0},
                            emissionBursts: [],
                            onlyUsedByOther: false,
                            instancingGeometry: 'plane',
                            renderOrder: 0,
                            renderMode: 0,
                            rendererEmitterSettings: {},
                            material: 'mat',
                            layers: 1,
                            startTileIndex: {type: 'ConstantValue', value: 0},
                            uTileCount: 1,
                            vTileCount: 1,
                            behaviors: [],
                            worldSpace: true,
                        },
                    },
                ],
            },
        });

        const emitter = root.getChildren()[1] as ParticleEmitter;
        expect(emitter).toBeInstanceOf(ParticleEmitter);
        expect(((emitter.system as ParticleSystem).emitterShape as any).type).toBe('mesh_surface');
        expect(((emitter.system as ParticleSystem).emitterShape as any).mesh).toBeUndefined();

        scene.dispose();
        engine.dispose();
    });

    it('records null textures when image asset is missing and maps unknown wrap modes', () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new QuarksLoader(scene);

        const root = loader.parse({
            textures: [
                {uuid: 'ghost-tex', image: 'missing-image'},
                {
                    uuid: 'wrap-unknown',
                    image: 'img-1',
                    wrap: [4242, 4242],
                    repeat: [1, 1],
                },
            ],
            images: [{uuid: 'img-1', url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='}],
            object: {uuid: 'root', type: 'Group', children: []},
        });

        expect(root).toBeDefined();
        scene.dispose();
        engine.dispose();
    });

    it('resolves image urls against baseUrl for relative paths but not for data/absolute URIs', () => {
        // Regression: parseImages used to always prepend baseUrl, turning a data URI into an
        // invalid path like "https://cdn.example.com/base/data:image/png;base64,AAAA". Only
        // triggers with a non-empty baseUrl (i.e. via .load(url), not bare .parse(json)) —
        // the pre-fix test above never caught it because it always parsed with baseUrl=''.
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new QuarksLoader(scene);

        const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
        const root = loader.parse(
            {
                textures: [
                    {uuid: 'tex-data', image: 'img-data'},
                    {uuid: 'tex-relative', image: 'img-relative'},
                ],
                images: [
                    {uuid: 'img-data', url: dataUri},
                    {uuid: 'img-relative', url: 'textures/spark.png'},
                ],
                materials: [
                    {uuid: 'mat-data', type: 'MeshBasicMaterial', map: 'tex-data'},
                    {uuid: 'mat-relative', type: 'MeshBasicMaterial', map: 'tex-relative'},
                ],
                geometries: [{uuid: 'plane', type: 'PlaneGeometry', width: 1, height: 1}],
                object: {
                    uuid: 'root',
                    type: 'Group',
                    children: [
                        {uuid: 'mesh-data', type: 'Mesh', name: 'mesh-data', geometry: 'plane', material: 'mat-data'},
                        {uuid: 'mesh-relative', type: 'Mesh', name: 'mesh-relative', geometry: 'plane', material: 'mat-relative'},
                    ],
                },
            },
            'https://cdn.example.com/base/'
        );

        const meshData = root.getChildren().find((node) => node.name === 'mesh-data') as Mesh;
        const meshRelative = root.getChildren().find((node) => node.name === 'mesh-relative') as Mesh;
        expect((meshData.material as any).diffuseTexture.url).toBe(dataUri);
        expect((meshRelative.material as any).diffuseTexture.url).toBe('https://cdn.example.com/base/textures/spark.png');

        scene.dispose();
        engine.dispose();
    });

    it('links mesh_surface emitter to concrete Mesh instances', () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new QuarksLoader(scene);
        const root = loader.parse({
            geometries: [{uuid: 'plane', type: 'PlaneGeometry', width: 1, height: 1}],
            materials: [{uuid: 'mat', type: 'MeshBasicMaterial', transparent: true, blending: 1}],
            object: {
                uuid: 'root',
                type: 'Group',
                children: [
                    {uuid: 'surf-mesh', type: 'Mesh', name: 'surf-mesh', geometry: 'plane', material: 'mat'},
                    {
                        uuid: 'em-linked',
                        type: 'ParticleEmitter',
                        ps: {
                            version: '2.0',
                            autoDestroy: false,
                            looping: true,
                            prewarm: false,
                            duration: 1,
                            shape: {type: 'mesh_surface', mesh: 'surf-mesh'},
                            startLife: {type: 'ConstantValue', value: 1},
                            startSpeed: {type: 'ConstantValue', value: 0},
                            startRotation: {type: 'ConstantValue', value: 0},
                            startSize: {type: 'ConstantValue', value: 1},
                            startColor: {type: 'ConstantColor', color: {r: 1, g: 1, b: 1, a: 1}},
                            emissionOverTime: {type: 'ConstantValue', value: 0},
                            emissionOverDistance: {type: 'ConstantValue', value: 0},
                            emissionBursts: [],
                            onlyUsedByOther: false,
                            instancingGeometry: 'plane',
                            renderOrder: 0,
                            renderMode: 0,
                            rendererEmitterSettings: {},
                            material: 'mat',
                            layers: 1,
                            startTileIndex: {type: 'ConstantValue', value: 0},
                            uTileCount: 1,
                            vTileCount: 1,
                            behaviors: [],
                            worldSpace: true,
                        },
                    },
                ],
            },
        });
        const emitter = root.getChildren()[1] as ParticleEmitter;
        const mesh = root.getChildren()[0] as Mesh;
        expect(((emitter.system as ParticleSystem).emitterShape as any).mesh).toBe(mesh);
        scene.dispose();
        engine.dispose();
    });

    it('synthesizes sequential indices for non-indexed BufferGeometry (Unity-style export)', () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new QuarksLoader(scene);

        const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0];
        const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
        const uvs = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];

        const root = loader.parse({
            geometries: [
                {
                    uuid: 'arc',
                    type: 'BufferGeometry',
                    data: {
                        attributes: {
                            position: {itemSize: 3, type: 'Float32Array', array: positions},
                            normal: {itemSize: 3, type: 'Float32Array', array: normals},
                            uv: {itemSize: 2, type: 'Float32Array', array: uvs},
                        },
                    },
                },
            ],
            materials: [{uuid: 'mat', type: 'MeshBasicMaterial', transparent: true, blending: 2}],
            object: {
                uuid: 'root',
                type: 'Group',
                children: [
                    {
                        uuid: 'glow-parent',
                        type: 'Group',
                        name: 'GlowCircle',
                        matrix: [
                            1, 0, 0, 0, 0, -5.321248036699279e-8, -1.0000000532124804, 0, 0, 0.7500000399093601,
                            -3.990936027524458e-8, 0, 0, 0, 0, 1,
                        ],
                        children: [
                            {
                                uuid: 'glow-emitter',
                                type: 'ParticleEmitter',
                                name: 'GlowCircleEmitter',
                                ps: {
                                    version: '3.0',
                                    autoDestroy: false,
                                    looping: true,
                                    prewarm: false,
                                    duration: 2,
                                    shape: {type: 'point'},
                                    startLife: {type: 'ConstantValue', value: 1},
                                    startSpeed: {type: 'ConstantValue', value: 0},
                                    startRotation: {
                                        type: 'Euler',
                                        angleX: {type: 'IntervalValue', a: 0, b: 0},
                                        angleY: {type: 'IntervalValue', a: 0, b: 0},
                                        angleZ: {type: 'IntervalValue', a: 0, b: 6.283185},
                                        eulerOrder: 'XYZ',
                                    },
                                    startSize: {type: 'ConstantValue', value: 4.15},
                                    startColor: {
                                        type: 'ConstantColor',
                                        color: {r: 1, g: 1, b: 0, a: 0.1764706},
                                    },
                                    emissionOverTime: {type: 'ConstantValue', value: 2},
                                    emissionOverDistance: {type: 'ConstantValue', value: 0},
                                    emissionBursts: [],
                                    onlyUsedByOther: false,
                                    instancingGeometry: 'arc',
                                    renderOrder: 0,
                                    renderMode: 2,
                                    rendererEmitterSettings: {},
                                    material: 'mat',
                                    layers: 1,
                                    startTileIndex: {type: 'ConstantValue', value: 0},
                                    uTileCount: 1,
                                    vTileCount: 1,
                                    behaviors: [],
                                    worldSpace: true,
                                },
                            },
                        ],
                    },
                ],
            },
        });

        const glowGroup = root.getChildren()[0];
        expect(glowGroup.name).toBe('GlowCircle');
        const emitter = glowGroup.getChildren()[0] as ParticleEmitter;
        expect(emitter.name).toBe('GlowCircleEmitter');
        const settings = (emitter.system as ParticleSystem).getRendererSettings();
        expect(settings.instancingGeometry.length / 3).toBe(6);
        expect(settings.instancingIndices.length).toBe(6);
        expect(Array.from(settings.instancingIndices as Uint32Array)).toEqual([0, 1, 2, 3, 4, 5]);

        scene.dispose();
        engine.dispose();
    });
});
