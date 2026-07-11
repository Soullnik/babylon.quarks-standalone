import {ParamField, buildParamsStructWgsl, CURVE_RESOLUTION} from '../generators/GeneratorEncoder';

/** Per-instance layout written by the update kernel, in floats. Matches the
 * instanced vertex buffers of the sprite billboard material:
 * offset(3) color(4) size(3) uvTile(1) rotation(1). */
export const INSTANCE_STRIDE_FLOATS = 12;

export const FLAG_WORLD_SPACE = 1;
export const FLAG_VISIBLE = 2;

// NOTE: Babylon's shader preprocessor splits source lines on ';' even inside
// comments, so WGSL comments below must never contain semicolons.
const COMMON_WGSL = `
struct Particle {
    position_age : vec4<f32>,   // xyz position (sim space), w age
    velocity_life : vec4<f32>,  // xyz velocity, w life (life <= 0 means free slot)
    start_color : vec4<f32>,
    start_misc : vec4<f32>,     // x startSize, y startSpeed, z rotation, w uvTile
    seed : vec4<u32>,           // x per-particle random seed
};

struct Counters {
    aliveCount : atomic<u32>,
    freeTop : atomic<i32>,
    dropped : atomic<u32>,
    pad : u32,
};

fn pcg(v : u32) -> u32 {
    let s = v * 747796405u + 2891336453u;
    let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
    return (w >> 22u) ^ w;
}

fn prand(seed : u32, id : u32) -> f32 {
    return f32(pcg(seed ^ (id * 2654435769u))) / 4294967296.0;
}

fn nextRand(state : ptr<function, u32>) -> f32 {
    *state = pcg(*state);
    return f32(*state) / 4294967296.0;
}
`;

function curveSupport(curveCount: number): {binding: string; fn: string} {
    if (curveCount === 0) {
        return {binding: '', fn: ''};
    }
    return {
        binding: '@group(0) @binding(5) var curveAtlas : texture_2d<f32>;',
        fn: `
fn sampleCurve(row : u32, t : f32) -> vec4<f32> {
    let x = clamp(t, 0.0, 1.0) * ${CURVE_RESOLUTION - 1}.0;
    let i0 = u32(floor(x));
    let i1 = min(i0 + 1u, ${CURVE_RESOLUTION - 1}u);
    let a = textureLoad(curveAtlas, vec2<u32>(i0, row), 0);
    let b = textureLoad(curveAtlas, vec2<u32>(i1, row), 0);
    return mix(a, b, x - f32(i0));
}`,
    };
}

export interface KernelSources {
    reset: string;
    spawn: string;
    update: string;
    /**
     * Which kernels statically sample the curve atlas (binding 5). Dawn drops
     * bindings a kernel doesn't use from its implicit pipeline layout, so a
     * resource may only be bound to kernels that actually reference it.
     */
    spawnUsesCurves: boolean;
    updateUsesCurves: boolean;
}

export interface SpawnCodeParts {
    /** WGSL expressions for the start generators; `seed` and `tEmit` are in scope. */
    startLife: string;
    startSpeed: string;
    startSize: string;
    startRotation: string;
    startTile: string;
    startColor: string;
    /** emitter shape statements; writes `position`/`velocity` using `rng`/`startSpeed` */
    emitter: string;
}

export function assembleKernels(
    capacity: number,
    fields: ParamField[],
    curveCount: number,
    spawnParts: SpawnCodeParts,
    behaviorCode: string
): KernelSources {
    const params = buildParamsStructWgsl(fields);
    const curves = curveSupport(curveCount);
    const cap = `${capacity}u`;
    const spawnUsesCurves =
        curveCount > 0 &&
        [
            spawnParts.startLife,
            spawnParts.startSpeed,
            spawnParts.startSize,
            spawnParts.startRotation,
            spawnParts.startTile,
            spawnParts.startColor,
            spawnParts.emitter,
        ].some((code) => code.includes('sampleCurve('));
    const updateUsesCurves = curveCount > 0 && behaviorCode.includes('sampleCurve(');

    const bindings = `
${params}
@group(0) @binding(0) var<storage, read> params : SimParams;
@group(0) @binding(1) var<storage, read_write> particles : array<Particle>;
@group(0) @binding(2) var<storage, read_write> counters : Counters;
@group(0) @binding(3) var<storage, read_write> freeList : array<u32>;
@group(0) @binding(4) var<storage, read_write> instanceData : array<f32>;
${curves.binding}
${COMMON_WGSL}
${curves.fn}

fn clearInstance(slot : u32) {
    let base = (params.counts.z + slot) * ${INSTANCE_STRIDE_FLOATS}u;
    instanceData[base + 7u] = 0.0;
    instanceData[base + 8u] = 0.0;
    instanceData[base + 9u] = 0.0;
}
`;

    const reset = `${bindings}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
    let slot = gid.x;
    if (slot >= ${cap}) {
        return;
    }
    particles[slot].velocity_life = vec4<f32>(0.0);
    freeList[slot] = ${cap} - 1u - slot;
    let base = (params.counts.z + slot) * ${INSTANCE_STRIDE_FLOATS}u;
    for (var k = 0u; k < ${INSTANCE_STRIDE_FLOATS}u; k = k + 1u) {
        instanceData[base + k] = 0.0;
    }
    if (slot == 0u) {
        atomicStore(&counters.aliveCount, 0u);
        atomicStore(&counters.freeTop, i32(${cap}));
        atomicStore(&counters.dropped, 0u);
    }
}
`;

    const spawn = `${bindings}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
    let i = gid.x;
    if (i >= params.counts.x) {
        return;
    }
    let top = atomicSub(&counters.freeTop, 1) - 1;
    if (top < 0) {
        atomicAdd(&counters.freeTop, 1);
        atomicAdd(&counters.dropped, 1u);
        return;
    }
    let slot = freeList[u32(top)];
    var rng = pcg(params.counts.y ^ (i * 747796405u) ^ 2654435769u);
    let seed = pcg(rng ^ 668265263u);
    let tEmit = params.timing.y;

    let startColor = ${spawnParts.startColor};
    let startSpeed = ${spawnParts.startSpeed};
    let startLife = max(${spawnParts.startLife}, 1e-6);
    var startSize = ${spawnParts.startSize};
    let startRotation = ${spawnParts.startRotation};
    let startTile = ${spawnParts.startTile};

    var position = vec3<f32>(0.0);
    var velocity = vec3<f32>(0.0);
${spawnParts.emitter}

    if ((params.counts.w & ${FLAG_WORLD_SPACE}u) != 0u) {
        position = (params.emitterMatrix * vec4<f32>(position, 1.0)).xyz;
        velocity = (params.normalMatrix * vec4<f32>(velocity * params.scaleV.xyz, 0.0)).xyz;
        startSize = startSize * params.scaleV.w;
    }

    var p : Particle;
    p.position_age = vec4<f32>(position, 0.0);
    p.velocity_life = vec4<f32>(velocity, startLife);
    p.start_color = startColor;
    p.start_misc = vec4<f32>(startSize, startSpeed, startRotation, startTile);
    p.seed = vec4<u32>(seed, 0u, 0u, 0u);
    particles[slot] = p;
    atomicAdd(&counters.aliveCount, 1u);
}
`;

    const update = `${bindings}
fn writeInstance(slot : u32, pos : vec3<f32>, color : vec4<f32>, size3 : vec3<f32>, uvTile : f32, rotation : f32) {
    let base = (params.counts.z + slot) * ${INSTANCE_STRIDE_FLOATS}u;
    instanceData[base] = pos.x;
    instanceData[base + 1u] = pos.y;
    instanceData[base + 2u] = pos.z;
    instanceData[base + 3u] = color.x;
    instanceData[base + 4u] = color.y;
    instanceData[base + 5u] = color.z;
    instanceData[base + 6u] = color.w;
    instanceData[base + 7u] = size3.x;
    instanceData[base + 8u] = size3.y;
    instanceData[base + 9u] = size3.z;
    instanceData[base + 10u] = uvTile;
    instanceData[base + 11u] = rotation;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
    let slot = gid.x;
    if (slot >= ${cap}) {
        return;
    }
    var p = particles[slot];
    let life = p.velocity_life.w;
    if (life <= 0.0) {
        clearInstance(slot);
        return;
    }

    var position = p.position_age.xyz;
    var age = p.position_age.w;
    var velocity = p.velocity_life.xyz;
    let startColor = p.start_color;
    let startSize = p.start_misc.x;
    let startSpeed = p.start_misc.y;
    var rotation = p.start_misc.z;
    var uvTile = p.start_misc.w;
    var color = startColor;
    var size = startSize;
    var speedModifier = 1.0;
    let seed = p.seed.x;
    let delta = params.timing.x;
    let tLife = clamp(age / life, 0.0, 1.0);

${behaviorCode}

    position += velocity * (delta * speedModifier);
    age += delta;

    if (age >= life) {
        p.velocity_life = vec4<f32>(velocity, 0.0);
        particles[slot] = p;
        let top = atomicAdd(&counters.freeTop, 1);
        freeList[u32(top)] = slot;
        atomicSub(&counters.aliveCount, 1u);
        clearInstance(slot);
        return;
    }

    p.position_age = vec4<f32>(position, age);
    p.velocity_life = vec4<f32>(velocity, life);
    p.start_misc = vec4<f32>(startSize, startSpeed, rotation, uvTile);
    particles[slot] = p;

    if ((params.counts.w & ${FLAG_VISIBLE}u) == 0u) {
        clearInstance(slot);
        return;
    }

    var outPos = position;
    var outSize = vec3<f32>(size);
    if ((params.counts.w & ${FLAG_WORLD_SPACE}u) == 0u) {
        outPos = (params.emitterMatrix * vec4<f32>(position, 1.0)).xyz;
        outSize = outSize * params.scaleV.xyz;
    }
    writeInstance(slot, outPos, color, outSize, uvTile, rotation);
}
`;

    return {reset, spawn, update, spawnUsesCurves, updateUsesCurves};
}
