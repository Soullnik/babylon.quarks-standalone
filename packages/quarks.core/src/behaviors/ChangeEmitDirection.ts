import {Particle} from '../Particle';
import {GeneratorMemory} from '../functions/GeneratorMemory';
import {ValueGenerator, ValueGeneratorFromJSON} from '../functions/ValueGenerator';
import {Quaternion, Vector3} from '../math';
import {random} from '../util/random';
import {Behavior} from './Behavior';
/**
 * Turns each new particle's velocity away from its emit direction by `angle` (radians), about
 * a random axis perpendicular to it, keeping its speed. `angle` may be a constant or a
 * random range; it is rolled once per particle.
 */
export class ChangeEmitDirection implements Behavior {
    type = 'ChangeEmitDirection';
    /**
     * Scratch value.
     * @internal
     */
    _temp: Vector3 = new Vector3();
    /**
     * Scratch value.
     * @internal
     */
    _q: Quaternion = new Quaternion();
    /** Scratch for the angle generator's per-spawn sample; cleared before every spawn. */
    memory: GeneratorMemory = [];

    /**
     * @param angle - How far each new particle's direction turns, in radians; rolled once per
     *   particle.
     */
    constructor(public angle: ValueGenerator) {}

    initialize(particle: Particle): void {
        const len = particle.velocity.length();
        if (len == 0) return;
        particle.velocity.normalize();
        if (particle.velocity.x === 0 && particle.velocity.y === 0) {
            this._temp.set(0, particle.velocity.z, 0);
        } else {
            this._temp.set(-particle.velocity.y, particle.velocity.x, 0);
        }
        this.memory.length = 0;
        this.angle.startGen(this.memory);
        this._q.setFromAxisAngle(this._temp.normalize(), this.angle.genValue(this.memory));
        this._temp.copy(particle.velocity);
        particle.velocity.applyQuaternion(this._q);
        this._q.setFromAxisAngle(this._temp, random() * Math.PI * 2);
        particle.velocity.applyQuaternion(this._q);
        particle.velocity.setLength(len);
    }

    update(particle: Particle, delta: number): void {}

    frameUpdate(delta: number): void {}

    toJSON(): any {
        return {
            type: this.type,
            angle: this.angle.toJSON(),
        };
    }

    /**
     * Reads {@link ChangeEmitDirection.toJSON} output; a field the JSON leaves out takes its
     * default.
     */
    static fromJSON(json: any): Behavior {
        return new ChangeEmitDirection(ValueGeneratorFromJSON(json.angle) as ValueGenerator);
    }

    clone(): Behavior {
        return new ChangeEmitDirection(this.angle.clone());
    }
    reset(): void {
        this.memory.length = 0;
    }
}
