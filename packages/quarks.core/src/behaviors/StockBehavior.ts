import type {Constructable} from '../TypeUtil';
import {ApplyCollision} from './ApplyCollision';
import {ApplyForce} from './ApplyForce';
import {ApplySequences} from './ApplySequences';
import type {Behavior} from './Behavior';
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
 * The built-in behavior classes, by their `type`. Held here rather than read from the plugin
 * registry, which a plugin can change.
 */
const STOCK_BEHAVIORS: {readonly [type: string]: Constructable<Behavior>} = {
    ApplyCollision,
    ApplyForce,
    ApplySequences,
    ChangeEmitDirection,
    ColorBySpeed,
    ColorOverLife,
    EmitSubParticleSystem,
    ForceOverLife,
    FrameOverLife,
    GravityForce,
    InheritVelocity,
    LimitSpeedOverLife,
    Noise,
    OrbitOverLife,
    Rotation3DOverLife,
    RotationBySpeed,
    RotationOverLife,
    SizeBySpeed,
    SizeOverLife,
    SpeedOverLife,
    TurbulenceField,
    VelocityOverLife,
    WidthOverLength,
};

/**
 * The built-in type a behavior runs exactly as, or undefined when it does not.
 *
 * A behavior counts as a built-in only when it is an instance of that built-in class and still
 * runs the class's own `update` and `updateAll`. Only then may a renderer replace its per-particle
 * work with compiled code ({@link planBehaviorFusion}) or rely on what the built-in writes. A
 * behavior that only shares the `type` string, a subclass that overrides `update`, or an instance
 * whose `update` was replaced is a custom behavior: it runs its own code, and is assumed to write
 * anything. A subclass that keeps `update` (to add a field, or change `frameUpdate` or `toJSON`)
 * is still compiled.
 *
 * @internal
 */
export function stockBehaviorType(behavior: Behavior): string | undefined {
    const type = behavior.type;
    if (!Object.prototype.hasOwnProperty.call(STOCK_BEHAVIORS, type)) {
        return undefined;
    }
    const stock = STOCK_BEHAVIORS[type];
    if (!(behavior instanceof stock)) {
        return undefined;
    }
    const prototype = stock.prototype as Behavior;
    return behavior.update === prototype.update && behavior.updateAll === prototype.updateAll ? type : undefined;
}

/** The object in `behavior`'s prototype chain, itself included, that holds `key`. */
function owner(behavior: object, key: string): object | null {
    let object: object | null = behavior;
    while (object !== null && !Object.prototype.hasOwnProperty.call(object, key)) {
        object = Object.getPrototypeOf(object) as object | null;
    }
    return object;
}

/**
 * Whether a system should call `behavior.updateAll` rather than `update` per particle: when it has
 * one, defined no further up its class chain than its `update`. A subclass that overrides only
 * `update` inherits its parent's `updateAll`, which would skip the override; its `update` runs
 * instead.
 *
 * @internal
 */
export function runsUpdateAll(behavior: Behavior): boolean {
    if (behavior.updateAll === undefined) {
        return false;
    }
    const updateAllOwner = owner(behavior, 'updateAll');
    const updateOwner = owner(behavior, 'update');
    // The updateAll's owner must be the update's owner or sit below it in the chain.
    return (
        updateOwner === null ||
        updateAllOwner === updateOwner ||
        Object.prototype.isPrototypeOf.call(updateOwner, updateAllOwner as object)
    );
}
