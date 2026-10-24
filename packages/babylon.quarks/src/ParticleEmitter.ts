import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {IParticleSystem, Matrix4, Quaternion, SerializationOptions, Vector3} from 'quarks.core';
import {quarksNodeId} from './nodeId';
import type {BabylonMetaData, ScalingMode} from './system/types';

const tempPosition = new Vector3();
const tempRotation = new Quaternion();
const tempScale = new Vector3();

/** A {@link ParticleEmitter} as its `toJSON` writes it: the node, its transform and its system. */
export interface ParticleEmitterJSON {
    /** The node's id in the effect. */
    uuid: string;
    /** Always `'ParticleEmitter'`. */
    type: 'ParticleEmitter';
    /** The node's name. */
    name: string;
    /** `[x, y, z]`. */
    position: number[];
    /** Euler angles `[x, y, z]` in radians. */
    rotation: number[];
    /** `[x, y, z, w]`, when the node has a rotation quaternion. */
    quaternion?: number[];
    /** `[x, y, z]`. */
    scale: number[];
    /** The node's own enabled flag. */
    visible: boolean;
    /** The system's JSON, as its `toJSON` writes it. */
    ps: unknown;
}

/**
 * Above 0 while a particle system disposes its own emitter (`ParticleSystem.dispose()`, which
 * `autoDestroy` calls when the system finishes). Babylon then disposes the child nodes too, and
 * child emitters keep their systems playing, so an effect's longer-lived children are not cut off
 * when a short parent finishes. Disposing a node directly (`root.dispose()`) disposes its systems.
 */
let systemDisposeDepth = 0;

/** Disposes `emitter` for its own system without disposing the systems of child emitters. */
export function disposeEmitterForSystem(emitter: TransformNode): void {
    systemDisposeDepth++;
    try {
        emitter.dispose();
    } finally {
        systemDisposeDepth--;
    }
}

/**
 * The Babylon node a particle system lives at: its position, rotation and scale place the system,
 * parenting it moves the effect with another node, and disabling it freezes and hides the system.
 * Every {@link ParticleSystem} makes its own, as `system.emitter`.
 */
export class ParticleEmitter extends TransformNode {
    /** The particle system this node carries. */
    system: IParticleSystem;
    private _matrixWorld: Matrix4 = new Matrix4();
    private _matrixWorldFlag = -1;
    private _matrixWorldMode: ScalingMode | undefined;
    private readonly _shapeScale = new Vector3(1, 1, 1);

    /**
     * The matrix the system simulates and draws in, in quarks.core form: the node's world matrix,
     * with its scale as the system's {@link ScalingMode} takes it. `'hierarchy'` keeps the whole
     * world scale; `'local'` puts the node's own `scaling` in place of it, so
     * the parents' scale is left out; `'shape'` takes the scale out, and {@link shapeScale} applies
     * it to the emission shape alone. Recomputed only when Babylon's matrix changed (tracked by its
     * `updateFlag`) or the mode did, so repeated reads inside a frame are free.
     */
    get matrixWorld(): Matrix4 {
        const m = this.getWorldMatrix();
        const flag = m.updateFlag;
        const mode = (this.system as {scalingMode?: ScalingMode} | undefined)?.scalingMode ?? 'hierarchy';
        if (flag === this._matrixWorldFlag && mode === this._matrixWorldMode) {
            return this._matrixWorld;
        }
        this._matrixWorldFlag = flag;
        this._matrixWorldMode = mode;
        const e = this._matrixWorld.elements;
        const s = m.m;
        for (let i = 0; i < 16; i++) {
            e[i] = s[i];
        }
        if (mode === 'hierarchy') {
            this._shapeScale.set(1, 1, 1);
        } else {
            this._matrixWorld.decompose(tempPosition, tempRotation, tempScale);
            if (Number.isNaN(tempRotation.w)) {
                // A zero scale axis leaves no rotation to read; the shape collapses either way.
                tempRotation.identity();
            }
            if (mode === 'local') {
                const own = this.scaling;
                this._matrixWorld.compose(tempPosition, tempRotation, tempScale.set(own.x, own.y, own.z));
                this._shapeScale.set(1, 1, 1);
            } else {
                this._shapeScale.copy(tempScale);
                this._matrixWorld.compose(tempPosition, tempRotation, tempScale.set(1, 1, 1));
            }
        }
        return this._matrixWorld;
    }

    /**
     * What the system's emission shape is scaled by before {@link matrixWorld} places it: the
     * node's world scale in `'shape'` mode, which leaves the particles and their motion unscaled,
     * and 1 otherwise. Read it after `matrixWorld`, which refreshes it.
     */
    get shapeScale(): Vector3 {
        return this._shapeScale;
    }

    /** Whether the node and its parents are enabled; setting it is `setEnabled`. */
    get visible(): boolean {
        return this.isEnabled();
    }

    set visible(value: boolean) {
        this.setEnabled(value);
    }

    /** The id effect files know this emitter by; see {@link quarksNodeId}. */
    get uuid(): string {
        return quarksNodeId(this);
    }

    constructor(system: IParticleSystem, scene?: Scene) {
        super('particleEmitter', scene || undefined);
        this.system = system;
    }

    /**
     * Disposes the node and the particle system it carries, so `root.dispose()` on an effect tree
     * also removes its systems from their renderer. Safe to call more than once. When a system
     * disposes its own emitter (`ParticleSystem.dispose()`, `autoDestroy`), the systems of child
     * emitters keep playing until they finish or are disposed themselves.
     */
    dispose(doNotRecurse?: boolean, disposeMaterialAndTextures = false): void {
        if (this.isDisposed()) {
            return;
        }
        super.dispose(doNotRecurse, disposeMaterialAndTextures);
        if (systemDisposeDepth > 0) {
            return;
        }
        // IParticleSystem (quarks.core) has no dispose(); ParticleSystem does.
        (this.system as IParticleSystem & {dispose?: () => void}).dispose?.();
    }

    clone(name?: string): ParticleEmitter {
        const clonedSystem = this.system.clone();
        const clonedEmitter = clonedSystem.emitter as ParticleEmitter;
        clonedEmitter.name = name ?? this.name;
        clonedEmitter.position.copyFrom(this.position);
        clonedEmitter.rotation.copyFrom(this.rotation);
        clonedEmitter.scaling.copyFrom(this.scaling);
        if (this.rotationQuaternion) {
            clonedEmitter.rotationQuaternion = this.rotationQuaternion.clone();
        }
        // Its own flag only: a clone of an emitter under a disabled parent is not itself disabled.
        clonedEmitter.setEnabled(this.isEnabled(false));
        return clonedEmitter;
    }

    /**
     * The node and its system in effect-file form: one entry of an effect file's `object` tree,
     * without its children. Geometry, materials and textures go into `meta` when it is given.
     * `visible` is the node's own enabled flag, not the one it inherits from its parents. To write
     * a whole effect, with its children and resources, use `serializeEffect`.
     */
    toJSON(meta?: BabylonMetaData, options: SerializationOptions = {}): ParticleEmitterJSON {
        return {
            uuid: quarksNodeId(this),
            type: 'ParticleEmitter',
            name: this.name,
            position: [this.position.x, this.position.y, this.position.z],
            rotation: [this.rotation.x, this.rotation.y, this.rotation.z],
            quaternion: this.rotationQuaternion
                ? [
                      this.rotationQuaternion.x,
                      this.rotationQuaternion.y,
                      this.rotationQuaternion.z,
                      this.rotationQuaternion.w,
                  ]
                : undefined,
            scale: [this.scaling.x, this.scaling.y, this.scaling.z],
            visible: this.isEnabled(false),
            ps: this.system.toJSON(meta, options),
        };
    }
}
