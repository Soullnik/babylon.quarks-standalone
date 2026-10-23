import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {IParticleSystem, Matrix4, SerializationOptions} from 'quarks.core';
import {quarksNodeId} from './nodeId';

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

    /**
     * The node's world matrix in quarks.core form. Mirrored from Babylon's
     * matrix only when that matrix actually changed (tracked by its
     * `updateFlag`), so repeated reads inside a frame are free.
     */
    get matrixWorld(): Matrix4 {
        const m = this.getWorldMatrix();
        const flag = m.updateFlag;
        if (flag === this._matrixWorldFlag) {
            return this._matrixWorld;
        }
        this._matrixWorldFlag = flag;
        const e = this._matrixWorld.elements;
        const s = m.m;
        e[0] = s[0];
        e[1] = s[1];
        e[2] = s[2];
        e[3] = s[3];
        e[4] = s[4];
        e[5] = s[5];
        e[6] = s[6];
        e[7] = s[7];
        e[8] = s[8];
        e[9] = s[9];
        e[10] = s[10];
        e[11] = s[11];
        e[12] = s[12];
        e[13] = s[13];
        e[14] = s[14];
        e[15] = s[15];
        return this._matrixWorld;
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
    toJSON(meta?: any, options: SerializationOptions = {}): any {
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
