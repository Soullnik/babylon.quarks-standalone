import {Constants} from '@babylonjs/core/Engines/constants';
import type {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import type {Scene} from '@babylonjs/core/scene';
import {
    BehaviorToJSON,
    ConstantValue,
    EmitterFromJSON,
    EmitterToJSON,
    readFormatPart,
    RendererEmitterSettings,
    StretchedBillBoardSettings,
    TrailSettings,
    ValueGeneratorFromJSON,
    Vector3ArrayJSON,
    Vector3Like,
    warnFormat,
} from 'quarks.core';
import type {MaterialTextureRef} from '../effectDocumentJSON';
import type {ParticleSystem} from '../ParticleSystem';
import {
    trailCurveTension,
    trailLifetime,
    trailMinVertexDistance,
    trailTessellation,
    trailTextureMode,
    trailTextureScale,
    type TrailOptions,
} from '../trailSettings';
import {
    EROSION_DEFAULT_SOFTNESS,
    RenderMode,
    textureUVToJSON,
    UV_DISTORTION_DEFAULT_STRENGTH,
    UV_DISTORTION_DEFAULT_UV,
} from '../VFXBatch';
import {resolveGeometryData} from './geometry';
import type {ParticleMaterialSource} from './materialResolve';
import {settingsFromJSON, settingsToJSON} from './settingsSchema';
import type {
    BabylonMetaData,
    ParticleSystemJSONParameters,
    ParticleSystemParameters,
    RendererEmitterSettingsJSON,
    TrailSettingsJSON,
} from './types';

// Reading and writing a ParticleSystem's JSON. The class's toJSON and fromJSON call these.

/** Per document being written: the last id handed out, and the geometries and textures written. */
const serializationCounters = new WeakMap<object, number>();
const serializedGeometries = new WeakMap<object, Array<{arrays: unknown[]; uuid: string}>>();
const serializedTextures = new WeakMap<object, Map<BaseTexture, string>>();

/**
 * The next id for an entry of `meta`. Counted per document, so serialising the same effect
 * twice writes the same ids.
 */
function nextSerializationId(meta: BabylonMetaData, prefix: string): string {
    const id = (serializationCounters.get(meta) ?? 0) + 1;
    serializationCounters.set(meta, id);
    return `${prefix}_${id}`;
}

/** The optional trail flags that are switched on, so JSON and clones only carry the ones in use. */
export function trailFlags(settings: Partial<TrailOptions> | undefined): Partial<TrailOptions> {
    const flags: Partial<TrailOptions> = {};
    if (settings?.uvFromHead) flags.uvFromHead = true;
    if (settings?.colorFromParticle) flags.colorFromParticle = true;
    if (settings?.dieWithParticle) flags.dieWithParticle = true;
    if (settings?.recordWorldSpace) flags.recordWorldSpace = true;
    return flags;
}

/** A trail's tessellation and curve tension, normalised, each only when it differs from the default. */
export function trailCurve(settings: Partial<TrailOptions> | undefined): Partial<TrailOptions> {
    const curve: Partial<TrailOptions> = {};
    const tessellation = trailTessellation(settings);
    const curveTension = trailCurveTension(settings);
    if (tessellation > 0) curve.tessellation = tessellation;
    if (curveTension > 0) curve.curveTension = curveTension;
    return curve;
}

/**
 * A trail's texture mode and scale, minimum vertex distance and lifetime, normalised, each only
 * when it differs from the default.
 */
export function trailSampling(settings: Partial<TrailOptions> | undefined): Partial<TrailOptions> {
    const out: Partial<TrailOptions> = {};
    const textureMode = trailTextureMode(settings);
    const textureScale = trailTextureScale(settings);
    const minVertexDistance = trailMinVertexDistance(settings);
    const lifetime = trailLifetime(settings);
    if (textureMode !== 'stretch') out.textureMode = textureMode;
    if (textureScale !== 1) out.textureScale = textureScale;
    if (minVertexDistance > 0) out.minVertexDistance = minVertexDistance;
    if (lifetime !== Infinity) out.lifetime = lifetime;
    return out;
}

/** A trail's `followLocalOrigin`, only when on: off is the default. */
export function trailFollowLocalOrigin(settings: Partial<TrailOptions> | undefined): Partial<TrailOptions> {
    return settings?.followLocalOrigin ? {followLocalOrigin: true} : {};
}

/** A trail's side axis as JSON `[x, y, z]`, or nothing when unset. */
function trailSideAxisJSON(settings: TrailSettings | undefined): {sideAxis?: Vector3ArrayJSON} {
    const axis = settings?.sideAxis;
    return axis ? {sideAxis: [axis.x, axis.y, axis.z]} : {};
}

/**
 * A trail's side axis from JSON `[x, y, z]` (or an object with x, y, z), or nothing: an axis
 * that is not three finite numbers, or has no length, cannot sweep a ribbon and is dropped with
 * a warning, so the trail faces the camera instead of vanishing.
 */
function trailSideAxisFromJSON(value: unknown): {sideAxis?: Vector3Like} {
    if (value === undefined || value === null) {
        return {};
    }
    let x: unknown;
    let y: unknown;
    let z: unknown;
    if (Array.isArray(value)) {
        [x, y, z] = value;
    } else if (typeof value === 'object') {
        ({x, y, z} = value as {x?: unknown; y?: unknown; z?: unknown});
    }
    // A number, or a numeric string, as an older file could hold.
    const component = (v: unknown): number =>
        typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    const [nx, ny, nz] = [component(x), component(y), component(z)];
    if (Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz) && nx * nx + ny * ny + nz * nz > 0) {
        return {sideAxis: {x: nx, y: ny, z: nz}};
    }
    warnFormat(`sideAxis ${JSON.stringify(value)} is not a direction and is ignored`);
    return {};
}

/** {@link ParticleSystem.toJSON}: the system's settings, its geometry, material and textures written into the document's meta. */
export function particleSystemToJSON(
    system: ParticleSystem,
    metaData?: BabylonMetaData | string
): ParticleSystemJSONParameters {
    const isRootObject = metaData === undefined || typeof metaData === 'string';
    const meta: BabylonMetaData = isRootObject
        ? {
              geometries: {},
              materials: {},
              textures: {},
              images: {},
              shapes: {},
              skeletons: {},
              animations: {},
              nodes: {},
          }
        : metaData;

    const geometryUUID = geometryMeta(system, meta);
    const materialUUID = materialMeta(system, meta);
    const rendererSettingsJSON = rendererEmitterSettingsJSON(system);

    // Only what differs from the defaults the constructor and fromJSON give a setting left out,
    // within the shape and each behavior too (see docs/FORMAT.md). The shape and the geometry and
    // material references are always written.
    return {
        shape: EmitterToJSON(system.emitterShape),
        ...settingsToJSON(system),
        instancingGeometry: geometryUUID,
        ...(rendererSettingsJSON ? {rendererEmitterSettings: rendererSettingsJSON} : {}),
        material: materialUUID,
        ...(system.behaviors.length > 0 ? {behaviors: system.behaviors.map((b) => BehaviorToJSON(b, system))} : {}),
    };
}

/**
 * The constructor parameters {@link ParticleSystem.fromJSON} builds a system from: a setting the file
 * leaves out takes the constructor's default, and geometry, material and texture uuids are resolved
 * through `meta`. Behaviors are read by `fromJSON` itself, since they need the system.
 */
export function particleSystemParametersFromJSON(
    json: ParticleSystemJSONParameters,
    meta: BabylonMetaData,
    scene?: Scene
): ParticleSystemParameters {
    // A part the file leaves out takes the constructor's default, as a system made in code does.
    const shape = json.shape ? readFormatPart('shape', () => EmitterFromJSON(json.shape!, meta)) : undefined;
    let rendererEmitterSettings: RendererEmitterSettings;
    if (json.renderMode === RenderMode.Trail) {
        const trailSettings = json.rendererEmitterSettings as TrailSettingsJSON | undefined;
        rendererEmitterSettings = {
            startLength:
                trailSettings?.startLength !== undefined
                    ? ValueGeneratorFromJSON(trailSettings.startLength)
                    : new ConstantValue(30),
            followLocalOrigin: Boolean(trailSettings?.followLocalOrigin),
            ...trailFlags(trailSettings),
            ...trailCurve(trailSettings),
            ...trailSampling(trailSettings),
            ...trailSideAxisFromJSON(trailSettings?.sideAxis),
        };
    } else if (json.renderMode === RenderMode.StretchedBillBoard) {
        // The render mode says which settings the file holds.
        const stretched: Partial<StretchedBillBoardSettings> = {
            ...(json.rendererEmitterSettings as StretchedBillBoardSettings | undefined),
        };
        if (json.speedFactor !== undefined) {
            stretched.speedFactor = json.speedFactor;
        }
        rendererEmitterSettings = stretched;
    } else {
        rendererEmitterSettings = {};
    }

    const materialMeta = json.material ? meta.materials?.[json.material] : undefined;
    // Texture slots reference textures by uuid in a serialised meta, or hold them once a loader resolved them.
    const resolveTexture = (ref: MaterialTextureRef | undefined): BaseTexture | null =>
        typeof ref === 'string' ? (meta.textures?.[ref] ?? null) : (ref ?? null);
    const mainTexture = resolveTexture(materialMeta?.texture ?? json.texture);
    // Particles sample a 2D texture.
    const texture = mainTexture instanceof Texture ? mainTexture : null;
    const material: ParticleMaterialSource | undefined =
        materialMeta?.sourceMaterial ??
        (materialMeta ? {...materialMeta, reflectionAtlas: resolveTexture(materialMeta.reflectionAtlas)} : undefined);
    const erosionMeta = materialMeta?.erosion;
    const gradientMeta = materialMeta?.gradientMap;
    const distortionMeta = materialMeta?.uvDistortion;
    const resolvedGeometryEntry =
        typeof json.instancingGeometry === 'string'
            ? meta.geometries?.[json.instancingGeometry]
            : json.instancingGeometry;
    const resolvedGeometry = resolveGeometryData(resolvedGeometryEntry);

    const settings = settingsFromJSON(json);
    return {
        ...settings,
        scene,
        shape,
        instancingGeometry: resolvedGeometry.positions,
        instancingIndices: resolvedGeometry.indices,
        instancingUVs: resolvedGeometry.uvs,
        instancingUVs2: resolvedGeometry.uvs2,
        instancingNormals: resolvedGeometry.normals,
        rendererEmitterSettings,
        texture,
        material,
        // The material entry wins over the system's own fields, which older files wrote too.
        blendMode: materialMeta?.alphaMode ?? settings.blendMode ?? Constants.ALPHA_ADD,
        transparent: materialMeta?.transparent ?? settings.transparent ?? true,
        depthTest: materialMeta?.depthTest ?? settings.depthTest ?? true,
        depthWrite: materialMeta?.depthWrite ?? settings.depthWrite ?? false,
        alphaTest: materialMeta?.alphaTest ?? settings.alphaTest ?? 0,
        behaviors: [],
        lighting: materialMeta?.lighting,
        rim: materialMeta?.rim,
        mapUV: materialMeta?.mapUV,
        gradientMap:
            gradientMeta && typeof gradientMeta === 'object'
                ? {...gradientMeta, ramp: resolveTexture(gradientMeta.ramp)}
                : undefined,
        erosion:
            erosionMeta && typeof erosionMeta === 'object'
                ? {...erosionMeta, mask: resolveTexture(erosionMeta.mask)}
                : undefined,
        uvDistortion:
            distortionMeta && typeof distortionMeta === 'object'
                ? {...distortionMeta, map: resolveTexture(distortionMeta.map)}
                : undefined,
    };
}

/** The render mode's own settings as JSON: a trail's or a stretched billboard's, else none. */
function rendererEmitterSettingsJSON(system: ParticleSystem): RendererEmitterSettingsJSON | undefined {
    if (system.renderMode === RenderMode.Trail) {
        const settings = system.rendererEmitterSettings as TrailSettings;
        // `startLength` always, for loaders that read it without a default; the rest only when on.
        return {
            startLength: settings.startLength.toJSON(),
            ...trailFollowLocalOrigin(settings),
            ...trailFlags(settings),
            ...trailCurve(settings),
            ...trailSampling(settings),
            ...trailSideAxisJSON(settings),
        };
    }
    if (system.renderMode === RenderMode.StretchedBillBoard) {
        return {
            speedFactor: (system.rendererEmitterSettings as StretchedBillBoardSettings).speedFactor,
            lengthFactor: (system.rendererEmitterSettings as StretchedBillBoardSettings).lengthFactor,
        };
    }
    return undefined;
}

/** Writes the system's geometry into `meta` once per document, and returns its uuid. */
function geometryMeta(system: ParticleSystem, meta: BabylonMetaData): string {
    // Systems that share geometry arrays (the default quad, a loaded mesh) share one entry.
    const rs = system.rendererSettings;
    const arrays = [
        rs.instancingGeometry,
        rs.instancingIndices,
        rs.instancingUVs,
        rs.instancingUVs2,
        rs.instancingNormals,
    ];
    let written = serializedGeometries.get(meta);
    if (written === undefined) {
        written = [];
        serializedGeometries.set(meta, written);
    }
    const same = written.find((entry) => entry.arrays.every((array, i) => array === arrays[i]));
    if (same !== undefined) {
        return same.uuid;
    }
    const geometryUUID = nextSerializationId(meta, 'quarks_geometry');
    written.push({arrays, uuid: geometryUUID});
    meta.geometries[geometryUUID] = {
        uuid: geometryUUID,
        type: 'QuarksGeometry',
        positions: Array.from(system.rendererSettings.instancingGeometry),
        indices: Array.from(system.rendererSettings.instancingIndices),
        uvs: system.rendererSettings.instancingUVs ? Array.from(system.rendererSettings.instancingUVs) : undefined,
        ...(system.rendererSettings.instancingUVs2 ? {uvs2: Array.from(system.rendererSettings.instancingUVs2)} : {}),
        normals: system.rendererSettings.instancingNormals
            ? Array.from(system.rendererSettings.instancingNormals)
            : undefined,
    };
    return geometryUUID;
}

/** Writes the system's material, and each texture it uses once per document, into `meta`; returns the material's uuid. */
function materialMeta(system: ParticleSystem, meta: BabylonMetaData): string {
    // One entry per texture in a document, however many systems and slots use it.
    let written = serializedTextures.get(meta);
    if (written === undefined) {
        written = new Map();
        serializedTextures.set(meta, written);
    }
    const textures = written;
    const textureRef = (
        value: BaseTexture | null | undefined,
        anyKind = false,
        slot = 'texture'
    ): string | undefined => {
        if (!(value instanceof Texture) && !(anyKind && value)) {
            if (value) {
                // A RawTexture or a render target has no url a file can point at, so the slot is left
                // out; silently, the effect would just lose it on reload.
                console.warn(`[quarks] ${slot} is not a url-backed Texture and is not written to the file`);
            }
            return undefined;
        }
        let uuid = textures.get(value);
        if (uuid === undefined) {
            uuid = nextSerializationId(meta, 'quarks_texture');
            textures.set(value, uuid);
            meta.textures[uuid] = value;
        }
        return uuid;
    };
    const textureUUID = textureRef(system.rendererSettings.texture, true);
    const reflectionAtlasUUID = textureRef(system.rendererSettings.reflectionAtlas);
    const erosion = system.erosion;
    const distortion = system.uvDistortion;
    const gradientMap = system.gradientMap;
    const optional = <T>(key: string, value: T | undefined) => (value !== undefined ? {[key]: value} : {});

    const materialUUID = nextSerializationId(meta, 'quarks_material');
    meta.materials[materialUUID] = {
        uuid: materialUUID,
        type: 'QuarksMaterial',
        transparent: system.rendererSettings.materialTransparent,
        alphaMode: system.rendererSettings.materialBlendMode,
        depthTest: system.rendererSettings.materialDepthTest,
        depthWrite: system.rendererSettings.materialDepthWrite,
        alphaTest: system.rendererSettings.materialAlphaTest,
        texture: textureUUID,
        reflectionAtlas: reflectionAtlasUUID,
        reflectionLevel: system.rendererSettings.reflectionLevel,
        // Written only when not the default, so existing effects serialise as before.
        ...(system.lighting !== 'fixed' ? {lighting: system.lighting} : {}),
        ...(system.rim ? {rim: {...system.rim, color: [...system.rim.color]}} : {}),
        ...optional('mapUV', system.mapUV ? textureUVToJSON(system.mapUV) : undefined),
        ...(gradientMap
            ? {
                  gradientMap: {
                      ramp: textureRef(gradientMap.ramp, false, 'gradientMap.ramp'),
                      ...(gradientMap.channel !== 'r' ? {channel: gradientMap.channel} : {}),
                  },
              }
            : {}),
        ...(erosion
            ? {
                  erosion: {
                      ...optional('mask', textureRef(erosion.mask, false, 'erosion.mask')),
                      ...optional('maskUV', textureUVToJSON(erosion.maskUV)),
                      // Written only when not the default, like every other setting.
                      ...(erosion.softness !== EROSION_DEFAULT_SOFTNESS ? {softness: erosion.softness} : {}),
                      ...(erosion.edgeWidth !== 0 ? {edgeWidth: erosion.edgeWidth} : {}),
                      ...(erosion.edgeColor.some((c) => c !== 1) ? {edgeColor: [...erosion.edgeColor]} : {}),
                  },
              }
            : {}),
        ...(distortion
            ? {
                  uvDistortion: {
                      map: textureRef(distortion.map, false, 'uvDistortion.map'),
                      ...optional('mapUV', textureUVToJSON(distortion.mapUV, UV_DISTORTION_DEFAULT_UV)),
                      ...(distortion.strength !== UV_DISTORTION_DEFAULT_STRENGTH
                          ? {strength: distortion.strength}
                          : {}),
                  },
              }
            : {}),
        sourceMaterial: system.material ?? undefined,
    };
    return materialUUID;
}
