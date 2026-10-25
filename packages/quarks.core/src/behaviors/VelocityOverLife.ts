import {ConstantValue, FunctionValueGenerator, ValueGenerator, ValueGeneratorFromJSON} from '../functions';
import type {ValueGeneratorJSON, Vector3ArrayJSON} from '../functions/FunctionJSON';
import {IParticleSystem} from '../IParticleSystem';
import type {Vector3Like} from '../Like';
import {Quaternion, Vector3} from '../math';
import {vector3From} from '../math/fromLike';
import {Particle} from '../Particle';
import {Behavior, BehaviorJSON} from './Behavior';
import {BehaviorSpace} from './EmitterFrame';

/** The space a `VelocityOverLife` is authored in; the same choice as {@link BehaviorSpace}. */
export type VelocityOverLifeSpace = BehaviorSpace;

const UNIT_X = new Vector3(1, 0, 0);
const UNIT_Y = new Vector3(0, 1, 0);
const UNIT_Z = new Vector3(0, 0, 1);

/** The JSON of a velocity over life: a {@link VelocityOverLife}. */
export interface VelocityOverLifeJSON extends BehaviorJSON {
    /** Linear velocity along X. */
    linearX?: ValueGeneratorJSON;
    /** Linear velocity along Y. */
    linearY?: ValueGeneratorJSON;
    /** Linear velocity along Z. */
    linearZ?: ValueGeneratorJSON;
    /** Orbital velocity around X. */
    orbitalX?: ValueGeneratorJSON;
    /** Orbital velocity around Y. */
    orbitalY?: ValueGeneratorJSON;
    /** Orbital velocity around Z. */
    orbitalZ?: ValueGeneratorJSON;
    /** The space the velocity is in; `'local'` when absent. */
    space?: BehaviorSpace;
    /** Radial velocity. */
    radial?: ValueGeneratorJSON;
    /** The orbit centre's offset. */
    orbitalOffset?: Vector3ArrayJSON;
}

/**
 * Move particles with a direct velocity over their life (Unity's "Velocity over Lifetime").
 * Applied as a positional displacement, so it is not affected by speed modifiers,
 * forces, or speed limits. Orbital speeds rotate particles around the emitter axes.
 *
 * For an orbit around a single axis of any direction, or around the world origin, use
 * `OrbitOverLife`; this one orbits the emitter's three axes, with a radial speed and an offset
 * pivot as Unity's module has.
 */
export class VelocityOverLife implements Behavior {
    type = 'VelocityOverLife';
    /** Learned in {@link initialize}, so undefined until this behavior sees a particle. */
    ps?: IParticleSystem;

    private _orbitalOffsetValue: Vector3;

    /**
     * Where the orbital speeds turn around, relative to the emitter (Unity's Orbital Offset).
     * Set it from any `Vector3Like`, such as a Babylon `Vector3`; the value is copied.
     */
    get orbitalOffset(): Vector3 {
        return this._orbitalOffsetValue;
    }

    set orbitalOffset(value: Vector3Like) {
        this._orbitalOffsetValue = vector3From(value);
    }

    /**
     * @param linearX - Velocity along x over the particle's life, in units per second.
     * @param linearY - Velocity along y.
     * @param linearZ - Velocity along z.
     * @param orbitalX - Angular speed around the x axis through the orbit centre, in radians per
     *   second.
     * @param orbitalY - Angular speed around the y axis.
     * @param orbitalZ - Angular speed around the z axis.
     * @param space - The space the velocities and axes are authored in: `'local'` (the emitter's,
     *   the default) or `'world'`.
     * @param radial - Speed away from the orbit centre (Unity's Radial).
     * @param orbitalOffset - Where the orbital speeds turn around, relative to the emitter (Unity's
     *   Orbital Offset).
     */
    constructor(
        public linearX: FunctionValueGenerator | ValueGenerator = new ConstantValue(0),
        public linearY: FunctionValueGenerator | ValueGenerator = new ConstantValue(0),
        public linearZ: FunctionValueGenerator | ValueGenerator = new ConstantValue(0),
        public orbitalX: FunctionValueGenerator | ValueGenerator = new ConstantValue(0),
        public orbitalY: FunctionValueGenerator | ValueGenerator = new ConstantValue(0),
        public orbitalZ: FunctionValueGenerator | ValueGenerator = new ConstantValue(0),
        public space: VelocityOverLifeSpace = 'local',
        /** Speed away from the orbit centre (Unity's Radial), in the authored space's units. */
        public radial: FunctionValueGenerator | ValueGenerator = new ConstantValue(0),
        /** Where the orbital speeds turn around, relative to the emitter (Unity's Orbital Offset). */
        orbitalOffset: Vector3Like = new Vector3()
    ) {
        this._orbitalOffsetValue = vector3From(orbitalOffset);
    }

    /**
     * Scratch value.
     * @internal
     */
    _temp = new Vector3();
    /**
     * Scratch value.
     * @internal
     */
    _tempEmitterPos = new Vector3();
    /**
     * Scratch value.
     * @internal
     */
    _tempQ = new Quaternion();
    /**
     * Scratch value.
     * @internal
     */
    _tempQInv = new Quaternion();
    /**
     * Scratch value.
     * @internal
     */
    _tempScale = new Vector3(1, 1, 1);
    /**
     * Scratch value.
     * @internal
     */
    _tempScaleInv = new Vector3(1, 1, 1);
    /**
     * Scratch value.
     * @internal
     */
    _tempRot = new Quaternion();
    /**
     * Axes the orbital speeds turn around, refreshed once per frame by
     * {@link frameUpdate}. In world space they are the emitter's axes, which
     * only change when the emitter does — so they are hoisted out of the
     * per-particle work rather than rebuilt for every particle.
     */
    _axisX = new Vector3(1, 0, 0);
    /**
     * Scratch value.
     * @internal
     */
    _axisY = new Vector3(0, 1, 0);
    /**
     * Scratch value.
     * @internal
     */
    _axisZ = new Vector3(0, 0, 1);
    /** The orbit centre in the simulation space, refreshed with the axes. */
    _center = new Vector3();

    initialize(particle: Particle, particleSystem: IParticleSystem): void {
        this.ps = particleSystem;
        this.linearX.startGen(particle.memory);
        this.linearY.startGen(particle.memory);
        this.linearZ.startGen(particle.memory);
        this.orbitalX.startGen(particle.memory);
        this.orbitalY.startGen(particle.memory);
        this.orbitalZ.startGen(particle.memory);
        this.radial.startGen(particle.memory);
    }

    frameUpdate(delta: number): void {
        if (this.ps) {
            this.ps.emitter.matrixWorld.decompose(this._tempEmitterPos, this._tempQ, this._tempScale);
            this._tempQInv.copy(this._tempQ).invert();
            this._tempScaleInv.set(1 / this._tempScale.x, 1 / this._tempScale.y, 1 / this._tempScale.z);
            this._axisX.copy(UNIT_X);
            this._axisY.copy(UNIT_Y);
            this._axisZ.copy(UNIT_Z);
            this._center.copy(this.orbitalOffset);
            if (this.ps.worldSpace) {
                this._axisX.applyQuaternion(this._tempQ);
                this._axisY.applyQuaternion(this._tempQ);
                this._axisZ.applyQuaternion(this._tempQ);
                this._center.multiply(this._tempScale).applyQuaternion(this._tempQ).add(this._tempEmitterPos);
            }
        }
    }

    update(particle: Particle, delta: number): void {
        const t = particle.age / particle.life;
        this._temp.set(
            this.linearX.genValue(particle.memory, t),
            this.linearY.genValue(particle.memory, t),
            this.linearZ.genValue(particle.memory, t)
        );
        // The system is undefined until initialize() has run for this behavior;
        // an unknown one is treated as world space rather than throwing, which
        // is also what frameUpdate's guard assumes.
        const worldSpace = this.ps !== undefined && this.ps.worldSpace;
        // Convert the authored space into the particle simulation space.
        if (worldSpace && this.space === 'local') {
            this._temp.multiply(this._tempScale).applyQuaternion(this._tempQ);
        } else if (!worldSpace && this.space === 'world') {
            this._temp.multiply(this._tempScaleInv).applyQuaternion(this._tempQInv);
        }
        particle.position.addScaledVector(this._temp, delta);

        const radial = this.radial.genValue(particle.memory, t);
        if (radial !== 0) {
            // Away from the centre, along the line through the particle.
            this._temp.copy(particle.position).sub(this._center);
            const length = this._temp.length();
            if (length > 0) {
                particle.position.addScaledVector(this._temp, (radial * delta) / length);
            }
        }

        const angleX = this.orbitalX.genValue(particle.memory, t) * delta;
        const angleY = this.orbitalY.genValue(particle.memory, t) * delta;
        const angleZ = this.orbitalZ.genValue(particle.memory, t) * delta;
        if (angleX !== 0 || angleY !== 0 || angleZ !== 0) {
            particle.position.sub(this._center);
            this.orbit(particle.position, this._axisX, angleX);
            this.orbit(particle.position, this._axisY, angleY);
            this.orbit(particle.position, this._axisZ, angleZ);
            particle.position.add(this._center);
        }
    }

    private orbit(position: Vector3, axis: Vector3, angle: number): void {
        if (angle === 0) {
            return;
        }
        this._tempRot.setFromAxisAngle(axis, angle);
        position.applyQuaternion(this._tempRot);
    }

    toJSON(): VelocityOverLifeJSON {
        return {
            type: this.type,
            linearX: this.linearX.toJSON(),
            linearY: this.linearY.toJSON(),
            linearZ: this.linearZ.toJSON(),
            orbitalX: this.orbitalX.toJSON(),
            orbitalY: this.orbitalY.toJSON(),
            orbitalZ: this.orbitalZ.toJSON(),
            space: this.space,
            radial: this.radial.toJSON(),
            orbitalOffset: [this.orbitalOffset.x, this.orbitalOffset.y, this.orbitalOffset.z],
        };
    }

    /**
     * Reads {@link VelocityOverLife.toJSON} output; a field the JSON leaves out takes its default.
     */
    static fromJSON(json: VelocityOverLifeJSON): Behavior {
        const readValue = (field: ValueGeneratorJSON | undefined) =>
            field ? (ValueGeneratorFromJSON(field) as FunctionValueGenerator) : new ConstantValue(0);
        return new VelocityOverLife(
            readValue(json.linearX),
            readValue(json.linearY),
            readValue(json.linearZ),
            readValue(json.orbitalX),
            readValue(json.orbitalY),
            readValue(json.orbitalZ),
            json.space === 'world' ? 'world' : 'local',
            readValue(json.radial),
            Array.isArray(json.orbitalOffset)
                ? new Vector3(json.orbitalOffset[0] ?? 0, json.orbitalOffset[1] ?? 0, json.orbitalOffset[2] ?? 0)
                : new Vector3()
        );
    }

    clone(): Behavior {
        return new VelocityOverLife(
            this.linearX.clone(),
            this.linearY.clone(),
            this.linearZ.clone(),
            this.orbitalX.clone(),
            this.orbitalY.clone(),
            this.orbitalZ.clone(),
            this.space,
            this.radial.clone(),
            this.orbitalOffset.clone()
        );
    }
    reset(): void {}
}
