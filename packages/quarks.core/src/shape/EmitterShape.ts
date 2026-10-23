import {JsonMetaData} from '../IParticleSystem';
import {Constructable, ParameterPair} from '../TypeUtil';
import {describePart, warnFormat, withoutDefaults} from '../util/JSONUtil';
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
    /**
     * Reads the shape from its JSON, resolving references (a mesh) through `meta`. It is also
     * called, twice per save, by {@link EmitterToJSON} to find the fields at their defaults, so it
     * must only read: no registration, no resources that need freeing.
     */
    loadJSON(json: ShapeJSON, meta: JsonMetaData): EmitterShape; // Method syntax: a plugin may type its own JSON.
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

/**
 * The JSON an effect file holds for `shape`: its `toJSON`, which writes every field, without the
 * fields equal to the defaults {@link EmitterFromJSON} reads a missing field as. A field is left out
 * only when the smaller JSON reads back, without a warning, to the same shape; a plugin shape that
 * cannot be read from its type alone keeps every field. `meta` is what reading it back resolves
 * references through; with none, a shape that needs one keeps every field.
 */
export function EmitterToJSON(shape: EmitterShape, meta: JsonMetaData = {} as JsonMetaData): ShapeJSON {
    const full = shape.toJSON();
    const plugin = EmitterShapes[full?.type];
    if (!plugin) return full;
    return withoutDefaults(full, (json) => plugin.loadJSON(json, meta).toJSON());
}
