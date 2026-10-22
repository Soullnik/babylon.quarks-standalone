import {Constants} from '@babylonjs/core/Engines/constants';
import type {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import type {Scene} from '@babylonjs/core/scene';
import {
    ColorGenerator,
    ColorGeneratorFromJSON,
    ConstantValue,
    EmitterFromJSON,
    FunctionValueGenerator,
    GeneratorFromJSON,
    RendererEmitterSettings,
    RotationGenerator,
    StretchedBillBoardSettings,
    TrailSettings,
    ValueGenerator,
    ValueGeneratorFromJSON,
    Vector2,
    Vector3,
    Vector3Generator,
} from 'quarks.core';
import type {ParticleSystem} from '../ParticleSystem';
import {trailCurveTension, trailTessellation} from '../trailCurve';
import {RenderMode, textureUVToJSON, UV_DISTORTION_DEFAULT_UV} from '../VFXBatch';
import {resolveGeometryData} from './geometry';
import {validCullingMode, validSortMode} from './normalize';
import type {BabylonMetaData, ParticleSystemJSONParameters, ParticleSystemParameters} from './types';

// Reading and writing a ParticleSystem's JSON. The class's toJSON and fromJSON call these.

/** `read(json)`, or `undefined` for a part the file leaves out. */
function optionalJSON<T>(json: any, read: (json: any) => T): T | undefined {
    return json === undefined || json === null ? undefined : read(json);
}

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

    return {
        version: '3.0',
        autoDestroy: system.autoDestroy,
        looping: system.looping,
        prewarm: system.prewarm,
        duration: system.duration,
        startDelay: system.startDelay.toJSON(),
        shape: system.emitterShape.toJSON(),
        startLife: system.startLife.toJSON(),
        startSpeed: system.startSpeed.toJSON(),
        startRotation: system.startRotation.toJSON(),
        startSize: system.startSize.toJSON(),
        startColor: system.startColor.toJSON(),
        emissionOverTime: system.emissionOverTime.toJSON(),
        emissionOverDistance: system.emissionOverDistance.toJSON(),
        emissionBursts: system.emissionBursts.map((burst) => ({
            time: burst.time,
            count: burst.count.toJSON(),
            probability: burst.probability,
            interval: burst.interval,
            cycle: burst.cycle,
        })),
        ...(system.maxParticles !== undefined ? {maxParticles: system.maxParticles} : {}),
        onlyUsedByOther: system.onlyUsedByOther,
        instancingGeometry: geometryUUID,
        renderMode: system.renderMode,
        renderOrder: system.renderOrder,
        ...(system.renderingGroupId !== 0 ? {renderingGroupId: system.renderingGroupId} : {}),
        ...(system.applyFog ? {} : {applyFog: false}),
        ...(system.playbackSpeed !== 1 ? {playbackSpeed: system.playbackSpeed} : {}),
        ...(system.cullingMode !== 'always' ? {cullingMode: system.cullingMode} : {}),
        ...(system.scalingMode !== 'shape' ? {scalingMode: system.scalingMode} : {}),
        ...(system.seed !== undefined ? {seed: system.seed} : {}),
        ...(system.sortMode !== 'none' ? {sortMode: system.sortMode} : {}),
        ...(system.alignToDirection ? {alignToDirection: true} : {}),
        ...(system.minParticleSize > 0 ? {minParticleSize: system.minParticleSize} : {}),
        ...(system.maxParticleSize !== Infinity ? {maxParticleSize: system.maxParticleSize} : {}),
        rendererEmitterSettings: rendererSettingsJSON,
        material: materialUUID,
        layers: system.rendererSettings.layerMask,
        startTileIndex: system.startTileIndex.toJSON(),
        uTileCount: system.rendererSettings.uTileCount,
        vTileCount: system.rendererSettings.vTileCount,
        blendTiles: system.rendererSettings.blendTiles,
        softParticles: system.rendererSettings.softParticles,
        softFarFade: system.rendererSettings.softFarFade,
        softNearFade: system.rendererSettings.softNearFade,
        blending: system.rendererSettings.materialBlendMode,
        transparent: system.rendererSettings.materialTransparent,
        depthTest: system.rendererSettings.materialDepthTest,
        depthWrite: system.rendererSettings.materialDepthWrite,
        alphaTest: system.rendererSettings.materialAlphaTest,
        behaviors: system.behaviors.map((b) => b.toJSON()),
        worldSpace: system.worldSpace,
        ...(system.pivot ? {pivot: [system.pivot.x, system.pivot.y, system.pivot.z]} : {}),
        ...(system.flip ? {flip: [system.flip.x, system.flip.y]} : {}),
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

    return {
        scene,
        autoDestroy: json.autoDestroy,
        looping: json.looping,
        prewarm: json.prewarm,
        duration: json.duration,
        startDelay: json.startDelay ? ValueGeneratorFromJSON(json.startDelay) : undefined,
        shape,
        startLife: optionalJSON(json.startLife, ValueGeneratorFromJSON),
        startSpeed: optionalJSON(json.startSpeed, ValueGeneratorFromJSON),
        startRotation: optionalJSON(json.startRotation, GeneratorFromJSON) as
            | RotationGenerator
            | ValueGenerator
            | FunctionValueGenerator
            | undefined,
        startSize: optionalJSON(json.startSize, GeneratorFromJSON) as
            | Vector3Generator
            | ValueGenerator
            | FunctionValueGenerator
            | undefined,
        startColor: optionalJSON(json.startColor, ColorGeneratorFromJSON) as ColorGenerator | undefined,
        emissionOverTime: optionalJSON(json.emissionOverTime, ValueGeneratorFromJSON),
        emissionOverDistance: optionalJSON(json.emissionOverDistance, ValueGeneratorFromJSON),
        emissionBursts: json.emissionBursts?.map((burst: any) => ({
            time: burst.time,
            count:
                typeof burst.count === 'number' ? new ConstantValue(burst.count) : ValueGeneratorFromJSON(burst.count),
            probability: burst.probability ?? 1,
            interval: burst.interval ?? 0.1,
            cycle: burst.cycle ?? burst.cycleCount ?? 1,
        })),
        maxParticles: typeof json.maxParticles === 'number' ? json.maxParticles : undefined,
        onlyUsedByOther: json.onlyUsedByOther,
        instancingGeometry: resolvedGeometry.positions,
        instancingIndices: resolvedGeometry.indices,
        instancingUVs: resolvedGeometry.uvs,
        instancingUVs2: resolvedGeometry.uvs2,
        instancingNormals: resolvedGeometry.normals,
        renderMode: json.renderMode,
        rendererEmitterSettings,
        renderOrder: json.renderOrder,
        renderingGroupId: typeof json.renderingGroupId === 'number' ? json.renderingGroupId : undefined,
        applyFog: json.applyFog !== false,
        playbackSpeed: typeof json.playbackSpeed === 'number' ? json.playbackSpeed : undefined,
        cullingMode: validCullingMode(json.cullingMode),
        scalingMode: json.scalingMode === 'hierarchy' ? 'hierarchy' : 'shape',
        seed: typeof json.seed === 'number' ? json.seed : undefined,
        sortMode: validSortMode(json.sortMode),
        alignToDirection: json.alignToDirection === true,
        minParticleSize: typeof json.minParticleSize === 'number' ? json.minParticleSize : undefined,
        maxParticleSize: typeof json.maxParticleSize === 'number' ? json.maxParticleSize : undefined,
        texture,
        material: materialMeta?.sourceMaterial ?? materialMeta,
        blendMode: materialMeta?.alphaMode ?? json.blending ?? Constants.ALPHA_ADD,
        transparent: materialMeta?.transparent ?? json.transparent ?? true,
        depthTest: materialMeta?.depthTest ?? json.depthTest ?? true,
        depthWrite: materialMeta?.depthWrite ?? json.depthWrite ?? false,
        alphaTest: materialMeta?.alphaTest ?? json.alphaTest ?? 0,
        startTileIndex:
            typeof json.startTileIndex === 'number'
                ? new ConstantValue(json.startTileIndex)
                : (optionalJSON(json.startTileIndex, ValueGeneratorFromJSON) as ValueGenerator | undefined),
        uTileCount: json.uTileCount,
        vTileCount: json.vTileCount,
        blendTiles: json.blendTiles,
        softParticles: json.softParticles,
        softFarFade: json.softFarFade,
        softNearFade: json.softNearFade,
        behaviors: [],
        worldSpace: json.worldSpace,
        layerMask: json.layers,
        pivot: json.pivot ? new Vector3(json.pivot[0] ?? 0, json.pivot[1] ?? 0, json.pivot[2] ?? 0) : undefined,
        flip: json.flip ? new Vector2(json.flip[0] ?? 0, json.flip[1] ?? 0) : undefined,
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
    const textureRef = (value: BaseTexture | null | undefined, anyKind = false): string | undefined => {
        if (!(value instanceof Texture) && !(anyKind && value)) {
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
                      ramp: textureRef(gradientMap.ramp),
                      ...(gradientMap.channel !== 'r' ? {channel: gradientMap.channel} : {}),
                  },
              }
            : {}),
        ...(erosion
            ? {
                  erosion: {
                      mask: textureRef(erosion.mask),
                      ...optional('maskUV', textureUVToJSON(erosion.maskUV)),
                      softness: erosion.softness,
                      edgeWidth: erosion.edgeWidth,
                      edgeColor: [...erosion.edgeColor],
                  },
              }
            : {}),
        ...(distortion
            ? {
                  uvDistortion: {
                      map: textureRef(distortion.map),
                      ...optional('mapUV', textureUVToJSON(distortion.mapUV, UV_DISTORTION_DEFAULT_UV)),
                      strength: distortion.strength,
                  },
              }
            : {}),
        sourceMaterial: system.material ?? undefined,
    };
    return materialUUID;
}
