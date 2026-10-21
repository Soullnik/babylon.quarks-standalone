import {Particle} from '../Particle';
import {ParticleStore} from '../ParticleStore';
import {Vector3} from '../math';
import {readVector3} from '../util/JSONUtil';
import SimplexNoise from '../util/SimplexNoise';
import {random} from '../util/random';
import {Behavior} from './Behavior';

/**
 * Apply turbulence to particles.
 */
export class TurbulenceField implements Behavior {
    type = 'TurbulenceField';
    generator = new SimplexNoise(random);
    timeOffset = new Vector3();
    temp = new Vector3();
    temp2 = new Vector3();

    constructor(
        public scale: Vector3,
        public octaves: number,
        public velocityMultiplier: Vector3,
        public timeScale: Vector3
    ) {
        this.timeOffset.x = (random() / this.scale.x) * this.timeScale.x;
        this.timeOffset.y = (random() / this.scale.y) * this.timeScale.y;
        this.timeOffset.z = (random() / this.scale.z) * this.timeScale.z;
    }

    initialize(particle: Particle): void {}

    update(particle: Particle, delta: number): void {
        const x = particle.position.x / this.scale.x;
        const y = particle.position.y / this.scale.y;
        const z = particle.position.z / this.scale.z;

        this.temp.set(0, 0, 0);
        let lvl = 1;
        for (let i = 0; i < this.octaves; i++) {
            this.temp2.set(
                this.generator.noise4D(x * lvl, y * lvl, z * lvl, this.timeOffset.x * lvl) / lvl,
                this.generator.noise4D(x * lvl, y * lvl, z * lvl, this.timeOffset.y * lvl) / lvl,
                this.generator.noise4D(x * lvl, y * lvl, z * lvl, this.timeOffset.z * lvl) / lvl
            );
            this.temp.add(this.temp2);
            lvl *= 2;
        }
        this.temp.multiply(this.velocityMultiplier);
        particle.velocity.addScaledVector(this.temp, delta);
    }

    updateAll(particles: Array<Particle>, count: number, delta: number): void {
        const store = count > 0 ? (particles[0] as Particle & {store?: ParticleStore}).store : undefined;
        if (store === undefined) {
            for (let i = 0; i < count; i++) {
                const particle = particles[i];
                if (particle.age < particle.life) {
                    this.update(particle, delta);
                }
            }
            return;
        }
        // Everything but the noise itself is hoisted: the inverse scale, the
        // per-octave time offsets and the velocity multiplier.
        const positions = store.position;
        const velocities = store.velocity;
        const scalars = store.scalars;
        const stride = ParticleStore.SCALAR_STRIDE;
        const generator = this.generator;
        const octaves = this.octaves;
        const inverseScaleX = 1 / this.scale.x;
        const inverseScaleY = 1 / this.scale.y;
        const inverseScaleZ = 1 / this.scale.z;
        const multiplierX = this.velocityMultiplier.x * delta;
        const multiplierY = this.velocityMultiplier.y * delta;
        const multiplierZ = this.velocityMultiplier.z * delta;
        const timeX = this.timeOffset.x;
        const timeY = this.timeOffset.y;
        const timeZ = this.timeOffset.z;
        for (let i = 0, o3 = 0, s = 0; i < count; i++, o3 += 3, s += stride) {
            if (scalars[s] >= scalars[s + 1]) {
                continue;
            }
            const x = positions[o3] * inverseScaleX;
            const y = positions[o3 + 1] * inverseScaleY;
            const z = positions[o3 + 2] * inverseScaleZ;
            let tx = 0;
            let ty = 0;
            let tz = 0;
            let lvl = 1;
            for (let octave = 0; octave < octaves; octave++) {
                const lx = x * lvl;
                const ly = y * lvl;
                const lz = z * lvl;
                tx += generator.noise4D(lx, ly, lz, timeX * lvl) / lvl;
                ty += generator.noise4D(lx, ly, lz, timeY * lvl) / lvl;
                tz += generator.noise4D(lx, ly, lz, timeZ * lvl) / lvl;
                lvl *= 2;
            }
            velocities[o3] += tx * multiplierX;
            velocities[o3 + 1] += ty * multiplierY;
            velocities[o3 + 2] += tz * multiplierZ;
        }
    }

    toJSON(): any {
        return {
            type: this.type,
            scale: [this.scale.x, this.scale.y, this.scale.z],
            octaves: this.octaves,
            velocityMultiplier: [this.velocityMultiplier.x, this.velocityMultiplier.y, this.velocityMultiplier.z],
            timeScale: [this.timeScale.x, this.timeScale.y, this.timeScale.z],
        };
    }

    frameUpdate(delta: number): void {
        this.timeOffset.x += delta * this.timeScale.x;
        this.timeOffset.y += delta * this.timeScale.y;
        this.timeOffset.z += delta * this.timeScale.z;
    }

    static fromJSON(json: any): Behavior {
        return new TurbulenceField(
            readVector3(json.scale, new Vector3(1, 1, 1)),
            typeof json.octaves === 'number' ? json.octaves : 1,
            readVector3(json.velocityMultiplier, new Vector3(1, 1, 1)),
            readVector3(json.timeScale, new Vector3(1, 1, 1))
        );
    }

    clone(): Behavior {
        return new TurbulenceField(
            this.scale.clone(),
            this.octaves,
            this.velocityMultiplier.clone(),
            this.timeScale.clone()
        );
    }
    reset(): void {}
}
