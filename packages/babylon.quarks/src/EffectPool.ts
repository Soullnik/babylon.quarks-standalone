import {Quaternion, Vector3} from '@babylonjs/core/Maths/math.vector';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Node} from '@babylonjs/core/node';
import {BatchedRenderer} from './BatchedRenderer';
import {disposeEffect} from './effectResources';
import {ParticleSystem} from './ParticleSystem';
import {QuarksUtil} from './QuarksUtil';

/** Options for a new {@link EffectPool}. */
export interface EffectPoolOptions {
    /** The renderer every copy the pool makes is added to. */
    renderer: BatchedRenderer;
    /** Copies made up front, so the first plays do not pay for cloning. Default 0. */
    prewarm?: number;
    /** Most copies the pool will ever hold; {@link EffectPool.acquire} returns null past it. Default unlimited. */
    maxSize?: number;
}

/**
 * Where {@link EffectPool.acquire} puts a copy. Each part left out is the template's own, as the
 * copy was made, so nothing carries over from the copy's previous use.
 */
export interface EffectPlacement {
    /** Local position under {@link parent}. */
    position?: Vector3;
    /** Local rotation as Euler angles in radians; ignored when {@link rotationQuaternion} is set. */
    rotation?: Vector3;
    /** Local rotation as a quaternion, for a direction: a hit normal, a muzzle's facing. */
    rotationQuaternion?: Quaternion;
    /** Local scale. */
    scaling?: Vector3;
    /** The node the copy is parented to; none (world space) by default. */
    parent?: Node | null;
}

/** The local transform a copy is put back to on every acquire. */
interface RestTransform {
    position: Vector3;
    rotation: Vector3;
    rotationQuaternion: Quaternion | null;
    scaling: Vector3;
}

/**
 * A pool of copies of one effect, for effects played many times over: hits,
 * footsteps, muzzle flashes, pickups.
 *
 * {@link acquire} hands out an idle copy (or makes one), places it and plays
 * it; a copy whose every system has finished goes back to the pool by itself,
 * so a one-shot effect needs nothing more. A looping effect is ended with
 * {@link stop}, which lets its particles die out before the copy returns, or
 * dropped at once with {@link release}.
 *
 * Idle copies are parked disabled, which costs the renderer nothing, and keep
 * their place in its batches, so acquiring one allocates nothing.
 *
 * A copy disposed from outside (by its own `dispose()`, or with a parent it
 * was acquired under) leaves the pool on its own, and the pool makes a new
 * one when it needs it.
 *
 * The template itself is never played by the pool; it is only cloned. Disable
 * it, or keep it out of the renderer, if it is not meant to be seen.
 */
export class EffectPool {
    private readonly idle: TransformNode[] = [];
    private readonly playing = new Set<TransformNode>();
    private readonly systemsOf = new Map<TransformNode, ParticleSystem[]>();
    private readonly restOf = new Map<TransformNode, RestTransform>();
    private disposed = false;

    constructor(
        private readonly template: TransformNode,
        private readonly options: EffectPoolOptions
    ) {
        for (let i = 0; i < (options.prewarm ?? 0); i++) {
            const copy = this.makeCopy();
            if (copy === null) {
                break;
            }
            this.idle.push(copy);
        }
    }

    /** Copies currently playing. */
    get activeCount(): number {
        return this.playing.size;
    }

    /** Copies parked and ready. */
    get idleCount(): number {
        return this.idle.length;
    }

    /**
     * Takes an idle copy (making one when none is idle and the pool is under
     * its size), places it and starts it from the beginning. The copy's
     * transform is put back to the template's first, so a rotation or scale
     * from its last use does not stay. Null when the pool is full or disposed.
     *
     * @param placement - Where to put the copy, or just its position.
     * @param parent - The node to parent it to, when `placement` is a position;
     *   ignored otherwise (use {@link EffectPlacement.parent}).
     */
    acquire(placement?: Vector3 | EffectPlacement, parent: Node | null = null): TransformNode | null {
        if (this.disposed) {
            return null;
        }
        const copy = this.idle.pop() ?? this.makeCopy();
        if (copy === null) {
            return null;
        }
        const place: EffectPlacement =
            placement === undefined || placement instanceof Vector3 ? {position: placement, parent} : placement;
        this.placeCopy(copy, place);
        copy.setEnabled(true);
        this.playing.add(copy);
        QuarksUtil.restart(copy);
        QuarksUtil.play(copy);
        return copy;
    }

    /**
     * Ends the emission of a playing copy; it returns to the pool on its own
     * once its particles have died, looping systems included.
     */
    stop(copy: TransformNode): void {
        if (this.playing.has(copy)) {
            QuarksUtil.endEmit(copy);
        }
    }

    /** Puts a copy back at once, particles and all, parked and disabled. */
    release(copy: TransformNode): void {
        if (!this.playing.delete(copy)) {
            return;
        }
        if (copy.isDisposed()) {
            this.forget(copy);
            return;
        }
        QuarksUtil.stop(copy);
        copy.setEnabled(false);
        copy.parent = null;
        if (!this.disposed) {
            this.idle.push(copy);
        }
    }

    /** Disposes every copy, playing or idle. The template is left alone. */
    dispose(): void {
        this.disposed = true;
        for (const copy of [...this.playing, ...this.idle]) {
            this.playing.delete(copy);
            this.disposeCopy(copy);
        }
        this.idle.length = 0;
    }

    private makeCopy(): TransformNode | null {
        const made = this.idle.length + this.playing.size;
        if (made >= (this.options.maxSize ?? Infinity)) {
            return null;
        }
        const copy = QuarksUtil.instantiate(this.template);
        const systems: ParticleSystem[] = [];
        QuarksUtil.runOnAllParticleEmitters(copy, (emitter) => {
            const system = emitter.system as unknown as ParticleSystem;
            // The pool owns the copy's life; a system disposing itself would
            // pull one emitter out of an effect that is meant to play again.
            system.autoDestroy = false;
            system.addEventListener('finished', this.onSystemFinished);
            systems.push(system);
        });
        this.systemsOf.set(copy, systems);
        this.restOf.set(copy, {
            position: copy.position.clone(),
            rotation: copy.rotation.clone(),
            rotationQuaternion: copy.rotationQuaternion?.clone() ?? null,
            scaling: copy.scaling.clone(),
        });
        QuarksUtil.addToBatchRenderer(copy, this.options.renderer);
        copy.setEnabled(false);
        copy.parent = null;
        // A copy disposed from outside, or with a parent it was placed under, is let go of.
        copy.onDisposeObservable.addOnce(() => this.forget(copy));
        return copy;
    }

    /** Puts the copy back to the template's transform, then applies `place`. */
    private placeCopy(copy: TransformNode, place: EffectPlacement): void {
        const rest = this.restOf.get(copy)!;
        copy.parent = place.parent ?? null;
        copy.position.copyFrom(place.position ?? rest.position);
        copy.scaling.copyFrom(place.scaling ?? rest.scaling);
        if (place.rotationQuaternion !== undefined) {
            copy.rotationQuaternion = place.rotationQuaternion.clone();
        } else if (place.rotation !== undefined) {
            copy.rotationQuaternion = null;
            copy.rotation.copyFrom(place.rotation);
        } else {
            copy.rotationQuaternion = rest.rotationQuaternion?.clone() ?? null;
            copy.rotation.copyFrom(rest.rotation);
        }
    }

    /** Drops every trace of a copy, which was or is being disposed. */
    private forget(copy: TransformNode): void {
        for (const system of this.systemsOf.get(copy) ?? []) {
            system.removeEventListener('finished', this.onSystemFinished);
            this.options.renderer.deleteSystem(system);
            system.dispose();
        }
        this.systemsOf.delete(copy);
        this.restOf.delete(copy);
        this.playing.delete(copy);
        const index = this.idle.indexOf(copy);
        if (index !== -1) {
            this.idle.splice(index, 1);
        }
    }

    private disposeCopy(copy: TransformNode): void {
        this.forget(copy);
        // Lets go of the textures and materials the copy shares with the template.
        disposeEffect(copy);
    }

    /** The copy a system belongs to is done when all of its systems are. */
    private readonly onSystemFinished = (event: {particleSystem: unknown}): void => {
        const system = event.particleSystem as ParticleSystem;
        for (const copy of this.playing) {
            const systems = this.systemsOf.get(copy);
            if (systems !== undefined && systems.includes(system)) {
                if (QuarksUtil.isEffectFinished(copy)) {
                    this.release(copy);
                }
                return;
            }
        }
    };
}
