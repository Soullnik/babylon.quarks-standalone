import type {Texture} from '@babylonjs/core/Materials/Textures/texture';

const bakedUrls = new WeakMap<Texture, string>();

/**
 * Babylon's glTF loader gives embedded (base64-in-buffer) images a placeholder `data:` url
 * (e.g. `data:leave.glb#image0`) that only works as an in-memory cache key paired with the
 * pixel buffer it loaded alongside — it has no real payload, so a fresh Scene/Engine (e.g.
 * after "Open in editor" navigates to a new page) can't refetch or reconstruct it from that
 * string. Real data URIs always carry a comma-delimited payload; this placeholder never does.
 */
function isPortableUrl(url: string | null | undefined): boolean {
    if (!url) {
        return false;
    }
    return !url.startsWith('data:') || url.includes(',');
}

/**
 * Ensures a texture's `.url` can be reloaded in a different Scene/Engine, baking its live
 * GPU pixels into a real base64 PNG data URI when it currently only carries Babylon's
 * internal placeholder url (see isPortableUrl). No-ops for textures that already have a
 * fetchable or real `data:` url. Call before serializing a scene that will be reloaded
 * elsewhere — e.g. the demo viewer's "Open in editor" handoff, which navigates to a new page.
 */
export async function ensurePortableTextureUrl(texture: Texture): Promise<void> {
    if (isPortableUrl(texture.url)) {
        return;
    }
    const cached = bakedUrls.get(texture);
    if (cached) {
        texture.url = cached;
        return;
    }
    const dataUrl = await bakeTextureToDataUrl(texture);
    if (dataUrl) {
        bakedUrls.set(texture, dataUrl);
        texture.url = dataUrl;
    }
}

async function bakeTextureToDataUrl(texture: Texture): Promise<string | undefined> {
    const size = texture.getSize();
    if (!size.width || !size.height) {
        return undefined;
    }
    const pixels = await texture.readPixels();
    if (!(pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray)) {
        return undefined;
    }
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return undefined;
    }
    // Copy (rather than wrap) so the result is backed by a plain ArrayBuffer — ImageData
    // rejects the SharedArrayBuffer-compatible view type `readPixels` may hand back.
    const bytes = new Uint8ClampedArray(pixels);
    ctx.putImageData(new ImageData(bytes, size.width, size.height), 0, 0);
    return canvas.toDataURL('image/png');
}
