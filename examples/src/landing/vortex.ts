import {Constants} from '@babylonjs/core/Engines/constants';
import {Color3, Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
// Side-effect import: registers Scene.createPickingRay, used to project the cursor into the world.
import '@babylonjs/core/Culling/ray';
import {
    ApplyForce,
    Bezier,
    ColorOverLife,
    ConstantColor,
    ConstantValue,
    DonutEmitter,
    Gradient,
    GravityForce,
    InheritVelocity,
    IntervalValue,
    LimitSpeedOverLife,
    Noise,
    OrbitOverLife,
    ParticleSystem,
    PiecewiseBezier,
    PointEmitter,
    RandomColor,
    RenderMode,
    RotationOverLife,
    SizeOverLife,
    SphereEmitter,
    TurbulenceField,
    WidthOverLength,
} from 'babylon.quarks';
import {SHARED_ASSETS, createSharedTexture} from '../shared/common';
import type {DemoContext, DemoModule} from '../types';

/** 10×10 `texture1.png`, tiles counted from the top left: 0 is a hard round dot, 1 a soft radial glow. */
const T1 = {
    round: 0,
    softGlow: 1,
};

/** 10×10 `texture2.png`: tile 1 is a large orb glow; 53–62 is the animated electric-arc strip (see electricBall demo). */
const T2 = {
    orbGlow: 1,
    arcFrameStart: 53,
    arcFrameEnd: 62,
};

/** Hero palette — cool indigo bed, cyan→violet→magenta energy ramp, near-white core. */
const WHITE = new Color3(1, 1, 1);

/**
 * Alpha envelope over particle life: fade in, hold, fade out. Multiplies the particle's
 * startColor, so every layer breathes instead of popping in and out of existence.
 */
function fadeEnvelope(fadeIn: number, fadeOut: number, tintA: Color3 = WHITE, tintB: Color3 = WHITE) {
    return new Gradient(
        [
            [tintA, 0],
            [tintB, 1],
        ],
        [
            [0, 0],
            [1, fadeIn],
            [1, fadeOut],
            [0, 1],
        ]
    );
}

function constantCurve(value: number) {
    return new PiecewiseBezier([[new Bezier(value, value, value, value), 0]]);
}

/** Where the pointer is over the stage, in normalised device coordinates (-1..1, +y up). */
export interface StagePointer {
    x: number;
    y: number;
    /** False until the pointer has moved over the stage at least once. */
    seen: boolean;
}

/**
 * The landing page's signature effect: a slowly turning accretion vortex built from seven
 * coordinated layers (nebula bed, breathing core, accretion disk, comet ribbons, stretched stardust and cursor
 * comets). It shows Trail + WidthOverLength, StretchedBillBoard, OrbitOverLife, GravityForce,
 * TurbulenceField + LimitSpeedOverLife and gradient Color/SizeOverLife, all in one
 * BatchedRenderer. Moving the pointer over the stage sheds ribbons that the vortex captures.
 */
export function createVortex(pointer: StagePointer): DemoModule {
    let state: VortexState | null = null;
    return {
        init(ctx) {
            state = initVortex(ctx);
        },
        update(ctx, delta) {
            if (state) {
                updateVortex(ctx, state, pointer, delta);
            }
        },
    };
}

interface VortexState {
    cursorForce: ApplyForce;
    cursorComets: ParticleSystem;
    cursorEmission: ConstantValue;
    pointerX: number;
    pointerY: number;
    prevPointerX: number;
    prevPointerY: number;
    cursorEmitRate: number;
    planeNormal: BVector3;
    cursorWorld: BVector3;
}

function initVortex({scene, camera, batchRenderer, systems}: DemoContext): VortexState {
    camera.setPosition(new BVector3(0, 8, 22));
    // The slow layers prewarm a whole 8 s cycle, so the stage opens on a formed vortex instead of
    // an empty frame filling in.
    const tex1 = createSharedTexture(scene, SHARED_ASSETS.atlas);
    const tex2 = createSharedTexture(scene, SHARED_ASSETS.atlasSecondary);

    // The disk lies almost flat (XZ) but tips slightly toward the camera so more of the swirl is
    // visible. The donut emitter generates its ring in XY, so the emitters are rotated by
    // -PI/2 + tilt, and the orbit axis is the resulting world-space disk normal: the orbits are
    // authored in world space so they pivot on the vortex core wherever their emitter is.
    const DISK_TILT = 0.22;
    const diskAxis = new BVector3(0, Math.cos(DISK_TILT), Math.sin(DISK_TILT));
    const layFlat = (system: ParticleSystem) => {
        system.emitter.rotation.x = -Math.PI / 2 + DISK_TILT;
    };

    // --- Layer 0: nebula bed — huge soft clouds far behind the vortex (ambient depth) ---
    const nebula = new ParticleSystem({
        scene,
        duration: 8,
        looping: true,
        prewarm: true,
        startLife: new IntervalValue(12, 18),
        startSpeed: new IntervalValue(0.05, 0.2),
        startSize: new IntervalValue(12, 22),
        startRotation: new IntervalValue(-Math.PI, Math.PI),
        startColor: new RandomColor(new Color4(0.3, 0.38, 0.95, 0.32), new Color4(0.48, 0.3, 0.95, 0.42)),
        worldSpace: true,
        emissionOverTime: new ConstantValue(1),
        shape: new SphereEmitter({radius: 22, thickness: 0.6, arc: Math.PI * 2}),
        texture: tex1,
        transparent: true,
        blendMode: Constants.ALPHA_COMBINE,
        startTileIndex: new ConstantValue(T1.softGlow),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 0,
    });
    nebula.addBehavior(new ColorOverLife(fadeEnvelope(0.25, 0.7)));
    nebula.addBehavior(new RotationOverLife(new IntervalValue(-0.05, 0.05)));
    nebula.addBehavior(new Noise(new ConstantValue(0.1), new ConstantValue(0.6)));
    batchRenderer.addSystem(nebula);
    systems.push(nebula);

    // --- Layer 1: core orb — a large plasma-orb glow (texture2) breathing at the vortex center,
    // deliberately a different sprite from the disk so the heart of the effect reads as a body ---
    const coreGlow = new ParticleSystem({
        scene,
        duration: 8,
        looping: true,
        prewarm: true,
        startLife: new IntervalValue(3.5, 5),
        startSpeed: new IntervalValue(0.02, 0.12),
        startSize: new IntervalValue(8, 12),
        startColor: new RandomColor(new Color4(0.55, 0.75, 1, 0.55), new Color4(0.7, 0.6, 1, 0.65)),
        worldSpace: true,
        emissionOverTime: new ConstantValue(1.4),
        shape: new PointEmitter(),
        texture: tex2,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(T2.orbGlow),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 1,
    });
    coreGlow.addBehavior(new ColorOverLife(fadeEnvelope(0.3, 0.6)));
    coreGlow.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.6, 0.95, 1, 1), 0]])));
    batchRenderer.addSystem(coreGlow);
    systems.push(coreGlow);

    // --- Layer 2b: core heart — a small, intense near-white center inside the orb ---
    const coreHeart = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new IntervalValue(1.4, 2.2),
        startSpeed: new ConstantValue(0.05),
        startSize: new IntervalValue(2.2, 3.4),
        startColor: new ConstantColor(new Color4(0.9, 0.95, 1, 0.9)),
        worldSpace: true,
        emissionOverTime: new ConstantValue(2.5),
        shape: new PointEmitter(),
        texture: tex1,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(T1.softGlow),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 2,
    });
    coreHeart.addBehavior(new ColorOverLife(fadeEnvelope(0.25, 0.6)));
    coreHeart.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.7, 1, 1, 0.85), 0]])));
    batchRenderer.addSystem(coreHeart);
    systems.push(coreHeart);

    // --- Layer 3: accretion disk — soft glows orbiting the core, slowly drawn inward ---
    const disk = new ParticleSystem({
        scene,
        duration: 8,
        looping: true,
        prewarm: true,
        startLife: new IntervalValue(5, 8),
        startSpeed: new IntervalValue(0, 0.1),
        startSize: new IntervalValue(0.6, 1.6),
        startColor: new RandomColor(new Color4(0.4, 0.75, 1, 0.3), new Color4(0.8, 0.5, 1, 0.4)),
        worldSpace: true,
        emissionOverTime: new ConstantValue(40),
        shape: new DonutEmitter({radius: 7, donutRadius: 3.2, thickness: 1, arc: Math.PI * 2}),
        texture: tex1,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(T1.softGlow),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 3,
    });
    disk.addBehavior(new ColorOverLife(fadeEnvelope(0.2, 0.7)));
    disk.addBehavior(new OrbitOverLife(new IntervalValue(0.25, 0.5), diskAxis, 'world'));
    disk.addBehavior(new GravityForce(new BVector3(0, 0, 0), 4));
    layFlat(disk);
    batchRenderer.addSystem(disk);
    systems.push(disk);

    // --- Layer 4: comet ribbons — a few Trail particles sweep luminous arcs around the disk ---
    const comets = new ParticleSystem({
        scene,
        duration: 8,
        looping: true,
        prewarm: true,
        startLife: new IntervalValue(4.5, 6.5),
        startSpeed: new IntervalValue(0.02, 0.1),
        startSize: new IntervalValue(0.3, 0.5),
        startColor: new RandomColor(new Color4(0.5, 0.9, 1, 0.5), new Color4(0.75, 0.55, 1, 0.6)),
        worldSpace: true,
        emissionOverTime: new ConstantValue(1.8),
        shape: new DonutEmitter({radius: 10.3, donutRadius: 0.8, thickness: 0.5, arc: Math.PI * 2}),
        texture: tex1,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(T1.round),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.Trail,
        rendererEmitterSettings: {startLength: new ConstantValue(60), followLocalOrigin: false},
        renderOrder: 4,
    });
    comets.addBehavior(new ColorOverLife(fadeEnvelope(0.2, 0.7)));
    comets.addBehavior(new OrbitOverLife(new IntervalValue(0.5, 0.95), diskAxis, 'world'));
    comets.addBehavior(new GravityForce(new BVector3(0, 0, 0), 22));
    comets.addBehavior(new WidthOverLength(new PiecewiseBezier([[new Bezier(1, 0.7, 0.35, 0.05), 0]])));
    layFlat(comets);
    batchRenderer.addSystem(comets);
    systems.push(comets);

    // --- Layer 5: stardust — fine stretched sparks drift through the whole frame, riding a
    // turbulence field and leaning toward the cursor ---
    const dust = new ParticleSystem({
        scene,
        duration: 8,
        looping: true,
        prewarm: true,
        startLife: new IntervalValue(6, 10),
        startSpeed: new IntervalValue(0.05, 0.25),
        startSize: new IntervalValue(0.08, 0.22),
        startColor: new RandomColor(new Color4(0.7, 0.85, 1, 0.5), new Color4(0.9, 0.8, 1, 0.85)),
        worldSpace: true,
        emissionOverTime: new ConstantValue(16),
        shape: new SphereEmitter({radius: 18, thickness: 1, arc: Math.PI * 2}),
        texture: tex1,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(T1.round),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.StretchedBillBoard,
        rendererEmitterSettings: {speedFactor: 1.2},
        renderOrder: 5,
    });
    dust.addBehavior(new ColorOverLife(fadeEnvelope(0.15, 0.75)));
    dust.addBehavior(
        new TurbulenceField(new BVector3(6, 6, 6), 2, new BVector3(0.55, 0.55, 0.55), new BVector3(0.15, 0.12, 0.18))
    );
    dust.addBehavior(new LimitSpeedOverLife(constantCurve(1.1), 0.12));
    // Uniform force steered toward the cursor each frame — the dust field "leans" the way you
    // point without an attractor singularity.
    const cursorForce = new ApplyForce(new BVector3(0, 0, 0), new ConstantValue(0.5));
    dust.addBehavior(cursorForce);
    batchRenderer.addSystem(dust);
    systems.push(dust);

    // --- Layer 6: cursor comets — the flagship interaction. A trail emitter rides the world-space
    // point under the cursor; moving the mouse sheds glowing ribbons that inherit the cursor's
    // velocity, then get captured by the vortex (gravity + orbit) and spiral into the core.
    // Emission is driven by cursor speed, so a resting pointer stays perfectly clean.
    const cursorEmission = new ConstantValue(0);
    const cursorComets = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new IntervalValue(2, 3.2),
        startSpeed: new IntervalValue(0.05, 0.25),
        startSize: new IntervalValue(0.16, 0.3),
        startColor: new RandomColor(new Color4(0.55, 0.9, 1, 0.65), new Color4(0.8, 0.6, 1, 0.75)),
        worldSpace: true,
        emissionOverTime: cursorEmission,
        shape: new PointEmitter(),
        texture: tex1,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(T1.round),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.Trail,
        rendererEmitterSettings: {startLength: new ConstantValue(40), followLocalOrigin: false},
        renderOrder: 6,
    });
    cursorComets.addBehavior(new ColorOverLife(fadeEnvelope(0.1, 0.55)));
    // Fling ribbons along the cursor's motion, then let the vortex capture them.
    cursorComets.addBehavior(new InheritVelocity(new ConstantValue(0.55), 'initial'));
    cursorComets.addBehavior(new GravityForce(new BVector3(0, 0, 0), 45));
    cursorComets.addBehavior(new OrbitOverLife(new IntervalValue(0.3, 0.6), diskAxis, 'world'));
    cursorComets.addBehavior(new LimitSpeedOverLife(constantCurve(7), 0.25));
    cursorComets.addBehavior(new WidthOverLength(new PiecewiseBezier([[new Bezier(1, 0.7, 0.35, 0.05), 0]])));
    batchRenderer.addSystem(cursorComets);
    systems.push(cursorComets);

    // Named so the hierarchy reads well when the vortex is opened in the editor.
    const names: [ParticleSystem, string][] = [
        [nebula, 'Nebula'],
        [coreGlow, 'Core glow'],
        [coreHeart, 'Core heart'],
        [disk, 'Accretion disk'],
        [comets, 'Comet ribbons'],
        [dust, 'Stardust'],
        [cursorComets, 'Cursor comets'],
    ];
    for (const [system, name] of names) {
        system.emitter.name = name;
    }
    for (const system of systems) {
        system.play();
    }

    return {
        cursorForce,
        cursorComets,
        cursorEmission,
        pointerX: 0,
        pointerY: 0,
        prevPointerX: 0,
        prevPointerY: 0,
        cursorEmitRate: 0,
        planeNormal: new BVector3(),
        cursorWorld: new BVector3(),
    };
}

function updateVortex({scene, camera}: DemoContext, state: VortexState, pointer: StagePointer, delta: number) {
    const ease = Math.min(delta * 3.5, 1);
    state.pointerX += (pointer.x - state.pointerX) * ease;
    state.pointerY += (pointer.y - state.pointerY) * ease;

    // Slow orbital drift around the vortex, with a little pointer parallax.
    camera.alpha += delta * 0.03;
    camera.beta += Math.sin(performance.now() * 0.00035) * delta * 0.012;
    camera.target.x = state.pointerX * 1.5;
    camera.target.y = state.pointerY * 1;

    // Steer the dust lean toward where the pointer points (kept unit-length).
    const lx = state.pointerX;
    const ly = state.pointerY * 0.65;
    const lz = -0.18;
    const len = Math.hypot(lx, ly, lz) || 1;
    state.cursorForce.direction = {x: lx / len, y: ly / len, z: lz / len};

    // Ride the pointer: project it onto the plane through the vortex centre facing the camera,
    // park the comet emitter there, and scale emission with pointer speed so ribbons only appear
    // while the pointer moves.
    const speedNdc =
        delta > 0 ? Math.hypot(state.pointerX - state.prevPointerX, state.pointerY - state.prevPointerY) / delta : 0;
    state.prevPointerX = state.pointerX;
    state.prevPointerY = state.pointerY;
    if (!pointer.seen) {
        return;
    }
    const engine = scene.getEngine();
    const px = ((state.pointerX + 1) / 2) * engine.getRenderWidth();
    const py = ((1 - state.pointerY) / 2) * engine.getRenderHeight();
    const ray = scene.createPickingRay(px, py, null, camera);
    state.planeNormal.copyFrom(camera.position).subtractInPlace(camera.target).normalize();
    const denom = BVector3.Dot(state.planeNormal, ray.direction);
    if (Math.abs(denom) > 1e-4) {
        const t = -BVector3.Dot(state.planeNormal, ray.origin) / denom;
        if (t > 0) {
            state.cursorWorld.copyFrom(ray.direction).scaleInPlace(t).addInPlace(ray.origin);
            state.cursorComets.emitter.position.copyFrom(state.cursorWorld);
        }
    }
    const targetRate = Math.min(speedNdc * 11, 15);
    const rateEase = Math.min(delta * (targetRate > state.cursorEmitRate ? 8 : 4), 1);
    state.cursorEmitRate += (targetRate - state.cursorEmitRate) * rateEase;
    state.cursorEmission.value = state.cursorEmitRate;
}
