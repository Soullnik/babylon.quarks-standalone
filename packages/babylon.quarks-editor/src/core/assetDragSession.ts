import type {AssetDragPayload} from './assetTree.js';

let activeDrag: AssetDragPayload | null = null;

/** Stores the current asset drag payload for viewport preview (getData is drop-only in most browsers). */
export function setAssetDragSession(payload: AssetDragPayload | null): void {
    activeDrag = payload;
}

export function getAssetDragSession(): AssetDragPayload | null {
    return activeDrag;
}
