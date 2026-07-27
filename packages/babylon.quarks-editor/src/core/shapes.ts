import type {Mesh} from '@babylonjs/core/Meshes/mesh';
import type {EmitterShape} from 'babylon.quarks';
import {
    CircleEmitter,
    ConeEmitter,
    DonutEmitter,
    EmitterMode,
    GridEmitter,
    HemisphereEmitter,
    MeshSurfaceEmitter,
    PointEmitter,
    RectangleEmitter,
    SphereEmitter,
} from 'babylon.quarks';

export type ShapeType =
    | 'point'
    | 'sphere'
    | 'hemisphere'
    | 'cone'
    | 'circle'
    | 'donut'
    | 'rectangle'
    | 'grid'
    | 'mesh_surface';

export const SHAPE_TYPES: Array<{value: ShapeType; label: string}> = [
    {value: 'cone', label: 'Cone'},
    {value: 'sphere', label: 'Sphere'},
    {value: 'hemisphere', label: 'Hemisphere'},
    {value: 'circle', label: 'Circle'},
    {value: 'donut', label: 'Donut'},
    {value: 'rectangle', label: 'Rectangle'},
    {value: 'grid', label: 'Grid'},
    {value: 'mesh_surface', label: 'Mesh surface'},
    {value: 'point', label: 'Point'},
];

export interface ShapeParams {
    radius: number;
    arc: number;
    thickness: number;
    angle: number;
    donutRadius: number;
    width: number;
    height: number;
    mode: EmitterMode;
    spread: number;
    column: number;
    row: number;
    mesh?: Mesh;
}

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
    mesh: undefined,
};

export function getShapeType(shape: EmitterShape): ShapeType {
    const type = (shape as {type?: string}).type ?? 'point';
    return (SHAPE_TYPES.some((s) => s.value === type) ? type : 'point') as ShapeType;
}

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
    mesh_surface: [],
};

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
        case 'mesh_surface':
            return new MeshSurfaceEmitter(params.mesh);
    }
}
