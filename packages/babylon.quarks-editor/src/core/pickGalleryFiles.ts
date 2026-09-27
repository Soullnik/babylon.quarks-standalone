import {collectEffectFiles} from './loadEffectGallery';

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
 * Recursively collects every file under a directory handle (File System Access API). Which of
 * them are effects is decided from their content by collectEffectFiles, not from their names.
 */
async function readFilesFromDirectory(dir: DirectoryHandleWithEntries, prefix = ''): Promise<File[]> {
    const files: File[] = [];
    for await (const [name, entry] of dir.entries()) {
        if (entry.kind === 'file') {
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
                ...(await readFilesFromDirectory(entry as unknown as DirectoryHandleWithEntries, `${prefix}${name}/`))
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
        return await collectEffectFiles(await readFilesFromDirectory(dir));
    } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
            return null;
        }
        throw err;
    }
}
