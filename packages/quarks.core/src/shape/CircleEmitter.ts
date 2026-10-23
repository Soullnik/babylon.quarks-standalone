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
 * Interface representing the parameters for a circle emitter.
 */
export interface CircleEmitterParameters {
    /**
     * The radius of the circle.
     */
    radius?: number;
    /**
     * The arc of the circle.
     */
    arc?: number;
    /**
     * The thickness of the ring.
     * 1 is a full circle, 0 is a ring with 0 radius.
     */
    thickness?: number;
    /**
     * The mode of the emitter.
     * {@link EmitterMode}
     */
    mode?: EmitterMode;
    /**
     * The length of segment of which emitter point converges at the start and end, when mode is EmitterMode.Loop or EmitterMode.PingPong.
     * {@link EmitterMode}
     */
    spread?: number;
    /**
     * The speed of the emitter start point travels when mode is EmitterMode.Loop or EmitterMode.PingPong.
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
 * a particle emitter that emits particles from a circle.
 */
export class CircleEmitter implements EmitterShape {
    /** Always `'circle'`. */
    type = 'circle';
    /** Radius of the circle. */
    radius: number;
    /** Arc, in radians, that particles start in; 2π for the whole circle. */
    arc: number; // [0, Math.PI * 2]
    /**
     * How far in from the rim particles may start, as a fraction of the radius: 0 on the rim, 1
     * anywhere down to the centre.
     */
    thickness: number; // [0, 1]
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
    /** State the {@link CircleEmitter.speed} generator keeps. */
    memory: GeneratorMemory;
    transform?: ShapeTransform;

    private currentValue = 0;

    reset(): void {
        this.currentValue = 0;
        this.memory.length = 0;
    }

    constructor(parameters: CircleEmitterParameters = {}) {
        this.radius = parameters.radius ?? 10;
        this.arc = parameters.arc ?? 2.0 * Math.PI;
        this.thickness = parameters.thickness ?? 1;
        this.mode = parameters.mode ?? EmitterMode.Random;
        this.spread = parameters.spread ?? 0;
        this.speed = parameters.speed ?? new ConstantValue(1);
        this.memory = [];
        this.transform = parameters.transform;
    }

    /** Advances the arc sweep by `delta` seconds in the `Loop` and `PingPong` modes. */
    update(system: IParticleSystem, delta: number): void {
        this.currentValue += this.speed.genValue(this.memory, system.emissionState.time / system.duration) * delta;
    }

    /** Starts `p` on the circle, heading straight out at its start speed. */
    initialize(p: Particle, emissionState: EmissionState) {
        const u = getValueFromEmitterMode(this.mode, this.currentValue, this.spread, emissionState);
        const r = MathUtils.lerp(1 - this.thickness, 1, random());
        const theta = u * this.arc;
        p.position.x = Math.cos(theta);
        p.position.y = Math.sin(theta);
        p.position.z = 0;
        p.velocity.copy(p.position).multiplyScalar(p.startSpeed);
        //const v = random();
        p.position.multiplyScalar(this.radius * r);
        this.transform?.apply(p);
    }

    /** The shape's JSON. */
    toJSON(): ShapeJSON {
        return {
            type: 'circle',
            radius: this.radius,
            arc: this.arc,
            thickness: this.thickness,
            mode: this.mode,
            spread: this.spread,
            speed: this.speed.toJSON(),
            ...ShapeTransform.toShapeJSON(this.transform),
        };
    }

    /** Reads {@link CircleEmitter.toJSON} output; a field the JSON leaves out takes its default. */
    static fromJSON(json: any): CircleEmitter {
        return new CircleEmitter({
            radius: json.radius,
            arc: json.arc,
            thickness: json.thickness,
            mode: json.mode,
            speed: json.speed ? ValueGeneratorFromJSON(json.speed) : undefined,
            transform: ShapeTransform.fromJSON(json.transform),
            spread: json.spread,
        });
    }

    /** A copy with the same settings. */
    clone(): EmitterShape {
        return new CircleEmitter({
            radius: this.radius,
            arc: this.arc,
            thickness: this.thickness,
            mode: this.mode,
            speed: this.speed.clone(),
            transform: this.transform?.clone(),
            spread: this.spread,
        });
    }
}
