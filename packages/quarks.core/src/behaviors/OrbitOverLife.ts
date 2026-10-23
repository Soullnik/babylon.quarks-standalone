import {IParticleSystem} from '../IParticleSystem';
import {Particle} from '../Particle';
import {FunctionValueGenerator, ValueGenerator, ValueGeneratorFromJSON} from '../functions';
import {Quaternion, Vector3} from '../math';
import {Behavior} from './Behavior';
import {BehaviorSpace, EmitterFrame, readBehaviorSpace} from './EmitterFrame';

/**
 * Turn particles around an axis over their life, like Unity's Orbital
 * velocity: each particle keeps its distance from the axis and sweeps around
 * it at `orbitSpeed` radians per second.
 *
 * The axis and the pivot are authored in {@link space}. `'local'`, the default,
 * is the emitter's: the axis is in the emitter's axes and the pivot is the
 * emitter's origin, so in a world-space system the orbit follows the emitter
 * and the effect looks the same whichever space the system simulates in.
 * `'world'` orbits the world origin about a world axis wherever the emitter
 * goes (Niagara's Vortex Force with a fixed origin). The axis need not be a
 * unit vector; only its direction matters, and a zero axis orbits nothing.
 * Applies in every render mode.
 *
 * For an orbit around three axes at once, with a radial speed or an offset
 * pivot, see `VelocityOverLife`.
 */
export class OrbitOverLife implements Behavior {
    type = 'OrbitOverLife';
    rotation: Quaternion;
    temp = new Vector3();
    /** Learned in {@link initialize}, so undefined until this behavior sees a particle. */
    ps?: IParticleSystem;
    /** The emitter's transform this frame, refreshed by {@link frameUpdate}. */
    readonly _frame = new EmitterFrame();
    /** Unit {@link axis} in the simulation space, or zero for a zero axis; refreshed by {@link frameUpdate}. */
    readonly _axis = new Vector3(0, 1, 0);
    /** The pivot in the simulation space; refreshed by {@link frameUpdate}. */
    readonly _center = new Vector3();

    constructor(
        /** Angular speed around the axis over the particle's life, in radians per second. */
        public orbitSpeed: FunctionValueGenerator | ValueGenerator,
        /** The axis orbited, in {@link space}; its length is ignored. */
        public axis: Vector3 = new Vector3(0, 1, 0),
        /** The space the axis and the pivot are authored in; `'local'` (the emitter's) by default. */
        public space: BehaviorSpace = 'local'
    ) {
        this.rotation = new Quaternion();
        this.refreshAxis();
    }

    initialize(particle: Particle, particleSystem: IParticleSystem): void {
        this.ps = particleSystem;
        this.orbitSpeed.startGen(particle.memory);
    }

    /** Recomputes the unit axis and pivot in the simulation space from {@link axis} and the emitter's frame. */
    private refreshAxis(): void {
        const axis = this._axis.copy(this.axis);
        const center = this._center.set(0, 0, 0);
        if (this.ps !== undefined) {
            const worldSpace = this.ps.worldSpace;
            this._frame.toSimulation(axis, this.space, worldSpace);
            this._frame.pointToSimulation(center, this.space, worldSpace);
        }
        const length = axis.length();
        if (length > 0) {
            axis.multiplyScalar(1 / length);
        } else {
            axis.set(0, 0, 0);
        }
    }

    /** Whether the frame is read: only when the authored space differs from the simulation space. */
    private converts(): boolean {
        return this.ps !== undefined && this.ps.worldSpace !== (this.space === 'world');
    }

    update(particle: Particle, delta: number): void {
        const axis = this._axis;
        if (axis.x === 0 && axis.y === 0 && axis.z === 0) {
            return;
        }
        const position = particle.position;
        position.sub(this._center);
        this.temp.copy(position).projectOnVector(axis);
        this.rotation.setFromAxisAngle(
            axis,
            this.orbitSpeed.genValue(particle.memory, particle.age / particle.life) * delta
        );
        position.sub(this.temp);
        position.applyQuaternion(this.rotation);
        position.add(this.temp);
        position.add(this._center);
    }

    updateAll(particles: Array<Particle>, count: number, delta: number): void {
        const axis = this._axis;
        if (axis.x === 0 && axis.y === 0 && axis.z === 0) {
            return;
        }
        const generator = this.orbitSpeed;
        const center = this._center;
        const temp = this.temp;
        const rotation = this.rotation;
        for (let i = 0; i < count; i++) {
            const particle = particles[i];
            if (particle.age >= particle.life) {
                continue;
            }
            const position = particle.position;
            position.sub(center);
            temp.copy(position).projectOnVector(axis);
            rotation.setFromAxisAngle(axis, generator.genValue(particle.memory, particle.age / particle.life) * delta);
            position.sub(temp);
            position.applyQuaternion(rotation);
            position.add(temp);
            position.add(center);
        }
    }

    frameUpdate(delta: number): void {
        if (this.converts()) {
            this._frame.refresh(this.ps as IParticleSystem);
        }
        this.refreshAxis();
    }

    toJSON(): any {
        return {
            type: this.type,
            orbitSpeed: this.orbitSpeed.toJSON(),
            axis: [this.axis.x, this.axis.y, this.axis.z],
            ...(this.space !== 'local' ? {space: this.space} : {}),
        };
    }

    static fromJSON(json: any): Behavior {
        return new OrbitOverLife(
            ValueGeneratorFromJSON(json.orbitSpeed) as FunctionValueGenerator,
            json.axis ? new Vector3(json.axis[0], json.axis[1], json.axis[2]) : undefined,
            readBehaviorSpace(json.space, 'local')
        );
    }

    clone(): Behavior {
        return new OrbitOverLife(this.orbitSpeed.clone(), this.axis.clone(), this.space);
    }
    reset(): void {}
}
