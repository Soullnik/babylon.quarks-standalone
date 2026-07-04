import React from 'react';
import {
    ColorOverLife,
    ConstantColor,
    ConstantValue,
    Gradient,
    IntervalValue,
    RandomColor,
    RandomQuatGenerator,
    RenderMode,
    SizeOverLife,
    Vector4,
} from 'babylon.quarks';
import type {Behavior, ParticleSystem} from 'babylon.quarks';
import {EffectBinding} from '../core/binding';
import {
    DEFAULT_GRADIENT_STOPS,
    GradientStop,
    buildGradient,
    findBehavior,
    hexToRgb,
    readGradientStops,
    rgbToHex,
} from '../core/colors';
import {DEFAULT_SHAPE_PARAMS, SHAPE_PARAM_KEYS, SHAPE_TYPES, createShape, getShapeType, readShapeParams} from '../core/shapes';
import {buildScalar, readScalar} from '../core/values';
import {CurveEditor} from './CurveEditor';
import {GradientEditor} from './GradientEditor';
import {ModuleSection} from './ModuleSection';
import {CheckboxField, NumberField, Row, SelectField} from './fields';
import {ValueField} from './ValueField';

interface ModuleProps {
    binding: EffectBinding;
}

const MESH_QUAD_POSITIONS = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
const MESH_QUAD_INDICES = new Uint32Array([0, 1, 2, 0, 2, 3]);
const MESH_QUAD_UVS = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
const MESH_CUBE_POSITIONS = new Float32Array([
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
]);
const MESH_CUBE_INDICES = new Uint32Array([
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1,
    3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2,
]);

const PARAM_LABELS: {[key: string]: string} = {
    radius: 'Radius',
    arc: 'Arc',
    thickness: 'Thickness',
    angle: 'Angle',
    donutRadius: 'Donut radius',
    width: 'Width',
    height: 'Height',
};

function ColorInput(props: {value: Vector4; onChange: (next: Vector4) => void}) {
    const {value, onChange} = props;
    return (
        <div style={{display: 'flex', gap: 6, alignItems: 'center'}}>
            <input
                type="color"
                value={rgbToHex(value.x, value.y, value.z)}
                onChange={(e) => {
                    const rgb = hexToRgb(e.target.value);
                    onChange(new Vector4(rgb.r, rgb.g, rgb.b, value.w));
                }}
                style={{width: 42, height: 24, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer'}}
            />
            <NumberField
                value={value.w}
                min={0}
                step={0.05}
                onChange={(a) => onChange(new Vector4(value.x, value.y, value.z, Math.min(1, a)))}
            />
        </div>
    );
}

export function MainModule({binding}: ModuleProps) {
    const system = binding.system;
    const startColor = system.startColor;
    const colorMode = startColor instanceof RandomColor ? 'random' : 'constant';
    const colorA =
        startColor instanceof RandomColor ? (startColor as never as {a: Vector4}).a
        : startColor instanceof ConstantColor ? startColor.color
        : new Vector4(1, 1, 1, 1);
    const colorB = startColor instanceof RandomColor ? (startColor as never as {b: Vector4}).b : new Vector4(1, 0.5, 0.2, 1);
    const rotation = system.startRotation;
    const rotationMode = rotation instanceof RandomQuatGenerator ? '3d' : readScalar(rotation as never).mode === 'random' ? 'random' : 'angle';
    const rotationState = readScalar(rotation instanceof RandomQuatGenerator ? undefined : (rotation as never));
    return (
        <ModuleSection title="Main">
            <Row label="Duration">
                <NumberField value={system.duration} min={0.05} onChange={(v) => binding.apply((s) => (s.duration = v))} />
            </Row>
            <Row label="Looping">
                <CheckboxField value={system.looping} onChange={(v) => binding.apply((s) => (s.looping = v))} />
            </Row>
            <Row label="World space">
                <CheckboxField value={system.worldSpace} onChange={(v) => binding.apply((s) => (s.worldSpace = v))} />
            </Row>
            <Row label="Prewarm">
                <CheckboxField value={system.prewarm} onChange={(v) => binding.apply((s) => (s.prewarm = v))} />
            </Row>
            <ValueField
                label="Start lifetime"
                generator={system.startLife}
                min={0.01}
                curveMax={10}
                onChange={(g) => binding.apply((s) => (s.startLife = g))}
            />
            <ValueField
                label="Start speed"
                generator={system.startSpeed}
                min={0}
                curveMax={20}
                onChange={(g) => binding.apply((s) => (s.startSpeed = g))}
            />
            <ValueField
                label="Start size"
                generator={system.startSize as never}
                min={0}
                curveMax={5}
                onChange={(g) => binding.apply((s) => (s.startSize = g))}
            />
            <Row label="Start color">
                <SelectField
                    value={colorMode}
                    options={[
                        {value: 'constant', label: 'Constant'},
                        {value: 'random', label: 'Random between two'},
                    ]}
                    onChange={(mode) =>
                        binding.apply((s) => {
                            s.startColor = mode === 'random' ? new RandomColor(colorA, colorB) : new ConstantColor(colorA);
                        })
                    }
                />
            </Row>
            <Row label="">
                <ColorInput
                    value={colorA}
                    onChange={(next) =>
                        binding.apply((s) => {
                            s.startColor = colorMode === 'random' ? new RandomColor(next, colorB) : new ConstantColor(next);
                        })
                    }
                />
            </Row>
            {colorMode === 'random' && (
                <Row label="">
                    <ColorInput
                        value={colorB}
                        onChange={(next) => binding.apply((s) => (s.startColor = new RandomColor(colorA, next)))}
                    />
                </Row>
            )}
            <Row label="Start rotation">
                <SelectField
                    value={rotationMode}
                    options={[
                        {value: 'angle', label: 'Angle (rad)'},
                        {value: 'random', label: 'Random angle'},
                        {value: '3d', label: 'Random 3D'},
                    ]}
                    onChange={(mode) =>
                        binding.apply((s) => {
                            s.startRotation =
                                mode === '3d'
                                    ? new RandomQuatGenerator()
                                    : mode === 'random'
                                      ? new IntervalValue(0, Math.PI * 2)
                                      : new ConstantValue(rotationState.value);
                        })
                    }
                />
            </Row>
            {rotationMode === 'angle' && (
                <Row label="">
                    <NumberField
                        value={rotationState.value}
                        step={0.1}
                        onChange={(v) => binding.apply((s) => (s.startRotation = new ConstantValue(v)))}
                    />
                </Row>
            )}
            {rotationMode === 'random' && (
                <Row label="">
                    <div style={{display: 'flex', gap: 6}}>
                        <NumberField
                            value={rotationState.min}
                            step={0.1}
                            onChange={(v) => binding.apply((s) => (s.startRotation = new IntervalValue(v, rotationState.max)))}
                        />
                        <NumberField
                            value={rotationState.max}
                            step={0.1}
                            onChange={(v) => binding.apply((s) => (s.startRotation = new IntervalValue(rotationState.min, v)))}
                        />
                    </div>
                </Row>
            )}
        </ModuleSection>
    );
}

export function EmissionModule({binding}: ModuleProps) {
    const system = binding.system;
    const bursts = system.emissionBursts ?? [];
    return (
        <ModuleSection title="Emission">
            <ValueField
                label="Rate over time"
                generator={system.emissionOverTime}
                min={0}
                curveMax={500}
                onChange={(g) => binding.apply((s) => (s.emissionOverTime = g))}
            />
            {bursts.map((burst, i) => (
                <div key={i} style={{marginTop: 8, padding: '6px 8px', border: '1px solid #22305c', borderRadius: 8}}>
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                        <span style={{fontSize: 11.5, color: '#9eb9ff'}}>Burst {i + 1}</span>
                        <button
                            style={{background: 'none', border: 'none', color: '#e08c8c', cursor: 'pointer', fontSize: 13}}
                            title="Remove burst"
                            onClick={() => binding.apply((s) => s.emissionBursts.splice(i, 1))}
                        >
                            ✕
                        </button>
                    </div>
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4}}>
                        <label style={{fontSize: 10.5, color: '#b7c6ea'}}>
                            Time
                            <NumberField value={burst.time} min={0} onChange={(time) => binding.apply(() => (burst.time = time))} />
                        </label>
                        <label style={{fontSize: 10.5, color: '#b7c6ea'}}>
                            Count
                            <NumberField
                                value={readScalar(burst.count as never).value}
                                min={0}
                                step={1}
                                onChange={(count) => binding.apply(() => (burst.count = new ConstantValue(Math.round(count))))}
                            />
                        </label>
                        <label style={{fontSize: 10.5, color: '#b7c6ea'}}>
                            Cycles
                            <NumberField
                                value={burst.cycle}
                                min={1}
                                step={1}
                                onChange={(v) => binding.apply(() => (burst.cycle = Math.round(v)))}
                            />
                        </label>
                        <label style={{fontSize: 10.5, color: '#b7c6ea'}}>
                            Interval
                            <NumberField value={burst.interval} min={0.01} onChange={(v) => binding.apply(() => (burst.interval = v))} />
                        </label>
                        <label style={{fontSize: 10.5, color: '#b7c6ea'}}>
                            Probability
                            <NumberField
                                value={burst.probability}
                                min={0}
                                step={0.05}
                                onChange={(v) => binding.apply(() => (burst.probability = Math.min(1, v)))}
                            />
                        </label>
                    </div>
                </div>
            ))}
            <button
                style={{marginTop: 8, background: 'none', border: '1px dashed #34477f', color: '#9eb9ff', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12.5}}
                onClick={() =>
                    binding.apply((s) =>
                        s.emissionBursts.push({time: 0, count: new ConstantValue(20), cycle: 1, interval: 0.01, probability: 1})
                    )
                }
            >
                + Add burst
            </button>
        </ModuleSection>
    );
}

export function ShapeModule({binding}: ModuleProps) {
    const system = binding.system;
    const type = getShapeType(system.emitterShape);
    const params = {...DEFAULT_SHAPE_PARAMS, ...readShapeParams(system.emitterShape)};
    const keys = SHAPE_PARAM_KEYS[type];
    return (
        <ModuleSection title="Shape">
            <Row label="Shape">
                <SelectField
                    value={type}
                    options={SHAPE_TYPES}
                    onChange={(next) => binding.apply((s) => (s.emitterShape = createShape(next, params)))}
                />
            </Row>
            {keys.map((key) => (
                <Row key={key} label={PARAM_LABELS[key]}>
                    <NumberField
                        value={params[key] as number}
                        min={0}
                        onChange={(v) => binding.apply((s) => (s.emitterShape = createShape(type, {...params, [key]: v})))}
                    />
                </Row>
            ))}
            {type !== 'point' && (
                <>
                    <Row label="Emit mode">
                        <SelectField
                            value={params.mode}
                            options={[
                                {value: 0, label: 'Random'},
                                {value: 1, label: 'Loop'},
                                {value: 2, label: 'Ping-pong'},
                                {value: 3, label: 'Burst spread'},
                            ]}
                            onChange={(mode) => binding.apply((s) => (s.emitterShape = createShape(type, {...params, mode})))}
                        />
                    </Row>
                    <Row label="Spread">
                        <NumberField
                            value={params.spread}
                            min={0}
                            step={0.05}
                            onChange={(spread) => binding.apply((s) => (s.emitterShape = createShape(type, {...params, spread})))}
                        />
                    </Row>
                </>
            )}
        </ModuleSection>
    );
}

export function SizeOverLifeModule({binding}: ModuleProps) {
    const system = binding.system;
    const behavior = findBehavior<SizeOverLife>(system.behaviors, 'SizeOverLife');
    const curve = behavior ? readScalar(behavior.size as never).curve : ([0.2, 1, 1, 0.4] as [number, number, number, number]);
    return (
        <ModuleSection
            title="Size over Lifetime"
            enabled={!!behavior}
            onToggle={(enabled) =>
                binding.apply((s) => {
                    removeBehavior(s, 'SizeOverLife');
                    if (enabled) {
                        s.addBehavior(new SizeOverLife(buildScalar({mode: 'curve', value: 1, min: 0, max: 1, curve}) as never));
                    }
                })
            }
        >
            <div style={{marginTop: 6}}>
                <CurveEditor
                    curve={curve}
                    maxValue={2}
                    onChange={(next) =>
                        binding.apply((s) => {
                            removeBehavior(s, 'SizeOverLife');
                            s.addBehavior(new SizeOverLife(buildScalar({mode: 'curve', value: 1, min: 0, max: 1, curve: next}) as never));
                        })
                    }
                />
            </div>
        </ModuleSection>
    );
}

export function ColorOverLifeModule({binding}: ModuleProps) {
    const system = binding.system;
    const behavior = findBehavior<ColorOverLife>(system.behaviors, 'ColorOverLife');
    const stops: GradientStop[] =
        behavior && behavior.color instanceof Gradient ? readGradientStops(behavior.color) : DEFAULT_GRADIENT_STOPS;
    const write = (nextStops: GradientStop[]) =>
        binding.apply((s) => {
            removeBehavior(s, 'ColorOverLife');
            s.addBehavior(new ColorOverLife(buildGradient(nextStops)));
        });
    return (
        <ModuleSection
            title="Color over Lifetime"
            enabled={!!behavior}
            onToggle={(enabled) =>
                binding.apply((s) => {
                    removeBehavior(s, 'ColorOverLife');
                    if (enabled) {
                        s.addBehavior(new ColorOverLife(buildGradient(stops)));
                    }
                })
            }
        >
            <div style={{marginTop: 6}}>
                <GradientEditor stops={stops} onChange={write} />
            </div>
        </ModuleSection>
    );
}

export interface TextureOption {
    label: string;
    url: string;
}

export function RendererModule({
    binding,
    textureOptions,
    resolveTexture,
}: ModuleProps & {textureOptions?: TextureOption[]; resolveTexture?: (url: string) => unknown}) {
    const system = binding.system;
    const currentTextureUrl = (system.texture as {url?: string} | null)?.url ?? '';
    return (
        <ModuleSection title="Renderer">
            <Row label="Render mode">
                <SelectField
                    value={system.renderMode}
                    options={[
                        {value: RenderMode.BillBoard, label: 'Billboard'},
                        {value: RenderMode.StretchedBillBoard, label: 'Stretched billboard'},
                        {value: RenderMode.HorizontalBillBoard, label: 'Horizontal billboard'},
                        {value: RenderMode.VerticalBillBoard, label: 'Vertical billboard'},
                        {value: RenderMode.Trail, label: 'Trail'},
                        {value: RenderMode.Mesh, label: 'Mesh'},
                    ]}
                    onChange={(mode) => binding.apply((s) => (s.renderMode = mode))}
                />
            </Row>
            {system.renderMode === RenderMode.Trail && (
                <>
                    <Row label="Trail length">
                        <NumberField
                            value={readScalar((system.rendererEmitterSettings as {startLength?: never}).startLength).value}
                            min={1}
                            step={1}
                            onChange={(v) =>
                                binding.apply((s) => {
                                    (s.rendererEmitterSettings as {startLength?: unknown}).startLength = new ConstantValue(Math.round(v));
                                })
                            }
                        />
                    </Row>
                    <Row label="Follow origin">
                        <CheckboxField
                            value={!!(system.rendererEmitterSettings as {followLocalOrigin?: boolean}).followLocalOrigin}
                            onChange={(v) =>
                                binding.apply((s) => {
                                    (s.rendererEmitterSettings as {followLocalOrigin?: boolean}).followLocalOrigin = v;
                                })
                            }
                        />
                    </Row>
                </>
            )}
            {system.renderMode === RenderMode.StretchedBillBoard && (
                <>
                    <Row label="Speed factor">
                        <NumberField
                            value={(system.rendererEmitterSettings as {speedFactor?: number}).speedFactor ?? 0}
                            step={0.1}
                            onChange={(v) => binding.apply((s) => ((s.rendererEmitterSettings as {speedFactor?: number}).speedFactor = v))}
                        />
                    </Row>
                    <Row label="Length factor">
                        <NumberField
                            value={(system.rendererEmitterSettings as {lengthFactor?: number}).lengthFactor ?? 2}
                            step={0.1}
                            onChange={(v) => binding.apply((s) => ((s.rendererEmitterSettings as {lengthFactor?: number}).lengthFactor = v))}
                        />
                    </Row>
                </>
            )}
            {system.renderMode === RenderMode.Mesh && (
                <Row label="Geometry">
                    <SelectField
                        value={system.instancingGeometry.length === MESH_CUBE_POSITIONS.length ? 'cube' : 'quad'}
                        options={[
                            {value: 'quad', label: 'Quad'},
                            {value: 'cube', label: 'Cube'},
                        ]}
                        onChange={(preset) =>
                            binding.apply((s) => {
                                const settings = s.getRendererSettings();
                                if (preset === 'cube') {
                                    settings.instancingIndices = MESH_CUBE_INDICES;
                                    settings.instancingUVs = undefined;
                                    settings.instancingNormals = undefined;
                                    s.instancingGeometry = MESH_CUBE_POSITIONS;
                                } else {
                                    settings.instancingIndices = MESH_QUAD_INDICES;
                                    settings.instancingUVs = MESH_QUAD_UVS;
                                    s.instancingGeometry = MESH_QUAD_POSITIONS;
                                }
                            })
                        }
                    />
                </Row>
            )}
            <Row label="Blend mode">
                <SelectField
                    value={system.blending}
                    options={[
                        {value: 1, label: 'Additive'},
                        {value: 2, label: 'Alpha blend'},
                        {value: 4, label: 'Multiply'},
                    ]}
                    onChange={(blend) => binding.apply((s) => (s.blending = blend))}
                />
            </Row>
            {resolveTexture && (
                <Row label="Texture">
                    <SelectField
                        value={
                            (textureOptions ?? []).some((o) => o.url === currentTextureUrl)
                                ? currentTextureUrl
                                : currentTextureUrl
                                  ? '__current'
                                  : ((textureOptions ?? [])[0]?.url ?? '__current')
                        }
                        options={[
                            ...(currentTextureUrl && !(textureOptions ?? []).some((o) => o.url === currentTextureUrl)
                                ? [{value: '__current', label: `(current) ${currentTextureUrl.slice(-24)}`}]
                                : []),
                            ...(textureOptions ?? []).map((o) => ({value: o.url, label: o.label})),
                            {value: '__url', label: 'Custom URL…'},
                            {value: '__file', label: 'Load from file…'},
                        ]}
                        onChange={(url) => {
                            if (url === '__current') {
                                return;
                            }
                            if (url === '__url') {
                                const custom = window.prompt('Texture URL', currentTextureUrl);
                                if (custom) {
                                    binding.apply((s) => (s.texture = resolveTexture(custom) as never));
                                }
                                return;
                            }
                            if (url === '__file') {
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.accept = 'image/*';
                                input.onchange = () => {
                                    const file = input.files?.[0];
                                    if (file) {
                                        // Object URLs preview fine but export as blob: — re-point before shipping.
                                        binding.apply((s) => (s.texture = resolveTexture(URL.createObjectURL(file)) as never));
                                    }
                                };
                                input.click();
                                return;
                            }
                            binding.apply((s) => (s.texture = resolveTexture(url) as never));
                        }}
                    />
                </Row>
            )}
            <Row label="Render order">
                <NumberField value={system.renderOrder} step={1} onChange={(v) => binding.apply((s) => (s.renderOrder = Math.round(v)))} />
            </Row>
            <Row label="Soft particles">
                <CheckboxField value={system.softParticles} onChange={(v) => binding.apply((s) => (s.softParticles = v))} />
            </Row>
            {system.softParticles && (
                <Row label="Fade near/far">
                    <div style={{display: 'flex', gap: 6}}>
                        <NumberField value={system.softNearFade} min={0} onChange={(v) => binding.apply((s) => (s.softNearFade = v))} />
                        <NumberField value={system.softFarFade} min={0} onChange={(v) => binding.apply((s) => (s.softFarFade = v))} />
                    </div>
                </Row>
            )}
            <Row label="Alpha test">
                <NumberField
                    value={system.getRendererSettings().materialAlphaTest ?? 0}
                    min={0}
                    step={0.05}
                    onChange={(v) =>
                        binding.apply((s) => {
                            s.getRendererSettings().materialAlphaTest = Math.min(1, v);
                            s.neededToUpdateRender = true;
                        })
                    }
                />
            </Row>
            <Row label="Depth write">
                <CheckboxField
                    value={system.getRendererSettings().materialDepthWrite}
                    onChange={(v) =>
                        binding.apply((s) => {
                            s.getRendererSettings().materialDepthWrite = v;
                            s.neededToUpdateRender = true;
                        })
                    }
                />
            </Row>
            <Row label="Depth test">
                <CheckboxField
                    value={system.getRendererSettings().materialDepthTest}
                    onChange={(v) =>
                        binding.apply((s) => {
                            s.getRendererSettings().materialDepthTest = v;
                            s.neededToUpdateRender = true;
                        })
                    }
                />
            </Row>
        </ModuleSection>
    );
}

function removeBehavior(system: ParticleSystem, type: string): void {
    const behaviors = system.behaviors as Behavior[];
    for (let i = behaviors.length - 1; i >= 0; i--) {
        if ((behaviors[i] as {type?: string}).type === type) {
            behaviors.splice(i, 1);
        }
    }
}
