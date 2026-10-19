import {Particle} from '../Particle';
import {ParticleStore} from '../ParticleStore';
import {ConstantValue, FunctionValueGenerator, ValueGenerator, ValueGeneratorFromJSON} from '../functions';
import {Quaternion, Vector3} from '../math';
import {randomInt} from '../util/MathUtil';
import SimplexNoise from '../util/SimplexNoise';
import {Behavior} from './Behavior';

const GENERATOR_COUNT = 100;
const generators: Array<SimplexNoise | undefined> = new Array(GENERATOR_COUNT);
const tempV = new Vector3();
const tempQ = new Quaternion();

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

/**
 * Apply noise to particles.
 */
export class Noise implements Behavior {
    type = 'Noise';
    duration = 0;

    constructor(
        public frequency: FunctionValueGenerator | ValueGenerator,
        public power: FunctionValueGenerator | ValueGenerator,
        public positionAmount: FunctionValueGenerator | ValueGenerator = new ConstantValue(1),
        public rotationAmount: FunctionValueGenerator | ValueGenerator = new ConstantValue(0)
    ) {}

    initialize(particle: Particle): void {
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
        const noiseTime = particle.age * frequency;

        if (positionAmount > 0) {
            const amount = power * positionAmount;
            particle.position.sub(state.lastPos);
            tempV.set(
                state.generatorX.noise2D(0, noiseTime) * amount,
                state.generatorY.noise2D(0, noiseTime) * amount,
                state.generatorZ.noise2D(0, noiseTime) * amount
            );
            particle.position.add(tempV);
            state.lastPos.copy(tempV);
        }

        if (rotationAmount > 0) {
            const amount = power * rotationAmount;
            if (typeof particle.rotation === 'number') {
                const noise = state.generatorW.noise2D(0, noiseTime) * Math.PI * amount;
                particle.rotation = particle.rotation - state.lastRot + noise;
                state.lastRot = noise;
            } else if (state.lastRotQ !== null) {
                const rotation = particle.rotation as Quaternion;
                state.lastRotQ.invert();
                rotation.multiply(state.lastRotQ);
                tempQ
                    .set(
                        state.generatorX.noise2D(0, noiseTime) * amount,
                        state.generatorY.noise2D(0, noiseTime) * amount,
                        state.generatorZ.noise2D(0, noiseTime) * amount,
                        state.generatorW.noise2D(0, noiseTime) * amount
                    )
                    .normalize();
                rotation.multiply(tempQ);
                state.lastRotQ.copy(tempQ);
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
            const noiseTime = age * frequency;

            if (positionAmount > 0) {
                const amount = power * positionAmount;
                const lastPos = state.lastPos;
                const nx = state.generatorX.noise2D(0, noiseTime) * amount;
                const ny = state.generatorY.noise2D(0, noiseTime) * amount;
                const nz = state.generatorZ.noise2D(0, noiseTime) * amount;
                // Rounded between the two steps as the vector view path is.
                positions[o3] = Math.fround(positions[o3] - lastPos.x) + nx;
                positions[o3 + 1] = Math.fround(positions[o3 + 1] - lastPos.y) + ny;
                positions[o3 + 2] = Math.fround(positions[o3 + 2] - lastPos.z) + nz;
                lastPos.set(nx, ny, nz);
            }

            if (rotationAmount > 0) {
                const amount = power * rotationAmount;
                if (typeof particle.rotation === 'number') {
                    const noise = state.generatorW.noise2D(0, noiseTime) * Math.PI * amount;
                    rotations[i] = rotations[i] - state.lastRot + noise;
                    state.lastRot = noise;
                } else if (state.lastRotQ !== null) {
                    const rotation = particle.rotation as Quaternion;
                    state.lastRotQ.invert();
                    rotation.multiply(state.lastRotQ);
                    tempQ
                        .set(
                            state.generatorX.noise2D(0, noiseTime) * amount,
                            state.generatorY.noise2D(0, noiseTime) * amount,
                            state.generatorZ.noise2D(0, noiseTime) * amount,
                            state.generatorW.noise2D(0, noiseTime) * amount
                        )
                        .normalize();
                    rotation.multiply(tempQ);
                    state.lastRotQ.copy(tempQ);
                }
            }
        }
    }

    toJSON(): any {
        return {
            type: this.type,
            frequency: this.frequency.toJSON(),
            power: this.power.toJSON(),
            positionAmount: this.positionAmount.toJSON(),
            rotationAmount: this.rotationAmount.toJSON(),
        };
    }

    frameUpdate(delta: number): void {
        this.duration += delta;
        this._frequency = Noise.constantOf(this.frequency);
        this._power = Noise.constantOf(this.power);
        this._positionAmount = Noise.constantOf(this.positionAmount);
        this._rotationAmount = Noise.constantOf(this.rotationAmount);
    }

    static fromJSON(json: any): Behavior {
        return new Noise(
            ValueGeneratorFromJSON(json.frequency),
            ValueGeneratorFromJSON(json.power),
            ValueGeneratorFromJSON(json.positionAmount),
            ValueGeneratorFromJSON(json.rotationAmount)
        );
    }

    clone(): Behavior {
        return new Noise(
            this.frequency.clone(),
            this.power.clone(),
            this.positionAmount.clone(),
            this.rotationAmount.clone()
        );
    }

    reset(): void {}
}
