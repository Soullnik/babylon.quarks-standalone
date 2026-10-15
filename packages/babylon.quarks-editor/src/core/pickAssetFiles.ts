import {isAssetImportFile, relativePathOf} from './assets';

interface DirectoryPickerWindow {
    showDirectoryPicker?: (options?: {mode?: 'read' | 'readwrite'}) => Promise<FileSystemDirectoryHandle>;
}

/**
 * Structural type for directory handles that expose `entries()`.
 * Not declared as extending `FileSystemDirectoryHandle` because DOM lib typings
 * omit `entries()` and narrowing its iterator value type would be incompatible.
 */
interface DirectoryHandleWithEntries {
    entries(): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>;
}

/**
 * Recursively collects effect `.json` files and the image files they may reference from a
 * directory handle (File System Access API).
 */
async function readAssetFilesFromDirectory(dir: DirectoryHandleWithEntries, prefix = ''): Promise<File[]> {
    const files: File[] = [];
    for await (const [name, entry] of dir.entries()) {
        if (entry.kind === 'file') {
            if (!isAssetImportFile(name)) continue;
            const file = await entry.getFile();
            Object.defineProperty(file, 'webkitRelativePath', {
                value: prefix + name,
                configurable: true,
            });
            files.push(file);
            continue;
        }
        if (entry.kind === 'directory') {
            files.push(
                ...(await readAssetFilesFromDirectory(
                    entry as unknown as DirectoryHandleWithEntries,
                    `${prefix}${name}/`
                ))
            );
        }
    }
    return files;
}

/**
 * Opens a native folder picker when the host supports it. Returns `null` when the user
 * cancels, or `undefined` when the API is unavailable (caller should fall back to
 * `<input webkitdirectory>`).
 */
export async function pickAssetFolderFiles(): Promise<File[] | null | undefined> {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (typeof picker !== 'function') {
        return undefined;
    }

    try {
        const dir = (await picker.call(window, {mode: 'read'})) as DirectoryHandleWithEntries;
        const files = await readAssetFilesFromDirectory(dir);
        return files.sort((a, b) => relativePathOf(a).localeCompare(relativePathOf(b)));
    } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
            return null;
        }
        throw err;
    }
}
