import type {ParticleSystem} from '../ParticleSystem';
import {GpuSystemEncoder, ParamField} from './generators/GeneratorEncoder';
import {GpuEmitterRegistry} from './emitters/GpuEmitterRegistry';
import {GpuBehaviorRegistry} from './behaviors/GpuBehaviorRegistry';
import {assembleKernels, KernelSources, SpawnCodeParts} from './wgsl/assemble';

export interface EncodedSystem {
    fields: ParamField[];
    curves: Array<() => Float32Array>;
    signature: string;
    kernels: KernelSources;
    capacity: number;
}

export type EncodeResult = {ok: true; encoded: EncodedSystem} | {ok: false; reasons: string[]};

/**
 * Collects every reason a system can't be simulated on the GPU. Engine
 * capabilities are checked separately in evaluateGpuSupport — this covers the
 * system's own configuration only.
 */
export function collectUnsupportedFeatures(system: ParticleSystem): string[] {
    const reasons: string[] = [];

    const emitterCodec = GpuEmitterRegistry.get(system.emitterShape.type);
    if (!emitterCodec) {
        reasons.push(`emitter shape "${system.emitterShape.type}" is not GPU-supported yet`);
    } else {
        const reason = emitterCodec.isSupported(system.emitterShape);
        if (reason) {
            reasons.push(reason);
        }
    }

    for (const behavior of system.behaviors) {
        const codec = GpuBehaviorRegistry.get(behavior.type);
        if (!codec) {
            reasons.push(`behavior "${behavior.type}" is not GPU-supported yet`);
            continue;
        }
        const reason = codec.isSupported(behavior);
        if (reason) {
            reasons.push(reason);
        }
    }

    if (system.startSize.type === 'vec3function') {
        reasons.push('per-axis startSize (Vector3Generator) is not GPU-supported yet');
    } else if (!GpuSystemEncoder.canEncodeValue(system.startSize as any)) {
        reasons.push('startSize generator is not GPU-encodable');
    }
    if (!GpuSystemEncoder.canEncodeValue(system.startLife as any)) {
        reasons.push('startLife generator is not GPU-encodable');
    }
    if (!GpuSystemEncoder.canEncodeValue(system.startSpeed as any)) {
        reasons.push('startSpeed generator is not GPU-encodable');
    }
    if (system.startRotation.type !== 'rotation' && !GpuSystemEncoder.canEncodeValue(system.startRotation as any)) {
        reasons.push('startRotation generator is not GPU-encodable');
    }
    if (!GpuSystemEncoder.canEncodeColor(system.startColor)) {
        reasons.push('startColor generator is not GPU-encodable');
    }
    if (!GpuSystemEncoder.canEncodeValue(system.startTileIndex as any)) {
        reasons.push('startTileIndex generator is not GPU-encodable');
    }

    return reasons;
}

/**
 * Encodes a supported system into WGSL kernel sources plus the CPU-side param
 * writers and curve bakers. Pure string/closure assembly — no engine objects.
 */
export function encodeSystem(system: ParticleSystem, capacity: number): EncodeResult {
    const reasons = collectUnsupportedFeatures(system);
    if (reasons.length > 0) {
        return {ok: false, reasons};
    }

    const enc = new GpuSystemEncoder();

    // Start generators. CPU reference (ParticleSystem.spawn): value generators
    // sample at time/duration; startColor samples at absolute emission time;
    // startTileIndex ignores t. Billboard modes collapse RotationGenerator
    // startRotation to 0 (Mesh mode is not GPU-supported yet).
    const startColor = enc.encodeColor(system.startColor, 'startColor', 'params.timing.z');
    const startSpeed = enc.encodeValue(system.startSpeed as any, 'startSpeed', 'tEmit');
    const startLife = enc.encodeValue(system.startLife as any, 'startLife', 'tEmit');
    const startSize = enc.encodeValue(system.startSize as any, 'startSize', 'tEmit');
    const startRotation =
        system.startRotation.type === 'rotation'
            ? '0.0'
            : enc.encodeValue(system.startRotation as any, 'startRotation', 'tEmit');
    const startTile = enc.encodeValue(system.startTileIndex as any, 'startTile', 'tEmit');

    const emitterCodec = GpuEmitterRegistry.get(system.emitterShape.type)!;
    const emitter = emitterCodec.encode(system.emitterShape, enc);

    const behaviorSnippets: string[] = [];
    for (const behavior of system.behaviors) {
        const codec = GpuBehaviorRegistry.get(behavior.type)!;
        behaviorSnippets.push(codec.encode(behavior, enc));
    }

    const spawnParts: SpawnCodeParts = {
        startLife,
        startSpeed,
        startSize,
        startRotation,
        startTile,
        startColor,
        emitter,
    };

    const kernels = assembleKernels(capacity, enc.fields, enc.curves.length, spawnParts, behaviorSnippets.join('\n'));
    const signature = `cap:${capacity}|${enc.signatureParts.join('|')}`;

    return {
        ok: true,
        encoded: {
            fields: enc.fields,
            curves: enc.curves,
            signature,
            kernels,
            capacity,
        },
    };
}
