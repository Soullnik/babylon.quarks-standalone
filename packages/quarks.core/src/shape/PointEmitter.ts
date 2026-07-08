import {EmitterShape, ShapeJSON} from './EmitterUtil';
import {Particle} from '../Particle';
import {IParticleSystem} from '../IParticleSystem';
import { Matrix4, Quaternion } from '../math';
import { UP_VEC3, ZERO_VEC3 } from '../util/MathUtil';

/**
 * A point emitter emits particles from a single point.
 */
export class PointEmitter implements EmitterShape {
    type = 'point';

    _m1: Matrix4;
    
    constructor() {
        this._m1 = new Matrix4();
    }

    update(system: IParticleSystem, delta: number): void {}

    initialize(p: Particle) {
        const u = Math.random();
        const v = Math.random();
        const theta = u * Math.PI * 2;
        const phi = Math.acos(2.0 * v - 1.0);
        const r = Math.cbrt(Math.random());
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        p.velocity.x = r * sinPhi * cosTheta;
        p.velocity.y = r * sinPhi * sinTheta;
        p.velocity.z = r * cosPhi;
        p.velocity.multiplyScalar(p.startSpeed);

        p.position.setScalar(0);

        // Only set a default facing-along-velocity orientation if the user's
        // startRotation didn't already write a non-identity rotation.
        // (lookAt(ZERO, p.position, UP) would be degenerate here since
        // p.position is zero — use velocity instead.)
        if (p.rotation instanceof Quaternion) {
            const r = p.rotation;
            if (r.x === 0 && r.y === 0 && r.z === 0 && r.w === 1) {
                this._m1.lookAt(ZERO_VEC3, p.velocity, UP_VEC3);
                p.rotation.setFromRotationMatrix(this._m1);
            }
        }
    }

    toJSON(): ShapeJSON {
        return {
            type: 'point',
        };
    }

    static fromJSON(json: any): PointEmitter {
        return new PointEmitter();
    }

    clone(): EmitterShape {
        return new PointEmitter();
    }
}
