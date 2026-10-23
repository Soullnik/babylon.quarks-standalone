import {
    ConstantValue,
    FunctionValueGenerator,
    GeneratorMemory,
    ValueGenerator,
    ValueGeneratorFromJSON,
} from '../functions';
import {EmissionState, IParticleSystem} from '../IParticleSystem';
import {MathUtils} from '../math';
import {Particle} from '../Particle';
import {random} from '../util/random';
import {EmitterMode, EmitterShape, getValueFromEmitterMode, ShapeJSON} from './EmitterUtil';
import {ShapeTransform} from './ShapeTransform';

/**
 * Interface representing the parameters for a cone emitter.
 */
export interface ConeEmitterParameters {
    /**
     * The radius of the cone base.
     */
    radius?: number;
    /**
     * The arc of the cone.
     */
    arc?: number;
    /**
     * The thickness of the cone. 1 is a full cone, 0 is a cone with 0 thickness.
     */
    thickness?: number;
    /**
     * The angle of the cone, ranging from 0 to Math.PI / 2.
     */
    angle?: number; // [0, Math.PI / 2]
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
    arc: number; // [0, Math.PI * 2]
    /**
     * How far in from the rim particles may start, as a fraction of the radius (Unity's Radius
     * Thickness): 0 on the rim, 1 anywhere on the disc, spread evenly over the area.
     */
    thickness: number; // [0, 1]
    /**
     * Angle in radians between z and the direction of a particle that starts at the rim, from 0 to
     * π/2.
     */
    angle: number; // [0, Math.PI / 2]
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
        // Thickness): the squared radius is what is uniform.
        const inner = 1 - MathUtils.clamp(this.thickness, 0, 1);
        const r = Math.sqrt(MathUtils.lerp(inner * inner, 1, random()));
        const theta = u * this.arc;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);
        p.position.x = r * cosTheta;
        p.position.y = r * sinTheta;
        p.position.z = 0;

        const angle = this.angle * r;
        p.velocity.set(0, 0, Math.cos(angle)).addScaledVector(p.position, Math.sin(angle)).multiplyScalar(p.startSpeed);
        //const v = random();
        p.position.multiplyScalar(this.radius);
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
