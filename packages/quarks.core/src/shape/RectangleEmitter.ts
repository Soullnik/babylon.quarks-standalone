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
 * Interface representing the parameters for a rectangle emitter.
 */
export interface RectangleEmitterParameters {
    /**
     * Width of the outline, along x; a negative value is read as 0. Defaults to 10.
     */
    width?: number;
    /**
     * Height of the outline, along y; a negative value is read as 0. Defaults to 10.
     */
    height?: number;
    /**
     * How far in from the outline particles may start, as a fraction of the way to the centre,
     * clamped to [0, 1]. 0 is the outline only; 1, the default, fills the whole rectangle. The
     * point along the outline is even per unit of length, so each edge gets particles in
     * proportion to its length, spread evenly over the area of its band.
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
 * Emits from the outline of a rectangle in the xy plane, heading out from its centre: a perimeter
 * emitter, like a Niagara box or plane location with Surface Only, which `thickness` widens into a
 * band toward the centre. Unity's Rectangle shape, a filled rectangle emitting along +z, is a
 * {@link BoxEmitter} with no depth instead.
 */
export class RectangleEmitter implements EmitterShape {
    /** Always `'rectangle'`. */
    type = 'rectangle';
    /** Width of the rectangle, along x. */
    width: number;
    /** Height of the rectangle, along y. */
    height: number;
    /**
     * How far in from the outline particles may start, as a fraction of the way to the centre,
     * clamped to [0, 1]: 0 on the outline, 1 anywhere down to the centre. Each edge gets particles
     * in proportion to its length, spread evenly over the area of its band.
     */
    thickness: number;
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
        if (EmitterMode.Random === this.mode) return;
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

        const width = Math.max(0, this.width);
        const height = Math.max(0, this.height);
        // The point at `u` of the outline, run counter-clockwise from the bottom left corner, and
        // the outward normal of its edge.
        const point = u * 2 * (width + height);
        let x, y, nx, ny;
        if (point < width) {
            x = point - width / 2;
            y = -height / 2;
            nx = 0;
            ny = -1;
        } else if (point < width + height) {
            x = width / 2;
            y = point - width - height / 2;
            nx = 1;
            ny = 0;
        } else if (point < 2 * width + height) {
            x = width / 2 - (point - width - height);
            y = height / 2;
            nx = 0;
            ny = 1;
        } else {
            x = -width / 2;
            y = height / 2 - (point - 2 * width - height);
            nx = -1;
            ny = 0;
        }

        // Thickness scales the outline toward the centre, uniformly over the area of the band
        // between the outline and its copy scaled by 1 - thickness.
        const scale = shellRadius(this.thickness, 2);
        p.position.set(x * scale, y * scale, 0);

        // Out from the centre; along the edge's normal where the point is the centre itself.
        if (x === 0 && y === 0) p.velocity.set(nx, ny, 0);
        else p.velocity.set(x, y, 0).normalize();
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
    static fromJSON(json: ShapeJSON): RectangleEmitter {
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
