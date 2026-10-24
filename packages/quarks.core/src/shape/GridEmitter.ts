import {IParticleSystem} from '../IParticleSystem';
import {Particle} from '../Particle';
import {random} from '../util/random';
import {EmitterShape, ShapeJSON} from './EmitterUtil';
import {ShapeTransform} from './ShapeTransform';

/**
 * How a grid emitter picks the cell each particle starts in.
 */
export enum GridSampling {
    /** A random cell for every particle. */
    Random,
    /**
     * The cells in turn, row by row from the one at -x, -y, starting over after the last, as
     * Niagara's Grid Location fills its cells by particle index: a burst of `row × column`
     * particles puts one in every cell. The turn carries on across bursts, loop cycles and prewarm;
     * only a restart (the shape's `reset()`) starts it over. Meant for grids of up to 2^53 cells.
     */
    Sequential,
}

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
    /** How each particle's cell is picked; {@link GridSampling.Random}, the default, at random. */
    sampling?: GridSampling;
    /**
     * Offset, rotation and scale of the shape within the particle system.
     * {@link ShapeTransform}
     */
    transform?: ShapeTransform;
}

/**
 * Emits from the cells of a grid in the xy plane, centred on the origin and heading along +z: each
 * particle starts at the centre of a cell, picked at random or in turn (see {@link GridSampling}),
 * so a 2 × 2 grid of width 2 emits from x = ±0.5.
 */
export class GridEmitter implements EmitterShape {
    /** Always `'grid'`. */
    type = 'grid';
    /** Width of the grid, along x. */
    width: number;
    /** Height of the grid, along y. */
    height: number;
    /** Cells along x; read as a whole number of at least 1, and as 1 when not finite. */
    column: number;
    /** Cells along y; read as a whole number of at least 1, and as 1 when not finite. */
    row: number;
    /** How each particle's cell is picked, see {@link GridSampling}. */
    sampling: GridSampling;
    transform?: ShapeTransform;

    /** The cell the next {@link GridSampling.Sequential} particle starts in. */
    private nextCell = 0;

    constructor(parameters: GridEmitterParameters = {}) {
        this.width = parameters.width ?? 1;
        this.height = parameters.height ?? 1;
        this.column = parameters.column ?? 10;
        this.row = parameters.row ?? 10;
        this.sampling = parameters.sampling ?? GridSampling.Random;
        this.transform = parameters.transform;
    }

    /**
     * Starts `p` at the centre of a cell of the grid, picked by {@link GridEmitter.sampling},
     * heading along +z at its start speed.
     */
    initialize(p: Particle) {
        const rows = Number.isFinite(this.row) ? Math.max(1, Math.floor(this.row)) : 1;
        const columns = Number.isFinite(this.column) ? Math.max(1, Math.floor(this.column)) : 1;
        let r: number;
        let c: number;
        if (this.sampling === GridSampling.Sequential) {
            const cell = this.nextCell % (rows * columns);
            this.nextCell = cell + 1;
            r = Math.floor(cell / columns);
            c = cell % columns;
        } else {
            r = Math.floor(random() * rows);
            c = Math.floor(random() * columns);
        }

        p.position.x = ((c + 0.5) / columns - 0.5) * this.width;
        p.position.y = ((r + 0.5) / rows - 0.5) * this.height;
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
            sampling: this.sampling,
            ...ShapeTransform.toShapeJSON(this.transform),
        };
    }

    /** Reads {@link GridEmitter.toJSON} output; a field the JSON leaves out takes its default. */
    static fromJSON(json: ShapeJSON): GridEmitter {
        return new GridEmitter({
            width: json.width,
            height: json.height,
            column: json.column,
            row: json.row,
            sampling: json.sampling,
            transform: ShapeTransform.fromJSON(json.transform),
        });
    }

    /** A copy with the same settings. */
    clone(): EmitterShape {
        return new GridEmitter({
            width: this.width,
            height: this.height,
            column: this.column,
            row: this.row,
            sampling: this.sampling,
            transform: this.transform?.clone(),
        });
    }

    /** Does nothing: the grid only moves on as it emits. */
    update(system: IParticleSystem, delta: number): void {}

    /** Starts {@link GridSampling.Sequential} over at the first cell, so a restart replays the same cells. */
    reset(): void {
        this.nextCell = 0;
    }
}
