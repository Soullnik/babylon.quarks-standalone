import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import type {SubMesh} from '@babylonjs/core/Meshes/subMesh';
import {Logger} from '@babylonjs/core/Misc/logger';
import {RenderingGroup} from '@babylonjs/core/Rendering/renderingGroup';
import {Scene} from '@babylonjs/core/scene';
import {ConstantColor, ConstantValue, PointEmitter, Vector4} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import {quarksSortDistance, quarksTransparentSortCompare, readsCustomCompares} from '../src/transparentSort';

/**
 * Unity's Sorting Fudge: transparent renderers are drawn back to front by the distance from the
 * camera to their bounds' centre plus their fudge, in world units (measured in Unity 6, two
 * systems at depths and fudges: the one with the smaller sum is on top). Effects set it to
 * keep a glow under the smoke whichever way the camera turns.
 */
let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
});

afterEach(() => {
    scene.dispose();
    engine.dispose();
});

function system(parameters: Partial<ParticleSystemParameters> = {}): ParticleSystem {
    return new ParticleSystem({
        scene,
        startLife: new ConstantValue(5),
        startSize: new ConstantValue(1),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(10),
        shape: new PointEmitter(),
        ...parameters,
    });
}

/** A sub mesh as Babylon hands the compare, at `distance` with alpha index `alphaIndex`. */
function subMeshOf(renderer: BatchedRenderer, ps: ParticleSystem, distance: number, alphaIndex = 0): SubMesh {
    const mesh = renderer.batches[renderer.systemToBatchIndex.get(ps)!].mesh;
    const subMesh = mesh.subMeshes[0];
    subMesh._distanceToCamera = distance;
    subMesh._alphaIndex = alphaIndex;
    return subMesh;
}

/** The transparent compare `scene` keeps for `group`; private in Babylon. */
const customTransparent = (group = 0) =>
    (scene.renderingManager as unknown as {_customTransparentSortCompareFn: Record<number, unknown>})
        ._customTransparentSortCompareFn[group];

describe('sorting fudge', () => {
    it("adds a batch's fudge to its distance, back to front, after the alpha index", () => {
        const renderer = new BatchedRenderer('sort', scene);
        const glow = system({sortingFudge: 30});
        const smoke = system({sortingFudge: -50, transparent: true, blendMode: 2});
        const plain = system({blendMode: 5});
        for (const ps of [glow, smoke, plain]) renderer.addSystem(ps);
        // Glow nearer than the plain system, but 30 behind it in the sort: drawn first, under it.
        const g = subMeshOf(renderer, glow, 8);
        const p = subMeshOf(renderer, plain, 12);
        const s = subMeshOf(renderer, smoke, 20);
        expect(quarksSortDistance(g)).toBe(38);
        expect(quarksSortDistance(p)).toBe(12);
        // Past the camera even: the smoke's key is below 0, so it is drawn last, over everything.
        expect(quarksSortDistance(s)).toBe(-30);
        const order = [p, s, g].sort(quarksTransparentSortCompare);
        expect(order).toEqual([g, p, s]);
        // The alpha index still comes first; without a fudge the compare is Babylon's own.
        g._alphaIndex = 1;
        expect([g, p].sort(quarksTransparentSortCompare)).toEqual([p, g]);
        const q = subMeshOf(renderer, plain, 12);
        const r = {...s, _distanceToCamera: 3, _alphaIndex: 0, getMesh: () => ({})} as unknown as SubMesh;
        expect(Math.sign(quarksTransparentSortCompare(q, r))).toBe(
            Math.sign(RenderingGroup.defaultTransparentSortCompare(q, r))
        );
        renderer.dispose();
    });

    it('sets the compare on the rendering groups transparent systems draw in, keeping the others', () => {
        expect(readsCustomCompares(scene)).toBe(true);
        const opaque = () => 0;
        scene.setRenderingOrder(2, opaque);
        const renderer = new BatchedRenderer('sort', scene);
        renderer.addSystem(system({renderingGroupId: 2, transparent: false}));
        expect(customTransparent(2) ?? null).toBeNull();
        renderer.addSystem(system({renderingGroupId: 2}));
        expect(customTransparent(2)).toBe(quarksTransparentSortCompare);
        expect(customTransparent(0) ?? null).toBeNull();
        // The application's opaque compare stays.
        const manager = scene.renderingManager as unknown as {_customOpaqueSortCompareFn: Record<number, unknown>};
        expect(manager._customOpaqueSortCompareFn[2]).toBe(opaque);
        renderer.dispose();
    });

    it("leaves an application's own transparent compare, and says how to keep the fudge in it", () => {
        const own = () => 0;
        scene.setRenderingOrder(0, null, null, own);
        const warn = jest.spyOn(Logger, 'Warn').mockImplementation(() => {});
        const renderer = new BatchedRenderer('sort', scene);
        renderer.addSystem(system({sortingFudge: 3}));
        renderer.addSystem(system({sortingFudge: 4, blendMode: 2}));
        expect(customTransparent()).toBe(own);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain('quarksSortDistance');
        warn.mockRestore();
        renderer.dispose();
    });

    it('draws systems with different fudges from different batches, and moves one in place', () => {
        const renderer = new BatchedRenderer('sort', scene);
        const a = system({sortingFudge: 1});
        const b = system({sortingFudge: 2});
        renderer.addSystem(a);
        renderer.addSystem(b);
        expect(renderer.batches).toHaveLength(2);
        const batch = renderer.batches[renderer.systemToBatchIndex.get(a)!];
        a.sortingFudge = 7;
        renderer.update(1 / 60);
        expect(renderer.batches[renderer.systemToBatchIndex.get(a)!]).toBe(batch);
        expect(quarksSortDistance(subMeshOf(renderer, a, 1))).toBe(8);
        // Back to 0: sorted by distance alone.
        a.sortingFudge = 0;
        renderer.update(1 / 60);
        expect(quarksSortDistance(subMeshOf(renderer, a, 1))).toBe(1);
        renderer.dispose();
    });

    it('round-trips through JSON only when set, and keeps a bad value at 0', () => {
        expect(system().toJSON({textures: {}, materials: {}, geometries: {}})).not.toHaveProperty('sortingFudge');
        const json = system({sortingFudge: -74.5}).toJSON({textures: {}, materials: {}, geometries: {}});
        expect(json.sortingFudge).toBe(-74.5);
        expect(system({sortingFudge: NaN}).sortingFudge).toBe(0);
    });
});
