import {Constants} from '@babylonjs/core/Engines/constants';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Matrix, Quaternion, Vector3} from '@babylonjs/core/Maths/math.vector';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {loadPlugin, PointEmitter} from 'quarks.core';
import {MeshSurfaceEmitter, MeshSurfaceEmitterPlugin} from '../src/MeshSurfaceEmitter';
import {ParticleEmitter} from '../src/ParticleEmitter';
import {ParticleSystem} from '../src/ParticleSystem';
import {QuarksFormatError, QuarksLoader} from '../src/QuarksLoader';
import {QuarksPrefab} from '../src/QuarksPrefab';
import {QUARKS_FORMAT_VERSION, serializeEffect} from '../src/QuarksSerializer';
import {fileNodeId} from '../src/nodeId';
import {textureSourceUrl} from '../src/textureSource';
import {emptyMeta, jsonResponse} from './internals';

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
            geometries: [{uuid: 'plane', type: 'PlaneGeometry', width: 1, height: 1}],
            materials: [{uuid: 'mat', type: 'MeshBasicMaterial', transparent: true, blending: 1}],
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

        const emitter = root.getChildren()[0] as ParticleEmitter;
        expect((emitter.system as ParticleSystem).emissionBursts[0].cycle).toBe(3);

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
        });

        const meta = emptyMeta();
        const psJSON = ps.toJSON(meta);
        const envelope = {
            geometries: Object.values(meta.geometries),
            materials: Object.values(meta.materials).map(({sourceMaterial: _s, ...rest}) => rest),
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
        });

        const meta = emptyMeta();
        const psJSON = ps.toJSON(meta);
        const envelope = {
            geometries: Object.values(meta.geometries),
            materials: Object.values(meta.materials).map(({sourceMaterial: _s, ...rest}) => rest),
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

        const subEmitter = root.getChildren().find((c) => fileNodeId(c) === 'sub-emitter') as ParticleEmitter;
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
        const cameraNode = children.find((node) => node.name === 'camera-1');
        const lightNode = children.find((node) => node.name === 'light-1');

        expect(mesh).toBeInstanceOf(Mesh);
        expect((mesh as Mesh).getTotalVertices()).toBeGreaterThan(0);
        expect(cameraNode).toHaveProperty('quarksOriginalType', 'PerspectiveCamera');
        expect(lightNode).toHaveProperty('quarksOriginalType', 'DirectionalLight');

        scene.dispose();
        engine.dispose();
    });

    it('loads JSON via fetch and parses into root transform', async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new QuarksLoader(scene);
        const fetchSpy = jest
            .spyOn(global, 'fetch')
            .mockImplementation(async () => jsonResponse({object: {uuid: 'root', type: 'Group', children: []}}));

        const root = await loader.load('https://example.com/assets/effect.json');
        expect(root.name).toBe('Group');
        expect(fetchSpy).toHaveBeenCalledWith('https://example.com/assets/effect.json');

        fetchSpy.mockRestore();
        scene.dispose();
        engine.dispose();
    });

    it('fetches a relative effect url relative to the page, or to the loader baseUrl', async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const fetched: string[] = [];
        const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input: string | URL | Request) => {
            fetched.push(String(input));
            return jsonResponse({object: {uuid: 'root', type: 'Group', children: []}});
        });

        await new QuarksLoader(scene).load('effects/campfire.json');
        await new QuarksLoader(scene).loadAll(['effects/campfire.json']);
        await new QuarksLoader(scene, {baseUrl: 'https://cdn.example.com/fx/'}).load('effects/campfire.json');
        expect(fetched).toEqual([
            'effects/campfire.json',
            'effects/campfire.json',
            'https://cdn.example.com/fx/effects/campfire.json',
        ]);

        const resolve = jest.fn((url: string) => url);
        await new QuarksLoader(scene, {resolver: {resolve}}).load('effects/campfire.json');
        expect(resolve).toHaveBeenCalledWith('effects/campfire.json', 'effect', '');

        fetchSpy.mockRestore();
        scene.dispose();
        engine.dispose();
    });

    it('fetches geometries exported as files relative to the effect and inlines them', async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new QuarksLoader(scene);
        const responses: Record<string, unknown> = {
            'https://example.com/fx/sub/effect.json': {
                geometries: [{uuid: 'geo', type: 'QuarksGeometry', url: '../assets/geometries/Quad.json'}],
                object: {uuid: 'm', type: 'Mesh', name: 'quad', geometry: 'geo'},
            },
            'https://example.com/fx/sub/../assets/geometries/Quad.json': {
                metadata: {type: 'QuarksGeometry'},
                positions: [0, 0, 0, 1, 0, 0, 1, 1, 0],
                indices: [0, 1, 2],
                uvs: [0, 0, 1, 0, 1, 1],
            },
        };
        const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input: string | URL | Request) => {
            const body = responses[String(input)];
            return jsonResponse(body, body ? 200 : 404);
        });

        const root = await loader.load('https://example.com/fx/sub/effect.json');
        expect(root).toBeInstanceOf(Mesh);
        expect((root as Mesh).getTotalVertices()).toBe(3);

        fetchSpy.mockRestore();
        scene.dispose();
        engine.dispose();
    });

    it('resolveExternalGeometries leaves a geometry that fails to load in place and warns', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const json = {
            geometries: [
                {uuid: 'a', type: 'QuarksGeometry', url: 'missing.json'},
                {uuid: 'b', type: 'QuarksGeometry', positions: [0, 0, 0]},
            ],
        };
        await QuarksLoader.resolveExternalGeometries(json, async () => {
            throw new Error('404');
        });
        expect(json.geometries[0]).toEqual({uuid: 'a', type: 'QuarksGeometry', url: 'missing.json'});
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing.json'), expect.any(Error));

        // parse() without resolving names the external file instead of silently rendering nothing.
        const engine = new NullEngine();
        const scene = new Scene(engine);
        new QuarksLoader(scene).parse({...json, object: {uuid: 'root', type: 'Group'}});
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('is an external file'));

        await QuarksLoader.resolveExternalGeometries({}, async () => ({}));
        warn.mockRestore();
        scene.dispose();
        engine.dispose();
    });

    it('loadFromJSON inlines external geometries and resolves relative image urls', async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new QuarksLoader(scene);
        const geometryBody = {
            positions: [0, 0, 0, 1, 0, 0, 1, 1, 0],
            indices: [0, 1, 2],
        };
        const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input: string | URL | Request) => {
            const url = String(input);
            if (url.endsWith('Quad.json')) {
                return jsonResponse(geometryBody);
            }
            return jsonResponse(null, 404);
        });

        const json = {
            images: [{uuid: 'img', url: 'textures/smoke.png'}],
            textures: [{uuid: 'tex', image: 'img'}],
            materials: [{uuid: 'mat', map: 'tex'}],
            geometries: [{uuid: 'geo', type: 'QuarksGeometry', url: 'geometries/Quad.json'}],
            object: {uuid: 'm', type: 'Mesh', name: 'quad', geometry: 'geo', material: 'mat'},
        };
        const before = JSON.parse(JSON.stringify(json));
        const root = await loader.loadFromJSON(json, 'https://cdn.example.com/fx/');
        expect(root).toBeInstanceOf(Mesh);
        expect((root as Mesh).getTotalVertices()).toBe(3);
        const texture = ((root as Mesh).material as StandardMaterial).diffuseTexture as Texture;
        expect(texture.url).toBe('https://cdn.example.com/fx/textures/smoke.png');
        // The caller's document is left as it was.
        expect(json).toEqual(before);
        expect(fetchSpy).toHaveBeenCalledWith('https://cdn.example.com/fx/geometries/Quad.json');

        fetchSpy.mockRestore();
        scene.dispose();
        engine.dispose();
    });

    describe('relative base urls', () => {
        const effect = () => ({
            images: [{uuid: 'img', url: 'tex/a.png'}],
            textures: [{uuid: 'tex', image: 'img'}],
            object: {uuid: 'root', type: 'Group'},
        });
        const textureUrls = (scene: Scene) =>
            scene.textures.map((texture) => (texture as Texture).url).filter((url) => url?.endsWith('a.png'));

        it.each(['fx/', '/fx/', 'https://cdn.example.com/fx/'])(
            'joins base %s with a texture url once, however often the same document loads',
            async (base) => {
                const engine = new NullEngine();
                const scene = new Scene(engine);
                const loader = new QuarksLoader(scene, {shareResources: false});
                const json = effect();
                await loader.loadFromJSON(json, base);
                await loader.loadFromJSON(json, base);
                await loader.loadFromJSONAll([
                    {json, baseUrl: base},
                    {json, baseUrl: base},
                ]);
                expect(textureUrls(scene)).toEqual(new Array(4).fill(`${base}tex/a.png`));
                scene.dispose();
                engine.dispose();
            }
        );

        it('resolves textures against a relative effect url once', async () => {
            const engine = new NullEngine();
            const scene = new Scene(engine);
            const loader = new QuarksLoader(scene, {shareResources: false});
            const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => jsonResponse(effect()));
            await loader.load('fx/hit.json');
            await loader.loadAll(['fx/hit.json', 'fx/hit.json']);
            expect(textureUrls(scene)).toEqual(new Array(3).fill('fx/tex/a.png'));
            fetchSpy.mockRestore();
            scene.dispose();
            engine.dispose();
        });
    });

    it('dedupes geometry JSON fetches for the same resolved url across parallel loads', async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new QuarksLoader(scene);
        let geometryFetches = 0;
        const geometryBody = {
            positions: [0, 0, 0, 1, 0, 0, 1, 1, 0],
            indices: [0, 1, 2],
        };
        const effectJson = () => ({
            geometries: [{uuid: 'geo', type: 'QuarksGeometry', url: 'assets/geometries/Quad.json'}],
            object: {uuid: 'm', type: 'Mesh', name: 'quad', geometry: 'geo'},
        });
        const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input: string | URL | Request) => {
            const url = String(input);
            if (url.endsWith('effect-a.json') || url.endsWith('effect-b.json')) {
                return jsonResponse(effectJson());
            }
            if (url.endsWith('Quad.json')) {
                geometryFetches++;
                return jsonResponse(geometryBody);
            }
            return jsonResponse(null, 404);
        });

        const [a, b] = await Promise.all([
            loader.load('https://example.com/fx/effect-a.json'),
            loader.load('https://example.com/fx/effect-b.json'),
        ]);
        expect(a).toBeInstanceOf(Mesh);
        expect(b).toBeInstanceOf(Mesh);
        expect(geometryFetches).toBe(1);

        fetchSpy.mockRestore();
        scene.dispose();
        engine.dispose();
    });

    it('uses a custom resolver for geometry and image urls', async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const fetchJson = jest.fn(async (resolved: string) => {
            expect(resolved).toBe('vfs:geometries/Box.json');
            return {positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2]};
        });
        const loader = new QuarksLoader(scene, {
            resolver: {
                resolve: (url, kind) => `vfs:${kind === 'image' ? 'images' : 'geometries'}/${url.split('/').pop()}`,
                fetchJson,
            },
        });

        const json = {
            images: [{uuid: 'img', url: 'folder/tex.png'}],
            textures: [{uuid: 'tex', image: 'img'}],
            materials: [{uuid: 'mat', map: 'tex'}],
            geometries: [{uuid: 'geo', type: 'QuarksGeometry', url: 'folder/Box.json'}],
            object: {uuid: 'm', type: 'Mesh', name: 'box', geometry: 'geo', material: 'mat'},
        };
        const root = await loader.loadFromJSON(json, 'ignored/');
        expect(root).toBeInstanceOf(Mesh);
        expect(fetchJson).toHaveBeenCalledTimes(1);
        const texture = ((root as Mesh).material as StandardMaterial).diffuseTexture as Texture;
        expect(texture.url).toBe('vfs:images/tex.png');
        expect((root as Mesh).getTotalVertices()).toBe(3);

        scene.dispose();
        engine.dispose();
    });

    it('loadAll preloads a pack with one shared geometry fetch and progress', async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new QuarksLoader(scene);
        let geometryFetches = 0;
        const geometryBody = {
            positions: [0, 0, 0, 1, 0, 0, 1, 1, 0],
            indices: [0, 1, 2],
        };
        const effectJson = (name: string) => ({
            geometries: [{uuid: 'geo', type: 'QuarksGeometry', url: 'assets/geometries/Shared.json'}],
            object: {uuid: name, type: 'Mesh', name, geometry: 'geo'},
        });
        const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input: string | URL | Request) => {
            const url = String(input);
            if (/effect-[abc]\.json$/.test(url)) {
                const name = url.slice(url.lastIndexOf('/') + 1, -5);
                return jsonResponse(effectJson(name));
            }
            if (url.endsWith('Shared.json')) {
                geometryFetches++;
                return jsonResponse(geometryBody);
            }
            return jsonResponse(null, 404);
        });

        const progress: Array<[number, number]> = [];
        const roots = await loader.loadAll(
            [
                'https://example.com/fx/effect-a.json',
                'https://example.com/fx/effect-b.json',
                'https://example.com/fx/effect-c.json',
            ],
            {onProgress: (done, total) => progress.push([done, total])}
        );

        expect(roots).toHaveLength(3);
        expect(roots.every((r) => r instanceof Mesh)).toBe(true);
        expect(geometryFetches).toBe(1);
        expect(progress).toEqual([
            [1, 3],
            [2, 3],
            [3, 3],
        ]);

        fetchSpy.mockRestore();
        scene.dispose();
        engine.dispose();
    });

    it('loadAll continueOnError keeps successes when one url fails', async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new QuarksLoader(scene);
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input: string | URL | Request) => {
            const url = String(input);
            if (url.endsWith('bad.json')) {
                return jsonResponse(null, 404);
            }
            return jsonResponse({object: {uuid: 'ok', type: 'Group', name: 'ok'}});
        });

        const progress: Array<[number, number]> = [];
        const roots = await loader.loadAll(['https://example.com/fx/ok.json', 'https://example.com/fx/bad.json'], {
            continueOnError: true,
            onProgress: (done, total) => progress.push([done, total]),
        });
        expect(roots[0]?.name).toBe('ok');
        expect(roots[1]).toBeNull();
        expect(warn).toHaveBeenCalled();
        // One settle callback per effect (success or fail), never double-counted across phases.
        expect(progress).toEqual([
            [1, 2],
            [2, 2],
        ]);

        fetchSpy.mockRestore();
        warn.mockRestore();
        scene.dispose();
        engine.dispose();
    });

    it('loadFromJSONAll resolves a pack of in-memory effects', async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        let geometryFetches = 0;
        const loader = new QuarksLoader(scene, {
            resolver: {
                fetchJson: async () => {
                    geometryFetches++;
                    return {positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2]};
                },
            },
        });

        const make = (name: string) => ({
            geometries: [{uuid: 'geo', type: 'QuarksGeometry', url: 'shared.json'}],
            object: {uuid: name, type: 'Mesh', name, geometry: 'geo'},
        });
        const roots = await loader.loadFromJSONAll([
            {json: make('a'), baseUrl: 'pack/'},
            {json: make('b'), baseUrl: 'pack/'},
        ]);
        expect(roots).toHaveLength(2);
        expect(roots[0]).toBeInstanceOf(Mesh);
        expect(roots[1]).toBeInstanceOf(Mesh);
        expect(geometryFetches).toBe(1);

        scene.dispose();
        engine.dispose();
    });

    it('does not alias cached geometry arrays across effects in a batch', async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const shared = {positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2]};
        const loader = new QuarksLoader(scene, {
            resolver: {fetchJson: async () => shared},
        });
        const a = {
            geometries: [{uuid: 'geo', type: 'QuarksGeometry', url: 'shared.json'}],
            object: {uuid: 'a', type: 'Group'},
        };
        const b = {
            geometries: [{uuid: 'geo', type: 'QuarksGeometry', url: 'shared.json'}],
            object: {uuid: 'b', type: 'Group'},
        };
        await loader.loadFromJSONAll([
            {json: a, baseUrl: 'pack/'},
            {json: b, baseUrl: 'pack/'},
        ]);
        // Neither document, nor the cached file, is written to.
        expect(a.geometries[0]).toEqual({uuid: 'geo', type: 'QuarksGeometry', url: 'shared.json'});
        expect(b.geometries[0]).toEqual({uuid: 'geo', type: 'QuarksGeometry', url: 'shared.json'});
        expect(shared.positions).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);

        scene.dispose();
        engine.dispose();
    });

    it('parses interleaved buffer geometry, textures and material mapping', () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const loader = new QuarksLoader(scene);

        const toInt32Bits = (value: number) => new Int32Array(new Float32Array([value]).buffer)[0];
        const interleavedFloats = [0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1];
        const packedInt32 = interleavedFloats.map(toInt32Bits);

        const root = loader.parse(
            {
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
            },
            'https://cdn.example.com/base/'
        );

        const mesh = root.getChildren().find((node) => node.name === 'interleaved-mesh') as Mesh;
        expect(mesh).toBeInstanceOf(Mesh);
        expect(mesh.getTotalVertices()).toBe(3);
        expect(mesh.getIndices()?.length).toBe(3);
        expect(mesh.material).toBeDefined();

        const material = mesh.material as StandardMaterial;
        expect(material).toBeInstanceOf(StandardMaterial);
        expect(material.alphaMode).toBe(Constants.ALPHA_SUBTRACT);
        expect(material.backFaceCulling).toBe(true);
        expect(material.alphaCutOff).toBeCloseTo(0.25, 5);
        expect(material.disableDepthWrite).toBe(false);
        expect(material.diffuseTexture).toBeInstanceOf(Texture);
        const texture = material.diffuseTexture as Texture;
        expect(texture.wrapU).toBe(Texture.CLAMP_ADDRESSMODE);
        expect(texture.wrapV).toBe(Texture.MIRROR_ADDRESSMODE);
        expect(texture.uScale).toBe(2);
        expect(texture.vScale).toBe(3);
        expect(texture.uOffset).toBeCloseTo(0.1, 5);
        expect(texture.vOffset).toBeCloseTo(0.2, 5);
        expect(texture.wAng).toBeCloseTo(0.5, 5);

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
        const meta = emptyMeta();
        const ps = source.toJSON(meta);

        const images = Object.entries(meta.textures).map(([uuid, tex]) => ({
            uuid: `${uuid}-image`,
            url: tex instanceof Texture ? tex.url : tex?.name,
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

        const emitter =
            root instanceof ParticleEmitter
                ? root
                : (root.getChildren().find((n) => n instanceof ParticleEmitter) as ParticleEmitter);
        expect(emitter).toBeInstanceOf(ParticleEmitter);
        expect((emitter.system as ParticleSystem).texture).toBeTruthy();

        scene.dispose();
        engine.dispose();
    });

    it('loads mesh normals and reflectionAtlas from QuarksMaterial JSON', () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);

        const root = new QuarksLoader(scene).parse(
            {
                images: [
                    {uuid: 'img-diff', url: 'textures/particle_default.png'},
                    {uuid: 'img-atlas', url: 'textures/cube/posx.jpg'},
                ],
                textures: [
                    {uuid: 'tex-diff', image: 'img-diff'},
                    {uuid: 'tex-atlas', image: 'img-atlas', invertY: false, noMipmap: true},
                ],
                materials: [
                    {
                        uuid: 'mat-1',
                        type: 'QuarksMaterial',
                        transparent: false,
                        alphaMode: Constants.ALPHA_DISABLE,
                        texture: 'tex-diff',
                        reflectionAtlas: 'tex-atlas',
                        reflectionLevel: 0.85,
                    },
                ],
                geometries: [
                    {
                        uuid: 'geo-1',
                        type: 'QuarksGeometry',
                        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
                        indices: [0, 1, 2],
                        uvs: [0, 0, 1, 0, 0, 1],
                        normals: [0, 1, 0, 0, 1, 0, 0, 1, 0],
                    },
                ],
                object: {
                    uuid: 'emitter-mesh',
                    type: 'ParticleEmitter',
                    ps: {
                        version: '2.0',
                        looping: true,
                        duration: 1,
                        startLife: {type: 'ConstantValue', value: 1},
                        startSpeed: {type: 'ConstantValue', value: 0},
                        startSize: {type: 'ConstantValue', value: 1},
                        startColor: {type: 'ConstantColor', color: {r: 1, g: 1, b: 1, a: 1}},
                        startRotation: {type: 'ConstantValue', value: 0},
                        emissionOverTime: {type: 'ConstantValue', value: 0},
                        emissionOverDistance: {type: 'ConstantValue', value: 0},
                        shape: {type: 'point'},
                        renderMode: 2,
                        instancingGeometry: 'geo-1',
                        material: 'mat-1',
                        worldSpace: true,
                        uTileCount: 1,
                        vTileCount: 1,
                        startTileIndex: {type: 'ConstantValue', value: 0},
                        behaviors: [],
                    },
                },
            },
            ''
        );

        const emitter =
            root instanceof ParticleEmitter
                ? root
                : (root.getChildren().find((n) => n instanceof ParticleEmitter) as ParticleEmitter);
        const system = emitter.system as ParticleSystem;
        const settings = system.getRendererSettings();
        expect(settings.instancingNormals).toEqual(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]));
        expect(settings.reflectionAtlas).toBeTruthy();
        expect(settings.reflectionLevel).toBeCloseTo(0.85, 5);

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

        const emptyEmitter = root.getChildren().find((node) => node.name === 'empty-emitter');
        const mystery = root.getChildren().find((node) => node.name === 'mystery-node');
        const rotNode = root.getChildren().find((node) => node.name === 'rot-node') as TransformNode;
        const quatNode = root.getChildren().find((node) => node.name === 'quat-node') as TransformNode;

        expect(emptyEmitter).toHaveProperty('quarksOriginalType', 'ParticleEmitter');
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
        const shape = (emitter.system as ParticleSystem).emitterShape;
        expect(shape).toBeInstanceOf(MeshSurfaceEmitter);
        expect((shape as MeshSurfaceEmitter).type).toBe('mesh_surface');
        expect((shape as MeshSurfaceEmitter).mesh).toBeUndefined();

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
            images: [
                {
                    uuid: 'img-1',
                    url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
                },
            ],
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

        const dataUri =
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
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
                        {
                            uuid: 'mesh-relative',
                            type: 'Mesh',
                            name: 'mesh-relative',
                            geometry: 'plane',
                            material: 'mat-relative',
                        },
                    ],
                },
            },
            'https://cdn.example.com/base/'
        );

        const meshData = root.getChildren().find((node) => node.name === 'mesh-data') as Mesh;
        const meshRelative = root.getChildren().find((node) => node.name === 'mesh-relative') as Mesh;
        expect(((meshData.material as StandardMaterial).diffuseTexture as Texture).url).toBe(dataUri);
        expect(((meshRelative.material as StandardMaterial).diffuseTexture as Texture).url).toBe(
            'https://cdn.example.com/base/textures/spark.png'
        );

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
        expect(((emitter.system as ParticleSystem).emitterShape as MeshSurfaceEmitter).mesh).toBe(mesh);
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
    it('warns about an image entry that is not an image', () => {
        // A Unity built-in texture exports as its virtual asset path, which
        // otherwise just fails to load with no hint as to why.
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const engine = new NullEngine();
            const scene = new Scene(engine);
            const loader = new QuarksLoader(scene);
            loader.parse({
                metadata: {version: 4.5, type: 'Object'},
                images: [
                    {uuid: 'img-broken', url: 'Resources/unity_builtin_extra'},
                    {uuid: 'img-ok', url: 'textures/spark.png'},
                    {uuid: 'img-inline', url: 'data:image/png;base64,AAAA'},
                ],
                textures: [],
                materials: [],
                geometries: [],
                object: {uuid: 'n0', type: 'Group', name: 'root'},
            });
            const messages = warn.mock.calls.map((c) => String(c[0]));
            expect(messages.filter((m) => m.includes('unity_builtin_extra'))).toHaveLength(1);
            expect(messages.filter((m) => m.includes('spark.png'))).toHaveLength(0);
            expect(messages.filter((m) => m.includes('data:image'))).toHaveLength(0);
        } finally {
            warn.mockRestore();
        }
    });
});

describe('QuarksLoader shared resources', () => {
    const PNG =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

    /** One mesh-mode emitter whose material samples `imageUrl` and whose geometry is a triangle. */
    const effect = (imageUrl: string, wrap = [1001, 1001]) => ({
        images: [{uuid: 'img', url: imageUrl}],
        textures: [{uuid: 'tex', image: 'img', wrap}],
        materials: [{uuid: 'mat', type: 'QuarksMaterial', texture: 'tex', transparent: true, blending: 2}],
        geometries: [
            {uuid: 'geo', type: 'QuarksGeometry', positions: [0, 1, 0, -1, -1, 0, 1, -1, 0], indices: [0, 1, 2]},
        ],
        object: {
            uuid: 'root',
            type: 'ParticleEmitter',
            ps: {
                version: '3.0',
                looping: true,
                duration: 1,
                shape: {type: 'point'},
                startLife: {type: 'ConstantValue', value: 1},
                startSpeed: {type: 'ConstantValue', value: 0},
                startRotation: {type: 'ConstantValue', value: 0},
                startSize: {type: 'ConstantValue', value: 1},
                startColor: {type: 'ConstantColor', color: {r: 1, g: 1, b: 1, a: 1}},
                emissionOverTime: {type: 'ConstantValue', value: 1},
                emissionOverDistance: {type: 'ConstantValue', value: 0},
                emissionBursts: [],
                instancingGeometry: 'geo',
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
    });

    const settingsOf = (root: TransformNode) =>
        ((root as ParticleEmitter).system as ParticleSystem).getRendererSettings();

    it('gives every load of the same image and mesh the same Texture and geometry', () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const a = settingsOf(new QuarksLoader(scene).parse(effect(PNG)));
        const b = settingsOf(new QuarksLoader(scene).parse(effect(PNG)));
        expect(a.texture).toBeInstanceOf(Texture);
        expect(b.texture).toBe(a.texture);
        expect(b.instancingGeometry).toBe(a.instancingGeometry);
        scene.dispose();
        engine.dispose();
    });

    it('keeps textures apart when the image or the sampling differs', () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const a = settingsOf(new QuarksLoader(scene).parse(effect(PNG)));
        const otherImage = settingsOf(new QuarksLoader(scene).parse(effect(PNG + '#other')));
        const otherWrap = settingsOf(new QuarksLoader(scene).parse(effect(PNG, [1000, 1000])));
        expect(otherImage.texture).not.toBe(a.texture);
        expect(otherWrap.texture).not.toBe(a.texture);
        scene.dispose();
        engine.dispose();
    });

    it('does not share across scenes, with shareResources off, or after a dispose', () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const otherScene = new Scene(engine);
        const a = settingsOf(new QuarksLoader(scene).parse(effect(PNG)));
        expect(settingsOf(new QuarksLoader(otherScene).parse(effect(PNG))).texture).not.toBe(a.texture);

        const unshared = settingsOf(new QuarksLoader(scene, {shareResources: false}).parse(effect(PNG)));
        expect(unshared.texture).not.toBe(a.texture);
        expect(unshared.instancingGeometry).not.toBe(a.instancingGeometry);

        a.texture!.dispose();
        const afterDispose = settingsOf(new QuarksLoader(scene).parse(effect(PNG)));
        expect(afterDispose.texture).not.toBe(a.texture);

        QuarksLoader.clearSharedResources(scene);
        expect(settingsOf(new QuarksLoader(scene).parse(effect(PNG))).texture).not.toBe(afterDispose.texture);
        scene.dispose();
        otherScene.dispose();
        engine.dispose();
    });
});

describe('QuarksLoader documents', () => {
    let engine: NullEngine;
    let scene: Scene;
    let warn: jest.SpyInstance;

    beforeEach(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
        warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        warn.mockRestore();
        scene.dispose();
        engine.dispose();
    });

    const textured = (images?: unknown[]) => ({
        ...(images ? {images} : {}),
        textures: [{uuid: 'tex', image: 'img'}],
        materials: [{uuid: 'mat', map: 'tex'}],
        geometries: [{uuid: 'geo', type: 'QuarksGeometry', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2]}],
        object: {uuid: 'm', type: 'Mesh', geometry: 'geo', material: 'mat'},
    });

    // An older file is upgraded as it is read (formatMigrations.ts), without changing the object given.
    it.each([
        [undefined, 'hierarchy'],
        [1, 'hierarchy'],
        [2, 'local'],
        [3, 'local'],
    ])('reads a system of format %s with the Scaling Mode it was written for', (quarksFormat, expected) => {
        const document = {
            ...(quarksFormat === undefined ? {} : {metadata: {quarksFormat}}),
            object: {
                uuid: 'e',
                type: 'ParticleEmitter',
                ps: {version: '3.0', shape: {type: 'point'}, emissionOverTime: {type: 'ConstantValue', value: 0}},
            },
        };
        const before = JSON.stringify(document);
        const root = new QuarksLoader(scene).parse(document) as ParticleEmitter;
        expect((root.system as ParticleSystem).scalingMode).toBe(expected);
        expect(JSON.stringify(document)).toBe(before);
        QuarksLoader.disposeEffect(root);
    });

    it("does not read one document's images for the next", () => {
        const loader = new QuarksLoader(scene);
        const first = loader.parse(textured([{uuid: 'img', url: 'https://example.com/a.png'}])) as Mesh;
        expect(((first.material as StandardMaterial).diffuseTexture as Texture).url).toBe('https://example.com/a.png');
        const second = loader.parse(textured()) as Mesh;
        expect((second.material as StandardMaterial).diffuseTexture).toBeNull();
    });

    it.each([[{}], [null], [{object: 'nope'}], [{metadata: {}}]])('throws QuarksFormatError for %j', (json) => {
        expect(() => new QuarksLoader(scene).parse(json)).toThrow(QuarksFormatError);
    });

    it('warns about a document from a newer format, and loads it', () => {
        const root = new QuarksLoader(scene).parse({
            metadata: {quarksFormat: QUARKS_FORMAT_VERSION + 1},
            object: {uuid: 'g', type: 'Group'},
        });
        expect(root).toBeInstanceOf(TransformNode);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining(`format ${QUARKS_FORMAT_VERSION + 1}`));
        warn.mockClear();
        new QuarksLoader(scene).parse({
            metadata: {quarksFormat: QUARKS_FORMAT_VERSION},
            object: {uuid: 'g', type: 'Group'},
        });
        expect(warn).not.toHaveBeenCalled();
    });

    it('warns about a mesh surface shape whose mesh is not in the effect', () => {
        loadPlugin(MeshSurfaceEmitterPlugin);
        const ps = new ParticleSystem({scene, shape: new MeshSurfaceEmitter(undefined, 'gone')});
        const json = serializeEffect(ps.emitter);
        new QuarksLoader(scene).parse(JSON.parse(JSON.stringify(json)));
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('mesh surface shape on "gone"'));
    });

    it('loads a system that leaves out its curves with the defaults', () => {
        const root = new QuarksLoader(scene).parse({
            object: {uuid: 'e', type: 'ParticleEmitter', ps: {shape: {type: 'point'}}},
        }) as ParticleEmitter;
        const system = root.system as ParticleSystem;
        const defaults = new ParticleSystem({scene, shape: new PointEmitter()});
        expect(system.startLife.toJSON()).toEqual(defaults.startLife.toJSON());
        expect(system.emissionOverTime.toJSON()).toEqual(defaults.emissionOverTime.toJSON());
        expect(system.startColor.toJSON()).toEqual(defaults.startColor.toJSON());
        expect(warn).not.toHaveBeenCalled();
        defaults.dispose();
    });

    it('loads the same in-memory document twice with a relative base', async () => {
        const json = textured([{uuid: 'img', url: 'tex/a.png'}]);
        const loader = new QuarksLoader(scene);
        const urls = [];
        for (let i = 0; i < 2; i++) {
            const mesh = (await loader.loadFromJSON(json, 'fx/')) as Mesh;
            urls.push(((mesh.material as StandardMaterial).diffuseTexture as Texture).url);
        }
        expect(urls).toEqual(['fx/tex/a.png', 'fx/tex/a.png']);
        expect(json.images![0]).toEqual({uuid: 'img', url: 'tex/a.png'});
    });

    it('loads a document resolveResources() prepared without joining its base twice', async () => {
        const json = textured([{uuid: 'img', url: 'tex/a.png'}]);
        const loader = new QuarksLoader(scene, {shareResources: false});
        await loader.resolveResources(json, 'fx/');
        expect((json.images![0] as {url: string}).url).toBe('fx/tex/a.png');
        const urls = [];
        for (let i = 0; i < 2; i++) {
            const mesh = (await loader.loadFromJSON(json, 'fx/')) as Mesh;
            const texture = (mesh.material as StandardMaterial).diffuseTexture as Texture;
            urls.push(texture.url);
            expect(textureSourceUrl(texture)).toBe('tex/a.png');
        }
        expect(urls).toEqual(['fx/tex/a.png', 'fx/tex/a.png']);
        const all = (await loader.loadFromJSONAll([{json, baseUrl: 'fx/'}])) as Mesh[];
        expect(((all[0].material as StandardMaterial).diffuseTexture as Texture).url).toBe('fx/tex/a.png');
    });

    it('serializeEffect writes the url the file had, so a save next to the source loads the same image', async () => {
        const json = textured([{uuid: 'img', url: 'tex/a.png'}]);
        const loader = new QuarksLoader(scene, {shareResources: false});
        const root = await loader.loadFromJSON(json, 'fx/');
        const texture = ((root as Mesh).material as StandardMaterial).diffuseTexture as Texture;
        expect(texture.url).toBe('fx/tex/a.png');
        expect(textureSourceUrl(texture)).toBe('tex/a.png');
        const saved = serializeEffect(root);
        expect(saved.images).toEqual([{uuid: 'quarks_image_1', url: 'tex/a.png'}]);
        // Loaded again from the same place, the image resolves to the same file.
        const again = (await loader.loadFromJSON(saved, 'fx/')) as Mesh;
        expect(((again.material as StandardMaterial).diffuseTexture as Texture).url).toBe('fx/tex/a.png');
        // imageUrl still overrides; a texture made in code falls back to its url.
        expect(serializeEffect(root, {imageUrl: () => 'other/a.png'}).images[0].url).toBe('other/a.png');
        expect(textureSourceUrl(new Texture('code/b.png', scene))).toBeUndefined();
    });

    it('keeps the source url through a custom resolver', async () => {
        const json = textured([{uuid: 'img', url: 'tex/a.png'}]);
        const loader = new QuarksLoader(scene, {
            shareResources: false,
            resolver: {resolve: (url) => `https://cdn.example/${url}`},
        });
        const root = await loader.loadFromJSON(json, 'fx/');
        const texture = ((root as Mesh).material as StandardMaterial).diffuseTexture as Texture;
        expect(texture.url).toBe('https://cdn.example/tex/a.png');
        expect(serializeEffect(root).images[0].url).toBe('tex/a.png');
    });

    it('writes the url itself when a resolver inlined the image or the texture was given a new url', async () => {
        const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
        const inlined = textured([{uuid: 'img', url: 'tex/a.png'}]);
        const loader = new QuarksLoader(scene, {shareResources: false, resolver: {resolve: () => dataUrl}});
        const root = (await loader.loadFromJSON(inlined, 'fx/')) as Mesh;
        const texture = (root.material as StandardMaterial).diffuseTexture as Texture;
        expect(texture.url).toBe(dataUrl);
        expect(textureSourceUrl(texture)).toBeUndefined();
        expect(serializeEffect(root).images[0].url).toBe(dataUrl);

        const plain = new QuarksLoader(scene, {shareResources: false});
        const other = (await plain.loadFromJSON(textured([{uuid: 'img', url: 'tex/a.png'}]), 'fx/')) as Mesh;
        const changed = (other.material as StandardMaterial).diffuseTexture as Texture;
        expect(textureSourceUrl(changed)).toBe('tex/a.png');
        changed.url = dataUrl;
        expect(textureSourceUrl(changed)).toBeUndefined();
        expect(serializeEffect(other).images[0].url).toBe(dataUrl);
    });

    it('a shared texture keeps the source url of the effect that loaded it first', async () => {
        const loader = new QuarksLoader(scene);
        const a = (await loader.loadFromJSON(textured([{uuid: 'img', url: 'shared/a.png'}]), 'fx/')) as Mesh;
        const b = (await loader.loadFromJSON(textured([{uuid: 'img', url: 'fx/shared/a.png'}]), '')) as Mesh;
        const ta = (a.material as StandardMaterial).diffuseTexture as Texture;
        const tb = (b.material as StandardMaterial).diffuseTexture as Texture;
        expect(tb).toBe(ta);
        expect(textureSourceUrl(tb)).toBe('shared/a.png');
    });

    it('loadFromJSONAll leaves its documents as they were', async () => {
        const bare = textured([{uuid: 'img', url: 'tex/a.png'}]);
        const wrapped = textured([{uuid: 'img', url: 'tex/a.png'}]);
        const before = JSON.parse(JSON.stringify([bare, wrapped]));
        const loader = new QuarksLoader(scene, {baseUrl: 'fx/'});
        for (let i = 0; i < 2; i++) {
            const roots = (await loader.loadFromJSONAll([bare, {json: wrapped, baseUrl: 'pack/'}])) as Mesh[];
            const urls = roots.map((root) => ((root.material as StandardMaterial).diffuseTexture as Texture).url);
            expect(urls).toEqual(['fx/tex/a.png', 'pack/tex/a.png']);
        }
        expect([bare, wrapped]).toEqual(before);
    });
});
