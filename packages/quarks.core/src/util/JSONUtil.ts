import {Vector3, Vector4} from '../math';

export const ColorToJSON = (color: Vector4) => {
    return {r: color.x, g: color.y, b: color.z, a: color.w};
};

export const JSONToColor = (json: any) => {
    return new Vector4(json.r, json.g, json.b, json.a);
};

export const JSONToValue = (json: any, type: string) => {
    switch (type) {
        case 'Vector3':
            return new Vector3(json.x, json.y, json.z);
        case 'Vector4':
            return new Vector4(json.x, json.y, json.z, json.w);
        case 'Color':
            return new Vector3(json.r, json.g, json.b);
        case 'Number':
            return json;
        default:
            return json;
    }
};

export const ValueToJSON = (value: any, type: string) => {
    switch (type) {
        case 'Vector3':
            return {x: value.x, y: value.y, z: value.z};
        case 'Vector4':
            return {x: value.x, y: value.y, z: value.z, w: value.w};
        case 'Color':
            return {r: value.x, g: value.y, b: value.z};
        case 'Number':
            return value;
        default:
            return value;
    }
};

/**
 * Thrown for an effect document that cannot be read at all, such as one with no `object`, and, in
 * a {@link FormatReadOptions.strict} read, for the first part that cannot be read as written.
 */
export class QuarksFormatError extends Error {
    /** Every part that could not be read as written, each with its JSON path; the message names the first. */
    readonly problems: string[];

    /**
     * @param message - What could not be read.
     * @param problems - Every such part, when there are several; `[message]` by default.
     */
    constructor(message: string, problems: string[] = [message]) {
        super(message);
        this.name = 'QuarksFormatError';
        this.problems = problems;
    }
}

/** How a read of an effect file reports the parts it cannot read as written. */
export interface FormatReadOptions {
    /**
     * Called for each part that cannot be read as written (an unknown behavior, shape or curve
     * type, a link to a node the effect does not have), with what was used instead, and the JSON
     * path of the part, such as `object.children[2].ps.behaviors[3]` (empty when no path is known).
     * Default: a console warning that names the path.
     */
    onWarning?: (message: string, path: string) => void;
    /**
     * Throws a {@link QuarksFormatError} for the first such part, from inside the read, instead of
     * reading on; whatever the read had built is left to the caller. Default false: the part takes
     * its default and the rest of the effect loads. The loader's own `strict` option reads the whole
     * effect first and frees it before it throws.
     */
    strict?: boolean;
}

let readOptions: FormatReadOptions = {};
const readPath: string[] = [];

/**
 * Runs `read` with `options` deciding how {@link warnFormat} reports, and a JSON path that starts
 * empty; the options and path before are restored afterwards.
 * @returns What `read` returns.
 */
export function readFormat<T>(options: FormatReadOptions, read: () => T): T {
    const outerOptions = readOptions;
    const outerPath = readPath.splice(0);
    readOptions = options;
    try {
        return read();
    } finally {
        readOptions = outerOptions;
        readPath.splice(0, readPath.length, ...outerPath);
    }
}

/**
 * Runs `read` with `segment` (a key such as `ps`, or an element such as `behaviors[3]`) added to the
 * JSON path {@link warnFormat} reports.
 * @returns What `read` returns.
 */
export function readFormatPart<T>(segment: string, read: () => T): T {
    readPath.push(segment);
    try {
        return read();
    } finally {
        readPath.pop();
    }
}

/** The JSON path of the part being read, such as `object.children[2].ps`; empty outside one. */
export function currentFormatPath(): string {
    return readPath.reduce(
        (path, segment) => (path && !segment.startsWith('[') ? `${path}.${segment}` : path + segment),
        ''
    );
}

/**
 * Reports a part of an effect file that could not be read as written, and what was used instead,
 * as the current {@link readFormat} options say: a console warning naming its JSON path by default,
 * or a {@link QuarksFormatError} in a strict read. Loading goes on otherwise: one unknown behavior
 * or curve type should not cost the whole effect.
 */
export const warnFormat = (message: string): void => {
    const path = currentFormatPath();
    if (readOptions.strict) {
        throw new QuarksFormatError(path ? `${message} (at ${path})` : message);
    }
    if (readOptions.onWarning) {
        readOptions.onWarning(message, path);
    } else {
        console.warn(`[quarks] ${message}${path ? ` (at ${path})` : ''}`);
    }
};

/** `[x, y, z]` from JSON as a Vector3, or `fallback` when the field is missing or not an array. */
export const readVector3 = (json: unknown, fallback: Vector3): Vector3 =>
    Array.isArray(json) ? new Vector3(json[0] ?? fallback.x, json[1] ?? fallback.y, json[2] ?? fallback.z) : fallback;

/** What is wrong with a JSON part, for a message: `Unknown behavior "Foo"`, or `Missing behavior`. */
export const describePart = (kind: string, json: unknown): string => {
    const type = (json as {type?: unknown} | null | undefined)?.type;
    return json === undefined || json === null
        ? `Missing ${kind}`
        : type === undefined
          ? `${kind[0].toUpperCase()}${kind.slice(1)} without a type`
          : `Unknown ${kind} ${JSON.stringify(type)}`;
};

/** Whether two JSON values are equal: deeply, in any key order, with an `undefined` field as none. */
export function jsonEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
        return typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b);
    }
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
        if (!jsonEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
    }
    return true;
}

/**
 * `full`, a part's JSON with a `type`, without the fields equal to the ones its type reads a
 * missing field as. `readBack` reads a JSON of the type and writes it again. A field is left out
 * only when the smaller JSON reads back, without a warning, to the same JSON as `full`; otherwise
 * `full` is returned as it is, so a reader that needs a field, or a plugin that cannot read its
 * type alone, gets every field.
 */
export function withoutDefaults<J extends {type?: unknown}>(full: J, readBack: (json: J) => unknown): J {
    if (full === null || typeof full !== 'object' || typeof full.type !== 'string') return full;
    const read = (json: J): {out: unknown; warned: boolean} => {
        let warned = false;
        try {
            const out = readFormat({onWarning: () => (warned = true)}, () => readBack(json));
            return {out, warned};
        } catch {
            return {out: undefined, warned: true};
        }
    };
    // Read from the type alone, a part with a field it needs warns and takes a fallback; that field
    // differs from the fallback in `full` almost always, and stays.
    const defaults = read({type: full.type} as J).out as Record<string, unknown> | undefined;
    if (defaults === undefined || defaults === null || typeof defaults !== 'object') return full;
    const minimal: Record<string, unknown> = {type: full.type};
    for (const [key, value] of Object.entries(full)) {
        if (key !== 'type' && value !== undefined && !jsonEqual(value, defaults[key])) minimal[key] = value;
    }
    if (Object.keys(minimal).length === Object.keys(full).length) return full;
    const back = read(minimal as J);
    return !back.warned && jsonEqual(back.out, full) ? (minimal as J) : full;
}
