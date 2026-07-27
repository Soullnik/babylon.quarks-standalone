import type {ParticleEmitter, ParticleSystem} from 'babylon.quarks';
import {EmitSubParticleSystem, SubParticleEmitMode} from 'babylon.quarks';
import {EffectBinding} from '../core/binding';
import {findBehavior} from '../core/colors';
import {createChildSystem} from '../core/systems';
import {ModuleSection} from './ModuleSection';
import {CheckboxField, NumberField, Row, SelectField} from './fields';
import {theme} from './theme';

/**
 * Sub Emitters module for the currently selected system. The spawned target lives as a
 * child system in the effect hierarchy — edit it by selecting it there (Unity pattern).
 */
export function SubEmittersModule(props: {binding: EffectBinding; rootBinding: EffectBinding}) {
    const {binding, rootBinding} = props;
    const system = binding.system;
    const behavior = findBehavior<EmitSubParticleSystem>(system.behaviors, 'EmitSubParticleSystem');
    const target = (behavior?.subParticleSystem as ParticleEmitter | undefined)?.system as ParticleSystem | undefined;

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
                        const sub = createChildSystem(s, {oneShot: true});
                        s._renderer?.addSystem(sub);
                        rootBinding.addSubSystem(sub);
                        s.addBehavior(new EmitSubParticleSystem(s, false, sub.emitter, SubParticleEmitMode.Death, 1));
                    } else if (target) {
                        s._renderer?.deleteSystem(target);
                        target.dispose();
                        rootBinding.removeSubSystem(target);
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
                    <p style={{margin: '8px 0 2px', color: theme.textDim, fontSize: 11.5}}>
                        Spawns “{target?.emitter.name ?? 'sub-emitter'}” — select it in the hierarchy above to edit it.
                    </p>
                </>
            )}
        </ModuleSection>
    );
}
