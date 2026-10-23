import {
    ConstantValue,
    FunctionValueGenerator,
    GeneratorMemory,
    ValueGenerator,
    ValueGeneratorFromJSON,
} from '../functions';
import {EmissionState, IParticleSystem} from '../IParticleSystem';
import {Matrix4, Quaternion} from '../math';
import {Particle} from '../Particle';
import {shellRadius, UP_VEC3, ZERO_VEC3} from '../util/MathUtil';
import {random} from '../util/random';
import {EmitterMode, EmitterShape, getValueFromEmitterMode, ShapeJSON} from './EmitterUtil';
import {ShapeTransform} from './ShapeTransform';

/**
 * Interface representing the parameters for a donut emitter.
 */
export interface DonutEmitterParameters {
    /**
     * Radius of the donut's centre line, a circle in the xy plane; a negative value is read as 0.
     * Defaults to 10.
     */
    radius?: number;
    /**
     * Arc of the donut that particles start in, in radians around +z from +x (Unity's Arc, which
     * its inspector shows in degrees); 2π, the default, for the whole donut.
     */
    arc?: number;
    /**
     * Radius Thickness, as in Unity: how far in from the tube's surface particles may start, as a
     * fraction of the tube's radius, clamped to [0, 1]. 0 is the tube's surface only; 1, the
     * default, fills the tube, evenly over its cross-section.
     */
    thickness?: number;
    /**
     * Radius of the tube around the centre line (Unity's Donut Radius); a negative value is read
     * as 0. Defaults to a fifth of `radius`.
     */
    donutRadius?: number;
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
 * Emits from a torus around z (Unity's Donut shape): particles start in its tube, or on the tube's
 * surface, and head out from the tube's centre line.
 */
export class DonutEmitter implements EmitterShape {
    /** Always `'donut'`. */
    type = 'donut';
    /** Radius of the torus, from its centre to the centre line of its tube. */
    radius: number;
    /** Radius of the tube. */
    donutRadius: number;
    /** Arc around z, in radians, that particles start in; 2π for the whole torus. */
    arc: number;
    /**
     * How far in from the tube's surface particles may start, as a fraction of its radius: 0 on the
     * surface, 1 anywhere down to the centre line, evenly over the cross-section; clamped to [0, 1].
     */
    thickness: number;
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
    /** State the {@link DonutEmitter.speed} generator keeps. */
    memory: GeneratorMemory;
    transform?: ShapeTransform;

    /**
     * Scratch matrix.
     * @internal
     */
    _m1: Matrix4;

    constructor(parameters: DonutEmitterParameters = {}) {
        this.radius = parameters.radius ?? 10;
        this.arc = parameters.arc ?? 2.0 * Math.PI;
        this.thickness = parameters.thickness ?? 1;
        this.donutRadius = parameters.donutRadius ?? this.radius * 0.2;
        this.mode = parameters.mode ?? EmitterMode.Random;
        this.spread = parameters.spread ?? 0;
        this.speed = parameters.speed ?? new ConstantValue(1);
        this.memory = [];
        this.transform = parameters.transform;
        this._m1 = new Matrix4();
    }

    private currentValue = 0;

    reset(): void {
        this.currentValue = 0;
        this.memory.length = 0;
    }

    /** Advances the arc sweep by `delta` seconds in the `Loop` and `PingPong` modes. */
    update(system: IParticleSystem, delta: number): void {
        if (EmitterMode.Random != this.mode) {
            this.currentValue += this.speed.genValue(this.memory, system.emissionState.time / system.duration) * delta;
        }
    }

    /**
     * Starts `p` in the tube, heading out from the tube's centre line at its start speed and, when
     * it has no start rotation, facing that way.
     */
    initialize(p: Particle, emissionState: EmissionState) {
        const u = getValueFromEmitterMode(this.mode, this.currentValue, this.spread, emissionState);
        const v = random();
        // Uniform over the area of the tube's cross-section ring.
        const rand = shellRadius(this.thickness, 2);
        const theta = u * this.arc;
        const phi = v * Math.PI * 2;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);
        const radius = Math.max(0, this.radius);
        const tube = Math.max(0, this.donutRadius) * rand;
        // The direction out from the tube's centre line, a unit vector even where the tube or the
        // roll is 0, so a particle there still heads out at its start speed.
        p.velocity.set(Math.cos(phi) * cosTheta, Math.cos(phi) * sinTheta, Math.sin(phi));
        p.position.set(radius * cosTheta, radius * sinTheta, 0).addScaledVector(p.velocity, tube);
        p.velocity.multiplyScalar(p.startSpeed);

        // Default facing-velocity orientation, but defer to startRotation if set.
        if (p.rotation instanceof Quaternion) {
            const r = p.rotation;
            if (r.x === 0 && r.y === 0 && r.z === 0 && r.w === 1) {
                this._m1.lookAt(ZERO_VEC3, p.velocity, UP_VEC3);
                p.rotation.setFromRotationMatrix(this._m1);
            }
        }
        this.transform?.apply(p);
    }

    /** The shape's JSON. */
    toJSON(): ShapeJSON {
        return {
            type: 'donut',
            radius: this.radius,
            arc: this.arc,
            thickness: this.thickness,
            donutRadius: this.donutRadius,
            mode: this.mode,
            spread: this.spread,
            speed: this.speed.toJSON(),
            ...ShapeTransform.toShapeJSON(this.transform),
        };
    }

    /** Reads {@link DonutEmitter.toJSON} output; a field the JSON leaves out takes its default. */
    static fromJSON(json: ShapeJSON): DonutEmitter {
        return new DonutEmitter({
            radius: json.radius,
            arc: json.arc,
            thickness: json.thickness,
            donutRadius: json.donutRadius,
            mode: json.mode,
            speed: json.speed ? ValueGeneratorFromJSON(json.speed) : undefined,
            transform: ShapeTransform.fromJSON(json.transform),
            spread: json.spread,
        });
    }

    /** A copy with the same settings. */
    clone(): EmitterShape {
        return new DonutEmitter({
            radius: this.radius,
            arc: this.arc,
            thickness: this.thickness,
            donutRadius: this.donutRadius,
            mode: this.mode,
            speed: this.speed.clone(),
            transform: this.transform?.clone(),
            spread: this.spread,
        });
    }
}
