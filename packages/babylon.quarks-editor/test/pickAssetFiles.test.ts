/** @jest-environment jsdom */
import {relativePathOf} from '../src/core/assets';
import {pickAssetFolderFiles} from '../src/core/pickAssetFiles';

type Entry =
    {kind: 'file'; getFile(): Promise<File>} | {kind: 'directory'; entries(): AsyncIterableIterator<[string, Entry]>};

function directory(tree: Record<string, string | Record<string, unknown>>): Entry {
    return {
        kind: 'directory',
        async *entries() {
            for (const [name, value] of Object.entries(tree)) {
                yield [
                    name,
                    typeof value === 'string'
                        ? {kind: 'file', getFile: async () => new File([value], name)}
                        : directory(value as Record<string, string>),
                ] as [string, Entry];
            }
        },
    };
}

describe('folder picker', () => {
    const win = window as unknown as {showDirectoryPicker?: unknown};
    afterEach(() => delete win.showDirectoryPicker);

    it('is unavailable without the File System Access API', async () => {
        await expect(pickAssetFolderFiles()).resolves.toBeUndefined();
    });

    it('collects effect and image files with their folder paths, sorted', async () => {
        win.showDirectoryPicker = jest.fn(async () =>
            directory({'z.json': '{}', notes: 'x', sub: {'b.png': 'p', deep: {'a.json': '{}'}, 'c.glb': ''}})
        );
        const files = (await pickAssetFolderFiles())!;
        expect(files.map(relativePathOf)).toEqual(['sub/b.png', 'sub/deep/a.json', 'z.json']);
        expect(win.showDirectoryPicker).toHaveBeenCalledWith({mode: 'read'});
    });

    it('returns null when the user cancels and rethrows other errors', async () => {
        win.showDirectoryPicker = async () => {
            throw new DOMException('cancelled', 'AbortError');
        };
        await expect(pickAssetFolderFiles()).resolves.toBeNull();
        win.showDirectoryPicker = async () => {
            throw new Error('disk');
        };
        await expect(pickAssetFolderFiles()).rejects.toThrow('disk');
    });
});
