import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {IParticleSystem, Matrix4, SerializationOptions, Vector3} from 'quarks.core';
import {quarksNodeId} from './nodeId';
import type {BabylonMetaData, ScalingMode} from './system/types';

const axisLengths = [0, 0, 0];
const crossA = new Vector3();
const crossB = new Vector3();

/** Below this an axis of the world matrix counts as scaled to 0. */
const ZERO_AXIS = 1e-12;

/**
 * Sets the length of basis column `axis` of the 4×4 `e` to `target`, keeping its direction and
 * sign. A column of length 0 is rebuilt as the cross product of the other two, in the order that
 * keeps the basis right-handed, or as the bare axis when they are degenerate too.
 */
function setAxisLength(e: number[], axis: number, lengths: number[], target: number): void {
    const o = axis * 4;
    const length = lengths[axis];
    if (length > ZERO_AXIS) {
        const k = target / length;
        e[o] *= k;
        e[o + 1] *= k;
        e[o + 2] *= k;
        return;
    }
    const a = (axis + 1) % 3;
    const b = (axis + 2) % 3;
    if (lengths[a] > ZERO_AXIS && lengths[b] > ZERO_AXIS) {
        crossA.set(e[a * 4], e[a * 4 + 1], e[a * 4 + 2]);
        crossB.set(e[b * 4], e[b * 4 + 1], e[b * 4 + 2]);
        crossA.cross(crossB).normalize().multiplyScalar(target);
        e[o] = crossA.x;
        e[o + 1] = crossA.y;
        e[o + 2] = crossA.z;
    } else {
        e[o] = axis === 0 ? target : 0;
        e[o + 1] = axis === 1 ? target : 0;
        e[o + 2] = axis === 2 ? target : 0;
    }
}

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
     * with the length of each axis set by the system's {@link ScalingMode}. `'hierarchy'` keeps the
     * whole world scale; `'local'` sets each axis to the node's own `scaling` (times
     * `scalingDeterminant`), leaving the parents' scale out; `'shape'` sets each to 1, and
     * {@link shapeScale} applies the world scale to the emission shape alone. Only the axes'
     * lengths change, so position, rotation and any mirroring from the hierarchy are kept. An axis
     * that a parent scales to 0 has no direction left: it is rebuilt square to the other two. A
     * node whose system has no scaling mode reads as `'hierarchy'`. Recomputed only when Babylon's
     * matrix changed (tracked by its `updateFlag`) or the mode did, so repeated reads inside a frame
     * are free.
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
        this._shapeScale.set(1, 1, 1);
        // Without a parent the world scale is the node's own, so 'local' is 'hierarchy'.
        if (mode === 'hierarchy' || (mode === 'local' && !this.parent)) {
            return this._matrixWorld;
        }
        const own = this.scaling;
        const determinant = this.scalingDeterminant;
        const lengths = axisLengths;
        for (let axis = 0; axis < 3; axis++) {
            const o = axis * 4;
            lengths[axis] = Math.sqrt(e[o] * e[o] + e[o + 1] * e[o + 1] + e[o + 2] * e[o + 2]);
        }
        for (let axis = 0; axis < 3; axis++) {
            const target =
                mode === 'local' ? Math.abs((axis === 0 ? own.x : axis === 1 ? own.y : own.z) * determinant) : 1;
            if (mode === 'shape') {
                this._shapeScale.setComponent(axis, lengths[axis]);
            }
            setAxisLength(e, axis, lengths, target);
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
