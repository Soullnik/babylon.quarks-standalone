import {Particle} from '../Particle';
import {FunctionValueGenerator, ValueGenerator, ValueGeneratorFromJSON} from '../functions';
import {Quaternion, Vector3} from '../math';
import {Behavior} from './Behavior';

/**
 * Orbit particles around an axis over their life.
 */
export class OrbitOverLife implements Behavior {
    type = 'OrbitOverLife';
    rotation: Quaternion;
    temp = new Vector3();

    constructor(
        public orbitSpeed: FunctionValueGenerator | ValueGenerator,
        public axis: Vector3 = new Vector3(0, 1, 0)
    ) {
        this.rotation = new Quaternion();
    }

    initialize(particle: Particle): void {
        this.orbitSpeed.startGen(particle.memory);
    }

    update(particle: Particle, delta: number): void {
        this.temp.copy(particle.position).projectOnVector(this.axis);
        this.rotation.setFromAxisAngle(
            this.axis,
            this.orbitSpeed.genValue(particle.memory, particle.age / particle.life) * delta
        );
        particle.position.sub(this.temp);
        particle.position.applyQuaternion(this.rotation);
        particle.position.add(this.temp);
    }

    updateAll(particles: Array<Particle>, count: number, delta: number): void {
        const generator = this.orbitSpeed;
        const axis = this.axis;
        const temp = this.temp;
        const rotation = this.rotation;
        for (let i = 0; i < count; i++) {
            const particle = particles[i];
            if (particle.age >= particle.life) {
                continue;
            }
            const position = particle.position;
            temp.copy(position).projectOnVector(axis);
            rotation.setFromAxisAngle(axis, generator.genValue(particle.memory, particle.age / particle.life) * delta);
            position.sub(temp);
            position.applyQuaternion(rotation);
            position.add(temp);
        }
    }

    frameUpdate(delta: number): void {}

    toJSON(): any {
        return {
            type: this.type,
            orbitSpeed: this.orbitSpeed.toJSON(),
            axis: [this.axis.x, this.axis.y, this.axis.z],
        };
    }

    static fromJSON(json: any): Behavior {
        return new OrbitOverLife(
            ValueGeneratorFromJSON(json.orbitSpeed) as FunctionValueGenerator,
            json.axis ? new Vector3(json.axis[0], json.axis[1], json.axis[2]) : undefined
        );
    }

    clone(): Behavior {
        return new OrbitOverLife(this.orbitSpeed.clone());
    }
    reset(): void {}
}
