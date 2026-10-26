import {ConstantValue, FunctionValueGenerator, ValueGenerator, ValueGeneratorFromJSON} from '../functions';
import type {ValueGeneratorJSON} from '../functions/FunctionJSON';
import {Quaternion, Vector3} from '../math';
import {Particle} from '../Particle';
import {ParticleStore} from '../ParticleStore';
import {randomInt} from '../util/MathUtil';
import SimplexNoise from '../util/SimplexNoise';
import {Behavior, BehaviorJSON} from './Behavior';

const GENERATOR_COUNT = 100;
const generators: Array<SimplexNoise | undefined> = new Array(GENERATOR_COUNT);
const tempV = new Vector3();
const tempQ = new Quaternion();
/**
 * The noise read for a particle: four slots of two values, a point of the field going in and the
 * value there coming out in the first, for the X, Y and Z offsets and the angle.
 */
const sampled = new Float64Array(8);

/** Simplex generators are built on first use, so constructing a Noise behavior stays cheap. */
function getGenerator(index: number): SimplexNoise {
    let generator = generators[index];
    if (generator === undefined) {
        // Seeded by slot, so the same effect looks the same on every run.
        generator = new SimplexNoise(index);
        generators[index] = generator;
    }
    return generator;
}

/**
 * Per-particle noise state. Kept as a single object on the particle so the hot
 * update path performs one dynamic property lookup instead of one per field,
 * and so the object shape stays monomorphic.
 */
interface NoiseState {
    lastPos: Vector3;
    lastRot: number;
    lastRotQ: Quaternion | null;
    generatorX: SimplexNoise;
    generatorY: SimplexNoise;
    generatorZ: SimplexNoise;
    generatorW: SimplexNoise;
}

interface NoisyParticle extends Particle {
    _noiseState?: NoiseState;
}

/** The JSON of a noise displacement: a {@link Noise}. */
export interface NoiseJSON extends BehaviorJSON {
    /** The noise frequency. */
    frequency: ValueGeneratorJSON;
    /** The noise strength. */
    power: ValueGeneratorJSON;
    /** How much the noise moves particles. */
    positionAmount?: ValueGeneratorJSON;
    /** How much the noise turns particles. */
    rotationAmount?: ValueGeneratorJSON;
    /** How fast the noise scrolls; 0 when absent. */
    scrollSpeed?: ValueGeneratorJSON;
    /** A curve the noise is remapped through. */
    remap?: ValueGeneratorJSON;
}

/**
 * Jitter particles with smooth noise over their life (Unity's Noise module).
 *
 * Each particle reads its own one-dimensional simplex curves at its age times
 * `frequency`; `power` scales what they return, `positionAmount` and
 * `rotationAmount` say how much of it goes into the position and the
 * rotation. The offset applied last step is removed before this step's is
 * added, so the noise rides on top of the other behaviors instead of
 * accumulating. A billboard's angle turns by W noise × π × amount; a mesh
 * particle turns by the same angle around an axis the X, Y and Z noise choose.
 * The generators are picked per particle from the random source, so a seeded
 * system (see the `Behavior` contract) replays the same noise. Applies in
 * every render mode.
 *
 * Each particle jitters on its own here; for a field that pushes nearby
 * particles alike, so the system swirls, use `TurbulenceField`.
 */
export class Noise implements Behavior {
    type = 'Noise';
    /**
     * Seconds the behavior has run, which scrolls the field.
     * @internal
     */
    duration = 0;

    /**
     * @param frequency - How fast the noise changes along a particle's age (Unity's Frequency).
     * @param power - How strong the noise is (Unity's Strength).
     * @param positionAmount - How much of it moves the position; 1 by default.
     * @param rotationAmount - How much of it turns the rotation; 0 by default.
     * @param scrollSpeed - See the property.
     * @param remap - See the property.
     */
    constructor(
        public frequency: FunctionValueGenerator | ValueGenerator,
        public power: FunctionValueGenerator | ValueGenerator,
        public positionAmount: FunctionValueGenerator | ValueGenerator = new ConstantValue(1),
        public rotationAmount: FunctionValueGenerator | ValueGenerator = new ConstantValue(0),
        /**
         * How fast the noise field moves past the particles (Unity's Scroll
         * Speed), in noise time per second; 0 leaves it still. Sampled once per
         * frame, so a curve is read at t = 0.
         */
        public scrollSpeed: FunctionValueGenerator | ValueGenerator = new ConstantValue(0),
        /**
         * Reshapes the raw noise (Unity's Remap): the curve is read at the
         * noise value mapped from [-1, 1] to [0, 1], and what it returns is
         * used in its place. Unset, the noise is used as is.
         */
        public remap?: FunctionValueGenerator
    ) {
        this.scrollSpeed.startGen(this.scrollMemory);
    }

    /** Noise time the field has scrolled by so far. */
    private scrollOffset = 0;
    private readonly scrollMemory: number[] = [];

    /**
     * Turns `sampled[2 * slot]` and `sampled[2 * slot + 1]`, a point of the noise field, into the
     * noise value `generator` gives there, through the remap when there is one, in
     * `sampled[2 * slot]`. Numbers go in and out through the array, not as arguments and a return
     * value: a number passed to or returned from a call the engine does not inline is boxed, and
     * this runs up to four times per particle per frame.
     */
    private sample(generator: SimplexNoise, memory: number[], slot: number): void {
        const at = slot * 2;
        generator.noise2DInPlace(sampled, at);
        const remap = this.remap;
        if (remap !== undefined) {
            sampled[at] = remap.genValue(memory, (sampled[at] + 1) * 0.5);
        }
    }

    /**
     * Sets every slot of `sampled` to the point the noise is read at for `time`: one line of the
     * field, the same for every generator.
     */
    private static pointAt(time: number): void {
        sampled[0] = sampled[2] = sampled[4] = sampled[6] = 0;
        sampled[1] = sampled[3] = sampled[5] = sampled[7] = time;
    }

    /** {@link Noise.sample} of the X, Y and Z generators, into `sampled[0]`, `[2]` and `[4]`. */
    private sampleOffset(state: NoiseState, memory: number[]): void {
        this.sample(state.generatorX, memory, 0);
        this.sample(state.generatorY, memory, 1);
        this.sample(state.generatorZ, memory, 2);
    }

    initialize(particle: Particle): void {
        // Every per-particle generator gets its slot in the particle's memory: a random one (an
        // interval, two curves) is rolled here, new or recycled, before update reads it.
        const memory = particle.memory;
        this.frequency.startGen(memory);
        this.power.startGen(memory);
        this.positionAmount.startGen(memory);
        this.rotationAmount.startGen(memory);
        this.remap?.startGen(memory);
        const isScalarRotation = typeof particle.rotation === 'number';
        let state = (particle as NoisyParticle)._noiseState;
        if (state === undefined) {
            state = {
                lastPos: new Vector3(),
                lastRot: 0,
                lastRotQ: isScalarRotation ? null : new Quaternion(),
                generatorX: getGenerator(randomInt(0, GENERATOR_COUNT)),
                generatorY: getGenerator(randomInt(0, GENERATOR_COUNT)),
                generatorZ: getGenerator(randomInt(0, GENERATOR_COUNT)),
                generatorW: getGenerator(randomInt(0, GENERATOR_COUNT)),
            };
            (particle as NoisyParticle)._noiseState = state;
            return;
        }
        // Recycled particle: reset the accumulated offsets and re-roll generators.
        state.lastPos.set(0, 0, 0);
        state.lastRot = 0;
        if (isScalarRotation) {
            state.lastRotQ = null;
        } else if (state.lastRotQ === null) {
            state.lastRotQ = new Quaternion();
        } else {
            state.lastRotQ.set(0, 0, 0, 1);
        }
        state.generatorX = getGenerator(randomInt(0, GENERATOR_COUNT));
        state.generatorY = getGenerator(randomInt(0, GENERATOR_COUNT));
        state.generatorZ = getGenerator(randomInt(0, GENERATOR_COUNT));
        state.generatorW = getGenerator(randomInt(0, GENERATOR_COUNT));
    }

    /**
     * Values of the generators that are constants, cached by {@link frameUpdate};
     * NaN where the generator has to be evaluated per particle.
     */
    private _frequency = NaN;
    private _power = NaN;
    private _positionAmount = NaN;
    private _rotationAmount = NaN;

    private static constantOf(generator: FunctionValueGenerator | ValueGenerator): number {
        return generator instanceof ConstantValue ? generator.value : NaN;
    }

    /**
     * Replaces the noise turn applied last step with this step's: an axis-angle
     * turn whose axis comes from the X, Y and Z generators and whose angle, as
     * for a billboard's angle, is the W generator's value times π times
     * `amount`, so `rotationAmount` sets how far a mesh particle wobbles.
     */
    private rotateByNoise(
        rotation: Quaternion,
        state: NoiseState,
        noiseTime: number,
        amount: number,
        memory: number[]
    ): void {
        const last = state.lastRotQ as Quaternion;
        rotation.multiply(last.invert());
        Noise.pointAt(noiseTime);
        this.sampleOffset(state, memory);
        tempV.set(sampled[0], sampled[2], sampled[4]);
        const length = tempV.length();
        if (length > 0) {
            tempV.multiplyScalar(1 / length);
            this.sample(state.generatorW, memory, 3);
            tempQ.setFromAxisAngle(tempV, sampled[6] * Math.PI * amount);
        } else {
            tempQ.set(0, 0, 0, 1);
        }
        rotation.multiply(tempQ);
        last.copy(tempQ);
    }

    update(particle: Particle, _: number): void {
        const state = (particle as NoisyParticle)._noiseState;
        if (state === undefined) {
            return;
        }
        const memory = particle.memory;
        const t = particle.age / particle.life;
        const cf = this._frequency;
        const frequency = cf === cf ? cf : this.frequency.genValue(memory, t);
        const cp = this._power;
        const power = cp === cp ? cp : this.power.genValue(memory, t);
        const cpa = this._positionAmount;
        const positionAmount = cpa === cpa ? cpa : this.positionAmount.genValue(memory, t);
        const cra = this._rotationAmount;
        const rotationAmount = cra === cra ? cra : this.rotationAmount.genValue(memory, t);
        const noiseTime = particle.age * frequency + this.scrollOffset;

        if (positionAmount > 0) {
            const amount = power * positionAmount;
            particle.position.sub(state.lastPos);
            Noise.pointAt(noiseTime);
            this.sampleOffset(state, memory);
            tempV.set(sampled[0] * amount, sampled[2] * amount, sampled[4] * amount);
            particle.position.add(tempV);
            state.lastPos.copy(tempV);
        }

        if (rotationAmount > 0) {
            const amount = power * rotationAmount;
            if (typeof particle.rotation === 'number') {
                Noise.pointAt(noiseTime);
                this.sample(state.generatorW, memory, 3);
                const noise = sampled[6] * Math.PI * amount;
                particle.rotation = particle.rotation - state.lastRot + noise;
                state.lastRot = noise;
            } else if (state.lastRotQ !== null) {
                this.rotateByNoise(particle.rotation as Quaternion, state, noiseTime, amount, memory);
            }
        }
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
        // Each particle still carries its own noise state and simplex
        // generators, but position and angle go through the store's columns
        // rather than the particle's vector views.
        const positions = store.position;
        const rotations = store.rotation;
        const scalars = store.scalars;
        const stride = ParticleStore.SCALAR_STRIDE;
        const cf = this._frequency;
        const cp = this._power;
        const cpa = this._positionAmount;
        const cra = this._rotationAmount;
        for (let i = 0, o3 = 0, s = 0; i < count; i++, o3 += 3, s += stride) {
            const age = scalars[s];
            const life = scalars[s + 1];
            if (age >= life) {
                continue;
            }
            const particle = particles[i] as NoisyParticle;
            const state = particle._noiseState;
            if (state === undefined) {
                continue;
            }
            const memory = particle.memory;
            const t = age / life;
            const frequency = cf === cf ? cf : this.frequency.genValue(memory, t);
            const power = cp === cp ? cp : this.power.genValue(memory, t);
            const positionAmount = cpa === cpa ? cpa : this.positionAmount.genValue(memory, t);
            const rotationAmount = cra === cra ? cra : this.rotationAmount.genValue(memory, t);
            const noiseTime = age * frequency + this.scrollOffset;

            if (positionAmount > 0) {
                const amount = power * positionAmount;
                const lastPos = state.lastPos;
                Noise.pointAt(noiseTime);
                this.sampleOffset(state, memory);
                const nx = sampled[0] * amount;
                const ny = sampled[2] * amount;
                const nz = sampled[4] * amount;
                // Rounded between the two steps as the vector view path is.
                positions[o3] = Math.fround(positions[o3] - lastPos.x) + nx;
                positions[o3 + 1] = Math.fround(positions[o3 + 1] - lastPos.y) + ny;
                positions[o3 + 2] = Math.fround(positions[o3 + 2] - lastPos.z) + nz;
                lastPos.set(nx, ny, nz);
            }

            if (rotationAmount > 0) {
                const amount = power * rotationAmount;
                // A particle that turns by an angle has no quaternion to carry; asked through
                // `rotation`, whose angle-or-quaternion answer is boxed, on every particle.
                if (state.lastRotQ === null) {
                    Noise.pointAt(noiseTime);
                    this.sample(state.generatorW, memory, 3);
                    const noise = sampled[6] * Math.PI * amount;
                    rotations[i] = rotations[i] - state.lastRot + noise;
                    state.lastRot = noise;
                } else {
                    this.rotateByNoise(particle.rotation as Quaternion, state, noiseTime, amount, memory);
                }
            }
        }
    }

    toJSON(): NoiseJSON {
        return {
            type: this.type,
            frequency: this.frequency.toJSON(),
            power: this.power.toJSON(),
            positionAmount: this.positionAmount.toJSON(),
            rotationAmount: this.rotationAmount.toJSON(),
            scrollSpeed: this.scrollSpeed.toJSON(),
            ...(this.remap !== undefined ? {remap: this.remap.toJSON()} : {}),
        };
    }

    frameUpdate(delta: number): void {
        this.duration += delta;
        this.scrollOffset += this.scrollSpeed.genValue(this.scrollMemory, 0) * delta;
        this._frequency = Noise.constantOf(this.frequency);
        this._power = Noise.constantOf(this.power);
        this._positionAmount = Noise.constantOf(this.positionAmount);
        this._rotationAmount = Noise.constantOf(this.rotationAmount);
    }

    /** Reads {@link Noise.toJSON} output; a field the JSON leaves out takes its default. */
    static fromJSON(json: NoiseJSON): Behavior {
        return new Noise(
            ValueGeneratorFromJSON(json.frequency),
            ValueGeneratorFromJSON(json.power),
            // Files written before the amounts existed take the constructor's.
            json.positionAmount ? ValueGeneratorFromJSON(json.positionAmount) : undefined,
            json.rotationAmount ? ValueGeneratorFromJSON(json.rotationAmount) : undefined,
            json.scrollSpeed ? ValueGeneratorFromJSON(json.scrollSpeed) : new ConstantValue(0),
            json.remap ? (ValueGeneratorFromJSON(json.remap) as FunctionValueGenerator) : undefined
        );
    }

    clone(): Behavior {
        return new Noise(
            this.frequency.clone(),
            this.power.clone(),
            this.positionAmount.clone(),
            this.rotationAmount.clone(),
            this.scrollSpeed.clone(),
            this.remap?.clone() as FunctionValueGenerator | undefined
        );
    }

    reset(): void {
        this.scrollOffset = 0;
    }
}
