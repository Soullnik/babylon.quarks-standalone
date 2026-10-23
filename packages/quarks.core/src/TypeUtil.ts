/** A class whose instances are `T`. */
export interface Constructable<T> {
    new (...args: any): T;
}

/**
 * The kind of a field an editor shows for a shape or behavior: a number, an angle (`'radian'`), a
 * vector, a generator of some kind, a reference to a mesh or system, an enum (`'emitterMode'`,
 * `'boxEmitFrom'`), a shape's local transform (`'shapeTransform'`), and so on.
 */
export type FieldType =
    | 'vec3'
    | 'value'
    | 'number'
    | 'range'
    | 'colorFunc'
    | 'valueFunc'
    | 'rotationFunc'
    | 'radian'
    | 'mesh'
    | 'particleSystem'
    | 'boolean'
    | 'string'
    | 'geometry'
    | 'emitterMode'
    | 'boxEmitFrom'
    | 'shapeTransform'
    | 'vec3Func';
/** A {@link FieldType}, or `'self'` for a field that refers to the system itself. */
export type ParameterType = FieldType | 'self';
/**
 * A field name and the kinds of value it accepts, in the `params` of a shape or behavior
 * registration.
 */
export type ParameterPair = [string, Array<ParameterType>];
