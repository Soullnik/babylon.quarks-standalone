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
 * Reports a part of an effect file that could not be read as written, and what was used instead.
 * Loading goes on: one unknown behavior or curve type should not cost the whole effect.
 */
export const warnFormat = (message: string): void => {
    console.warn(`[quarks] ${message}`);
};

/** `[x, y, z]` from JSON as a Vector3, or `fallback` when the field is missing or not an array. */
export const readVector3 = (json: unknown, fallback: Vector3): Vector3 =>
    Array.isArray(json) ? new Vector3(json[0] ?? fallback.x, json[1] ?? fallback.y, json[2] ?? fallback.z) : fallback;

/** The `type` of a JSON part, for a message: `"Foo"`, or `nothing` when it has none. */
export const describeType = (json: unknown): string => {
    const type = (json as {type?: unknown} | null | undefined)?.type;
    return type === undefined ? 'nothing' : JSON.stringify(type);
};
