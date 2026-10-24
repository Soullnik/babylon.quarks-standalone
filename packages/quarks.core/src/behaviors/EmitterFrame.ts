import {IParticleSystem} from '../IParticleSystem';
import {Quaternion, Vector3} from '../math';

/**
 * The space a behavior's vectors are authored in, as Unity's Space setting on
 * Velocity over Lifetime and Force over Lifetime:
 *
 * - `'local'`: the emitter's own axes and units, so the vector turns and
 *   scales with the emitter;
 * - `'world'`: the world's axes, however the emitter is placed.
 *
 * The behavior converts the vector into the space the system simulates in
 * (`IParticleSystem.worldSpace`), so a setting means the same thing in a local
 * and in a world-space system.
 */
export type BehaviorSpace = 'local' | 'world';

/** Reads a space from JSON: `'local'` or `'world'` as written, `fallback` for anything else. */
export function readBehaviorSpace(value: unknown, fallback: BehaviorSpace): BehaviorSpace {
    return value === 'world' || value === 'local' ? value : fallback;
}

/** Reciprocal of a scale component; a zero scale maps to 0 instead of infinity. */
function inverseOf(scale: number): number {
    return scale === 0 ? 0 : 1 / scale;
}

/**
 * The emitter's world transform, decomposed once per frame, with the
 * conversions a behavior needs to move a vector or a point between the space
 * it was authored in and the space the particles simulate in.
 *
 * Call {@link refresh} from `frameUpdate`. Before the first refresh the frame
 * is the identity, so a conversion is a no-op. The transform read is the
 * emitter's matrix as the host set it for the frame; a host that runs several
 * simulation steps per frame interpolates the emitter's motion for emission,
 * but the behaviors see the frame's end position.
 */
export class EmitterFrame {
    /** The emitter's world position. */
    readonly position = new Vector3();
    /** The emitter's world rotation. */
    readonly quaternion = new Quaternion();
    /** The scale per axis of the emitter's `matrixWorld`, which its scaling mode sets. */
    readonly scale = new Vector3(1, 1, 1);
    /** Inverse of {@link quaternion}. */
    readonly quaternionInverse = new Quaternion();
    /** Reciprocal of {@link scale} per axis, 0 where the scale is 0. */
    readonly scaleInverse = new Vector3(1, 1, 1);

    /** Decomposes the emitter's current world matrix. */
    refresh(particleSystem: IParticleSystem): void {
        particleSystem.emitter.matrixWorld.decompose(this.position, this.quaternion, this.scale);
        this.quaternionInverse.copy(this.quaternion).invert();
        this.scaleInverse.set(inverseOf(this.scale.x), inverseOf(this.scale.y), inverseOf(this.scale.z));
    }

    /**
     * Converts the direction `vector`, authored in `space`, into the simulation
     * space of a system that simulates in world space when `worldSpace` is
     * true. A vector already in the simulation space is left as it is.
     */
    toSimulation(vector: Vector3, space: BehaviorSpace, worldSpace: boolean): Vector3 {
        if (worldSpace && space === 'local') {
            vector.multiply(this.scale).applyQuaternion(this.quaternion);
        } else if (!worldSpace && space === 'world') {
            vector.applyQuaternion(this.quaternionInverse).multiply(this.scaleInverse);
        }
        return vector;
    }

    /**
     * The inverse of {@link toSimulation}: converts the direction `vector`, in the simulation
     * space, into `space`. A vector already in `space` is left as it is.
     */
    fromSimulation(vector: Vector3, space: BehaviorSpace, worldSpace: boolean): Vector3 {
        if (worldSpace && space === 'local') {
            vector.applyQuaternion(this.quaternionInverse).multiply(this.scaleInverse);
        } else if (!worldSpace && space === 'world') {
            vector.multiply(this.scale).applyQuaternion(this.quaternion);
        }
        return vector;
    }

    /**
     * Converts the point `point`, authored in `space`, into the simulation
     * space, as {@link toSimulation} does for a direction but with the
     * emitter's position taken into account.
     */
    pointToSimulation(point: Vector3, space: BehaviorSpace, worldSpace: boolean): Vector3 {
        if (worldSpace && space === 'local') {
            point.multiply(this.scale).applyQuaternion(this.quaternion).add(this.position);
        } else if (!worldSpace && space === 'world') {
            point.sub(this.position).applyQuaternion(this.quaternionInverse).multiply(this.scaleInverse);
        }
        return point;
    }
}
