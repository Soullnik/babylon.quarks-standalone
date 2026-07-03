import {
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    IntervalValue,
    ParticleSystem,
    RenderMode,
    Vector4,
} from 'babylon.quarks';

export interface ChildSystemOptions {
    name?: string;
    /** One-shot burst (sub-emitter target) instead of a looping stream. */
    oneShot?: boolean;
}

/**
 * Creates a child system sharing the parent's scene/texture/blending, parented to the
 * parent emitter — the Unity pattern where an effect is a hierarchy of systems.
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
    child.emitter.parent = parent.emitter;
    return child;
}
