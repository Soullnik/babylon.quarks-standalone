import {EulerGenerator, RotationGenerator, RotationGeneratorFromJSON} from '../functions';
import type {RotationGeneratorJSON} from '../functions/FunctionJSON';
import {Euler, EulerOrder, Quaternion, QuaternionView} from '../math';
import {Particle, SpriteParticle} from '../Particle';
import {Behavior, BehaviorJSON} from './Behavior';
import {stepEndLife} from './stepAge';

/** No turn: what each particle's step starts at. Never written to. */
const IDENTITY = new Quaternion();

/** The orders a quaternion converts to and from, which `'angles'` integration needs. */
const TAIT_BRYAN: ReadonlySet<EulerOrder> = new Set<EulerOrder>(['XYZ', 'YXZ', 'ZXY', 'ZYX', 'YZX', 'XZY']);

/** Scratch for `'angles'` integration; module-level, so no particle allocates. */
const _euler = /*@__PURE__*/ new Euler();
/** The rotation (0..3) and turn (4..7) of a particle whose quaternions are not store views. */
const _rows = /*@__PURE__*/ new Float64Array(8);

/**
 * How a {@link Rotation3DOverLife} adds up its angular velocity over the steps; see
 * {@link Rotation3DOverLifeOptions.integration}.
 */
export type RotationIntegration = 'turn' | 'angles';

/** Optional settings of a {@link Rotation3DOverLife}. */
export interface Rotation3DOverLifeOptions {
    /**
     * How each step's rotation is added to the particle's, `'turn'` by default.
     *
     * - `'turn'`: each step turns the particle by the angular velocity's rotation over the step,
     *   about the particle's own current axes (`rotation = rotation * step`).
     * - `'angles'`: as Unity's Rotation over Lifetime with Separate Axes on a 3D-rotated particle.
     *   The particle keeps three Euler angles in the angular velocity's order, starting from its
     *   birth rotation; each step adds each axis's rate times the step's length to its angle, and
     *   the rotation is rebuilt from the sums. A ring tilted at birth and spun about y then keeps
     *   its tilt and spins about the Euler y axis, as in Unity, instead of about its own tilted y.
     *   Unity's Euler order (z, then x, then y, about fixed axes) is `'YXZ'` here.
     *
     * `'angles'` applies when the angular velocity is an {@link EulerGenerator} in one of the six
     * Tait–Bryan orders and the particle rotates by quaternion (the mesh render mode); with any
     * other generator the behavior turns as `'turn'` does.
     */
    integration?: RotationIntegration;
}

/** The JSON of a 3D rotation over life: a {@link Rotation3DOverLife}. */
export interface Rotation3DOverLifeJSON extends BehaviorJSON {
    /** The angular velocity. */
    angularVelocity: RotationGeneratorJSON;
    /** See {@link Rotation3DOverLifeOptions.integration}; `'turn'` when absent. Written only when not the default. */
    integration?: RotationIntegration;
}

/**
 * Apply rotation to particles over their life.
 */
export class Rotation3DOverLife implements Behavior {
    type = 'Rotation3DOverLife';
    /** Scratch for the frame's rotation step; also read by the fused pass. */
    tempQuat = new Quaternion();
    /** See {@link Rotation3DOverLifeOptions.integration}. */
    integration: RotationIntegration;
    /**
     * The first of the three memory slots holding a particle's Euler angles under `'angles'`
     * integration, claimed in {@link initialize}; -1 before any particle claimed them.
     * @internal
     */
    _angleSlot = -1;

    /**
     * @param angularVelocity - The turn per second over the particle's life, as a rotation
     *   generator.
     * @param options - How the turns add up; see {@link Rotation3DOverLifeOptions}.
     */
    constructor(
        public angularVelocity: RotationGenerator,
        options: Rotation3DOverLifeOptions = {}
    ) {
        this.integration = readIntegration(options.integration);
    }

    /**
     * Whether the steps add up Euler angles: `'angles'` integration with an {@link EulerGenerator}
     * in an order a quaternion converts to.
     * @internal
     */
    _integratesAngles(): boolean {
        const generator = this.angularVelocity;
        return (
            this.integration === 'angles' &&
            generator instanceof EulerGenerator &&
            TAIT_BRYAN.has(generator.euler.order)
        );
    }

    initialize(particle: Particle): void {
        if (particle.rotation instanceof Quaternion) {
            // A sprite particle copies it into its own store row, so one shared identity does for
            // every spawn; any other particle keeps what it is given.
            particle.angularVelocity = particle instanceof SpriteParticle ? IDENTITY : new Quaternion();
            const memory = particle.memory;
            (this.angularVelocity as RotationGenerator).startGen(memory);
            if (this._integratesAngles()) {
                // The birth rotation as angles in the generator's order, the sums the steps add to.
                _euler.setFromQuaternion(
                    particle.rotation,
                    (this.angularVelocity as EulerGenerator).euler.order,
                    false
                );
                this._angleSlot = memory.length;
                memory.push(_euler.x, _euler.y, _euler.z);
            }
        }
    }

    update(particle: Particle, delta: number): void {
        if (particle.rotation instanceof Quaternion) {
            const t = stepEndLife(particle, delta);
            if (this._integratesAngles()) {
                this._addAngles(particle, t, delta);
            } else {
                this._turn(particle, t, delta);
            }
        }
    }

    /**
     * One `'turn'` step of a particle that rotates by quaternion, at life fraction `t`.
     * @internal
     */
    _turn(particle: Particle, t: number, delta: number): void {
        (this.angularVelocity as RotationGenerator).genValue(particle.memory, this.tempQuat, delta, t);
        ((particle as SpriteParticle).rotation as Quaternion).multiply(this.tempQuat);
        // This step's turn, kept for the renderer to draw a fraction of when
        // the frame falls between steps.
        const step = (particle as SpriteParticle).angularVelocity;
        if (step instanceof Quaternion) {
            step.copy(this.tempQuat);
        }
    }

    /**
     * One `'angles'` step of a particle that rotates by quaternion, at life fraction `t`: adds
     * each axis's rate times `delta` to the particle's angles and rebuilds its rotation from them.
     * A particle born without the angles (the integration or the generator changed since) turns.
     * @internal
     */
    _addAngles(particle: Particle, t: number, delta: number): void {
        const memory = particle.memory;
        const slot = this._angleSlot;
        if (slot < 0 || memory.length < slot + 3) {
            this._turn(particle, t, delta);
            return;
        }
        const generator = this.angularVelocity as EulerGenerator;
        memory[slot] += generator.angleX.genValue(memory, t) * delta;
        memory[slot + 1] += generator.angleY.genValue(memory, t) * delta;
        memory[slot + 2] += generator.angleZ.genValue(memory, t) * delta;
        const rotation = (particle as SpriteParticle).rotation as Quaternion;
        const step = (particle as SpriteParticle).angularVelocity;
        if (rotation instanceof QuaternionView && step instanceof QuaternionView && rotation.data === step.data) {
            // A store particle: straight into its rows, as the fused pass does.
            this._applyAngles(memory, rotation.data, rotation.offset, step.data, step.offset);
            return;
        }
        _rows[0] = rotation.x;
        _rows[1] = rotation.y;
        _rows[2] = rotation.z;
        _rows[3] = rotation.w;
        this._applyAngles(memory, _rows, 0, _rows, 4);
        rotation.set(_rows[0], _rows[1], _rows[2], _rows[3]);
        if (step instanceof Quaternion) {
            step.set(_rows[4], _rows[5], _rows[6], _rows[7]);
        }
    }

    /**
     * Rebuilds a rotation from the angles a particle keeps in `memory` (see {@link _addAngles}):
     * writes it to `rotations` at `r`, over the previous one there, and the step's turn to `turns`
     * at `a`. The fused pass adds the rates itself and calls this with the store's columns. No
     * number crosses a call, so nothing is boxed.
     * @internal
     */
    _applyAngles(
        memory: ArrayLike<number>,
        rotations: Float32Array | Float64Array,
        r: number,
        turns: Float32Array | Float64Array,
        a: number
    ): void {
        const slot = this._angleSlot;
        const euler = _euler;
        euler._x = memory[slot];
        euler._y = memory[slot + 1];
        euler._z = memory[slot + 2];
        euler._order = (this.angularVelocity as EulerGenerator).euler.order;
        const next = this.tempQuat.setFromEuler(euler, false);
        const nx = next._x,
            ny = next._y,
            nz = next._z,
            nw = next._w;
        const px = rotations[r],
            py = rotations[r + 1],
            pz = rotations[r + 2],
            pw = rotations[r + 3];
        // This step's turn, previous⁻¹ · next, so that previous · turn lands on the new rotation
        // when the renderer draws a fraction of it; the shorter way round, as the renderer draws
        // the fraction from no turn.
        let tx = pw * nx - px * nw - py * nz + pz * ny;
        let ty = pw * ny - py * nw - pz * nx + px * nz;
        let tz = pw * nz - pz * nw - px * ny + py * nx;
        let tw = pw * nw + px * nx + py * ny + pz * nz;
        if (tw < 0) {
            tx = -tx;
            ty = -ty;
            tz = -tz;
            tw = -tw;
        }
        rotations[r] = nx;
        rotations[r + 1] = ny;
        rotations[r + 2] = nz;
        rotations[r + 3] = nw;
        turns[a] = tx;
        turns[a + 1] = ty;
        turns[a + 2] = tz;
        turns[a + 3] = tw;
    }

    toJSON(): Rotation3DOverLifeJSON {
        return {
            type: this.type,
            angularVelocity: this.angularVelocity.toJSON(),
            ...(this.integration !== 'turn' ? {integration: this.integration} : {}),
        };
    }

    /**
     * Reads {@link Rotation3DOverLife.toJSON} output; a field the JSON leaves out takes its
     * default, and an unknown integration reads as `'turn'`.
     */
    static fromJSON(json: Rotation3DOverLifeJSON): Behavior {
        return new Rotation3DOverLife(RotationGeneratorFromJSON(json.angularVelocity), {
            integration: readIntegration(json.integration),
        });
    }

    frameUpdate(delta: number): void {
        // Curves read from their tables, which the fused pass interpolates inline.
        if (this._integratesAngles()) {
            const generator = this.angularVelocity as EulerGenerator;
            generator.angleX.refreshTable?.();
            generator.angleY.refreshTable?.();
            generator.angleZ.refreshTable?.();
        }
    }

    clone(): Behavior {
        return new Rotation3DOverLife(this.angularVelocity.clone(), {integration: this.integration});
    }

    reset(): void {}
}

/** `value` when it is a {@link RotationIntegration}, `'turn'` otherwise. */
function readIntegration(value: unknown): RotationIntegration {
    return value === 'angles' ? 'angles' : 'turn';
}
