import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Quaternion as BQuaternion, Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {Scene} from '@babylonjs/core/scene';
import {
    ConstantValue,
    EmitSubParticleSystem,
    EmitterShape,
    Particle,
    PointEmitter,
    Quaternion,
    RotationOverLife,
    SubParticleEmitMode,
    Vector2,
    Vector3,
    Vector3Function,
} from 'quarks.core';
import {BatchedRenderer} from '../src/BatchedRenderer';
import {storedBatchSettings} from '../src/batchKey';
import {ParticleSystem, ParticleSystemParameters} from '../src/ParticleSystem';
import {ShaderContext, shaderProgram} from '../src/shaderProgram';
import local_particle_physics_vert from '../src/shaders/local_particle_physics_vert.glsl';
import local_particle_physics_vert_wgsl from '../src/shaders/local_particle_physics_vert.wgsl';
import particle_vert from '../src/shaders/particle_vert.glsl';
import particle_vert_wgsl from '../src/shaders/particle_vert.wgsl';
import {shaderVariants} from '../src/shaderVariants';
import type {SpriteBatch} from '../src/SpriteBatch';
import {validRenderAlignment} from '../src/system/normalize';
import {RenderAlignment, RenderMode} from '../src/VFXBatch';
import {emptyMeta} from './internals';

const STEP = 1 / 60;
let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
});

afterEach(() => {
    scene.dispose();
    engine.dispose();
});

/** A shape that sends every particle along one local direction, leaving its rotation alone. */
function along(x: number, y: number, z: number): EmitterShape {
    const shape = new PointEmitter();
    shape.initialize = (p: Particle) => {
        p.position.set(0, 0, 0);
        p.velocity.set(x, y, z).normalize().multiplyScalar(p.startSpeed);
    };
    return shape;
}

function system(parameters: Partial<ParticleSystemParameters> = {}): ParticleSystem {
    return new ParticleSystem({
        scene,
        duration: 10,
        looping: true,
        startLife: new ConstantValue(10),
        startSpeed: new ConstantValue(0),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [{time: 0, count: new ConstantValue(3), cycle: 1, interval: 0, probability: 1}],
        shape: along(0.3, -0.5, 0.8),
        renderMode: RenderMode.Mesh,
        texture: null,
        ...parameters,
    });
}

/** Turns the system's emitter about `axis` by `angle` and refreshes its world matrix. */
function turnEmitter(ps: ParticleSystem, axis: BVector3, angle: number): void {
    ps.emitter.rotationQuaternion = BQuaternion.RotationAxis(axis, angle);
    ps.emitter.computeWorldMatrix(true);
}

/** The emitter's rotation as the renderer reads it. */
function emitterRotation(ps: ParticleSystem): Quaternion {
    const q = new Quaternion();
    ps.emitter.matrixWorld.decompose(new Vector3(), q, new Vector3());
    return q;
}

/** The mesh rotations the batch drew this frame, one quaternion per particle. */
function drawnRotations(renderer: BatchedRenderer): Quaternion[] {
    const batch = renderer.batches[0] as SpriteBatch;
    const buffer = batch['rotationBuffer'] as Float32Array;
    const out: Quaternion[] = [];
    for (let i = 0; i < batch.mesh.forcedInstanceCount; i++) {
        out.push(new Quaternion(buffer[i * 4], buffer[i * 4 + 1], buffer[i * 4 + 2], buffer[i * 4 + 3]));
    }
    return out;
}

/** Whether two quaternions turn the same way (q and -q are one rotation). */
function sameTurn(a: Quaternion, b: Quaternion): boolean {
    return Math.abs(Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w) - 1) < 1e-5;
}

function render(ps: ParticleSystem, frames = 2): BatchedRenderer {
    const renderer = new BatchedRenderer('alignment', scene);
    renderer.addSystem(ps);
    ps.play();
    for (let i = 0; i < frames; i++) renderer.update(STEP);
    return renderer;
}

const IDENTITY = new Quaternion();
const UP = new BVector3(0, 1, 0);

describe('render alignment', () => {
    it("defaults to 'simulation' and normalises anything else to it", () => {
        expect(system().renderAlignment).toBe('simulation');
        expect(system({renderAlignment: 'sideways' as never}).renderAlignment).toBe('simulation');
        for (const alignment of ['view', 'world', 'local'] as const) {
            expect(validRenderAlignment(alignment)).toBe(alignment);
            expect(system({renderAlignment: alignment}).renderAlignment).toBe(alignment);
        }
        expect(validRenderAlignment(undefined)).toBe('simulation');
        expect(validRenderAlignment(2)).toBe('simulation');
        const ps = system();
        ps.renderAlignment = 'nowhere' as never;
        expect(ps.renderAlignment).toBe('simulation');
    });

    it('batches mesh systems with different alignments apart, and ignores it elsewhere', () => {
        const mesh = (renderAlignment: RenderAlignment) =>
            storedBatchSettings({...system({renderAlignment}).rendererSettings});
        expect(mesh('view').renderAlignment).toBe('view');
        expect(
            storedBatchSettings({
                ...system({renderMode: RenderMode.BillBoard, renderAlignment: 'view'}).rendererSettings,
            }).renderAlignment
        ).toBe('simulation');

        const renderer = new BatchedRenderer('batches', scene);
        renderer.addSystem(system());
        renderer.addSystem(system({renderAlignment: 'view'}));
        renderer.addSystem(system({renderAlignment: 'world'}));
        renderer.addSystem(system({renderAlignment: 'world'}));
        expect(renderer.batches).toHaveLength(3);

        const flat = new BatchedRenderer('flat', scene);
        flat.addSystem(system({renderMode: RenderMode.BillBoard}));
        flat.addSystem(system({renderMode: RenderMode.BillBoard, renderAlignment: 'view'}));
        expect(flat.batches).toHaveLength(1);
    });

    it('moves a system to a matching batch when set, and writes JSON only when not the default', () => {
        const ps = system();
        const renderer = render(ps);
        ps.renderAlignment = 'view';
        renderer.update(STEP);
        expect(renderer.batches[renderer.systemToBatchIndex.get(ps)!].settings.renderAlignment).toBe('view');
        const meta = emptyMeta();
        const json = ps.toJSON(meta);
        expect(json.renderAlignment).toBe('view');
        expect(ParticleSystem.fromJSON(json, meta, scene).renderAlignment).toBe('view');
        expect(ps.clone().renderAlignment).toBe('view');
        ps.renderAlignment = 'simulation';
        expect(ps.toJSON(emptyMeta())).not.toHaveProperty('renderAlignment');
    });

    it("compiles the camera's axes into the mesh shader for 'view' only", () => {
        const context: ShaderContext = {depth: null, envAtlasReady: false, meshUV2: false};
        const defines = (renderMode: RenderMode, renderAlignment: RenderAlignment) =>
            shaderProgram(
                {...storedBatchSettings({...system({renderMode, renderAlignment}).rendererSettings})},
                context
            ).defines;
        expect(defines(RenderMode.Mesh, 'view')).toContain('MESH_VIEW_ALIGNED');
        for (const alignment of ['simulation', 'world', 'local'] as const) {
            expect(defines(RenderMode.Mesh, alignment)).not.toContain('MESH_VIEW_ALIGNED');
        }
        expect(defines(RenderMode.BillBoard, 'view')).not.toContain('MESH_VIEW_ALIGNED');
        expect(shaderVariants().some((variant) => variant.program.defines.includes('MESH_VIEW_ALIGNED'))).toBe(true);
        for (const source of [local_particle_physics_vert, local_particle_physics_vert_wgsl]) {
            expect(source).toMatch(/#ifdef MESH_VIEW_ALIGNED[\s\S]*viewToWorld\(/);
            // Position and normal both turn, so lighting and rim follow the view-aligned surface.
            expect(source).toMatch(/rotatedPosition = viewToWorld\(/);
            expect(source).toMatch(/rotatedNormal = viewToWorld\(/);
        }
    });

    describe('mesh rotation written for the shader', () => {
        it("turns a local-space system's meshes with the emitter by default and for 'local'", () => {
            for (const renderAlignment of ['simulation', 'local'] as const) {
                const ps = system({renderAlignment});
                turnEmitter(ps, UP, Math.PI / 3);
                const renderer = render(ps);
                const rotations = drawnRotations(renderer);
                expect(rotations).toHaveLength(3);
                for (const q of rotations) expect(sameTurn(q, emitterRotation(ps))).toBe(true);
                renderer.dispose();
            }
        });

        it("writes a local-space system's own particle rotation for 'view' and 'world'", () => {
            for (const renderAlignment of ['view', 'world'] as const) {
                const ps = system({renderAlignment});
                turnEmitter(ps, UP, Math.PI / 3);
                const renderer = render(ps);
                const rotations = drawnRotations(renderer);
                expect(rotations).toHaveLength(3);
                for (const q of rotations) expect(sameTurn(q, IDENTITY)).toBe(true);
                renderer.dispose();
            }
        });

        it("keeps a world-space system's birth turn by default, and none for 'world' or 'view'", () => {
            for (const [renderAlignment, birthTurn] of [
                ['simulation', true],
                ['world', false],
                ['view', false],
            ] as const) {
                const ps = system({worldSpace: true, renderAlignment});
                turnEmitter(ps, UP, Math.PI / 3);
                const birth = emitterRotation(ps);
                const renderer = render(ps);
                // Turning the emitter afterwards leaves them where they are.
                turnEmitter(ps, UP, -Math.PI / 4);
                renderer.update(STEP);
                for (const q of drawnRotations(renderer)) expect(sameTurn(q, birthTurn ? birth : IDENTITY)).toBe(true);
                renderer.dispose();
            }
        });

        it("turns a world-space system's meshes with the emitter of the moment for 'local'", () => {
            const ps = system({worldSpace: true, renderAlignment: 'local'});
            turnEmitter(ps, UP, Math.PI / 3);
            const renderer = render(ps);
            for (const q of drawnRotations(renderer)) expect(sameTurn(q, emitterRotation(ps))).toBe(true);
            turnEmitter(ps, UP, -Math.PI / 4);
            renderer.update(STEP);
            const rotations = drawnRotations(renderer);
            expect(rotations).toHaveLength(3);
            for (const q of rotations) expect(sameTurn(q, emitterRotation(ps))).toBe(true);
            renderer.dispose();
        });

        it('points aligned-to-direction meshes along their travel in the world', () => {
            for (const [worldSpace, renderAlignment] of [
                [true, 'simulation'],
                [true, 'world'],
                [false, 'world'],
                [false, 'simulation'],
            ] as const) {
                const ps = system({
                    worldSpace,
                    renderAlignment,
                    alignToDirection: true,
                    startSpeed: new ConstantValue(1),
                });
                turnEmitter(ps, new BVector3(1, 1, 0).normalize(), 1.1);
                const renderer = render(ps, 1);
                const rotations = drawnRotations(renderer);
                expect(rotations).toHaveLength(3);
                const turn = emitterRotation(ps);
                rotations.forEach((q, i) => {
                    const travel = ps.particles[i].velocity.clone().normalize();
                    if (!worldSpace) travel.applyQuaternion(turn);
                    const forward = new Vector3(0, 0, 1).applyQuaternion(q);
                    expect([worldSpace, renderAlignment, i, forward.distanceTo(travel) < 1e-4]).toEqual([
                        worldSpace,
                        renderAlignment,
                        i,
                        true,
                    ]);
                });
                renderer.dispose();
            }
        });

        it("turns 'local' meshes by the emitter's rotation under a parent scaled to 0, as Unity", () => {
            // Measured in Unity 6 (ParticleSystemRenderer.BakeMesh): a root turned (0, 90, 0) and
            // scaled 0, the emitter turned (90, 0, 0) below it, a mesh particle with no rotation of
            // its own aligned Local. The mesh's x, y and z are drawn along these world axes, in
            // world and in local simulation space; the system's scaling mode is Unity's default,
            // Local.
            const drawnAxes = [
                [0, 0, -1],
                [1, 0, 0],
                [0, -1, 0],
            ];
            for (const worldSpace of [true, false]) {
                const ps = system({worldSpace, renderAlignment: 'local', scalingMode: 'local'});
                const root = new TransformNode('root', scene);
                root.rotationQuaternion = BQuaternion.RotationYawPitchRoll(Math.PI / 2, 0, 0);
                root.scaling = new BVector3(0, 0, 0);
                ps.emitter.parent = root;
                turnEmitter(ps, new BVector3(1, 0, 0), Math.PI / 2);
                const renderer = render(ps);
                const rotations = drawnRotations(renderer);
                expect(rotations).toHaveLength(3);
                for (const q of rotations) {
                    drawnAxes.forEach((axis, i) => {
                        const drawn = new Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0).applyQuaternion(q);
                        expect(drawn.distanceTo(new Vector3(axis[0], axis[1], axis[2]))).toBeLessThan(1e-5);
                    });
                }
                renderer.dispose();
            }
        });
    });
});

describe('render alignment of billboards', () => {
    const DEG = Math.PI / 180;
    /** Unity's Quaternion.Euler(20, 30, 40): Z, then X, then Y, as Babylon's yaw-pitch-roll. */
    const UNITY_TURN = BQuaternion.RotationYawPitchRoll(30 * DEG, 20 * DEG, 40 * DEG);

    /** A shape that starts every particle at one local point, still. */
    function at(x: number, y: number, z: number): EmitterShape {
        const shape = new PointEmitter();
        shape.initialize = (p: Particle) => {
            p.position.set(x, y, z);
            p.velocity.set(0, 0, 0);
        };
        return shape;
    }

    function quad(parameters: Partial<ParticleSystemParameters> = {}): ParticleSystem {
        return system({
            renderMode: RenderMode.BillBoard,
            shape: at(1, 0.5, 0),
            emissionBursts: [{time: 0, count: new ConstantValue(1), cycle: 1, interval: 0, probability: 1}],
            ...parameters,
        });
    }

    /**
     * Where the vertex shader puts the first drawn quad, from the batch's buffers: its centre, its
     * U edge (uv (0, 0) to (1, 0)) and its V edge (uv (0, 0) to (0, 1)), in the world.
     */
    function drawnQuad(renderer: BatchedRenderer, pivot?: Vector3) {
        const batch = renderer.batches[0] as SpriteBatch;
        expect(batch.mesh.forcedInstanceCount).toBe(1);
        const offset = batch['offsetBuffer'] as Float32Array;
        const size = batch['sizeBuffer'] as Float32Array;
        const turn = batch['rotationBuffer'] as Float32Array;
        const q = new Quaternion(turn[0], turn[1], turn[2], turn[3]);
        const corner = (x: number, y: number) => {
            const local = new Vector3(x * size[0], y * size[1], 0);
            if (pivot) {
                local.x += pivot.x * Math.abs(size[0]);
                local.y += pivot.y * Math.abs(size[1]);
                local.z = pivot.z * Math.abs(size[0]);
            }
            return local.applyQuaternion(q).add(new Vector3(offset[0], offset[1], offset[2]));
        };
        const origin = corner(-0.5, -0.5);
        return {
            centre: corner(-0.5, -0.5).add(corner(0.5, 0.5)).multiplyScalar(0.5),
            u: corner(0.5, -0.5).sub(origin),
            v: corner(-0.5, 0.5).sub(origin),
        };
    }

    function expectNear(actual: Vector3, expected: number[], label: string): void {
        const distance = actual.distanceTo(new Vector3(expected[0], expected[1], expected[2]));
        expect([label, distance < 2e-4 ? 'near' : [actual.x, actual.y, actual.z]]).toEqual([label, 'near']);
    }

    it("batches 'world' and 'local' billboards apart from camera-facing ones, and the other quads together", () => {
        const stored = (renderMode: RenderMode, renderAlignment: RenderAlignment) =>
            storedBatchSettings({...quad({renderMode, renderAlignment}).rendererSettings}).renderAlignment;
        expect(stored(RenderMode.BillBoard, 'world')).toBe('world');
        expect(stored(RenderMode.BillBoard, 'local')).toBe('local');
        expect(stored(RenderMode.BillBoard, 'view')).toBe('simulation');
        // Unity's stretched, horizontal and vertical billboards draw the same for every alignment.
        for (const mode of [
            RenderMode.StretchedBillBoard,
            RenderMode.HorizontalBillBoard,
            RenderMode.VerticalBillBoard,
        ]) {
            expect(stored(mode, 'local')).toBe('simulation');
        }
        const renderer = new BatchedRenderer('quads', scene);
        for (const renderAlignment of ['simulation', 'view', 'world', 'world', 'local'] as const) {
            renderer.addSystem(quad({renderAlignment}));
        }
        expect(renderer.batches).toHaveLength(3);
        renderer.dispose();
    });

    it("compiles the quaternion-turned quad into the billboard shader for 'world' and 'local' only", () => {
        const context: ShaderContext = {depth: null, envAtlasReady: false, meshUV2: false};
        const program = (renderMode: RenderMode, renderAlignment: RenderAlignment) =>
            shaderProgram({...storedBatchSettings({...quad({renderMode, renderAlignment}).rendererSettings})}, context);
        for (const alignment of ['world', 'local'] as const) {
            expect(program(RenderMode.BillBoard, alignment).defines).toContain('BILLBOARD_ALIGNED');
            expect(program(RenderMode.Mesh, alignment).defines).not.toContain('BILLBOARD_ALIGNED');
            expect(program(RenderMode.HorizontalBillBoard, alignment).defines).not.toContain('BILLBOARD_ALIGNED');
        }
        for (const alignment of ['simulation', 'view'] as const) {
            expect(program(RenderMode.BillBoard, alignment).defines).not.toContain('BILLBOARD_ALIGNED');
        }
        expect(shaderVariants().some((variant) => variant.program.defines.includes('BILLBOARD_ALIGNED'))).toBe(true);
        for (const source of [particle_vert, particle_vert_wgsl]) {
            expect(source).toMatch(/#ifdef BILLBOARD_ALIGNED[\s\S]*attribute (vec4 )?rotation(: vec4f)?;/);
            expect(source).toMatch(/applyQuaternion\(corner, (vertexInputs\.)?rotation\)/);
        }
    });

    it('keeps an angle per camera-facing billboard and writes a quaternion per aligned one', () => {
        for (const [renderAlignment, stride] of [
            ['view', 1],
            ['world', 4],
        ] as const) {
            const renderer = render(quad({renderAlignment}));
            const batch = renderer.batches[0] as SpriteBatch;
            expect((batch['rotationBuffer'] as Float32Array).length).toBe(batch['maxParticles'] * stride);
            renderer.dispose();
        }
    });

    // The numbers below were measured in Unity 6 with ParticleSystemRenderer.BakeMesh: one
    // billboard of size 1 emitted at (1, 0.5, 0) in the system's space, the system turned by
    // Euler (20, 30, 40) where noted, under a camera at (2, 3, -8). Unity's rotation of 30° is
    // quarks' -30°, as the exporter writes it (Unity turns a billboard clockwise).
    describe("lays the quad as Unity's Render Alignment does", () => {
        it("'world': the world's X and Y, spun by the particle's rotation, whatever the emitter's turn", () => {
            for (const worldSpace of [false, true]) {
                const ps = quad({renderAlignment: 'world', worldSpace, startRotation: new ConstantValue(-30 * DEG)});
                ps.emitter.rotationQuaternion = UNITY_TURN.clone();
                ps.emitter.computeWorldMatrix(true);
                const renderer = render(ps);
                const {centre, u, v} = drawnQuad(renderer);
                expectNear(centre, [0.5605, 0.9639, 0.0815], `centre ${worldSpace}`);
                expectNear(u, [0.866, -0.5, 0], `u ${worldSpace}`);
                expectNear(v, [0.5, 0.866, 0], `v ${worldSpace}`);
                renderer.dispose();
            }
        });

        it("'local': the emitter's X and Y, spun by the particle's rotation", () => {
            const ps = quad({renderAlignment: 'local', startRotation: new ConstantValue(-30 * DEG)});
            ps.emitter.rotationQuaternion = UNITY_TURN.clone();
            ps.emitter.computeWorldMatrix(true);
            const renderer = render(ps);
            const {centre, u, v} = drawnQuad(renderer);
            expectNear(centre, [0.5605, 0.9639, 0.0815], 'centre');
            expectNear(u, [0.8826, 0.1632, -0.441], 'u');
            expectNear(v, [0.018, 0.9254, 0.3785], 'v');
            renderer.dispose();
        });

        it("'local' in world space: the emitter's axes of the moment, not of the particle's birth", () => {
            const ps = quad({renderAlignment: 'local', worldSpace: true});
            const renderer = render(ps);
            ps.emitter.rotationQuaternion = UNITY_TURN.clone();
            ps.emitter.computeWorldMatrix(true);
            renderer.update(STEP);
            const {centre, u, v} = drawnQuad(renderer);
            // Born before the turn, the particle stays where it was.
            expectNear(centre, [1, 0.5, 0], 'centre');
            expectNear(u, [0.7733, 0.604, -0.1926], 'u');
            expectNear(v, [-0.4257, 0.7198, 0.5483], 'v');
            renderer.dispose();
        });

        it('mirrors a flipped quad along U before spinning it', () => {
            const ps = quad({
                renderAlignment: 'world',
                startRotation: new ConstantValue(-30 * DEG),
                flip: new Vector2(1, 0),
            });
            const renderer = render(ps);
            const {u, v} = drawnQuad(renderer);
            expectNear(u, [-0.866, 0.5, 0], 'u');
            expectNear(v, [0.5, 0.866, 0], 'v');
            renderer.dispose();
        });

        it("moves the quad by its pivot along the alignment's X, Y and Z", () => {
            const pivot = new Vector3(0.5, 0.25, 0.3);
            const world = quad({renderAlignment: 'world', startRotation: new ConstantValue(-30 * DEG), pivot});
            let renderer = render(world);
            expectNear(drawnQuad(renderer, pivot).centre, [1.558, 0.4665, 0.3], "'world' centre");
            renderer.dispose();

            const local = quad({renderAlignment: 'local', pivot});
            local.emitter.rotationQuaternion = UNITY_TURN.clone();
            local.emitter.computeWorldMatrix(true);
            renderer = render(local);
            expectNear(drawnQuad(renderer, pivot).centre, [0.9817, 1.3433, 0.3664], "'local' centre");
            renderer.dispose();
        });

        it("stretches the quad by a 3D start size along the alignment's X and Y", () => {
            const ps = quad({
                renderAlignment: 'local',
                startSize: new Vector3Function(new ConstantValue(1), new ConstantValue(2), new ConstantValue(3)),
            });
            ps.emitter.rotationQuaternion = UNITY_TURN.clone();
            ps.emitter.computeWorldMatrix(true);
            const renderer = render(ps);
            const {u, v} = drawnQuad(renderer);
            expectNear(u, [0.7733, 0.604, -0.1926], 'u');
            expectNear(v, [-0.8513, 1.4397, 1.0966], 'v');
            renderer.dispose();
        });

        it("scales the quad by the emitter's scale as the scaling mode has it", () => {
            // The emitter turned (0, 0, 30) and scaled (2, 1, 3) under a parent scaled (1, 2, 1).
            // Unity's emitted position skips the shape, which 'shape' scales, so its centre is
            // left out there.
            const cases = [
                ['world', 'local', [1.4821, 1.433, 0], [2, 0, 0], [0, 1, 0]],
                ['local', 'shape', null, [0.866, 0.5, 0], [-0.5, 0.866, 0]],
            ] as const;
            for (const [renderAlignment, scalingMode, centre, u, v] of cases) {
                const ps = quad({renderAlignment, scalingMode});
                const parent = new TransformNode('parent', scene);
                parent.scaling = new BVector3(1, 2, 1);
                ps.emitter.parent = parent;
                ps.emitter.rotationQuaternion = BQuaternion.RotationAxis(new BVector3(0, 0, 1), 30 * DEG);
                ps.emitter.scaling = new BVector3(2, 1, 3);
                parent.computeWorldMatrix(true);
                ps.emitter.computeWorldMatrix(true);
                const renderer = render(ps);
                const drawn = drawnQuad(renderer);
                if (centre) expectNear(drawn.centre, [...centre], `${renderAlignment} ${scalingMode} centre`);
                expectNear(drawn.u, [...u], `${renderAlignment} ${scalingMode} u`);
                expectNear(drawn.v, [...v], `${renderAlignment} ${scalingMode} v`);
                renderer.dispose();
            }
        });
    });

    it('carries the spin on between simulation steps, as a camera-facing billboard does', () => {
        const ps = quad({renderAlignment: 'world'});
        ps.addBehavior(new RotationOverLife(new ConstantValue(2)));
        const renderer = render(ps);
        renderer.update(STEP / 2);
        const residual = ps.simulationResidual ?? 0;
        expect(residual).toBeGreaterThan(0);
        const turn = (renderer.batches[0] as SpriteBatch)['rotationBuffer'] as Float32Array;
        const angle = 2 * Math.atan2(turn[2], turn[3]);
        expect(angle).toBeCloseTo((ps.particles[0].rotation as number) + 2 * residual, 5);
        renderer.dispose();
    });

    it("turns a sub emission's 'local' quads by the frame its particles were born in", () => {
        const parent = quad({renderAlignment: 'view', looping: true});
        parent.emitter.rotationQuaternion = UNITY_TURN.clone();
        parent.emitter.computeWorldMatrix(true);
        const child = quad({renderAlignment: 'local'});
        child.onlyUsedByOther = true;
        parent.addBehavior(new EmitSubParticleSystem(parent, true, child.emitter, SubParticleEmitMode.Birth));
        const renderer = new BatchedRenderer('sub', scene);
        renderer.addSystem(parent);
        renderer.addSystem(child);
        parent.play();
        for (let i = 0; i < 2; i++) renderer.update(STEP);
        expect(child.particleNum).toBeGreaterThan(0);
        const batch = renderer.batches[renderer.systemToBatchIndex.get(child)!] as SpriteBatch;
        const turn = batch['rotationBuffer'] as Float32Array;
        const particle = child.particles[0];
        expect(particle.parentMatrix).toBeDefined();
        const frame = new Quaternion().setFromRotationMatrix(particle.parentMatrix!);
        expect(sameTurn(new Quaternion(turn[0], turn[1], turn[2], turn[3]), frame)).toBe(true);
        renderer.dispose();
    });
});
