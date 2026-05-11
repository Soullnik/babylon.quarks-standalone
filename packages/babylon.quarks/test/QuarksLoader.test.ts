import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Matrix, Quaternion, Vector3} from '@babylonjs/core/Maths/math.vector';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {QuarksLoader} from '../src/QuarksLoader';
import {QuarksPrefab} from '../src/QuarksPrefab';
import {ParticleEmitter} from '../src/ParticleEmitter';
import {ParticleSystem} from '../src/ParticleSystem';

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
});
