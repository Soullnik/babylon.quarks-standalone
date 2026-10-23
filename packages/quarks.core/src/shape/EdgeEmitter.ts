import {
    ConstantValue,
    FunctionValueGenerator,
    GeneratorMemory,
    ValueGenerator,
    ValueGeneratorFromJSON,
} from '../functions';
import {EmissionState, IParticleSystem} from '../IParticleSystem';
import {Particle} from '../Particle';
import {EmitterMode, EmitterShape, getValueFromEmitterMode, ShapeJSON} from './EmitterUtil';
import {ShapeTransform} from './ShapeTransform';

/**
 * Interface representing the parameters for an edge emitter.
 */
export interface EdgeEmitterParameters {
    /** Half the length of the line: it runs from -radius to +radius along X. */
    radius?: number;
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
 * A particle emitter that emits particles from a line along X, all moving along +Y like Unity's
 * single-sided Edge shape.
 */
export class EdgeEmitter implements EmitterShape {
    /** Always `'edge'`. */
    type = 'edge';
    /** Half the length of the edge: it runs from -radius to radius along x. */
    radius: number;
    /**
     * How the start point moves along the edge, see {@link EmitterMode}; the edge is the "arc"
     * here, run from -x to +x.
     */
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
    /** State the {@link EdgeEmitter.speed} generator keeps. */
    memory: GeneratorMemory;
    transform?: ShapeTransform;

    private currentValue = 0;

    reset(): void {
        this.currentValue = 0;
        this.memory.length = 0;
    }

    constructor(parameters: EdgeEmitterParameters = {}) {
        this.radius = parameters.radius ?? 1;
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

    /** Starts `p` on the edge, heading along +y at its start speed. */
    initialize(p: Particle, emissionState: EmissionState) {
        const u = getValueFromEmitterMode(this.mode, this.currentValue, this.spread, emissionState);
        p.position.set((u * 2 - 1) * this.radius, 0, 0);
        p.velocity.set(0, p.startSpeed, 0);
        this.transform?.apply(p);
    }

    /** The shape's JSON. */
    toJSON(): ShapeJSON {
        return {
            type: 'edge',
            radius: this.radius,
            mode: this.mode,
            spread: this.spread,
            speed: this.speed.toJSON(),
            ...ShapeTransform.toShapeJSON(this.transform),
        };
    }

    /** Reads {@link EdgeEmitter.toJSON} output; a field the JSON leaves out takes its default. */
    static fromJSON(json: ShapeJSON): EdgeEmitter {
        return new EdgeEmitter({
            radius: json.radius,
            mode: json.mode,
            speed: json.speed ? ValueGeneratorFromJSON(json.speed) : undefined,
            spread: json.spread,
            transform: ShapeTransform.fromJSON(json.transform),
        });
    }

    /** A copy with the same settings. */
    clone(): EmitterShape {
        return new EdgeEmitter({
            radius: this.radius,
            mode: this.mode,
            speed: this.speed.clone(),
            spread: this.spread,
            transform: this.transform?.clone(),
        });
    }
}
