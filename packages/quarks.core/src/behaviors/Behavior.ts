import {IParticleSystem} from '../IParticleSystem';
import {Particle} from '../Particle';
import {Constructable, ParameterPair} from '../TypeUtil';
import {describePart, warnFormat} from '../util/JSONUtil';
import {ApplyCollision} from './ApplyCollision';
import {ApplyForce} from './ApplyForce';
import {ApplySequences} from './ApplySequences';
import {ChangeEmitDirection} from './ChangeEmitDirection';
import {ColorBySpeed} from './ColorBySpeed';
import {ColorOverLife} from './ColorOverLife';
import {EmitSubParticleSystem} from './EmitSubParticleSystem';
import {ForceOverLife} from './ForceOverLife';
import {FrameOverLife} from './FrameOverLife';
import {GravityForce} from './GravityForce';
import {InheritVelocity} from './InheritVelocity';
import {LimitSpeedOverLife} from './LimitSpeedOverLife';
import {Noise} from './Noise';
import {OrbitOverLife} from './OrbitOverLife';
import {Rotation3DOverLife} from './Rotation3DOverLife';
import {RotationBySpeed} from './RotationBySpeed';
import {RotationOverLife} from './RotationOverLife';
import {SizeBySpeed} from './SizeBySpeed';
import {SizeOverLife} from './SizeOverLife';
import {SpeedOverLife} from './SpeedOverLife';
import {TurbulenceField} from './TurbulenceField';
import {VelocityOverLife} from './VelocityOverLife';
import {WidthOverLength} from './WidthOverLength';

/**
 * A behavior changes particles over time; a particle system runs a list of
 * them every simulation step. Each method is called by the host (the system
 * that owns the behavior), in this order:
 *
 * 1. {@link initialize} once per particle, when it is emitted. The particle is
 *    already in the system's pool, placed and given its start values by the
 *    emitter shape, and converted to the simulation space; `particleSystem` is
 *    the system it belongs to. A behavior that reads a per-particle random
 *    sample starts its generators on `particle.memory` here.
 * 2. {@link frameUpdate} once per step, before any particle is updated that
 *    step, with the step's length. Per-step work (decomposing the emitter's
 *    transform, advancing a time offset) belongs here.
 * 3. {@link update} once per live particle, or {@link updateAll} once for the
 *    whole pool when it is implemented. The particle's `age` is the age at the
 *    start of the step; the host adds `delta` and integrates the velocity
 *    after every behavior has run.
 * 4. {@link reset} when the system restarts, before it emits again: state
 *    accumulated across steps goes back to how it was before the first one.
 *
 * Randomness is drawn through `random()` from `quarks.core`'s `util/random`,
 * never `Math.random`, so a host that runs its steps inside `setRandomSource`
 * (or `withRandomSource`) with a seeded generator replays the same effect, as
 * babylon.quarks does for a system with a `seed`. Any other state a behavior
 * keeps must be derived from its settings, so a `clone()` or a saved and
 * reloaded copy behaves the same.
 *
 * {@link toJSON} writes the behavior's settings as plain data, the `type` and
 * every non-default field; `BehaviorTypes[type].loadJSON` reads it back. The
 * `params` of that entry list the fields an editor shows.
 */
export interface Behavior {
    /** The name the behavior is registered under in {@link BehaviorTypes}. */
    type: string;
    /** Called once per particle when it is emitted; see the interface's description for when. */
    initialize(particle: Particle, particleSystem: IParticleSystem): void;
    /** Called once per live particle per step, with the step's length in seconds. */
    update(particle: Particle, delta: number): void;
    /**
     * Optional bulk form of {@link update}, applied to `particles[0..count)`.
     *
     * The per-particle `update` is reached through one call site shared by every
     * behavior type, which leaves it megamorphic: V8 can neither inline it nor
     * specialise the generator calls inside. A behavior that implements this
     * instead gets one call per frame and a loop it owns, where those calls are
     * monomorphic. Implementations must skip dead particles (`age >= life`)
     * exactly as the per-particle path does, and must produce identical results.
     *
     * Behaviors that do not implement it keep working unchanged.
     */
    updateAll?(particles: Array<Particle>, count: number, delta: number): void;
    /** Called once per step before the particles are updated, with the step's length in seconds. */
    frameUpdate(delta: number): void;
    /** The behavior's settings as plain data, with its `type`; see the interface's description. */
    toJSON(): any;
    /** A copy with the same settings that shares nothing mutable with this one. */
    clone(): Behavior;
    /** Called when the system restarts: forget state accumulated across steps. */
    reset(): void;
}

export interface BehaviorPlugin {
    type: string;
    constructor: Constructable<Behavior>;
    params: ParameterPair[];
    loadJSON: (json: any, particleSystem: IParticleSystem) => Behavior;
}

export const BehaviorTypes: {[key: string]: BehaviorPlugin} = {
    ApplyForce: {
        type: 'ApplyForce',
        constructor: ApplyForce,
        params: [
            ['direction', ['vec3']],
            ['magnitude', ['value']],
            ['space', ['string']],
        ],
        loadJSON: ApplyForce.fromJSON,
    },
    Noise: {
        type: 'Noise',
        constructor: Noise,
        params: [
            ['frequency', ['value']],
            ['power', ['value']],
            ['positionAmount', ['value']],
            ['rotationAmount', ['value']],
            ['scrollSpeed', ['value']],
            ['remap', ['valueFunc']],
        ],
        loadJSON: Noise.fromJSON,
    },
    TurbulenceField: {
        type: 'TurbulenceField',
        constructor: TurbulenceField,
        params: [
            ['scale', ['vec3']],
            ['octaves', ['number']],
            ['velocityMultiplier', ['vec3']],
            ['timeScale', ['vec3']],
            ['seed', ['number']],
        ],
        loadJSON: TurbulenceField.fromJSON,
    },
    GravityForce: {
        type: 'GravityForce',
        constructor: GravityForce,
        params: [
            ['center', ['vec3']],
            ['magnitude', ['number']],
        ],
        loadJSON: GravityForce.fromJSON,
    },
    ColorOverLife: {
        type: 'ColorOverLife',
        constructor: ColorOverLife,
        params: [['color', ['colorFunc']]],
        loadJSON: ColorOverLife.fromJSON,
    },
    RotationOverLife: {
        type: 'RotationOverLife',
        constructor: RotationOverLife,
        params: [['angularVelocity', ['value', 'valueFunc']]],
        loadJSON: RotationOverLife.fromJSON,
    },
    Rotation3DOverLife: {
        type: 'Rotation3DOverLife',
        constructor: Rotation3DOverLife,
        params: [['angularVelocity', ['rotationFunc']]],
        loadJSON: Rotation3DOverLife.fromJSON,
    },
    SizeOverLife: {
        type: 'SizeOverLife',
        constructor: SizeOverLife,
        params: [['size', ['value', 'valueFunc', 'vec3Func']]],
        loadJSON: SizeOverLife.fromJSON,
    },
    ColorBySpeed: {
        type: 'ColorBySpeed',
        constructor: ColorBySpeed,
        params: [
            ['color', ['colorFunc']],
            ['speedRange', ['range']],
        ],
        loadJSON: ColorBySpeed.fromJSON,
    },
    RotationBySpeed: {
        type: 'RotationBySpeed',
        constructor: RotationBySpeed,
        params: [
            ['angularVelocity', ['value', 'valueFunc']],
            ['speedRange', ['range']],
        ],
        loadJSON: RotationBySpeed.fromJSON,
    },
    SizeBySpeed: {
        type: 'SizeBySpeed',
        constructor: SizeBySpeed,
        params: [
            ['size', ['value', 'valueFunc', 'vec3Func']],
            ['speedRange', ['range']],
        ],
        loadJSON: SizeBySpeed.fromJSON,
    },
    SpeedOverLife: {
        type: 'SpeedOverLife',
        constructor: SpeedOverLife,
        params: [['speed', ['value', 'valueFunc']]],
        loadJSON: SpeedOverLife.fromJSON,
    },
    FrameOverLife: {
        type: 'FrameOverLife',
        constructor: FrameOverLife,
        params: [
            ['frame', ['value', 'valueFunc']],
            ['fps', ['number']],
            ['cycles', ['number']],
            ['frameCount', ['number']],
            ['loop', ['boolean']],
            ['random', ['boolean']],
            ['startFrame', ['value']],
        ],
        loadJSON: FrameOverLife.fromJSON,
    },
    ForceOverLife: {
        type: 'ForceOverLife',
        constructor: ForceOverLife,
        params: [
            ['x', ['value', 'valueFunc']],
            ['y', ['value', 'valueFunc']],
            ['z', ['value', 'valueFunc']],
            ['space', ['string']],
        ],
        loadJSON: ForceOverLife.fromJSON,
    },
    VelocityOverLife: {
        type: 'VelocityOverLife',
        constructor: VelocityOverLife,
        params: [
            ['linearX', ['value', 'valueFunc']],
            ['linearY', ['value', 'valueFunc']],
            ['linearZ', ['value', 'valueFunc']],
            ['orbitalX', ['value', 'valueFunc']],
            ['orbitalY', ['value', 'valueFunc']],
            ['orbitalZ', ['value', 'valueFunc']],
            ['space', ['string']],
            ['radial', ['value', 'valueFunc']],
            ['orbitalOffset', ['vec3']],
        ],
        loadJSON: VelocityOverLife.fromJSON,
    },
    InheritVelocity: {
        type: 'InheritVelocity',
        constructor: InheritVelocity,
        params: [
            ['multiplier', ['value', 'valueFunc']],
            ['mode', ['string']],
        ],
        loadJSON: InheritVelocity.fromJSON,
    },
    OrbitOverLife: {
        type: 'OrbitOverLife',
        constructor: OrbitOverLife,
        params: [
            ['orbitSpeed', ['value', 'valueFunc']],
            ['axis', ['vec3']],
            ['space', ['string']],
        ],
        loadJSON: OrbitOverLife.fromJSON,
    },
    WidthOverLength: {
        type: 'WidthOverLength',
        constructor: WidthOverLength,
        params: [
            ['width', ['value', 'valueFunc']],
            ['absolute', ['boolean']],
        ],
        loadJSON: WidthOverLength.fromJSON,
    },
    ChangeEmitDirection: {
        type: 'ChangeEmitDirection',
        constructor: ChangeEmitDirection,
        params: [['angle', ['value']]],
        loadJSON: ChangeEmitDirection.fromJSON,
    },
    ApplySequences: {
        type: 'ApplySequences',
        constructor: ApplySequences,
        // The sequencers are appended in code (appendSequencer); only the delay is a plain parameter.
        params: [['delay', ['number']]],
        loadJSON: ApplySequences.fromJSON,
    },
    EmitSubParticleSystem: {
        type: 'EmitSubParticleSystem',
        constructor: EmitSubParticleSystem,
        params: [
            ['particleSystem', ['self']],
            ['useVelocityAsBasis', ['boolean']],
            ['subParticleSystem', ['particleSystem']],
            ['mode', ['number']],
            ['emitProbability', ['number']],
            // `inherit` is a list of property names; no FieldType describes one yet.
        ],
        loadJSON: EmitSubParticleSystem.fromJSON,
    },
    LimitSpeedOverLife: {
        type: 'LimitSpeedOverLife',
        constructor: LimitSpeedOverLife,
        params: [
            ['speed', ['value', 'valueFunc']],
            ['dampen', ['number']],
        ],
        loadJSON: LimitSpeedOverLife.fromJSON,
    },
    ApplyCollision: {
        type: 'ApplyCollision',
        constructor: ApplyCollision,
        // The resolver is host-provided (getPhysicsResolver), not serialized; only bounce round-trips.
        params: [['bounce', ['number']]],
        loadJSON: ApplyCollision.fromJSON,
    },
};

/**
 * Reads a behavior. A type no plugin registered warns and gives `null`; the system loads without
 * that behavior.
 */
export function BehaviorFromJSON(json: any, particleSystem: IParticleSystem): Behavior | null {
    const behavior = json ? BehaviorTypes[json.type] : undefined;
    if (behavior) {
        return behavior.loadJSON(json, particleSystem);
    }
    warnFormat(`${describePart('behavior', json)}; it is skipped.`);
    return null;
}
