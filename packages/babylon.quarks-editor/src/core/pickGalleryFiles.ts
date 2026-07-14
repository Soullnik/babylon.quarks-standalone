import {collectJsonFiles} from './loadEffectGallery';

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

/** Recursively collects `.json` files from a directory handle (File System Access API). */
async function readJsonFilesFromDirectory(dir: DirectoryHandleWithEntries, prefix = ''): Promise<File[]> {
    const files: File[] = [];
    for await (const [name, entry] of dir.entries()) {
        if (entry.kind === 'file') {
            if (!name.toLowerCase().endsWith('.json')) continue;
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
                ...(await readJsonFilesFromDirectory(entry as unknown as DirectoryHandleWithEntries, `${prefix}${name}/`))
            );
        }
    }
    return files;
}

/**
 * Opens a native folder picker when the host supports it. Returns `null` when the user
 * cancels, or when the API is unavailable (caller should fall back to `<input webkitdirectory>`).
 */
export async function pickGalleryJsonFiles(): Promise<File[] | null | undefined> {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (typeof picker !== 'function') {
        return undefined;
    }

    try {
        const dir = (await picker.call(window, {mode: 'read'})) as DirectoryHandleWithEntries;
        return collectJsonFiles(await readJsonFilesFromDirectory(dir));
    } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
            return null;
        }
        throw err;
    }
}
