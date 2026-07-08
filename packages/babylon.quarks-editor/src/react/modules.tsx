import React, {useState} from 'react';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {
    ColorOverLife,
    ConstantColor,
    ConstantValue,
    Gradient,
    IntervalValue,
    RandomColor,
    RandomColorBetweenGradient,
    RandomQuatGenerator,
    RenderMode,
    SizeOverLife,
    Vector3Function,
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
import type {ShapeType} from '../core/shapes';
import {buildCurve, buildScalar, readPieces, readScalar} from '../core/values';
import {CurveEditor} from './CurveEditor';
import {GradientEditor} from './GradientEditor';
import {ModuleSection} from './ModuleSection';
import {PromptDialog} from './PromptDialog';
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
};

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
    const startSize = system.startSize as unknown as {type?: string; x?: never; y?: never; z?: never};
    const size3D = startSize.type === 'vec3function';
    const colorGenMode =
        startColor instanceof RandomColorBetweenGradient ? 'gradient2'
        : startColor instanceof Gradient ? 'gradient'
        : colorMode;
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
                        {value: 'gradient', label: 'Gradient'},
                        {value: 'gradient2', label: 'Random between gradients'},
                    ]}
                    onChange={(mode) =>
                        binding.apply((s) => {
                            if (mode === 'random') {
                                s.startColor = new RandomColor(colorA, colorB);
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
            {(colorGenMode === 'constant' || colorGenMode === 'random') && (
                <Row label="">
                    <ColorInput
                        value={colorA}
                        onChange={(next) =>
                            binding.apply((s) => {
                                s.startColor = colorGenMode === 'random' ? new RandomColor(next, colorB) : new ConstantColor(next);
                            })
                        }
                    />
                </Row>
            )}
            {colorGenMode === 'random' && (
                <Row label="">
                    <ColorInput
                        value={colorB}
                        onChange={(next) => binding.apply((s) => (s.startColor = new RandomColor(colorA, next)))}
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
                className="qe-hover"
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

// Shapes whose constructor doesn't accept `mode`/`spread` at all — showing those controls
// for them would edit a value the shape silently ignores, just like the old "default to
// first texture" bug: a control that looks live but does nothing.
const SHAPES_WITHOUT_MODE_SPREAD = new Set<ShapeType>(['point', 'grid', 'mesh_surface']);

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
            {type === 'mesh_surface' && (
                <Row label="Source mesh">
                    <SelectField
                        value={params.mesh?.uniqueId != null ? String(params.mesh.uniqueId) : '__none'}
                        options={[
                            {value: '__none', label: '(none)'},
                            ...meshOptions.map((m) => ({value: String(m.uniqueId), label: m.name})),
                        ]}
                        onChange={(id) => {
                            const mesh = id === '__none' ? undefined : meshOptions.find((m) => String(m.uniqueId) === id);
                            binding.apply((s) => (s.emitterShape = createShape('mesh_surface', {...params, mesh})));
                        }}
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
    normals?: Float32Array | number[];
}

/** Vertex buffers a host loader (e.g. a GLB importer) returns for the Mesh render mode. */
export type GeometryData = Omit<GeometryOption, 'label'>;

/**
 * Tiny dependency-free wireframe thumbnail of a mesh geometry. Projects positions with a fixed
 * isometric rotation, scales them to fit, and strokes the triangle edges on a 2D canvas — enough
 * for the user to recognise which mesh they picked without spinning up a second Babylon scene.
 */
function MeshPreview({positions, indices, size = 96}: {positions: Float32Array; indices?: ArrayLike<number>; size?: number}) {
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
        const cy = Math.cos(0.6), sy = Math.sin(0.6), cx = Math.cos(0.52), sx = Math.sin(0.52);
        const pts: Array<[number, number]> = [];
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < n; i++) {
            const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
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
    const currentTextureUrl = (system.texture as {url?: string} | null)?.url ?? '';
    const [promptingTextureUrl, setPromptingTextureUrl] = useState(false);
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
            {system.renderMode === RenderMode.Mesh &&
                (() => {
                    const preset = detectGeometryPreset(system.instancingGeometry);
                    const vertexCount = system.instancingGeometry.length / 3;
                    const triangleCount = (system.getRendererSettings().instancingIndices?.length ?? 0) / 3;
                    const hostGeometry = geometryOptions ?? [];
                    const applyGeometry = (g: GeometryData) =>
                        binding.apply((s) => {
                            const settings = s.getRendererSettings();
                            settings.instancingIndices = (g.indices ? new Uint32Array(g.indices) : undefined) as never;
                            settings.instancingUVs = (g.uvs ? new Float32Array(g.uvs) : undefined) as never;
                            settings.instancingNormals = (g.normals ? new Float32Array(g.normals) : undefined) as never;
                            s.instancingGeometry = new Float32Array(g.positions);
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
                                        {vertexCount} verts / {triangleCount} tris — picking a preset replaces this mesh
                                    </span>
                                )}
                            </div>
                        </Row>
                    );
                })()}
            <div
                style={{
                    marginTop: 10,
                    marginBottom: 2,
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#7c8db5',
                    textTransform: 'uppercase',
                    letterSpacing: 0.4,
                }}
            >
                Material
            </div>
            {system.material != null && (
                <div style={{fontSize: 10.5, color: '#9eb9ff', marginBottom: 2}}>
                    Imported material: {(system.material as {name?: string}).name ?? 'unnamed'} — settings below were derived from it
                </div>
            )}
            <Row label="Blend mode">
                <SelectField
                    value={system.blending}
                    options={[
                        {value: 1, label: 'Additive'},
                        {value: 2, label: 'Alpha blend'},
                        {value: 3, label: 'Subtract'},
                        {value: 4, label: 'Multiply'},
                    ]}
                    onChange={(blend) => binding.apply((s) => (s.blending = blend))}
                />
            </Row>
            <Row label="Transparent">
                <CheckboxField
                    value={!!system.getRendererSettings().materialTransparent}
                    onChange={(v) =>
                        binding.apply((s) => {
                            s.getRendererSettings().materialTransparent = v;
                            s.neededToUpdateRender = true;
                        })
                    }
                />
            </Row>
            {resolveTexture && (
                <Row label="Texture">
                    <SelectField
                        value={
                            !currentTextureUrl
                                ? '__none'
                                : (textureOptions ?? []).some((o) => o.url === currentTextureUrl)
                                  ? currentTextureUrl
                                  : '__current'
                        }
                        options={[
                            {value: '__none', label: '(none)'},
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
                            if (url === '__none') {
                                binding.apply((s) => (s.texture = null as never));
                                return;
                            }
                            if (url === '__url') {
                                setPromptingTextureUrl(true);
                                return;
                            }
                            if (url === '__file') {
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.accept = 'image/*';
                                input.onchange = () => {
                                    const file = input.files?.[0];
                                    if (!file) {
                                        return;
                                    }
                                    // Read as a data URI so the texture survives Export/Save/reimport;
                                    // an object URL (blob:) would be dead after a reload.
                                    const reader = new FileReader();
                                    reader.onload = () => {
                                        binding.apply((s) => (s.texture = resolveTexture(reader.result as string) as never));
                                    };
                                    reader.readAsDataURL(file);
                                };
                                input.click();
                                return;
                            }
                            binding.apply((s) => (s.texture = resolveTexture(url) as never));
                        }}
                    />
                    {promptingTextureUrl && (
                        <PromptDialog
                            title="Texture URL"
                            defaultValue={currentTextureUrl}
                            placeholder="https://…"
                            onSubmit={(url) => {
                                binding.apply((s) => (s.texture = resolveTexture(url) as never));
                                setPromptingTextureUrl(false);
                            }}
                            onCancel={() => setPromptingTextureUrl(false)}
                        />
                    )}
                    {currentTextureUrl && (
                        <img
                            src={currentTextureUrl}
                            alt="texture preview"
                            style={{
                                width: 64,
                                height: 64,
                                marginTop: 6,
                                objectFit: 'contain',
                                borderRadius: 6,
                                border: '1px solid #2b3761',
                                // Checkerboard so texture transparency is visible.
                                background:
                                    'repeating-conic-gradient(#2a3252 0% 25%, #171d33 0% 50%) 0 0 / 12px 12px',
                            }}
                        />
                    )}
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
