import type {EulerOrder} from '../math';
import type {BezierJSON} from './Bezier';

// The JSON of every value, colour, rotation and vector generator, as `toJSON` writes it and
// `fromJSON` reads it. `type` names the generator, so a switch on it narrows the union to one
// generator's fields. A file can still hold a type no reader knows; the readers warn and fall back.

/** A colour in JSON: red, green, blue and alpha, each from 0 to 1. */
export interface ColorJSON {
    /** Red. */
    r: number;
    /** Green. */
    g: number;
    /** Blue. */
    b: number;
    /** Alpha. */
    a: number;
}

/** A two-component vector in JSON. */
export interface Vector2JSON {
    /** X. */
    x: number;
    /** Y. */
    y: number;
}

/** A vector in JSON. */
export interface Vector3JSON {
    /** X. */
    x: number;
    /** Y. */
    y: number;
    /** Z. */
    z: number;
}

/** A vector in JSON as `[x, y, z]`. */
export type Vector3ArrayJSON = [number, number, number];

/** A {@link ConstantValue}. */
export interface ConstantValueJSON {
    /** The generator's type. */
    type: 'ConstantValue';
    /** The value. */
    value: number;
}

/** An {@link IntervalValue}. */
export interface IntervalValueJSON {
    /** The generator's type. */
    type: 'IntervalValue';
    /** The lower end. */
    a: number;
    /** The upper end. */
    b: number;
}

/** One segment of a {@link PiecewiseBezier}. */
export interface PiecewiseBezierSegmentJSON {
    /** The segment's curve. */
    function: BezierJSON;
    /** The time the segment starts at, from 0 to 1. */
    start: number;
}

/** A {@link PiecewiseBezier}. */
export interface PiecewiseBezierJSON {
    /** The generator's type. */
    type: 'PiecewiseBezier';
    /** The curve's segments, each with the time it starts at. */
    functions: PiecewiseBezierSegmentJSON[];
}

/** A {@link RandomBetweenCurves}. */
export interface RandomBetweenCurvesJSON {
    /** The generator's type. */
    type: 'RandomBetweenCurves';
    /** One bound. */
    curve1: PiecewiseBezierJSON;
    /** The other bound. */
    curve2: PiecewiseBezierJSON;
}

/** The JSON of a value generator. */
export type ValueGeneratorJSON = ConstantValueJSON | IntervalValueJSON | PiecewiseBezierJSON | RandomBetweenCurvesJSON;

/** A {@link ConstantColor}. */
export interface ConstantColorJSON {
    /** The generator's type. */
    type: 'ConstantColor';
    /** The colour. */
    color: ColorJSON;
}

/** A {@link ColorRange}. */
export interface ColorRangeJSON {
    /** The generator's type. */
    type: 'ColorRange';
    /** The colour at the start. */
    a: ColorJSON;
    /** The colour at the end. */
    b: ColorJSON;
}

/** A {@link RandomColor}. */
export interface RandomColorJSON {
    /** The generator's type. */
    type: 'RandomColor';
    /** One end of the range. */
    a: ColorJSON;
    /** The other end. */
    b: ColorJSON;
}

/** What the values of a {@link ContinuousLinearFunction} are. */
export type ContinuousLinearSubType = 'Number' | 'Vector3' | 'Vector4' | 'Color';

/** A four-component vector in JSON. */
export interface Vector4JSON {
    /** X. */
    x: number;
    /** Y. */
    y: number;
    /** Z. */
    z: number;
    /** W. */
    w: number;
}

/** A colour without alpha in JSON. */
export interface RGBJSON {
    /** Red. */
    r: number;
    /** Green. */
    g: number;
    /** Blue. */
    b: number;
}

/** A {@link ContinuousLinearFunction} key's value: a number, a vector, or a colour `{r, g, b}`. */
export type ContinuousLinearValueJSON = number | Vector3JSON | Vector4JSON | RGBJSON;

/** A key of a {@link ContinuousLinearFunction}: a value and where it sits, from 0 to 1. */
export interface ContinuousLinearKeyJSON {
    /** The value, in the form the function's `subType` names. */
    value: ContinuousLinearValueJSON;
    /** Where the key sits, from 0 to 1. */
    pos: number;
}

/** A {@link ContinuousLinearFunction} whose values are `S`. */
export interface ContinuousLinearFunctionJSON<S extends ContinuousLinearSubType = ContinuousLinearSubType> {
    /** The function's type. */
    type: 'CLinearFunction';
    /** What its values are. */
    subType: S;
    /** Its keys, in order. */
    keys: ContinuousLinearKeyJSON[];
}

/** One colour range of a {@link Gradient} in the older form. */
export interface GradientRangeJSON {
    /** The range's colours. */
    function: ColorRangeJSON;
    /** The time the range starts at, from 0 to 1. */
    start: number;
}

/**
 * A {@link Gradient}: its colour and alpha keys. Files written before the keys were split hold
 * `functions` instead, a list of colour ranges, each with the time it starts at.
 */
export interface GradientJSON {
    /** The generator's type. */
    type: 'Gradient';
    /** The colour keys. */
    color?: ContinuousLinearFunctionJSON<'Vector3' | 'Color'>;
    /** The alpha keys. */
    alpha?: ContinuousLinearFunctionJSON<'Number'>;
    /** The older form: colour ranges, each with the time it starts at. */
    functions?: GradientRangeJSON[];
}

/** A {@link RandomColorBetweenGradient}. */
export interface RandomColorBetweenGradientJSON {
    /** The generator's type. */
    type: 'RandomColorBetweenGradient';
    /** One gradient. */
    gradient1: GradientJSON;
    /** The other. */
    gradient2: GradientJSON;
}

/** The JSON of a colour generator. */
export type ColorGeneratorJSON =
    ConstantColorJSON | ColorRangeJSON | RandomColorJSON | GradientJSON | RandomColorBetweenGradientJSON;

/** An {@link AxisAngleGenerator}. */
export interface AxisAngleJSON {
    /** The generator's type. */
    type: 'AxisAngle';
    /** The axis. */
    axis: Vector3JSON;
    /** The angle around it, in radians. */
    angle: ValueGeneratorJSON;
}

/** An {@link EulerGenerator}. */
export interface EulerJSON {
    /** The generator's type. */
    type: 'Euler';
    /** The angle around X, in radians. */
    angleX: ValueGeneratorJSON;
    /** The angle around Y, in radians. */
    angleY: ValueGeneratorJSON;
    /** The angle around Z, in radians. */
    angleZ: ValueGeneratorJSON;
    /** The order the rotations apply in. */
    eulerOrder?: EulerOrder;
}

/** A {@link RandomQuatGenerator}. */
export interface RandomQuatJSON {
    /** The generator's type. */
    type: 'RandomQuat';
}

/** The JSON of a rotation generator. */
export type RotationGeneratorJSON = AxisAngleJSON | EulerJSON | RandomQuatJSON;

/** A {@link Vector3Function}. */
export interface Vector3FunctionJSON {
    /** The generator's type. */
    type: 'Vector3Function';
    /** The X component. */
    x: ValueGeneratorJSON;
    /** The Y component. */
    y: ValueGeneratorJSON;
    /** The Z component. */
    z: ValueGeneratorJSON;
}

/** The JSON of a vector generator. */
export type Vector3GeneratorJSON = Vector3FunctionJSON;

/**
 * The JSON of a value, colour, rotation or vector generator: `type` names it, the other fields are
 * its own.
 */
export type FunctionJSON = ValueGeneratorJSON | ColorGeneratorJSON | RotationGeneratorJSON | Vector3GeneratorJSON;
