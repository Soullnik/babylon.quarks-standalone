import {JsonMetaData} from '../IParticleSystem';
import {Constructable, ParameterPair} from '../TypeUtil';
import {describePart, warnFormat} from '../util/JSONUtil';
import {BoxEmitter} from './BoxEmitter';
import {CircleEmitter} from './CircleEmitter';
import {ConeEmitter} from './ConeEmitter';
import {DonutEmitter} from './DonutEmitter';
import {EdgeEmitter} from './EdgeEmitter';
import {GridEmitter} from './GridEmitter';
import {HemisphereEmitter} from './HemisphereEmitter';
import {PointEmitter} from './PointEmitter';
import {SphereEmitter} from './SphereEmitter';
//import { MeshSurfaceEmitter } from "./MeshSurfaceEmitter";
import {EmitterShape, ShapeJSON} from './EmitterUtil';
import {RectangleEmitter} from './RectangleEmitter';

/**
 * How an emitter shape is registered in {@link EmitterShapes}: its name, class, editor fields and
 * JSON reader.
 */
export interface EmitterShapePlugin {
    /** The name the shape's JSON uses as `type`. */
    type: string;
    /** The shape's class. */
    constructor: Constructable<EmitterShape>;
    /**
     * The fields an editor shows, with the kinds of value each takes: each name is a field of the
     * shape and a key of its JSON.
     */
    params: ParameterPair[];
    /** Reads the shape from its JSON, resolving references (a mesh) through `meta`. */
    loadJSON: (json: ShapeJSON, meta: JsonMetaData) => EmitterShape;
}

/** The emitter shapes effect files can name, by type; plugins add more. */
export const EmitterShapes: {[key: string]: EmitterShapePlugin} = {
    box: {
        type: 'box',
        params: [
            ['width', ['number']],
            ['height', ['number']],
            ['depth', ['number']],
            ['emitFrom', ['boxEmitFrom']],
            ['boxThickness', ['vec3']],
            ['transform', ['shapeTransform']],
        ],
        constructor: BoxEmitter,
        loadJSON: BoxEmitter.fromJSON,
    },
    circle: {
        type: 'circle',
        params: [
            ['radius', ['number']],
            ['arc', ['radian']],
            ['thickness', ['number']],
            ['mode', ['emitterMode']],
            ['spread', ['number']],
            ['speed', ['valueFunc', 'value']],
            ['transform', ['shapeTransform']],
        ],
        constructor: CircleEmitter,
        loadJSON: CircleEmitter.fromJSON,
    },
    cone: {
        type: 'cone',
        params: [
            ['radius', ['number']],
            ['arc', ['radian']],
            ['thickness', ['number']],
            ['angle', ['radian']],
            ['mode', ['emitterMode']],
            ['spread', ['number']],
            ['speed', ['valueFunc', 'value']],
            ['transform', ['shapeTransform']],
        ],
        constructor: ConeEmitter,
        loadJSON: ConeEmitter.fromJSON,
    },
    donut: {
        type: 'donut',
        params: [
            ['radius', ['number']],
            ['arc', ['radian']],
            ['thickness', ['number']],
            ['donutRadius', ['number']],
            ['mode', ['emitterMode']],
            ['spread', ['number']],
            ['speed', ['valueFunc', 'value']],
            ['transform', ['shapeTransform']],
        ],
        constructor: DonutEmitter,
        loadJSON: DonutEmitter.fromJSON,
    },
    edge: {
        type: 'edge',
        params: [
            ['radius', ['number']],
            ['mode', ['emitterMode']],
            ['spread', ['number']],
            ['speed', ['valueFunc', 'value']],
            ['transform', ['shapeTransform']],
        ],
        constructor: EdgeEmitter,
        loadJSON: EdgeEmitter.fromJSON,
    },
    point: {
        type: 'point',
        params: [['transform', ['shapeTransform']]],
        constructor: PointEmitter,
        loadJSON: PointEmitter.fromJSON,
    },
    sphere: {
        type: 'sphere',
        params: [
            ['radius', ['number']],
            ['arc', ['radian']],
            ['thickness', ['number']],
            ['mode', ['emitterMode']],
            ['spread', ['number']],
            ['speed', ['valueFunc', 'value']],
            ['transform', ['shapeTransform']],
        ],
        constructor: SphereEmitter,
        loadJSON: SphereEmitter.fromJSON,
    },
    hemisphere: {
        type: 'hemisphere',
        params: [
            ['radius', ['number']],
            ['arc', ['radian']],
            ['thickness', ['number']],
            ['mode', ['emitterMode']],
            ['spread', ['number']],
            ['speed', ['valueFunc', 'value']],
            ['transform', ['shapeTransform']],
        ],
        constructor: HemisphereEmitter,
        loadJSON: HemisphereEmitter.fromJSON,
    },
    grid: {
        type: 'grid',
        params: [
            ['width', ['number']],
            ['height', ['number']],
            ['column', ['number']],
            ['row', ['number']],
            ['transform', ['shapeTransform']],
        ],
        constructor: GridEmitter,
        loadJSON: GridEmitter.fromJSON,
    },
    rectangle: {
        type: 'rectangle',
        params: [
            ['width', ['number']],
            ['height', ['number']],
            ['thickness', ['number']],
            ['mode', ['emitterMode']],
            ['spread', ['number']],
            ['speed', ['valueFunc', 'value']],
            ['transform', ['shapeTransform']],
        ],
        constructor: RectangleEmitter,
        loadJSON: RectangleEmitter.fromJSON,
    },
};

/**
 * Reads an emitter shape. A type no plugin registered (a custom shape whose plugin is not
 * loaded, or a typo) warns and gives a point emitter, so the rest of the effect still loads.
 */
export function EmitterFromJSON(json: ShapeJSON, meta: JsonMetaData): EmitterShape {
    const shape = json ? EmitterShapes[json.type] : undefined;
    if (!shape) {
        warnFormat(`${describePart('emitter shape', json)}; using a point emitter.`);
        return new PointEmitter();
    }
    return shape.loadJSON(json, meta);
}
