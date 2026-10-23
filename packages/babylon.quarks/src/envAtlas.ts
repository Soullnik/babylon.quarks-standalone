import {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Scene} from '@babylonjs/core/scene';

/**
 * Atlases by cube, then by the scene they were built for: a texture belongs to one scene and one
 * engine, so a second scene (an editor preview, a second canvas) gets an atlas of its own.
 */
const atlasesByCube = new WeakMap<BaseTexture, Map<Scene, Texture>>();
const pendingByCube = new WeakMap<BaseTexture, Map<Scene, Promise<Texture | null>>>();
/** Atlases this module built, which it disposes; an atlas given to {@link cacheEnvAtlas} stays the caller's. */
const builtAtlases = new WeakSet<Texture>();
/** Cubes whose atlas failed to build: not tried, or warned about, again. */
const failedCubes = new WeakSet<BaseTexture>();
/** Atlases whose dispose this module already listens to. */
const watchedAtlases = new WeakSet<Texture>();
/** Cubes whose dispose this module already listens to. */
const watchedCubes = new WeakSet<BaseTexture>();

/** Reads the six face URLs from a Babylon CubeTexture (px py pz nx ny nz). */
export function cubeFaceUrls(reflection: BaseTexture | null | undefined): string[] | null {
    if (!reflection?.isCube) {
        return null;
    }
    const files =
        (reflection as {files?: string[]; _files?: string[]}).files ?? (reflection as {_files?: string[]})._files;
    return files?.length === 6 ? files.slice() : null;
}

/** The scene a texture belongs to, or null for a disposed texture or one with no scene. */
function sceneOf(texture: BaseTexture): Scene | null {
    return (texture as {getScene?: () => Scene | null}).getScene?.() ?? null;
}

/**
 * Returns the atlas already built or cached for this cube in `scene`, if any.
 *
 * @param cube - The cube texture the atlas was made from.
 * @param scene - The scene the atlas must belong to. Defaults to the cube's own scene.
 */
export function getCachedEnvAtlas(cube: BaseTexture, scene: Scene | null = sceneOf(cube)): Texture | null {
    return (scene && atlasesByCube.get(cube)?.get(scene)) || null;
}

/**
 * Stores a prebuilt atlas for a cube in the atlas's scene, so systems that use the cube in that
 * scene take it instead of building one. The atlas stays the caller's: quarks never disposes it,
 * and drops it from the cache when it, or the cube, is disposed.
 *
 * @param cube - The cube texture the atlas stands in for.
 * @param atlas - A 3×2 atlas in the layout of {@link createEnvAtlasFromFaceUrls}.
 */
export function cacheEnvAtlas(cube: BaseTexture, atlas: Texture): void {
    const scene = sceneOf(atlas) ?? sceneOf(cube);
    if (scene) {
        store(cube, scene, atlas);
    } else {
        console.warn('[babylon.quarks] cacheEnvAtlas: neither the atlas nor the cube has a scene; not cached');
    }
}

/**
 * Drops the atlases made for `cube` from the cache and disposes the ones quarks built. Runs by
 * itself when the cube is disposed; call it when an environment is swapped out but the cube is
 * kept. Systems that use the cube build a new atlas the next time their material is resolved.
 *
 * @param cube - The cube texture whose atlases to drop.
 * @param scene - Only the atlas for this scene. Defaults to every scene.
 */
export function disposeEnvAtlas(cube: BaseTexture, scene?: Scene): void {
    const atlases = atlasesByCube.get(cube);
    if (!atlases) {
        return;
    }
    for (const [atlasScene, atlas] of [...atlases]) {
        if (scene && atlasScene !== scene) {
            continue;
        }
        atlases.delete(atlasScene);
        if (builtAtlases.has(atlas)) {
            atlas.dispose();
        }
    }
}

function store(cube: BaseTexture, scene: Scene, atlas: Texture): void {
    let atlases = atlasesByCube.get(cube);
    if (!atlases) {
        atlases = new Map();
        atlasesByCube.set(cube, atlases);
    }
    atlases.set(scene, atlas);
    // A scene disposes its textures, so this also lets go of a disposed scene.
    if (!watchedAtlases.has(atlas) && atlas.onDisposeObservable) {
        watchedAtlases.add(atlas);
        atlas.onDisposeObservable.addOnce(() => {
            if (atlasesByCube.get(cube)?.get(scene) === atlas) {
                atlasesByCube.get(cube)!.delete(scene);
            }
        });
    }
    if (!watchedCubes.has(cube) && cube.onDisposeObservable) {
        watchedCubes.add(cube);
        cube.onDisposeObservable.addOnce(() => {
            watchedCubes.delete(cube);
            disposeEnvAtlas(cube);
        });
    }
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
 * Ensures a 3×2 env atlas exists for a CubeTexture in `scene`. Returns a cached atlas
 * synchronously when available; otherwise starts (or joins) an async build and invokes onReady
 * when the atlas is usable. A cube disposed before its build finishes gets no atlas, and one
 * whose build failed is not tried again: it warns once.
 */
export function ensureEnvAtlasFromCube(
    cube: BaseTexture,
    scene: Scene,
    onReady: (atlas: Texture) => void
): Texture | null {
    const cached = getCachedEnvAtlas(cube, scene);
    if (cached) {
        onReady(cached);
        return cached;
    }

    let pendingByScene = pendingByCube.get(cube);
    if (!pendingByScene) {
        pendingByScene = new Map();
        pendingByCube.set(cube, pendingByScene);
    }
    const pendings = pendingByScene;

    const kick = () => {
        const existingPending = pendings.get(scene);
        if (existingPending) {
            existingPending.then((atlas) => {
                if (atlas) {
                    onReady(atlas);
                }
            });
            return;
        }

        const urls = cubeFaceUrls(cube);
        if (!urls || failedCubes.has(cube)) {
            return;
        }

        let cubeDisposed = false;
        // Removed once the build settles, so it does not keep the scene and onReady alive.
        const cubeObserver = cube.onDisposeObservable?.addOnce(() => (cubeDisposed = true));
        const settle = () => {
            pendings.delete(scene);
            if (cubeObserver) {
                cube.onDisposeObservable.remove(cubeObserver);
            }
        };
        const pending = envAtlasBuilder
            .createFromFaceUrls(urls, scene)
            .then((atlas) => {
                settle();
                if (cubeDisposed || scene.isDisposed) {
                    atlas.dispose();
                    return null;
                }
                builtAtlases.add(atlas);
                store(cube, scene, atlas);
                onReady(atlas);
                return atlas;
            })
            .catch((err) => {
                settle();
                failedCubes.add(cube);
                console.warn('[babylon.quarks] Failed to build env atlas from cubemap faces', err);
                return null;
            });
        pendings.set(scene, pending);
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

    return getCachedEnvAtlas(cube, scene);
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
