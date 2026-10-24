import * as core from 'quarks.core';
import * as quarks from '../src';

/**
 * babylon.quarks re-exports quarks.core's API without its math: the vector, quaternion and
 * matrix classes are the simulation's own and stay internal, and the public API takes
 * `Vector3Like`, `Color4Like` and the rest, which a Babylon `Vector3` or `Color4` satisfies.
 */
const INTERNAL_MATH = new Set([
    'Euler',
    'Matrix3',
    'Matrix4',
    'Quaternion',
    'QuaternionView',
    'Vector2',
    'Vector3',
    'Vector3View',
    'Vector4',
    'Vector4View',
    'WebGLCoordinateSystem',
    'WebGPUCoordinateSystem',
    'MathUtils',
    'ceilPowerOfTwo',
    'clamp',
    'damp',
    'DEG2RAD',
    'degToRad',
    'denormalize',
    'euclideanModulo',
    'floorPowerOfTwo',
    'generateUUID',
    'inverseLerp',
    'isPowerOfTwo',
    'lerp',
    'mapLinear',
    'normalize',
    'pingpong',
    'RAD2DEG',
    'radToDeg',
    'randFloat',
    'randFloatSpread',
    'randInt',
    'seededRandom',
    'setQuaternionFromProperEuler',
    'smootherstep',
    'smoothstep',
    'vector2From',
    'vector3From',
    'quaternionFrom',
    'vector3FromColor',
    'vector4FromColor',
    // Internal to the renderer: whether a behavior runs a built-in's own code.
    'stockBehaviorType',
    'runsUpdateAll',
]);

describe('quarks.core re-exports', () => {
    it('re-exports every runtime value of quarks.core but its math, and none of the math', () => {
        const exported = new Set(Object.keys(quarks));
        for (const name of Object.keys(core).filter((key) => key !== 'default' && key !== '__esModule')) {
            expect([name, exported.has(name)]).toEqual([name, !INTERNAL_MATH.has(name)]);
        }
    });
});
