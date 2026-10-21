import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {Scene} from '@babylonjs/core/scene';
import {ConstantValue, EmitSubParticleSystem, PointEmitter, SubParticleEmitMode} from 'quarks.core';
import {MeshSurfaceEmitter} from '../src/MeshSurfaceEmitter';
import {quarksNodeId} from '../src/nodeId';
import {ParticleEmitter} from '../src/ParticleEmitter';
import {ParticleSystem} from '../src/ParticleSystem';
import {QuarksLoader} from '../src/QuarksLoader';

let engine: NullEngine;
let scene: Scene;

beforeAll(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
});

afterAll(() => {
    scene.dispose();
    engine.dispose();
});

/** An effect of a parent emitter whose sub emitter targets a second emitter, as a file. */
function effect(): any {
    const child = new ParticleSystem({scene, looping: false, emissionOverTime: new ConstantValue(0)});
    const parent = new ParticleSystem({scene, shape: new PointEmitter(), emissionOverTime: new ConstantValue(5)});
    parent.addBehavior(
        new EmitSubParticleSystem(parent, false, child.emitter as ParticleEmitter, SubParticleEmitMode.Death)
    );
    return serialise([parent.emitter as ParticleEmitter, child.emitter as ParticleEmitter]);
}

function serialise(emitters: ParticleEmitter[]): any {
    const meta: any = {geometries: {}, materials: {}, textures: {}};
    const children = emitters.map((emitter) => emitter.toJSON(meta));
    return JSON.parse(
        JSON.stringify({
            images: [],
            textures: [],
            geometries: Object.values(meta.geometries),
            materials: Object.values(meta.materials),
            object: {uuid: 'root', type: 'Group', children},
        })
    );
}

function emitters(root: any): ParticleEmitter[] {
    return root.getChildren().filter((node: unknown) => node instanceof ParticleEmitter);
}

function subEmitterOf(emitter: ParticleEmitter): EmitSubParticleSystem {
    return (emitter.system as ParticleSystem).behaviors.find(
        (b) => b instanceof EmitSubParticleSystem
    ) as EmitSubParticleSystem;
}

describe('links survive loading and saving again', () => {
    test('a sub emitter still finds its target after load, save and load', () => {
        const loader = new QuarksLoader(scene);
        const first = loader.parse(effect());
        const [parent, child] = emitters(first);
        expect(subEmitterOf(parent).subParticleSystem).toBe(child);

        const resaved = serialise(emitters(first));
        const behavior = resaved.object.children[0].ps.behaviors.find((b: any) => b.type === 'EmitSubParticleSystem');
        expect(behavior.subParticleSystem).toBe(resaved.object.children[1].uuid);

        const second = new QuarksLoader(scene).parse(resaved);
        const [parent2, child2] = emitters(second);
        expect(subEmitterOf(parent2).subParticleSystem).toBe(child2);
        // The nodes keep their ids across the second save, and so do the links between them.
        const again = serialise(emitters(second));
        const ids = (doc: any) => doc.object.children.map((node: any) => node.uuid);
        expect(ids(again)).toEqual(ids(resaved));
        expect(again.object.children[0].ps.behaviors).toEqual(resaved.object.children[0].ps.behaviors);
        first.dispose();
        second.dispose();
    });

    test('an emitter and the links to it use the id it was loaded under', () => {
        const emitter = new ParticleSystem({scene}).emitter as ParticleEmitter;
        expect(emitter.uuid).toBe(emitter.uniqueId.toString());
        (emitter as any)._quarksUUID = 'from-file';
        expect(emitter.uuid).toBe('from-file');
        expect(emitter.toJSON({geometries: {}, materials: {}, textures: {}}).uuid).toBe('from-file');
        emitter.dispose();
    });

    test('a mesh surface shape names its mesh by the id it was loaded under', () => {
        const mesh = new Mesh('surface', scene);
        expect(new MeshSurfaceEmitter(mesh).toJSON().mesh).toBe(quarksNodeId(mesh));
        (mesh as any)._quarksUUID = 'mesh-from-file';
        expect(new MeshSurfaceEmitter(mesh).toJSON().mesh).toBe('mesh-from-file');
        mesh.dispose();
    });

    test('a clone gets an id of its own', () => {
        const emitter = new ParticleSystem({scene}).emitter as ParticleEmitter;
        (emitter as any)._quarksUUID = 'from-file';
        const copy = emitter.clone();
        expect(copy.uuid).not.toBe('from-file');
        emitter.dispose();
        copy.dispose();
    });
});
