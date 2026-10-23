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
import {UP_VEC3, ZERO_VEC3} from '../util/MathUtil';
import {random} from '../util/random';
import {EmitterMode, EmitterShape, getValueFromEmitterMode, ShapeJSON} from './EmitterUtil';
import {ShapeTransform} from './ShapeTransform';

/**
 * Interface representing the parameters for a rectangle emitter.
 */
export interface RectangleEmitterParameters {
    /**
     * The width of the rectangle.
     */
    width?: number;
    /**
     * The height of the rectangle.
     */
    height?: number;
    /**
     * The thickness of the ring.
     * 1 is a full rectangle, 0 is a ring with 0 radius.
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
 * a particle emitter that emits particles from a rectangle.
 */
export class RectangleEmitter implements EmitterShape {
    /** Always `'rectangle'`. */
    type = 'rectangle';
    /** Width of the rectangle, along x. */
    width: number;
    /** Height of the rectangle, along y. */
    height: number;
    /**
     * How far in from the edge particles may start, as a fraction of the way to the centre: 0 on
     * the edge, 1 anywhere down to the centre.
     */
    thickness: number; // [0, 1]
    /**
     * How the start point moves around the edge, see {@link EmitterMode}; the edge is the "arc"
     * here, run from the bottom left corner.
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
    /** State the {@link RectangleEmitter.speed} generator keeps. */
    memory: GeneratorMemory;
    transform?: ShapeTransform;

    private currentValue = 0;

    reset(): void {
        this.currentValue = 0;
        this.memory.length = 0;
    }

    /**
     * Scratch matrix.
     * @internal
     */
    private _m1: Matrix4;

    constructor(parameters: RectangleEmitterParameters = {}) {
        this.width = parameters.width ?? 10;
        this.height = parameters.height ?? 10;
        this.thickness = parameters.thickness ?? 1;
        this.mode = parameters.mode ?? EmitterMode.Random;
        this.spread = parameters.spread ?? 0;
        this.speed = parameters.speed ?? new ConstantValue(1);
        this.memory = [];
        this.transform = parameters.transform;

        this._m1 = new Matrix4();
    }

    /** Advances the arc sweep by `delta` seconds in the `Loop` and `PingPong` modes. */
    update(system: IParticleSystem, delta: number): void {
        this.currentValue += this.speed.genValue(this.memory, system.emissionState.time / system.duration) * delta;
    }

    /**
     * Starts `p` on the rectangle's edge, heading away from the centre at its start speed and, when
     * it has no start rotation, facing that way.
     */
    initialize(p: Particle, emissionState: EmissionState) {
        const u = getValueFromEmitterMode(this.mode, this.currentValue, this.spread, emissionState);
        // Drawn and unused: seeded effects keep the random sequence they had.
        random();

        // Calculate perimeter points
        const totalPerimeter = 2 * (this.width + this.height);
        const point = u * totalPerimeter;

        // Map perimeter position to x,y coordinates
        let x, y;
        if (point < this.width) {
            // Bottom edge
            x = point - this.width / 2;
            y = -this.height / 2;
        } else if (point < this.width + this.height) {
            // Right edge
            x = this.width / 2;
            y = point - this.width - this.height / 2;
        } else if (point < 2 * this.width + this.height) {
            // Top edge
            x = this.width / 2 - (point - this.width - this.height);
            y = this.height / 2;
        } else {
            // Left edge
            x = -this.width / 2;
            y = this.height / 2 - (point - 2 * this.width - this.height);
        }

        // Apply thickness - lerp from edge point toward center
        const rand = random();
        const thicknessScale = 1 - this.thickness * rand;
        p.position.x = x * thicknessScale;
        p.position.y = y * thicknessScale;
        p.position.z = 0;

        // Set velocity outward from center
        p.velocity.x = x;
        p.velocity.y = y;
        p.velocity.z = 0;
        p.velocity.normalize().multiplyScalar(p.startSpeed);

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
            type: 'rectangle',
            width: this.width,
            height: this.height,
            thickness: this.thickness,
            mode: this.mode,
            spread: this.spread,
            speed: this.speed.toJSON(),
            ...ShapeTransform.toShapeJSON(this.transform),
        };
    }

    /**
     * Reads {@link RectangleEmitter.toJSON} output; a field the JSON leaves out takes its default.
     */
    static fromJSON(json: any): RectangleEmitter {
        return new RectangleEmitter({
            width: json.width,
            height: json.height,
            thickness: json.thickness,
            mode: json.mode,
            speed: json.speed ? ValueGeneratorFromJSON(json.speed) : undefined,
            transform: ShapeTransform.fromJSON(json.transform),
            spread: json.spread,
        });
    }

    /** A copy with the same settings. */
    clone(): EmitterShape {
        return new RectangleEmitter({
            width: this.width,
            height: this.height,
            thickness: this.thickness,
            mode: this.mode,
            speed: this.speed.clone(),
            transform: this.transform?.clone(),
            spread: this.spread,
        });
    }
}
