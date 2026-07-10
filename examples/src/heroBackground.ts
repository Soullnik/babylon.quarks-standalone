import {Engine} from "@babylonjs/core/Engines/engine";
import {Scene} from "@babylonjs/core/scene";
import {ArcRotateCamera} from "@babylonjs/core/Cameras/arcRotateCamera";
import {HemisphericLight} from "@babylonjs/core/Lights/hemisphericLight";
import {Vector3 as BVector3} from "@babylonjs/core/Maths/math.vector";
import {Color4} from "@babylonjs/core/Maths/math.color";
import {Constants} from "@babylonjs/core/Engines/constants";
// Side-effect import: registers Scene.createPickingRay, used to project the cursor into the world.
import "@babylonjs/core/Culling/ray";
import {BatchedRenderer, ParticleSystem} from "babylon.quarks";
import {
    RenderMode,
    ConstantValue,
    IntervalValue,
    ConstantColor,
    SphereEmitter,
    PointEmitter,
    DonutEmitter,
    RandomColor,
    Vector4,
    Vector3 as QVector3,
    Gradient,
    ColorOverLife,
    SizeOverLife,
    RotationOverLife,
    WidthOverLength,
    OrbitOverLife,
    GravityForce,
    InheritVelocity,
    LimitSpeedOverLife,
    TurbulenceField,
    ApplyForce,
    Noise,
    PiecewiseBezier,
    Bezier,
} from "babylon.quarks";
import {SHARED_ASSETS, createSharedTexture} from "./shared/common";

/** 10×10 `texture1.png`: soft circle / glow / cloud live at 90 / 91 / 93; tile 0 is the default round particle. */
const T1 = {
    round: 0,
    softCircle: 90,
    softGlow: 91,
    softCloud: 93,
};

/** 10×10 `texture2.png`: tile 1 is a large orb glow; 53–62 is the animated electric-arc strip (see electricBall demo). */
const T2 = {
    orbGlow: 1,
    arcFrameStart: 53,
    arcFrameEnd: 62,
};

/** Hero palette — cool indigo bed, cyan→violet→magenta energy ramp, near-white core. */
const CYAN = new QVector3(0.5, 0.9, 1.0);
const VIOLET = new QVector3(0.62, 0.46, 1.0);
const MAGENTA = new QVector3(0.88, 0.45, 0.95);
const WHITE = new QVector3(1, 1, 1);

/**
 * Alpha envelope over particle life: fade in, hold, fade out. Multiplies the particle's
 * startColor, so every layer breathes instead of popping in and out of existence.
 */
function fadeEnvelope(fadeIn: number, fadeOut: number, tintA: QVector3 = WHITE, tintB: QVector3 = WHITE) {
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

function heroTextureUrl(relativePath: string) {
    const path = relativePath.replace(/^\//, "");
    const base = import.meta.env?.BASE_URL;
    if (typeof window === "undefined" || base == null || base === "" || base === "/" || base === "./") {
        return path;
    }
    const prefix = base.endsWith("/") ? base : `${base}/`;
    const rootRelative = `${prefix}${path}`.replace(/([^:]\/)\/+/g, "$1");
    try {
        return new URL(rootRelative, window.location.origin).href;
    } catch {
        return rootRelative;
    }
}

/**
 * Full-screen hero: a single art-directed subject — a slowly turning accretion vortex sitting
 * right of the headline — built from six coordinated layers (nebula bed, breathing core, orbital
 * disk with gravity inspiral, comet trail ribbons, and stretched stardust). Doubles as a live
 * showcase of babylon.quarks: Trail + WidthOverLength, StretchedBillBoard, OrbitOverLife,
 * GravityForce, TurbulenceField + LimitSpeedOverLife, gradient Color/SizeOverLife, and the
 * BatchedRenderer. Reacts to the cursor (parallax + dust lean) and page scroll.
 */
export function mountIndexHeroBackground() {
    if (typeof window === "undefined") {
        return () => {};
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        return () => {};
    }

    const canvas = document.getElementById("hero-bg");
    if (!(canvas instanceof HTMLCanvasElement)) {
        return () => {};
    }

    const engine = new Engine(canvas, true);
    engine.resize();

    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    scene.clearColor = new Color4(0.04, 0.045, 0.09, 1);
    scene.autoClear = true;

    const camera = new ArcRotateCamera("heroCam", -Math.PI / 2, Math.PI / 3, 26, BVector3.Zero(), scene);
    camera.minZ = 0.1;
    camera.setPosition(new BVector3(0, 9.5, 26));

    new HemisphericLight("heroLight", new BVector3(0.35, 1, -0.2), scene);

    const batchRenderer = new BatchedRenderer("heroVfx", scene);
    const systems: ParticleSystem[] = [];

    const atlasPath = heroTextureUrl(SHARED_ASSETS.atlas);
    const tex1 = createSharedTexture(scene, atlasPath);
    const tex2 = createSharedTexture(scene, heroTextureUrl(SHARED_ASSETS.atlasSecondary));

    // The disk lies almost flat (XZ) but tips slightly toward the camera so more of the swirl is
    // visible. The donut emitter generates its ring in XY, so the emitters are rotated by
    // -PI/2 + tilt, and the orbit axis is the resulting world-space disk normal.
    const DISK_TILT = 0.22;
    const diskAxis = new QVector3(0, Math.cos(DISK_TILT), Math.sin(DISK_TILT));
    const layFlat = (system: ParticleSystem) => {
        system.emitter.rotation.x = -Math.PI / 2 + DISK_TILT;
    };

    // --- Layer 0: nebula bed — huge soft clouds far behind the vortex (ambient depth) ---
    const nebula = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new IntervalValue(12, 18),
        startSpeed: new IntervalValue(0.05, 0.2),
        startSize: new IntervalValue(12, 22),
        startRotation: new IntervalValue(-Math.PI, Math.PI),
        startColor: new RandomColor(new Vector4(0.3, 0.38, 0.95, 0.32), new Vector4(0.48, 0.3, 0.95, 0.42)),
        worldSpace: true,
        emissionOverTime: new ConstantValue(1),
        shape: new SphereEmitter({radius: 22, thickness: 0.6, arc: Math.PI * 2}),
        texture: tex1,
        transparent: true,
        blendMode: Constants.ALPHA_COMBINE,
        startTileIndex: new ConstantValue(T1.softCloud),
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
        duration: 1,
        looping: true,
        startLife: new IntervalValue(3.5, 5),
        startSpeed: new IntervalValue(0.02, 0.12),
        startSize: new IntervalValue(8, 12),
        startColor: new RandomColor(new Vector4(0.55, 0.75, 1, 0.55), new Vector4(0.7, 0.6, 1, 0.65)),
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
        startColor: new ConstantColor(new Vector4(0.9, 0.95, 1, 0.9)),
        worldSpace: true,
        emissionOverTime: new ConstantValue(2.5),
        shape: new PointEmitter(),
        texture: tex1,
        transparent: true,
        blendMode: Constants.ALPHA_ADD,
        startTileIndex: new ConstantValue(T1.softCircle),
        uTileCount: 10,
        vTileCount: 10,
        renderMode: RenderMode.BillBoard,
        renderOrder: 2,
    });
    coreHeart.addBehavior(new ColorOverLife(fadeEnvelope(0.25, 0.6)));
    coreHeart.addBehavior(new SizeOverLife(new PiecewiseBezier([[new Bezier(0.7, 1, 1, 0.85), 0]])));
    batchRenderer.addSystem(coreHeart);
    systems.push(coreHeart);

    // --- Layer 4: comet ribbons — a few Trail particles sweep luminous arcs around the disk ---
    const comets = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new IntervalValue(4.5, 6.5),
        startSpeed: new IntervalValue(0.02, 0.1),
        startSize: new IntervalValue(0.3, 0.5),
        startColor: new RandomColor(new Vector4(0.5, 0.9, 1, 0.5), new Vector4(0.75, 0.55, 1, 0.6)),
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
    comets.addBehavior(new OrbitOverLife(new IntervalValue(0.5, 0.95), diskAxis));
    comets.addBehavior(new GravityForce(new QVector3(0, 0, 0), 22));
    comets.addBehavior(new WidthOverLength(new PiecewiseBezier([[new Bezier(1, 0.7, 0.35, 0.05), 0]])));
    layFlat(comets);
    batchRenderer.addSystem(comets);
    systems.push(comets);

    // --- Layer 5: stardust — fine stretched sparks drift through the whole frame, riding a
    // turbulence field and leaning toward the cursor ---
    const dust = new ParticleSystem({
        scene,
        duration: 1,
        looping: true,
        startLife: new IntervalValue(6, 10),
        startSpeed: new IntervalValue(0.05, 0.25),
        startSize: new IntervalValue(0.08, 0.22),
        startColor: new RandomColor(new Vector4(0.7, 0.85, 1, 0.5), new Vector4(0.9, 0.8, 1, 0.85)),
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
        speedFactor: 1.2,
        renderOrder: 5,
    });
    dust.addBehavior(new ColorOverLife(fadeEnvelope(0.15, 0.75)));
    dust.addBehavior(
        new TurbulenceField(new QVector3(6, 6, 6), 2, new QVector3(0.55, 0.55, 0.55), new QVector3(0.15, 0.12, 0.18))
    );
    dust.addBehavior(new LimitSpeedOverLife(constantCurve(1.1), 0.12));
    // Uniform force steered toward the cursor each frame — the dust field "leans" the way you
    // point without an attractor singularity.
    const cursorForce = new ApplyForce(new QVector3(0, 0, 0), new ConstantValue(0.5));
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
        startColor: new RandomColor(new Vector4(0.55, 0.9, 1, 0.65), new Vector4(0.8, 0.6, 1, 0.75)),
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
    cursorComets.addBehavior(new InheritVelocity(new ConstantValue(0.55), "initial"));
    cursorComets.addBehavior(new GravityForce(new QVector3(0, 0, 0), 45));
    cursorComets.addBehavior(new OrbitOverLife(new IntervalValue(0.3, 0.6), diskAxis));
    cursorComets.addBehavior(new LimitSpeedOverLife(constantCurve(7), 0.25));
    cursorComets.addBehavior(new WidthOverLength(new PiecewiseBezier([[new Bezier(1, 0.7, 0.35, 0.05), 0]])));
    batchRenderer.addSystem(cursorComets);
    systems.push(cursorComets);

    scene.whenReadyAsync().then(() => {
        for (const system of systems) {
            system.play();
        }
    });

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    engine.setHardwareScalingLevel(1 / dpr);
    engine.resize();

    // --- pointer + scroll state (smoothed) ---
    let pointerX = 0;
    let pointerY = 0;
    let targetX = 0;
    let targetY = 0;
    let scrollN = 0;
    let targetScroll = 0;
    // On wide screens the camera target shifts left so the vortex sits right of the headline;
    // on narrow screens it stays centered behind the stacked hero copy.
    let baseTargetX = 0;
    const updateComposition = () => {
        baseTargetX = window.innerWidth >= 900 ? -4 : 0;
    };
    updateComposition();

    const onPointerMove = (e: PointerEvent) => {
        targetX = (e.clientX / Math.max(window.innerWidth, 1)) * 2 - 1;
        targetY = -((e.clientY / Math.max(window.innerHeight, 1)) * 2 - 1);
    };
    const onScroll = () => {
        targetScroll = Math.min((window.scrollY || 0) / Math.max(window.innerHeight, 1), 1.6);
    };
    window.addEventListener("pointermove", onPointerMove, {passive: true});
    window.addEventListener("scroll", onScroll, {passive: true});

    const onResize = () => {
        updateComposition();
        engine.resize();
    };
    window.addEventListener("resize", onResize);

    // Cursor-comet steering state: previous smoothed pointer (for speed) and reusable vectors.
    let prevPointerX = 0;
    let prevPointerY = 0;
    let cursorEmitRate = 0;
    let pointerSeen = false;
    const planeNormal = new BVector3();
    const cursorWorld = new BVector3();
    const onFirstPointer = () => {
        pointerSeen = true;
    };
    window.addEventListener("pointermove", onFirstPointer, {passive: true, once: true});

    engine.runRenderLoop(() => {
        const delta = Math.min(engine.getDeltaTime() / 1000, 0.05);
        const ease = Math.min(delta * 3.5, 1);
        pointerX += (targetX - pointerX) * ease;
        pointerY += (targetY - pointerY) * ease;
        scrollN += (targetScroll - scrollN) * Math.min(delta * 3, 1);

        // Slow orbital drift around the vortex + cursor/scroll parallax.
        camera.alpha += delta * 0.03;
        camera.beta += Math.sin(performance.now() * 0.00035) * delta * 0.012;
        camera.target.x = baseTargetX + pointerX * 2.0;
        camera.target.y = pointerY * 1.2 - scrollN * 3.5;
        camera.radius = 26 + scrollN * 4;

        // Steer the dust lean toward where the cursor points (kept unit-length).
        const lx = pointerX;
        const ly = pointerY * 0.65;
        const lz = -0.18;
        const len = Math.hypot(lx, ly, lz) || 1;
        cursorForce.direction.set(lx / len, ly / len, lz / len);

        // Ride the cursor: project the smoothed pointer onto the plane through the vortex center
        // facing the camera, park the comet emitter there, and scale emission with cursor speed
        // so ribbons only appear while the mouse is moving.
        const speedNdc = delta > 0 ? Math.hypot(pointerX - prevPointerX, pointerY - prevPointerY) / delta : 0;
        prevPointerX = pointerX;
        prevPointerY = pointerY;
        if (pointerSeen) {
            const px = ((pointerX + 1) / 2) * engine.getRenderWidth();
            const py = ((1 - pointerY) / 2) * engine.getRenderHeight();
            const ray = scene.createPickingRay(px, py, null, camera);
            planeNormal.copyFrom(camera.position).subtractInPlace(camera.target).normalize();
            const denom = BVector3.Dot(planeNormal, ray.direction);
            if (Math.abs(denom) > 1e-4) {
                const t = -BVector3.Dot(planeNormal, ray.origin) / denom;
                if (t > 0) {
                    cursorWorld.copyFrom(ray.direction).scaleInPlace(t).addInPlace(ray.origin);
                    cursorComets.emitter.position.copyFrom(cursorWorld);
                }
            }
            const targetRate = Math.min(speedNdc * 11, 15);
            const rateEase = Math.min(delta * (targetRate > cursorEmitRate ? 8 : 4), 1);
            cursorEmitRate += (targetRate - cursorEmitRate) * rateEase;
            cursorEmission.value = cursorEmitRate;
        }

        batchRenderer.update(delta);
        scene.render();
    });

    return () => {
        window.removeEventListener("resize", onResize);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointermove", onFirstPointer);
        window.removeEventListener("scroll", onScroll);
        engine.stopRenderLoop();
        for (const system of systems) {
            system.dispose();
        }
        batchRenderer.dispose();
        scene.dispose();
        engine.dispose();
    };
}
