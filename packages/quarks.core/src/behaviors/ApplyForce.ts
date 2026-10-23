import {IParticleSystem} from '../IParticleSystem';
import {Particle} from '../Particle';
import {ConstantValue, ValueGenerator, ValueGeneratorFromJSON} from '../functions';
import {Vector3} from '../math';
import {readVector3} from '../util/JSONUtil';
import {Behavior} from './Behavior';
import {BehaviorSpace, EmitterFrame, readBehaviorSpace} from './EmitterFrame';

/**
 * Apply a constant force along one direction to every particle, like gravity or wind.
 *
 * `magnitude` is rolled per particle when it is emitted: a {@link ConstantValue} pushes every
 * particle equally, an {@link IntervalValue} gives each particle its own strength for its whole
 * life, as Unity's Force over Lifetime does with Random Between Two Constants.
 *
 * The direction is authored in {@link space}: world axes by default, so gravity stays down
 * however the emitter is turned, or the emitter's own axes with `'local'`. In a world-space
 * system a world force is also multiplied by the system's `motionScale`, as every world-space
 * force is. Applies in every render mode.
 */
export class ApplyForce implements Behavior {
    type = 'ApplyForce';
    /** Learned in {@link initialize}, so undefined until this behavior sees a particle. */
    ps?: IParticleSystem;
    /** The emitter's transform this frame, refreshed by {@link frameUpdate}. */
    readonly _frame = new EmitterFrame();
    /** {@link direction} in the simulation space, refreshed by {@link frameUpdate}. */
    readonly _direction = new Vector3();

    constructor(
        /** The direction of the force; its length scales it. */
        public direction: Vector3,
        /** The force's strength, in units per second squared, rolled per particle. */
        public magnitude: ValueGenerator,
        /** The space the direction is authored in; `'world'` by default. */
        public space: BehaviorSpace = 'world'
    ) {
        this._direction.copy(direction);
    }

    initialize(particle: Particle, particleSystem: IParticleSystem): void {
        this.ps = particleSystem;
        this.magnitude.startGen(particle.memory);
    }

    /**
     * What the magnitude is multiplied by before it reaches the velocity: the
     * step, and the system's `motionScale` for a world force in a world-space
     * system. An unknown system (before {@link initialize}) counts as world space.
     */
    _step(delta: number): number {
        const system = this.ps;
        const worldSpace = system === undefined || system.worldSpace;
        return worldSpace && this.space === 'world' ? delta * (system?.motionScale ?? 1) : delta;
    }

    update(particle: Particle, delta: number): void {
        const scale = this.magnitude.genValue(particle.memory) * this._step(delta);
        const direction = this._direction;
        const velocity = particle.velocity;
        velocity.x += direction.x * scale;
        velocity.y += direction.y * scale;
        velocity.z += direction.z * scale;
    }

    updateAll(particles: Array<Particle>, count: number, delta: number): void {
        const generator = this.magnitude;
        const direction = this._direction;
        const step = this._step(delta);
        // A constant force is the same for every particle, so it collapses to
        // three numbers computed once per frame.
        const constant = generator instanceof ConstantValue;
        const fixed = constant ? generator.value * step : 0;
        for (let i = 0; i < count; i++) {
            const particle = particles[i];
            if (particle.age >= particle.life) {
                continue;
            }
            const scale = constant ? fixed : generator.genValue(particle.memory) * step;
            const velocity = particle.velocity;
            velocity.x += direction.x * scale;
            velocity.y += direction.y * scale;
            velocity.z += direction.z * scale;
        }
    }

    frameUpdate(delta: number): void {
        this._direction.copy(this.direction);
        // The frame is only read when the authored space differs from the simulation space.
        if (this.ps !== undefined && this.ps.worldSpace !== (this.space === 'world')) {
            this._frame.refresh(this.ps);
            this._frame.toSimulation(this._direction, this.space, this.ps.worldSpace);
        }
    }

    toJSON(): any {
        return {
            type: this.type,
            direction: [this.direction.x, this.direction.y, this.direction.z],
            magnitude: this.magnitude.toJSON(),
            ...(this.space !== 'world' ? {space: this.space} : {}),
        };
    }

    /** Reads {@link ApplyForce.toJSON} output; a field the JSON leaves out takes its default. */
    static fromJSON(json: any): Behavior {
        return new ApplyForce(
            readVector3(json.direction, new Vector3(0, 0, 0)),
            ValueGeneratorFromJSON(json.magnitude ?? json.force) as ValueGenerator,
            readBehaviorSpace(json.space, 'world')
        );
    }

    clone(): Behavior {
        return new ApplyForce(this.direction.clone(), this.magnitude.clone(), this.space);
    }

    reset(): void {}
}
