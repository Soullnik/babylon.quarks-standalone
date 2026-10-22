import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {isEditorSceneNode} from '../src/core/editorScene';
import {EmitterShapeWireframes} from '../src/core/emitterShapeWireframe';
import {createShape, DEFAULT_SHAPE_PARAMS, SHAPE_TYPES, ShapeType} from '../src/core/shapes';
import {makeSystem, useScene} from './helpers';

describe('emitter shape wireframes', () => {
    const scene = useScene();

    const wireframeMeshes = () => scene.get().meshes.filter((m) => m.name.startsWith('wf-'));

    it('draws nothing until visible, then one overlay set per live emitter, and tears down', () => {
        const wf = new EmitterShapeWireframes(scene.get());
        const a = makeSystem(scene.get());
        const b = makeSystem(scene.get());
        b.emitter.dispose();

        wf.sync([a, b], 'v1');
        expect(wireframeMeshes()).toEqual([]);

        wf.setVisible(true);
        wf.sync([a, b], 'v1');
        const meshes = wireframeMeshes();
        expect(meshes.length).toBeGreaterThan(0);
        expect(meshes.every((m) => m.parent === a.emitter && !m.isPickable && isEditorSceneNode(m))).toBe(true);

        // Same key: kept. New key: rebuilt.
        wf.sync([a], 'v1');
        expect(wireframeMeshes()[0]).toBe(meshes[0]);
        wf.sync([a], 'v2');
        expect(wireframeMeshes()[0]).not.toBe(meshes[0]);

        wf.setVisible(false);
        expect(wireframeMeshes()).toEqual([]);
        // Hidden overlays forget their key, so showing again rebuilds for the same key.
        wf.setVisible(true);
        wf.sync([a], 'v2');
        expect(wireframeMeshes().length).toBeGreaterThan(0);

        wf.dispose();
        expect(wireframeMeshes()).toEqual([]);
        expect(scene.get().getTransformNodeByName('emitter-wireframes')).toBeNull();
    });

    it.each(SHAPE_TYPES.map((s) => s.value))('builds an overlay for the %s shape', (type: ShapeType) => {
        const wf = new EmitterShapeWireframes(scene.get());
        wf.setVisible(true);
        const mesh = MeshBuilder.CreateBox('source', {size: 1}, scene.get());
        const system = makeSystem(scene.get(), {shape: createShape(type, {...DEFAULT_SHAPE_PARAMS, mesh})});
        wf.sync([system], 'v1');
        expect(wireframeMeshes().length).toBeGreaterThan(0);
        wf.dispose();
    });

    it('draws partial arcs with their spokes, thick shells and a placeholder for a missing mesh', () => {
        const wf = new EmitterShapeWireframes(scene.get());
        wf.setVisible(true);
        let key = 0;
        const names = (type: ShapeType, params: Partial<typeof DEFAULT_SHAPE_PARAMS>) => {
            const system = makeSystem(scene.get(), {shape: createShape(type, {...DEFAULT_SHAPE_PARAMS, ...params})});
            wf.sync([system], `${++key}`);
            return wireframeMeshes().map((m) => m.name);
        };
        expect(names('cone', {arc: Math.PI, thickness: 0.5})).toEqual(
            expect.arrayContaining(['wf-cone-outer', 'wf-cone-inner', 'wf-cone-spoke-a', 'wf-cone-spoke-b'])
        );
        expect(names('cone', {arc: Math.PI * 2, thickness: 1})).not.toEqual(expect.arrayContaining(['wf-cone-inner']));
        expect(names('sphere', {arc: Math.PI / 2, thickness: 0.5}).length).toBeGreaterThan(
            names('sphere', {arc: Math.PI * 2, thickness: 1}).length
        );
        expect(names('hemisphere', {arc: Math.PI / 2, thickness: 0.5}).length).toBeGreaterThan(0);
        expect(names('circle', {arc: Math.PI / 2, thickness: 0.5}).length).toBeGreaterThan(1);
        expect(names('donut', {arc: Math.PI / 2}).length).toBeGreaterThan(0);
        expect(names('mesh_surface', {mesh: undefined})).toEqual(['wf-mesh-missing']);
        const disposed = MeshBuilder.CreateBox('gone', {size: 1}, scene.get());
        disposed.dispose();
        expect(names('mesh_surface', {mesh: disposed})).toEqual(['wf-mesh-missing']);
        expect(names('cone', {arc: NaN, angle: NaN, radius: 0}).length).toBeGreaterThan(0);
        const points = (name: string) => Array.from(scene.get().getMeshByName(name)!.getVerticesData('position')!);
        expect(names('box', {width: 2, height: 1, depth: 0.5})).toEqual(
            expect.arrayContaining(['wf-box-front', 'wf-box-back', 'wf-box-side-3', 'wf-box-dir'])
        );
        // Box centred on the emitter, front face at +depth/2, emit direction +Z from that face.
        expect(points('wf-box-front')).toEqual([
            -1, -0.5, 0.25, 1, -0.5, 0.25, 1, 0.5, 0.25, -1, 0.5, 0.25, -1, -0.5, 0.25,
        ]);
        expect(points('wf-box-back').filter((_, i) => i % 3 === 2)).toEqual([-0.25, -0.25, -0.25, -0.25, -0.25]);
        expect(points('wf-box-side-3')).toEqual([-1, 0.5, -0.25, -1, 0.5, 0.25]);
        expect(points('wf-box-dir')).toEqual([0, 0, 0.25, 0, 0, 0.75]);
        // Edge: a line along X of half-length radius, emitting +Y.
        expect(names('edge', {radius: 2})).toEqual(expect.arrayContaining(['wf-edge', 'wf-edge-ray-4']));
        expect(points('wf-edge')).toEqual([-2, 0, 0, 2, 0, 0]);
        expect(points('wf-edge-ray-0')).toEqual([-2, 0, 0, -2, 1, 0]);
        expect(points('wf-edge-ray-4')).toEqual([2, 0, 0, 2, 1, 0]);
        wf.dispose();
    });
});
