import {
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    IntervalValue,
    ParticleSystem,
    RenderMode,
    Vector4,
} from 'babylon.quarks';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {EffectBinding} from './binding';

export interface ChildSystemOptions {
    name?: string;
    /** One-shot burst (sub-emitter target) instead of a looping stream. */
    oneShot?: boolean;
    /** Attach point override — defaults to `parent.emitter`. Lets a new system land as a
     * sibling under a group node instead of nesting under an existing system. */
    parentNode?: TransformNode;
}

/**
 * Creates a child system sharing the parent's scene/texture/blending, parented to the
 * parent emitter (or `options.parentNode` when given) — the Unity pattern where an effect is
 * a hierarchy of systems and groups.
 */
export function createChildSystem(parent: ParticleSystem, options: ChildSystemOptions = {}): ParticleSystem {
    const oneShot = options.oneShot ?? false;
    const child = new ParticleSystem({
        scene: parent.emitter.getScene(),
        duration: oneShot ? 1 : parent.duration,
        looping: !oneShot,
        startLife: new IntervalValue(0.3, oneShot ? 0.6 : 1.2),
        startSpeed: new IntervalValue(1, 3),
        startSize: new IntervalValue(0.05, 0.2),
        startColor: new ConstantColor(new Vector4(1, 0.9, 0.6, 1)),
        emissionOverTime: new ConstantValue(oneShot ? 0 : 30),
        emissionBursts: oneShot ? [{time: 0, count: new ConstantValue(8), cycle: 1, interval: 0.01, probability: 1}] : [],
        shape: new ConeEmitter({radius: 0.1, angle: Math.PI / 3}),
        renderMode: RenderMode.BillBoard,
        texture: parent.texture ?? undefined,
        transparent: true,
        blendMode: parent.blending,
        worldSpace: true,
    });
    child.emitter.name = options.name ?? (oneShot ? 'sub-emitter' : 'child-system');
    if (oneShot) {
        child.onlyUsedByOther = true;
    }
    child.emitter.parent = options.parentNode ?? parent.emitter;
    return child;
}

/**
 * Strips EmitSubParticleSystem behaviors that point at any of the removed systems, so
 * deleting a sub-emitter target never leaves a dangling reference (which crashes the next
 * update with `reading 'duration'` on the disposed emitter).
 */
export function unlinkSubEmitterReferences(systems: ParticleSystem[], removed: ParticleSystem[]): void {
    const removedEmitters = new Set(removed.map((system) => system.emitter));
    for (const system of systems) {
        const behaviors = system.behaviors as Array<{type?: string; subParticleSystem?: unknown}>;
        for (let i = behaviors.length - 1; i >= 0; i--) {
            const behavior = behaviors[i];
            if (behavior.type === 'EmitSubParticleSystem' && removedEmitters.has(behavior.subParticleSystem as never)) {
                behaviors.splice(i, 1);
            }
        }
    }
}

/** Disposes the given systems, first unlinking any sub-emitter behaviors that target them. */
export function removeSystems(binding: EffectBinding, targets: ParticleSystem[], onSelect: (system: ParticleSystem) => void): void {
    // binding.system is "removable" too as long as some other top-level system can take over
    // as the new main — being main vs. sub is an internal bookkeeping detail, not something
    // that should make one arbitrary track un-deletable in the UI.
    if (targets.includes(binding.system)) {
        const replacement = binding.subSystems.find((s) => !targets.includes(s) && !s.onlyUsedByOther);
        if (replacement) {
            binding.promoteToMain(replacement);
        }
    }
    const removable = targets.filter((system) => binding.subSystems.includes(system));
    if (removable.length === 0) {
        return;
    }
    binding.apply(() => {
        unlinkSubEmitterReferences([binding.system, ...binding.subSystems], removable);
        for (const system of removable) {
            system._renderer?.deleteSystem(system);
            system.dispose();
        }
    });
    for (const system of removable) {
        binding.removeSubSystem(system);
    }
    onSelect(binding.system);
}
