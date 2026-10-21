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

export interface EmitterShapePlugin {
    type: string;
    constructor: Constructable<EmitterShape>;
    params: ParameterPair[];
    loadJSON: (json: any, meta: JsonMetaData) => EmitterShape;
}

export const EmitterShapes: {[key: string]: EmitterShapePlugin} = {
    box: {
        type: 'box',
        params: [
            ['width', ['number']],
            ['height', ['number']],
            ['depth', ['number']],
            ['emitFrom', ['number']],
            ['boxThickness', ['vec3']],
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
        ],
        constructor: EdgeEmitter,
        loadJSON: EdgeEmitter.fromJSON,
    },
    point: {type: 'point', params: [], constructor: PointEmitter, loadJSON: PointEmitter.fromJSON},
    sphere: {
        type: 'sphere',
        params: [
            ['radius', ['number']],
            ['arc', ['radian']],
            ['thickness', ['number']],
            ['angle', ['radian']],
            ['mode', ['emitterMode']],
            ['spread', ['number']],
            ['speed', ['valueFunc', 'value']],
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
            ['angle', ['radian']],
            ['mode', ['emitterMode']],
            ['spread', ['number']],
            ['speed', ['valueFunc', 'value']],
        ],
        constructor: HemisphereEmitter,
        loadJSON: HemisphereEmitter.fromJSON,
    },
    grid: {
        type: 'grid',
        params: [
            ['width', ['number']],
            ['height', ['number']],
            ['rows', ['number']],
            ['column', ['number']],
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
