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
import {random} from '../util/random';
import {EmitterMode, EmitterShape, getValueFromEmitterMode, ShapeJSON} from './EmitterUtil';
import {ShapeTransform} from './ShapeTransform';

/** The cosine of 89°: how far from the axis {@link ConeEmitFrom.Volume} follows a side line at most. */
const MIN_VOLUME_COS = Math.cos((89 * Math.PI) / 180);

/**
 * Which part of a cone particles start from (Unity's Cone Emit from).
 */
export enum ConeEmitFrom {
    /** The base disc, as Unity's Base. */
    Base,
    /** Anywhere along the cone, from the base out to {@link ConeEmitter.length}, as Unity's Volume. */
    Volume,
}

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
     * Which part of the cone particles start from; {@link ConeEmitFrom.Base}, the default, for the
     * base disc only.
     */
    emitFrom?: ConeEmitFrom;
    /**
     * Height of the cone along +z that {@link ConeEmitFrom.Volume} fills (Unity's Length); a
     * negative or non-finite value is read as 0. Defaults to 5, as in Unity. The base ignores it.
     */
    length?: number;
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
 * disc's rim heads out at the cone's angle, one at the centre straight along z, and one between
 * them along the cone's side lines, tilted by atan(r · tan(angle)) at the fraction r of the radius.
 * With {@link ConeEmitFrom.Volume}, particles start anywhere on those lines up to
 * {@link ConeEmitter.length} along z.
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
    /** Which part of the cone particles start from, see {@link ConeEmitFrom}. */
    emitFrom: ConeEmitFrom;
    /**
     * Height along +z of the volume {@link ConeEmitFrom.Volume} fills; read as 0 when negative or
     * not finite. Side lines steeper than 89° from the axis are followed as if at 89°, so a cone
     * opened to 90° fills out to about 57 times the length past the rim, not infinitely far.
     */
    length: number;
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
        this.emitFrom = parameters.emitFrom ?? ConeEmitFrom.Base;
        this.length = parameters.length ?? 5;
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

        // Unity's cone opens between 0 and 90 degrees. A particle at the fraction r of the radius
        // follows the line from the base out to the same fraction of the far rim, so it tilts by
        // atan(r · tan(angle)): the rim by the full angle, the centre not at all.
        const angle = Math.min(Math.max(this.angle, 0), Math.PI / 2);
        const tilt = r > 0 ? Math.atan(r * Math.tan(angle)) : 0;
        const sinTilt = Math.sin(tilt);
        const cosTilt = Math.cos(tilt);
        p.velocity.set(sinTilt * cosTheta, sinTilt * sinTheta, cosTilt).multiplyScalar(p.startSpeed);
        p.position.multiplyScalar(Math.max(0, this.radius));
        if (this.emitFrom === ConeEmitFrom.Volume) {
            // Up the side line to a random height. A side line steeper than 89° from the axis is
            // followed as if at 89°, so a cone opened to 90° reaches a finite way out instead of
            // jumping to infinity.
            const length = Number.isFinite(this.length) ? Math.max(0, this.length) : 0;
            const height = random() * length;
            const distance = height / Math.max(cosTilt, MIN_VOLUME_COS);
            p.position.x += sinTilt * cosTheta * distance;
            p.position.y += sinTilt * sinTheta * distance;
            p.position.z = cosTilt * distance;
        }
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
            emitFrom: this.emitFrom,
            length: this.length,
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
            emitFrom: json.emitFrom,
            length: json.length,
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
            emitFrom: this.emitFrom,
            length: this.length,
            mode: this.mode,
            speed: this.speed.clone(),
            transform: this.transform?.clone(),
            spread: this.spread,
        });
    }
}
