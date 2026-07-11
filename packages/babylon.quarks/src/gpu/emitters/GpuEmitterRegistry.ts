import {ConeEmitter, EmitterShape, PointEmitter, SphereEmitter} from 'quarks.core';
import {GpuSystemEncoder} from '../generators/GeneratorEncoder';

/**
 * Translates an emitter shape into WGSL spawn statements. The snippet runs in
 * the spawn kernel with these locals in scope:
 *   - `rng: u32` sequential random state (use `nextRand(&rng)`)
 *   - `startSpeed: f32`
 *   - `position`, `velocity`: var vec3<f32> to write (local emitter space)
 */
export interface GpuEmitterCodec {
    type: string;
    isSupported(shape: EmitterShape): string | null;
    encode(shape: EmitterShape, enc: GpuSystemEncoder): string;
}

/** Only EmitterMode.Random (the default, mode = 0) is supported in v1. */
function requireRandomMode(shape: {mode?: number}): string | null {
    if (shape.mode !== undefined && shape.mode !== 0) {
        return 'emitter mode Loop/PingPong/Burst is not GPU-supported yet';
    }
    return null;
}

const pointCodec: GpuEmitterCodec = {
    type: 'point',
    isSupported: () => null,
    encode(_shape, enc) {
        enc.signatureParts.push('shape:point');
        return `
    {
        let u = nextRand(&rng);
        let v = nextRand(&rng);
        let theta = u * 6.283185307179586;
        let phi = acos(clamp(2.0 * v - 1.0, -1.0, 1.0));
        let r = pow(nextRand(&rng), 1.0 / 3.0);
        let sinPhi = sin(phi);
        velocity = vec3<f32>(r * sinPhi * cos(theta), r * sinPhi * sin(theta), r * cos(phi)) * startSpeed;
        position = vec3<f32>(0.0);
    }`;
    },
};

const sphereCodec: GpuEmitterCodec = {
    type: 'sphere',
    isSupported: (shape) => requireRandomMode(shape as SphereEmitter),
    encode(shape, enc) {
        const sphere = shape as SphereEmitter;
        enc.signatureParts.push('shape:sphere');
        const p = enc.addField('sphere', 'vec4f', (floats, o) => {
            floats[o] = sphere.radius;
            floats[o + 1] = sphere.arc;
            floats[o + 2] = sphere.thickness;
        });
        return `
    {
        let u = nextRand(&rng);
        let v = nextRand(&rng);
        let randR = mix(1.0 - ${p}.z, 1.0, nextRand(&rng));
        let theta = u * ${p}.y;
        let phi = acos(clamp(2.0 * v - 1.0, -1.0, 1.0));
        let sinPhi = sin(phi);
        position = vec3<f32>(sinPhi * cos(theta), sinPhi * sin(theta), cos(phi));
        velocity = position * startSpeed;
        position = position * (${p}.x * randR);
    }`;
    },
};

const coneCodec: GpuEmitterCodec = {
    type: 'cone',
    isSupported: (shape) => requireRandomMode(shape as ConeEmitter),
    encode(shape, enc) {
        const cone = shape as ConeEmitter;
        enc.signatureParts.push('shape:cone');
        const p = enc.addField('cone', 'vec4f', (floats, o) => {
            floats[o] = cone.radius;
            floats[o + 1] = cone.arc;
            floats[o + 2] = cone.thickness;
            floats[o + 3] = cone.angle;
        });
        return `
    {
        let u = nextRand(&rng);
        let randR = mix(1.0 - ${p}.z, 1.0, nextRand(&rng));
        let theta = u * ${p}.y;
        let r = sqrt(randR);
        position = vec3<f32>(r * cos(theta), r * sin(theta), 0.0);
        let coneAngle = ${p}.w * r;
        velocity = (vec3<f32>(0.0, 0.0, cos(coneAngle)) + position * sin(coneAngle)) * startSpeed;
        position = position * ${p}.x;
    }`;
    },
};

const codecs = new Map<string, GpuEmitterCodec>([
    [pointCodec.type, pointCodec],
    [sphereCodec.type, sphereCodec],
    [coneCodec.type, coneCodec],
]);

export const GpuEmitterRegistry = {
    get(type: string): GpuEmitterCodec | undefined {
        return codecs.get(type);
    },
    register(codec: GpuEmitterCodec): void {
        codecs.set(codec.type, codec);
    },
};
