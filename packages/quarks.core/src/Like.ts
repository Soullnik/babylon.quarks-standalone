/**
 * The vector, quaternion and colour shapes the public API takes. They are structural: a Babylon
 * `Vector3`, `Quaternion`, `Color3` or `Color4`, a plain object literal or any other value with these
 * fields is accepted, and is copied, so the caller keeps their own object. The simulation keeps its
 * own math internally; it is not part of the API.
 *
 * @packageDocumentation
 */

/** A 2D vector: a Babylon `Vector2`, or `{x, y}`. */
export interface Vector2Like {
    /** The x component. */
    x: number;
    /** The y component. */
    y: number;
}

/** A 3D vector: a Babylon `Vector3`, or `{x, y, z}`. */
export interface Vector3Like {
    /** The x component. */
    x: number;
    /** The y component. */
    y: number;
    /** The z component. */
    z: number;
}

/** A rotation quaternion: a Babylon `Quaternion`, or `{x, y, z, w}`. */
export interface QuaternionLike {
    /** The x component. */
    x: number;
    /** The y component. */
    y: number;
    /** The z component. */
    z: number;
    /** The w component. */
    w: number;
}

/** An RGB colour: a Babylon `Color3` or `Color4`, or `{r, g, b}`. */
export interface Color3Like {
    /** Red. */
    r: number;
    /** Green. */
    g: number;
    /** Blue. */
    b: number;
}

/** An RGBA colour: a Babylon `Color4`, or `{r, g, b, a}`. */
export interface Color4Like extends Color3Like {
    /** Alpha. */
    a: number;
}
