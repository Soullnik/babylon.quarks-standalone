import type {Color3Like, Color4Like, QuaternionLike, Vector2Like, Vector3Like} from '../Like';
import {Quaternion} from './Quaternion';
import {Vector2} from './Vector2';
import {Vector3} from './Vector3';
import {Vector4} from './Vector4';

// Copies of the public shapes (`Like.ts`) into the simulation's own math. Internal.

/** @internal */
export function vector2From(v: Vector2Like): Vector2 {
    return new Vector2(v.x, v.y);
}

/** @internal */
export function vector3From(v: Vector3Like): Vector3 {
    return new Vector3(v.x, v.y, v.z);
}

/** @internal */
export function quaternionFrom(q: QuaternionLike): Quaternion {
    return new Quaternion(q.x, q.y, q.z, q.w);
}

/** An RGB colour as the simulation keeps it, in x, y and z. @internal */
export function vector3FromColor(c: Color3Like): Vector3 {
    return new Vector3(c.r, c.g, c.b);
}

/** An RGBA colour as the simulation keeps it, in x, y, z and w. @internal */
export function vector4FromColor(c: Color4Like): Vector4 {
    return new Vector4(c.r, c.g, c.b, c.a);
}
