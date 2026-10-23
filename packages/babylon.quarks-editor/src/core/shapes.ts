import type {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import type {EmitterShape} from 'babylon.quarks';
import {
    BoxEmitFrom,
    BoxEmitter,
    CircleEmitter,
    ConeEmitter,
    ConstantValue,
    DonutEmitter,
    EdgeEmitter,
    EmitterMode,
    GridEmitter,
    HemisphereEmitter,
    MeshSurfaceEmitter,
    PointEmitter,
    RectangleEmitter,
    SphereEmitter,
} from 'babylon.quarks';

/** The emitter shapes the Shape module offers, by the `type` they serialise with. */
export type ShapeType =
    | 'point'
    | 'sphere'
    | 'hemisphere'
    | 'cone'
    | 'circle'
    | 'donut'
    | 'rectangle'
    | 'grid'
    | 'box'
    | 'edge'
    | 'mesh_surface';

/** The Shape module's shape list, in menu order, with the label each shows. */
export const SHAPE_TYPES: Array<{
    /** The shape's type. */
    value: ShapeType;
    /** Its label in the menu. */
    label: string;
}> = [
    {value: 'cone', label: 'Cone'},
    {value: 'sphere', label: 'Sphere'},
    {value: 'hemisphere', label: 'Hemisphere'},
    {value: 'circle', label: 'Circle'},
    {value: 'donut', label: 'Donut'},
    {value: 'rectangle', label: 'Rectangle'},
    {value: 'grid', label: 'Grid'},
    {value: 'box', label: 'Box'},
    {value: 'edge', label: 'Edge'},
    {value: 'mesh_surface', label: 'Mesh surface'},
    {value: 'point', label: 'Point'},
];

/**
 * Every shape's settings in one flat record, so switching shapes keeps what the shapes share
 * (a cone's radius becomes the sphere's). Each shape reads the fields it has.
 */
export interface ShapeParams {
    /** Radius of a sphere, hemisphere, cone, circle or donut. */
    radius: number;
    /** The part of the circle emitted from, in radians (2π: all of it). */
    arc: number;
    /** 0 emits from the surface only, 1 from the whole volume. */
    thickness: number;
    /** A cone's half angle, in radians. */
    angle: number;
    /** The radius of a donut's tube. */
    donutRadius: number;
    /** Width of a rectangle, grid or box (X). */
    width: number;
    /** Height of a rectangle, grid or box (Y). */
    height: number;
    /** How points around the arc are picked: at random, in a loop, back and forth or in bursts. */
    mode: EmitterMode;
    /** Snaps the arc position to steps of this fraction; 0 for none. */
    spread: number;
    /** A grid's column count. */
    column: number;
    /** A grid's row count. */
    row: number;
    /** Box depth (Z). */
    depth: number;
    /** Where a box emits from: its volume, its faces or its edges. */
    emitFrom: BoxEmitFrom;
    /** How fast an edge emitter's loop / ping-pong point travels, in lengths per second. */
    speed: number;
    /** The mesh a mesh surface emitter emits from. */
    mesh?: Mesh;
}

/** The settings a new shape starts from. */
export const DEFAULT_SHAPE_PARAMS: ShapeParams = {
    radius: 0.3,
    arc: Math.PI * 2,
    thickness: 1,
    angle: 0.5,
    donutRadius: 0.1,
    width: 1,
    height: 1,
    mode: EmitterMode.Random,
    spread: 0,
    column: 10,
    row: 10,
    depth: 1,
    emitFrom: BoxEmitFrom.Volume,
    speed: 1,
    mesh: undefined,
};

/** The type of a shape, as the Shape module lists it. */
export function getShapeType(shape: EmitterShape): ShapeType {
    const type = (shape as {type?: string}).type ?? 'point';
    return (SHAPE_TYPES.some((s) => s.value === type) ? type : 'point') as ShapeType;
}

/** A shape's settings, the fields it does not have taken from {@link DEFAULT_SHAPE_PARAMS}. */
export function readShapeParams(shape: EmitterShape): ShapeParams {
    const anyShape = shape as unknown as {[key: string]: unknown};
    const num = (key: string, fallback: number) =>
        typeof anyShape[key] === 'number' ? (anyShape[key] as number) : fallback;
    return {
        radius: num('radius', DEFAULT_SHAPE_PARAMS.radius),
        mode: num('mode', DEFAULT_SHAPE_PARAMS.mode) as EmitterMode,
        spread: num('spread', DEFAULT_SHAPE_PARAMS.spread),
        arc: num('arc', DEFAULT_SHAPE_PARAMS.arc),
        thickness: num('thickness', DEFAULT_SHAPE_PARAMS.thickness),
        angle: num('angle', DEFAULT_SHAPE_PARAMS.angle),
        donutRadius: num('donutRadius', DEFAULT_SHAPE_PARAMS.donutRadius),
        width: num('width', DEFAULT_SHAPE_PARAMS.width),
        height: num('height', DEFAULT_SHAPE_PARAMS.height),
        column: num('column', DEFAULT_SHAPE_PARAMS.column),
        row: num('row', DEFAULT_SHAPE_PARAMS.row),
        depth: num('depth', DEFAULT_SHAPE_PARAMS.depth),
        emitFrom: num('emitFrom', DEFAULT_SHAPE_PARAMS.emitFrom) as BoxEmitFrom,
        speed: anyShape.speed instanceof ConstantValue ? anyShape.speed.value : DEFAULT_SHAPE_PARAMS.speed,
        mesh: anyShape.mesh as Mesh | undefined,
    };
}

/** Which parameters are relevant per shape type (drives the UI). `mesh_surface`'s mesh
 * reference isn't a NumberField, so it's handled separately by the Shape module. */
export const SHAPE_PARAM_KEYS: {[K in ShapeType]: Array<keyof ShapeParams>} = {
    point: [],
    sphere: ['radius', 'arc', 'thickness'],
    hemisphere: ['radius', 'arc', 'thickness'],
    cone: ['radius', 'arc', 'thickness', 'angle'],
    circle: ['radius', 'arc', 'thickness'],
    donut: ['radius', 'arc', 'thickness', 'donutRadius'],
    rectangle: ['width', 'height'],
    grid: ['width', 'height', 'column', 'row'],
    box: ['width', 'height', 'depth'],
    edge: ['radius', 'speed'],
    mesh_surface: [],
};

/** A new shape of `type`, built from the fields of `params` it has. */
export function createShape(type: ShapeType, params: ShapeParams): EmitterShape {
    switch (type) {
        case 'point':
            return new PointEmitter();
        case 'sphere':
            return new SphereEmitter({
                radius: params.radius,
                arc: params.arc,
                thickness: params.thickness,
                mode: params.mode,
                spread: params.spread,
            });
        case 'hemisphere':
            return new HemisphereEmitter({
                radius: params.radius,
                arc: params.arc,
                thickness: params.thickness,
                mode: params.mode,
                spread: params.spread,
            });
        case 'cone':
            return new ConeEmitter({
                radius: params.radius,
                arc: params.arc,
                thickness: params.thickness,
                angle: params.angle,
                mode: params.mode,
                spread: params.spread,
            });
        case 'circle':
            return new CircleEmitter({
                radius: params.radius,
                arc: params.arc,
                thickness: params.thickness,
                mode: params.mode,
                spread: params.spread,
            });
        case 'donut':
            return new DonutEmitter({
                radius: params.radius,
                arc: params.arc,
                thickness: params.thickness,
                donutRadius: params.donutRadius,
                mode: params.mode,
                spread: params.spread,
            });
        case 'rectangle':
            return new RectangleEmitter({
                width: params.width,
                height: params.height,
                mode: params.mode,
                spread: params.spread,
            });
        case 'grid':
            return new GridEmitter({
                width: params.width,
                height: params.height,
                column: params.column,
                row: params.row,
            });
        case 'box':
            return new BoxEmitter({
                width: params.width,
                height: params.height,
                depth: params.depth,
                emitFrom: params.emitFrom,
            });
        case 'edge':
            return new EdgeEmitter({
                radius: params.radius,
                mode: params.mode,
                spread: params.spread,
                speed: new ConstantValue(params.speed),
            });
        case 'mesh_surface':
            return new MeshSurfaceEmitter(params.mesh);
    }
}
