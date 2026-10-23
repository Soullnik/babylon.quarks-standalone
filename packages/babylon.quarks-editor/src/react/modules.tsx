import {Texture} from '@babylonjs/core/Materials/Textures/texture.js';
import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {PlusIcon, XMarkIcon} from '@heroicons/react/24/solid';
import type {
    Behavior,
    CullingMode,
    GradientMapChannel,
    MeshLighting,
    MeshRim,
    ParticleErosionOptions,
    ParticleSystem,
    ParticleUVDistortionOptions,
    ScalingMode,
    SortMode,
    TrailSettings,
} from 'babylon.quarks';
import {
    AxisAngleGenerator,
    BoxEmitFrom,
    ColorOverLife,
    ColorRange,
    ConstantColor,
    ConstantValue,
    EulerGenerator,
    Gradient,
    IntervalValue,
    RandomColor,
    RandomColorBetweenGradient,
    RandomQuatGenerator,
    RenderMode,
    SizeOverLife,
    Vector2,
    Vector3,
    Vector3Function,
    Vector4,
    normalizeTextureUV,
} from 'babylon.quarks';
import React, {useMemo} from 'react';
import {EffectBinding} from '../core/binding.js';
import {
    DEFAULT_GRADIENT_STOPS,
    GradientStop,
    buildGradient,
    findBehavior,
    hexToRgb,
    readGradientStops,
    rgbToHex,
} from '../core/colors.js';
import {applyRendererMaterial, getMaterialLabel} from '../core/material.js';
import type {ShapeType} from '../core/shapes.js';
import {
    DEFAULT_SHAPE_PARAMS,
    SHAPE_PARAM_KEYS,
    SHAPE_TYPES,
    createShape,
    getShapeType,
    readShapeParams,
} from '../core/shapes.js';
import {buildCurve, buildScalar, readPieces, readScalar} from '../core/values.js';
import {CurveEditor} from './CurveEditor.js';
import {GradientEditor} from './GradientEditor.js';
import {InspectorInfoIcon} from './InspectorInfoIcon.js';
import {ModuleSection} from './ModuleSection.js';
import {TextureSelect} from './TextureSelect.js';
import {TextureUVField} from './TextureUVField.js';
import {ValueField} from './ValueField.js';
import {CheckboxField, NumberField, Row, SelectField} from './fields.js';
import {iconStyle} from './icons.js';
import {theme} from './theme.js';

interface ModuleProps {
    binding: EffectBinding;
}

const MESH_QUAD_POSITIONS = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
const MESH_QUAD_INDICES = new Uint32Array([0, 1, 2, 0, 2, 3]);
const MESH_QUAD_UVS = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
const MESH_CUBE_POSITIONS = new Float32Array([
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5,
    -0.5, 0.5, 0.5,
]);
const MESH_CUBE_INDICES = new Uint32Array([
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2,
]);

function arraysEqual(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

/** Detects whether the current mesh geometry is one of the editor's built-in presets or was imported. */
function detectGeometryPreset(positions: Float32Array): 'cube' | 'quad' | 'custom' {
    if (arraysEqual(positions, MESH_CUBE_POSITIONS)) {
        return 'cube';
    }
    if (arraysEqual(positions, MESH_QUAD_POSITIONS)) {
        return 'quad';
    }
    return 'custom';
}

const PARAM_LABELS: {[key: string]: string} = {
    radius: 'Radius',
    arc: 'Arc',
    thickness: 'Thickness',
    angle: 'Angle',
    donutRadius: 'Donut radius',
    width: 'Width',
    height: 'Height',
    column: 'Columns',
    row: 'Rows',
    depth: 'Depth',
    speed: 'Speed (lengths/s)',
};

/** Uppercase group title inside a module, as the Renderer's "Material" heading. */
function SubHeader(props: {title: string; hint: string}) {
    return (
        <div
            style={{
                marginTop: 10,
                marginBottom: 2,
                fontSize: 11,
                fontWeight: 600,
                color: '#7c8db5',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
            }}
        >
            {props.title}
            <InspectorInfoIcon content={props.hint} size={12} />
        </div>
    );
}

/** Three number inputs editing a Vector3 by value. */
function AxisField(props: {value: Vector3; onChange: (next: Vector3) => void}) {
    return (
        <div style={{display: 'flex', gap: 6}}>
            {(['x', 'y', 'z'] as const).map((axis) => (
                <NumberField
                    key={axis}
                    value={props.value[axis]}
                    step={0.1}
                    onChange={(v) => {
                        const next = props.value.clone();
                        next[axis] = v;
                        props.onChange(next);
                    }}
                />
            ))}
        </div>
    );
}

function ColorInput(props: {value: Vector4; onChange: (next: Vector4) => void}) {
    const {value, onChange} = props;
    return (
        <div style={{display: 'flex', gap: 6, alignItems: 'center'}}>
            <input
                type="color"
                className="qe-hover"
                value={rgbToHex(value.x, value.y, value.z)}
                onChange={(e) => {
                    const rgb = hexToRgb(e.target.value);
                    onChange(new Vector4(rgb.r, rgb.g, rgb.b, value.w));
                }}
                style={{
                    width: 42,
                    height: 24,
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer',
                }}
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
    const colorMode =
        startColor instanceof RandomColor ? 'random' : startColor instanceof ColorRange ? 'range' : 'constant';
    const twoColors = startColor instanceof RandomColor || startColor instanceof ColorRange;
    const colorA = twoColors
        ? (startColor as never as {a: Vector4}).a
        : startColor instanceof ConstantColor
          ? startColor.color
          : new Vector4(1, 1, 1, 1);
    const colorB = twoColors ? (startColor as never as {b: Vector4}).b : new Vector4(1, 0.5, 0.2, 1);
    /** The two-colour generator of the current mode. */
    const makeTwoColors = (a: Vector4, b: Vector4) =>
        colorMode === 'range' ? new ColorRange(a, b) : new RandomColor(a, b);
    const rotation = system.startRotation;
    const isEuler = rotation instanceof EulerGenerator;
    const isAxisAngle = rotation instanceof AxisAngleGenerator;
    const rotationMode =
        rotation instanceof RandomQuatGenerator
            ? '3d'
            : isEuler
              ? 'euler'
              : isAxisAngle
                ? 'axisAngle'
                : readScalar(rotation as never).mode === 'random'
                  ? 'random'
                  : 'angle';
    const rotationState = readScalar(
        rotation instanceof RandomQuatGenerator || isEuler || isAxisAngle ? undefined : (rotation as never)
    );
    const axisAngle = isAxisAngle ? (rotation as AxisAngleGenerator) : undefined;
    const eulerAngles = {
        x: isEuler ? readScalar((rotation as EulerGenerator).angleX as never).value : 0,
        y: isEuler ? readScalar((rotation as EulerGenerator).angleY as never).value : 0,
        z: isEuler ? readScalar((rotation as EulerGenerator).angleZ as never).value : 0,
    };
    const setEulerAxis = (axis: 'x' | 'y' | 'z', v: number) =>
        binding.apply((s) => {
            const cur = s.startRotation as EulerGenerator;
            s.startRotation = new EulerGenerator(
                axis === 'x' ? new ConstantValue(v) : cur.angleX,
                axis === 'y' ? new ConstantValue(v) : cur.angleY,
                axis === 'z' ? new ConstantValue(v) : cur.angleZ
            );
        });
    const startSize = system.startSize as unknown as {type?: string; x?: never; y?: never; z?: never};
    const size3D = startSize.type === 'vec3function';
    const colorGenMode =
        startColor instanceof RandomColorBetweenGradient
            ? 'gradient2'
            : startColor instanceof Gradient
              ? 'gradient'
              : colorMode;
    return (
        <ModuleSection title="Main">
            <Row label="Duration">
                <NumberField
                    value={system.duration}
                    min={0.05}
                    onChange={(v) => binding.apply((s) => (s.duration = v))}
                />
            </Row>
            <Row label="Looping">
                <CheckboxField value={system.looping} onChange={(v) => binding.apply((s) => (s.looping = v))} />
            </Row>
            <Row label="World space">
                <CheckboxField value={system.worldSpace} onChange={(v) => binding.apply((s) => (s.worldSpace = v))} />
            </Row>
            {system.worldSpace && (
                <Row label="Scaling mode">
                    <SelectField<ScalingMode>
                        value={system.scalingMode}
                        options={[
                            {value: 'shape', label: 'Shape (sizes and shape only)'},
                            {value: 'hierarchy', label: 'Hierarchy (motion scales too)'},
                        ]}
                        onChange={(mode) => binding.apply((s) => (s.scalingMode = mode))}
                    />
                </Row>
            )}
            <Row label="Prewarm">
                <CheckboxField value={system.prewarm} onChange={(v) => binding.apply((s) => (s.prewarm = v))} />
            </Row>
            {system.prewarm && (
                <Row label="Warm-up time">
                    <NumberField
                        value={system.prewarmTime}
                        step={0.1}
                        min={0}
                        onChange={(v) => binding.apply((s) => (s.prewarmTime = Math.max(0, v)))}
                    />
                </Row>
            )}
            <Row label="Playback speed">
                <NumberField
                    value={system.playbackSpeed}
                    step={0.1}
                    min={0}
                    onChange={(v) => binding.apply((s) => (s.playbackSpeed = Math.max(0, v)))}
                />
            </Row>
            <Row label="Fixed seed">
                <CheckboxField
                    value={system.seed !== undefined}
                    onChange={(v) => binding.apply((s) => (s.seed = v ? (s.seed ?? 1) : undefined))}
                />
                {system.seed !== undefined && (
                    <NumberField
                        value={system.seed}
                        step={1}
                        min={0}
                        onChange={(v) => binding.apply((s) => (s.seed = Math.max(0, Math.floor(v))))}
                    />
                )}
            </Row>
            <Row label="Off screen">
                <SelectField
                    value={system.cullingMode}
                    options={[
                        {value: 'always', label: 'Always simulate'},
                        {value: 'pause', label: 'Pause'},
                        {value: 'pauseAndCatchUp', label: 'Pause and catch up'},
                    ]}
                    onChange={(mode) => binding.apply((s) => (s.cullingMode = mode as CullingMode))}
                />
            </Row>
            <ValueField
                label="Start delay"
                generator={system.startDelay}
                min={0}
                curveMax={5}
                onChange={(g) =>
                    binding.apply((s) => {
                        s.startDelay = g;
                        s.restart();
                    })
                }
            />
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
            <Row label="Start size">
                <SelectField
                    value={size3D ? '3d' : 'uniform'}
                    options={[
                        {value: 'uniform', label: 'Uniform'},
                        {value: '3d', label: '3D (per axis)'},
                    ]}
                    onChange={(mode) =>
                        binding.apply((s) => {
                            const cur = s.startSize as never as {clone: () => never; x?: never};
                            if (mode === '3d') {
                                // Seed all three axes from the current uniform generator.
                                s.startSize = new Vector3Function(cur.clone(), cur.clone(), cur.clone());
                            } else {
                                // Collapse back to the X-axis generator.
                                s.startSize = (s.startSize as never as {x: never}).x;
                            }
                        })
                    }
                />
            </Row>
            {!size3D && (
                <ValueField
                    label=""
                    generator={system.startSize as never}
                    min={0}
                    curveMax={5}
                    onChange={(g) => binding.apply((s) => (s.startSize = g))}
                />
            )}
            {size3D && (
                <>
                    {(['x', 'y', 'z'] as const).map((axis) => (
                        <ValueField
                            key={axis}
                            label={axis.toUpperCase()}
                            generator={startSize[axis] as never}
                            min={0}
                            curveMax={5}
                            onChange={(g) =>
                                binding.apply((s) => {
                                    const cur = s.startSize as Vector3Function;
                                    s.startSize = new Vector3Function(
                                        axis === 'x' ? (g as never) : cur.x,
                                        axis === 'y' ? (g as never) : cur.y,
                                        axis === 'z' ? (g as never) : cur.z
                                    );
                                })
                            }
                        />
                    ))}
                </>
            )}
            <Row label="Start color">
                <SelectField
                    value={colorGenMode}
                    options={[
                        {value: 'constant', label: 'Constant'},
                        {value: 'random', label: 'Random between two'},
                        {value: 'range', label: 'Blend between two'},
                        {value: 'gradient', label: 'Gradient'},
                        {value: 'gradient2', label: 'Random between gradients'},
                    ]}
                    onChange={(mode) =>
                        binding.apply((s) => {
                            if (mode === 'random') {
                                s.startColor = new RandomColor(colorA, colorB);
                            } else if (mode === 'range') {
                                s.startColor = new ColorRange(colorA, colorB);
                            } else if (mode === 'gradient') {
                                s.startColor = buildGradient(DEFAULT_GRADIENT_STOPS);
                            } else if (mode === 'gradient2') {
                                s.startColor = new RandomColorBetweenGradient(
                                    buildGradient(DEFAULT_GRADIENT_STOPS),
                                    buildGradient(DEFAULT_GRADIENT_STOPS)
                                );
                            } else {
                                s.startColor = new ConstantColor(colorA);
                            }
                        })
                    }
                />
            </Row>
            {(colorGenMode === 'constant' || twoColors) && (
                <Row label="">
                    <ColorInput
                        value={colorA}
                        onChange={(next) =>
                            binding.apply((s) => {
                                s.startColor = twoColors ? makeTwoColors(next, colorB) : new ConstantColor(next);
                            })
                        }
                    />
                </Row>
            )}
            {twoColors && (
                <Row label="">
                    <ColorInput
                        value={colorB}
                        onChange={(next) => binding.apply((s) => (s.startColor = makeTwoColors(colorA, next)))}
                    />
                </Row>
            )}
            {colorGenMode === 'gradient' && (
                <div style={{marginTop: 6}}>
                    <GradientEditor
                        stops={readGradientStops(startColor as Gradient)}
                        onChange={(stops) => binding.apply((s) => (s.startColor = buildGradient(stops)))}
                    />
                </div>
            )}
            {colorGenMode === 'gradient2' && (
                <div style={{marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6}}>
                    <GradientEditor
                        stops={readGradientStops((startColor as RandomColorBetweenGradient).gradient1)}
                        onChange={(stops) =>
                            binding.apply((s) => {
                                const g = s.startColor as RandomColorBetweenGradient;
                                s.startColor = new RandomColorBetweenGradient(buildGradient(stops), g.gradient2);
                            })
                        }
                    />
                    <GradientEditor
                        stops={readGradientStops((startColor as RandomColorBetweenGradient).gradient2)}
                        onChange={(stops) =>
                            binding.apply((s) => {
                                const g = s.startColor as RandomColorBetweenGradient;
                                s.startColor = new RandomColorBetweenGradient(g.gradient1, buildGradient(stops));
                            })
                        }
                    />
                </div>
            )}
            <Row label="Start rotation">
                <SelectField
                    value={rotationMode}
                    options={[
                        {value: 'angle', label: 'Angle (rad)'},
                        {value: 'random', label: 'Random angle'},
                        {value: 'euler', label: '3D (per axis)'},
                        {value: 'axisAngle', label: '3D (axis + angle)'},
                        {value: '3d', label: 'Random 3D'},
                    ]}
                    onChange={(mode) =>
                        binding.apply((s) => {
                            s.startRotation =
                                mode === '3d'
                                    ? new RandomQuatGenerator()
                                    : mode === 'axisAngle'
                                      ? new AxisAngleGenerator(
                                            new Vector3(0, 1, 0),
                                            new ConstantValue(rotationState.value)
                                        )
                                      : mode === 'euler'
                                        ? new EulerGenerator(
                                              new ConstantValue(eulerAngles.x),
                                              new ConstantValue(eulerAngles.y),
                                              new ConstantValue(eulerAngles.z)
                                          )
                                        : mode === 'random'
                                          ? new IntervalValue(0, Math.PI * 2)
                                          : new ConstantValue(rotationState.value);
                        })
                    }
                />
            </Row>
            {rotationMode === 'euler' && (
                <>
                    {(['x', 'y', 'z'] as const).map((axis) => (
                        <Row key={axis} label={`  ${axis.toUpperCase()} (rad)`}>
                            <NumberField value={eulerAngles[axis]} step={0.1} onChange={(v) => setEulerAxis(axis, v)} />
                        </Row>
                    ))}
                </>
            )}
            {axisAngle && (
                <>
                    <Row label="  Axis">
                        <div style={{display: 'flex', gap: 6}}>
                            {(['x', 'y', 'z'] as const).map((axis) => (
                                <NumberField
                                    key={axis}
                                    value={axisAngle.axis[axis]}
                                    step={0.1}
                                    onChange={(v) =>
                                        binding.apply((s) => {
                                            const next = axisAngle.axis.clone();
                                            next[axis] = v;
                                            s.startRotation = new AxisAngleGenerator(next, axisAngle.angle);
                                        })
                                    }
                                />
                            ))}
                        </div>
                    </Row>
                    <ValueField
                        label="  Angle (rad)"
                        generator={axisAngle.angle}
                        curveMax={Math.PI * 2}
                        onChange={(g) =>
                            binding.apply((s) => (s.startRotation = new AxisAngleGenerator(axisAngle.axis.clone(), g)))
                        }
                    />
                </>
            )}
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
                            onChange={(v) =>
                                binding.apply((s) => (s.startRotation = new IntervalValue(v, rotationState.max)))
                            }
                        />
                        <NumberField
                            value={rotationState.max}
                            step={0.1}
                            onChange={(v) =>
                                binding.apply((s) => (s.startRotation = new IntervalValue(rotationState.min, v)))
                            }
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
            <ValueField
                label="Rate over distance"
                generator={system.emissionOverDistance}
                min={0}
                curveMax={50}
                onChange={(g) => binding.apply((s) => (s.emissionOverDistance = g))}
            />
            {bursts.map((burst, i) => (
                <div key={i} style={{marginTop: 8, padding: '6px 8px', border: '1px solid #22305c', borderRadius: 8}}>
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                        <span style={{fontSize: 11.5, color: '#9eb9ff'}}>Burst {i + 1}</span>
                        <button
                            className="qe-hover"
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#e08c8c',
                                cursor: 'pointer',
                                padding: 0,
                                display: 'inline-flex',
                            }}
                            title="Remove burst"
                            onClick={() => binding.apply((s) => s.emissionBursts.splice(i, 1))}
                        >
                            <XMarkIcon style={iconStyle(14)} />
                        </button>
                    </div>
                    <div style={{display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4}}>
                        <Row label="Time">
                            <NumberField
                                value={burst.time}
                                min={0}
                                onChange={(time) => binding.apply(() => (burst.time = time))}
                            />
                        </Row>
                        <Row label="Count">
                            <NumberField
                                value={readScalar(burst.count as never).value}
                                min={0}
                                step={1}
                                onChange={(count) =>
                                    binding.apply(() => (burst.count = new ConstantValue(Math.round(count))))
                                }
                            />
                        </Row>
                        <Row label="Cycles">
                            <NumberField
                                value={burst.cycle}
                                min={1}
                                step={1}
                                onChange={(v) => binding.apply(() => (burst.cycle = Math.round(v)))}
                            />
                        </Row>
                        <Row label="Interval">
                            <NumberField
                                value={burst.interval}
                                min={0.01}
                                onChange={(v) => binding.apply(() => (burst.interval = v))}
                            />
                        </Row>
                        <Row label="Probability">
                            <NumberField
                                value={burst.probability}
                                min={0}
                                step={0.05}
                                onChange={(v) => binding.apply(() => (burst.probability = Math.min(1, v)))}
                            />
                        </Row>
                    </div>
                </div>
            ))}
            <button
                className="qe-hover"
                style={{
                    marginTop: 8,
                    background: 'none',
                    border: '1px dashed #34477f',
                    color: '#9eb9ff',
                    borderRadius: 8,
                    padding: '5px 10px',
                    cursor: 'pointer',
                    fontSize: 12.5,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                }}
                onClick={() =>
                    binding.apply((s) =>
                        s.emissionBursts.push({
                            time: 0,
                            count: new ConstantValue(20),
                            cycle: 1,
                            interval: 0.01,
                            probability: 1,
                        })
                    )
                }
            >
                <PlusIcon style={iconStyle(13)} />
                Add burst
            </button>
        </ModuleSection>
    );
}

// Shapes whose constructor doesn't accept `mode`/`spread` at all — showing those controls
// for them would edit a value the shape silently ignores, just like the old "default to
// first texture" bug: a control that looks live but does nothing.
const SHAPES_WITHOUT_MODE_SPREAD = new Set<ShapeType>(['point', 'grid', 'box', 'mesh_surface']);

export function ShapeModule({binding}: ModuleProps) {
    const system = binding.system;
    const type = getShapeType(system.emitterShape);
    const params = {...DEFAULT_SHAPE_PARAMS, ...readShapeParams(system.emitterShape)};
    const keys = SHAPE_PARAM_KEYS[type];
    const scene = system.emitter.getScene();
    // 'vfxBatch' is the renderer's own internal instancing mesh — never a valid emission source.
    const meshOptions = scene.meshes.filter(
        (m): m is Mesh => m instanceof Mesh && m.name !== 'vfxBatch' && m.getTotalVertices() > 0
    );
    return (
        <ModuleSection title="Shape">
            <Row label="Shape" hintKey="shape.type">
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
                        onChange={(v) =>
                            binding.apply((s) => (s.emitterShape = createShape(type, {...params, [key]: v})))
                        }
                    />
                </Row>
            ))}
            {type === 'mesh_surface' && (
                <Row label="Source mesh">
                    <SelectField
                        value={params.mesh?.uniqueId != null ? String(params.mesh.uniqueId) : '__none'}
                        options={[
                            {value: '__none', label: '(none)'},
                            ...meshOptions.map((m) => ({value: String(m.uniqueId), label: m.name})),
                        ]}
                        onChange={(id) => {
                            const mesh =
                                id === '__none' ? undefined : meshOptions.find((m) => String(m.uniqueId) === id);
                            binding.apply((s) => (s.emitterShape = createShape('mesh_surface', {...params, mesh})));
                        }}
                    />
                </Row>
            )}
            {type === 'box' && (
                <Row label="Emit from">
                    <SelectField
                        value={params.emitFrom}
                        options={[
                            {value: BoxEmitFrom.Volume, label: 'Volume'},
                            {value: BoxEmitFrom.Shell, label: 'Shell (faces)'},
                            {value: BoxEmitFrom.Edge, label: 'Edges'},
                        ]}
                        onChange={(emitFrom) =>
                            binding.apply((s) => (s.emitterShape = createShape(type, {...params, emitFrom})))
                        }
                    />
                </Row>
            )}
            {!SHAPES_WITHOUT_MODE_SPREAD.has(type) && (
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
                            onChange={(mode) =>
                                binding.apply((s) => (s.emitterShape = createShape(type, {...params, mode})))
                            }
                        />
                    </Row>
                    <Row label="Spread">
                        <NumberField
                            value={params.spread}
                            min={0}
                            step={0.05}
                            onChange={(spread) =>
                                binding.apply((s) => (s.emitterShape = createShape(type, {...params, spread})))
                            }
                        />
                    </Row>
                </>
            )}
            <Row label="Align to direction">
                <CheckboxField
                    value={binding.system.alignToDirection}
                    onChange={(v) => binding.apply((s) => (s.alignToDirection = v))}
                />
            </Row>
        </ModuleSection>
    );
}

export function SizeOverLifeModule({binding}: ModuleProps) {
    const system = binding.system;
    const behavior = findBehavior<SizeOverLife>(system.behaviors, 'SizeOverLife');
    const curve = behavior
        ? readScalar(behavior.size as never).curve
        : ([0.2, 1, 1, 0.4] as [number, number, number, number]);
    return (
        <ModuleSection
            title="Size over Lifetime"
            enabled={!!behavior}
            onToggle={(enabled) =>
                binding.apply((s) => {
                    removeBehavior(s, 'SizeOverLife');
                    if (enabled) {
                        s.addBehavior(
                            new SizeOverLife(buildScalar({mode: 'curve', value: 1, min: 0, max: 1, curve}) as never)
                        );
                    }
                })
            }
        >
            <div style={{marginTop: 6}}>
                <CurveEditor
                    pieces={behavior ? readPieces(behavior.size as never) : [{start: 0, p: curve}]}
                    maxValue={2}
                    onChange={(pieces) =>
                        binding.apply((s) => {
                            removeBehavior(s, 'SizeOverLife');
                            s.addBehavior(new SizeOverLife(buildCurve(pieces) as never));
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

/**
 * A host-supplied mesh for the Mesh render mode (e.g. asset meshes from BabylonJS Editor),
 * analogous to TextureOption. The host provides ready vertex buffers; selecting one copies
 * them into the system's instancing geometry.
 */
export interface GeometryOption {
    label: string;
    positions: Float32Array | number[];
    indices?: Uint32Array | number[];
    uvs?: Float32Array | number[];
    /** A second UV set (glTF `TEXCOORD_1`), what textures on UV channel 1 read on the mesh. */
    uvs2?: Float32Array | number[];
    normals?: Float32Array | number[];
}

/** Vertex buffers a host loader (e.g. a GLB importer) returns for the Mesh render mode. */
export type GeometryData = Omit<GeometryOption, 'label'>;

/**
 * Tiny dependency-free wireframe thumbnail of a mesh geometry. Projects positions with a fixed
 * isometric rotation, scales them to fit, and strokes the triangle edges on a 2D canvas — enough
 * for the user to recognise which mesh they picked without spinning up a second Babylon scene.
 */
function MeshPreview({
    positions,
    indices,
    size = 96,
}: {
    positions: Float32Array;
    indices?: ArrayLike<number>;
    size?: number;
}) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || positions.length < 9) {
            return;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }
        const n = positions.length / 3;
        // Fixed iso rotation (yaw ~35°, pitch ~30°) so depth reads clearly.
        const cy = Math.cos(0.6),
            sy = Math.sin(0.6),
            cx = Math.cos(0.52),
            sx = Math.sin(0.52);
        const pts: Array<[number, number]> = [];
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
        for (let i = 0; i < n; i++) {
            const x = positions[i * 3],
                y = positions[i * 3 + 1],
                z = positions[i * 3 + 2];
            const rx = x * cy - z * sy;
            const rz = x * sy + z * cy;
            const ry = y * cx - rz * sx;
            pts.push([rx, ry]);
            if (rx < minX) minX = rx;
            if (rx > maxX) maxX = rx;
            if (ry < minY) minY = ry;
            if (ry > maxY) maxY = ry;
        }
        const pad = 8;
        const span = Math.max(maxX - minX, maxY - minY, 1e-6);
        const scale = (size - pad * 2) / span;
        const ox = pad + (size - pad * 2 - (maxX - minX) * scale) / 2;
        const oy = pad + (size - pad * 2 - (maxY - minY) * scale) / 2;
        const px = (i: number) => ox + (pts[i][0] - minX) * scale;
        // Flip Y so +Y points up on screen.
        const py = (i: number) => size - (oy + (pts[i][1] - minY) * scale);

        ctx.clearRect(0, 0, size, size);
        ctx.strokeStyle = 'rgba(158,185,255,0.85)';
        ctx.lineWidth = 1;
        const edge = (a: number, b: number) => {
            ctx.beginPath();
            ctx.moveTo(px(a), py(a));
            ctx.lineTo(px(b), py(b));
            ctx.stroke();
        };
        const tris = indices && indices.length ? indices.length : n;
        for (let i = 0; i + 2 < tris; i += 3) {
            const a = indices && indices.length ? indices[i] : i;
            const b = indices && indices.length ? indices[i + 1] : i + 1;
            const c = indices && indices.length ? indices[i + 2] : i + 2;
            edge(a, b);
            edge(b, c);
            edge(c, a);
        }
    }, [positions, indices, size]);
    return (
        <canvas
            ref={canvasRef}
            width={size}
            height={size}
            style={{width: size, height: size, border: '1px solid #2b3761', borderRadius: 6, background: '#0c1330'}}
        />
    );
}

export function RendererModule({
    binding,
    textureOptions,
    geometryOptions,
    resolveTexture,
    resolveGeometry,
}: ModuleProps & {
    textureOptions?: TextureOption[];
    geometryOptions?: GeometryOption[];
    resolveTexture?: (url: string) => unknown;
    resolveGeometry?: (file: File) => Promise<GeometryData>;
}) {
    const system = binding.system;
    const materialLabel = getMaterialLabel(system.material);
    const isMesh = system.renderMode === RenderMode.Mesh;
    const gradientMap = system.gradientMap;
    const erosion = system.erosion;
    const distortion = system.uvDistortion;
    const patchErosion = (patch: ParticleErosionOptions) =>
        binding.apply((s) => (s.erosion = {...s.erosion, ...patch}));
    const patchDistortion = (patch: ParticleUVDistortionOptions) =>
        binding.apply((s) => (s.uvDistortion = {...s.uvDistortion, ...patch}));
    const loadTexture = useMemo(() => {
        return (url: string) => {
            if (resolveTexture) {
                return resolveTexture(url);
            }
            const scene = system.emitter.getScene();
            return scene ? new Texture(url, scene) : null;
        };
    }, [resolveTexture, system]);
    const patchMaterial = (patch: Parameters<typeof applyRendererMaterial>[1]) => {
        binding.apply((s) => applyRendererMaterial(s, patch));
    };
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
                        {value: RenderMode.Beam, label: 'Beam (end set in code)'},
                    ]}
                    onChange={(mode) => binding.apply((s) => (s.renderMode = mode))}
                />
            </Row>
            {system.renderMode === RenderMode.Trail && (
                <>
                    <Row label="Trail length">
                        <NumberField
                            value={
                                readScalar((system.rendererEmitterSettings as {startLength?: never}).startLength).value
                            }
                            min={1}
                            step={1}
                            onChange={(v) =>
                                binding.apply((s) => {
                                    (s.rendererEmitterSettings as {startLength?: unknown}).startLength =
                                        new ConstantValue(Math.round(v));
                                })
                            }
                        />
                    </Row>
                    <Row label="Follow origin">
                        <CheckboxField
                            value={
                                !!(system.rendererEmitterSettings as {followLocalOrigin?: boolean}).followLocalOrigin
                            }
                            onChange={(v) =>
                                binding.apply((s) => {
                                    (s.rendererEmitterSettings as {followLocalOrigin?: boolean}).followLocalOrigin = v;
                                })
                            }
                        />
                    </Row>
                    {(
                        [
                            ['recordWorldSpace', 'Record in world space'],
                            ['uvFromHead', 'UV from head'],
                            ['colorFromParticle', 'Color from particle'],
                            ['dieWithParticle', 'Die with particle'],
                        ] as const
                    ).map(([key, label]) => (
                        <Row key={key} label={label}>
                            <CheckboxField
                                value={!!(system.rendererEmitterSettings as Record<string, unknown>)[key]}
                                onChange={(v) =>
                                    binding.apply((s) => {
                                        (s.rendererEmitterSettings as Record<string, unknown>)[key] = v;
                                    })
                                }
                            />
                        </Row>
                    ))}
                    <Row label="Tessellation">
                        <NumberField
                            value={(system.rendererEmitterSettings as {tessellation?: number}).tessellation ?? 0}
                            min={0}
                            max={16}
                            step={1}
                            onChange={(v) =>
                                binding.apply((s) => {
                                    (s.rendererEmitterSettings as {tessellation?: number}).tessellation = Math.round(v);
                                })
                            }
                        />
                    </Row>
                    <Row label="Curve tension">
                        <NumberField
                            value={(system.rendererEmitterSettings as {curveTension?: number}).curveTension ?? 0}
                            min={0}
                            max={1}
                            step={0.05}
                            onChange={(v) =>
                                binding.apply((s) => {
                                    (s.rendererEmitterSettings as {curveTension?: number}).curveTension = v;
                                })
                            }
                        />
                    </Row>
                    <Row label="Texture mode">
                        <SelectField
                            value={(system.rendererEmitterSettings as TrailSettings).textureMode ?? 'stretch'}
                            options={[
                                {value: 'stretch', label: 'Stretch (once, by distance)'},
                                {value: 'distributePerSegment', label: 'Distribute per segment'},
                                {value: 'tile', label: 'Tile (per world unit)'},
                                {value: 'repeatPerSegment', label: 'Repeat per segment'},
                            ]}
                            onChange={(mode) =>
                                binding.apply((s) => {
                                    (s.rendererEmitterSettings as TrailSettings).textureMode =
                                        mode === 'stretch' ? undefined : mode;
                                })
                            }
                        />
                    </Row>
                    <Row label="Texture scale">
                        <NumberField
                            value={(system.rendererEmitterSettings as TrailSettings).textureScale ?? 1}
                            min={0.01}
                            step={0.1}
                            onChange={(v) =>
                                binding.apply((s) => {
                                    (s.rendererEmitterSettings as TrailSettings).textureScale = v === 1 ? undefined : v;
                                })
                            }
                        />
                    </Row>
                    <Row label="Min vertex distance">
                        <NumberField
                            value={(system.rendererEmitterSettings as TrailSettings).minVertexDistance ?? 0}
                            min={0}
                            step={0.05}
                            onChange={(v) =>
                                binding.apply((s) => {
                                    (s.rendererEmitterSettings as TrailSettings).minVertexDistance =
                                        v > 0 ? v : undefined;
                                })
                            }
                        />
                    </Row>
                    <Row label="Trail time">
                        <NumberField
                            value={(system.rendererEmitterSettings as TrailSettings).lifetime ?? 0}
                            min={0}
                            step={0.1}
                            onChange={(v) =>
                                binding.apply((s) => {
                                    (s.rendererEmitterSettings as TrailSettings).lifetime = v > 0 ? v : undefined;
                                })
                            }
                        />
                    </Row>
                    <Row label="Swept trail">
                        <CheckboxField
                            value={!!(system.rendererEmitterSettings as TrailSettings).sideAxis}
                            onChange={(v) =>
                                binding.apply((s) => {
                                    (s.rendererEmitterSettings as TrailSettings).sideAxis = v
                                        ? new Vector3(0, 1, 0)
                                        : undefined;
                                })
                            }
                        />
                    </Row>
                    {(system.rendererEmitterSettings as TrailSettings).sideAxis && (
                        <Row label="Side axis">
                            <AxisField
                                value={(system.rendererEmitterSettings as TrailSettings).sideAxis!}
                                onChange={(axis) =>
                                    binding.apply((s) => {
                                        // The axis's length scales the width: keep it a unit vector.
                                        (s.rendererEmitterSettings as TrailSettings).sideAxis =
                                            axis.length() > 0 ? axis.normalize() : axis;
                                    })
                                }
                            />
                        </Row>
                    )}
                </>
            )}
            {system.renderMode === RenderMode.StretchedBillBoard && (
                <>
                    <Row label="Speed factor">
                        <NumberField
                            value={(system.rendererEmitterSettings as {speedFactor?: number}).speedFactor ?? 0}
                            step={0.1}
                            onChange={(v) =>
                                binding.apply(
                                    (s) => ((s.rendererEmitterSettings as {speedFactor?: number}).speedFactor = v)
                                )
                            }
                        />
                    </Row>
                    <Row label="Length factor">
                        <NumberField
                            value={(system.rendererEmitterSettings as {lengthFactor?: number}).lengthFactor ?? 2}
                            step={0.1}
                            onChange={(v) =>
                                binding.apply(
                                    (s) => ((s.rendererEmitterSettings as {lengthFactor?: number}).lengthFactor = v)
                                )
                            }
                        />
                    </Row>
                </>
            )}
            <SubHeader title="Material" hint="Shader and blending settings applied to the particle sprite or mesh." />
            {materialLabel ? (
                <Row label="Source">
                    <div style={{fontSize: 12, color: theme.textDim, lineHeight: 1.45}}>{materialLabel}</div>
                </Row>
            ) : null}
            <Row label="Blend mode">
                <SelectField
                    value={system.blending}
                    options={[
                        {value: 1, label: 'Additive'},
                        {value: 2, label: 'Alpha blend'},
                        {value: 3, label: 'Subtract'},
                        {value: 4, label: 'Multiply'},
                    ]}
                    onChange={(blend) => patchMaterial({blendMode: blend})}
                />
            </Row>
            <Row label="Transparent">
                <CheckboxField
                    value={!!system.getRendererSettings().materialTransparent}
                    onChange={(v) => patchMaterial({transparent: v})}
                />
            </Row>
            <Row label="Texture">
                <TextureSelect
                    value={system.texture}
                    textureOptions={textureOptions}
                    loadTexture={loadTexture}
                    onChange={(texture) => patchMaterial({texture})}
                    preview
                />
            </Row>
            <TextureUVField
                labelPrefix="Map "
                value={system.mapUV ?? normalizeTextureUV(undefined)}
                onChange={(uv) => binding.apply((s) => (s.mapUV = uv))}
            />
            {!isMesh && (
                <Row label="Flip U/V">
                    <div style={{display: 'flex', gap: 6}}>
                        {(['x', 'y'] as const).map((axis) => (
                            <NumberField
                                key={axis}
                                value={system.flip?.[axis] ?? 0}
                                min={0}
                                max={1}
                                step={0.1}
                                onChange={(v) =>
                                    binding.apply((s) => {
                                        const next = s.flip?.clone() ?? new Vector2(0, 0);
                                        next[axis] = Math.min(1, Math.max(0, v));
                                        s.flip = next.x === 0 && next.y === 0 ? undefined : next;
                                    })
                                }
                            />
                        ))}
                    </div>
                </Row>
            )}
            <Row label="Alpha test">
                <NumberField
                    value={system.getRendererSettings().materialAlphaTest ?? 0}
                    min={0}
                    step={0.05}
                    onChange={(v) => patchMaterial({alphaTest: Math.min(1, v)})}
                />
            </Row>
            <Row label="Depth write">
                <CheckboxField
                    value={system.getRendererSettings().materialDepthWrite}
                    onChange={(v) => patchMaterial({depthWrite: v})}
                />
            </Row>
            <Row label="Depth test">
                <CheckboxField
                    value={system.getRendererSettings().materialDepthTest}
                    onChange={(v) => patchMaterial({depthTest: v})}
                />
            </Row>
            <SubHeader
                title="Gradient map"
                hint="Recolours the map through a colour ramp: one channel of the map, or its luminance, picks a colour along the ramp."
            />
            <Row label="Ramp">
                <TextureSelect
                    value={gradientMap?.ramp}
                    textureOptions={textureOptions}
                    loadTexture={loadTexture}
                    promptTitle="Ramp texture URL"
                    onChange={(ramp) =>
                        binding.apply((s) => (s.gradientMap = ramp ? {...s.gradientMap, ramp} : undefined))
                    }
                />
            </Row>
            {gradientMap && (
                <Row label="Ramp channel">
                    <SelectField<GradientMapChannel>
                        value={gradientMap.channel}
                        options={[
                            {value: 'r', label: 'Red'},
                            {value: 'g', label: 'Green'},
                            {value: 'b', label: 'Blue'},
                            {value: 'a', label: 'Alpha (ramp alpha replaces)'},
                            {value: 'luminance', label: 'Luminance'},
                        ]}
                        onChange={(channel) => binding.apply((s) => (s.gradientMap = {...s.gradientMap, channel}))}
                    />
                </Row>
            )}
            <SubHeader
                title="Erosion"
                hint="Alpha decides how much of the shape is left instead of how transparent it is, so a fading alpha dissolves or wipes the shape away."
            />
            <Row label="Erosion">
                <CheckboxField
                    value={!!erosion}
                    onChange={(v) => binding.apply((s) => (s.erosion = v ? {} : undefined))}
                />
            </Row>
            {erosion && (
                <>
                    <Row label="Erosion mask">
                        <TextureSelect
                            value={erosion.mask}
                            textureOptions={textureOptions}
                            loadTexture={loadTexture}
                            noneLabel="(map alpha)"
                            promptTitle="Erosion mask URL"
                            onChange={(mask) => patchErosion({mask})}
                        />
                    </Row>
                    {erosion.mask && (
                        <TextureUVField
                            labelPrefix="Mask "
                            value={erosion.maskUV}
                            onChange={(maskUV) => patchErosion({maskUV})}
                        />
                    )}
                    <Row label="Softness">
                        <NumberField
                            value={erosion.softness}
                            min={0.0001}
                            step={0.01}
                            onChange={(softness) => patchErosion({softness})}
                        />
                    </Row>
                    <Row label="Edge width">
                        <NumberField
                            value={erosion.edgeWidth}
                            min={0}
                            step={0.01}
                            onChange={(edgeWidth) => patchErosion({edgeWidth})}
                        />
                    </Row>
                    {(erosion.edgeWidth > 0 || erosion.edgeColor.some((c) => c !== 1)) && (
                        <Row label="Edge color">
                            <div style={{display: 'flex', gap: 6}}>
                                {[0, 1, 2].map((channel) => (
                                    <NumberField
                                        key={channel}
                                        value={erosion.edgeColor[channel]}
                                        min={0}
                                        step={0.05}
                                        onChange={(v) => {
                                            const edgeColor: [number, number, number] = [...erosion.edgeColor];
                                            edgeColor[channel] = v;
                                            patchErosion({edgeColor});
                                        }}
                                    />
                                ))}
                            </div>
                        </Row>
                    )}
                </>
            )}
            <SubHeader
                title="UV distortion"
                hint="A scrolling noise texture pushes the map's UV about, for heat shimmer and licking, breathing shapes."
            />
            <Row label="Noise texture">
                <TextureSelect
                    value={distortion?.map}
                    textureOptions={textureOptions}
                    loadTexture={loadTexture}
                    promptTitle="Distortion noise URL"
                    onChange={(map) =>
                        binding.apply((s) => (s.uvDistortion = map ? {...s.uvDistortion, map} : undefined))
                    }
                />
            </Row>
            {distortion && (
                <>
                    <Row label="Distortion strength">
                        <NumberField
                            value={distortion.strength}
                            min={0}
                            step={0.01}
                            onChange={(strength) => patchDistortion({strength})}
                        />
                    </Row>
                    <TextureUVField
                        labelPrefix="Noise "
                        value={distortion.mapUV}
                        onChange={(mapUV) => patchDistortion({mapUV})}
                    />
                </>
            )}
            {system.renderMode === RenderMode.Mesh &&
                (() => {
                    const preset = detectGeometryPreset(system.instancingGeometry);
                    const vertexCount = system.instancingGeometry.length / 3;
                    const triangleCount = (system.getRendererSettings().instancingIndices?.length ?? 0) / 3;
                    const hostGeometry = geometryOptions ?? [];
                    const applyGeometry = (g: GeometryData) =>
                        binding.apply((s) => {
                            const settings = s.getRendererSettings();
                            // Positions first: the setter keeps or drops the other sets by vertex count.
                            s.instancingGeometry = new Float32Array(g.positions);
                            settings.instancingIndices = (g.indices ? new Uint32Array(g.indices) : undefined) as never;
                            settings.instancingUVs = (g.uvs ? new Float32Array(g.uvs) : undefined) as never;
                            settings.instancingUVs2 = (g.uvs2 ? new Float32Array(g.uvs2) : undefined) as never;
                            settings.instancingNormals = (g.normals ? new Float32Array(g.normals) : undefined) as never;
                        });
                    return (
                        <Row label="Geometry">
                            <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                                <SelectField<string>
                                    value={preset}
                                    options={[
                                        ...(preset === 'custom' ? [{value: 'custom', label: 'Custom (imported)'}] : []),
                                        {value: 'quad', label: 'Quad'},
                                        {value: 'cube', label: 'Cube'},
                                        ...hostGeometry.map((g, i) => ({value: `host:${i}`, label: g.label})),
                                        ...(resolveGeometry ? [{value: '__file', label: 'Load from file…'}] : []),
                                    ]}
                                    onChange={(next) => {
                                        if (next === 'custom') {
                                            return;
                                        }
                                        if (next === '__file') {
                                            const input = document.createElement('input');
                                            input.type = 'file';
                                            input.accept = '.glb,.gltf,model/gltf-binary,model/gltf+json';
                                            input.onchange = () => {
                                                const file = input.files?.[0];
                                                if (file) {
                                                    resolveGeometry!(file).then(applyGeometry);
                                                }
                                            };
                                            input.click();
                                            return;
                                        }
                                        if (next.startsWith('host:')) {
                                            applyGeometry(hostGeometry[Number(next.slice(5))]);
                                            return;
                                        }
                                        binding.apply((s) => {
                                            const settings = s.getRendererSettings();
                                            settings.instancingUVs2 = undefined;
                                            if (next === 'cube') {
                                                settings.instancingIndices = MESH_CUBE_INDICES;
                                                settings.instancingUVs = undefined;
                                                settings.instancingNormals = undefined;
                                                s.instancingGeometry = MESH_CUBE_POSITIONS;
                                            } else {
                                                settings.instancingIndices = MESH_QUAD_INDICES;
                                                settings.instancingUVs = MESH_QUAD_UVS;
                                                s.instancingGeometry = MESH_QUAD_POSITIONS;
                                            }
                                        });
                                    }}
                                />
                                <MeshPreview
                                    positions={system.instancingGeometry}
                                    indices={system.getRendererSettings().instancingIndices}
                                />
                                {preset === 'custom' && (
                                    <span style={{fontSize: 10.5, color: '#9eb9ff'}}>
                                        {vertexCount} verts / {triangleCount} tris
                                        {system.getRendererSettings().instancingUVs2 ? ' / 2 UV sets' : ''} — picking a
                                        preset replaces this mesh
                                    </span>
                                )}
                            </div>
                        </Row>
                    );
                })()}
            {system.renderMode === RenderMode.Mesh && (
                <Row label="Lighting">
                    <SelectField<MeshLighting>
                        value={system.lighting}
                        options={[
                            {value: 'fixed', label: 'Fixed light'},
                            {value: 'scene', label: 'Scene light'},
                            {value: 'unlit', label: 'Unlit'},
                        ]}
                        onChange={(v) => binding.apply((s) => (s.lighting = v))}
                    />
                </Row>
            )}
            {system.renderMode === RenderMode.Mesh && (
                <Row label="Rim">
                    <CheckboxField
                        value={!!system.rim}
                        onChange={(v) => binding.apply((s) => (s.rim = v ? {} : undefined))}
                    />
                </Row>
            )}
            {system.renderMode === RenderMode.Mesh &&
                system.rim &&
                (() => {
                    const rim = system.rim;
                    const patchRim = (patch: Partial<MeshRim>) => binding.apply((s) => (s.rim = {...s.rim, ...patch}));
                    const setChannel = (channel: number, value: number) => {
                        const color: [number, number, number] = [...rim.color];
                        color[channel] = value;
                        patchRim({color});
                    };
                    return (
                        <>
                            <Row label="Rim mode">
                                <SelectField<MeshRim['mode']>
                                    value={rim.mode}
                                    options={[
                                        {value: 'add', label: 'Add (glow)'},
                                        {value: 'mix', label: 'Mix (outline)'},
                                        {value: 'fade', label: 'Fade (faces fade, edges stay)'},
                                    ]}
                                    onChange={(mode) => patchRim({mode})}
                                />
                            </Row>
                            <Row label="Rim color">
                                <div style={{display: 'flex', gap: 6}}>
                                    {[0, 1, 2].map((channel) => (
                                        <NumberField
                                            key={channel}
                                            value={rim.color[channel]}
                                            min={0}
                                            step={0.05}
                                            onChange={(v) => setChannel(channel, v)}
                                        />
                                    ))}
                                </div>
                            </Row>
                            <Row label="Rim power">
                                <NumberField
                                    value={rim.power}
                                    min={0.01}
                                    step={0.25}
                                    onChange={(power) => patchRim({power})}
                                />
                            </Row>
                            <Row label="Rim strength">
                                <NumberField
                                    value={rim.strength}
                                    min={0}
                                    step={0.05}
                                    onChange={(strength) => patchRim({strength})}
                                />
                            </Row>
                        </>
                    );
                })()}
            <Row label="Render order">
                <NumberField
                    value={system.renderOrder}
                    step={1}
                    onChange={(v) => binding.apply((s) => (s.renderOrder = Math.round(v)))}
                />
            </Row>
            <Row label="Rendering group">
                <NumberField
                    value={system.renderingGroupId}
                    step={1}
                    min={0}
                    onChange={(v) => binding.apply((s) => (s.renderingGroupId = Math.max(0, Math.round(v))))}
                />
            </Row>
            <Row label="Layer mask">
                <NumberField
                    value={system.layers.mask}
                    min={0}
                    step={1}
                    onChange={(v) => binding.apply((s) => (s.layers.mask = Math.max(0, Math.floor(v))))}
                />
            </Row>
            <Row label="Max particles">
                <CheckboxField
                    value={system.maxParticles !== undefined}
                    onChange={(v) => binding.apply((s) => (s.maxParticles = v ? 1000 : undefined))}
                />
                {system.maxParticles !== undefined && (
                    <NumberField
                        value={system.maxParticles}
                        min={1}
                        step={10}
                        onChange={(v) => binding.apply((s) => (s.maxParticles = Math.max(1, Math.floor(v))))}
                    />
                )}
            </Row>
            {system.renderMode !== RenderMode.Mesh && system.renderMode !== RenderMode.Trail && (
                <Row label="Pivot">
                    <div style={{display: 'flex', gap: 6}}>
                        {(['x', 'y', 'z'] as const).map((axis) => (
                            <NumberField
                                key={axis}
                                value={system.pivot?.[axis] ?? 0}
                                step={0.05}
                                onChange={(v) =>
                                    binding.apply((s) => {
                                        const next = (s.pivot ?? new Vector3()).clone();
                                        next[axis] = v;
                                        s.pivot = next;
                                    })
                                }
                            />
                        ))}
                    </div>
                </Row>
            )}
            {system.renderMode === RenderMode.Mesh && (
                <>
                    <Row label="Env map atlas">
                        <SelectField
                            value={(system.getRendererSettings().reflectionAtlas as {url?: string} | null)?.url ?? ''}
                            options={[
                                {value: '', label: 'None'},
                                ...(textureOptions ?? []).map((option) => ({value: option.url, label: option.label})),
                            ]}
                            onChange={(url) => patchMaterial({reflectionAtlas: url ? loadTexture(url) : null})}
                        />
                    </Row>
                    <Row label="Reflection level">
                        <NumberField
                            value={system.getRendererSettings().reflectionLevel ?? 1}
                            min={0}
                            step={0.1}
                            onChange={(v) => patchMaterial({reflectionLevel: Math.max(0, v)})}
                        />
                    </Row>
                </>
            )}
            <Row label="Sort mode">
                <SelectField
                    value={system.sortMode}
                    options={[
                        {value: 'none', label: 'None'},
                        {value: 'distance', label: 'By distance'},
                        {value: 'oldestInFront', label: 'Oldest in front'},
                        {value: 'youngestInFront', label: 'Youngest in front'},
                    ]}
                    onChange={(mode) => binding.apply((s) => (s.sortMode = mode as SortMode))}
                />
            </Row>
            <Row label="Limit screen size">
                <CheckboxField
                    value={system.minParticleSize > 0 || system.maxParticleSize !== Infinity}
                    onChange={(v) =>
                        binding.apply((s) => {
                            s.minParticleSize = 0;
                            s.maxParticleSize = v ? 0.5 : Infinity;
                        })
                    }
                />
            </Row>
            {(system.minParticleSize > 0 || system.maxParticleSize !== Infinity) && (
                <>
                    <Row label="Min size (viewport)">
                        <NumberField
                            value={system.minParticleSize}
                            step={0.01}
                            min={0}
                            onChange={(v) => binding.apply((s) => (s.minParticleSize = Math.max(0, v)))}
                        />
                    </Row>
                    <Row label="Max size (viewport)">
                        <NumberField
                            value={system.maxParticleSize === Infinity ? 0 : system.maxParticleSize}
                            step={0.05}
                            min={0}
                            onChange={(v) => binding.apply((s) => (s.maxParticleSize = v > 0 ? v : Infinity))}
                        />
                    </Row>
                </>
            )}
            <Row label="Apply fog">
                <CheckboxField value={system.applyFog} onChange={(v) => binding.apply((s) => (s.applyFog = v))} />
            </Row>
            <Row label="Soft particles">
                <CheckboxField
                    value={system.softParticles}
                    onChange={(v) => binding.apply((s) => (s.softParticles = v))}
                />
            </Row>
            {system.softParticles && (
                <Row label="Fade near/far">
                    <div style={{display: 'flex', gap: 6}}>
                        <NumberField
                            value={system.softNearFade}
                            min={0}
                            onChange={(v) => binding.apply((s) => (s.softNearFade = v))}
                        />
                        <NumberField
                            value={system.softFarFade}
                            min={0}
                            onChange={(v) => binding.apply((s) => (s.softFarFade = v))}
                        />
                    </div>
                </Row>
            )}
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
