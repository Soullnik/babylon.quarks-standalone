import {EmissionState, IParticleSystem} from '../IParticleSystem';
import {Particle} from '../Particle';
import {random} from '../util/random';
import type {ShapeTransform, ShapeTransformJSON} from './ShapeTransform';

export interface ShapeJSON {
    type: string;
    radius?: number;
    arc?: number;
    thickness?: number;
    donutRadius?: number;
    angle?: number;
    width?: number;
    height?: number;
    depth?: number;
    emitFrom?: number;
    boxThickness?: number[];
    column?: number;
    row?: number;
    mesh?: string;
    mode?: number;
    particleSystem?: string;
    spread?: number;
    speed?: any;
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

export interface EmitterShape {
    type: string;
    initialize(particle: Particle, emissionState: EmissionState): void;
    toJSON(): ShapeJSON;
    update(system: IParticleSystem, delta: number): void;
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
