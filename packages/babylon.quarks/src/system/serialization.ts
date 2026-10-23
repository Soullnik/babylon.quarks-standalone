import {Constants} from '@babylonjs/core/Engines/constants';
import type {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import type {Scene} from '@babylonjs/core/scene';
import {
    ConstantValue,
    EmitterFromJSON,
    RendererEmitterSettings,
    StretchedBillBoardSettings,
    TrailSettings,
    ValueGeneratorFromJSON,
    Vector3,
} from 'quarks.core';
import type {ParticleSystem} from '../ParticleSystem';
import {trailCurveTension, trailTessellation} from '../trailCurve';
import {
    EROSION_DEFAULT_SOFTNESS,
    RenderMode,
    textureUVToJSON,
    UV_DISTORTION_DEFAULT_STRENGTH,
    UV_DISTORTION_DEFAULT_UV,
} from '../VFXBatch';
import {resolveGeometryData} from './geometry';
import {settingsFromJSON, settingsToJSON} from './settingsSchema';
import type {BabylonMetaData, ParticleSystemJSONParameters, ParticleSystemParameters} from './types';

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
export function trailFlags(settings: TrailSettings | undefined): Partial<TrailSettings> {
    const flags: Partial<TrailSettings> = {};
    if (settings?.uvFromHead) flags.uvFromHead = true;
    if (settings?.colorFromParticle) flags.colorFromParticle = true;
    if (settings?.dieWithParticle) flags.dieWithParticle = true;
    if (settings?.recordWorldSpace) flags.recordWorldSpace = true;
    return flags;
}

/** A trail's tessellation and curve tension, normalised, each only when it differs from the default. */
export function trailCurve(settings: TrailSettings | undefined): Partial<TrailSettings> {
    const curve: Partial<TrailSettings> = {};
    const tessellation = trailTessellation(settings);
    const curveTension = trailCurveTension(settings);
    if (tessellation > 0) curve.tessellation = tessellation;
    if (curveTension > 0) curve.curveTension = curveTension;
    return curve;
}

/** A trail's side axis as JSON `[x, y, z]`, or nothing when unset. */
function trailSideAxisJSON(settings: TrailSettings | undefined): {sideAxis?: number[]} {
    const axis = settings?.sideAxis;
    return axis ? {sideAxis: [axis.x, axis.y, axis.z]} : {};
}

/** A trail's side axis from JSON `[x, y, z]` (or an object with x, y, z), or nothing. */
function trailSideAxisFromJSON(value: unknown): {sideAxis?: Vector3} {
    if (Array.isArray(value)) {
        return {sideAxis: new Vector3(Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0)};
    }
    if (value && typeof value === 'object') {
        const v = value as {x?: number; y?: number; z?: number};
        return {sideAxis: new Vector3(v.x ?? 0, v.y ?? 0, v.z ?? 0)};
    }
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

    // Only what differs from the defaults the constructor and fromJSON give a setting left out.
    // The shape, the settings the table marks `always`, the geometry, the material and the
    // behaviors are always written: the loaders of 0.27 and earlier, and three.quarks, need them.
    return {
        version: '3.0',
        shape: system.emitterShape.toJSON(),
        ...settingsToJSON(system),
        instancingGeometry: geometryUUID,
        ...(Object.keys(rendererSettingsJSON).length > 0 ? {rendererEmitterSettings: rendererSettingsJSON} : {}),
        material: materialUUID,
        behaviors: system.behaviors.map((b) => b.toJSON()),
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
    const shape = json.shape ? EmitterFromJSON(json.shape, meta as any) : undefined;
    let rendererEmitterSettings: RendererEmitterSettings;
    if (json.renderMode === RenderMode.Trail) {
        const trailSettings = json.rendererEmitterSettings as TrailSettings;
        rendererEmitterSettings = {
            startLength:
                trailSettings?.startLength !== undefined
                    ? ValueGeneratorFromJSON(trailSettings.startLength)
                    : new ConstantValue(30),
            followLocalOrigin: trailSettings?.followLocalOrigin ?? false,
            ...trailFlags(trailSettings),
            ...trailCurve(trailSettings),
            ...trailSideAxisFromJSON((trailSettings as {sideAxis?: unknown} | undefined)?.sideAxis),
        };
    } else if (json.renderMode === RenderMode.StretchedBillBoard) {
        rendererEmitterSettings = {...(json.rendererEmitterSettings ?? {})};
        if (json.speedFactor !== undefined) {
            (rendererEmitterSettings as StretchedBillBoardSettings).speedFactor = json.speedFactor;
        }
    } else {
        rendererEmitterSettings = {};
    }

    const materialMeta = json.material ? meta.materials?.[json.material] : undefined;
    const materialTextureRef = materialMeta?.texture ?? json.texture;
    const texture =
        typeof materialTextureRef === 'string'
            ? (meta.textures?.[materialTextureRef] ?? null)
            : (materialTextureRef ?? null);
    // Texture effects reference textures by uuid in a serialised meta, or hold them once a loader resolved them.
    const resolveTexture = (ref: unknown): BaseTexture | null =>
        typeof ref === 'string' ? (meta.textures?.[ref] ?? null) : ((ref as BaseTexture | null) ?? null);
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
        material: materialMeta?.sourceMaterial ?? materialMeta,
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
function rendererEmitterSettingsJSON(system: ParticleSystem): RendererEmitterSettings {
    if (system.renderMode === RenderMode.Trail) {
        return {
            startLength: (system.rendererEmitterSettings as TrailSettings).startLength.toJSON(),
            followLocalOrigin: (system.rendererEmitterSettings as TrailSettings).followLocalOrigin,
            ...trailFlags(system.rendererEmitterSettings as TrailSettings),
            ...trailCurve(system.rendererEmitterSettings as TrailSettings),
            ...(trailSideAxisJSON(system.rendererEmitterSettings as TrailSettings) as {sideAxis?: any}),
        };
    }
    if (system.renderMode === RenderMode.StretchedBillBoard) {
        return {
            speedFactor: (system.rendererEmitterSettings as StretchedBillBoardSettings).speedFactor,
            lengthFactor: (system.rendererEmitterSettings as StretchedBillBoardSettings).lengthFactor,
        };
    }
    return {};
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
            meta.textures[uuid] = value as Texture;
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
