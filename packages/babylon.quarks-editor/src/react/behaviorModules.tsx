import React from 'react';
import {
    ApplyCollision,
    ApplyForce,
    ChangeEmitDirection,
    ColorBySpeed,
    ConstantValue,
    ForceOverLife,
    FrameOverLife,
    Gradient,
    InheritVelocity,
    IntervalValue,
    LimitSpeedOverLife,
    Noise,
    OrbitOverLife,
    RotationBySpeed,
    RotationOverLife,
    SizeBySpeed,
    SpeedOverLife,
    TurbulenceField,
    Vector3,
    VelocityOverLife,
    WidthOverLength,
} from 'babylon.quarks';
import type {Behavior} from 'babylon.quarks';
import {EffectBinding} from '../core/binding';
import {ensureGroundResolver} from '../core/collision';
import {DEFAULT_GRADIENT_STOPS, buildGradient, findBehavior, readGradientStops} from '../core/colors';
import {buildCurve, buildScalar, readPieces, readScalar} from '../core/values';
import {GradientEditor} from './GradientEditor';
import {CurveEditor} from './CurveEditor';
import {ModuleSection} from './ModuleSection';
import {NumberField, Row, SelectField} from './fields';
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
                        pieces={readPieces(behavior.speed)}
                        maxValue={2}
                        onChange={(pieces) => binding.apply(() => (behavior.speed = buildCurve(pieces) as never))}
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
                            pieces={readPieces(behavior.speed)}
                            maxValue={8}
                            onChange={(pieces) => binding.apply(() => (behavior.speed = buildCurve(pieces) as never))}
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

export function VelocityOverLifeModule({binding}: ModuleProps) {
    return (
        <BehaviorModule<VelocityOverLife>
            binding={binding}
            title="Velocity over Lifetime"
            type="VelocityOverLife"
            create={() => new VelocityOverLife(new ConstantValue(0), new ConstantValue(1), new ConstantValue(0))}
        >
            {(behavior) => (
                <>
                    <Row label="Space">
                        <SelectField
                            value={behavior.space}
                            options={[
                                {value: 'local', label: 'Local'},
                                {value: 'world', label: 'World'},
                            ]}
                            onChange={(v) => binding.apply(() => (behavior.space = v))}
                        />
                    </Row>
                    <ValueField label="Linear X" generator={behavior.linearX} curveMax={10} onChange={(g) => binding.apply(() => (behavior.linearX = g))} />
                    <ValueField label="Linear Y" generator={behavior.linearY} curveMax={10} onChange={(g) => binding.apply(() => (behavior.linearY = g))} />
                    <ValueField label="Linear Z" generator={behavior.linearZ} curveMax={10} onChange={(g) => binding.apply(() => (behavior.linearZ = g))} />
                    <ValueField label="Orbital X" generator={behavior.orbitalX} curveMax={Math.PI * 4} onChange={(g) => binding.apply(() => (behavior.orbitalX = g))} />
                    <ValueField label="Orbital Y" generator={behavior.orbitalY} curveMax={Math.PI * 4} onChange={(g) => binding.apply(() => (behavior.orbitalY = g))} />
                    <ValueField label="Orbital Z" generator={behavior.orbitalZ} curveMax={Math.PI * 4} onChange={(g) => binding.apply(() => (behavior.orbitalZ = g))} />
                </>
            )}
        </BehaviorModule>
    );
}

export function InheritVelocityModule({binding}: ModuleProps) {
    return (
        <BehaviorModule<InheritVelocity>
            binding={binding}
            title="Inherit Velocity"
            type="InheritVelocity"
            create={() => new InheritVelocity(new ConstantValue(1), 'initial')}
        >
            {(behavior) => (
                <>
                    <Row label="Mode">
                        <SelectField
                            value={behavior.mode}
                            options={[
                                {value: 'initial', label: 'Initial'},
                                {value: 'current', label: 'Current'},
                            ]}
                            onChange={(v) => binding.apply(() => (behavior.mode = v))}
                        />
                    </Row>
                    <ValueField
                        label="Multiplier"
                        generator={behavior.multiplier}
                        curveMax={2}
                        onChange={(g) => binding.apply(() => (behavior.multiplier = g))}
                    />
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
                    <ValueField
                        label="Position amount"
                        generator={behavior.positionAmount}
                        min={0}
                        curveMax={2}
                        onChange={(g) => binding.apply(() => (behavior.positionAmount = g))}
                    />
                    <ValueField
                        label="Rotation amount"
                        generator={behavior.rotationAmount}
                        min={0}
                        curveMax={Math.PI}
                        onChange={(g) => binding.apply(() => (behavior.rotationAmount = g))}
                    />
                </>
            )}
        </BehaviorModule>
    );
}

/** Three numeric inputs for a Vector3 field, replacing the whole vector on any edit. */
function Vector3Row(props: {label: string; value: Vector3; min?: number; step?: number; onChange: (v: Vector3) => void}) {
    const set = (axis: 'x' | 'y' | 'z', n: number) => {
        const next = props.value.clone();
        next[axis] = n;
        props.onChange(next);
    };
    return (
        <Row label={props.label}>
            <div style={{display: 'flex', gap: 6}}>
                <NumberField value={props.value.x} min={props.min} step={props.step} onChange={(n) => set('x', n)} />
                <NumberField value={props.value.y} min={props.min} step={props.step} onChange={(n) => set('y', n)} />
                <NumberField value={props.value.z} min={props.min} step={props.step} onChange={(n) => set('z', n)} />
            </div>
        </Row>
    );
}

export function TurbulenceModule({binding}: ModuleProps) {
    return (
        <BehaviorModule<TurbulenceField>
            binding={binding}
            title="Turbulence"
            type="TurbulenceField"
            create={() => new TurbulenceField(new Vector3(1, 1, 1), 3, new Vector3(1, 1, 1), new Vector3(1, 1, 1))}
        >
            {(behavior) => (
                <>
                    {/* scale divides particle position, so keep each axis strictly positive. */}
                    <Vector3Row label="Scale" value={behavior.scale} min={0.01} step={0.1} onChange={(v) => binding.apply(() => (behavior.scale = v))} />
                    <Row label="Octaves">
                        <NumberField
                            value={behavior.octaves}
                            min={1}
                            step={1}
                            onChange={(v) => binding.apply(() => (behavior.octaves = Math.max(1, Math.round(v))))}
                        />
                    </Row>
                    <Vector3Row
                        label="Strength"
                        value={behavior.velocityMultiplier}
                        step={0.5}
                        onChange={(v) => binding.apply(() => (behavior.velocityMultiplier = v))}
                    />
                    <Vector3Row
                        label="Time scale"
                        value={behavior.timeScale}
                        step={0.1}
                        onChange={(v) => binding.apply(() => (behavior.timeScale = v))}
                    />
                </>
            )}
        </BehaviorModule>
    );
}

export function EmitDirectionModule({binding}: ModuleProps) {
    return (
        <BehaviorModule<ChangeEmitDirection>
            binding={binding}
            title="Randomize Direction"
            type="ChangeEmitDirection"
            create={() => new ChangeEmitDirection(new IntervalValue(0, Math.PI / 6))}
        >
            {(behavior) => (
                <ValueField
                    label="Angle (rad)"
                    generator={behavior.angle as never}
                    min={0}
                    curveMax={Math.PI}
                    onChange={(g) => binding.apply(() => (behavior.angle = g as never))}
                />
            )}
        </BehaviorModule>
    );
}

export function CollisionModule({binding}: ModuleProps) {
    // Ensure the shared ground-plane resolver exists before any ApplyCollision is created,
    // otherwise its update() would dereference an undefined resolver.
    const resolver = ensureGroundResolver();
    return (
        <BehaviorModule<ApplyCollision>
            binding={binding}
            title="Collision"
            type="ApplyCollision"
            create={() => new ApplyCollision(ensureGroundResolver(), 0.5)}
        >
            {(behavior) => (
                <>
                    <Row label="Bounce">
                        <NumberField
                            value={behavior.bounce}
                            min={0}
                            step={0.05}
                            onChange={(v) => binding.apply(() => (behavior.bounce = v))}
                        />
                    </Row>
                    <Row label="Floor Y">
                        <NumberField
                            value={resolver.y}
                            step={0.1}
                            onChange={(v) => binding.apply(() => (resolver.y = v))}
                        />
                    </Row>
                    <div style={{fontSize: 11, opacity: 0.6, marginTop: 4}}>
                        Collides against a ground plane. Bounce is saved with the effect; Floor Y is an
                        editor preview aid (a host can register its own colliders).
                    </div>
                </>
            )}
        </BehaviorModule>
    );
}

/** Shared speed-range rows for the "by Speed" trio. */
function SpeedRangeRows({binding, behavior}: {binding: EffectBinding; behavior: {speedRange: IntervalValue}}) {
    return (
        <Row label="Speed range">
            <div style={{display: 'flex', gap: 6}}>
                <NumberField
                    value={behavior.speedRange.a}
                    min={0}
                    onChange={(v) => binding.apply(() => (behavior.speedRange = new IntervalValue(v, behavior.speedRange.b)))}
                />
                <NumberField
                    value={behavior.speedRange.b}
                    min={0}
                    onChange={(v) => binding.apply(() => (behavior.speedRange = new IntervalValue(behavior.speedRange.a, v)))}
                />
            </div>
        </Row>
    );
}

export function ColorBySpeedModule({binding}: ModuleProps) {
    return (
        <BehaviorModule<ColorBySpeed>
            binding={binding}
            title="Color by Speed"
            type="ColorBySpeed"
            create={() => new ColorBySpeed(buildGradient(DEFAULT_GRADIENT_STOPS), new IntervalValue(0, 5))}
        >
            {(behavior) => (
                <>
                    <div style={{marginTop: 6}}>
                        <GradientEditor
                            stops={behavior.color instanceof Gradient ? readGradientStops(behavior.color) : DEFAULT_GRADIENT_STOPS}
                            onChange={(stops) => binding.apply(() => (behavior.color = buildGradient(stops)))}
                        />
                    </div>
                    <SpeedRangeRows binding={binding} behavior={behavior} />
                </>
            )}
        </BehaviorModule>
    );
}

export function SizeBySpeedModule({binding}: ModuleProps) {
    return (
        <BehaviorModule<SizeBySpeed>
            binding={binding}
            title="Size by Speed"
            type="SizeBySpeed"
            create={() => new SizeBySpeed(buildScalar({mode: 'curve', value: 1, min: 0, max: 1, curve: [0.5, 0.8, 1.2, 1.5]}) as never, new IntervalValue(0, 5))}
        >
            {(behavior) => (
                <>
                    <div style={{marginTop: 6}}>
                        <CurveEditor
                            pieces={readPieces(behavior.size as never)}
                            maxValue={2}
                            onChange={(pieces) => binding.apply(() => (behavior.size = buildCurve(pieces) as never))}
                        />
                    </div>
                    <SpeedRangeRows binding={binding} behavior={behavior} />
                </>
            )}
        </BehaviorModule>
    );
}

export function RotationBySpeedModule({binding}: ModuleProps) {
    return (
        <BehaviorModule<RotationBySpeed>
            binding={binding}
            title="Rotation by Speed"
            type="RotationBySpeed"
            create={() => new RotationBySpeed(new ConstantValue(Math.PI), new IntervalValue(0, 5))}
        >
            {(behavior) => (
                <>
                    <ValueField
                        label="Velocity (rad/s)"
                        generator={behavior.angularVelocity}
                        curveMax={Math.PI * 4}
                        onChange={(g) => binding.apply(() => (behavior.angularVelocity = g))}
                    />
                    <SpeedRangeRows binding={binding} behavior={behavior} />
                </>
            )}
        </BehaviorModule>
    );
}

export function OrbitOverLifeModule({binding}: ModuleProps) {
    return (
        <BehaviorModule<OrbitOverLife>
            binding={binding}
            title="Orbit over Lifetime"
            type="OrbitOverLife"
            create={() => new OrbitOverLife(new ConstantValue(Math.PI), new Vector3(0, 1, 0))}
        >
            {(behavior) => (
                <ValueField
                    label="Orbit speed"
                    generator={behavior.orbitSpeed}
                    curveMax={Math.PI * 4}
                    onChange={(g) => binding.apply(() => (behavior.orbitSpeed = g))}
                />
            )}
        </BehaviorModule>
    );
}

export function WidthOverTrailModule({binding}: ModuleProps) {
    return (
        <BehaviorModule<WidthOverLength>
            binding={binding}
            title="Width over Trail"
            type="WidthOverLength"
            create={() => new WidthOverLength(buildScalar({mode: 'curve', value: 1, min: 0, max: 1, curve: [1, 0.75, 0.4, 0]}) as never)}
        >
            {(behavior) => (
                <div style={{marginTop: 6}}>
                    <CurveEditor
                        pieces={readPieces(behavior.width as never)}
                        maxValue={2}
                        onChange={(pieces) => binding.apply(() => (behavior.width = buildCurve(pieces) as never))}
                    />
                </div>
            )}
        </BehaviorModule>
    );
}

export function TextureSheetModule({binding}: ModuleProps) {
    const system = binding.system;
    const frameBehavior = findBehavior<FrameOverLife>(system.behaviors, 'FrameOverLife');
    const tiles = Math.max(1, system.uTileCount * system.vTileCount);
    const textureUrl = (system.texture as {url?: string} | null)?.url;
    const u = Math.max(1, system.uTileCount);
    const v = Math.max(1, system.vTileCount);
    return (
        <ModuleSection title="Texture Sheet Animation" defaultOpen={false}>
            {textureUrl && (
                <div style={{marginTop: 6}}>
                    <div style={{position: 'relative', width: 218, border: '1px solid #2b3761', borderRadius: 6, overflow: 'hidden'}}>
                        <img src={textureUrl} alt="texture atlas" style={{width: '100%', display: 'block'}} />
                        <div
                            style={{
                                position: 'absolute',
                                inset: 0,
                                pointerEvents: 'none',
                                backgroundImage:
                                    `repeating-linear-gradient(to right, rgba(158,185,255,0.55) 0 1px, transparent 1px calc(100% / ${u})),` +
                                    `repeating-linear-gradient(to bottom, rgba(158,185,255,0.55) 0 1px, transparent 1px calc(100% / ${v}))`,
                            }}
                        />
                    </div>
                    <div style={{fontSize: 11, color: '#b7c6ea', marginTop: 3}}>
                        {u} × {v} = {tiles} tiles; frame indices 0–{tiles - 1}
                    </div>
                </div>
            )}
            <Row label="Tiles U">
                <NumberField value={system.uTileCount} min={1} step={1} onChange={(v) => binding.apply((s) => (s.uTileCount = Math.round(v)))} />
            </Row>
            <Row label="Tiles V">
                <NumberField value={system.vTileCount} min={1} step={1} onChange={(v) => binding.apply((s) => (s.vTileCount = Math.round(v)))} />
            </Row>
            <Row label="Blend tiles">
                <input
                    type="checkbox"
                    className="qe-hover"
                    checked={system.blendTiles}
                    style={{justifySelf: 'start', width: 15, height: 15, accentColor: '#78a5ff', cursor: 'pointer'}}
                    onChange={(e) => binding.apply((s) => (s.blendTiles = e.target.checked))}
                />
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
                    className="qe-hover"
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
                        pieces={readPieces(frameBehavior.frame)}
                        maxValue={Math.max(1, tiles - 1)}
                        onChange={(pieces) => binding.apply(() => (frameBehavior.frame = buildCurve(pieces) as never))}
                    />
                </div>
            )}
        </ModuleSection>
    );
}
