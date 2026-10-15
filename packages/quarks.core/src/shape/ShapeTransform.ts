import {Quaternion, Vector3} from '../math';
import {Particle} from '../Particle';

export interface ShapeTransformJSON {
    /** Offset of the shape, `[x, y, z]`. Omitted when zero. */
    position?: number[];
    /** Rotation of the shape as a quaternion, `[x, y, z, w]`. Omitted when identity. */
    rotation?: number[];
    /** Scale of the shape, `[x, y, z]`. Omitted when `[1, 1, 1]`. */
    scale?: number[];
}

/**
 * Local transform of an emitter shape inside its particle system, like the
 * Position / Rotation / Scale of Unity's Shape module.
 *
 * A spawn point `p` lands at `position + rotation * (scale * p)`. The start
 * direction goes through the same scale and rotation and is then brought back
 * to its old length, so a squashed shape bends directions without changing the
 * start speed — which is what Unity does.
 */
export class ShapeTransform {
    position: Vector3;
    rotation: Quaternion;
    scale: Vector3;

    constructor(position?: Vector3, rotation?: Quaternion, scale?: Vector3) {
        this.position = position ?? new Vector3();
        this.rotation = rotation ?? new Quaternion();
        this.scale = scale ?? new Vector3(1, 1, 1);
    }

    /** Moves a freshly initialized particle from shape space into system space. */
    apply(p: Particle): void {
        p.position.multiply(this.scale).applyQuaternion(this.rotation).add(this.position);
        const velocity = p.velocity;
        const speed = velocity.length();
        if (speed === 0) {
            return;
        }
        velocity.multiply(this.scale).applyQuaternion(this.rotation);
        const length = velocity.length();
        if (length > 0) {
            velocity.multiplyScalar(speed / length);
        }
    }

    isIdentity(): boolean {
        const {position: t, rotation: r, scale: s} = this;
        return (
            t.x === 0 &&
            t.y === 0 &&
            t.z === 0 &&
            r.x === 0 &&
            r.y === 0 &&
            r.z === 0 &&
            r.w === 1 &&
            s.x === 1 &&
            s.y === 1 &&
            s.z === 1
        );
    }

    toJSON(): ShapeTransformJSON {
        const json: ShapeTransformJSON = {};
        const {position: t, rotation: r, scale: s} = this;
        if (t.x !== 0 || t.y !== 0 || t.z !== 0) json.position = [t.x, t.y, t.z];
        if (r.x !== 0 || r.y !== 0 || r.z !== 0 || r.w !== 1) json.rotation = [r.x, r.y, r.z, r.w];
        if (s.x !== 1 || s.y !== 1 || s.z !== 1) json.scale = [s.x, s.y, s.z];
        return json;
    }

    /** Returns undefined when there is no transform in the JSON. */
    static fromJSON(json: ShapeTransformJSON | undefined): ShapeTransform | undefined {
        if (!json) {
            return undefined;
        }
        const {position: t, rotation: r, scale: s} = json;
        return new ShapeTransform(
            t ? new Vector3(t[0], t[1], t[2]) : undefined,
            r ? new Quaternion(r[0], r[1], r[2], r[3]) : undefined,
            s ? new Vector3(s[0], s[1], s[2]) : undefined
        );
    }

    /**
     * The `transform` entry of a shape's JSON: empty when the shape has no
     * transform or an identity one, so shapes without one serialize as before.
     */
    static toShapeJSON(transform: ShapeTransform | undefined): {transform?: ShapeTransformJSON} {
        return transform && !transform.isIdentity() ? {transform: transform.toJSON()} : {};
    }

    clone(): ShapeTransform {
        return new ShapeTransform(this.position.clone(), this.rotation.clone(), this.scale.clone());
    }
}
