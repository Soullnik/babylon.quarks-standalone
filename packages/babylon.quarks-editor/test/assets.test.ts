import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {serializeEffect} from 'babylon.quarks';
import {
    assetIconUrl,
    collectJsonFiles,
    createEffectAsset,
    EffectAsset,
    isAssetImportFile,
    isEffectJson,
    loadEffectAssets,
    mergeAssets,
    relativePathOf,
    removeAssets,
    resolveRelativePath,
} from '../src/core/assets';
import {makeSystem, useScene} from './helpers';
import {fileAt, installFilePolyfills} from './polyfills';

installFilePolyfills();

describe('asset file helpers', () => {
    it('reads relative paths, picks import files and sorts json files by path', () => {
        expect(relativePathOf(fileAt('a\\b/fx.json', '{}'))).toBe('a/b/fx.json');
        expect(relativePathOf(new File(['{}'], 'plain.json'))).toBe('plain.json');
        expect(
            ['fx.json', 'FX.JSON', 'a.png', 'b.JPG', 'c.webp', 'd.gif', 'e.bmp', 'f.jpeg'].every(isAssetImportFile)
        ).toBe(true);
        expect(['cube.glb', 'notes.txt', 'json'].some(isAssetImportFile)).toBe(false);
        const files = collectJsonFiles([fileAt('z/b.json', '{}'), fileAt('a.png', ''), fileAt('a/c.json', '{}')]);
        expect(files.map(relativePathOf)).toEqual(['a/c.json', 'z/b.json']);
    });

    it('resolves urls against the effect file folder', () => {
        expect(resolveRelativePath('a/b/fx.json', '../t.png')).toBe('a/t.png');
        expect(resolveRelativePath('a/b/fx.json', './t.png')).toBe('a/b/t.png');
        expect(resolveRelativePath('fx.json', 'tex/t.png')).toBe('tex/t.png');
        expect(resolveRelativePath('a/fx.json', '../../t.png')).toBe('t.png');
    });

    it('recognises an effect envelope by a particle emitter anywhere in its tree', () => {
        expect(
            isEffectJson({object: {type: 'Group', children: [{type: 'Group', children: [{type: 'ParticleEmitter'}]}]}})
        ).toBe(true);
        expect(isEffectJson({object: {type: 'Group', children: [{type: 'Mesh'}]}})).toBe(false);
        expect(isEffectJson({positions: []})).toBe(false);
        expect(isEffectJson(null)).toBe(false);
    });
});

describe('asset lists', () => {
    const asset = (id: number, path: string): EffectAsset => ({id, name: path, path, json: {}, missingFiles: []});

    it('merges by path, skipping duplicates', () => {
        const {merged, added, skipped} = mergeAssets(
            [asset(1, 'a/x.json')],
            [asset(2, 'a/x.json'), asset(3, 'b.json')]
        );
        expect(merged.map((a) => a.id)).toEqual([1, 3]);
        expect(added.map((a) => a.id)).toEqual([3]);
        expect(skipped).toBe(1);
    });

    it('removes one asset or a folder', () => {
        const list = [asset(1, 'a/x.json'), asset(2, 'a/y.json'), asset(3, 'ab/z.json')];
        expect(removeAssets(list, {kind: 'asset', id: 2}).map((a) => a.id)).toEqual([1, 3]);
        expect(removeAssets(list, {kind: 'folder', path: 'a'}).map((a) => a.id)).toEqual([3]);
    });

    it('wraps in-memory json as an asset with fresh ids', () => {
        const a = createEffectAsset('fx', 'fx.json', {});
        const b = createEffectAsset('fx', 'fx.json', {});
        expect(b.id).toBeGreaterThan(a.id);
        expect(a).toMatchObject({name: 'fx', path: 'fx.json', missingFiles: []});
    });

    it('finds the icon through the first emitter material, falling back to the first image', () => {
        const json = {
            object: {type: 'Group', children: [{type: 'ParticleEmitter', ps: {material: 'm1'}}]},
            materials: [{uuid: 'm1', map: 't1'}],
            textures: [{uuid: 't1', image: 'i1'}],
            images: [
                {uuid: 'i0', url: 'first.png'},
                {uuid: 'i1', url: 'glow.png'},
            ],
        };
        const a = createEffectAsset('a', 'a.json', json);
        expect(assetIconUrl(a)).toBe('glow.png');
        expect(assetIconUrl(a)).toBe('glow.png');
        const b = createEffectAsset('b', 'b.json', {...json, materials: []});
        expect(assetIconUrl(b)).toBe('first.png');
        expect(assetIconUrl(createEffectAsset('c', 'c.json', {}))).toBeNull();
        expect(assetIconUrl(createEffectAsset('d', 'd.json', {images: [{url: ''}]}))).toBeNull();
    });
});

describe('importing effect files', () => {
    const scene = useScene();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    afterAll(() => warn.mockRestore());

    function effectJson(): Record<string, unknown> {
        const root = new TransformNode('fx', scene.get());
        const system = makeSystem(scene.get(), {texture: new Texture('textures/glow.png', scene.get())});
        system.emitter.parent = root;
        return serializeEffect(root, {name: 'fx'}) as unknown as Record<string, unknown>;
    }

    it('inlines the images and geometry files that were imported, and lists the ones that were not', async () => {
        const json = effectJson();
        json.geometries = [{uuid: 'g1', type: 'QuarksGeometry', url: 'meshes/cube.json'}];
        const files = [
            fileAt('pack/fx/burst.json', JSON.stringify(json)),
            fileAt('pack/fx/textures/glow.png', 'png-bytes', 'image/png'),
            fileAt('pack/fx/meshes/cube.json', JSON.stringify({positions: [0, 0, 0], indices: [0]})),
            fileAt('pack/notes.txt', 'ignored'),
            fileAt('pack/other.json', JSON.stringify({positions: []})),
            fileAt('pack/broken.json', '{not json'),
        ];
        const progress: unknown[] = [];
        const assets = await loadEffectAssets(files, (p) => progress.push({...p}));
        expect(assets).toHaveLength(1);
        const [asset] = assets;
        expect(asset).toMatchObject({name: 'burst', path: 'pack/fx/burst.json', missingFiles: []});
        const loaded = asset.json as {
            images: Array<{url: string}>;
            geometries: Array<{url?: string; positions?: unknown}>;
        };
        expect(loaded.images[0].url).toBe(`data:image/png;base64,${Buffer.from('png-bytes').toString('base64')}`);
        expect(loaded.geometries[0].url).toBeUndefined();
        expect(loaded.geometries[0].positions).toEqual([0, 0, 0]);
        // Every .json file counts towards the total; the geometry file and the unrelated
        // one are skipped silently, the broken one fails.
        expect(progress[0]).toEqual({done: 0, total: 4, loaded: 0, failed: 0});
        expect(progress[progress.length - 1]).toEqual({done: 4, total: 4, loaded: 1, failed: 1});
    });

    it('finds files by bare name when the pick has no folders, keeps external urls and records missing ones', async () => {
        const json = effectJson();
        (json.images as Array<{url: string}>).push({url: 'https://cdn.example.com/x.png'}, {url: 'missing.png'});
        json.geometries = [{uuid: 'g1', type: 'QuarksGeometry', url: 'nowhere/cube.json'}];
        const files = [
            new File([JSON.stringify(json)], 'burst.json', {type: 'application/json'}),
            new File(['png'], 'glow.png', {type: 'image/png'}),
        ];
        const assets = await loadEffectAssets(files, () => {});
        expect(assets).toHaveLength(1);
        const loaded = assets[0].json as {images: Array<{url: string}>};
        expect(loaded.images[0].url.startsWith('data:image/png;base64,')).toBe(true);
        expect(loaded.images[1].url).toBe('https://cdn.example.com/x.png');
        expect(loaded.images[2].url).toBe('missing.png');
        expect(assets[0].missingFiles).toEqual(expect.arrayContaining(['missing.png', 'nowhere/cube.json']));
        expect(warn).toHaveBeenCalled();
    });

    it('yields to the browser every few files', async () => {
        const json = JSON.stringify(effectJson());
        const files = Array.from({length: 9}, (_, i) => fileAt(`fx${i}.json`, json));
        const raf = jest.spyOn(globalThis, 'requestAnimationFrame');
        const assets = await loadEffectAssets(files, () => {});
        expect(assets).toHaveLength(9);
        expect(raf).toHaveBeenCalledTimes(1);
        raf.mockRestore();
    });
});
