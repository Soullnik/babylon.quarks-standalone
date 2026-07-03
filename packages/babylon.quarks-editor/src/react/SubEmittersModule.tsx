import React, {useMemo, useSyncExternalStore} from 'react';
import {
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    EmitSubParticleSystem,
    IntervalValue,
    ParticleSystem,
    RenderMode,
    SubParticleEmitMode,
    Vector4,
} from 'babylon.quarks';
import {EffectBinding} from '../core/binding';
import {findBehavior} from '../core/colors';
import {ModuleSection} from './ModuleSection';
import {CheckboxField, NumberField, Row, SelectField} from './fields';
import {EmissionModule, MainModule, ShapeModule} from './modules';
import {theme} from './theme';

/** Creates a default one-shot spark burst that plays only when spawned by the parent. */
function createDefaultSubSystem(parent: ParticleSystem): ParticleSystem {
    const sub = new ParticleSystem({
        scene: parent.emitter.getScene(),
        duration: 1,
        looping: false,
        startLife: new IntervalValue(0.3, 0.6),
        startSpeed: new IntervalValue(1, 3),
        startSize: new IntervalValue(0.05, 0.15),
        startColor: new ConstantColor(new Vector4(1, 0.9, 0.6, 1)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(8), cycle: 1, interval: 0.01, probability: 1}],
        shape: new ConeEmitter({radius: 0.05, angle: Math.PI / 2}),
        renderMode: RenderMode.BillBoard,
        texture: parent.texture ?? undefined,
        transparent: true,
        blendMode: parent.blending,
        worldSpace: true,
    });
    sub.emitter.name = 'sub-emitter';
    sub.onlyUsedByOther = true;
    sub.emitter.parent = parent.emitter;
    return sub;
}

export function SubEmittersModule({binding}: {binding: EffectBinding}) {
    const system = binding.system;
    const behavior = findBehavior<EmitSubParticleSystem>(system.behaviors, 'EmitSubParticleSystem');
    const subSystem = binding.subSystems[0];
    const subBinding = useMemo(() => (subSystem ? new EffectBinding(subSystem) : null), [subSystem]);
    // Re-render when the nested binding changes so sub-effect edits show immediately.
    useSyncExternalStore(
        (onStoreChange) => (subBinding ? subBinding.subscribe(onStoreChange) : () => {}),
        () => (subBinding ? subBinding.getRevision() : 0)
    );

    return (
        <ModuleSection
            title="Sub Emitters"
            enabled={!!behavior}
            defaultOpen={false}
            onToggle={(enabled) =>
                binding.apply((s) => {
                    for (let i = s.behaviors.length - 1; i >= 0; i--) {
                        if ((s.behaviors[i] as {type?: string}).type === 'EmitSubParticleSystem') {
                            s.behaviors.splice(i, 1);
                        }
                    }
                    if (enabled) {
                        let sub = binding.subSystems[0];
                        if (!sub) {
                            sub = createDefaultSubSystem(s);
                            s._renderer?.addSystem(sub);
                            binding.addSubSystem(sub);
                        }
                        s.addBehavior(new EmitSubParticleSystem(s, false, sub.emitter, SubParticleEmitMode.Death, 1));
                    } else {
                        const sub = binding.subSystems[0];
                        if (sub) {
                            s._renderer?.deleteSystem(sub);
                            sub.dispose();
                            binding.removeSubSystem(sub);
                        }
                    }
                })
            }
        >
            {behavior && (
                <>
                    <Row label="Trigger">
                        <SelectField
                            value={behavior.mode}
                            options={[
                                {value: SubParticleEmitMode.Death, label: 'On death'},
                                {value: SubParticleEmitMode.Birth, label: 'On birth'},
                                {value: SubParticleEmitMode.Frame, label: 'Every frame'},
                            ]}
                            onChange={(mode) => binding.apply(() => (behavior.mode = mode))}
                        />
                    </Row>
                    <Row label="Probability">
                        <NumberField
                            value={behavior.emitProbability}
                            min={0}
                            step={0.05}
                            onChange={(v) => binding.apply(() => (behavior.emitProbability = Math.min(1, v)))}
                        />
                    </Row>
                    <Row label="Use velocity">
                        <CheckboxField
                            value={behavior.useVelocityAsBasis}
                            onChange={(v) => binding.apply(() => (behavior.useVelocityAsBasis = v))}
                        />
                    </Row>
                    {subBinding && (
                        <div style={{marginTop: 10, paddingLeft: 8, borderLeft: `2px solid ${theme.border}`}}>
                            <div style={{color: theme.accent, fontSize: 12, fontWeight: 600, margin: '2px 0 4px'}}>Sub effect</div>
                            <MainModule binding={subBinding} />
                            <EmissionModule binding={subBinding} />
                            <ShapeModule binding={subBinding} />
                        </div>
                    )}
                </>
            )}
        </ModuleSection>
    );
}
