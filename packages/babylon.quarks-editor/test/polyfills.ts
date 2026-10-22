/** Browser file APIs the editor core uses that Node lacks: a FileReader for data URIs and rAF. */
export function installFilePolyfills(): void {
    const g = globalThis as {FileReader?: unknown; requestAnimationFrame?: unknown};
    if (!g.FileReader) {
        g.FileReader = class {
            result: string | null = null;
            error: Error | null = null;
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            readAsDataURL(blob: Blob): void {
                blob.arrayBuffer().then(
                    (buffer) => {
                        this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`;
                        this.onload?.();
                    },
                    (error) => {
                        this.error = error;
                        this.onerror?.();
                    }
                );
            }
        };
    }
    if (!g.requestAnimationFrame) {
        g.requestAnimationFrame = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0);
    }
}

/** A File with the relative path a folder pick gives it. */
export function fileAt(path: string, content: string, type = 'application/json'): File {
    const name = path.split('/').pop()!;
    const file = new File([content], name, {type});
    Object.defineProperty(file, 'webkitRelativePath', {value: path, configurable: true});
    return file;
}
