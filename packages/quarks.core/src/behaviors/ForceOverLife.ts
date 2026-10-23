import {IParticleSystem} from '../IParticleSystem';
import {Particle} from '../Particle';
import {FunctionValueGenerator, ValueGenerator, ValueGeneratorFromJSON} from '../functions';
import {Vector3} from '../math';
import {Behavior} from './Behavior';
import {BehaviorSpace, EmitterFrame, readBehaviorSpace} from './EmitterFrame';

/**
 * Accelerate particles by a force that changes over their life, one curve per
 * axis (Unity's Force over Lifetime).
 *
 * The force is in units per second squared, authored in {@link space}: world
 * axes by default, or the emitter's own axes with `'local'`, in which case it
 * turns and scales with the emitter. In a world-space system a world force is
 * also multiplied by the system's `motionScale`, as every world-space force is.
 * Applies in every render mode.
 */
export class ForceOverLife implements Behavior {
    type = 'ForceOverLife';
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
        public space: BehaviorSpace = 'world'
    ) {}

    /**
     * What the force is multiplied by before it reaches the velocity: the
     * step, and the system's `motionScale` for a world force in a world-space
     * system. An unknown system (before {@link initialize}) counts as world space.
     */
    _step(delta: number): number {
        const system = this.ps;
        const worldSpace = system === undefined || system.worldSpace;
        return worldSpace && this.space === 'world' ? delta * (system?.motionScale ?? 1) : delta;
    }

    update(particle: Particle, delta: number): void {
        const t = particle.age / particle.life;
        this._temp.set(
            this.x.genValue(particle.memory, t),
            this.y.genValue(particle.memory, t),
            this.z.genValue(particle.memory, t)
        );
        // Undefined until initialize() has run for this behavior; treat an
        // unknown system as world space rather than throwing.
        const worldSpace = this.ps === undefined || this.ps.worldSpace;
        this._frame.toSimulation(this._temp, this.space, worldSpace);
        particle.velocity.addScaledVector(this._temp, this._step(delta));
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
        const convert = worldSpace !== (space === 'world');
        const step = this._step(delta);
        for (let i = 0; i < count; i++) {
            const particle = particles[i];
            if (particle.age >= particle.life) {
                continue;
            }
            const memory = particle.memory;
            const t = particle.age / particle.life;
            temp.set(generatorX.genValue(memory, t), generatorY.genValue(memory, t), generatorZ.genValue(memory, t));
            if (convert) {
                frame.toSimulation(temp, space, worldSpace);
            }
            particle.velocity.addScaledVector(temp, step);
        }
    }

    toJSON(): any {
        return {
            type: this.type,
            x: this.x.toJSON(),
            y: this.y.toJSON(),
            z: this.z.toJSON(),
            ...(this.space !== 'world' ? {space: this.space} : {}),
        };
    }

    static fromJSON(json: any): Behavior {
        return new ForceOverLife(
            ValueGeneratorFromJSON(json.x) as FunctionValueGenerator,
            ValueGeneratorFromJSON(json.y) as FunctionValueGenerator,
            ValueGeneratorFromJSON(json.z) as FunctionValueGenerator,
            readBehaviorSpace(json.space, 'world')
        );
    }

    frameUpdate(delta: number): void {
        // The frame is only read when the authored space differs from the simulation space.
        if (this.ps !== undefined && this.ps.worldSpace !== (this.space === 'world')) {
            this._frame.refresh(this.ps);
        }
    }

    clone(): Behavior {
        return new ForceOverLife(this.x.clone(), this.y.clone(), this.z.clone(), this.space);
    }
    reset(): void {}
}
