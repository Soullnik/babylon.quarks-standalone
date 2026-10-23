import type {Texture} from '@babylonjs/core/Materials/Textures/texture';

/** Per loaded texture: the url its effect file wrote, and the url the loader gave the texture. */
const sources = new WeakMap<Texture, {source: string; loaded: string}>();

/**
 * Remembers the url a texture's image had in the effect file (`tex/a.png`) and the url the texture
 * was made with (`fx/tex/a.png`). Called by the loader when it makes a texture.
 */
export function setTextureSourceUrl(texture: Texture, source: string, loaded: string): void {
    sources.set(texture, {source, loaded});
}

/**
 * The url a texture's image had in the effect file it was loaded from, relative to that file.
 * `serializeEffect` writes it by default, so a file saved next to the one it was loaded from loads
 * the same images.
 *
 * `undefined` when there is no such url: a texture made in code or loaded another way; a texture
 * whose image the loader's resolver inlined (`data:` or `blob:`), which holds the image itself; and
 * a texture whose `url` was changed since it was loaded (`updateURL`, or a `data:` URI assigned
 * before saving), since the file's path no longer names what it shows.
 *
 * A texture shared between effects (see `QuarksLoaderOptions.shareResources`) keeps the url of the
 * first effect that loaded it; effects in different folders that join to the same image share it.
 */
export function textureSourceUrl(texture: Texture): string | undefined {
    const entry = sources.get(texture);
    return entry !== undefined && texture.url === entry.loaded ? entry.source : undefined;
}
