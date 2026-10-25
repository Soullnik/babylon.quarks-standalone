import type {Vector3Like} from 'quarks.core';
import {RendererEmitterSettings, StretchedBillBoardSettings, Vector3} from 'quarks.core';
import type {VFXBatchSettings} from '../BatchedRenderer';
import {RenderMode} from '../VFXBatch';

/** Steps between full measurements of a system's bounds; in between they are carried and padded. */
const BOUNDS_REFRESH_STEPS = 4;

/** Anything with a world matrix, such as the system's emitter node; read only when the bounds are local. */
export interface BoundsSpace {
    /** Its world matrix, column-major. */
    readonly matrixWorld: {readonly elements: ArrayLike<number>};
}

function setXYZ(out: Vector3Like, x: number, y: number, z: number): void {
    out.x = x;
    out.y = y;
    out.z = z;
}

/** The largest axis of the scale in a column-major 4x4 matrix. */
export function maxAxisScale(e: ArrayLike<number>): number {
    return Math.sqrt(
        Math.max(
            e[0] * e[0] + e[1] * e[1] + e[2] * e[2],
            e[4] * e[4] + e[5] * e[5] + e[6] * e[6],
            e[8] * e[8] + e[9] * e[9] + e[10] * e[10]
        )
    );
}

/**
 * The bounds a {@link ParticleSystem} keeps of what it draws, for culling: an axis-aligned box of
 * its live particles in simulation space, and how far a particle's quad, mesh or stretch reaches
 * past its position. The simulation step measures the box in full every few steps and carries it,
 * padded for the motion since, in between.
 */
export class BoundsTracker {
    /** Axis-aligned bounds of the live particles, in simulation space. */
    readonly min = new Vector3();
    readonly max = new Vector3();
    /** How far a particle's quad, mesh or stretch can reach past its position, in simulation units. */
    padding = 0;
    valid = false;
    /** Steps since the last full measurement; between them the bounds are carried and padded. */
    private stepsSince = 0;
    /** Largest particle size seen since the last full measurement. */
    maxSize = 0;
    /** Largest squared particle speed seen since the last full measurement. */
    maxSpeedSq = 0;
    /** True when the bounds are already in world space (a world-space system, or bounds the renderer measured). */
    inWorld = false;
    private geometryRadiusFor?: Float32Array;
    private geometryRadius = 1;

    /** Whether this step should measure every particle instead of carrying the last bounds. */
    get due(): boolean {
        return this.stepsSince >= BOUNDS_REFRESH_STEPS || !this.valid;
    }

    /**
     * Records the box the sprite step measured (or carried) over the live particles, and pads it
     * for how the system draws. Trails are measured by their renderer instead, since their ribbons
     * live outside the store; see {@link setWorld}.
     * @param step - The simulation step in seconds, which the renderer moves particles along their velocity by.
     */
    store(
        count: number,
        measured: boolean,
        minX: number,
        minY: number,
        minZ: number,
        maxX: number,
        maxY: number,
        maxZ: number,
        maxSize: number,
        maxSpeedSq: number,
        settings: VFXBatchSettings,
        emitterSettings: RendererEmitterSettings,
        worldSpace: boolean,
        step: number
    ): void {
        if (count === 0) {
            this.valid = false;
            return;
        }
        this.stepsSince = measured ? 0 : this.stepsSince + 1;
        this.maxSize = maxSize;
        this.maxSpeedSq = maxSpeedSq;
        const maxSpeed = Math.sqrt(maxSpeedSq);
        const renderMode = settings.renderMode;
        // How far past its position a particle can be drawn: half a quad's
        // diagonal plus its pivot, a mesh's radius, or a stretched quad's tail.
        // Plus the motion since the last measurement, and the step the renderer
        // moves particles on along their velocity.
        let padding = maxSpeed * step * (this.stepsSince + 1);
        if (renderMode === RenderMode.Mesh) {
            padding += maxSize * this.meshGeometryRadius(settings.instancingGeometry);
        } else if (renderMode === RenderMode.StretchedBillBoard) {
            const stretch = emitterSettings as StretchedBillBoardSettings;
            padding += maxSize * (1 + (stretch.lengthFactor ?? 0) + maxSpeed * (stretch.speedFactor ?? 0));
        } else {
            const pivot = settings.pivot;
            const pivotReach = pivot === undefined ? 0 : Math.abs(pivot.x) + Math.abs(pivot.y) + Math.abs(pivot.z);
            padding += maxSize * (0.75 + pivotReach);
        }
        this.min.set(minX, minY, minZ);
        this.max.set(maxX, maxY, maxZ);
        this.padding = padding;
        this.inWorld = worldSpace;
        this.valid = true;
    }

    /** Records bounds already in world space, which a renderer measured. */
    setWorld(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, padding: number) {
        this.min.set(minX, minY, minZ);
        this.max.set(maxX, maxY, maxZ);
        this.padding = padding;
        this.inWorld = true;
        this.valid = true;
    }

    /** The padding in world units, for bounds kept in `space`. */
    worldPadding(space: BoundsSpace): number {
        return this.inWorld ? this.padding : this.padding * maxAxisScale(space.matrixWorld.elements);
    }

    /**
     * The padded bounds in world space into `min` and `max`, for bounds kept in `space`; false
     * while there are none.
     */
    toWorld(min: Vector3Like, max: Vector3Like, space: BoundsSpace): boolean {
        if (!this.valid) {
            return false;
        }
        const bmin = this.min;
        const bmax = this.max;
        if (this.inWorld) {
            const pad = this.padding;
            setXYZ(min, bmin.x - pad, bmin.y - pad, bmin.z - pad);
            setXYZ(max, bmax.x + pad, bmax.y + pad, bmax.z + pad);
            return true;
        }
        // Local bounds: the box of the eight transformed corners, padded by the
        // reach scaled by the emitter's largest axis.
        const e = space.matrixWorld.elements;
        const pad = this.padding * maxAxisScale(e);
        let minX = Infinity;
        let minY = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let maxZ = -Infinity;
        for (let corner = 0; corner < 8; corner++) {
            const x = corner & 1 ? bmax.x : bmin.x;
            const y = corner & 2 ? bmax.y : bmin.y;
            const z = corner & 4 ? bmax.z : bmin.z;
            const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
            const wx = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
            const wy = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
            const wz = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
            if (wx < minX) minX = wx;
            if (wx > maxX) maxX = wx;
            if (wy < minY) minY = wy;
            if (wy > maxY) maxY = wy;
            if (wz < minZ) minZ = wz;
            if (wz > maxZ) maxZ = wz;
        }
        setXYZ(min, minX - pad, minY - pad, minZ - pad);
        setXYZ(max, maxX + pad, maxY + pad, maxZ + pad);
        return true;
    }

    /** Distance of the farthest vertex of the mesh particles' geometry from its origin. */
    private meshGeometryRadius(geometry: Float32Array): number {
        if (geometry !== this.geometryRadiusFor) {
            let radiusSq = 0;
            for (let o = 0; o + 2 < geometry.length; o += 3) {
                const d =
                    geometry[o] * geometry[o] + geometry[o + 1] * geometry[o + 1] + geometry[o + 2] * geometry[o + 2];
                if (d > radiusSq) radiusSq = d;
            }
            this.geometryRadius = Math.sqrt(radiusSq);
            this.geometryRadiusFor = geometry;
        }
        return this.geometryRadius;
    }
}
