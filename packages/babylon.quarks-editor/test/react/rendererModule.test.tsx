/** @jest-environment jsdom */
import type {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {RenderMode, TrailSettings, Vector2} from 'babylon.quarks';
import {EffectBinding} from '../../src/core/binding';
import {MainModule, RendererModule} from '../../src/react/modules';
import {makeSystem, useScene} from '../helpers';
import {click, controlsOf, hasRow, mount, Mounted, openModule, pick, rowOf, type} from './dom';

/** The components of a quarks vector, or undefined. */
const xyz = (v: {x: number; y: number; z: number} | undefined) => (v ? [v.x, v.y, v.z] : undefined);

/** A host texture: the editor only reads its url. */
const fakeTexture = (url: string) => ({url}) as unknown as Texture;
const textureOptions = [
    {label: 'Glow', url: 'tex/glow.png'},
    {label: 'Ramp', url: 'tex/ramp.png'},
    {label: 'Noise', url: 'tex/noise.png'},
];

describe('Renderer module', () => {
    const scene = useScene();
    let mounted: Mounted | null = null;
    afterEach(() => {
        mounted?.unmount();
        mounted = null;
    });

    function setup(renderMode = RenderMode.BillBoard) {
        const system = makeSystem(scene.get(), {renderMode});
        const binding = new EffectBinding(system);
        const element = () => (
            <RendererModule binding={binding} textureOptions={textureOptions} resolveTexture={fakeTexture} />
        );
        mounted = mount(element());
        binding.subscribe(() => mounted!.render(element()));
        return {system, binding, container: mounted.container};
    }

    it('offers the ring buffer with max particles, and its loop range when it loops', () => {
        const {system, container} = setup();
        expect(hasRow(container, 'Ring buffer')).toBe(false);
        click(controlsOf(rowOf(container, 'Max particles'))[0]);
        pick(controlsOf(rowOf(container, 'Ring buffer'))[0], 'loopUntilReplaced');
        expect(system.ringBufferMode).toBe('loopUntilReplaced');
        const [start, end] = controlsOf(rowOf(container, 'Loop range'));
        type(start, '0.6');
        type(end, '0.3');
        expect([system.ringBufferLoopRange.x, system.ringBufferLoopRange.y]).toEqual([0.3, 0.6]);
        pick(controlsOf(rowOf(container, 'Ring buffer'))[0], 'disabled');
        expect(hasRow(container, 'Loop range')).toBe(false);
    });

    it('lays the map out through tiling, offset, scroll and channel, and drops the identity', () => {
        const {system, container} = setup();
        expect(system.mapUV).toBeUndefined();
        const [tilingU, tilingV] = controlsOf(rowOf(container, 'Map Tiling'));
        type(tilingU, '2');
        expect(system.mapUV).toEqual({channel: 0, tiling: [2, 1], offset: [0, 0], scroll: [0, 0]});
        type(tilingV, '3');
        type(controlsOf(rowOf(container, 'Map Offset'))[1], '0.5');
        type(controlsOf(rowOf(container, 'Map Scroll'))[0], '-1');
        pick(controlsOf(rowOf(container, 'Map UV channel'))[0], '1');
        expect(system.mapUV).toEqual({channel: 1, tiling: [2, 3], offset: [0, 0.5], scroll: [-1, 0]});
        // Back to the identity: the layout is unset again, so the JSON stays sparse.
        type(tilingU, '1');
        type(tilingV, '1');
        type(controlsOf(rowOf(container, 'Map Offset'))[1], '0');
        type(controlsOf(rowOf(container, 'Map Scroll'))[0], '0');
        pick(controlsOf(rowOf(container, 'Map UV channel'))[0], '0');
        expect(system.mapUV).toBeUndefined();
    });

    it('flips a fraction of billboards and unsets the flip at zero; meshes have no flip', () => {
        const {system, container} = setup();
        const [u, v] = controlsOf(rowOf(container, 'Flip U/V'));
        type(u, '0.5');
        expect(system.flip).toEqual(new Vector2(0.5, 0));
        type(v, '2');
        expect(system.flip).toEqual(new Vector2(0.5, 1));
        type(u, '0');
        type(v, '0');
        expect(system.flip).toBeUndefined();
    });

    it('offers no flip for meshes', () => {
        const {container} = setup(RenderMode.Mesh);
        expect(hasRow(container, 'Flip U/V')).toBe(false);
    });

    it('selects the texture from the host presets and clears it', () => {
        const {system, container} = setup();
        pick(controlsOf(rowOf(container, 'Texture'))[0], 'tex/glow.png');
        expect(system.texture).toEqual({url: 'tex/glow.png'});
        expect(container.querySelector('img[alt="texture preview"]')?.getAttribute('src')).toBe('tex/glow.png');
        pick(controlsOf(rowOf(container, 'Texture'))[0], '__none');
        expect(system.texture).toBeNull();
    });

    it('turns a ramp into a gradient map with a channel, and removes it with the ramp', () => {
        const {system, container} = setup();
        expect(hasRow(container, 'Ramp channel')).toBe(false);
        pick(controlsOf(rowOf(container, 'Ramp'))[0], 'tex/ramp.png');
        expect(system.gradientMap).toEqual({ramp: {url: 'tex/ramp.png'}, channel: 'r'});
        pick(controlsOf(rowOf(container, 'Ramp channel'))[0], 'luminance');
        expect(system.gradientMap?.channel).toBe('luminance');
        pick(controlsOf(rowOf(container, 'Ramp'))[0], '__none');
        expect(system.gradientMap).toBeUndefined();
        expect(hasRow(container, 'Ramp channel')).toBe(false);
    });

    it('edits erosion: mask with its own layout, softness, edge band and colour', () => {
        const {system, binding, container} = setup();
        click(controlsOf(rowOf(container, 'Erosion'))[0]);
        expect(system.erosion).toMatchObject({mask: null, softness: 0.05, edgeWidth: 0, edgeColor: [1, 1, 1]});
        expect(hasRow(container, 'Mask Tiling')).toBe(false);
        expect(hasRow(container, 'Edge color')).toBe(false);

        // A colour from a file shows even without an edge band, so it can be seen and reset.
        system.erosion = {edgeColor: [2, 1, 1]};
        binding.markChanged();
        expect(hasRow(container, 'Edge color')).toBe(true);
        type(controlsOf(rowOf(container, 'Edge color'))[0], '1');
        expect(hasRow(container, 'Edge color')).toBe(false);

        type(controlsOf(rowOf(container, 'Softness'))[0], '0.2');
        type(controlsOf(rowOf(container, 'Edge width'))[0], '0.1');
        type(controlsOf(rowOf(container, 'Edge color'))[2], '4');
        expect(system.erosion).toMatchObject({softness: 0.2, edgeWidth: 0.1, edgeColor: [1, 1, 4]});

        pick(controlsOf(rowOf(container, 'Erosion mask'))[0], 'tex/noise.png');
        type(controlsOf(rowOf(container, 'Mask Tiling'))[0], '4');
        pick(controlsOf(rowOf(container, 'Mask UV channel'))[0], '1');
        expect(system.erosion?.mask).toEqual({url: 'tex/noise.png'});
        expect(system.erosion?.maskUV).toEqual({channel: 1, tiling: [4, 1], offset: [0, 0], scroll: [0, 0]});

        click(controlsOf(rowOf(container, 'Erosion'))[0]);
        expect(system.erosion).toBeUndefined();
    });

    it('edits UV distortion from its noise texture, with the default drift', () => {
        const {system, container} = setup();
        expect(hasRow(container, 'Distortion strength')).toBe(false);
        pick(controlsOf(rowOf(container, 'Noise texture'))[0], 'tex/noise.png');
        expect(system.uvDistortion).toEqual({
            map: {url: 'tex/noise.png'},
            mapUV: {channel: 0, tiling: [1, 1], offset: [0, 0], scroll: [0, 0.5]},
            strength: 0.05,
        });
        type(controlsOf(rowOf(container, 'Distortion strength'))[0], '0.2');
        type(controlsOf(rowOf(container, 'Noise Scroll'))[1], '0');
        expect(system.uvDistortion?.strength).toBe(0.2);
        expect(system.uvDistortion?.mapUV.scroll).toEqual([0, 0]);
        pick(controlsOf(rowOf(container, 'Noise texture'))[0], '__none');
        expect(system.uvDistortion).toBeUndefined();
    });

    it("lays a trail's texture out and samples its path, keeping the defaults unset", () => {
        const {system, container} = setup(RenderMode.Trail);
        const settings = () => system.rendererEmitterSettings as TrailSettings;
        expect(hasRow(container, 'Head width scale')).toBe(false);
        pick(controlsOf(rowOf(container, 'Texture mode'))[0], 'tile');
        type(controlsOf(rowOf(container, 'Texture scale'))[0], '0.5');
        type(controlsOf(rowOf(container, 'Min vertex distance'))[0], '0.2');
        type(controlsOf(rowOf(container, 'Trail time'))[0], '1.5');
        expect(settings()).toMatchObject({
            textureMode: 'tile',
            textureScale: 0.5,
            minVertexDistance: 0.2,
            lifetime: 1.5,
        });
        pick(controlsOf(rowOf(container, 'Texture mode'))[0], 'stretch');
        type(controlsOf(rowOf(container, 'Texture scale'))[0], '1');
        type(controlsOf(rowOf(container, 'Min vertex distance'))[0], '0');
        type(controlsOf(rowOf(container, 'Trail time'))[0], '0');
        expect(settings().textureMode).toBeUndefined();
        expect(settings().textureScale).toBeUndefined();
        expect(settings().minVertexDistance).toBeUndefined();
        expect(settings().lifetime).toBeUndefined();
    });

    it('sweeps a trail along a side axis', () => {
        const {system, container} = setup(RenderMode.Trail);
        const settings = () => system.rendererEmitterSettings as TrailSettings;
        expect(settings().sideAxis).toBeUndefined();
        expect(hasRow(container, 'Side axis')).toBe(false);
        click(controlsOf(rowOf(container, 'Swept trail'))[0]);
        expect(xyz(settings().sideAxis)).toEqual([0, 1, 0]);
        type(controlsOf(rowOf(container, 'Side axis'))[0], '1');
        // Kept a unit vector: its length would scale the trail's width.
        expect(xyz(settings().sideAxis)?.map((c) => Math.round(c * 1000) / 1000)).toEqual([0.707, 0.707, 0]);
        click(controlsOf(rowOf(container, 'Swept trail'))[0]);
        expect(settings().sideAxis).toBeUndefined();
    });
});

describe('Main module', () => {
    const scene = useScene();
    let mounted: Mounted | null = null;
    afterEach(() => {
        mounted?.unmount();
        mounted = null;
    });

    it('offers the scaling mode in world and local space', () => {
        const system = makeSystem(scene.get());
        const binding = new EffectBinding(system);
        const element = () => <MainModule binding={binding} />;
        mounted = mount(element());
        binding.subscribe(() => mounted!.render(element()));
        const {container} = mounted;
        openModule(container, 'Main');
        expect(system.scalingMode).toBe('local');
        pick(controlsOf(rowOf(container, 'Scaling mode'))[0], 'shape');
        expect(system.scalingMode).toBe('shape');
        click(controlsOf(rowOf(container, 'World space'))[0]);
        pick(controlsOf(rowOf(container, 'Scaling mode'))[0], 'hierarchy');
        expect(system.worldSpace).toBe(true);
        expect(system.scalingMode).toBe('hierarchy');
    });

    it('sets the stop action in Main', () => {
        const system = makeSystem(scene.get());
        const binding = new EffectBinding(system);
        const element = () => <MainModule binding={binding} />;
        mounted = mount(element());
        binding.subscribe(() => mounted!.render(element()));
        openModule(mounted.container, 'Main');
        expect(system.stopAction).toBe('none');
        pick(controlsOf(rowOf(mounted.container, 'Stop action'))[0], 'destroy');
        expect(system.stopAction).toBe('destroy');
    });
    it('takes every buffer of a host mesh, and gives one without them the library fallbacks', () => {
        const system = makeSystem(scene.get(), {renderMode: RenderMode.Mesh});
        const binding = new EffectBinding(system);
        const triangle = [0, 0, 0, 1, 0, 0, 0, 1, 0];
        const geometryOptions = [
            {label: 'Bare', positions: [...triangle, ...triangle]},
            {
                label: 'Full',
                positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
                indices: [0, 1, 2, 0, 2, 3],
                uvs: [0, 0, 1, 0, 1, 1, 0, 1],
                uvs2: [0, 0, 0.5, 0, 0.5, 0.5, 0, 0.5],
                normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
            },
        ];
        const element = () => <RendererModule binding={binding} geometryOptions={geometryOptions} />;
        mounted = mount(element());
        binding.subscribe(() => mounted!.render(element()));
        const geometry = () => controlsOf(rowOf(mounted!.container, 'Geometry'))[0];

        pick(geometry(), 'host:1');
        expect(Array.from(system.instancingIndices)).toEqual([0, 1, 2, 0, 2, 3]);
        expect(Array.from(system.instancingUVs2!)).toEqual(geometryOptions[1].uvs2);
        expect(system.getRendererSettings().instancingNormals).toHaveLength(12);

        pick(geometry(), 'host:0');
        expect(Array.from(system.instancingIndices)).toEqual([0, 1, 2, 3, 4, 5]);
        expect(system.instancingUVs).toHaveLength(12);
        expect(system.instancingUVs2).toBeUndefined();
        // The mesh shader reads normals, so the system keeps the library's fallback ones.
        expect(system.getRendererSettings().instancingNormals).toHaveLength(18);

        // The mesh still saves: the indices it got are real ones.
        expect(system.toJSON().instancingGeometry).toBeDefined();
    });
});
