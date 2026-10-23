import {IParticleSystem} from '../IParticleSystem';
import {Particle} from '../Particle';
import {random} from '../util/random';
import {EmitterShape, ShapeJSON} from './EmitterUtil';
import {ShapeTransform} from './ShapeTransform';

/**
 * Interface representing the parameters for a grid emitter.
 */
export interface GridEmitterParameters {
    /**
     * The width of the grid.
     */
    width?: number;
    /**
     * The height of the grid.
     */
    height?: number;
    /**
     * The number of columns in the grid.
     */
    column?: number;
    /**
     * The number of rows in the grid.
     */
    row?: number;
    /**
     * Offset, rotation and scale of the shape within the particle system.
     * {@link ShapeTransform}
     */
    transform?: ShapeTransform;
}

/**
 * Emits from the points of a grid in the xy plane, heading along +z: each particle starts at a
 * random point of the grid.
 */
export class GridEmitter implements EmitterShape {
    /** Always `'grid'`. */
    type = 'grid';
    /** Width of the grid, along x. */
    width: number;
    /** Height of the grid, along y. */
    height: number; // [0, Math.PI * 2]
    /** Points along x. */
    column: number; // [0, 1]
    /** Points along y. */
    row: number; // [0, Math.PI / 2]
    transform?: ShapeTransform;

    constructor(parameters: GridEmitterParameters = {}) {
        this.width = parameters.width ?? 1;
        this.height = parameters.height ?? 1;
        this.column = parameters.column ?? 10;
        this.row = parameters.row ?? 10;
        this.transform = parameters.transform;
    }

    /** Starts `p` at a random point of the grid, heading along +z at its start speed. */
    initialize(p: Particle) {
        const r = Math.floor(random() * this.row);
        const c = Math.floor(random() * this.column);

        p.position.x = (c * this.width) / this.column - this.width / 2;
        p.position.y = (r * this.height) / this.row - this.height / 2;
        p.position.z = 0;
        p.velocity.set(0, 0, p.startSpeed);
        this.transform?.apply(p);
    }

    /** The shape's JSON. */
    toJSON(): ShapeJSON {
        return {
            type: 'grid',
            width: this.width,
            height: this.height,
            column: this.column,
            row: this.row,
            ...ShapeTransform.toShapeJSON(this.transform),
        };
    }

    /** Reads {@link GridEmitter.toJSON} output; a field the JSON leaves out takes its default. */
    static fromJSON(json: any): GridEmitter {
        return new GridEmitter({...json, transform: ShapeTransform.fromJSON(json.transform)});
    }

    /** A copy with the same settings. */
    clone(): EmitterShape {
        return new GridEmitter({
            width: this.width,
            height: this.height,
            column: this.column,
            row: this.row,
            transform: this.transform?.clone(),
        });
    }

    /** Does nothing: the grid has no state. */
    update(system: IParticleSystem, delta: number): void {}
}
