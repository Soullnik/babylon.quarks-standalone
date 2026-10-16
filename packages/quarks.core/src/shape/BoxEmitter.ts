import {EmissionState, IParticleSystem} from '../IParticleSystem';
import {Particle} from '../Particle';
import {EmitterShape, ShapeJSON} from './EmitterUtil';

/**
 * Which part of the box particles start from.
 */
export enum BoxEmitFrom {
    /** Anywhere inside the box. */
    Volume,
    /** On the six faces. */
    Shell,
    /** On the twelve edges. */
    Edge,
}

/**
 * Interface representing the parameters for a box emitter.
 */
export interface BoxEmitterParameters {
    /** Size of the box along X. */
    width?: number;
    /** Size of the box along Y. */
    height?: number;
    /** Size of the box along Z. */
    depth?: number;
    /** Which part of the box particles start from. {@link BoxEmitFrom} */
    emitFrom?: BoxEmitFrom;
    /**
     * How far Shell and Edge particles may sink into the box on each axis, as a fraction of the
     * box size: 0 keeps them on the surface, 0.5 reaches the center.
     */
    boxThickness?: [number, number, number];
}

/**
 * A particle emitter that emits particles from a box centered on the emitter, all moving along +Z
 * like Unity's Box shape. A box with no depth is a flat rectangle (Unity's Rectangle shape).
 */
export class BoxEmitter implements EmitterShape {
    type = 'box';
    width: number;
    height: number;
    depth: number;
    emitFrom: BoxEmitFrom;
    boxThickness: [number, number, number];

    private readonly _point: [number, number, number] = [0, 0, 0];

    constructor(parameters: BoxEmitterParameters = {}) {
        this.width = parameters.width ?? 1;
        this.height = parameters.height ?? 1;
        this.depth = parameters.depth ?? 1;
        this.emitFrom = parameters.emitFrom ?? BoxEmitFrom.Volume;
        this.boxThickness = parameters.boxThickness ? [...parameters.boxThickness] : [0, 0, 0];
    }

    update(_system: IParticleSystem, _delta: number): void {}

    initialize(p: Particle, _emissionState: EmissionState) {
        const point = this._point;
        for (let axis = 0; axis < 3; axis++) {
            point[axis] = Math.random() * 2 - 1;
        }
        // Unity picks the face (or the edge direction) evenly per axis rather than by area.
        const axis = Math.floor(Math.random() * 3) % 3;
        if (this.emitFrom === BoxEmitFrom.Shell) {
            point[axis] = this.onSurface(axis);
        } else if (this.emitFrom === BoxEmitFrom.Edge) {
            point[(axis + 1) % 3] = this.onSurface((axis + 1) % 3);
            point[(axis + 2) % 3] = this.onSurface((axis + 2) % 3);
        }

        p.position.set((point[0] * this.width) / 2, (point[1] * this.height) / 2, (point[2] * this.depth) / 2);
        p.velocity.set(0, 0, p.startSpeed);
    }

    /**
     * A coordinate on one of the two faces across `axis`, in -1..1. As measured in Unity, a
     * thickness leaves half the particles on the face and sinks the rest evenly up to
     * 2 × thickness of the half-size into the box.
     */
    private onSurface(axis: number): number {
        const side = Math.random() < 0.5 ? -1 : 1;
        const thickness = this.boxThickness[axis];
        if (thickness <= 0 || Math.random() < 0.5) {
            return side;
        }
        return side * (1 - 2 * thickness * Math.random());
    }

    toJSON(): ShapeJSON {
        return {
            type: 'box',
            width: this.width,
            height: this.height,
            depth: this.depth,
            emitFrom: this.emitFrom,
            boxThickness: [...this.boxThickness],
        };
    }

    static fromJSON(json: any): BoxEmitter {
        return new BoxEmitter({
            width: json.width,
            height: json.height,
            depth: json.depth,
            emitFrom: json.emitFrom,
            boxThickness: Array.isArray(json.boxThickness) ? json.boxThickness : undefined,
        });
    }

    clone(): EmitterShape {
        return new BoxEmitter({
            width: this.width,
            height: this.height,
            depth: this.depth,
            emitFrom: this.emitFrom,
            boxThickness: this.boxThickness,
        });
    }
}
