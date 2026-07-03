import React from 'react';
import {
    ApplyForce,
    ConstantValue,
    ForceOverLife,
    FrameOverLife,
    LimitSpeedOverLife,
    Noise,
    RotationOverLife,
    SpeedOverLife,
    Vector3,
} from 'babylon.quarks';
import type {Behavior} from 'babylon.quarks';
import {EffectBinding} from '../core/binding';
import {findBehavior} from '../core/colors';
import {buildScalar, readScalar} from '../core/values';
import {CurveEditor} from './CurveEditor';
import {ModuleSection} from './ModuleSection';
import {NumberField, Row} from './fields';
import {ValueField} from './ValueField';

interface ModuleProps {
    binding: EffectBinding;
}

function removeBehaviorOfType(behaviors: Behavior[], type: string): void {
    for (let i = behaviors.length - 1; i >= 0; i--) {
        if ((behaviors[i] as {type?: string}).type === type) {
            behaviors.splice(i, 1);
        }
    }
}

/** Shared shell for modules backed by a single toggleable quarks behavior. */
function BehaviorModule<T extends Behavior>(props: {
    binding: EffectBinding;
    title: string;
    type: string;
    create: () => T;
    children: (behavior: T) => React.ReactNode;
}) {
    const behavior = findBehavior<T>(props.binding.system.behaviors, props.type);
    return (
        <ModuleSection
            title={props.title}
            enabled={!!behavior}
            defaultOpen={false}
            onToggle={(enabled) =>
                props.binding.apply((s) => {
                    removeBehaviorOfType(s.behaviors, props.type);
                    if (enabled) {
                        s.addBehavior(props.create());
                    }
                })
            }
        >
            {behavior ? props.children(behavior) : null}
        </ModuleSection>
    );
}

export function SpeedOverLifeModule({binding}: ModuleProps) {
    return (
        <BehaviorModule<SpeedOverLife>
            binding={binding}
            title="Speed over Lifetime"
            type="SpeedOverLife"
            create={() => new SpeedOverLife(buildScalar({mode: 'curve', value: 1, min: 0, max: 1, curve: [1, 0.75, 0.5, 0]}) as never)}
        >
            {(behavior) => (
                <div style={{marginTop: 6}}>
                    <CurveEditor
                        curve={readScalar(behavior.speed).curve}
                        maxValue={2}
                        onChange={(curve) =>
                            binding.apply(() => (behavior.speed = buildScalar({mode: 'curve', value: 1, min: 0, max: 1, curve}) as never))
                        }
                    />
                </div>
            )}
        </BehaviorModule>
    );
}

export function LimitSpeedOverLifeModule({binding}: ModuleProps) {
    return (
        <BehaviorModule<LimitSpeedOverLife>
            binding={binding}
            title="Limit Speed over Lifetime"
            type="LimitSpeedOverLife"
            create={() => new LimitSpeedOverLife(buildScalar({mode: 'curve', value: 1, min: 0, max: 1, curve: [4, 2, 1, 1]}) as never, 0.5)}
        >
            {(behavior) => (
                <>
                    <div style={{marginTop: 6}}>
                        <CurveEditor
                            curve={readScalar(behavior.speed).curve}
                            maxValue={8}
                            onChange={(curve) =>
                                binding.apply(() => (behavior.speed = buildScalar({mode: 'curve', value: 1, min: 0, max: 1, curve}) as never))
                            }
                        />
                    </div>
                    <Row label="Dampen">
                        <NumberField
                            value={behavior.dampen}
                            min={0}
                            step={0.05}
                            onChange={(v) => binding.apply(() => (behavior.dampen = Math.min(1, v)))}
                        />
                    </Row>
                </>
            )}
        </BehaviorModule>
    );
}

export function ForceOverLifeModule({binding}: ModuleProps) {
    return (
        <BehaviorModule<ForceOverLife>
            binding={binding}
            title="Force over Lifetime"
            type="ForceOverLife"
            create={() => new ForceOverLife(new ConstantValue(0), new ConstantValue(2), new ConstantValue(0))}
        >
            {(behavior) => (
                <>
                    <ValueField label="X" generator={behavior.x} curveMax={10} onChange={(g) => binding.apply(() => (behavior.x = g))} />
                    <ValueField label="Y" generator={behavior.y} curveMax={10} onChange={(g) => binding.apply(() => (behavior.y = g))} />
                    <ValueField label="Z" generator={behavior.z} curveMax={10} onChange={(g) => binding.apply(() => (behavior.z = g))} />
                </>
            )}
        </BehaviorModule>
    );
}

export function GravityModule({binding}: ModuleProps) {
    return (
        <BehaviorModule<ApplyForce>
            binding={binding}
            title="Gravity"
            type="ApplyForce"
            create={() => new ApplyForce(new Vector3(0, -1, 0), new ConstantValue(9.81))}
        >
            {(behavior) => (
                <Row label="Strength">
                    <NumberField
                        value={readScalar(behavior.magnitude).value}
                        step={0.5}
                        onChange={(v) => binding.apply(() => (behavior.magnitude = new ConstantValue(v)))}
                    />
                </Row>
            )}
        </BehaviorModule>
    );
}

export function RotationOverLifeModule({binding}: ModuleProps) {
    return (
        <BehaviorModule<RotationOverLife>
            binding={binding}
            title="Rotation over Lifetime"
            type="RotationOverLife"
            create={() => new RotationOverLife(new ConstantValue(Math.PI))}
        >
            {(behavior) => (
                <ValueField
                    label="Velocity (rad/s)"
                    generator={behavior.angularVelocity}
                    curveMax={Math.PI * 4}
                    onChange={(g) => binding.apply(() => (behavior.angularVelocity = g))}
                />
            )}
        </BehaviorModule>
    );
}

export function NoiseModule({binding}: ModuleProps) {
    return (
        <BehaviorModule<Noise>
            binding={binding}
            title="Noise"
            type="Noise"
            create={() => new Noise(new ConstantValue(1), new ConstantValue(1), new ConstantValue(1), new ConstantValue(0))}
        >
            {(behavior) => (
                <>
                    <ValueField
                        label="Frequency"
                        generator={behavior.frequency}
                        min={0}
                        curveMax={10}
                        onChange={(g) => binding.apply(() => (behavior.frequency = g))}
                    />
                    <ValueField
                        label="Strength"
                        generator={behavior.power}
                        min={0}
                        curveMax={10}
                        onChange={(g) => binding.apply(() => (behavior.power = g))}
                    />
                </>
            )}
        </BehaviorModule>
    );
}

export function TextureSheetModule({binding}: ModuleProps) {
    const system = binding.system;
    const frameBehavior = findBehavior<FrameOverLife>(system.behaviors, 'FrameOverLife');
    const tiles = Math.max(1, system.uTileCount * system.vTileCount);
    return (
        <ModuleSection title="Texture Sheet Animation" defaultOpen={false}>
            <Row label="Tiles U">
                <NumberField value={system.uTileCount} min={1} step={1} onChange={(v) => binding.apply((s) => (s.uTileCount = Math.round(v)))} />
            </Row>
            <Row label="Tiles V">
                <NumberField value={system.vTileCount} min={1} step={1} onChange={(v) => binding.apply((s) => (s.vTileCount = Math.round(v)))} />
            </Row>
            <Row label="Start tile">
                <NumberField
                    value={readScalar(system.startTileIndex as never).value}
                    min={0}
                    step={1}
                    onChange={(v) => binding.apply((s) => (s.startTileIndex = new ConstantValue(Math.round(v))))}
                />
            </Row>
            <Row label="Animate frames">
                <input
                    type="checkbox"
                    checked={!!frameBehavior}
                    style={{justifySelf: 'start', width: 15, height: 15, accentColor: '#78a5ff', cursor: 'pointer'}}
                    onChange={(e) =>
                        binding.apply((s) => {
                            removeBehaviorOfType(s.behaviors, 'FrameOverLife');
                            if (e.target.checked) {
                                s.addBehavior(
                                    new FrameOverLife(
                                        buildScalar({mode: 'curve', value: 0, min: 0, max: tiles - 1, curve: [0, (tiles - 1) / 3, (2 * (tiles - 1)) / 3, tiles - 1]}) as never
                                    )
                                );
                            }
                        })
                    }
                />
            </Row>
            {frameBehavior && (
                <div style={{marginTop: 6}}>
                    <CurveEditor
                        curve={readScalar(frameBehavior.frame).curve}
                        maxValue={Math.max(1, tiles - 1)}
                        onChange={(curve) =>
                            binding.apply(() => (frameBehavior.frame = buildScalar({mode: 'curve', value: 0, min: 0, max: 1, curve}) as never))
                        }
                    />
                </div>
            )}
        </ModuleSection>
    );
}
