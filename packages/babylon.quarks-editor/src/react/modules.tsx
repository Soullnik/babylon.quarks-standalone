import React from 'react';
import {
    ColorOverLife,
    ConstantColor,
    ConstantValue,
    Gradient,
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

export function MainModule({binding}: ModuleProps) {
    const system = binding.system;
    const startColor = system.startColor as ConstantColor;
    const color = startColor instanceof ConstantColor ? startColor.color : new Vector4(1, 1, 1, 1);
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
                <div style={{display: 'flex', gap: 6, alignItems: 'center'}}>
                    <input
                        type="color"
                        value={rgbToHex(color.x, color.y, color.z)}
                        onChange={(e) => {
                            const rgb = hexToRgb(e.target.value);
                            binding.apply((s) => (s.startColor = new ConstantColor(new Vector4(rgb.r, rgb.g, rgb.b, color.w))));
                        }}
                        style={{width: 42, height: 24, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer'}}
                    />
                    <NumberField
                        value={color.w}
                        min={0}
                        step={0.05}
                        onChange={(a) =>
                            binding.apply((s) => (s.startColor = new ConstantColor(new Vector4(color.x, color.y, color.z, Math.min(1, a)))))
                        }
                    />
                </div>
            </Row>
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
                <Row key={i} label={`Burst ${i + 1}`}>
                    <div style={{display: 'flex', gap: 6, alignItems: 'center'}}>
                        <NumberField
                            value={burst.time}
                            min={0}
                            onChange={(time) => binding.apply(() => (burst.time = time))}
                        />
                        <NumberField
                            value={readScalar(burst.count as never).value}
                            min={0}
                            step={1}
                            onChange={(count) => binding.apply(() => (burst.count = new ConstantValue(Math.round(count))))}
                        />
                        <button
                            style={{background: 'none', border: 'none', color: '#e08c8c', cursor: 'pointer', fontSize: 14}}
                            title="Remove burst"
                            onClick={() => binding.apply((s) => s.emissionBursts.splice(i, 1))}
                        >
                            ✕
                        </button>
                    </div>
                </Row>
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
                        value={params[key]}
                        min={0}
                        onChange={(v) => binding.apply((s) => (s.emitterShape = createShape(type, {...params, [key]: v})))}
                    />
                </Row>
            ))}
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
            {textureOptions && textureOptions.length > 0 && resolveTexture && (
                <Row label="Texture">
                    <SelectField
                        value={textureOptions.some((o) => o.url === currentTextureUrl) ? currentTextureUrl : textureOptions[0].url}
                        options={textureOptions.map((o) => ({value: o.url, label: o.label}))}
                        onChange={(url) => binding.apply((s) => (s.texture = resolveTexture(url) as never))}
                    />
                </Row>
            )}
            <Row label="Render order">
                <NumberField value={system.renderOrder} step={1} onChange={(v) => binding.apply((s) => (s.renderOrder = Math.round(v)))} />
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
