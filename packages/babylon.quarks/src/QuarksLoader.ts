import {Constants} from '@babylonjs/core/Engines/constants';
import type {ITextureCreationOptions} from '@babylonjs/core/Materials/Textures/texture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import type {Material} from '@babylonjs/core/Materials/material';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Matrix, Quaternion, Vector3} from '@babylonjs/core/Maths/math.vector';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {
    Behavior,
    currentFormatPath,
    EmitSubParticleSystem,
    QuarksFormatError,
    readFormat,
    readFormatPart,
    warnFormat,
} from 'quarks.core';
import {MeshSurfaceEmitter} from './MeshSurfaceEmitter';
import {ParticleEmitter} from './ParticleEmitter';
import {ParticleSystem} from './ParticleSystem';
import {QuarksPrefab} from './QuarksPrefab';
import type {QuarksNodeJSON, QuarksTextureJSON} from './QuarksSerializer';
import {QUARKS_FORMAT_VERSION} from './QuarksSerializer';
import type {
    BufferAttributeJSON,
    BufferGeometryDataJSON,
    EffectDocumentJSON,
    EffectGeometryJSON,
    EffectImageJSON,
    GeometryArrays,
    MaterialTextureRef,
    QuarksMaterialJSON,
    SphereGeometryJSON,
} from './effectDocumentJSON';
import {disposeEffect, retainEffectResources} from './effectResources';
import {ensureTriangleIndices} from './geometryUtil';
import {fileNodeId, setQuarksNodeId} from './nodeId';
import type {ParticleSystemJSONParameters} from './system/types';
import {setTextureSourceUrl} from './textureSource';

/** Kind of linked asset the loader asks a {@link QuarksResourceResolver} to handle. */
export type QuarksResourceKind = 'effect' | 'geometry' | 'image';

/**
 * Hooks for resolving relative source links (textures, geometry files) and loading their JSON.
 * Omit either method to keep the default (`baseUrl` join / `fetch`).
 */
export interface QuarksResourceResolver {
    /** Resolve a relative url to an absolute / blob / data url. Default: {@link QuarksLoader.joinUrl}. */
    resolve?(url: string, kind: QuarksResourceKind, baseUrl: string): string | Promise<string>;
    /**
     * Load a JSON asset (effect and geometry files). Default: `fetch(resolvedUrl).json()`.
     * `options.signal` is passed for an effect document, whose fetch belongs to one load; geometry
     * fetches are shared between loads and get none.
     */
    fetchJson?(resolvedUrl: string, options?: {signal?: AbortSignal}): Promise<unknown>;
}

/** Options for {@link QuarksLoader.resolveLinkedResources}. */
export interface QuarksResolveOptions {
    /** Joined to relative urls. Default `''`. */
    baseUrl?: string;
    /** Resolves and fetches the linked files; default: join with `baseUrl` and `fetch`. */
    resolver?: QuarksResourceResolver;
    /** Shares the per-scene fetch cache when set. */
    scene?: Scene;
    /** Called for a geometry file that fails to load; default: a console warning. */
    onResourceError?: QuarksLoaderOptions['onResourceError'];
}

/** Options for a {@link QuarksLoader}, shared by every load it does. */
export interface QuarksLoaderOptions {
    /**
     * Prefix joined to relative geometry and image urls (see {@link QuarksLoader.joinUrl}).
     * Unset, {@link QuarksLoader.load} uses the effect file's own folder and the other loads `''`.
     */
    baseUrl?: string;
    /**
     * Reuse one Texture per scene for every effect that references the same image with the same
     * sampling, and one copy of the data for identical mesh geometry. The renderer only batches
     * systems that share the texture (and geometry) object, so without this every loaded effect
     * gets batches — draw calls and buffer uploads — of its own even when its images are the same
     * as another effect's. Default true; turn off to give each effect private textures, e.g. to
     * change one effect's texture settings without touching the others.
     */
    shareResources?: boolean;
    /** Custom url / fetch backend (File picker, CDN, IndexedDB). */
    resolver?: QuarksResourceResolver;
    /**
     * Makes `load`, `loadFromJSON`, `loadAll` and `loadFromJSONAll` resolve only once every texture
     * the effect uses has loaded or failed, so it does not draw its first frames without them.
     * A texture a scene with `useDelayedTextureLoading` would load only once drawn is loaded at
     * once. `parse` never waits. Default false: they resolve when the nodes are built.
     */
    waitForTextures?: boolean;
    /**
     * Called for a geometry file or image that fails to load. The effect still loads: a geometry
     * keeps its link unresolved, and a texture draws nothing. Default: a console warning.
     */
    onResourceError?: (kind: QuarksResourceKind, url: string, error: unknown) => void;
    /**
     * Called for each part of an effect file that cannot be read as written (an unknown behavior,
     * shape or curve type, a sub emitter or mesh surface shape whose target is not in the effect, a
     * newer format), with what was used instead and the part's JSON path, such as
     * `object.children[2].ps.behaviors[3]`. The effect still loads, with that part at its default.
     * Default: a console warning that names the path.
     */
    onFormatWarning?: (message: string, path: string) => void;
    /**
     * Makes a load of a file with a part that cannot be read as written throw a
     * {@link QuarksFormatError} instead of loading on with a warning: for checks that a set of
     * assets loads cleanly, such as in CI. The whole effect is read first, so the error's message
     * names the first such part and its `problems` list them all; what the load built is freed
     * before it throws. `onFormatWarning` still hears each part. Default false.
     */
    strict?: boolean;
}

/** Options for one {@link QuarksLoader.load} or {@link QuarksLoader.loadFromJSON}. */
export interface QuarksLoadOptions {
    /**
     * Cancels the load, e.g. on a level change. The promise rejects with the signal's reason as
     * soon as it is aborted, and no node of the effect is left in the scene. The effect document's
     * own fetch is cancelled; a geometry fetch shared with other loads runs on, and its result is
     * dropped. A scene disposed during the load rejects it the same way.
     */
    signal?: AbortSignal;
}

/** One in-memory effect for {@link QuarksLoader.loadFromJSONAll}. */
export interface QuarksJSONLoadEntry {
    /** The effect document, as {@link serializeEffect} or the editor writes it. Left unchanged. */
    json: unknown;
    /** Overrides loader `baseUrl` for relative texture / geometry links in this effect. */
    baseUrl?: string;
}

/**
 * Options for {@link QuarksLoader.loadAll} / {@link QuarksLoader.loadFromJSONAll}.
 * Batch loads share the per-scene fetch cache and `shareResources`, so N effects that point at
 * the same `assets/geometries/*.json` or texture only pay for that asset once.
 */
export interface QuarksBatchLoadOptions extends QuarksLoadOptions {
    /**
     * Max concurrent effect-document fetches (phase 1). Linked geometry/image resolve still runs
     * across the whole pack in parallel so shared urls coalesce. Default: all at once.
     */
    concurrency?: number;
    /**
     * Called once per effect when it has fully settled (parsed successfully, or failed under
     * `continueOnError`). `done` is how many of `total` have settled so far.
     */
    onProgress?: (done: number, total: number) => void;
    /**
     * When true, a failed effect becomes `null` in the result array and the rest keep loading.
     * When false (default), the first failure rejects the whole batch.
     */
    continueOnError?: boolean;
}

/** An object with fields of unknown types, as a file's JSON may hold anywhere. */
type JSONRecord = {[key: string]: unknown};

function isRecord(value: unknown): value is JSONRecord {
    return value !== null && typeof value === 'object';
}

/**
 * Whether `value` has the root node an effect document needs. The other parts are checked as they
 * are read, so a part of the wrong kind warns instead of failing the load.
 */
function isEffectDocument(value: unknown): value is EffectDocumentJSON {
    return isRecord(value) && isRecord(value.object);
}

/** Whether `value` can be read as a node; its fields are checked as they are read. */
function isNodeJSON(value: unknown): value is QuarksNodeJSON {
    return isRecord(value);
}

/**
 * The entries of a list in an effect document. A list that is not an array, or an entry that is
 * not an object, warns and is left out; the fields of each entry are checked as they are read.
 */
function documentEntries<T>(list: unknown): T[] {
    if (!Array.isArray(list)) {
        warnFormat('This part is not a list; it is skipped.');
        return [];
    }
    const entries: T[] = [];
    list.forEach((entry: unknown, index) => {
        if (isRecord(entry)) {
            entries.push(entry as T);
        } else {
            readFormatPart(`[${index}]`, () => warnFormat('This entry is not an object; it is skipped.'));
        }
    });
    return entries;
}

/** `json[key]` when it is an array, else an empty one. */
function documentList(json: unknown, key: 'images' | 'geometries'): unknown[] {
    const list = isRecord(json) ? json[key] : undefined;
    return Array.isArray(list) ? list : [];
}

/** The uuid of the mesh each loaded system's mesh surface shape names, until the effect links it. */
const meshSurfaceLinks = new WeakMap<ParticleSystem, string>();
/** The JSON path each loaded system was read from, for the warnings of linking it. */
const systemPaths = new WeakMap<ParticleSystem, string>();

/** Textures and geometries reused across loads, per scene. See QuarksLoaderOptions.shareResources. */
const sharedTextures = new WeakMap<Scene, Map<string, Texture>>();
const sharedGeometries = new WeakMap<Scene, Map<string, GeometryArrays>>();
/** In-flight / completed JSON fetches keyed by `json|resolvedUrl`, per scene. */
const sharedFetches = new WeakMap<Scene, Map<string, Promise<unknown>>>();

function sceneMap<T>(maps: WeakMap<Scene, Map<string, T>>, scene: Scene): Map<string, T> {
    let map = maps.get(scene);
    if (map === undefined) {
        map = new Map();
        maps.set(scene, map);
    }
    return map;
}

/** Image entries {@link QuarksLoader.resolveLinkedResources} rewrote, with the url it wrote. */
const resolvedImageUrls = new WeakMap<object, string>();

/** Image entries {@link QuarksLoader.resolveLinkedResources} rewrote, with the url the file had. */
const sourceImageUrls = new WeakMap<object, string>();

/** Content key for a geometry: two independent 32-bit hashes over every array's bytes, plus lengths. */
function geometryKey(geometry: GeometryArrays): string {
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    const parts: Array<ArrayBufferView | undefined> = [
        geometry.positions,
        geometry.indices,
        geometry.uvs,
        geometry.uvs2,
        geometry.normals,
    ];
    let lengths = '';
    for (const part of parts) {
        if (part === undefined) {
            lengths += '-,';
            continue;
        }
        const bytes = new Uint8Array(part.buffer, part.byteOffset, part.byteLength);
        lengths += bytes.length + ',';
        for (let i = 0; i < bytes.length; i++) {
            h1 = Math.imul(h1 ^ bytes[i], 0x01000193);
            h2 = Math.imul(h2 ^ bytes[i], 0x5bd1e995) ^ (h2 >>> 15);
        }
    }
    return `${lengths}${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
}

// Defined in quarks.core, whose readers throw it in a strict read; exported here as before.
export {QuarksFormatError};

/**
 * A copy of an effect document that loading can rewrite (resolved image urls, inlined geometry
 * files) without touching the caller's. Only the entries that change are copied.
 */
function detachDocument(json: unknown): unknown {
    if (!isRecord(json)) {
        return json;
    }
    const copy: JSONRecord = {...json};
    if (Array.isArray(json.images)) {
        copy.images = json.images.map((image: unknown) => {
            if (!image || typeof image !== 'object') {
                return image;
            }
            const imageCopy: {url?: unknown} = {...(image as object)};
            // An entry resolveResources() already rewrote stays resolved in its copy, so loading the
            // document it prepared, with the same base, does not join the base a second time.
            if (resolvedImageUrls.get(image) === imageCopy.url && typeof imageCopy.url === 'string') {
                resolvedImageUrls.set(imageCopy, imageCopy.url);
                const source = sourceImageUrls.get(image);
                if (source !== undefined) {
                    sourceImageUrls.set(imageCopy, source);
                }
            }
            return imageCopy;
        });
    }
    if (Array.isArray(json.geometries)) {
        copy.geometries = json.geometries.map((geometry: unknown) =>
            geometry && typeof geometry === 'object' ? {...(geometry as object)} : geometry
        );
    }
    return copy;
}

/** Settles when a texture the loader made has loaded or failed. */
const textureSettled = new WeakMap<Texture, Promise<void>>();

const abortReason = (signal: AbortSignal) => signal.reason ?? new Error('[QuarksLoader] The load was aborted.');
const sceneDisposed = () => new Error('[QuarksLoader] The scene was disposed while the effect loaded.');

/** Throws the reason a load stops early: its signal was aborted, or its scene disposed. */
function checkLoad(scene: Scene, signal: AbortSignal | undefined): void {
    if (signal?.aborted) {
        throw abortReason(signal);
    }
    if (scene.isDisposed) {
        throw sceneDisposed();
    }
}

/** Follows `promise`, or rejects as {@link checkLoad} would as soon as the load is stopped. */
function untilStopped<T>(promise: Promise<T>, scene: Scene, signal: AbortSignal | undefined): Promise<T> {
    checkLoad(scene, signal);
    return new Promise<T>((resolve, reject) => {
        const aborted = () => reject(abortReason(signal!));
        signal?.addEventListener('abort', aborted, {once: true});
        const disposed = scene.onDisposeObservable.addOnce(() => reject(sceneDisposed()));
        promise.then(resolve, reject).finally(() => {
            signal?.removeEventListener('abort', aborted);
            scene.onDisposeObservable.remove(disposed);
        });
    });
}

interface LoadedMeta {
    /** The materials this load made, which the effect owns. */
    ownedMaterials: Material[];
    /** Image uuid to the url its textures load. */
    images: {[uuid: string]: string | null};
    /** Image uuid to the url the file wrote, before any base url was joined. */
    imageSources: {[uuid: string]: string};
    textures: {[uuid: string]: Texture | null};
    geometries: {[uuid: string]: GeometryArrays};
    materials: {[uuid: string]: QuarksMaterialJSON};
    /** The file's `quarksFormat`; 0 for a file written before the field existed. */
    format: number;
}

/**
 * Loads effects saved as JSON into a scene: fetches the document and the geometry and image files
 * it links, builds the nodes, particle systems, textures and materials, and returns the root.
 * Add the systems to a {@link BatchedRenderer} with {@link QuarksUtil.addToBatchRenderer} to draw
 * them, and free the effect with {@link QuarksLoader.disposeEffect}.
 *
 * @example
 * ```ts
 * const loader = new QuarksLoader(scene, {waitForTextures: true});
 * const effect = await loader.load('effects/fireball.json');
 * QuarksUtil.addToBatchRenderer(effect, renderer);
 * QuarksUtil.play(effect);
 * ```
 */
export class QuarksLoader {
    private scene: Scene;
    private options: QuarksLoaderOptions;

    constructor(scene: Scene, options: QuarksLoaderOptions = {}) {
        this.scene = scene;
        this.options = options;
    }

    /**
     * Fetches an effect JSON from `url`, resolves linked sources, and parses it. Free the effect
     * with {@link disposeEffect}.
     */
    async load(url: string, options: QuarksLoadOptions = {}): Promise<TransformNode> {
        const {json, baseUrl} = await untilStopped(
            this.fetchEffectDocument(url, options.signal),
            this.scene,
            options.signal
        );
        return this.loadFromJSON(json, baseUrl, options);
    }

    /**
     * Resolves linked geometry / image urls (via {@link resolveResources}) then parses. Use when
     * the effect JSON is already in hand (File, CDN payload, editor import). `json` is an
     * {@link EffectDocumentJSON} as parsed from its file; anything else throws
     * {@link QuarksFormatError}, and a part of the wrong kind warns. `json` itself is
     * left as it was, so the same document can be loaded again, into another scene or with
     * another base url.
     */
    async loadFromJSON(json: unknown, baseUrl?: string, options: QuarksLoadOptions = {}): Promise<TransformNode> {
        const signal = options.signal;
        checkLoad(this.scene, signal);
        const resolvedBase = baseUrl ?? this.options.baseUrl ?? '';
        const document = detachDocument(json);
        await untilStopped(this.resolveResources(document, resolvedBase), this.scene, signal);
        // The urls are resolved now; joining them with the base again would load `fx/fx/...`.
        const loaded = this.parseDocument(document, '');
        await this.finishLoad(loaded, signal);
        return loaded.root;
    }

    /**
     * Disposes an effect a loader built: its nodes and systems, the materials made for it, and
     * each texture it uses once no other loaded effect uses it (textures are shared per scene,
     * see {@link QuarksLoaderOptions.shareResources}). Copies made with
     * `QuarksUtil.instantiate` hold the textures too, so disposing the source effect leaves them
     * drawing. The same happens when the root is disposed any other way (`root.dispose()`, its
     * parent's dispose, the scene's). The materials and textures are freed even when other code
     * was handed them; give that code its own. For a root the loader did not build, this is
     * `root.dispose()`.
     */
    static disposeEffect(root: TransformNode): void {
        disposeEffect(root);
    }

    /**
     * Waits for the effect's textures when the loader is asked to, and frees the effect when the
     * load is stopped meanwhile.
     */
    private async finishLoad(loaded: {root: TransformNode; textures: Texture[]}, signal?: AbortSignal): Promise<void> {
        try {
            if (this.options.waitForTextures) {
                for (const texture of loaded.textures) {
                    // A delayed texture would load only once drawn, which it is not until the load resolves.
                    if (texture.delayLoadState === Constants.DELAYLOADSTATE_NOTLOADED) {
                        texture.delayLoad();
                    }
                }
                await untilStopped(
                    Promise.all(loaded.textures.map((texture) => textureSettled.get(texture))),
                    this.scene,
                    signal
                );
            }
            checkLoad(this.scene, signal);
        } catch (err) {
            if (!this.scene.isDisposed) {
                disposeEffect(loaded.root);
            }
            throw err;
        }
    }

    /**
     * Loads many effects in parallel for battle / level preload. Phase 1 fetches every effect
     * JSON (optionally concurrency-limited); phase 2 resolves all linked geometries/images across
     * the pack together so shared asset urls hit the fetch cache once; phase 3 parses.
     *
     * @example
     * ```ts
     * const roots = await loader.loadAll([
     *   'fx/hit.json', 'fx/explosion.json', 'fx/heal.json',
     * ], { concurrency: 6, continueOnError: true });
     * ```
     */
    loadAll(urls: string[], options?: QuarksBatchLoadOptions & {continueOnError?: false}): Promise<TransformNode[]>;
    loadAll(
        urls: string[],
        options: QuarksBatchLoadOptions & {continueOnError: true}
    ): Promise<(TransformNode | null)[]>;
    async loadAll(urls: string[], options: QuarksBatchLoadOptions = {}): Promise<(TransformNode | null)[]> {
        checkLoad(this.scene, options.signal);
        const fetching = QuarksLoader.mapPool(urls, options.concurrency, async (url, index) => {
            checkLoad(this.scene, options.signal);
            try {
                return await this.fetchEffectDocument(url, options.signal);
            } catch (err) {
                // A stopped load is never one effect's failure.
                if (!options.continueOnError || options.signal?.aborted || this.scene.isDisposed) {
                    throw err;
                }
                console.warn(`[QuarksLoader] Failed to fetch effect "${url}" (${index + 1}/${urls.length}):`, err);
                return null;
            }
        });
        const docs = await untilStopped(fetching, this.scene, options.signal);
        return this.loadDocuments(docs, options);
    }

    /**
     * Same two-phase batch as {@link loadAll}, but effect JSON is already in memory (asset pack,
     * IndexedDB, editor). Entries may be bare JSON or `{ json, baseUrl }`.
     */
    loadFromJSONAll(
        entries: Array<QuarksJSONLoadEntry | unknown>,
        options?: QuarksBatchLoadOptions & {continueOnError?: false}
    ): Promise<TransformNode[]>;
    loadFromJSONAll(
        entries: Array<QuarksJSONLoadEntry | unknown>,
        options: QuarksBatchLoadOptions & {continueOnError: true}
    ): Promise<(TransformNode | null)[]>;
    async loadFromJSONAll(
        entries: Array<QuarksJSONLoadEntry | unknown>,
        options: QuarksBatchLoadOptions = {}
    ): Promise<(TransformNode | null)[]> {
        const docs: Array<{json: unknown; baseUrl: string} | null> = entries.map((entry) => {
            // Copied, as loadFromJSON does, so the caller's documents stay as they were.
            if (entry !== null && typeof entry === 'object' && 'json' in (entry as object)) {
                const typed = entry as QuarksJSONLoadEntry;
                return {json: detachDocument(typed.json), baseUrl: typed.baseUrl ?? this.options.baseUrl ?? ''};
            }
            return {json: detachDocument(entry), baseUrl: this.options.baseUrl ?? ''};
        });
        return this.loadDocuments(docs, options);
    }

    /**
     * Inlines external geometry files and rewrites relative image urls through the loader's
     * {@link QuarksResourceResolver}, in place on `json`. Each document is resolved once:
     * geometries already inlined and image urls this method already rewrote are left alone, so
     * loading the same document again does not join its base url twice. Failures warn and leave
     * the entry as is.
     */
    async resolveResources(json: unknown, baseUrl: string = ''): Promise<void> {
        await QuarksLoader.resolveLinkedResources(json, {
            baseUrl,
            resolver: this.options.resolver,
            scene: this.scene,
            onResourceError: this.options.onResourceError,
        });
    }

    /**
     * Same as instance {@link resolveResources}, but usable without constructing a loader (e.g.
     * editor import that only prepares JSON). Pass `scene` to share the per-scene fetch cache.
     * Like it, resolves each document once. A geometry file that fails to load goes to
     * `onResourceError` (default: a console warning) and keeps its link.
     */
    static async resolveLinkedResources(json: unknown, options: QuarksResolveOptions = {}): Promise<void> {
        const baseUrl = options.baseUrl ?? '';
        const resolver = options.resolver;
        const scene = options.scene;

        await QuarksLoader.inlineGeometryEntries(
            json,
            async (geometryUrl) => {
                const resolved = await QuarksLoader.resolveWith(resolver, geometryUrl, 'geometry', baseUrl);
                return QuarksLoader.fetchJsonWith(resolver, resolved, scene);
            },
            options.onResourceError
        );

        await Promise.all(
            documentList(json, 'images').map(async (img) => {
                if (!isRecord(img) || typeof img.url !== 'string' || !img.url) {
                    return;
                }
                // An entry this loader already rewrote keeps its url: resolving the same document
                // again (a second load, or a fetch cached for several loads) would join it twice.
                if (resolvedImageUrls.get(img) === img.url) {
                    return;
                }
                const source = img.url;
                const url = await QuarksLoader.resolveWith(resolver, source, 'image', baseUrl);
                img.url = url;
                resolvedImageUrls.set(img, url);
                // A resolver that inlined the file (`data:`, `blob:`) made the url the image itself;
                // the file's path no longer names what the texture holds, so a save writes the url.
                if (!/^(data|blob):/i.test(url)) {
                    sourceImageUrls.set(img, source);
                }
            })
        );
    }

    /**
     * Inlines geometries that an export wrote to their own file (`{uuid, type: 'QuarksGeometry',
     * url}`). Prefer {@link load}, {@link loadFromJSON}, or {@link resolveResources} — those use
     * the loader's resolver and fetch cache. Kept for callers that already have a custom
     * `loadGeometry` and no `QuarksLoader` instance.
     */
    static async resolveExternalGeometries(
        json: unknown,
        loadGeometry: (url: string) => Promise<unknown>
    ): Promise<void> {
        await QuarksLoader.inlineGeometryEntries(json, loadGeometry);
    }

    /**
     * Builds the node tree of an effect document whose linked files are already inline (see
     * {@link loadFromJSON}). `baseUrl` is joined to relative image urls. Parts the loader cannot
     * read warn and take their defaults; a document with no `object` throws
     * {@link QuarksFormatError}. Free the effect with {@link disposeEffect}.
     */
    parse(json: unknown, baseUrl: string = ''): TransformNode {
        return this.parseDocument(json, baseUrl).root;
    }

    /** {@link parse}, and the textures the effect uses. */
    private parseDocument(json: unknown, baseUrl: string): {root: TransformNode; textures: Texture[]} {
        const {strict, onFormatWarning} = this.options;
        const problems: string[] = [];
        const onWarning = (message: string, path: string): void => {
            const located = path ? `${message} (at ${path})` : message;
            if (strict) problems.push(located);
            if (onFormatWarning) onFormatWarning(message, path);
            else if (!strict) console.warn(`[quarks] ${located}`);
        };
        const loaded = readFormat({onWarning}, () => this.readDocument(json, baseUrl));
        if (problems.length > 0) {
            // The whole effect is read first, so a strict load frees what it built the same way any
            // other effect is freed, and reports how many parts failed.
            QuarksLoader.disposeEffect(loaded.root);
            const more = problems.length > 1 ? ` (and ${problems.length - 1} more)` : '';
            throw new QuarksFormatError(`${problems[0]}${more}`, problems);
        }
        return loaded;
    }

    /** {@link parseDocument} inside its format read. */
    private readDocument(document: unknown, baseUrl: string): {root: TransformNode; textures: Texture[]} {
        if (!isEffectDocument(document)) {
            throw new QuarksFormatError('[QuarksLoader] Not an effect document: it has no "object" to load.');
        }
        const json = document;
        const format = json.metadata?.quarksFormat;
        if (typeof format === 'number' && format > QUARKS_FORMAT_VERSION) {
            warnFormat(
                `This effect was written in format ${format}, newer than the ${QUARKS_FORMAT_VERSION} ` +
                    'this version of babylon.quarks reads; settings it does not know are left out.'
            );
        }
        const meta: LoadedMeta = {
            ownedMaterials: [],
            images: {},
            imageSources: {},
            textures: {},
            geometries: {},
            materials: {},
            format: typeof format === 'number' ? format : 0,
        };

        const {geometries, images, textures: textureList, materials} = json;
        if (geometries) {
            readFormatPart('geometries', () => this.parseGeometries(documentEntries(geometries), meta));
        }
        if (images) {
            readFormatPart('images', () => this.parseImages(documentEntries(images), baseUrl, meta));
        }
        if (textureList) {
            readFormatPart('textures', () => this.parseTextures(documentEntries(textureList), meta));
        }
        if (materials) {
            readFormatPart('materials', () => this.parseMaterials(documentEntries(materials), meta));
        }

        const root = readFormatPart('object', () => this.parseObject(json.object, meta));
        this.linkReferences(root);
        const textures = [...new Set(Object.values(meta.textures).filter((t): t is Texture => t !== null))];
        retainEffectResources(root, textures, meta.ownedMaterials);
        return {root, textures};
    }

    private parseGeometries(geometries: EffectGeometryJSON[], meta: LoadedMeta): void {
        for (const geom of geometries) {
            if (geom.type === 'PlaneGeometry') {
                const w = geom.width || 1;
                const h = geom.height || 1;
                const hw = w / 2;
                const hh = h / 2;
                meta.geometries[geom.uuid] = {
                    positions: new Float32Array([-hw, -hh, 0, hw, -hh, 0, hw, hh, 0, -hw, hh, 0]),
                    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
                    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
                    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
                };
            } else if (geom.type === 'SphereGeometry') {
                meta.geometries[geom.uuid] = this.parseSphereGeometry(geom);
            } else if (geom.type === 'BufferGeometry' && geom.data) {
                const parsed = this.parseBufferGeometry(geom.data);
                meta.geometries[geom.uuid] = parsed;
            } else if (geom.type === 'QuarksGeometry') {
                if (typeof geom.url === 'string' && !geom.positions) {
                    warnFormat(
                        `Geometry "${geom.url}" is an external file; use load(), ` +
                            'loadFromJSON(), or resolveResources() before parse().'
                    );
                }
                meta.geometries[geom.uuid] = this.share({
                    positions: new Float32Array(geom.positions ?? []),
                    indices: geom.indices ? new Uint32Array(geom.indices) : new Uint32Array(0),
                    uvs: geom.uvs ? new Float32Array(geom.uvs) : undefined,
                    uvs2: geom.uvs2 ? new Float32Array(geom.uvs2) : undefined,
                    normals: geom.normals ? new Float32Array(geom.normals) : undefined,
                });
            }
        }
    }

    /** The scene's copy of an identical geometry when resources are shared, else `geometry` itself. */
    private share(geometry: GeometryArrays): GeometryArrays {
        if (this.options.shareResources === false) {
            return geometry;
        }
        const geometries = sceneMap(sharedGeometries, this.scene);
        const key = geometryKey(geometry);
        const existing = geometries.get(key);
        if (existing !== undefined) {
            return existing;
        }
        geometries.set(key, geometry);
        return geometry;
    }

    /**
     * Forgets the textures, geometries, and in-flight JSON fetches shared between loads into
     * `scene` (see {@link QuarksLoaderOptions.shareResources}). Effects already loaded keep
     * theirs; the next load creates new ones. Textures are not disposed — they may still be in use.
     */
    static clearSharedResources(scene: Scene): void {
        sharedTextures.delete(scene);
        sharedGeometries.delete(scene);
        sharedFetches.delete(scene);
    }

    /** Joins `baseUrl` with a relative `url`; leaves data/blob/absolute/root-absolute urls alone. */
    static joinUrl(baseUrl: string, url: string): string {
        if (/^(data|blob):/i.test(url) || /^[a-z][a-z0-9+.-]*:\/\//i.test(url) || url.startsWith('/')) {
            return url;
        }
        return baseUrl + url;
    }

    private parseSphereGeometry(geom: SphereGeometryJSON): GeometryArrays {
        const radius = geom.radius ?? 0.5;
        const widthSegments = Math.max(3, Math.floor(geom.widthSegments ?? 16));
        const heightSegments = Math.max(2, Math.floor(geom.heightSegments ?? 8));
        const phiStart = geom.phiStart ?? 0;
        const phiLength = geom.phiLength ?? Math.PI * 2;
        const thetaStart = geom.thetaStart ?? 0;
        const thetaLength = geom.thetaLength ?? Math.PI;

        const positions: number[] = [];
        const normals: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        const grid: number[][] = [];

        let index = 0;

        for (let iy = 0; iy <= heightSegments; iy++) {
            const verticesRow: number[] = [];
            const v = iy / heightSegments;
            const theta = thetaStart + v * thetaLength;

            for (let ix = 0; ix <= widthSegments; ix++) {
                const u = ix / widthSegments;
                const phi = phiStart + u * phiLength;

                const x = -radius * Math.cos(phi) * Math.sin(theta);
                const y = radius * Math.cos(theta);
                const z = radius * Math.sin(phi) * Math.sin(theta);

                positions.push(x, y, z);
                const length = Math.hypot(x, y, z) || 1;
                normals.push(x / length, y / length, z / length);
                uvs.push(u, 1 - v);

                verticesRow.push(index++);
            }

            grid.push(verticesRow);
        }

        const thetaEnd = thetaStart + thetaLength;
        const isTopFull = thetaStart <= 0;
        const isBottomFull = thetaEnd >= Math.PI;

        for (let iy = 0; iy < heightSegments; iy++) {
            for (let ix = 0; ix < widthSegments; ix++) {
                const a = grid[iy][ix + 1];
                const b = grid[iy][ix];
                const c = grid[iy + 1][ix];
                const d = grid[iy + 1][ix + 1];

                if (iy !== 0 || !isTopFull) {
                    indices.push(a, b, d);
                }
                if (iy !== heightSegments - 1 || !isBottomFull) {
                    indices.push(b, c, d);
                }
            }
        }

        const typedIndices = positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
        return {
            positions: new Float32Array(positions),
            indices: typedIndices,
            uvs: new Float32Array(uvs),
            normals: new Float32Array(normals),
        };
    }

    private parseBufferGeometry(data: BufferGeometryDataJSON): GeometryArrays {
        let positions: Float32Array = new Float32Array(0);
        let indices: Uint32Array | Uint16Array = new Uint32Array(0);
        let uvs: Float32Array | undefined;
        let uvs2: Float32Array | undefined;
        let normals: Float32Array | undefined;
        // three.js names the second UV set `uv1` (r151 on), `uv2` before.
        const uv2Attribute = data.attributes?.uv1 ?? data.attributes?.uv2;

        if (data.interleavedBuffers && data.arrayBuffers) {
            const buffers: {[uuid: string]: {data: Float32Array; stride: number}} = {};
            for (const [uuid, ibDef] of Object.entries(data.interleavedBuffers)) {
                const arrayBuffer = data.arrayBuffers[ibDef.buffer];
                if (arrayBuffer) {
                    const floatArray = new Float32Array(
                        Array.isArray(arrayBuffer) ? this.int32ArrayToFloat32(arrayBuffer) : arrayBuffer
                    );
                    buffers[uuid] = {data: floatArray, stride: ibDef.stride};
                }
            }

            const readInterleaved = (attr: BufferAttributeJSON | undefined): Float32Array | undefined => {
                const buf =
                    attr?.isInterleavedBufferAttribute && attr.data !== undefined ? buffers[attr.data] : undefined;
                return buf
                    ? this.extractInterleavedAttribute(buf.data, buf.stride, attr?.offset, attr?.itemSize)
                    : undefined;
            };
            positions = readInterleaved(data.attributes?.position) ?? positions;
            uvs = readInterleaved(data.attributes?.uv);
            uvs2 = readInterleaved(uv2Attribute);
            normals = readInterleaved(data.attributes?.normal);
        } else if (data.attributes) {
            if (data.attributes.position?.array) {
                positions = new Float32Array(data.attributes.position.array);
            }
            if (data.attributes.uv?.array) {
                uvs = new Float32Array(data.attributes.uv.array);
            }
            if (uv2Attribute?.array) {
                uvs2 = new Float32Array(uv2Attribute.array);
            }
            if (data.attributes.normal?.array) {
                normals = new Float32Array(data.attributes.normal.array);
            }
        }

        if (data.index) {
            if (data.index.type === 'Uint16Array') {
                indices = new Uint16Array(data.index.array);
            } else {
                indices = new Uint32Array(data.index.array);
            }
        }

        indices = ensureTriangleIndices(positions, indices);

        return {positions, indices, uvs, uvs2, normals};
    }

    private extractInterleavedAttribute(
        buffer: Float32Array,
        stride: number,
        offset: number = 0,
        itemSize: number = 0
    ): Float32Array {
        const count = Math.floor(buffer.length / stride);
        const result = new Float32Array(count * itemSize);
        for (let i = 0; i < count; i++) {
            for (let j = 0; j < itemSize; j++) {
                result[i * itemSize + j] = buffer[i * stride + offset + j];
            }
        }
        return result;
    }

    private int32ArrayToFloat32(intArray: number[]): Float32Array {
        const buffer = new ArrayBuffer(intArray.length * 4);
        const int32View = new Int32Array(buffer);
        for (let i = 0; i < intArray.length; i++) {
            int32View[i] = intArray[i];
        }
        return new Float32Array(buffer);
    }

    private async resolveResourceUrl(url: string, kind: QuarksResourceKind, baseUrl: string): Promise<string> {
        return QuarksLoader.resolveWith(this.options.resolver, url, kind, baseUrl);
    }

    /** Fetches one effect JSON; documents are not fetch-cached because resolve mutates them. */
    private async fetchEffectDocument(url: string, signal?: AbortSignal): Promise<{json: unknown; baseUrl: string}> {
        const baseUrl = this.options.baseUrl || url.substring(0, url.lastIndexOf('/') + 1);
        const resolvedEffect = await this.resolveResourceUrl(url, 'effect', baseUrl);
        const json = await QuarksLoader.fetchJsonWith(this.options.resolver, resolvedEffect, undefined, signal);
        return {json, baseUrl};
    }

    /**
     * Resolve every document's linked resources in parallel (shared urls coalesce via the
     * scene fetch cache), then parse. Each index settles exactly once for `onProgress`.
     */
    private async loadDocuments(
        docs: Array<{json: unknown; baseUrl: string} | null>,
        options: QuarksBatchLoadOptions
    ): Promise<(TransformNode | null)[]> {
        const total = docs.length;
        if (total === 0) {
            return [];
        }
        checkLoad(this.scene, options.signal);
        // Stops the whole batch on abort, and the effects still waiting for textures once one fails.
        const stopAll = new AbortController();
        const abort = () => stopAll.abort(abortReason(options.signal!));
        options.signal?.addEventListener('abort', abort, {once: true});
        try {
            return await this.loadResolvedDocuments(docs, options, stopAll);
        } finally {
            options.signal?.removeEventListener('abort', abort);
        }
    }

    private async loadResolvedDocuments(
        docs: Array<{json: unknown; baseUrl: string} | null>,
        options: QuarksBatchLoadOptions,
        stopAll: AbortController
    ): Promise<(TransformNode | null)[]> {
        const total = docs.length;
        const signal = stopAll.signal;
        const results: (TransformNode | null)[] = new Array(total).fill(null);
        const settled = new Array<boolean>(total).fill(false);
        let done = 0;
        const settle = (index: number, value: TransformNode | null) => {
            if (settled[index] || signal.aborted) {
                return;
            }
            settled[index] = true;
            results[index] = value;
            done++;
            options.onProgress?.(done, total);
        };

        await untilStopped(
            Promise.all(
                docs.map(async (doc, i) => {
                    if (!doc) {
                        return;
                    }
                    try {
                        await this.resolveResources(doc.json, doc.baseUrl);
                    } catch (err) {
                        if (!options.continueOnError) {
                            throw err;
                        }
                        console.warn(`[QuarksLoader] Failed to resolve resources for effect ${i + 1}/${total}:`, err);
                        docs[i] = null;
                        settle(i, null);
                    }
                })
            ),
            this.scene,
            signal
        );

        const loaded: Array<{root: TransformNode; textures: Texture[]}> = [];
        const finishing: Promise<void>[] = [];
        try {
            for (let i = 0; i < total; i++) {
                if (settled[i]) {
                    continue;
                }
                const doc = docs[i];
                if (!doc) {
                    settle(i, null);
                    continue;
                }
                let effect: {root: TransformNode; textures: Texture[]};
                try {
                    // Resolved above, so the base must not be joined a second time.
                    effect = this.parseDocument(doc.json, '');
                } catch (err) {
                    if (!options.continueOnError) {
                        throw err;
                    }
                    console.warn(`[QuarksLoader] Failed to parse effect ${i + 1}/${total}:`, err);
                    settle(i, null);
                    continue;
                }
                loaded.push(effect);
                // An effect counts as loaded once its textures have too, when the loader waits for them.
                finishing.push(this.finishLoad(effect, signal).then(() => settle(i, effect.root)));
            }
            await Promise.all(finishing);
        } catch (err) {
            // One failure, or the load stopped: stop the rest and free every effect already built.
            if (!signal.aborted) {
                stopAll.abort(err);
            }
            void Promise.allSettled(finishing);
            if (!this.scene.isDisposed) {
                loaded.forEach((effect) => disposeEffect(effect.root));
            }
            throw err;
        }
        return results;
    }

    /** Runs `fn` over `items` with at most `concurrency` in flight (or all if unset/≤0). */
    private static async mapPool<T, R>(
        items: T[],
        concurrency: number | undefined,
        fn: (item: T, index: number) => Promise<R>
    ): Promise<R[]> {
        if (items.length === 0) {
            return [];
        }
        const limit = concurrency !== undefined && concurrency > 0 ? concurrency : items.length;
        const results = new Array<R>(items.length);
        let next = 0;

        const worker = async () => {
            while (next < items.length) {
                const index = next++;
                results[index] = await fn(items[index], index);
            }
        };

        const workers = Math.min(limit, items.length);
        await Promise.all(Array.from({length: workers}, () => worker()));
        return results;
    }

    private static async resolveWith(
        resolver: QuarksResourceResolver | undefined,
        url: string,
        kind: QuarksResourceKind,
        baseUrl: string
    ): Promise<string> {
        if (resolver?.resolve) {
            return resolver.resolve(url, kind, baseUrl);
        }
        return QuarksLoader.joinUrl(baseUrl, url);
    }

    /** One in-flight fetch per scene + resolved url when `scene` is set; otherwise uncached. */
    private static fetchJsonWith(
        resolver: QuarksResourceResolver | undefined,
        resolvedUrl: string,
        scene: Scene | undefined,
        signal?: AbortSignal
    ): Promise<unknown> {
        const load = async () => {
            if (resolver?.fetchJson) {
                return signal ? resolver.fetchJson(resolvedUrl, {signal}) : resolver.fetchJson(resolvedUrl);
            }
            // Only an uncached fetch (an effect document) can be cancelled: a cached one is shared.
            const response = await (signal ? fetch(resolvedUrl, {signal}) : fetch(resolvedUrl));
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        };

        if (!scene) {
            return load();
        }

        const cache = sceneMap(sharedFetches, scene);
        const key = `json|${resolvedUrl}`;
        let pending = cache.get(key);
        if (pending === undefined) {
            pending = load().catch((err) => {
                if (cache.get(key) === pending) {
                    cache.delete(key);
                }
                throw err;
            });
            cache.set(key, pending);
        }
        return pending;
    }

    private static async inlineGeometryEntries(
        json: unknown,
        loadGeometry: (url: string) => Promise<unknown>,
        onResourceError: QuarksLoaderOptions['onResourceError'] = QuarksLoader.warnResourceError
    ): Promise<void> {
        await Promise.all(
            documentList(json, 'geometries').map(async (geom) => {
                if (!isRecord(geom) || typeof geom.url !== 'string' || geom.positions) {
                    return;
                }
                const url = geom.url;
                try {
                    const data = await loadGeometry(url);
                    // Copy arrays so a shared fetch-cache document is not aliased across
                    // effects — mutating one effect's inlined geometry must not corrupt others.
                    for (const key of ['positions', 'indices', 'uvs', 'uvs2', 'normals']) {
                        const value = isRecord(data) ? data[key] : undefined;
                        if (value === undefined) {
                            continue;
                        }
                        geom[key] = Array.isArray(value) ? value.slice() : value;
                    }
                    delete geom.url;
                } catch (err) {
                    onResourceError('geometry', url, err);
                }
            })
        );
    }

    private static warnResourceError(kind: QuarksResourceKind, url: string, error: unknown): void {
        console.warn(`[QuarksLoader] Could not load ${kind} "${url}":`, error);
    }

    private reportResourceError(kind: QuarksResourceKind, url: string, error: unknown): void {
        (this.options.onResourceError ?? QuarksLoader.warnResourceError)(kind, url, error);
    }

    private parseImages(images: EffectImageJSON[], baseUrl: string, meta: LoadedMeta): void {
        for (const [index, img] of images.entries()) {
            const url = img.url;
            if (url) {
                readFormatPart(`[${index}]`, () => QuarksLoader.warnIfNotAnImageUrl(url));
            }
            // Urls are usually already absolute after resolveResources; joinUrl is a no-op for
            // data/blob/http(s) and still supports callers that use parse() with a baseUrl only.
            meta.images[img.uuid] = url ? QuarksLoader.joinUrl(baseUrl, url) : null;
            // The url the file wrote, for serializeEffect to write back. An inlined image
            // (`data:`, `blob:`) has no path to write; its texture writes its url.
            const source = sourceImageUrls.get(img) ?? url;
            if (source && !/^(data|blob):/i.test(source)) {
                meta.imageSources[img.uuid] = source;
            }
        }
    }

    /**
     * Flags an image entry that is plainly not an image, which otherwise only
     * shows up as a texture that silently fails to load.
     *
     * The case worth naming: an exporter that could not embed a texture falls
     * back to writing the source asset's path, and a Unity built-in texture
     * reports a virtual path such as `Resources/unity_builtin_extra` that no
     * file backs.
     */
    private static warnIfNotAnImageUrl(url: string): void {
        if (/^(data|blob):/i.test(url) || /\.(png|jpe?g|webp|gif|bmp|ktx2?|dds|env|basis)(\?|#|$)/i.test(url)) {
            return;
        }
        warnFormat(
            `Image "${url}" does not look like an image; its texture will fail to load. ` +
                'This usually means the effect was exported without embedding that texture.'
        );
    }

    private parseTextures(textures: QuarksTextureJSON[], meta: LoadedMeta): void {
        for (const texDef of textures) {
            const imageUrl = texDef.image !== undefined ? meta.images[texDef.image] : undefined;
            if (imageUrl) {
                const invertY = texDef.invertY !== undefined ? !!texDef.invertY : true;
                const noMipmap = !!texDef.noMipmap;
                // Everything below that ends up on the Texture object is part of the key, so a
                // shared texture always looks the way each of its effects asked for.
                const share = this.options.shareResources !== false;
                const key = share
                    ? [
                          invertY,
                          noMipmap,
                          texDef.samplingMode,
                          texDef.wrap,
                          texDef.repeat,
                          texDef.offset,
                          texDef.rotation,
                      ].join('|') +
                      '|' +
                      imageUrl
                    : '';
                const cache = share ? sceneMap(sharedTextures, this.scene) : undefined;
                const cached = cache?.get(key);
                if (cached !== undefined) {
                    meta.textures[texDef.uuid] = cached;
                    continue;
                }
                let settle!: () => void;
                const settled = new Promise<void>((resolve) => (settle = resolve));
                let failed = false;
                // Babylon calls onError from inside the constructor, before `texture` is assigned, and
                // then throws, when the engine cannot make the texture at all.
                let texture: Texture | undefined = undefined;
                const options: ITextureCreationOptions = {
                    noMipmap,
                    invertY,
                    samplingMode: typeof texDef.samplingMode === 'number' ? texDef.samplingMode : undefined,
                    onLoad: () => settle(),
                    onError: (message, exception) => {
                        failed = true;
                        // A later load tries the image again rather than reuse the failed texture.
                        if (cache !== undefined && cache.get(key) === texture) {
                            cache.delete(key);
                        }
                        this.reportResourceError('image', imageUrl, exception ?? message);
                        settle();
                    },
                };
                try {
                    texture = new Texture(imageUrl, this.scene, options);
                } catch {
                    // Reported through onError: the effect draws without this texture.
                    meta.textures[texDef.uuid] = null;
                    continue;
                }
                textureSettled.set(texture, settled);
                const source = texDef.image !== undefined ? meta.imageSources[texDef.image] : undefined;
                if (source !== undefined) {
                    setTextureSourceUrl(texture, source, imageUrl);
                }
                // A texture disposed before it loads never will.
                texture.onDisposeObservable.addOnce(() => settle());
                if (Array.isArray(texDef.wrap)) {
                    texture.wrapU = this.mapWrapMode(texDef.wrap[0]);
                    texture.wrapV = this.mapWrapMode(texDef.wrap[1] ?? texDef.wrap[0]);
                }
                if (Array.isArray(texDef.repeat)) {
                    texture.uScale = texDef.repeat[0] ?? 1;
                    texture.vScale = texDef.repeat[1] ?? 1;
                }
                if (Array.isArray(texDef.offset)) {
                    texture.uOffset = texDef.offset[0] ?? 0;
                    texture.vOffset = texDef.offset[1] ?? 0;
                }
                if (typeof texDef.rotation === 'number') {
                    texture.wAng = texDef.rotation;
                }
                if (cache !== undefined && !failed) {
                    cache.set(key, texture);
                    // Something outside the library may dispose it; never hand out a dead texture.
                    texture.onDisposeObservable.addOnce(() => {
                        if (cache.get(key) === texture) {
                            cache.delete(key);
                        }
                    });
                }
                meta.textures[texDef.uuid] = texture;
            } else {
                meta.textures[texDef.uuid] = null;
            }
        }
    }

    private mapWrapMode(wrapMode?: number): number {
        switch (wrapMode) {
            case 1001: // ClampToEdgeWrapping (three.js)
                return Texture.CLAMP_ADDRESSMODE;
            case 1002: // MirroredRepeatWrapping (three.js)
                return Texture.MIRROR_ADDRESSMODE;
            case 1000: // RepeatWrapping (three.js)
            default:
                return Texture.WRAP_ADDRESSMODE;
        }
    }

    private parseMaterials(materials: QuarksMaterialJSON[], meta: LoadedMeta): void {
        // A file names a texture by uuid; anything else in a slot is no texture.
        const texture = (ref: MaterialTextureRef | undefined): Texture | null =>
            typeof ref === 'string' ? meta.textures[ref] || null : null;
        for (const matDef of materials) {
            const matInfo: QuarksMaterialJSON = {
                uuid: matDef.uuid,
                transparent: matDef.transparent ?? true,
                blending: matDef.blending ?? 1,
                side: matDef.side ?? 2,
                depthTest: matDef.depthTest ?? true,
                depthWrite: matDef.depthWrite ?? false,
                alphaTest: matDef.alphaTest ?? 0,
                texture: null,
            };

            // three.js MeshBasicMaterial uses `map`; QuarksMaterial (what ParticleSystem.toJSON
            // emits) uses `texture`. Accept both so library-exported effects round-trip.
            const textureRef = matDef.map ?? matDef.texture;
            if (textureRef) {
                matInfo.texture = texture(textureRef);
            }

            const reflectionAtlasRef = matDef.reflectionAtlas;
            if (reflectionAtlasRef) {
                matInfo.reflectionAtlas = texture(reflectionAtlasRef);
            }
            if (typeof matDef.reflectionLevel === 'number') {
                matInfo.reflectionLevel = matDef.reflectionLevel;
            }
            // Mesh particle lighting (QuarksMaterial): 'unlit' | 'fixed' | 'scene'.
            if (matDef.lighting === 'unlit' || matDef.lighting === 'fixed' || matDef.lighting === 'scene') {
                matInfo.lighting = matDef.lighting;
            }
            // Mesh particle rim (QuarksMaterial): {color, power, strength, mode}.
            if (matDef.rim && typeof matDef.rim === 'object') {
                matInfo.rim = matDef.rim;
            }
            // Texture effects (QuarksMaterial): mapUV {channel, tiling, offset, scroll},
            // gradientMap {ramp (texture uuid), channel},
            // erosion {mask (texture uuid), maskUV {channel, tiling, offset, scroll}, softness, edgeWidth,
            // edgeColor}.
            if (matDef.mapUV && typeof matDef.mapUV === 'object') {
                matInfo.mapUV = matDef.mapUV;
            }
            if (matDef.gradientMap && typeof matDef.gradientMap === 'object') {
                matInfo.gradientMap = {
                    ...matDef.gradientMap,
                    ramp: texture(matDef.gradientMap.ramp),
                };
            }
            if (matDef.erosion && typeof matDef.erosion === 'object') {
                matInfo.erosion = {
                    ...matDef.erosion,
                    mask: texture(matDef.erosion.mask),
                };
            }
            // uvDistortion {map (texture uuid), mapUV {channel, tiling, offset, scroll}, strength}.
            if (matDef.uvDistortion && typeof matDef.uvDistortion === 'object') {
                matInfo.uvDistortion = {
                    ...matDef.uvDistortion,
                    map: texture(matDef.uvDistortion.map),
                };
            }

            // QuarksMaterial (what `materialMeta` in system/serialization.ts writes) writes `alphaMode`
            // directly as a Babylon alpha-mode constant; three.js materials (MeshBasicMaterial
            // etc.) instead use `blending` with three.js's own 1..4 numbering, which does NOT
            // line up with Babylon's constants (e.g. three.js Additive=2 vs Babylon ALPHA_ADD=1)
            // — only convert through the table when there's no native alphaMode to trust.
            if (typeof matDef.alphaMode === 'number') {
                matInfo.alphaMode = matDef.alphaMode;
            } else {
                const blendingToAlphaMode: {[key: number]: number} = {
                    1: Constants.ALPHA_COMBINE,
                    2: Constants.ALPHA_ADD,
                    3: Constants.ALPHA_SUBTRACT,
                    4: Constants.ALPHA_MULTIPLY,
                };
                matInfo.alphaMode = blendingToAlphaMode[matDef.blending ?? 1] || Constants.ALPHA_COMBINE;
            }

            meta.materials[matDef.uuid] = matInfo;
        }
    }

    private getGeometry(meta: LoadedMeta, geometryId: string | undefined): GeometryArrays | undefined {
        if (!geometryId) return undefined;
        return meta.geometries[geometryId];
    }

    private getMaterial(meta: LoadedMeta, materialId: string | string[] | undefined): QuarksMaterialJSON | undefined {
        if (!materialId) return undefined;
        const selectedId = Array.isArray(materialId) ? materialId[0] : materialId;
        return meta.materials[selectedId];
    }

    private createPlaceholderNode(type: string, name?: string): TransformNode {
        const node = new TransformNode(name || type || 'node', this.scene);
        // The three.js type the node stood for, which babylon.quarks has no node for.
        Object.assign(node, {quarksOriginalType: type});
        return node;
    }

    private createMeshNode(data: QuarksNodeJSON, meta: LoadedMeta): Mesh {
        const mesh = new Mesh(data.name || data.type || 'mesh', this.scene);
        const geometry = this.getGeometry(meta, data.geometry);
        if (geometry && geometry.positions.length > 0 && geometry.indices.length > 0) {
            const vertexData = new VertexData();
            vertexData.positions = geometry.positions;
            vertexData.indices = geometry.indices;
            if (geometry.uvs && geometry.uvs.length > 0) {
                vertexData.uvs = geometry.uvs;
            }
            if (geometry.uvs2 && geometry.uvs2.length > 0) {
                vertexData.uvs2 = geometry.uvs2;
            }
            if (geometry.normals && geometry.normals.length > 0) {
                vertexData.normals = geometry.normals;
            }
            vertexData.applyToMesh(mesh, true);
        }

        const materialInfo = this.getMaterial(meta, data.material);
        if (materialInfo) {
            const material = new StandardMaterial(`quarks_loader_material_${materialInfo.uuid}`, this.scene);
            meta.ownedMaterials.push(material);
            material.alphaMode = materialInfo.alphaMode ?? Constants.ALPHA_COMBINE;
            material.backFaceCulling = materialInfo.side !== 2;
            material.alphaCutOff = materialInfo.alphaTest ?? 0;
            material.disableDepthWrite = !(materialInfo.depthWrite ?? false);
            const texture = materialInfo.texture;
            if (texture && typeof texture !== 'string') {
                material.diffuseTexture = texture;
                material.opacityTexture = texture;
            }
            mesh.material = material;
        }
        return mesh;
    }

    private parseObject(data: QuarksNodeJSON, meta: LoadedMeta): TransformNode {
        let node: TransformNode;
        switch (data.type) {
            case 'QuarksPrefab':
                node = QuarksPrefab.fromJSON(data, this.scene);
                break;
            case 'ParticleEmitter':
                if (data.ps) {
                    const psJSON = data.ps;
                    const ps = readFormatPart('ps', () => this.parseParticleSystem(psJSON, meta));
                    node = ps.emitter;
                    break;
                }
                node = this.createPlaceholderNode(data.type, data.name);
                break;
            case 'Mesh':
            case 'SkinnedMesh':
            case 'InstancedMesh':
            case 'BatchedMesh':
                node = this.createMeshNode(data, meta);
                break;
            case 'Scene':
            case 'Group':
            case 'Object3D':
            case 'PerspectiveCamera':
            case 'OrthographicCamera':
            case 'AmbientLight':
            case 'DirectionalLight':
            case 'PointLight':
            case 'RectAreaLight':
            case 'SpotLight':
            case 'HemisphereLight':
            case 'LightProbe':
            case 'LOD':
            case 'Line':
            case 'LineSegments':
            case 'LineLoop':
            case 'PointCloud':
            case 'Points':
            case 'Sprite':
            case 'Bone':
                node = this.createPlaceholderNode(data.type, data.name);
                break;
            default:
                node = new TransformNode(data.name || data.type || 'node', this.scene);
        }

        if (data.uuid) setQuarksNodeId(node, data.uuid);
        if (data.name) node.name = data.name;

        if (data.matrix) {
            const matrix = Matrix.FromArray(data.matrix);
            const scaling = new Vector3(1, 1, 1);
            const rotation = Quaternion.Identity();
            const translation = new Vector3(0, 0, 0);
            matrix.decompose(scaling, rotation, translation);
            node.position.copyFrom(translation);
            node.scaling.copyFrom(scaling);
            node.rotationQuaternion = rotation;
        } else {
            if (data.position) node.position.set(data.position[0], data.position[1], data.position[2]);
            if (data.scale) node.scaling.set(data.scale[0], data.scale[1], data.scale[2]);
            if (data.quaternion) {
                node.rotationQuaternion = new Quaternion(
                    data.quaternion[0],
                    data.quaternion[1],
                    data.quaternion[2],
                    data.quaternion[3]
                );
            } else if (data.rotation) {
                node.rotation.set(data.rotation[0], data.rotation[1], data.rotation[2]);
            }
        }

        if (data.visible !== undefined) node.setEnabled(data.visible);
        if (data.isVisible === false && node instanceof Mesh) node.isVisible = false;

        if (data.children) {
            const children: unknown = data.children;
            if (!Array.isArray(children)) {
                readFormatPart('children', () => warnFormat('"children" is not a list; the node loads without them.'));
            } else {
                children.forEach((childData: unknown, index) => {
                    const child = readFormatPart(`children[${index}]`, () =>
                        isNodeJSON(childData)
                            ? this.parseObject(childData, meta)
                            : warnFormat('A child is not an object; it is skipped.')
                    );
                    if (child) child.parent = node;
                });
            }
        }

        return node;
    }

    private parseParticleSystem(json: ParticleSystemJSONParameters, meta: LoadedMeta): ParticleSystem {
        if (meta.format < 2 && json !== null && typeof json === 'object' && json.scalingMode !== 'hierarchy') {
            // Before format 2 the emitter's whole world scale reached every system's shape and
            // particle size, and a local-space system's motion too: 'hierarchy' is the mode that
            // keeps such an effect's look. 'local' became the default with Unity's meaning.
            json = {...json, scalingMode: 'hierarchy'};
        }
        const dependencies: {[uuid: string]: Behavior} = {};
        const ps = ParticleSystem.fromJSON(json, meta, dependencies, this.scene);
        if (json?.shape?.type === 'mesh_surface' && typeof json.shape.mesh === 'string') {
            meshSurfaceLinks.set(ps, json.shape.mesh);
        }
        systemPaths.set(ps, currentFormatPath());
        return ps;
    }

    private linkReferences(root: TransformNode): void {
        const nodesMap: {[uuid: string]: TransformNode} = {};

        const traverse = (node: TransformNode) => {
            const fileId = fileNodeId(node);
            if (fileId) {
                nodesMap[fileId] = node;
            }
            for (const child of node.getChildren()) {
                if (child instanceof TransformNode) {
                    traverse(child);
                }
            }
        };
        traverse(root);

        const linkNode = (node: TransformNode) => {
            if (node instanceof QuarksPrefab) {
                node.resolveReferences(root);
            }
            if (node instanceof ParticleEmitter) {
                const system = node.system as ParticleSystem;
                // Links are made once the whole effect is read; a warning names the system's path.
                const path = systemPaths.get(system);
                const warnAtSystem = (message: string) =>
                    path ? readFormatPart(path, () => warnFormat(message)) : warnFormat(message);
                const meshSurfaceUUID = meshSurfaceLinks.get(system);
                const shape = system.emitterShape;
                if (meshSurfaceUUID && shape instanceof MeshSurfaceEmitter) {
                    const targetNode = nodesMap[meshSurfaceUUID];
                    if (targetNode instanceof Mesh) {
                        shape.mesh = targetNode;
                    } else {
                        warnAtSystem(
                            `Emitter "${node.name}" has a mesh surface shape on "${meshSurfaceUUID}", ` +
                                (targetNode ? 'which is not a mesh' : 'which is not in the effect') +
                                '; it emits nothing until a mesh is set.'
                        );
                    }
                }
                for (let i = 0; i < system.behaviors.length; i++) {
                    if (system.behaviors[i] instanceof EmitSubParticleSystem) {
                        const subEmitter = system.behaviors[i] as EmitSubParticleSystem;
                        const targetUUID = subEmitter.subParticleSystem;
                        if (typeof targetUUID !== 'string') {
                            continue;
                        }
                        const resolved = nodesMap[targetUUID];
                        if (resolved instanceof ParticleEmitter) {
                            subEmitter.subParticleSystem = resolved;
                            (resolved.system as ParticleSystem).onlyUsedByOther = true;
                        } else {
                            // An export that dropped the target emitter, or kept only
                            // some emitters of a prefab: emit nothing rather than leave
                            // a string the behavior would treat as an emitter.
                            subEmitter.subParticleSystem = undefined;
                            if (targetUUID !== '') {
                                warnAtSystem(
                                    `Emitter "${node.name}" has a sub emitter targeting "${targetUUID}", ` +
                                        (resolved ? 'which is not a particle emitter' : 'which is not in the effect') +
                                        '; that sub emitter is skipped.'
                                );
                            }
                        }
                    }
                }
            }
            for (const child of node.getChildren()) {
                if (child instanceof TransformNode) {
                    linkNode(child);
                }
            }
        };
        linkNode(root);
    }
}
