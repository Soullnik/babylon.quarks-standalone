import {random} from '../util/random';
import {EulerOrder} from './Euler';
import {Quaternion} from './Quaternion';

const _lut = [
    '00',
    '01',
    '02',
    '03',
    '04',
    '05',
    '06',
    '07',
    '08',
    '09',
    '0a',
    '0b',
    '0c',
    '0d',
    '0e',
    '0f',
    '10',
    '11',
    '12',
    '13',
    '14',
    '15',
    '16',
    '17',
    '18',
    '19',
    '1a',
    '1b',
    '1c',
    '1d',
    '1e',
    '1f',
    '20',
    '21',
    '22',
    '23',
    '24',
    '25',
    '26',
    '27',
    '28',
    '29',
    '2a',
    '2b',
    '2c',
    '2d',
    '2e',
    '2f',
    '30',
    '31',
    '32',
    '33',
    '34',
    '35',
    '36',
    '37',
    '38',
    '39',
    '3a',
    '3b',
    '3c',
    '3d',
    '3e',
    '3f',
    '40',
    '41',
    '42',
    '43',
    '44',
    '45',
    '46',
    '47',
    '48',
    '49',
    '4a',
    '4b',
    '4c',
    '4d',
    '4e',
    '4f',
    '50',
    '51',
    '52',
    '53',
    '54',
    '55',
    '56',
    '57',
    '58',
    '59',
    '5a',
    '5b',
    '5c',
    '5d',
    '5e',
    '5f',
    '60',
    '61',
    '62',
    '63',
    '64',
    '65',
    '66',
    '67',
    '68',
    '69',
    '6a',
    '6b',
    '6c',
    '6d',
    '6e',
    '6f',
    '70',
    '71',
    '72',
    '73',
    '74',
    '75',
    '76',
    '77',
    '78',
    '79',
    '7a',
    '7b',
    '7c',
    '7d',
    '7e',
    '7f',
    '80',
    '81',
    '82',
    '83',
    '84',
    '85',
    '86',
    '87',
    '88',
    '89',
    '8a',
    '8b',
    '8c',
    '8d',
    '8e',
    '8f',
    '90',
    '91',
    '92',
    '93',
    '94',
    '95',
    '96',
    '97',
    '98',
    '99',
    '9a',
    '9b',
    '9c',
    '9d',
    '9e',
    '9f',
    'a0',
    'a1',
    'a2',
    'a3',
    'a4',
    'a5',
    'a6',
    'a7',
    'a8',
    'a9',
    'aa',
    'ab',
    'ac',
    'ad',
    'ae',
    'af',
    'b0',
    'b1',
    'b2',
    'b3',
    'b4',
    'b5',
    'b6',
    'b7',
    'b8',
    'b9',
    'ba',
    'bb',
    'bc',
    'bd',
    'be',
    'bf',
    'c0',
    'c1',
    'c2',
    'c3',
    'c4',
    'c5',
    'c6',
    'c7',
    'c8',
    'c9',
    'ca',
    'cb',
    'cc',
    'cd',
    'ce',
    'cf',
    'd0',
    'd1',
    'd2',
    'd3',
    'd4',
    'd5',
    'd6',
    'd7',
    'd8',
    'd9',
    'da',
    'db',
    'dc',
    'dd',
    'de',
    'df',
    'e0',
    'e1',
    'e2',
    'e3',
    'e4',
    'e5',
    'e6',
    'e7',
    'e8',
    'e9',
    'ea',
    'eb',
    'ec',
    'ed',
    'ee',
    'ef',
    'f0',
    'f1',
    'f2',
    'f3',
    'f4',
    'f5',
    'f6',
    'f7',
    'f8',
    'f9',
    'fa',
    'fb',
    'fc',
    'fd',
    'fe',
    'ff',
];

let _seed = 1234567;

/** Multiply degrees by this to get radians. */
const DEG2RAD = Math.PI / 180;
/** Multiply radians by this to get degrees. */
const RAD2DEG = 180 / Math.PI;

// http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/21963136#21963136
/**
 * A random RFC 4122 version 4 UUID in lower case. Uses `Math.random`, not the library's seedable
 * random source, so ids stay unique under a fixed seed.
 */
function generateUUID() {
    const d0 = (Math.random() * 0xffffffff) | 0;
    const d1 = (Math.random() * 0xffffffff) | 0;
    const d2 = (Math.random() * 0xffffffff) | 0;
    const d3 = (Math.random() * 0xffffffff) | 0;
    const uuid =
        _lut[d0 & 0xff] +
        _lut[(d0 >> 8) & 0xff] +
        _lut[(d0 >> 16) & 0xff] +
        _lut[(d0 >> 24) & 0xff] +
        '-' +
        _lut[d1 & 0xff] +
        _lut[(d1 >> 8) & 0xff] +
        '-' +
        _lut[((d1 >> 16) & 0x0f) | 0x40] +
        _lut[(d1 >> 24) & 0xff] +
        '-' +
        _lut[(d2 & 0x3f) | 0x80] +
        _lut[(d2 >> 8) & 0xff] +
        '-' +
        _lut[(d2 >> 16) & 0xff] +
        _lut[(d2 >> 24) & 0xff] +
        _lut[d3 & 0xff] +
        _lut[(d3 >> 8) & 0xff] +
        _lut[(d3 >> 16) & 0xff] +
        _lut[(d3 >> 24) & 0xff];

    // .toLowerCase() here flattens concatenated strings to save heap memory space.
    return uuid.toLowerCase();
}

/** `value` limited to [`min`, `max`]. */
function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

// compute euclidean modulo of m % n
// https://en.wikipedia.org/wiki/Modulo_operation
/**
 * The remainder of `n / m` with the sign of `m`, so a negative `n` wraps into [0, `m`) for a
 * positive `m`.
 */
function euclideanModulo(n: number, m: number) {
    return ((n % m) + m) % m;
}

// Linear mapping from range <a1, a2> to range <b1, b2>
/** Maps `x` linearly from the range [`a1`, `a2`] to [`b1`, `b2`], without clamping. */
function mapLinear(x: number, a1: number, a2: number, b1: number, b2: number) {
    return b1 + ((x - a1) * (b2 - b1)) / (a2 - a1);
}

// https://www.gamedev.net/tutorials/programming/general-and-gameplay-programming/inverse-lerp-a-super-useful-yet-often-overlooked-function-r5230/
/** Where `value` lies between `x` and `y`: 0 at `x`, 1 at `y`, unclamped; 0 when `x` equals `y`. */
function inverseLerp(x: number, y: number, value: number) {
    if (x !== y) {
        return (value - x) / (y - x);
    } else {
        return 0;
    }
}

// https://en.wikipedia.org/wiki/Linear_interpolation
/** The linear interpolation from `x` to `y` by `t`. */
function lerp(x: number, y: number, t: number) {
    return (1 - t) * x + t * y;
}

// http://www.rorydriscoll.com/2016/03/07/frame-rate-independent-damping-using-lerp/
/**
 * Moves `x` toward `y` by a frame-rate independent exponential step: `lambda` is the rate per
 * second, `dt` the step in seconds.
 */
function damp(x: number, y: number, lambda: number, dt: number) {
    return lerp(x, y, 1 - Math.exp(-lambda * dt));
}

// https://www.desmos.com/calculator/vcsjnyz7x4
/** Bounces `x` between 0 and `length`: rises from 0 to `length`, then falls back, and repeats. */
function pingpong(x: number, length = 1) {
    return length - Math.abs(euclideanModulo(x, length * 2) - length);
}

// http://en.wikipedia.org/wiki/Smoothstep
/**
 * The cubic Hermite step of `x` from `min` to `max`: 0 at or below `min`, 1 at or above `max`,
 * smooth between.
 */
function smoothstep(x: number, min: number, max: number) {
    if (x <= min) return 0;
    if (x >= max) return 1;

    x = (x - min) / (max - min);

    return x * x * (3 - 2 * x);
}

/**
 * Ken Perlin's quintic step of `x` from `min` to `max`: like {@link smoothstep} with zero first and
 * second derivatives at both ends.
 */
function smootherstep(x: number, min: number, max: number) {
    if (x <= min) return 0;
    if (x >= max) return 1;

    x = (x - min) / (max - min);

    return x * x * x * (x * (x * 6 - 15) + 10);
}

// Random integer from <low, high> interval
/** A random integer in [`low`, `high`], both included, from the library's random source. */
function randInt(low: number, high: number) {
    return low + Math.floor(random() * (high - low + 1));
}

// Random float from <low, high> interval
/** A random number in [`low`, `high`), from the library's random source. */
function randFloat(low: number, high: number) {
    return low + random() * (high - low);
}

// Random float from <-range/2, range/2> interval
/** A random number in (-`range`/2, `range`/2], from the library's random source. */
function randFloatSpread(range: number) {
    return range * (0.5 - random());
}

// Deterministic pseudo-random float in the interval [ 0, 1 ]
/**
 * A deterministic pseudo-random number in [0, 1) (Mulberry32). Passing `s` reseeds the generator
 * first; each call advances it.
 */
function seededRandom(s: number) {
    if (s !== undefined) _seed = s;

    // Mulberry32 generator

    let t = (_seed += 0x6d2b79f5);

    t = Math.imul(t ^ (t >>> 15), t | 1);

    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** `degrees` in radians. */
function degToRad(degrees: number) {
    return degrees * DEG2RAD;
}

/** `radians` in degrees. */
function radToDeg(radians: number) {
    return radians * RAD2DEG;
}

/** Whether the integer `value` is a positive power of two. */
function isPowerOfTwo(value: number) {
    return (value & (value - 1)) === 0 && value !== 0;
}

/** The smallest power of two at or above `value`. */
function ceilPowerOfTwo(value: number) {
    return Math.pow(2, Math.ceil(Math.log(value) / Math.LN2));
}

/** The largest power of two at or below `value`. */
function floorPowerOfTwo(value: number) {
    return Math.pow(2, Math.floor(Math.log(value) / Math.LN2));
}

/**
 * Sets `q` from the intrinsic proper Euler angles `a`, `b`, `c` in radians, applied in `order`
 * (`XYX`, `YZY`, `ZXZ`, `XZX`, `YXY` or `ZYZ`); another order logs a warning and leaves `q` as it
 * was.
 */
function setQuaternionFromProperEuler(q: Quaternion, a: number, b: number, c: number, order: EulerOrder) {
    // Intrinsic Proper Euler Angles - see https://en.wikipedia.org/wiki/Euler_angles

    // rotations are applied to the axes in the order specified by 'order'
    // rotation by angle 'a' is applied first, then by angle 'b', then by angle 'c'
    // angles are in radians

    const cos = Math.cos;
    const sin = Math.sin;

    const c2 = cos(b / 2);
    const s2 = sin(b / 2);

    const c13 = cos((a + c) / 2);
    const s13 = sin((a + c) / 2);

    const c1_3 = cos((a - c) / 2);
    const s1_3 = sin((a - c) / 2);

    const c3_1 = cos((c - a) / 2);
    const s3_1 = sin((c - a) / 2);

    switch (order) {
        case 'XYX':
            q.set(c2 * s13, s2 * c1_3, s2 * s1_3, c2 * c13);
            break;

        case 'YZY':
            q.set(s2 * s1_3, c2 * s13, s2 * c1_3, c2 * c13);
            break;

        case 'ZXZ':
            q.set(s2 * c1_3, s2 * s1_3, c2 * s13, c2 * c13);
            break;

        case 'XZX':
            q.set(c2 * s13, s2 * s3_1, s2 * c3_1, c2 * c13);
            break;

        case 'YXY':
            q.set(s2 * c3_1, c2 * s13, s2 * s3_1, c2 * c13);
            break;

        case 'ZYZ':
            q.set(s2 * s3_1, s2 * c3_1, c2 * s13, c2 * c13);
            break;

        default:
            console.warn('../math.MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: ' + order);
    }
}

/**
 * Turns `value`, stored normalized in an array of `array`'s integer type, back into a float in [0,
 * 1] or [-1, 1]; a `Float32Array` keeps it as it is, and other arrays throw.
 */
function denormalize(value: number, array: number[]) {
    switch (array.constructor) {
        case Float32Array:
            return value;

        case Uint32Array:
            return value / 4294967295.0;

        case Uint16Array:
            return value / 65535.0;

        case Uint8Array:
            return value / 255.0;

        case Int32Array:
            return Math.max(value / 2147483647.0, -1.0);

        case Int16Array:
            return Math.max(value / 32767.0, -1.0);

        case Int8Array:
            return Math.max(value / 127.0, -1.0);

        default:
            throw new Error('Invalid component type.');
    }
}

/**
 * Turns the float `value` into the normalized integer an array of `array`'s type stores; a
 * `Float32Array` keeps it as it is, and other arrays throw.
 */
function normalize(value: number, array: number[]) {
    switch (array.constructor) {
        case Float32Array:
            return value;

        case Uint32Array:
            return Math.round(value * 4294967295.0);

        case Uint16Array:
            return Math.round(value * 65535.0);

        case Uint8Array:
            return Math.round(value * 255.0);

        case Int32Array:
            return Math.round(value * 2147483647.0);

        case Int16Array:
            return Math.round(value * 32767.0);

        case Int8Array:
            return Math.round(value * 127.0);

        default:
            throw new Error('Invalid component type.');
    }
}

/** The math helpers gathered in one object, as three.js `MathUtils`; each is also exported on its own. */
const MathUtils = {
    /** See {@link DEG2RAD}. */
    DEG2RAD: DEG2RAD,
    /** See {@link RAD2DEG}. */
    RAD2DEG: RAD2DEG,
    /** See {@link generateUUID}. */
    generateUUID: generateUUID,
    /** See {@link clamp}. */
    clamp: clamp,
    /** See {@link euclideanModulo}. */
    euclideanModulo: euclideanModulo,
    /** See {@link mapLinear}. */
    mapLinear: mapLinear,
    /** See {@link inverseLerp}. */
    inverseLerp: inverseLerp,
    /** See {@link lerp}. */
    lerp: lerp,
    /** See {@link damp}. */
    damp: damp,
    /** See {@link pingpong}. */
    pingpong: pingpong,
    /** See {@link smoothstep}. */
    smoothstep: smoothstep,
    /** See {@link smootherstep}. */
    smootherstep: smootherstep,
    /** See {@link randInt}. */
    randInt: randInt,
    /** See {@link randFloat}. */
    randFloat: randFloat,
    /** See {@link randFloatSpread}. */
    randFloatSpread: randFloatSpread,
    /** See {@link seededRandom}. */
    seededRandom: seededRandom,
    /** See {@link degToRad}. */
    degToRad: degToRad,
    /** See {@link radToDeg}. */
    radToDeg: radToDeg,
    /** See {@link isPowerOfTwo}. */
    isPowerOfTwo: isPowerOfTwo,
    /** See {@link ceilPowerOfTwo}. */
    ceilPowerOfTwo: ceilPowerOfTwo,
    /** See {@link floorPowerOfTwo}. */
    floorPowerOfTwo: floorPowerOfTwo,
    /** See {@link setQuaternionFromProperEuler}. */
    setQuaternionFromProperEuler: setQuaternionFromProperEuler,
    /** See {@link normalize}. */
    normalize: normalize,
    /** See {@link denormalize}. */
    denormalize: denormalize,
};

export {
    ceilPowerOfTwo,
    clamp,
    damp,
    DEG2RAD,
    degToRad,
    denormalize,
    euclideanModulo,
    floorPowerOfTwo,
    generateUUID,
    inverseLerp,
    isPowerOfTwo,
    lerp,
    mapLinear,
    MathUtils,
    normalize,
    pingpong,
    RAD2DEG,
    radToDeg,
    randFloat,
    randFloatSpread,
    randInt,
    seededRandom,
    setQuaternionFromProperEuler,
    smootherstep,
    smoothstep,
};
