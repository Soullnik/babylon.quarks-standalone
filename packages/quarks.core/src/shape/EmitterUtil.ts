import type {FunctionJSON} from '../functions/FunctionJSON';
import {EmissionState, IParticleSystem} from '../IParticleSystem';
import {Particle} from '../Particle';
import {random} from '../util/random';
import type {ShapeTransform, ShapeTransformJSON} from './ShapeTransform';

/**
 * The JSON form of an emitter shape. `type` names the shape; the other fields are the ones that
 * shape has, under the names of its own fields.
 */
export interface ShapeJSON {
    /** The shape's type (`'sphere'`, `'cone'`, …). */
    type: string;
    /** Radius of a sphere, hemisphere, circle, cone or donut. */
    radius?: number;
    /** Arc in radians that a round shape emits from. */
    arc?: number;
    /**
     * Fraction of a round shape's radius it emits from, measured in from the surface: 0 the
     * surface, 1 the whole volume.
     */
    thickness?: number;
    /** Radius of a donut's tube. */
    donutRadius?: number;
    /** Opening angle of a cone, in radians. */
    angle?: number;
    /** Width of a rectangle, box or grid. */
    width?: number;
    /** Height of a rectangle, box or grid. */
    height?: number;
    /** Depth of a box. */
    depth?: number;
    /** Where a box emits from (its volume, shell or edges), a `BoxEmitFrom` value. */
    emitFrom?: number;
    /** Thickness of a box's shell along x, y and z. */
    boxThickness?: number[];
    /** Columns of a grid. */
    column?: number;
    /** Rows of a grid. */
    row?: number;
    /** Uuid of the mesh a mesh-surface shape emits from. */
    mesh?: string;
    /** The {@link EmitterMode} of the shape's arc. */
    mode?: number;
    /** Kept for three.quarks files, which can name a system here; no built-in shape reads it. */
    particleSystem?: string;
    /** Spread of the arc: emission points snap to multiples of it; 0 for none. */
    spread?: number;
    /** Speed of the arc sweep in arcs per second, a value generator's JSON. */
    speed?: FunctionJSON;
    /** Local offset / rotation / scale of the shape; omitted when there is none. */
    transform?: ShapeTransformJSON;
}

/**
 * Enum representing the emitter modes for particles.
 */
export enum EmitterMode {
    /** Each particle starts at a random point of the arc. */
    Random,
    /** The start point sweeps the arc at the shape's `speed` (arcs per second) and wraps around. */
    Loop,
    /** The start point sweeps the arc back and forth, starting at the arc's start. */
    PingPong,
    /** A burst's particles are spread evenly over the arc; particles emitted by rate start at random. */
    Burst,
}

/**
 * Where along the shape's arc (0…1) the next particle starts, from the shape's
 * {@link EmitterMode} (Unity's Arc Mode): random; `Loop` sweeps the arc and wraps
 * (`currentValue` is the sweep position in arcs, any sign); `PingPong` sweeps back
 * and forth, starting at the arc's start; `Burst` spreads a burst's particles evenly
 * over the arc and places rate-emitted particles at random. A `spread` above 0 then
 * snaps the result to multiples of it (Unity's Spread), so 0.25 emits from four
 * points. The result is always within 0…1.
 */
export function getValueFromEmitterMode(
    mode: EmitterMode,
    currentValue: number,
    spread: number,
    emissionState: EmissionState
): number {
    let u: number;
    switch (mode) {
        case EmitterMode.Loop:
            u = currentValue - Math.floor(currentValue);
            break;
        case EmitterMode.PingPong: {
            const phase = currentValue - 2 * Math.floor(currentValue / 2);
            u = 1 - Math.abs(phase - 1);
            break;
        }
        case EmitterMode.Burst:
            u =
                emissionState.isBursting && emissionState.burstParticleCount > 0
                    ? emissionState.burstParticleIndex / emissionState.burstParticleCount
                    : random();
            break;
        default:
            u = random();
    }
    if (spread > 0) {
        u = Math.floor(u / spread) * spread;
    }
    return u;
}

/**
 * Where a system's particles start and which way they head: a sphere, cone, box, mesh surface and
 * so on. Register more with an `EmitterShapePlugin`.
 */
export interface EmitterShape {
    /** The shape's type, as its JSON writes it. */
    type: string;
    /**
     * Places a new particle: sets its position and direction and its velocity, the direction at
     * the particle's start speed, in the system's space.
     */
    initialize(particle: Particle, emissionState: EmissionState): void;
    /** The shape's JSON. */
    toJSON(): ShapeJSON;
    /**
     * Advances the shape's own state (its arc sweep) by `delta` seconds; called once per step
     * before emission.
     */
    update(system: IParticleSystem, delta: number): void;
    /** A copy of the shape with the same settings. */
    clone(): EmitterShape;
    /**
     * Optional local transform of the shape inside its particle system, applied
     * by the shape itself at the end of {@link initialize}.
     */
    transform?: ShapeTransform;
    /**
     * Forgets the state the shape built up while emitting (the arc sweep position of
     * `Loop`/`PingPong` shapes, generator memory), so a restarted system emits from the
     * start of the arc again. Called by the particle system's `restart()`.
     */
    reset?(): void;
}
