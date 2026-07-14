/** Lightweight external store so gizmo drags refresh ObjectModule without re-rendering the whole host. */
let revision = 0;
const listeners = new Set<() => void>();

export function subscribeTransform(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getTransformRevision(): number {
    return revision;
}

export function notifyTransformChanged(): void {
    revision++;
    for (const listener of listeners) {
        listener();
    }
}
