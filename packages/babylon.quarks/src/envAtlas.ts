import {Scene} from '@babylonjs/core/scene';
import {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';

const atlasByCube = new WeakMap<BaseTexture, Texture>();
const pendingByCube = new WeakMap<BaseTexture, Promise<Texture | null>>();

/** Reads the six face URLs from a Babylon CubeTexture (px py pz nx ny nz). */
export function cubeFaceUrls(reflection: BaseTexture | null | undefined): string[] | null {
    if (!reflection?.isCube) {
        return null;
    }
    const files = (reflection as {files?: string[]; _files?: string[]}).files
        ?? (reflection as {_files?: string[]})._files;
    return files?.length === 6 ? files.slice() : null;
}

/** Returns a previously built atlas for this cube, if any. */
export function getCachedEnvAtlas(cube: BaseTexture): Texture | null {
    return atlasByCube.get(cube) ?? null;
}

/** Stores an atlas for a cube source (tests / prebuilt atlases). */
export function cacheEnvAtlas(cube: BaseTexture, atlas: Texture): void {
    atlasByCube.set(cube, atlas);
}

/**
 * Packs six cube-face images into one 3×2 atlas Texture (px py pz / nx ny nz).
 * Uses invertY:false so UV cellY=0 maps to the +faces row matching the shader.
 */
export async function createEnvAtlasFromFaceUrls(urls: string[], scene: Scene): Promise<Texture> {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
        throw new Error('createEnvAtlasFromFaceUrls requires a DOM Image/canvas environment');
    }
    const images = await Promise.all(urls.map((url) => loadImage(url)));
    const size = images[0].width || images[0].naturalWidth;
    if (!size) {
        throw new Error('Env atlas face image has zero size');
    }
    const canvas = document.createElement('canvas');
    canvas.width = size * 3;
    canvas.height = size * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Could not create env atlas canvas');
    }
    for (let i = 0; i < 6; i++) {
        ctx.drawImage(images[i], (i % 3) * size, Math.floor(i / 3) * size, size, size);
    }
    const atlas = new Texture(canvas.toDataURL('image/jpeg', 0.92), scene, {
        noMipmap: true,
        invertY: false,
        samplingMode: Texture.LINEAR_LINEAR,
    });
    atlas.name = 'quarksEnvAtlas';
    return atlas;
}

/** Overridable builder hook (tests replace this to avoid needing DOM Image/canvas). */
export const envAtlasBuilder = {
    createFromFaceUrls: createEnvAtlasFromFaceUrls,
};

/**
 * Ensures a 3×2 env atlas exists for a CubeTexture. Returns a cached atlas
 * synchronously when available; otherwise starts (or joins) an async build and
 * invokes onReady when the atlas is usable.
 */
export function ensureEnvAtlasFromCube(
    cube: BaseTexture,
    scene: Scene,
    onReady: (atlas: Texture) => void
): Texture | null {
    const cached = atlasByCube.get(cube);
    if (cached) {
        onReady(cached);
        return cached;
    }

    const kick = () => {
        const existingPending = pendingByCube.get(cube);
        if (existingPending) {
            existingPending.then((atlas) => {
                if (atlas) {
                    onReady(atlas);
                }
            });
            return;
        }

        const urls = cubeFaceUrls(cube);
        if (!urls) {
            return;
        }

        const pending = envAtlasBuilder
            .createFromFaceUrls(urls, scene)
            .then((atlas) => {
                atlasByCube.set(cube, atlas);
                pendingByCube.delete(cube);
                onReady(atlas);
                return atlas;
            })
            .catch((err) => {
                pendingByCube.delete(cube);
                console.warn('[babylon.quarks] Failed to build env atlas from cubemap faces', err);
                return null;
            });
        pendingByCube.set(cube, pending);
    };

    if (cube.isReady()) {
        kick();
    } else {
        const observable = (cube as {onLoadObservable?: {addOnce: (cb: () => void) => void}}).onLoadObservable;
        if (observable) {
            observable.addOnce(() => kick());
        } else {
            kick();
        }
    }

    return atlasByCube.get(cube) ?? null;
}

/** Loads one image URL as an HTMLImageElement. */
function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load env face ${url}`));
        image.src = url;
    });
}
