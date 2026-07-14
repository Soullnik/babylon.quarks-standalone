import type {GalleryDragPayload} from './galleryTree';

let activeDrag: GalleryDragPayload | null = null;

/** Stores the current gallery drag payload for viewport preview (getData is drop-only in most browsers). */
export function setGalleryDragSession(payload: GalleryDragPayload | null): void {
    activeDrag = payload;
}

export function getGalleryDragSession(): GalleryDragPayload | null {
    return activeDrag;
}
