import {Constants} from '@babylonjs/core/Engines/constants';
import type {ColorGeneratorJSON, RotationGeneratorJSON, ValueGeneratorJSON, Vector3GeneratorJSON} from 'quarks.core';
import {
    ColorGenerator,
    ColorGeneratorFromJSON,
    ConstantColor,
    ConstantValue,
    FunctionColorGenerator,
    FunctionValueGenerator,
    GeneratorFromJSON,
    readFormatPart,
    RotationGenerator,
    ValueGenerator,
    ValueGeneratorFromJSON,
    Vector2,
    Vector3,
    Vector3Generator,
    Vector4,
} from 'quarks.core';
import type {ParticleSystem} from '../ParticleSystem';
import {RenderMode} from '../VFXBatch';
import {
    DEFAULT_SOFT_FAR_FADE,
    normalizeBursts,
    validCullingMode,
    validLoopRange,
    validRenderFace,
    validRingBufferMode,
    validScalingMode,
    validSortMode,
    validStopAction,
    validTileCount,
} from './normalize';
import type {
    BurstParameters,
    BurstParametersJSON,
    ParticleSystemJSONParameters,
    ParticleSystemParameters,
} from './types';

/**
 * One setting of a {@link ParticleSystem} that is a plain value or a generator: how to read it
 * from a system, what its default is, and how it goes to and from JSON and into a copy. The
 * table below drives `toJSON` (which writes only values that differ from the default),
 * `fromJSON` and `clone`, so a setting cannot be added to one and forgotten in another.
 *
 * Settings that live in the document's meta (geometry, material, texture and the texture
 * effects), the render mode's own settings, the shape and the behaviors are handled by the
 * callers, since they need the meta or the system itself.
 */
export interface SettingDescriptor {
    /** The constructor parameter. */
    readonly param: keyof ParticleSystemParameters;
    /** The JSON field, when it is named differently from the parameter. */
    readonly json?: keyof ParticleSystemJSONParameters;
    /** The current value on a system. */
    get(system: ParticleSystem): unknown;
    /** Whether `value` is what the constructor gives a system that leaves the setting out. */
    isDefault(value: unknown): boolean;
    /**
     * Written even when it is the default, because the loaders of releases up to 0.27 fail on a
     * file without it.
     */
    readonly always?: boolean;
    /** The value as JSON. */
    toJSON(value: unknown): unknown;
    /** The constructor parameter for a JSON value that is present; undefined takes the default. */
    fromJSON(json: unknown): unknown;
    /** A copy that shares no mutable state with `value`. */
    clone(value: unknown): unknown;
}

type Generator = {toJSON(): unknown; clone(): unknown};

/** A burst as files hold it, any field left out. */
type BurstJSON = Partial<BurstParametersJSON>;

/** A number, boolean or string compared by value. */
function plain<T>(
    param: keyof ParticleSystemParameters,
    get: (system: ParticleSystem) => T,
    defaultValue: T,
    read: (json: unknown) => T | undefined,
    options: {json?: keyof ParticleSystemJSONParameters} = {}
): SettingDescriptor {
    return {
        param,
        json: options.json,
        get,
        isDefault: (value) => value === defaultValue,
        toJSON: (value) => value,
        fromJSON: read,
        clone: (value) => value,
    };
}

function number(json: unknown): number | undefined {
    return typeof json === 'number' ? json : undefined;
}

/** A flipbook count: a whole number of at least 1, see {@link validTileCount}. */
function tileCount(json: unknown): number | undefined {
    return typeof json === 'number' ? validTileCount(json) : undefined;
}

/** A soft fade distance: finite and at least 0, as `validSoftFade`; an invalid one takes the default. */
function softFade(json: unknown): number | undefined {
    return typeof json === 'number' && Number.isFinite(json) && json >= 0 ? json : undefined;
}

/** A boolean; a number counts as true unless it is 0, as files with 0/1 flags meant it. */
function boolean(json: unknown): boolean | undefined {
    if (typeof json === 'number') return json !== 0;
    return typeof json === 'boolean' ? json : undefined;
}

/**
 * A generator, compared with its default through its JSON. `read` turns the JSON back into one;
 * a bare number is read as a constant.
 */
function generator<J>(
    param: keyof ParticleSystemParameters,
    get: (system: ParticleSystem) => Generator,
    defaultValue: () => Generator,
    read: (json: J) => unknown,
    always = true
): SettingDescriptor {
    const defaultJSON = JSON.stringify(defaultValue().toJSON());
    return {
        param,
        always,
        get,
        isDefault: (value) => JSON.stringify((value as Generator).toJSON()) === defaultJSON,
        toJSON: (value) => (value as Generator).toJSON(),
        // The generator readers check the JSON they are given, and warn about what they cannot read.
        fromJSON: (json) => (typeof json === 'number' ? new ConstantValue(json) : read(json as J)),
        clone: (value) => (value as Generator).clone(),
    };
}

function vectorJSON(value: unknown): number[] | undefined {
    const v = value as {x: number; y: number; z?: number} | undefined;
    if (v === undefined) return undefined;
    return v.z === undefined ? [v.x, v.y] : [v.x, v.y, v.z];
}

/** Every plain and generator setting, in the order `toJSON` writes them. */
export const SETTINGS: ReadonlyArray<SettingDescriptor> = [
    plain('stopAction', (s) => s.stopAction, 'none', validStopAction),
    plain('looping', (s) => s.looping, true, boolean),
    plain('prewarm', (s) => s.prewarm, false, boolean),
    plain('prewarmTime', (s) => s.prewarmTime, 0, number),
    plain('duration', (s) => s.duration, 1, number),
    generator(
        'startDelay',
        (s) => s.startDelay,
        () => new ConstantValue(0),
        ValueGeneratorFromJSON,
        false
    ),
    generator(
        'startLife',
        (s) => s.startLife,
        () => new ConstantValue(5),
        ValueGeneratorFromJSON
    ),
    generator(
        'startSpeed',
        (s) => s.startSpeed,
        () => new ConstantValue(0),
        ValueGeneratorFromJSON
    ),
    generator(
        'startRotation',
        (s) => s.startRotation,
        () => new ConstantValue(0),
        (json: ValueGeneratorJSON | RotationGeneratorJSON) =>
            GeneratorFromJSON(json) as RotationGenerator | ValueGenerator | FunctionValueGenerator
    ),
    generator(
        'startSize',
        (s) => s.startSize,
        () => new ConstantValue(1),
        (json: ValueGeneratorJSON | Vector3GeneratorJSON) =>
            GeneratorFromJSON(json) as Vector3Generator | ValueGenerator | FunctionValueGenerator
    ),
    generator(
        'startColor',
        (s) => s.startColor,
        () => new ConstantColor(new Vector4(1, 1, 1, 1)),
        (json: ColorGeneratorJSON) => ColorGeneratorFromJSON(json) as ColorGenerator | FunctionColorGenerator
    ),
    generator(
        'emissionOverTime',
        (s) => s.emissionOverTime,
        () => new ConstantValue(10),
        ValueGeneratorFromJSON
    ),
    generator(
        'emissionOverDistance',
        (s) => s.emissionOverDistance,
        () => new ConstantValue(0),
        ValueGeneratorFromJSON
    ),
    {
        param: 'emissionBursts',
        get: (s) => s.emissionBursts,
        isDefault: (value) => (value as BurstParameters[]).length === 0,
        toJSON: (value) =>
            (value as BurstParameters[]).map((burst) => ({
                time: burst.time,
                count: burst.count.toJSON(),
                probability: burst.probability,
                interval: burst.interval,
                cycle: burst.cycle,
            })),
        fromJSON: (json) =>
            Array.isArray(json)
                ? normalizeBursts(
                      json.map((burst: BurstJSON) => ({
                          time: burst.time,
                          count:
                              typeof burst.count === 'number'
                                  ? new ConstantValue(burst.count)
                                  : ValueGeneratorFromJSON(burst.count),
                          probability: burst.probability,
                          interval: burst.interval,
                          cycle: burst.cycle ?? burst.cycleCount,
                      }))
                  )
                : undefined,
        clone: (value) => (value as BurstParameters[]).map((burst) => ({...burst, count: burst.count.clone()})),
    },
    plain('maxParticles', (s) => s.maxParticles, undefined, number),
    plain('ringBufferMode', (s) => s.ringBufferMode, 'disabled', validRingBufferMode),
    {
        param: 'ringBufferLoopRange',
        get: (s) => s.ringBufferLoopRange,
        isDefault: (value) => (value as Vector2).x === 0 && (value as Vector2).y === 1,
        toJSON: vectorJSON,
        fromJSON: (json) => (Array.isArray(json) ? validLoopRange(new Vector2(json[0], json[1])) : undefined),
        clone: (value) => (value as Vector2).clone(),
    },
    plain('onlyUsedByOther', (s) => s.onlyUsedByOther, false, boolean),
    plain('renderMode', (s) => s.renderMode, RenderMode.BillBoard, number),
    plain('renderOrder', (s) => s.renderOrder, 0, number),
    plain('renderingGroupId', (s) => s.renderingGroupId, 0, number),
    plain(
        'applyFog',
        (s) => s.applyFog,
        true,
        (json) => json !== false
    ),
    plain(
        'applyImageProcessing',
        (s) => s.applyImageProcessing,
        true,
        (json) => json !== false
    ),
    plain('playbackSpeed', (s) => s.playbackSpeed, 1, number),
    plain('cullingMode', (s) => s.cullingMode, 'always', validCullingMode),
    plain('scalingMode', (s) => s.scalingMode, 'local', validScalingMode),
    plain('seed', (s) => s.seed, undefined, number),
    plain('sortMode', (s) => s.sortMode, 'none', validSortMode),
    plain('renderFace', (s) => s.renderFace, 'both', validRenderFace),
    plain(
        'alignToDirection',
        (s) => s.alignToDirection,
        false,
        (json) => json === true
    ),
    plain('minParticleSize', (s) => s.minParticleSize, 0, number),
    plain('maxParticleSize', (s) => s.maxParticleSize, Infinity, number),
    plain('layerMask', (s) => s.layers.mask, 0x0fffffff, number, {json: 'layers'}),
    generator(
        'startTileIndex',
        (s) => s.startTileIndex,
        () => new ConstantValue(0),
        ValueGeneratorFromJSON
    ),
    plain('uTileCount', (s) => s.uTileCount, 1, tileCount),
    plain('vTileCount', (s) => s.vTileCount, 1, tileCount),
    plain('blendTiles', (s) => s.blendTiles, false, boolean),
    plain('softParticles', (s) => s.softParticles, false, boolean),
    plain('softFarFade', (s) => s.softFarFade, DEFAULT_SOFT_FAR_FADE, softFade),
    plain('softNearFade', (s) => s.softNearFade, 0, softFade),
    plain('blendMode', (s) => s.blending, Constants.ALPHA_ADD, number, {json: 'blending'}),
    plain('transparent', (s) => s.transparent, true, boolean),
    plain('depthTest', (s) => s.depthTest, true, boolean),
    plain('depthWrite', (s) => s.depthWrite, false, boolean),
    plain('alphaTest', (s) => s.alphaTest, 0, number),
    plain('worldSpace', (s) => s.worldSpace, false, boolean),
    {
        param: 'pivot',
        get: (s) => s.pivot,
        isDefault: (value) => value === undefined,
        toJSON: vectorJSON,
        fromJSON: (json) => (Array.isArray(json) ? new Vector3(json[0] ?? 0, json[1] ?? 0, json[2] ?? 0) : undefined),
        clone: (value) => (value as Vector3 | undefined)?.clone(),
    },
    {
        param: 'flip',
        get: (s) => s.flip,
        isDefault: (value) => value === undefined,
        toJSON: vectorJSON,
        fromJSON: (json) => (Array.isArray(json) ? new Vector2(json[0] ?? 0, json[1] ?? 0) : undefined),
        clone: (value) => (value as Vector2 | undefined)?.clone(),
    },
];

/** The JSON field a setting is written under. */
export function settingJSONKey(setting: SettingDescriptor): string {
    return setting.json ?? setting.param;
}

/** The settings of `system` that differ from their defaults, as JSON fields. */
export function settingsToJSON(system: ParticleSystem): Record<string, unknown> {
    const json: Record<string, unknown> = {};
    for (const setting of SETTINGS) {
        const value = setting.get(system);
        if (setting.always || !setting.isDefault(value)) {
            json[settingJSONKey(setting)] = setting.toJSON(value);
        }
    }
    return json;
}

/** Constructor parameters for the settings a document has; missing ones are left out, so they take the default. */
export function settingsFromJSON(json: ParticleSystemJSONParameters): Partial<ParticleSystemParameters> {
    const parameters: Record<string, unknown> = {};
    const fields = json as unknown as Record<string, unknown>;
    for (const setting of SETTINGS) {
        const value = fields[settingJSONKey(setting)];
        if (value === undefined || value === null) {
            continue;
        }
        const key = settingJSONKey(setting);
        const read = readFormatPart(key, () => setting.fromJSON(value));
        if (read !== undefined) {
            parameters[setting.param] = read;
        }
    }
    // Files before 0.29 wrote the stop action as `autoDestroy`.
    if (parameters.stopAction === undefined && fields.autoDestroy === true) {
        parameters.stopAction = 'destroy';
    }
    return parameters as Partial<ParticleSystemParameters>;
}

/** Constructor parameters that copy every setting of `system`. */
export function settingsForClone(system: ParticleSystem): Partial<ParticleSystemParameters> {
    const parameters: Record<string, unknown> = {};
    for (const setting of SETTINGS) {
        parameters[setting.param] = setting.clone(setting.get(system));
    }
    return parameters as Partial<ParticleSystemParameters>;
}
