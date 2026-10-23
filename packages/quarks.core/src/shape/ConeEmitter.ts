import {
    ConstantValue,
    FunctionValueGenerator,
    GeneratorMemory,
    ValueGenerator,
    ValueGeneratorFromJSON,
} from '../functions';
import {EmissionState, IParticleSystem} from '../IParticleSystem';
import {Particle} from '../Particle';
import {shellRadius} from '../util/MathUtil';
import {EmitterMode, EmitterShape, getValueFromEmitterMode, ShapeJSON} from './EmitterUtil';
import {ShapeTransform} from './ShapeTransform';

/**
 * Interface representing the parameters for a cone emitter.
 */
export interface ConeEmitterParameters {
    /**
     * Radius of the cone's base disc, in the xy plane; a negative value is read as 0. Defaults
     * to 10.
     */
    radius?: number;
    /**
     * Arc of the cone that particles start in, in radians around +z from +x (Unity's Arc, which
     * its inspector shows in degrees); 2π, the default, for the whole cone.
     */
    arc?: number;
    /**
     * Radius Thickness, as in Unity: how far in from the base's rim particles may start, as a fraction of
     * the radius, clamped to [0, 1]. 0 is the base's rim only; 1, the default, fills the whole base, evenly
     * over its area.
     */
    thickness?: number;
    /**
     * Opening angle of the cone in radians, clamped to [0, π/2] (Unity's Angle, 0 to 90 degrees).
     * Defaults to π/6.
     */
    angle?: number;
    /**
     * The mode of the emitter.
     * {@link EmitterMode}
     */
    mode?: EmitterMode;
    /**
     * The length of the segment at which the emitter point converges at the start and end, when mode is EmitterMode.Loop or EmitterMode.PingPong.
     * {@link EmitterMode}
     */
    spread?: number;
    /**
     * The speed of the emitter start point when mode is EmitterMode.Loop or EmitterMode.PingPong.
     * {@link EmitterMode}
     */
    speed?: ValueGenerator | FunctionValueGenerator;
    /**
     * Offset, rotation and scale of the shape within the particle system.
     * {@link ShapeTransform}
     */
    transform?: ShapeTransform;
}

/**
 * Emits from a disc in the xy plane into a cone along +z (Unity's Cone shape): a particle at the
 * disc's rim heads out at the cone's angle, one at the centre straight along z.
 */
export class ConeEmitter implements EmitterShape {
    /** Always `'cone'`. */
    type = 'cone';
    /** Radius of the disc particles start on. */
    radius: number;
    /** Arc of the disc, in radians, that particles start in; 2π for the whole disc. */
    arc: number;
    /**
     * How far in from the rim particles may start, as a fraction of the radius (Unity's Radius
     * Thickness): 0 on the rim, 1 anywhere on the disc, spread evenly over the area; clamped to [0, 1].
     */
    thickness: number;
    /**
     * Angle in radians between z and the direction of a particle that starts at the rim, from 0 to
     * π/2.
     */
    angle: number;
    /** How the start point moves along the arc, see {@link EmitterMode}. */
    mode: EmitterMode;
    /**
     * Snaps the start point along the arc to multiples of this fraction (Unity's Spread); 0 for
     * none.
     */
    spread: number;
    /**
     * Speed of the arc sweep in arcs per second, for the `Loop` and `PingPong` modes; sampled over
     * the system's cycle.
     */
    speed: ValueGenerator | FunctionValueGenerator;
    /** State the {@link ConeEmitter.speed} generator keeps. */
    memory: GeneratorMemory;
    transform?: ShapeTransform;

    private currentValue = 0;

    reset(): void {
        this.currentValue = 0;
        this.memory.length = 0;
    }

    constructor(parameters: ConeEmitterParameters = {}) {
        this.radius = parameters.radius ?? 10;
        this.arc = parameters.arc ?? 2.0 * Math.PI;
        this.thickness = parameters.thickness ?? 1;
        this.angle = parameters.angle ?? Math.PI / 6;
        this.mode = parameters.mode ?? EmitterMode.Random;
        this.spread = parameters.spread ?? 0;
        this.speed = parameters.speed ?? new ConstantValue(1);
        this.memory = [];
        this.transform = parameters.transform;
    }

    /** Advances the arc sweep by `delta` seconds in the `Loop` and `PingPong` modes. */
    update(system: IParticleSystem, delta: number): void {
        if (EmitterMode.Random != this.mode) {
            this.currentValue += this.speed.genValue(this.memory, system.emissionState.time / system.duration) * delta;
        }
    }

    /** Starts `p` on the disc, heading into the cone at its start speed. */
    initialize(p: Particle, emissionState: EmissionState) {
        const u = getValueFromEmitterMode(this.mode, this.currentValue, this.spread, emissionState);
        // Uniform over the area of the ring between radius 1 - thickness and 1 (Unity's Radius
        // Thickness).
        const r = shellRadius(this.thickness, 2);
        const theta = u * this.arc;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);
        p.position.x = r * cosTheta;
        p.position.y = r * sinTheta;
        p.position.z = 0;

        // Unity's cone opens between 0 and 90 degrees.
        const angle = Math.min(Math.max(this.angle, 0), Math.PI / 2) * r;
        // The direction tilts from +z toward the point by the angle; normalised, since the point is
        // inside the unit disc and the tilt alone would slow particles away from the rim.
        p.velocity
            .set(0, 0, Math.cos(angle))
            .addScaledVector(p.position, r > 0 ? Math.sin(angle) / r : 0)
            .multiplyScalar(p.startSpeed);
        p.position.multiplyScalar(Math.max(0, this.radius));
        this.transform?.apply(p);
    }

    /** The shape's JSON. */
    toJSON(): ShapeJSON {
        return {
            type: 'cone',
            radius: this.radius,
            arc: this.arc,
            thickness: this.thickness,
            angle: this.angle,
            mode: this.mode,
            spread: this.spread,
            speed: this.speed.toJSON(),
            ...ShapeTransform.toShapeJSON(this.transform),
        };
    }

    /** Reads {@link ConeEmitter.toJSON} output; a field the JSON leaves out takes its default. */
    static fromJSON(json: ShapeJSON): ConeEmitter {
        return new ConeEmitter({
            radius: json.radius,
            arc: json.arc,
            thickness: json.thickness,
            angle: json.angle,
            mode: json.mode,
            speed: json.speed ? ValueGeneratorFromJSON(json.speed) : undefined,
            transform: ShapeTransform.fromJSON(json.transform),
            spread: json.spread,
        });
    }

    /** A copy with the same settings. */
    clone(): EmitterShape {
        return new ConeEmitter({
            radius: this.radius,
            arc: this.arc,
            thickness: this.thickness,
            angle: this.angle,
            mode: this.mode,
            speed: this.speed.clone(),
            transform: this.transform?.clone(),
            spread: this.spread,
        });
    }
}
