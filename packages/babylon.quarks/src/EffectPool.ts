import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Node} from '@babylonjs/core/node';
import {BatchedRenderer} from './BatchedRenderer';
import {ParticleSystem} from './ParticleSystem';
import {QuarksUtil} from './QuarksUtil';

export interface EffectPoolOptions {
    /** The renderer every copy the pool makes is added to. */
    renderer: BatchedRenderer;
    /** Copies made up front, so the first plays do not pay for cloning. Default 0. */
    prewarm?: number;
    /** Most copies the pool will ever hold; {@link EffectPool.acquire} returns null past it. Default unlimited. */
    maxSize?: number;
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
 * The template itself is never played by the pool; it is only cloned. Disable
 * it, or keep it out of the renderer, if it is not meant to be seen.
 */
export class EffectPool {
    private readonly idle: TransformNode[] = [];
    private readonly playing = new Set<TransformNode>();
    private readonly systemsOf = new Map<TransformNode, ParticleSystem[]>();
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
     * its size), parents it, places it and starts it from the beginning.
     * Null when the pool is full or disposed.
     */
    acquire(position?: Vector3, parent: Node | null = null): TransformNode | null {
        if (this.disposed) {
            return null;
        }
        const copy = this.idle.pop() ?? this.makeCopy();
        if (copy === null) {
            return null;
        }
        copy.parent = parent;
        if (position !== undefined) {
            copy.position.copyFrom(position);
        }
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
        QuarksUtil.addToBatchRenderer(copy, this.options.renderer);
        copy.setEnabled(false);
        copy.parent = null;
        return copy;
    }

    private disposeCopy(copy: TransformNode): void {
        const systems = this.systemsOf.get(copy) ?? [];
        for (const system of systems) {
            system.removeEventListener('finished', this.onSystemFinished);
            this.options.renderer.deleteSystem(system);
            system.dispose();
        }
        this.systemsOf.delete(copy);
        copy.dispose();
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
