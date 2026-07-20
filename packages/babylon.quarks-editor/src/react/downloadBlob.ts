/** Triggers a browser download of `blob` named `filename` via a throwaway object URL. */
export function downloadBlob(filename: string, blob: Blob): void {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}
