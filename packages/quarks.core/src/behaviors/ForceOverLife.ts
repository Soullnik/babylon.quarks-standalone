import {FunctionValueGenerator, GeneratorMemory, ValueGenerator, ValueGeneratorFromJSON} from '../functions';
import type {ValueGeneratorJSON} from '../functions/FunctionJSON';
import {IParticleSystem} from '../IParticleSystem';
import {Vector3} from '../math';
import {Particle} from '../Particle';
import {Behavior, BehaviorJSON} from './Behavior';
import {BehaviorSpace, EmitterFrame, readBehaviorSpace} from './EmitterFrame';
import {stepEndLife} from './stepAge';

/** The JSON of a force over life: a {@link ForceOverLife}. */
export interface ForceOverLifeJSON extends BehaviorJSON {
    /** The X component. */
    x: ValueGeneratorJSON;
    /** The Y component. */
    y: ValueGeneratorJSON;
    /** The Z component. */
    z: ValueGeneratorJSON;
    /** The space the force is in; `'world'` when absent. */
    space?: BehaviorSpace;
    /** Whether random values are picked again every step; false when absent. Written only when true. */
    randomized?: boolean;
    /** Whether the force scales with the emitter; true when absent. Written only when false. */
    scaleWithEmitter?: boolean;
}

/**
 * Accelerate particles by a force that changes over their life, one curve per
 * axis (Unity's Force over Lifetime).
 *
 * The force is in units per second squared, authored in {@link space}: world
 * axes by default, or the emitter's own axes with `'local'`, in which case it
 * turns with the emitter. Either way it scales with the emitter, as Unity's does:
 * a world force is multiplied by the system's `motionScale` in a world-space
 * system, and only turned into the emitter's axes in a local-space one, whose
 * frame scales it. Without {@link scaleWithEmitter} it keeps its strength in
 * world units however the emitter is scaled, as Unity's gravity does.
 * With {@link randomized}, a random force (a random range or random between curves) is picked
 * again every step, as Unity's Randomize does.
 * Applies in every render mode.
 */
export class ForceOverLife implements Behavior {
    type = 'ForceOverLife';
    /**
     * Scratch value.
     * @internal
     */
    _temp = new Vector3();
    /** Learned in {@link initialize}, so undefined until this behavior sees a particle. */
    ps?: IParticleSystem;
    /** The emitter's transform this frame, refreshed by {@link frameUpdate}. */
    readonly _frame = new EmitterFrame();

    initialize(particle: Particle, particleSystem: IParticleSystem): void {
        this.ps = particleSystem;
        this.x.startGen(particle.memory);
        this.y.startGen(particle.memory);
        this.z.startGen(particle.memory);
    }

    constructor(
        /** Force along X over the particle's life, in units per second squared. */
        public x: FunctionValueGenerator | ValueGenerator,
        /** Force along Y over the particle's life, in units per second squared. */
        public y: FunctionValueGenerator | ValueGenerator,
        /** Force along Z over the particle's life, in units per second squared. */
        public z: FunctionValueGenerator | ValueGenerator,
        /** The space the force is authored in; `'world'` by default. */
        public space: BehaviorSpace = 'world',
        /**
         * Whether a random component (an {@link IntervalValue} or a {@link RandomBetweenCurves})
         * picks a new value every step instead of once per particle, as Unity's Randomize of Force
         * over Lifetime: the force jitters from step to step and averages out over the range,
         * rather than pushing each particle steadily its own way. False by default. A component
         * that is not random reads the same either way.
         */
        public randomized = false,
        /**
         * Whether the force scales with the emitter, as Unity's Force over Lifetime does; true by
         * default. False keeps its strength in world units however the emitter or its parents are
         * scaled, in either simulation space, as Unity's gravity (the Gravity Modifier) does: a
         * smaller copy of an effect then falls as fast as the full-size one.
         */
        public scaleWithEmitter = true
    ) {}

    /**
     * Rolls the random components of a {@link randomized} force again for `memory`'s particle.
     * @internal
     */
    _reroll(memory: GeneratorMemory): void {
        this.x.reroll?.(memory);
        this.y.reroll?.(memory);
        this.z.reroll?.(memory);
    }

    /**
     * Adds the force at life fraction `t`, times `step` (see {@link _step}), to the particle's
     * velocity, picked again first when {@link randomized}. The fused pass runs a randomized
     * force through it.
     * @internal
     */
    _apply(particle: Particle, t: number, step: number): void {
        const memory = particle.memory;
        if (this.randomized) {
            this._reroll(memory);
        }
        this._temp.set(this.x.genValue(memory, t), this.y.genValue(memory, t), this.z.genValue(memory, t));
        // Undefined until initialize() has run for this behavior; treat an
        // unknown system as world space rather than throwing.
        const worldSpace = this.ps === undefined || this.ps.worldSpace;
        this._frame.forceToSimulation(this._temp, this.space, worldSpace, this.scaleWithEmitter);
        particle.velocity.addScaledVector(this._temp, step);
    }

    /**
     * What the force is multiplied by before it reaches the velocity: the
     * step, and the system's `motionScale` for a world force in a world-space
     * system that scales with the emitter. An unknown system (before
     * {@link initialize}) counts as world space.
     */
    _step(delta: number): number {
        const system = this.ps;
        const worldSpace = system === undefined || system.worldSpace;
        return worldSpace && this.space === 'world' && this.scaleWithEmitter
            ? delta * (system?.motionScale ?? 1)
            : delta;
    }

    update(particle: Particle, delta: number): void {
        this._apply(particle, stepEndLife(particle, delta), this._step(delta));
    }

    updateAll(particles: Array<Particle>, count: number, delta: number): void {
        const temp = this._temp;
        const generatorX = this.x;
        const generatorY = this.y;
        const generatorZ = this.z;
        const frame = this._frame;
        const space = this.space;
        // The space test is per system, not per particle.
        const worldSpace = this.ps === undefined || this.ps.worldSpace;
        const scaled = this.scaleWithEmitter;
        const convert = EmitterFrame.forceReadsFrame(space, worldSpace, scaled);
        const step = this._step(delta);
        const randomized = this.randomized;
        for (let i = 0; i < count; i++) {
            const particle = particles[i];
            if (particle.age >= particle.life) {
                continue;
            }
            const memory = particle.memory;
            const t = stepEndLife(particle, delta);
            if (randomized) {
                this._reroll(memory);
            }
            temp.set(generatorX.genValue(memory, t), generatorY.genValue(memory, t), generatorZ.genValue(memory, t));
            if (convert) {
                frame.forceToSimulation(temp, space, worldSpace, scaled);
            }
            particle.velocity.addScaledVector(temp, step);
        }
    }

    toJSON(): ForceOverLifeJSON {
        return {
            type: this.type,
            x: this.x.toJSON(),
            y: this.y.toJSON(),
            z: this.z.toJSON(),
            ...(this.space !== 'world' ? {space: this.space} : {}),
            ...(this.randomized ? {randomized: true} : {}),
            ...(this.scaleWithEmitter ? {} : {scaleWithEmitter: false}),
        };
    }

    /** Reads {@link ForceOverLife.toJSON} output; a field the JSON leaves out takes its default. */
    static fromJSON(json: ForceOverLifeJSON): Behavior {
        return new ForceOverLife(
            ValueGeneratorFromJSON(json.x) as FunctionValueGenerator,
            ValueGeneratorFromJSON(json.y) as FunctionValueGenerator,
            ValueGeneratorFromJSON(json.z) as FunctionValueGenerator,
            readBehaviorSpace(json.space, 'world'),
            json.randomized === true,
            json.scaleWithEmitter !== false
        );
    }

    frameUpdate(delta: number): void {
        // A curve read from its table is a few loads, which the update loops can inline; read
        // through the curve itself, every particle's three calls box their numbers.
        this.x.refreshTable?.();
        this.y.refreshTable?.();
        this.z.refreshTable?.();
        // The frame is only read when the force needs converting.
        const system = this.ps;
        if (
            system !== undefined &&
            EmitterFrame.forceReadsFrame(this.space, system.worldSpace, this.scaleWithEmitter)
        ) {
            this._frame.refresh(system);
        }
    }

    clone(): Behavior {
        return new ForceOverLife(
            this.x.clone(),
            this.y.clone(),
            this.z.clone(),
            this.space,
            this.randomized,
            this.scaleWithEmitter
        );
    }
    reset(): void {}
}
