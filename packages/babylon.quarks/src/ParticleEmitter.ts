import {Matrix, Quaternion} from '@babylonjs/core/Maths/math.vector';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Node} from '@babylonjs/core/node';
import {Scene} from '@babylonjs/core/scene';
import {IParticleSystem, Matrix4, Vector3} from 'quarks.core';
import {quarksNodeId} from './nodeId';
import type {BabylonMetaData, ScalingMode} from './system/types';

const axisLengths = [0, 0, 0];
const crossA = new Vector3();
const crossB = new Vector3();
const leafSigns = new Vector3();
const chainSigns = new Vector3();

/** Below this an axis of the world matrix counts as scaled to 0. */
const ZERO_AXIS = 1e-12;

/** Above this cosine between two of its axes a world matrix counts as skewed. */
const SKEW_COSINE = 1e-5;

const worldTurn = new Quaternion();
const localTurn = new Quaternion();
const turnMatrix = new Matrix();
const frameMatrix = new Matrix();
/** A rotation matrix's elements for {@link turnOfMatrix}, its last row and column those of identity. */
const frame = Matrix.Identity().asArray().slice();

/**
 * Whether the axes of the 4×4 `m` (Babylon's layout, a basis vector per row of four) are not
 * square to each other: a non-uniform scale with a turn below it, which no position, rotation
 * and scale can give. An axis scaled to 0 is square to anything.
 */
function isSkewed(m: ArrayLike<number>): boolean {
    for (let a = 0; a < 3; a++) {
        for (let b = a + 1; b < 3; b++) {
            const oa = a * 4;
            const ob = b * 4;
            const dot = m[oa] * m[ob] + m[oa + 1] * m[ob + 1] + m[oa + 2] * m[ob + 2];
            const la = m[oa] * m[oa] + m[oa + 1] * m[oa + 1] + m[oa + 2] * m[oa + 2];
            const lb = m[ob] * m[ob] + m[ob + 1] * m[ob + 1] + m[ob + 2] * m[ob + 2];
            if (Math.abs(dot) > SKEW_COSINE * Math.sqrt(la * lb)) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Whether `node` is placed by its position, rotation and scale alone, so that its own rotation is
 * its turn from its parent: a transform node without a pivot or a billboard mode.
 */
function turnsByOwnRotation(node: Node): node is TransformNode {
    return (
        node instanceof TransformNode &&
        node.billboardMode === TransformNode.BILLBOARDMODE_NONE &&
        !node.isUsingPivotMatrix()
    );
}

/** The rotation of `node` relative to its parent, into `out`. */
function ownTurn(node: TransformNode, out: Quaternion): Quaternion {
    if (node.rotationQuaternion) {
        return out.copyFrom(node.rotationQuaternion);
    }
    const r = node.rotation;
    return Quaternion.RotationYawPitchRollToRef(r.y, r.x, r.z, out);
}

/** Whether an axis of the 4×4 `m` (Babylon's layout, a basis vector per row of four) is scaled to 0. */
function hasZeroAxis(m: ArrayLike<number>): boolean {
    for (let o = 0; o < 12; o += 4) {
        if (m[o] * m[o] + m[o + 1] * m[o + 1] + m[o + 2] * m[o + 2] <= ZERO_AXIS * ZERO_AXIS) {
            return true;
        }
    }
    return false;
}

/**
 * The signs of the scale `node` and its parents apply along each of `node`'s axes, into `out`:
 * each node's own signs (its `scaling` times `scalingDeterminant`), multiplied axis by axis, as
 * the signs of Unity's `transform.lossyScale` are, whatever the nodes' turns (measured in Unity 6).
 * A scale of 0 counts as positive. `null` gives no mirror.
 */
function scaleSigns(node: Node | null, out: Vector3): Vector3 {
    out.set(1, 1, 1);
    for (let n = node; n; n = n.parent) {
        if (n instanceof TransformNode) {
            const d = n.scalingDeterminant < 0 ? -1 : 1;
            const s = n.scaling;
            if (s.x * d < 0) out.x = -out.x;
            if (s.y * d < 0) out.y = -out.y;
            if (s.z * d < 0) out.z = -out.z;
        }
    }
    return out;
}

/**
 * `q` as seen through a mirror along the axes `signs` marks negative, diag(s)·q·diag(s), in place:
 * a turn again, about the mirrored axis.
 */
function mirrorTurn(q: Quaternion, signs: Vector3): Quaternion {
    return q.set(signs.y * signs.z * q.x, signs.x * signs.z * q.y, signs.x * signs.y * q.z, q.w);
}

/**
 * The turn of the 4×4 world matrix `m` (Babylon's layout, a basis vector per row of four), as
 * Unity's `transform.rotation` has it, into `out`: each axis divided by its length and by the sign
 * `signs` gives it, which leaves a rotation where Babylon's `decompose` would move a mirror onto
 * an axis of its own choosing.
 */
function turnOfMatrix(m: ArrayLike<number>, signs: Vector3, out: Quaternion): Quaternion {
    for (let axis = 0; axis < 3; axis++) {
        const o = axis * 4;
        const length = Math.sqrt(m[o] * m[o] + m[o + 1] * m[o + 1] + m[o + 2] * m[o + 2]) || 1;
        const k = (axis === 0 ? signs.x : axis === 1 ? signs.y : signs.z) / length;
        frame[o] = m[o] * k;
        frame[o + 1] = m[o + 1] * k;
        frame[o + 2] = m[o + 2] * k;
    }
    return Quaternion.FromRotationMatrixToRef(Matrix.FromArrayToRef(frame, 0, frameMatrix), out);
}

/**
 * The turn of `node` in the world, as Unity's `transform.rotation`, into `out`: its own rotation
 * after each of its parents' in turn, so a non-uniform scale between them does not bend it, and a
 * scale of 0 between them does not lose it. A mirror on a parent does not mirror the turn: Unity
 * takes each node's own rotation as seen through the mirror of the scale above it, diag(s)·q·diag(s)
 * with s the signs of that scale, which keeps it a rotation (measured in Unity 6). A parent whose
 * world matrix is neither skewed nor scaled to 0 on an axis, or that is not placed by its rotation
 * alone, gives the turn of its world matrix for itself and everything above it.
 */
function worldTurnOf(node: TransformNode, out: Quaternion): Quaternion {
    mirrorTurn(ownTurn(node, out), scaleSigns(node.parent, chainSigns));
    let parent = node.parent;
    while (parent) {
        const world = parent.getWorldMatrix();
        if ((!isSkewed(world.m) && !hasZeroAxis(world.m)) || !turnsByOwnRotation(parent)) {
            turnOfMatrix(world.m, scaleSigns(parent, chainSigns), localTurn);
            return localTurn.multiplyToRef(out, out);
        }
        mirrorTurn(ownTurn(parent, localTurn), scaleSigns(parent.parent, chainSigns)).multiplyToRef(out, out);
        parent = parent.parent;
    }
    return out;
}

/**
 * Makes the basis columns of the 4×4 `e`, of lengths `lengths` and already pointing the way the
 * node's turn does, the unit axes of that turn. A column of length 0 is rebuilt as the cross
 * product of the other two, in the order that keeps the basis right-handed. When they are
 * degenerate too, it is the same axis of `turn` (a rotation matrix in Babylon's layout, the node's
 * turn as Unity has it).
 */
function unitAxes(e: number[], lengths: number[], turn: ArrayLike<number>): void {
    for (let axis = 0; axis < 3; axis++) {
        const o = axis * 4;
        const length = lengths[axis];
        if (length > ZERO_AXIS) {
            e[o] /= length;
            e[o + 1] /= length;
            e[o + 2] /= length;
        }
    }
    for (let axis = 0; axis < 3; axis++) {
        const o = axis * 4;
        if (lengths[axis] > ZERO_AXIS) {
            continue;
        }
        const a = (axis + 1) % 3;
        const b = (axis + 2) % 3;
        if (lengths[a] > ZERO_AXIS && lengths[b] > ZERO_AXIS) {
            crossA.set(e[a * 4], e[a * 4 + 1], e[a * 4 + 2]);
            crossB.set(e[b * 4], e[b * 4 + 1], e[b * 4 + 2]);
            crossA.cross(crossB).normalize();
            e[o] = crossA.x;
            e[o + 1] = crossA.y;
            e[o + 2] = crossA.z;
        } else {
            e[o] = turn[o];
            e[o + 1] = turn[o + 1];
            e[o + 2] = turn[o + 2];
        }
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
 * a `destroy` stop action calls when the system finishes). Babylon then disposes the child nodes too, and
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
    private _mirrored = false;
    private readonly _shapeScale = new Vector3(1, 1, 1);
    private readonly _alignedScale = new Vector3(1, 1, 1);

    /**
     * The matrix the system simulates and draws in, in quarks.core form: the node's world matrix,
     * with the scale of each axis set by the system's {@link ScalingMode}, as Unity's. `'hierarchy'`
     * keeps the whole world scale; `'local'` is the node's turn as Unity has it
     * (`transform.rotation`) times the node's own `scaling` (times `scalingDeterminant`), its signs
     * included, leaving the parents' scale and their mirror out; `'shape'` is the turn alone, and
     * {@link shapeScale} applies the world scale, mirror included, to the emission shape alone. The
     * position is kept. Unity's turn is a rotation even under a mirrored parent, so a mirror in the
     * hierarchy above the node does not turn the axes the other way. An axis that a parent scales
     * to 0 has no direction left: it is rebuilt square to the other two, or, when two or all three
     * are scaled to 0, along `transform.rotation`, which a scale of 0 does not lose. A node whose
     * system has no scaling mode reads as `'hierarchy'`. Recomputed only when Babylon's matrix
     * changed (tracked by its `updateFlag`) or the mode did, so repeated reads inside a frame are
     * free.
     *
     * A world matrix can be skewed: a parent scaled unevenly with a turned node below it. Its axes
     * then are not square to each other, and setting their lengths would keep the skew, down to
     * axes that all but coincide. As Unity, `'local'` and `'shape'` then turn the system by the
     * node's rotation after each of its parents' (`transform.rotation`), and take the world scale
     * along those axes (`transform.lossyScale`).
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
        const own = this.scaling;
        const determinant = this.scalingDeterminant;
        // Without a parent the world scale is the node's own, so 'local' is 'hierarchy'.
        if (mode === 'hierarchy' || (mode === 'local' && !this.parent)) {
            this._mirrored = this._matrixWorld.determinant() < 0;
            return this._matrixWorld;
        }
        this._mirrored = mode === 'local' && own.x * own.y * own.z * determinant < 0;
        // The signs of the world scale along each axis, Unity's lossy scale's: the world matrix
        // is the turn times them, axis by axis, when it is not skewed.
        const signs = scaleSigns(this, leafSigns);
        const lengths = axisLengths;
        const r = turnMatrix.m;
        let turned = false;
        if (isSkewed(s)) {
            // The turn as Unity has it, and the world scale along each of its axes, diag(Rᵀ·M):
            // Unity's lossy scale. With the axes square to each other, R·diag(scale) is the world
            // matrix again, which the branch below reads the same way.
            worldTurnOf(this, worldTurn).toRotationMatrix(turnMatrix);
            turned = true;
            for (let axis = 0; axis < 3; axis++) {
                const o = axis * 4;
                const scale = Math.abs(r[o] * s[o] + r[o + 1] * s[o + 1] + r[o + 2] * s[o + 2]);
                e[o] = r[o] * scale;
                e[o + 1] = r[o + 1] * scale;
                e[o + 2] = r[o + 2] * scale;
            }
        } else {
            // Each axis turned back along the node's turn: a mirror in the hierarchy points it
            // the other way.
            for (let axis = 0; axis < 3; axis++) {
                if ((axis === 0 ? signs.x : axis === 1 ? signs.y : signs.z) < 0) {
                    const o = axis * 4;
                    e[o] = -e[o];
                    e[o + 1] = -e[o + 1];
                    e[o + 2] = -e[o + 2];
                }
            }
        }
        let zeroAxes = 0;
        for (let axis = 0; axis < 3; axis++) {
            const o = axis * 4;
            lengths[axis] = Math.sqrt(e[o] * e[o] + e[o + 1] * e[o + 1] + e[o + 2] * e[o + 2]);
            if (lengths[axis] <= ZERO_AXIS) {
                zeroAxes++;
            }
        }
        // A parent scaled to 0 on two axes or all three leaves no turn in the world matrix to
        // rebuild them from; Unity still turns the system by `transform.rotation`, which the
        // parents' rotations give.
        if (zeroAxes >= 2 && !turned) {
            worldTurnOf(this, worldTurn).toRotationMatrix(turnMatrix);
        }
        unitAxes(e, lengths, r);
        // As Unity places them (measured in Unity 6): 'local' by the turn and the node's own
        // scale, signs included, a parent's mirror left out as its scale is; 'shape' by the turn
        // alone, the shape scaled by the lossy scale, signs included.
        for (let axis = 0; axis < 3; axis++) {
            const sign = axis === 0 ? signs.x : axis === 1 ? signs.y : signs.z;
            const target = mode === 'local' ? (axis === 0 ? own.x : axis === 1 ? own.y : own.z) * determinant : 1;
            if (mode === 'shape') {
                this._shapeScale.setComponent(axis, sign * lengths[axis]);
            }
            const o = axis * 4;
            e[o] *= target;
            e[o + 1] *= target;
            e[o + 2] *= target;
        }
        return this._matrixWorld;
    }

    /**
     * Whether the scale the system's {@link ScalingMode} applies mirrors it (an odd number of its
     * axes negative), as Unity mirrors the meshes it draws: the world scale in `'hierarchy'` (a
     * world matrix whose determinant is below 0, however the node and its parents share the
     * negative axes), the node's own `scaling` (times `scalingDeterminant`) in `'local'`, and never
     * in `'shape'`, which draws particles unscaled (measured in Unity 6). Read it after
     * {@link matrixWorld}, which refreshes it.
     */
    get mirrored(): boolean {
        return this._mirrored;
    }

    /**
     * What the system's emission shape is scaled by before {@link matrixWorld} places it: the
     * node's world scale in `'shape'` mode, Unity's `lossyScale`, negative along a mirrored axis,
     * which leaves the particles and their motion unscaled, and 1 otherwise. Read it after
     * `matrixWorld`, which refreshes it.
     */
    get shapeScale(): Vector3 {
        return this._shapeScale;
    }

    /**
     * The scale {@link matrixWorld} applies along each axis of the node's turn, all positive: the
     * lengths of its axes, or, for a world matrix skewed in `'hierarchy'` mode, the world scale
     * along the axes of the node's rotation after each of its parents' (Unity's
     * `transform.lossyScale`). Unity stretches a World or View aligned mesh particle by it, along
     * the world's or the camera's axes. Recomputed on each read.
     */
    get alignedScale(): Vector3 {
        const e = this.matrixWorld.elements;
        const out = this._alignedScale;
        if (this._matrixWorldMode === 'hierarchy' && isSkewed(e)) {
            worldTurnOf(this, worldTurn).toRotationMatrix(turnMatrix);
            const r = turnMatrix.m;
            for (let axis = 0; axis < 3; axis++) {
                const o = axis * 4;
                out.setComponent(axis, Math.abs(r[o] * e[o] + r[o + 1] * e[o + 1] + r[o + 2] * e[o + 2]));
            }
            return out;
        }
        for (let axis = 0; axis < 3; axis++) {
            const o = axis * 4;
            out.setComponent(axis, Math.sqrt(e[o] * e[o] + e[o + 1] * e[o + 1] + e[o + 2] * e[o + 2]));
        }
        return out;
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
     * disposes its own emitter (`ParticleSystem.dispose()`, a `destroy` stop action), the systems of child
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
    toJSON(meta?: BabylonMetaData): ParticleEmitterJSON {
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
            ps: this.system.toJSON(meta),
        };
    }
}
