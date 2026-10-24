import type {Vector3Like} from '../Like';
import {Particle} from '../Particle';
import {ParticleStore} from '../ParticleStore';
import type {Vector3ArrayJSON} from '../functions/FunctionJSON';
import {Vector3} from '../math';
import {vector3From} from '../math/fromLike';
import {readVector3} from '../util/JSONUtil';
import SimplexNoise from '../util/SimplexNoise';
import {createSeededRandom} from '../util/random';
import {Behavior, BehaviorJSON} from './Behavior';

/** Reciprocal of a scale component; a zero scale samples the field at 0 along that axis instead of dividing by it. */
function inverseOf(scale: number): number {
    return scale === 0 ? 0 : 1 / scale;
}

/** The JSON of a turbulence field: a {@link TurbulenceField}. */
export interface TurbulenceFieldJSON extends BehaviorJSON {
    /** The field's scale. */
    scale?: Vector3ArrayJSON;
    /** Noise octaves; 1 when absent. */
    octaves?: number;
    /** The velocity it adds, per axis. */
    velocityMultiplier?: Vector3ArrayJSON;
    /** How fast it changes, per axis. */
    timeScale?: Vector3ArrayJSON;
    /** The noise seed; 0 when absent. */
    seed?: number;
}

/**
 * Push particles around with a turbulent vector field sampled at their
 * position (Unity's Noise module in its Position mode, Niagara's Curl Noise
 * Force): nearby particles are pushed alike, so the system swirls instead of
 * jittering.
 *
 * The field is three channels of four-dimensional simplex noise, `octaves`
 * layers deep, each layer twice as fine and half as strong as the one before.
 * `scale` is the size of one noise cell per axis in the simulation space (a
 * zero component gives no variation along that axis), `velocityMultiplier` the
 * push per axis in units per second squared, and `timeScale` how fast the
 * field drifts per axis. The field is built from `seed`, so the same settings
 * give the same field on every run and a clone or a saved copy swirls
 * identically; give each system its own seed for different fields. Applies in
 * every render mode.
 *
 * For each particle wobbling on its own curve instead, or for noise in the
 * rotation, use `Noise`.
 */
export class TurbulenceField implements Behavior {
    type = 'TurbulenceField';
    /**
     * The noise the field samples.
     * @internal
     */
    generator: SimplexNoise;
    /** Where in time the field is sampled now; starts at {@link initialOffset} and drifts by `timeScale`. */
    timeOffset = new Vector3();
    /** The time offset the field starts from, derived from {@link seed}; restored by {@link reset}. */
    readonly initialOffset = new Vector3();
    /**
     * Scratch value.
     * @internal
     */
    temp = new Vector3();
    /**
     * Scratch value.
     * @internal
     */
    temp2 = new Vector3();

    private _scaleValue: Vector3;

    /**
     * Size of one noise cell per axis, in the simulation space.
     * Set it from any `Vector3Like`, such as a Babylon `Vector3`; the value is copied.
     */
    get scale(): Vector3 {
        return this._scaleValue;
    }

    set scale(value: Vector3Like) {
        this._scaleValue = vector3From(value);
    }
    private _velocityMultiplierValue: Vector3;

    /**
     * Push per axis, in units per second squared.
     * Set it from any `Vector3Like`, such as a Babylon `Vector3`; the value is copied.
     */
    get velocityMultiplier(): Vector3 {
        return this._velocityMultiplierValue;
    }

    set velocityMultiplier(value: Vector3Like) {
        this._velocityMultiplierValue = vector3From(value);
    }
    private _timeScaleValue: Vector3;

    /**
     * How fast the field drifts per axis, in noise time per second.
     * Set it from any `Vector3Like`, such as a Babylon `Vector3`; the value is copied.
     */
    get timeScale(): Vector3 {
        return this._timeScaleValue;
    }

    set timeScale(value: Vector3Like) {
        this._timeScaleValue = vector3From(value);
    }

    constructor(
        /** Size of one noise cell per axis, in the simulation space. */
        scale: Vector3Like,
        /** How many layers of noise are summed; more is finer and dearer. */
        public octaves: number,
        /** Push per axis, in units per second squared. */
        velocityMultiplier: Vector3Like,
        /** How fast the field drifts per axis, in noise time per second. */
        timeScale: Vector3Like,
        /** The seed the field is built from; 0 by default. */
        public seed = 0
    ) {
        this._scaleValue = vector3From(scale);
        this._velocityMultiplierValue = vector3From(velocityMultiplier);
        this._timeScaleValue = vector3From(timeScale);
        const random = createSeededRandom(seed);
        this.generator = new SimplexNoise(random);
        this.initialOffset.set(
            random() * inverseOf(scale.x) * timeScale.x,
            random() * inverseOf(scale.y) * timeScale.y,
            random() * inverseOf(scale.z) * timeScale.z
        );
        this.timeOffset.copy(this.initialOffset);
    }

    initialize(particle: Particle): void {}

    update(particle: Particle, delta: number): void {
        const x = particle.position.x * inverseOf(this.scale.x);
        const y = particle.position.y * inverseOf(this.scale.y);
        const z = particle.position.z * inverseOf(this.scale.z);

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
        const inverseScaleX = inverseOf(this.scale.x);
        const inverseScaleY = inverseOf(this.scale.y);
        const inverseScaleZ = inverseOf(this.scale.z);
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

    toJSON(): TurbulenceFieldJSON {
        return {
            type: this.type,
            scale: [this.scale.x, this.scale.y, this.scale.z],
            octaves: this.octaves,
            velocityMultiplier: [this.velocityMultiplier.x, this.velocityMultiplier.y, this.velocityMultiplier.z],
            timeScale: [this.timeScale.x, this.timeScale.y, this.timeScale.z],
            ...(this.seed !== 0 ? {seed: this.seed} : {}),
        };
    }

    frameUpdate(delta: number): void {
        this.timeOffset.x += delta * this.timeScale.x;
        this.timeOffset.y += delta * this.timeScale.y;
        this.timeOffset.z += delta * this.timeScale.z;
    }

    /**
     * Reads {@link TurbulenceField.toJSON} output; a field the JSON leaves out takes its default.
     */
    static fromJSON(json: TurbulenceFieldJSON): Behavior {
        return new TurbulenceField(
            readVector3(json.scale, new Vector3(1, 1, 1)),
            typeof json.octaves === 'number' ? json.octaves : 1,
            readVector3(json.velocityMultiplier, new Vector3(1, 1, 1)),
            readVector3(json.timeScale, new Vector3(1, 1, 1)),
            typeof json.seed === 'number' ? json.seed : 0
        );
    }

    clone(): Behavior {
        return new TurbulenceField(
            this.scale.clone(),
            this.octaves,
            this.velocityMultiplier.clone(),
            this.timeScale.clone(),
            this.seed
        );
    }

    /** Rewinds the field's drift to where it started, so a restarted system swirls the same way. */
    reset(): void {
        this.timeOffset.copy(this.initialOffset);
    }
}
