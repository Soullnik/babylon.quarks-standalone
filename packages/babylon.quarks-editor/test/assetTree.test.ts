import {EffectAsset} from '../src/core/assets';
import {
    ASSET_DRAG_MIME,
    buildAssetTree,
    collectAssetsInFolder,
    collectFolderAssets,
    describeAssetDrag,
    folderChildren,
    readAssetDrag,
    searchAssets,
    writeAssetDrag,
} from '../src/core/assetTree';

const asset = (id: number, path: string): EffectAsset => ({
    id,
    name: path
        .split('/')
        .pop()!
        .replace(/\.json$/, ''),
    path,
    json: {},
    missingFiles: [],
});
const assets = [
    asset(1, 'VFX/Fire/Explosion.json'),
    asset(2, 'VFX/Fire/ember.json'),
    asset(3, 'VFX/Water/Splash.json'),
    asset(4, 'Zap.json'),
    asset(5, 'Aura.json'),
];

describe('asset tree', () => {
    it('builds folders from paths, folders first and names case-insensitive', () => {
        const tree = buildAssetTree(assets);
        expect(tree.map((n) => [n.kind, n.name])).toEqual([
            ['folder', 'VFX'],
            ['asset', 'Aura'],
            ['asset', 'Zap'],
        ]);
        const fire = folderChildren(tree, 'VFX/Fire')!;
        expect(fire.map((n) => n.name)).toEqual(['ember', 'Explosion']);
        expect(folderChildren(tree, '')).toBe(tree);
        expect(folderChildren(tree, 'VFX/Ice')).toBeNull();
        expect(buildAssetTree([{...asset(9, ''), name: 'bare'}])[0]).toMatchObject({kind: 'asset', name: 'bare'});
    });

    it('collects the assets under a folder, by path or by tree node', () => {
        const tree = buildAssetTree(assets);
        const vfx = tree[0];
        expect(vfx.kind === 'folder' && collectFolderAssets(vfx).map((a) => a.id)).toEqual([2, 1, 3]);
        expect(collectAssetsInFolder(assets, 'VFX/Fire').map((a) => a.id)).toEqual([1, 2]);
        expect(collectAssetsInFolder(assets, 'VFX').map((a) => a.id)).toEqual([1, 2, 3]);
    });

    it('searches names and paths', () => {
        expect(searchAssets(assets, ' fire ').map((a) => a.id)).toEqual([2, 1]);
        expect(searchAssets(assets, 'a').map((a) => a.name)).toEqual(['Aura', 'Splash', 'Zap']);
        expect(searchAssets(assets, 'FIRE/').map((a) => a.id)).toEqual([2, 1]);
        expect(searchAssets(assets, 'nothing')).toEqual([]);
    });

    it('describes what a drag would drop', () => {
        expect(describeAssetDrag(assets, {kind: 'asset', id: 4})).toEqual({assets: [assets[3]], label: 'Zap'});
        expect(describeAssetDrag(assets, {kind: 'asset', id: 99})).toEqual({assets: [], label: 'Effect'});
        const folder = describeAssetDrag(assets, {kind: 'folder', path: 'VFX/Fire'});
        expect(folder.label).toBe('Fire');
        expect(folder.assets.map((a) => a.id)).toEqual([1, 2]);
    });

    it('writes and reads the drag payload through a data transfer', () => {
        const data = new Map<string, string>();
        const transfer = {
            effectAllowed: 'none',
            setData: (type: string, value: string) => data.set(type, value),
            getData: (type: string) => data.get(type) ?? '',
        } as unknown as DataTransfer;
        expect(readAssetDrag(transfer)).toBeNull();
        writeAssetDrag(transfer, {kind: 'asset', id: 2});
        expect(transfer.effectAllowed).toBe('copy');
        expect(readAssetDrag(transfer)).toEqual({kind: 'asset', id: 2});
        writeAssetDrag(transfer, {kind: 'folder', path: 'VFX'});
        expect(readAssetDrag(transfer)).toEqual({kind: 'folder', path: 'VFX'});
        data.set(ASSET_DRAG_MIME, '{"kind":"asset"}');
        expect(readAssetDrag(transfer)).toBeNull();
        data.set(ASSET_DRAG_MIME, 'not json');
        expect(readAssetDrag(transfer)).toBeNull();
    });
});
