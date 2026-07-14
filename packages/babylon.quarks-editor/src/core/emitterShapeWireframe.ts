import type {ParticleSystem} from 'babylon.quarks';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {LinesMesh} from '@babylonjs/core/Meshes/linesMesh';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Scene} from '@babylonjs/core/scene';
import {getShapeType, readShapeParams} from './shapes';
import {EDITOR_SCENE_NODE_METADATA} from './editorScene';

const LINE_COLOR = new Color3(0.45, 0.82, 1);
const DIRECTION_COLOR = new Color3(0.75, 0.92, 1);

/**
 * Optional wireframe overlays for every emitter shape in the current effect.
 * Geometry follows quarks.core spawn math (local XY spawn plane, +Z emit axis).
 */
export class EmitterShapeWireframes {
    private readonly scene: Scene;
    private readonly container: TransformNode;
    private meshes: Mesh[] = [];
    private visible = false;
    private syncKey = '';

    constructor(scene: Scene) {
        this.scene = scene;
        this.container = new TransformNode('emitter-wireframes', scene);
        this.container.setEnabled(false);
    }

    setVisible(on: boolean): void {
        this.visible = on;
        if (!on) {
            this.clearMeshes();
            this.container.setEnabled(false);
            this.syncKey = '';
        }
    }

    /** Rebuilds overlays when the binding revision changes. */
    sync(systems: ParticleSystem[], syncKey: string): void {
        if (!this.visible) {
            return;
        }
        if (syncKey === this.syncKey) {
            return;
        }
        this.syncKey = syncKey;
        this.rebuild(systems);
    }

    dispose(): void {
        this.setVisible(false);
        this.container.dispose();
    }

    private rebuild(systems: ParticleSystem[]): void {
        this.clearMeshes();
        this.container.setEnabled(true);
        for (const system of systems) {
            if (system.emitter.isDisposed()) {
                continue;
            }
            for (const mesh of buildEmitterWireframe(system, this.scene)) {
                mesh.parent = system.emitter;
                mesh.metadata = {...(mesh.metadata ?? {}), ...EDITOR_SCENE_NODE_METADATA};
                mesh.isPickable = false;
                mesh.renderingGroupId = 1;
                this.meshes.push(mesh);
            }
        }
    }

    private clearMeshes(): void {
        for (const mesh of this.meshes) {
            mesh.dispose();
        }
        this.meshes = [];
    }
}

function buildEmitterWireframe(system: ParticleSystem, scene: Scene): Mesh[] {
    const type = getShapeType(system.emitterShape);
    const params = readShapeParams(system.emitterShape);
    const meshes: Mesh[] = [];
    const lines = (name: string, points: Vector3[], color = LINE_COLOR) => {
        if (points.length < 2) {
            return;
        }
        const mesh = MeshBuilder.CreateLines(name, {points}, scene) as LinesMesh;
        mesh.color = color.clone();
        mesh.isPickable = false;
        meshes.push(mesh);
    };

    switch (type) {
        case 'point': {
            // Spawn at origin; velocity is random in a unit ball.
            const s = 0.12;
            lines('wf-point-x', [new Vector3(-s, 0, 0), new Vector3(s, 0, 0)]);
            lines('wf-point-y', [new Vector3(0, -s, 0), new Vector3(0, s, 0)]);
            lines('wf-point-z', [new Vector3(0, 0, -s), new Vector3(0, 0, s)], DIRECTION_COLOR);
            break;
        }
        case 'cone': {
            // Spawn: disk/ring on XY at z=0 (radius, thickness, arc).
            // Velocity: +Z with spread angle — rim dir = (sinα·û, cosα).
            const radius = Math.max(params.radius, 0.001);
            const angle = Math.max(0, params.angle);
            const arc = clampArc(params.arc);
            const thickness = clamp01(params.thickness);
            lines('wf-cone-outer', xyArc(radius, arc));
            if (thickness < 1) {
                lines('wf-cone-inner', xyArc(radius * (1 - thickness), arc));
            }
            if (arc < Math.PI * 2 - 1e-3) {
                lines('wf-cone-spoke-a', [Vector3.Zero(), arcPoint(radius, 0)]);
                lines('wf-cone-spoke-b', [Vector3.Zero(), arcPoint(radius, arc)]);
            }

            const preview = Math.max(radius * 2, 1.25);
            const farRadius = radius + preview * Math.tan(angle);
            const spokeCount = Math.max(4, Math.ceil((arc / (Math.PI * 2)) * 12));
            for (let i = 0; i <= spokeCount; i++) {
                const theta = (i / spokeCount) * arc;
                const rim = arcPoint(radius, theta);
                const dir = new Vector3(Math.sin(angle) * Math.cos(theta), Math.sin(angle) * Math.sin(theta), Math.cos(angle));
                const travel = preview / Math.max(Math.cos(angle), 0.05);
                lines(`wf-cone-ray-${i}`, [rim, rim.add(dir.scale(travel))], DIRECTION_COLOR);
            }
            lines('wf-cone-far', xyArc(farRadius, arc, 32, preview), DIRECTION_COLOR);
            break;
        }
        case 'sphere': {
            // Spawn on spherical shell/volume; velocity radial from center.
            const radius = Math.max(params.radius, 0.001);
            const arc = clampArc(params.arc);
            const thickness = clamp01(params.thickness);
            drawSphereShell(lines, 'wf-sphere', radius, arc);
            if (thickness < 1) {
                drawSphereShell(lines, 'wf-sphere-inner', radius * (1 - thickness), arc);
            }
            break;
        }
        case 'hemisphere': {
            // Spawn on +Z hemisphere (phi 0..π/2): flat on XY through origin, dome toward +Z.
            const radius = Math.max(params.radius, 0.001);
            const arc = clampArc(params.arc);
            const thickness = clamp01(params.thickness);
            drawHemisphereShell(lines, 'wf-hemi', radius, arc);
            lines('wf-hemi-base', xyArc(radius, arc));
            if (thickness < 1) {
                drawHemisphereShell(lines, 'wf-hemi-inner', radius * (1 - thickness), arc);
                lines('wf-hemi-base-inner', xyArc(radius * (1 - thickness), arc));
            }
            break;
        }
        case 'circle': {
            // Spawn on circle/ring in XY; velocity radial in XY.
            const radius = Math.max(params.radius, 0.001);
            const arc = clampArc(params.arc);
            const thickness = clamp01(params.thickness);
            lines('wf-circle', xyArc(radius, arc));
            if (thickness < 1) {
                lines('wf-circle-inner', xyArc(radius * (1 - thickness), arc));
            }
            if (arc < Math.PI * 2 - 1e-3) {
                lines('wf-circle-spoke-a', [Vector3.Zero(), arcPoint(radius, 0)]);
                lines('wf-circle-spoke-b', [Vector3.Zero(), arcPoint(radius, arc)]);
            }
            break;
        }
        case 'donut': {
            // Spawn on torus: major ring of `radius` in XY, tube radius `donutRadius`.
            const radius = Math.max(params.radius, 0.001);
            const tube = Math.max(params.donutRadius, 0.001);
            const arc = clampArc(params.arc);
            const thickness = clamp01(params.thickness);
            lines('wf-donut-major', xyArc(radius, arc));
            lines('wf-donut-outer', xyArc(radius + tube, arc));
            lines('wf-donut-inner', xyArc(Math.max(radius - tube, 0), arc));
            if (thickness < 1) {
                lines('wf-donut-tube-inner', xyArc(radius + tube * (1 - thickness), arc));
            }
            const tubeSamples = Math.max(4, Math.ceil((arc / (Math.PI * 2)) * 8));
            for (let i = 0; i <= tubeSamples; i++) {
                const theta = (i / tubeSamples) * arc;
                lines(`wf-donut-tube-${i}`, torusTubeRing(radius, tube, theta));
            }
            break;
        }
        case 'rectangle': {
            // Spawn on rectangle perimeter (thickness fills toward center); velocity outward in XY.
            const thickness = clamp01(params.thickness);
            lines('wf-rect', xyRect(params.width, params.height));
            if (thickness > 0 && thickness < 1) {
                lines('wf-rect-inner', xyRect(params.width * (1 - thickness), params.height * (1 - thickness)));
            }
            break;
        }
        case 'grid': {
            // Discrete spawn cells in XY; velocity straight +Z.
            const cols = Math.max(1, Math.floor(params.column));
            const rows = Math.max(1, Math.floor(params.row));
            const halfW = params.width / 2;
            const halfH = params.height / 2;
            lines('wf-grid-border', xyRect(params.width, params.height));
            const mark = Math.min(params.width / cols, params.height / rows, 0.12) * 0.35;
            const ray = Math.max(mark * 4, 0.25);
            for (let c = 0; c < cols; c++) {
                for (let r = 0; r < rows; r++) {
                    const x = (c * params.width) / cols - halfW;
                    const y = (r * params.height) / rows - halfH;
                    const p = new Vector3(x, y, 0);
                    lines(`wf-grid-x-${c}-${r}`, [new Vector3(x - mark, y, 0), new Vector3(x + mark, y, 0)]);
                    lines(`wf-grid-y-${c}-${r}`, [new Vector3(x, y - mark, 0), new Vector3(x, y + mark, 0)]);
                    lines(`wf-grid-ray-${c}-${r}`, [p, new Vector3(x, y, ray)], DIRECTION_COLOR);
                }
            }
            break;
        }
        case 'mesh_surface': {
            const source = params.mesh;
            if (source && !source.isDisposed()) {
                const positions = source.getVerticesData('position');
                const indices = source.getIndices();
                if (positions && indices && indices.length >= 3) {
                    const edgeSet = new Set<string>();
                    const pushEdge = (a: number, b: number) => {
                        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
                        if (edgeSet.has(key)) {
                            return;
                        }
                        edgeSet.add(key);
                        lines(`wf-mesh-e-${key}`, [
                            new Vector3(positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2]),
                            new Vector3(positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2]),
                        ]);
                    };
                    const maxTris = Math.min(indices.length / 3, 400);
                    for (let t = 0; t < maxTris; t++) {
                        const i = t * 3;
                        pushEdge(indices[i], indices[i + 1]);
                        pushEdge(indices[i + 1], indices[i + 2]);
                        pushEdge(indices[i + 2], indices[i]);
                    }
                } else {
                    lines('wf-mesh-missing', xyRect(0.6, 0.6));
                }
            } else {
                lines('wf-mesh-missing', xyRect(0.6, 0.6));
            }
            break;
        }
        default:
            break;
    }

    return meshes;
}

type LineFn = (name: string, points: Vector3[], color?: Color3) => void;

function drawSphereShell(lines: LineFn, prefix: string, radius: number, arc: number): void {
    // Latitude rings + longitude arcs matching spherical spawn (theta around Z via arc).
    const latCount = 4;
    for (let i = 1; i < latCount; i++) {
        const phi = (i / latCount) * Math.PI;
        const ringR = radius * Math.sin(phi);
        const z = radius * Math.cos(phi);
        lines(`${prefix}-lat-${i}`, xyArc(ringR, arc, 48, z));
    }
    const lonCount = Math.max(4, Math.ceil((arc / (Math.PI * 2)) * 8));
    for (let i = 0; i <= lonCount; i++) {
        const theta = (i / lonCount) * arc;
        const points: Vector3[] = [];
        for (let j = 0; j <= 16; j++) {
            const phi = (j / 16) * Math.PI;
            points.push(
                new Vector3(
                    radius * Math.sin(phi) * Math.cos(theta),
                    radius * Math.sin(phi) * Math.sin(theta),
                    radius * Math.cos(phi)
                )
            );
        }
        lines(`${prefix}-lon-${i}`, points);
    }
}

function drawHemisphereShell(lines: LineFn, prefix: string, radius: number, arc: number): void {
    // Quarks: phi = acos(v) ∈ [0, π/2] → z = cos(phi) ∈ [0, 1].
    const latCount = 3;
    for (let i = 1; i <= latCount; i++) {
        const phi = (i / (latCount + 1)) * (Math.PI / 2);
        const ringR = radius * Math.sin(phi);
        const z = radius * Math.cos(phi);
        lines(`${prefix}-lat-${i}`, xyArc(ringR, arc, 32, z));
    }
    const lonCount = Math.max(4, Math.ceil((arc / (Math.PI * 2)) * 8));
    for (let i = 0; i <= lonCount; i++) {
        const theta = (i / lonCount) * arc;
        const points: Vector3[] = [new Vector3(0, 0, radius)];
        for (let j = 1; j <= 12; j++) {
            const phi = (j / 12) * (Math.PI / 2);
            points.push(
                new Vector3(
                    radius * Math.sin(phi) * Math.cos(theta),
                    radius * Math.sin(phi) * Math.sin(theta),
                    radius * Math.cos(phi)
                )
            );
        }
        lines(`${prefix}-lon-${i}`, points);
    }
}

function torusTubeRing(major: number, tube: number, theta: number): Vector3[] {
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const points: Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
        const phi = (i / 16) * Math.PI * 2;
        points.push(
            new Vector3(
                (major + tube * Math.cos(phi)) * cos,
                (major + tube * Math.cos(phi)) * sin,
                tube * Math.sin(phi)
            )
        );
    }
    return points;
}

function xyArc(radius: number, arc: number, segments = 48, z = 0): Vector3[] {
    const points: Vector3[] = [];
    const steps = Math.max(8, Math.ceil(segments * (arc / (Math.PI * 2))));
    for (let i = 0; i <= steps; i++) {
        points.push(arcPoint(radius, (i / steps) * arc, z));
    }
    return points;
}

function arcPoint(radius: number, theta: number, z = 0): Vector3 {
    return new Vector3(Math.cos(theta) * radius, Math.sin(theta) * radius, z);
}

function xyRect(width: number, height: number): Vector3[] {
    const halfW = width / 2;
    const halfH = height / 2;
    return [
        new Vector3(-halfW, -halfH, 0),
        new Vector3(halfW, -halfH, 0),
        new Vector3(halfW, halfH, 0),
        new Vector3(-halfW, halfH, 0),
        new Vector3(-halfW, -halfH, 0),
    ];
}

function clampArc(arc: number): number {
    if (!Number.isFinite(arc) || arc <= 0) {
        return Math.PI * 2;
    }
    return Math.min(Math.PI * 2, arc);
}

function clamp01(value: number): number {
    if (!Number.isFinite(value)) {
        return 1;
    }
    return Math.min(1, Math.max(0, value));
}
