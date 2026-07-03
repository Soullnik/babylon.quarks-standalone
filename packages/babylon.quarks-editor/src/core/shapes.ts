import {
    CircleEmitter,
    ConeEmitter,
    DonutEmitter,
    HemisphereEmitter,
    PointEmitter,
    RectangleEmitter,
    SphereEmitter,
} from 'babylon.quarks';
import type {EmitterShape} from 'babylon.quarks';

export type ShapeType = 'point' | 'sphere' | 'hemisphere' | 'cone' | 'circle' | 'donut' | 'rectangle';

export const SHAPE_TYPES: Array<{value: ShapeType; label: string}> = [
    {value: 'cone', label: 'Cone'},
    {value: 'sphere', label: 'Sphere'},
    {value: 'hemisphere', label: 'Hemisphere'},
    {value: 'circle', label: 'Circle'},
    {value: 'donut', label: 'Donut'},
    {value: 'rectangle', label: 'Rectangle'},
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
}

export const DEFAULT_SHAPE_PARAMS: ShapeParams = {
    radius: 0.3,
    arc: Math.PI * 2,
    thickness: 1,
    angle: 0.5,
    donutRadius: 0.1,
    width: 1,
    height: 1,
};

export function getShapeType(shape: EmitterShape): ShapeType {
    const type = (shape as {type?: string}).type ?? 'point';
    return (SHAPE_TYPES.some((s) => s.value === type) ? type : 'point') as ShapeType;
}

export function readShapeParams(shape: EmitterShape): ShapeParams {
    const anyShape = shape as unknown as {[key: string]: unknown};
    const num = (key: string, fallback: number) => (typeof anyShape[key] === 'number' ? (anyShape[key] as number) : fallback);
    return {
        radius: num('radius', DEFAULT_SHAPE_PARAMS.radius),
        arc: num('arc', DEFAULT_SHAPE_PARAMS.arc),
        thickness: num('thickness', DEFAULT_SHAPE_PARAMS.thickness),
        angle: num('angle', DEFAULT_SHAPE_PARAMS.angle),
        donutRadius: num('donutRadius', DEFAULT_SHAPE_PARAMS.donutRadius),
        width: num('width', DEFAULT_SHAPE_PARAMS.width),
        height: num('height', DEFAULT_SHAPE_PARAMS.height),
    };
}

/** Which parameters are relevant per shape type (drives the UI). */
export const SHAPE_PARAM_KEYS: {[K in ShapeType]: Array<keyof ShapeParams>} = {
    point: [],
    sphere: ['radius', 'arc', 'thickness'],
    hemisphere: ['radius', 'arc', 'thickness'],
    cone: ['radius', 'arc', 'thickness', 'angle'],
    circle: ['radius', 'arc', 'thickness'],
    donut: ['radius', 'arc', 'thickness', 'donutRadius'],
    rectangle: ['width', 'height'],
};

export function createShape(type: ShapeType, params: ShapeParams): EmitterShape {
    switch (type) {
        case 'point':
            return new PointEmitter();
        case 'sphere':
            return new SphereEmitter({radius: params.radius, arc: params.arc, thickness: params.thickness});
        case 'hemisphere':
            return new HemisphereEmitter({radius: params.radius, arc: params.arc, thickness: params.thickness});
        case 'cone':
            return new ConeEmitter({
                radius: params.radius,
                arc: params.arc,
                thickness: params.thickness,
                angle: params.angle,
            });
        case 'circle':
            return new CircleEmitter({radius: params.radius, arc: params.arc, thickness: params.thickness});
        case 'donut':
            return new DonutEmitter({
                radius: params.radius,
                arc: params.arc,
                thickness: params.thickness,
                donutRadius: params.donutRadius,
            });
        case 'rectangle':
            return new RectangleEmitter({width: params.width, height: params.height});
    }
}
