import {PlusIcon, XMarkIcon} from '@heroicons/react/24/solid';
import type {Behavior} from 'babylon.quarks';
import {
    ApplyCollision,
    ApplyForce,
    ApplySequences,
    AxisAngleGenerator,
    Bezier,
    ChangeEmitDirection,
    ColorBySpeed,
    ConstantValue,
    EulerGenerator,
    ForceOverLife,
    FrameOverLife,
    Gradient,
    GravityForce,
    InheritVelocity,
    IntervalValue,
    LimitSpeedOverLife,
    Noise,
    OrbitOverLife,
    PiecewiseBezier,
    RandomQuatGenerator,
    Rotation3DOverLife,
    RotationBySpeed,
    RotationOverLife,
    SizeBySpeed,
    SpeedOverLife,
    TextureSequencer,
    TurbulenceField,
    Vector3,
    VelocityOverLife,
    WidthOverLength,
} from 'babylon.quarks';
import React from 'react';
import {EffectBinding} from '../core/binding.js';
import {buildGradient, DEFAULT_GRADIENT_STOPS, findBehavior, readGradientStops} from '../core/colors.js';
import {buildScalar, readScalar} from '../core/values.js';
import {CheckboxField, NumberField, Row, SelectField} from './fields.js';
import {GradientEditor} from './GradientEditor.js';
import {iconStyle} from './icons.js';
import {LifeCurveField} from './LifeCurveField.js';
import type {TextureOption} from './modules.js';
import {ModuleSection, type ModuleProps} from './ModuleSection.js';
import {theme} from './theme.js';
import {ValueField} from './ValueField.js';

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

/** The Speed over Lifetime module (Unity's Speed Modifier): scales speed by a curve over the particle's life. */
export function SpeedOverLifeModule({binding}: ModuleProps) {
    return (
        <BehaviorModule<SpeedOverLife>
            binding={binding}
            title="Speed over Lifetime"
            type="SpeedOverLife"
            create={() =>
                new SpeedOverLife(buildScalar({mode: 'curve', value: 1, min: 0, max: 1, curve: [1, 0.75, 0.5, 0]}))
            }
        >
            {(behavior) => (
                <div style={{marginTop: 6}}>
                    <LifeCurveField
                        generator={behavior.speed}
                        maxValue={2}
                        onChange={(curve) => binding.apply(() => (behavior.speed = curve))}
                    />
                </div>
            )}
        </BehaviorModule>
    );
}

/** The Limit Speed over Lifetime module (Unity's Limit Velocity over Lifetime): caps speed by a curve, with dampening. */
export function LimitSpeedOverLifeModule({binding}: ModuleProps) {
    return (
        <BehaviorModule<LimitSpeedOverLife>
            binding={binding}
            title="Limit Speed over Lifetime"
            type="LimitSpeedOverLife"
            create={() =>
                new LimitSpeedOverLife(buildScalar({mode: 'curve', value: 1, min: 0, max: 1, curve: [4, 2, 1, 1]}), 0.5)
            }
        >
            {(behavior) => (
                <>
                    <div style={{marginTop: 6}}>
                        <LifeCurveField
                            generator={behavior.speed}
                            maxValue={8}
                            onChange={(curve) => binding.apply(() => (behavior.speed = curve))}
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

/** The Force over Lifetime module (Unity's Force over Lifetime): a constant push per axis. */
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
                    <Row label="Space">
                        <SelectField
                            value={behavior.space}
                            options={[
                                {value: 'world', label: 'World'},
                                {value: 'local', label: 'Local'},
                            ]}
                            onChange={(v) => binding.apply(() => (behavior.space = v))}
                        />
                    </Row>
                    <ValueField
                        hintKey="force.x"
                        label="X"
                        generator={behavior.x}
                        curveMax={10}
                        onChange={(g) => binding.apply(() => (behavior.x = g))}
                    />
                    <ValueField
                        hintKey="force.y"
                        label="Y"
                        generator={behavior.y}
                        curveMax={10}
                        onChange={(g) => binding.apply(() => (behavior.y = g))}
                    />
                    <ValueField
                        hintKey="force.z"
                        label="Z"
                        generator={behavior.z}
                        curveMax={10}
                        onChange={(g) => binding.apply(() => (behavior.z = g))}
                    />
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
                    <ValueField
                        label="Linear X"
                        generator={behavior.linearX}
                        curveMax={10}
                        onChange={(g) => binding.apply(() => (behavior.linearX = g))}
                    />
                    <ValueField
                        label="Linear Y"
                        generator={behavior.linearY}
                        curveMax={10}
                        onChange={(g) => binding.apply(() => (behavior.linearY = g))}
                    />
                    <ValueField
                        label="Linear Z"
                        generator={behavior.linearZ}
                        curveMax={10}
                        onChange={(g) => binding.apply(() => (behavior.linearZ = g))}
                    />
                    <ValueField
                        label="Orbital X"
                        generator={behavior.orbitalX}
                        curveMax={Math.PI * 4}
                        onChange={(g) => binding.apply(() => (behavior.orbitalX = g))}
                    />
                    <ValueField
                        label="Orbital Y"
                        generator={behavior.orbitalY}
                        curveMax={Math.PI * 4}
                        onChange={(g) => binding.apply(() => (behavior.orbitalY = g))}
                    />
                    <ValueField
                        label="Orbital Z"
                        generator={behavior.orbitalZ}
                        curveMax={Math.PI * 4}
                        onChange={(g) => binding.apply(() => (behavior.orbitalZ = g))}
                    />
                    <Vector3Row
                        label="Orbital offset"
                        value={behavior.orbitalOffset}
                        onChange={(v) => binding.apply(() => (behavior.orbitalOffset = v))}
                    />
                    <ValueField
                        label="Radial"
                        generator={behavior.radial}
                        curveMax={10}
                        onChange={(g) => binding.apply(() => (behavior.radial = g))}
                    />
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
                    <Row label="Mode" hintKey="inheritVelocity.mode">
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

/** A point attractor (`GravityForce`): particles fall towards a point, harder the nearer they are. */
export function AttractorModule({binding}: ModuleProps) {
    return (
        <BehaviorModule<GravityForce>
            binding={binding}
            title="Attractor"
            type="GravityForce"
            create={() => new GravityForce(new Vector3(0, 0, 0), 1)}
        >
            {(behavior) => (
                <>
                    <Row label="Center" hintKey="attractor.center">
                        <div style={{display: 'flex', gap: 6}}>
                            {(['x', 'y', 'z'] as const).map((axis) => (
                                <NumberField
                                    key={axis}
                                    value={behavior.center[axis]}
                                    step={0.1}
                                    onChange={(v) => binding.apply(() => (behavior.center[axis] = v))}
                                />
                            ))}
                        </div>
                    </Row>
                    <Row label="Strength" hintKey="attractor.magnitude">
                        <NumberField
                            value={behavior.magnitude}
                            step={0.1}
                            onChange={(v) => binding.apply(() => (behavior.magnitude = v))}
                        />
                    </Row>
                </>
            )}
        </BehaviorModule>
    );
}

/** The Gravity module: pulls particles towards a point. */
export function GravityModule({binding}: ModuleProps) {
    return (
        <BehaviorModule<ApplyForce>
            binding={binding}
            title="Gravity"
            type="ApplyForce"
            create={() => new ApplyForce(new Vector3(0, -1, 0), new ConstantValue(9.81))}
        >
            {(behavior) => (
                <>
                    <Row label="Strength" hintKey="gravity.strength">
                        <NumberField
                            value={readScalar(behavior.magnitude).value}
                            step={0.5}
                            onChange={(v) => binding.apply(() => (behavior.magnitude = new ConstantValue(v)))}
                        />
                    </Row>
                    <Row label="Space">
                        <SelectField
                            value={behavior.space}
                            options={[
                                {value: 'world', label: 'World'},
                                {value: 'local', label: 'Local'},
                            ]}
                            onChange={(v) => binding.apply(() => (behavior.space = v))}
                        />
                    </Row>
                </>
            )}
        </BehaviorModule>
    );
}

/** The Rotation over Lifetime module (Unity's Rotation over Lifetime): spin rate over the particle's life. */
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
                    hintKey="rotationOverLife.velocity"
                    label="Velocity (rad/s)"
                    generator={behavior.angularVelocity}
                    curveMax={Math.PI * 4}
                    onChange={(g) => binding.apply(() => (behavior.angularVelocity = g))}
                />
            )}
        </BehaviorModule>
    );
}

/** Turns mesh particles by a 3D angular velocity; billboards turn through Rotation over Lifetime. */
export function Rotation3DOverLifeModule({binding}: ModuleProps) {
    return (
        <BehaviorModule<Rotation3DOverLife>
            binding={binding}
            title="Rotation over Lifetime (3D)"
            type="Rotation3DOverLife"
            create={() =>
                new Rotation3DOverLife(new AxisAngleGenerator(new Vector3(0, 1, 0), new ConstantValue(Math.PI)))
            }
        >
            {(behavior) => {
                const generator = behavior.angularVelocity;
                const mode =
                    generator instanceof AxisAngleGenerator
                        ? 'axisAngle'
                        : generator instanceof EulerGenerator
                          ? 'euler'
                          : 'random';
                const axisAngle = generator instanceof AxisAngleGenerator ? generator : undefined;
                const euler = generator instanceof EulerGenerator ? generator : undefined;
                return (
                    <>
                        <p style={{margin: '2px 0 6px', color: theme.textDim, fontSize: 11.5}}>
                            Mesh particles only; billboards spin with Rotation over Lifetime.
                        </p>
                        <Row label="Mode">
                            <SelectField
                                value={mode}
                                options={[
                                    {value: 'axisAngle', label: 'Axis + angle'},
                                    {value: 'euler', label: 'Per axis'},
                                    {value: 'random', label: 'Random'},
                                ]}
                                onChange={(next) =>
                                    binding.apply(() => {
                                        behavior.angularVelocity =
                                            next === 'axisAngle'
                                                ? new AxisAngleGenerator(
                                                      new Vector3(0, 1, 0),
                                                      new ConstantValue(Math.PI)
                                                  )
                                                : next === 'euler'
                                                  ? new EulerGenerator(
                                                        new ConstantValue(0),
                                                        new ConstantValue(Math.PI),
                                                        new ConstantValue(0)
                                                    )
                                                  : new RandomQuatGenerator();
                                    })
                                }
                            />
                        </Row>
                        {axisAngle && (
                            <>
                                <Vector3Row
                                    label="Axis"
                                    value={axisAngle.axis}
                                    step={0.1}
                                    onChange={(v) =>
                                        binding.apply(
                                            () =>
                                                (behavior.angularVelocity = new AxisAngleGenerator(v, axisAngle.angle))
                                        )
                                    }
                                />
                                <ValueField
                                    label="Angle (rad/s)"
                                    generator={axisAngle.angle}
                                    curveMax={Math.PI * 4}
                                    onChange={(g) =>
                                        binding.apply(
                                            () =>
                                                (behavior.angularVelocity = new AxisAngleGenerator(
                                                    axisAngle.axis.clone(),
                                                    g
                                                ))
                                        )
                                    }
                                />
                            </>
                        )}
                        {euler &&
                            (['angleX', 'angleY', 'angleZ'] as const).map((key) => (
                                <ValueField
                                    key={key}
                                    label={`${key.slice(-1)} (rad/s)`}
                                    generator={euler[key]}
                                    curveMax={Math.PI * 4}
                                    onChange={(g) =>
                                        binding.apply(
                                            () =>
                                                (behavior.angularVelocity = new EulerGenerator(
                                                    key === 'angleX' ? g : euler.angleX,
                                                    key === 'angleY' ? g : euler.angleY,
                                                    key === 'angleZ' ? g : euler.angleZ
                                                ))
                                        )
                                    }
                                />
                            ))}
                    </>
                );
            }}
        </BehaviorModule>
    );
}

/**
 * Moves particles, one after another, onto the opaque pixels of an image (a
 * logo or a word drawn from sparks). Each sequence is read from an image once;
 * its points, scale, position and time window are what gets saved.
 */
export function SequencesModule({binding, textureOptions}: ModuleProps & {textureOptions?: TextureOption[]}) {
    const [imageUrl, setImageUrl] = React.useState(textureOptions?.[0]?.url ?? '');
    const [threshold, setThreshold] = React.useState(0.5);
    const [status, setStatus] = React.useState<string | null>(null);
    const addFromImage = async (behavior: ApplySequences) => {
        if (!imageUrl) {
            setStatus('Pick an image first.');
            return;
        }
        try {
            const image = new Image();
            image.crossOrigin = 'anonymous';
            image.src = imageUrl;
            await image.decode();
            const sequencer = new TextureSequencer(0.05, 0.05, new Vector3());
            sequencer.fromImage(image, threshold);
            const last = behavior.sequencers[behavior.sequencers.length - 1];
            const start = last ? last[0].b : 0;
            binding.apply(() => behavior.appendSequencer(new IntervalValue(start, start + 2), sequencer));
            setStatus(`${sequencer.locations.length} points read.`);
        } catch (error) {
            setStatus(`Could not read the image: ${error instanceof Error ? error.message : String(error)}`);
        }
    };
    const pair = (a: number, b: number, onA: (v: number) => void, onB: (v: number) => void, step: number) => (
        <div style={{display: 'flex', gap: 6}}>
            <NumberField value={a} step={step} onChange={onA} />
            <NumberField value={b} step={step} onChange={onB} />
        </div>
    );
    return (
        <BehaviorModule<ApplySequences>
            binding={binding}
            title="Sequences"
            type="ApplySequences"
            create={() => new ApplySequences(0.001)}
        >
            {(behavior) => (
                <>
                    <p style={{margin: '2px 0 6px', color: theme.textDim, fontSize: 11.5}}>
                        Particles fly, one after another, onto the opaque pixels of an image during each sequence's time
                        window.
                    </p>
                    <Row label="Delay per particle">
                        <NumberField
                            value={behavior.delay}
                            min={0}
                            step={0.001}
                            onChange={(v) => binding.apply(() => (behavior.delay = Math.max(0, v)))}
                        />
                    </Row>
                    {behavior.sequencers.map(([range, sequencer], index) => {
                        const texture = sequencer as TextureSequencer;
                        return (
                            <div
                                key={index}
                                style={{
                                    border: `1px solid ${theme.border}`,
                                    borderRadius: 6,
                                    padding: '4px 6px',
                                    marginTop: 6,
                                }}
                            >
                                <Row label={`Sequence ${index + 1}`}>
                                    <span style={{fontSize: 11.5, color: theme.textDim}}>
                                        {texture.locations?.length ?? 0} points
                                    </span>
                                    <button
                                        className="qe-hover"
                                        style={{
                                            marginLeft: 'auto',
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                        }}
                                        title="Remove sequence"
                                        onClick={() => binding.apply(() => behavior.sequencers.splice(index, 1))}
                                    >
                                        <XMarkIcon style={iconStyle(13)} />
                                    </button>
                                </Row>
                                <Row label="Time from / to (s)">
                                    {pair(
                                        range.a,
                                        range.b,
                                        (v) => binding.apply(() => (range.a = v)),
                                        (v) => binding.apply(() => (range.b = v)),
                                        0.1
                                    )}
                                </Row>
                                {texture.locations !== undefined && (
                                    <>
                                        <Row label="Scale X / Y">
                                            {pair(
                                                texture.scaleX,
                                                texture.scaleY,
                                                (v) => binding.apply(() => (texture.scaleX = v)),
                                                (v) => binding.apply(() => (texture.scaleY = v)),
                                                0.01
                                            )}
                                        </Row>
                                        <Vector3Row
                                            label="Position"
                                            value={texture.position}
                                            step={0.1}
                                            onChange={(v) => binding.apply(() => texture.position.copy(v))}
                                        />
                                    </>
                                )}
                            </div>
                        );
                    })}
                    <Row label="Image">
                        {textureOptions && textureOptions.length > 0 ? (
                            <SelectField
                                value={imageUrl}
                                options={textureOptions.map((option) => ({value: option.url, label: option.label}))}
                                onChange={(url) => setImageUrl(url)}
                            />
                        ) : (
                            <input
                                className="qe-hover"
                                style={{flex: 1, minWidth: 0, fontSize: 12}}
                                placeholder="Image URL"
                                value={imageUrl}
                                onChange={(event) => setImageUrl(event.target.value)}
                            />
                        )}
                    </Row>
                    <Row label="Alpha threshold">
                        <NumberField
                            value={threshold}
                            min={0}
                            step={0.05}
                            onChange={(v) => setThreshold(Math.min(1, v))}
                        />
                    </Row>
                    <button
                        className="qe-hover"
                        style={{display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 12}}
                        onClick={() => void addFromImage(behavior)}
                    >
                        <PlusIcon style={iconStyle(13)} />
                        Add sequence from image
                    </button>
                    {status && <p style={{margin: '4px 0 0', color: theme.textDim, fontSize: 11.5}}>{status}</p>}
                </>
            )}
        </BehaviorModule>
    );
}

/** The Noise module (Unity's Noise): moves and turns particles by a noise field. */
export function NoiseModule({binding}: ModuleProps) {
    return (
        <BehaviorModule<Noise>
            binding={binding}
            title="Noise"
            type="Noise"
            create={() =>
                new Noise(new ConstantValue(1), new ConstantValue(1), new ConstantValue(1), new ConstantValue(0))
            }
        >
            {(behavior) => (
                <>
                    <ValueField
                        hintKey="noise.frequency"
                        label="Frequency"
                        generator={behavior.frequency}
                        min={0}
                        curveMax={10}
                        onChange={(g) => binding.apply(() => (behavior.frequency = g))}
                    />
                    <ValueField
                        hintKey="noise.strength"
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
                    <ValueField
                        label="Scroll speed"
                        generator={behavior.scrollSpeed}
                        curveMax={5}
                        onChange={(g) => binding.apply(() => (behavior.scrollSpeed = g))}
                    />
                    <Row label="Remap">
                        <CheckboxField
                            value={behavior.remap !== undefined}
                            onChange={(v) =>
                                binding.apply(
                                    () =>
                                        (behavior.remap = v
                                            ? new PiecewiseBezier([[new Bezier(-1, -1 / 3, 1 / 3, 1), 0]])
                                            : undefined)
                                )
                            }
                        />
                    </Row>
                    {behavior.remap !== undefined && (
                        <ValueField
                            label="Remap curve"
                            generator={behavior.remap}
                            curveMax={1}
                            onChange={(g) => binding.apply(() => (behavior.remap = g as PiecewiseBezier))}
                        />
                    )}
                </>
            )}
        </BehaviorModule>
    );
}

/** Three numeric inputs for a Vector3 field, replacing the whole vector on any edit. */
function Vector3Row(props: {
    label: string;
    hintKey?: string;
    value: Vector3;
    min?: number;
    step?: number;
    onChange: (v: Vector3) => void;
}) {
    const set = (axis: 'x' | 'y' | 'z', n: number) => {
        const next = props.value.clone();
        next[axis] = n;
        props.onChange(next);
    };
    return (
        <Row label={props.label} hintKey={props.hintKey}>
            <div style={{display: 'flex', gap: 6}}>
                <NumberField value={props.value.x} min={props.min} step={props.step} onChange={(n) => set('x', n)} />
                <NumberField value={props.value.y} min={props.min} step={props.step} onChange={(n) => set('y', n)} />
                <NumberField value={props.value.z} min={props.min} step={props.step} onChange={(n) => set('z', n)} />
            </div>
        </Row>
    );
}

/** The Turbulence module: a curl noise force field. */
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
                    <Vector3Row
                        hintKey="turbulence.scale"
                        label="Scale"
                        value={behavior.scale}
                        min={0.01}
                        step={0.1}
                        onChange={(v) => binding.apply(() => (behavior.scale = v))}
                    />
                    <Row label="Octaves">
                        <NumberField
                            value={behavior.octaves}
                            min={1}
                            step={1}
                            onChange={(v) => binding.apply(() => (behavior.octaves = Math.max(1, Math.round(v))))}
                        />
                    </Row>
                    <Vector3Row
                        hintKey="turbulence.strength"
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
                    {/* The field is built from the seed, so a different seed is a different swirl. */}
                    <Row label="Seed">
                        <NumberField
                            value={behavior.seed}
                            step={1}
                            onChange={(v) =>
                                binding.apply(() => {
                                    const seed = Math.round(v);
                                    const next = new TurbulenceField(
                                        behavior.scale,
                                        behavior.octaves,
                                        behavior.velocityMultiplier,
                                        behavior.timeScale,
                                        seed
                                    );
                                    behavior.seed = seed;
                                    behavior.generator = next.generator;
                                    behavior.initialOffset.copy(next.initialOffset);
                                    behavior.timeOffset.copy(next.initialOffset);
                                })
                            }
                        />
                    </Row>
                </>
            )}
        </BehaviorModule>
    );
}

/** The Randomize Direction module: tilts each particle's start direction by a random angle. */
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
                    generator={behavior.angle}
                    curve={false}
                    min={0}
                    onChange={(g) => binding.apply(() => (behavior.angle = g))}
                />
            )}
        </BehaviorModule>
    );
}

/** The Collision module (Unity's Collision): particles bounce off or die on a ground plane. */
export function CollisionModule({binding}: ModuleProps) {
    // Like Unity: Collision stores bounce only. Colliders are host-provided via
    // setPhysicsResolver, asked when a particle is tested — the editor never invents a ground plane.
    return (
        <BehaviorModule<ApplyCollision>
            binding={binding}
            title="Collision"
            type="ApplyCollision"
            create={() => new ApplyCollision(undefined, 0.5)}
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
                    <div style={{fontSize: 11, opacity: 0.6, marginTop: 4}}>
                        Bounce is saved with the effect. Colliders come from the host (setPhysicsResolver) — without
                        one, Collision is inert.
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
                    onChange={(v) =>
                        binding.apply(() => (behavior.speedRange = new IntervalValue(v, behavior.speedRange.b)))
                    }
                />
                <NumberField
                    value={behavior.speedRange.b}
                    min={0}
                    onChange={(v) =>
                        binding.apply(() => (behavior.speedRange = new IntervalValue(behavior.speedRange.a, v)))
                    }
                />
            </div>
        </Row>
    );
}

/** The Color by Speed module (Unity's Color by Speed): a gradient over a speed range. */
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
                            stops={
                                behavior.color instanceof Gradient
                                    ? readGradientStops(behavior.color)
                                    : DEFAULT_GRADIENT_STOPS
                            }
                            onChange={(stops) => binding.apply(() => (behavior.color = buildGradient(stops)))}
                        />
                    </div>
                    <SpeedRangeRows binding={binding} behavior={behavior} />
                </>
            )}
        </BehaviorModule>
    );
}

/** The Size by Speed module (Unity's Size by Speed): size over a speed range. */
export function SizeBySpeedModule({binding}: ModuleProps) {
    return (
        <BehaviorModule<SizeBySpeed>
            binding={binding}
            title="Size by Speed"
            type="SizeBySpeed"
            create={() =>
                new SizeBySpeed(
                    buildScalar({mode: 'curve', value: 1, min: 0, max: 1, curve: [0.5, 0.8, 1.2, 1.5]}),
                    new IntervalValue(0, 5)
                )
            }
        >
            {(behavior) => (
                <>
                    <div style={{marginTop: 6}}>
                        <LifeCurveField
                            generator={behavior.size}
                            maxValue={2}
                            onChange={(curve) => binding.apply(() => (behavior.size = curve))}
                        />
                    </div>
                    <SpeedRangeRows binding={binding} behavior={behavior} />
                </>
            )}
        </BehaviorModule>
    );
}

/** The Rotation by Speed module (Unity's Rotation by Speed): spin rate over a speed range. */
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
                        hintKey="rotationBySpeed.velocity"
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

/** The Orbit over Lifetime module (Unity's Velocity over Lifetime orbital): turns particles about an axis. */
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

/** The Width over Trail module (Unity's Trails width over trail): a trail's width along its length. */
export function WidthOverTrailModule({binding}: ModuleProps) {
    return (
        <BehaviorModule<WidthOverLength>
            binding={binding}
            title="Width over Trail"
            type="WidthOverLength"
            create={() =>
                new WidthOverLength(buildScalar({mode: 'curve', value: 1, min: 0, max: 1, curve: [1, 0.75, 0.4, 0]}))
            }
        >
            {(behavior) => (
                <>
                    <div style={{marginTop: 6}}>
                        <LifeCurveField
                            generator={behavior.width}
                            maxValue={2}
                            onChange={(curve) => binding.apply(() => (behavior.width = curve))}
                        />
                    </div>
                    {/* Off: the curve multiplies the particle size. On: it is the width in world units (files from 0.21 and earlier). */}
                    <Row label="Absolute width">
                        <CheckboxField
                            value={behavior.absolute}
                            onChange={(v) => binding.apply(() => (behavior.absolute = v))}
                        />
                    </Row>
                </>
            )}
        </BehaviorModule>
    );
}

/** How many of the first frames a start-frame generator picks from: its exclusive upper bound. */
function startFrameCount(startFrame: FrameOverLife['startFrame']): number {
    const state = readScalar(startFrame);
    return Math.round(state.mode === 'random' ? state.max : state.value);
}

/** The Texture Sheet Animation module (Unity's Texture Sheet Animation): plays the sheet's frames by life or by frame rate. */
export function TextureSheetModule({binding}: ModuleProps) {
    const system = binding.system;
    const frameBehavior = findBehavior<FrameOverLife>(system.behaviors, 'FrameOverLife');
    const tiles = Math.max(1, system.uTileCount * system.vTileCount);
    const textureUrl = (system.texture as {url?: string} | null)?.url;
    const u = Math.max(1, system.uTileCount);
    const v = Math.max(1, system.vTileCount);
    // Start tile → cell (row-major, top-left origin — matches the shader's tile UV mapping).
    const startIdx = Math.min(Math.max(0, Math.round(readScalar(system.startTileIndex).value)), tiles - 1);
    const startCol = startIdx % u;
    const startRow = Math.floor(startIdx / u);
    return (
        <ModuleSection title="Texture Sheet Animation" defaultOpen={false}>
            {textureUrl && (
                <div style={{marginTop: 6}}>
                    <div
                        style={{
                            position: 'relative',
                            width: 218,
                            border: '1px solid #2b3761',
                            borderRadius: 6,
                            overflow: 'hidden',
                        }}
                    >
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
                        {/* Highlight the start tile so it's obvious which sprite playback begins on. */}
                        <div
                            style={{
                                position: 'absolute',
                                pointerEvents: 'none',
                                left: `${(startCol * 100) / u}%`,
                                top: `${(startRow * 100) / v}%`,
                                width: `${100 / u}%`,
                                height: `${100 / v}%`,
                                boxSizing: 'border-box',
                                border: '2px solid #ffce6b',
                                background: 'rgba(255, 206, 107, 0.22)',
                            }}
                        >
                            <span
                                style={{
                                    position: 'absolute',
                                    top: 1,
                                    left: 2,
                                    fontSize: 9,
                                    fontWeight: 700,
                                    color: '#ffce6b',
                                    textShadow: '0 0 3px #000',
                                }}
                            >
                                {startIdx}
                            </span>
                        </div>
                    </div>
                    <div style={{fontSize: 11, color: '#b7c6ea', marginTop: 3}}>
                        {u} × {v} = {tiles} tiles; frame indices 0–{tiles - 1}; start tile{' '}
                        <span style={{color: '#ffce6b', fontWeight: 600}}>{startIdx}</span>
                    </div>
                </div>
            )}
            <Row label="Tiles U">
                <NumberField
                    value={system.uTileCount}
                    min={1}
                    step={1}
                    onChange={(v) => binding.apply((s) => (s.uTileCount = Math.round(v)))}
                />
            </Row>
            <Row label="Tiles V">
                <NumberField
                    value={system.vTileCount}
                    min={1}
                    step={1}
                    onChange={(v) => binding.apply((s) => (s.vTileCount = Math.round(v)))}
                />
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
                    value={readScalar(system.startTileIndex).value}
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
                                        buildScalar({
                                            mode: 'curve',
                                            value: 0,
                                            min: 0,
                                            max: tiles - 1,
                                            curve: [0, (tiles - 1) / 3, (2 * (tiles - 1)) / 3, tiles - 1],
                                        })
                                    )
                                );
                            }
                        })
                    }
                />
            </Row>
            {frameBehavior && (
                <>
                    <Row label="Time mode">
                        <SelectField<'life' | 'fps'>
                            value={frameBehavior.fps > 0 ? 'fps' : 'life'}
                            options={[
                                {value: 'life', label: 'Lifetime (curve over life)'},
                                {value: 'fps', label: 'FPS (frame from curve, then by age)'},
                            ]}
                            onChange={(mode) =>
                                binding.apply(() => {
                                    frameBehavior.fps = mode === 'fps' ? 12 : 0;
                                    if (mode === 'fps' && frameBehavior.frameCount <= 0) {
                                        frameBehavior.frameCount = tiles;
                                    }
                                })
                            }
                        />
                    </Row>
                    {frameBehavior.fps > 0 ? (
                        <>
                            <Row label="FPS">
                                <NumberField
                                    value={frameBehavior.fps}
                                    min={0.01}
                                    step={1}
                                    onChange={(v) => binding.apply(() => (frameBehavior.fps = v))}
                                />
                            </Row>
                            <Row label="Loop">
                                <CheckboxField
                                    value={frameBehavior.loop}
                                    onChange={(v) => binding.apply(() => (frameBehavior.loop = v))}
                                />
                            </Row>
                            <Row label="Random frame">
                                <CheckboxField
                                    value={frameBehavior.random}
                                    onChange={(v) => binding.apply(() => (frameBehavior.random = v))}
                                />
                            </Row>
                        </>
                    ) : (
                        <Row label="Cycles">
                            <NumberField
                                value={frameBehavior.cycles}
                                min={0.01}
                                step={1}
                                onChange={(v) => binding.apply(() => (frameBehavior.cycles = v))}
                            />
                        </Row>
                    )}
                    <Row label="Frame count">
                        <NumberField
                            value={frameBehavior.frameCount}
                            min={frameBehavior.fps > 0 || frameBehavior.startFrame ? 1 : 0}
                            max={tiles}
                            step={1}
                            onChange={(v) =>
                                binding.apply(() => (frameBehavior.frameCount = Math.max(0, Math.round(v))))
                            }
                        />
                    </Row>
                    <Row label="Start frame">
                        <CheckboxField
                            value={!!frameBehavior.startFrame}
                            onChange={(v) =>
                                binding.apply(() => {
                                    frameBehavior.startFrame = v ? new IntervalValue(0, tiles) : undefined;
                                    // The offset only wraps into a segment; without one it runs off the sheet.
                                    if (v && frameBehavior.frameCount <= 0) {
                                        frameBehavior.frameCount = tiles;
                                    }
                                })
                            }
                        />
                        {frameBehavior.startFrame && (
                            <NumberField
                                value={startFrameCount(frameBehavior.startFrame)}
                                min={1}
                                max={tiles}
                                step={1}
                                onChange={(v) =>
                                    binding.apply(
                                        () =>
                                            (frameBehavior.startFrame = new IntervalValue(
                                                0,
                                                Math.max(1, Math.round(v))
                                            ))
                                    )
                                }
                            />
                        )}
                    </Row>
                    <div style={{marginTop: 6}}>
                        <LifeCurveField
                            generator={frameBehavior.frame}
                            maxValue={Math.max(1, tiles - 1)}
                            onChange={(curve) => binding.apply(() => (frameBehavior.frame = curve))}
                        />
                    </div>
                </>
            )}
        </ModuleSection>
    );
}
