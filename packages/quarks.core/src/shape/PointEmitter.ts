import {IParticleSystem} from '../IParticleSystem';
import {Particle} from '../Particle';
import {random} from '../util/random';
import {EmitterShape, ShapeJSON} from './EmitterUtil';
import {ShapeTransform} from './ShapeTransform';

/**
 * A point emitter emits particles from a single point.
 */
export class PointEmitter implements EmitterShape {
    /** Always `'point'`. */
    type = 'point';

    /**
     * Offset, rotation and scale of the point within the particle system.
     * {@link ShapeTransform}
     */
    transform?: ShapeTransform;

    constructor(transform?: ShapeTransform) {
        this.transform = transform;
    }

    /** Does nothing: the point has no state. */
    update(system: IParticleSystem, delta: number): void {}

    /** Starts `p` at the origin, heading in a uniformly random direction at its start speed. */
    initialize(p: Particle) {
        // A direction uniform over the unit sphere; the speed is the particle's start speed as
        // it is, like every other shape (and Unity's point-like shapes).
        const u = random();
        const v = random();
        const theta = u * Math.PI * 2;
        const cosPhi = 2.0 * v - 1.0;
        const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
        p.velocity.x = sinPhi * Math.cos(theta);
        p.velocity.y = sinPhi * Math.sin(theta);
        p.velocity.z = cosPhi;
        p.velocity.multiplyScalar(p.startSpeed);

        p.position.setScalar(0);

        this.transform?.apply(p);
    }

    /** The shape's JSON. */
    toJSON(): ShapeJSON {
        return {
            type: 'point',
            ...ShapeTransform.toShapeJSON(this.transform),
        };
    }

    /** Reads {@link PointEmitter.toJSON} output. */
    static fromJSON(json: ShapeJSON): PointEmitter {
        return new PointEmitter(ShapeTransform.fromJSON(json?.transform));
    }

    /** A copy with the same transform. */
    clone(): EmitterShape {
        return new PointEmitter(this.transform?.clone());
    }
}
